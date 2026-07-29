'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const q = require('./query');
const { mask } = require('./lex');

// Mechanical pre-verification.
//
// Six of the eight Tier-6 verifiers were each re-deriving the same set of
// mechanical facts from the diff — which files changed, which exports are new,
// which precedent citations resolve, which duplicates appeared, which secrets
// patterns are present, which new rule findings the diff introduced. That is a
// program's job, and doing it here has two effects: it removes the derivation
// cost, and it makes the result *stronger*, because a deterministic scan cannot
// forget a file or mis-read a line number.
//
// The agents still adjudicate. This computes WHAT changed and WHAT fired; it
// never decides whether a finding is acceptable — that judgement stays with the
// verifier, and every finding here routes to a named one.

const SECRET_PATTERNS = [
  ['SEC-PRIVATE-KEY', /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/, 'critical'],
  ['SEC-AWS-KEY', /\bAKIA[0-9A-Z]{16}\b/, 'critical'],
  ['SEC-GH-TOKEN', /\bgh[pousr]_[A-Za-z0-9]{16,}\b/, 'critical'],
  ['SEC-SLACK-TOKEN', /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/, 'critical'],
  ['SEC-JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, 'high'],
  ['SEC-BEARER-LITERAL', /['"]Bearer\s+[A-Za-z0-9._-]{20,}['"]/, 'high'],
  ['SEC-CONNECTION-STRING', /\b(?:postgres|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s'"]*:[^\s'"@]+@/, 'critical'],
  ['SEC-GENERIC-ASSIGN', /\b(?:secret|password|passwd|api[_-]?key|apikey|client[_-]?secret|private[_-]?key|access[_-]?token)\s*[:=]\s*['"][^'"\s]{12,}['"]/i, 'high'],
];

const PUBLIC_PREFIX = /\b(NEXT_PUBLIC_|VITE_|REACT_APP_|PUBLIC_|EXPO_PUBLIC_|GATSBY_)([A-Z0-9_]+)/g;
const SECRET_WORD = /(secret|token|password|passwd|private[_-]?key|api[_-]?key|apikey|credential|client[_-]?secret)/i;
// Keys that are designed to be public. Flagging these would train the reader to
// ignore the scanner, which is worse than not scanning.
const PUBLISHABLE = /(publishable|anon|public[_-]?key|measurement[_-]?id|sentry[_-]?dsn|posthog|ga[_-]?id|analytics[_-]?id|map[_-]?id)/i;

function git(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  } catch (err) {
    const e = new Error(`git ${args.join(' ')} failed: ${(err.stderr || err.message || '').toString().trim()}`);
    e.code = 'GIT_FAILED';
    throw e;
  }
}

function changedFiles(root, base) {
  const out = base
    ? git(['diff', '--name-status', `${base}...HEAD`], root)
    : git(['status', '--porcelain'], root);
  const rows = [];
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    if (base) {
      const m = /^([AMDRT])\d*\s+(.+?)(?:\s+(.+))?$/.exec(line.trim());
      if (m) rows.push({ status: m[1], path: (m[3] || m[2]).replace(/\\/g, '/') });
    } else {
      const status = line.slice(0, 2).trim();
      const p = line.slice(3).trim().replace(/^"|"$/g, '').replace(/\\/g, '/');
      rows.push({ status: status.includes('D') ? 'D' : status.includes('?') ? 'A' : status[0] || 'M', path: p });
    }
  }
  return rows;
}

function diffText(root, base) {
  return base ? git(['diff', '-U0', `${base}...HEAD`], root) : git(['diff', '-U0', 'HEAD'], root);
}

// Added lines only — a secret that was already committed is a standing
// disclosure, not this diff's fault, and conflating the two makes every run
// look dirty until someone cleans history.
//
// Untracked files are included explicitly. `git diff` cannot see them, so
// without this a brand-new file containing a hardcoded credential would scan as
// zero added lines and pass — the single worst way for this gate to be wrong.
function addedLines(root, base) {
  const text = diffText(root, base);
  const out = [];
  let file = null;
  let line = 0;
  for (const raw of text.split('\n')) {
    if (raw.startsWith('+++ b/')) { file = raw.slice(6).trim(); continue; }
    if (raw.startsWith('@@')) {
      const m = /\+(\d+)/.exec(raw);
      line = m ? parseInt(m[1], 10) : 0;
      continue;
    }
    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      out.push({ file, line, text: raw.slice(1) });
      line++;
    }
  }

  if (!base) {
    let untracked = [];
    try {
      untracked = git(['ls-files', '--others', '--exclude-standard'], root)
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    } catch {
      untracked = [];
    }
    for (const rel of untracked) {
      const abs = path.join(root, rel);
      let stat;
      try {
        stat = fs.statSync(abs);
      } catch {
        continue;
      }
      // Every byte of a new file is "added". Bound the read so a stray binary
      // or a huge fixture cannot blow up the gate, and disclose the skip.
      if (!stat.isFile() || stat.size > 2 * 1024 * 1024) {
        out.push({ file: rel, line: 0, text: '', skipped: `untracked file not scanned (${stat.isFile() ? stat.size + ' bytes, over the 2MB cap' : 'not a regular file'})` });
        continue;
      }
      let body;
      try {
        body = fs.readFileSync(abs, 'utf8');
      } catch (err) {
        out.push({ file: rel, line: 0, text: '', skipped: `untracked file unreadable: ${err.message}` });
        continue;
      }
      body.split('\n').forEach((l, i) => out.push({ file: rel.replace(/\\/g, '/'), line: i + 1, text: l, untracked: true }));
    }
  }

  return out;
}

const PIPELINE_PATHS = /^(\.claude|\.codex|\.cursor|\.lazysitter)\//;

function scanSecrets(added) {
  const findings = [];
  for (const row of added) {
    if (!row.file || PIPELINE_PATHS.test(row.file)) continue;
    for (const [id, re, severity] of SECRET_PATTERNS) {
      if (re.test(row.text)) {
        findings.push({ id, severity, file: row.file, line: row.line, evidence: 'pattern matched on an added line (value withheld)' });
      }
    }
    PUBLIC_PREFIX.lastIndex = 0;
    let m;
    while ((m = PUBLIC_PREFIX.exec(row.text))) {
      const full = `${m[1]}${m[2]}`;
      if (!SECRET_WORD.test(m[2])) continue;
      const designedPublic = PUBLISHABLE.test(full);
      findings.push({
        id: 'SEC-PUBLIC-ENV-SECRET',
        severity: designedPublic ? 'medium' : 'critical',
        file: row.file,
        line: row.line,
        evidence: `${full} is inlined into the client bundle at build time`,
        note: designedPublic
          ? 'name also matches a designed-to-be-public key — a human must confirm which it is'
          : 'secret-shaped name behind a public prefix: this is a shipped secret, not a risk of one',
      });
    }
  }
  return findings;
}

function isSourceFile(p) {
  return /\.(tsx|jsx|ts|js|mjs|cjs|mts|cts)$/.test(p) && !/\.d\.ts$/.test(p);
}

function readIndexSignals(root) {
  try {
    return q.load(root).signals;
  } catch {
    return null;
  }
}

// Precedent citations are checked by opening the cited line, exactly as the
// code-reviewer would — but mechanically, so a fabricated citation is caught
// every time rather than when someone remembers to look.
function verifyCitations(root, citations) {
  const results = [];
  for (const c of citations || []) {
    const m = /^(.+?):(\d+)$/.exec(String(c.location || ''));
    if (!m) {
      results.push({ ...c, verdict: 'MALFORMED', reason: 'citation is not in path:line form' });
      continue;
    }
    const abs = path.join(root, m[1]);
    if (!fs.existsSync(abs)) {
      results.push({ ...c, verdict: 'MISSING-FILE', reason: `${m[1]} does not exist` });
      continue;
    }
    let lines;
    try {
      lines = fs.readFileSync(abs, 'utf8').split('\n');
    } catch (err) {
      results.push({ ...c, verdict: 'UNREADABLE', reason: err.message });
      continue;
    }
    const idx = parseInt(m[2], 10) - 1;
    if (idx < 0 || idx >= lines.length) {
      results.push({ ...c, verdict: 'OUT-OF-RANGE', reason: `file has ${lines.length} lines` });
      continue;
    }
    const window = lines.slice(Math.max(0, idx - 2), idx + 3).join('\n');
    const symbolOk = !c.symbol || new RegExp(`\\b${String(c.symbol).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(window);
    results.push({
      ...c,
      verdict: symbolOk ? 'RESOLVES' : 'SYMBOL-NOT-AT-LINE',
      reason: symbolOk ? null : `\`${c.symbol}\` is not within 2 lines of ${c.location}`,
      line: lines[idx].trim().slice(0, 120),
    });
  }
  return results;
}

function ownershipCheck(changed, ownershipMap) {
  if (!ownershipMap) return { checked: false, violations: [], unowned: [], doubleOwned: [] };
  const owners = new Map();
  for (const [owner, files] of Object.entries(ownershipMap)) {
    for (const f of files) {
      const norm = String(f).replace(/\\/g, '/');
      if (!owners.has(norm)) owners.set(norm, []);
      owners.get(norm).push(owner);
    }
  }
  const unowned = [];
  const doubleOwned = [];
  for (const row of changed) {
    if (PIPELINE_PATHS.test(row.path)) continue;
    const o = owners.get(row.path);
    if (!o) unowned.push(row.path);
    else if (o.length > 1) doubleOwned.push({ path: row.path, owners: o });
  }
  return { checked: true, unowned, doubleOwned, violations: unowned.length + doubleOwned.length };
}

const SCRATCH = /(^|\/)(scratch|tmp|temp|debug|untitled)[^/]*$|\.(log|tmp|bak|orig|rej)$|(^|\/)test_[^/]*$/i;

function footprint(changed, plannedFiles) {
  const planned = new Set((plannedFiles || []).map((f) => String(f).replace(/\\/g, '/')));
  const added = changed.filter((r) => r.status === 'A' && !PIPELINE_PATHS.test(r.path));
  return {
    added: added.map((r) => r.path),
    unplanned: planned.size ? added.filter((r) => !planned.has(r.path)).map((r) => r.path) : [],
    plannedListProvided: planned.size > 0,
    scratchSuspects: added.filter((r) => SCRATCH.test(r.path)).map((r) => r.path),
  };
}

function commentDensityOf(text) {
  const { comments } = mask(text);
  const total = text.split('\n').filter((l) => l.trim()).length;
  const lines = new Set();
  let at = 0;
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  const lineAt = (off) => {
    while (at + 1 < starts.length && starts[at + 1] <= off) at++;
    while (at > 0 && starts[at] > off) at--;
    return at + 1;
  };
  for (const c of comments) {
    const from = lineAt(c.start);
    const to = lineAt(Math.max(c.start, c.end - 1));
    for (let l = from; l <= to; l++) lines.add(l);
  }
  return { commentLines: lines.size, nonBlankLines: total, density: total ? +(lines.size / total).toFixed(4) : 0 };
}

const FORBIDDEN_REFS = /\bAC-\d+\b|\bD-\d+\b|\bPLAN\.md\b|\bACCEPTANCE-CRITERIA\b|\bTRACEABILITY\b/;

function forbiddenReferences(root, changed) {
  const hits = [];
  for (const row of changed) {
    if (row.status === 'D' || !isSourceFile(row.path) || PIPELINE_PATHS.test(row.path)) continue;
    const abs = path.join(root, row.path);
    if (!fs.existsSync(abs)) continue;
    let text;
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const lines = text.split('\n');
    lines.forEach((l, i) => {
      if (FORBIDDEN_REFS.test(l)) hits.push({ file: row.path, line: i + 1, text: l.trim().slice(0, 120) });
    });
  }
  return hits;
}

function verdictBlock(o) {
  return [
    '```lsi-verdict',
    `verdict: ${o.verdict}`,
    `blocking: ${o.blocking}`,
    `degraded: ${o.degraded}`,
    `verified_by: ${o.verified_by}`,
    'independent: true',
    `oracle: ${o.oracle}`,
    `blocking_class: ${o.blocking_class || 'MINE'}`,
    `evidence: ${o.evidence}`,
    'claims:',
    ...(o.claims || []).map((c) => `  - "${c}"`),
    'concerns:',
    ...(o.concerns || []).map((c) => `  - "${c}"`),
    '```',
  ].join('\n');
}

function runGate(root, opts = {}) {
  const base = opts.base || null;
  const report = { base, generatedAt: opts.now || new Date().toISOString(), degraded: [] };

  let changed;
  try {
    changed = changedFiles(root, base);
  } catch (err) {
    return {
      error: err.message,
      degraded: true,
      report,
      verdicts: [
        verdictBlock({
          verdict: 'BLOCK',
          blocking: true,
          degraded: true,
          verified_by: 'fe-index-gate',
          oracle: 'build',
          blocking_class: 'ENVIRONMENT',
          evidence: err.message,
          claims: ['[observed][observable] the diff could not be read :: git failed'],
          concerns: ['[OPEN] no mechanical verification ran :: git unavailable'],
        }),
      ],
    };
  }

  report.changed = changed;
  report.sourceChanged = changed.filter((r) => isSourceFile(r.path) && !PIPELINE_PATHS.test(r.path));

  let added = [];
  try {
    added = addedLines(root, base);
  } catch (err) {
    report.degraded.push(`could not read the diff body: ${err.message}`);
  }

  report.secrets = scanSecrets(added);
  report.unscannedAdditions = added.filter((a) => a.skipped).map((a) => ({ file: a.file, reason: a.skipped }));
  for (const u of report.unscannedAdditions) report.degraded.push(`${u.file}: ${u.reason}`);
  report.forbiddenReferences = forbiddenReferences(root, report.sourceChanged);
  report.footprint = footprint(changed, opts.plannedFiles);
  report.ownership = ownershipCheck(changed, opts.ownershipMap);
  report.citations = verifyCitations(root, opts.citations);

  report.commentDensity = report.sourceChanged
    .filter((r) => r.status !== 'D')
    .map((r) => {
      const abs = path.join(root, r.path);
      if (!fs.existsSync(abs)) return null;
      try {
        return Object.assign({ file: r.path }, commentDensityOf(fs.readFileSync(abs, 'utf8')));
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  // New rule findings introduced by this diff, from the freshly-built index.
  const signals = readIndexSignals(root);
  if (!signals) {
    report.degraded.push('no index present — rule findings, duplicate clusters and orphan checks did not run. Build the index before the gate.');
    report.newSignals = null;
  } else {
    const changedSet = new Set(report.sourceChanged.map((r) => r.path));
    const baselineIds = new Set((opts.baselineSignals || []).map((s) => `${s.id}@${s.file}:${s.line}`));
    report.newSignals = signals
      .filter((s) => changedSet.has(s.file))
      .filter((s) => !baselineIds.has(`${s.id}@${s.file}:${s.line}`));
    try {
      const idx = q.load(root);
      report.duplicateClusters = q
        .duplicates(idx, { limit: 100 })
        .filter((c) => c.members.some((m) => changedSet.has(m.file)));
      report.newOrphans = idx.graph.orphans.filter((o) => changedSet.has(o.file));
      report.deadProps = q.unusedProps(idx, { minUsage: 1, limit: 100 }).filter((r) => changedSet.has(r.location.split(':')[0]));
      report.indexDigest = idx.meta.generatedAt;
      report.indexCoverage = idx.meta.coverage;
    } catch (err) {
      report.degraded.push(`index queries failed: ${err.message}`);
    }
  }

  // --------------------------------------------------------------- verdicts
  const verdicts = [];
  const crit = (report.secrets || []).filter((s) => s.severity === 'critical');
  verdicts.push(
    verdictBlock({
      verdict: crit.length ? 'BLOCK' : 'PASS',
      blocking: crit.length > 0,
      degraded: report.degraded.length > 0,
      verified_by: 'fe-index-gate(secrets)',
      oracle: 'index',
      evidence: `${added.filter((a) => !a.skipped).length} added lines scanned (${added.filter((a) => a.untracked).length} from untracked new files) across ${report.sourceChanged.length} changed source files`,
      claims: [
        `[observed][observable] ${added.filter((a) => !a.skipped).length} added lines scanned against ${SECRET_PATTERNS.length} credential patterns plus public-prefix rules :: mechanical`,
        report.unscannedAdditions.length
          ? `[observed][observable] ${report.unscannedAdditions.length} added file(s) could NOT be scanned :: see degraded list`
          : '[observed][observable] every added line was scanned :: no skips',
      ],
      concerns: (report.secrets || []).map(
        (s) => `[${s.severity === 'critical' ? 'OPEN' : 'OPEN'}] ${s.id} at ${s.file}:${s.line} :: ${s.note || s.evidence}`
      ),
    })
  );

  const ownershipBad = report.ownership.checked && report.ownership.violations > 0;
  verdicts.push(
    verdictBlock({
      verdict: ownershipBad || report.footprint.unplanned.length || report.footprint.scratchSuspects.length ? 'BLOCK' : 'PASS',
      blocking: !!(ownershipBad || report.footprint.unplanned.length || report.footprint.scratchSuspects.length),
      degraded: !report.ownership.checked || !report.footprint.plannedListProvided,
      verified_by: 'fe-index-gate(footprint)',
      oracle: 'plan',
      evidence: `${changed.length} changed paths`,
      claims: [
        report.ownership.checked
          ? `[observed][observable] every changed path checked against the plan's ownership map :: ${report.ownership.violations} violation(s)`
          : '[observed][internal] no ownership map supplied — ownership was NOT checked :: degraded',
      ],
      concerns: [
        ...report.ownership.unowned.map((p) => `[OPEN] changed file has no owner in the plan :: ${p}`),
        ...report.ownership.doubleOwned.map((d) => `[OPEN] changed file has two owners :: ${d.path} (${d.owners.join(', ')})`),
        ...report.footprint.unplanned.map((p) => `[OPEN] added file not in the plan's justified list :: ${p}`),
        ...report.footprint.scratchSuspects.map((p) => `[OPEN] added path looks like a scratch artifact :: ${p}`),
        ...report.forbiddenReferences.map((f) => `[OPEN] pipeline reference leaked into shipped source :: ${f.file}:${f.line}`),
      ],
    })
  );

  const badCitations = report.citations.filter((c) => c.verdict !== 'RESOLVES');
  if (report.citations.length) {
    verdicts.push(
      verdictBlock({
        verdict: badCitations.length ? 'BLOCK' : 'PASS',
        blocking: badCitations.length > 0,
        degraded: false,
        verified_by: 'fe-index-gate(precedent)',
        oracle: 'codebase-precedent',
        evidence: `${report.citations.length} citation(s) opened at their stated path:line`,
        claims: [`[observed][observable] every precedent citation was opened and its symbol checked :: ${badCitations.length} failed`],
        concerns: badCitations.map((c) => `[OPEN] ${c.verdict} :: ${c.location} — ${c.reason}`),
      })
    );
  }

  if (report.newSignals) {
    const blockingSignals = report.newSignals.filter((s) => s.severity === 'critical' || s.severity === 'high');
    verdicts.push(
      verdictBlock({
        verdict: blockingSignals.length ? 'BLOCK' : 'PASS',
        blocking: blockingSignals.length > 0,
        degraded: false,
        verified_by: 'fe-index-gate(rules)',
        oracle: 'index',
        evidence: `index ${report.indexDigest}`,
        claims: [`[observed][observable] ${report.newSignals.length} rule finding(s) present in changed files :: ${blockingSignals.length} at critical/high`],
        concerns: blockingSignals.map(
          (s) => `[OPEN] ${s.id} :: ${s.file}:${s.line}${s.heuristic ? ' [heuristic — a verifier must confirm by reading]' : ''}`
        ),
      })
    );
  }

  report.verdicts = verdicts;
  return { report, verdicts, degraded: report.degraded.length > 0 };
}

module.exports = { runGate, scanSecrets, verifyCitations, ownershipCheck, footprint, commentDensityOf, changedFiles, addedLines };
