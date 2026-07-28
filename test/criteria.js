'use strict';

// Blind acceptance-criteria suite for the A1-A17 criticism-hardening run.
// Derived ONLY from ACCEPTANCE-CRITERIA.md + PLAN.md's C1-C8 contracts +
// CONTEXT-PACK.md's verified test-tooling mechanics. Never read implementation.
// Standalone, zero-dependency, same shape as test/smoke.js.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const PKG = path.join(__dirname, '..');
const BIN = path.join(PKG, 'bin', 'lazysitter.js');
let failures = 0;

function ok(cond, msg) {
  if (cond) console.log(`  ok   ${msg}`);
  else {
    console.log(`  FAIL ${msg}`);
    failures++;
  }
}
function run(args, cwd) {
  return execFileSync(process.execPath, [BIN, ...args], {
    cwd,
    env: { ...process.env, NO_COLOR: '1', LAZYSITTER_NO_UPDATE_CHECK: '1' },
    encoding: 'utf8',
  });
}
function tryRun(args, cwd) {
  try {
    const out = run(args, cwd);
    return { code: 0, out };
  } catch (e) {
    return { code: typeof e.status === 'number' ? e.status : 1, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}
const has = (root, rel) => fs.existsSync(path.join(root, rel));
function readOrNull(root, rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

const KNOWLEDGE_FILES = ['CAPABILITIES.md', 'CONVENTIONS.md', 'PROJECT-PITFALLS.md', 'ONE-WAY-DOORS.md', 'SECRETS-BASELINE.md'];

function tripletRead(root, name) {
  return {
    claude: readOrNull(root, `.claude/agents/${name}.md`),
    codex: readOrNull(root, `.codex/skills/lazysitter/agents/${name}.md`),
    cursor: readOrNull(root, `.cursor/agents/${name}.md`),
  };
}
function tripletMust(root, name, checks, acLabel) {
  const bodies = tripletRead(root, name);
  for (const adapter of ['claude', 'codex', 'cursor']) {
    const text = bodies[adapter];
    if (text === null) {
      ok(false, `${acLabel} [${adapter}] ${name} — body missing`);
      continue;
    }
    for (const [desc, re] of checks) {
      ok(re.test(text), `${acLabel} [${adapter}] ${name} — ${desc}`);
    }
  }
  return bodies;
}
function fileMust(text, checks, acLabel) {
  if (text === null) {
    ok(false, `${acLabel} — file missing`);
    return;
  }
  for (const [desc, re] of checks) {
    ok(re.test(text), `${acLabel} — ${desc}`);
  }
}
function orderCheck(text, reBefore, reAfter, label) {
  if (text === null) {
    ok(false, `${label} — file missing`);
    return;
  }
  const m1 = reBefore.exec(text);
  const m2 = reAfter.exec(text);
  ok(!!m1 && !!m2 && m1.index < m2.index, `${label} (before-idx=${m1 ? m1.index : 'NA'}, after-idx=${m2 ? m2.index : 'NA'})`);
}
function orchestratorTexts() {
  return {
    claude: readOrNull(PKG, 'core/orchestrator.claude.md'),
    codex: readOrNull(PKG, 'core/orchestrator.codex.md'),
    cursorRule: readOrNull(PKG, 'core/cursor/LazySitter.rule.mdc'),
  };
}
function orchBothMust(checks, acLabel) {
  const o = orchestratorTexts();
  for (const key of ['claude', 'codex']) {
    const text = o[key];
    if (text === null) {
      ok(false, `${acLabel} [orchestrator.${key}] — file missing`);
      continue;
    }
    for (const [desc, re] of checks) {
      ok(re.test(text), `${acLabel} [orchestrator.${key}] — ${desc}`);
    }
  }
  return o;
}
function commandTexts(root) {
  return {
    claude: readOrNull(root, '.claude/commands/lsi.md'),
    codex: readOrNull(root, '.codex/skills/lazysitter/SKILL.md'),
    cursorRule: readOrNull(root, '.cursor/rules/lazysitter.mdc'),
    cursorCmd: readOrNull(root, '.cursor/commands/lsi.md'),
  };
}
function neverSkipScope(text) {
  if (!text) return null;
  const m = /never[- ]?skip/i.exec(text);
  if (!m) return null;
  const rest = text.slice(m.index);
  const nextHeading = rest.slice(1).search(/\n#{1,6}\s/);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading + 1);
}
function rosterJsonSafe() {
  const text = readOrNull(PKG, 'core/roster.json');
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}
function findPeerWithTier(rosterObj, tier, exclude) {
  if (!rosterObj || !rosterObj.agents) return null;
  return (
    Object.keys(rosterObj.agents).find((n) => rosterObj.agents[n] && rosterObj.agents[n].tier === tier && !exclude.includes(n)) ||
    null
  );
}
function tierParity(root, agentName, expectedTier, acLabel) {
  const peer = findPeerWithTier(roster, expectedTier, ['lazysitter-explorer', 'lazysitter-triage', 'lazysitter-recon', agentName]);
  if (!peer) {
    ok(false, `${acLabel} — no stable ${expectedTier}-tier peer found in core/roster.json to compare ${agentName} against`);
    return;
  }
  const claudeAgent = readOrNull(root, `.claude/agents/${agentName}.md`);
  const claudePeer = readOrNull(root, `.claude/agents/${peer}.md`);
  if (claudeAgent && claudePeer) {
    const m1 = /^model:\s*(\S+)/m.exec(claudeAgent);
    const m2 = /^model:\s*(\S+)/m.exec(claudePeer);
    ok(
      !!m1 && !!m2 && m1[1] === m2[1],
      `${acLabel} [claude] ${agentName} model matches ${expectedTier}-tier peer ${peer} (${m1 ? m1[1] : 'MISSING'} vs ${m2 ? m2[1] : 'MISSING'})`
    );
  } else {
    ok(false, `${acLabel} [claude] — missing ${agentName} or peer ${peer} agent file`);
  }

  const cursorModelsText = readOrNull(root, '.cursor/lazysitter/models.json');
  const cursorAgent = readOrNull(root, `.cursor/agents/${agentName}.md`);
  if (cursorModelsText && cursorAgent) {
    let parsed = null;
    try {
      parsed = JSON.parse(cursorModelsText);
    } catch (e) {}
    const cm = /^model:\s*(\S+)/m.exec(cursorAgent);
    ok(
      !!parsed && !!cm && cm[1] === parsed[expectedTier],
      `${acLabel} [cursor] ${agentName} resolved model equals models.json.${expectedTier} (${cm ? cm[1] : 'MISSING'} vs ${parsed ? parsed[expectedTier] : 'MISSING'})`
    );
  } else {
    ok(false, `${acLabel} [cursor] — missing models.json or ${agentName} agent file`);
  }

  const codexMeta = readOrNull(root, `.codex/skills/lazysitter/agents/${agentName}.meta`);
  const codexPeerMeta = readOrNull(root, `.codex/skills/lazysitter/agents/${peer}.meta`);
  if (codexMeta && codexPeerMeta) {
    const t1 = /^TIER=(\S+)/m.exec(codexMeta);
    const t2 = /^TIER=(\S+)/m.exec(codexPeerMeta);
    ok(
      !!t1 && !!t2 && t1[1] === t2[1],
      `${acLabel} [codex] ${agentName} TIER matches ${expectedTier}-tier peer ${peer} in .meta ` +
        `(assumption: .meta carries TIER=, inferred from confirmed SANDBOX=/APPROVAL= convention, not independently verified) ` +
        `(${t1 ? t1[1] : 'MISSING'} vs ${t2 ? t2[1] : 'MISSING'})`
    );
  } else {
    ok(false, `${acLabel} [codex] — missing .meta for ${agentName} or peer ${peer}`);
  }
}
function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
function gitOut(args) {
  try {
    return execFileSync('git', args, { cwd: PKG, encoding: 'utf8' });
  } catch (e) {
    return '';
  }
}
function gitDiffNameOnly(dirs) {
  return gitOut(['diff', '--name-only', 'HEAD', '--', ...dirs]).split(/\r?\n/).filter(Boolean);
}
function gitUntracked(dirs) {
  return gitOut(['ls-files', '--others', '--exclude-standard', '--', ...dirs]).split(/\r?\n/).filter(Boolean);
}
function gitDiffAddedLines(file) {
  return gitOut(['diff', 'HEAD', '--', file])
    .split(/\r?\n/)
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'));
}

const roster = rosterJsonSafe();

let tmp1 = null;
let tmp2 = null;
try {
  tmp1 = fs.mkdtempSync(path.join(os.tmpdir(), 'lazysitter-criteria-'));
  console.log(`temp project: ${tmp1}\n`);

  console.log('init (all adapters)');
  const initResult = tryRun(['init', tmp1], tmp1);
  ok(initResult.code === 0, 'AC-48 — init exits 0');

  console.log('\nAC-1: roster grows by exactly one, everywhere');
  const claudeAgentFiles = fs.existsSync(path.join(tmp1, '.claude/agents'))
    ? fs.readdirSync(path.join(tmp1, '.claude/agents')).filter((f) => f.endsWith('.md'))
    : [];
  const cursorAgentFiles = fs.existsSync(path.join(tmp1, '.cursor/agents'))
    ? fs.readdirSync(path.join(tmp1, '.cursor/agents')).filter((f) => f.endsWith('.md'))
    : [];
  const codexAgentFiles = fs.existsSync(path.join(tmp1, '.codex/skills/lazysitter/agents'))
    ? fs.readdirSync(path.join(tmp1, '.codex/skills/lazysitter/agents')).filter((f) => f.endsWith('.md'))
    : [];
  ok(claudeAgentFiles.length === 27, `AC-1 [claude] 27 agents (got ${claudeAgentFiles.length})`);
  ok(cursorAgentFiles.length === 27, `AC-1 [cursor] 27 agents (got ${cursorAgentFiles.length})`);
  ok(codexAgentFiles.length === 27, `AC-1 [codex] 27 agent role files (got ${codexAgentFiles.length})`);
  ok(has(tmp1, '.claude/agents/lazysitter-recon.md'), 'AC-1 [claude] lazysitter-recon.md exists');
  ok(has(tmp1, '.codex/skills/lazysitter/agents/lazysitter-recon.md'), 'AC-1 [codex] lazysitter-recon.md role exists');
  ok(has(tmp1, '.codex/skills/lazysitter/agents/lazysitter-recon.meta'), 'AC-1 [codex] lazysitter-recon.meta exists');
  ok(has(tmp1, '.cursor/agents/lazysitter-recon.md'), 'AC-1 [cursor] lazysitter-recon.md exists');

  console.log('\nAC-2: recon is tier low in all three adapters');
  tierParity(tmp1, 'lazysitter-recon', 'low', 'AC-2');

  console.log('\nAC-3: three-state capability model; present-but-inert worse than absent');
  tripletMust(
    tmp1,
    'lazysitter-recon',
    [
      ['states available state', /\bavailable\b/i],
      ['states absent state', /\babsent\b/i],
      ['states present-but-inert state', /present-but-inert/i],
      ['defines present-but-inert as exiting 0 doing zero work', /exit(s)?\s*0/i],
      ['states present-but-inert is worse than absent', /worse than.{0,20}absent/i],
    ],
    'AC-3'
  );

  console.log('\nAC-4: hard-BLOCK on unresolved degraded:true, all three orchestrators');
  const o4 = orchBothMust(
    [
      ['mentions degraded:true', /degraded\s*:\s*true/i],
      ['states hard-BLOCK', /hard-?BLOCK/i],
      ['requires a human waiver', /human waiver/i],
      ['requires the waiver be explicit', /explicit/i],
      ['requires the waiver be recorded', /recorded/i],
      ['requires the waiver be per-run', /per-run|per run/i],
    ],
    'AC-4'
  );
  fileMust(
    o4.cursorRule,
    [
      ['mentions degraded:true', /degraded\s*:\s*true/i],
      ['states hard-BLOCK', /hard-?BLOCK/i],
      ['requires a human waiver', /human waiver/i],
    ],
    'AC-4 [cursor rule]'
  );

  console.log('\nAC-5: absent-substrate agents not spawned, gap named');
  orchBothMust(
    [
      ['states agents with absent substrate are not spawned', /absent.{0,60}not spawned/is],
      ['requires the absence be recorded as a coverage gap', /coverage gap/i],
    ],
    'AC-5'
  );

  console.log('\nAC-6: plan-attack mode mirrors teeth-check structure, all three adapters');
  tripletMust(
    tmp1,
    'lazysitter-red-team',
    [
      ['defines a plan-attack mode', /plan-attack/i],
      ['operates on PLAN.md', /PLAN\.md/],
      ['mandates execution over reasoning', /execute/i],
      ['references teeth-check as structural precedent', /teeth-check/i],
    ],
    'AC-6'
  );
  ok(
    !has(tmp1, '.claude/agents/lazysitter-plan-attack.md'),
    'AC-6 — plan-attack is a mode of lazysitter-red-team, not a separate agent file'
  );

  console.log('\nAC-7: Tier 4 does not close until the plan survives plan-attack');
  const o7 = orchestratorTexts();
  for (const key of ['claude', 'codex']) {
    orderCheck(o7[key], /plan-attack/i, /\bimplementer\b/i, `AC-7 [orchestrator.${key}] — plan-attack precedes implementer tier`);
    fileMust(
      o7[key],
      [
        ['mentions Tier 4 / plan-approval gate', /Tier\s*4|plan-approval/i],
        ['states the gate does not close until the plan survives plan-attack', /does not close until|must survive|survives/i],
      ],
      `AC-7 [orchestrator.${key}]`
    );
  }

  console.log('\nAC-8: FACT-BLOCK defined with all three conditions, batched per tier');
  orchBothMust(
    [
      ['defines FACT-BLOCK', /FACT-BLOCK/i],
      ['condition: load-bearing on correctness', /load-bearing/i],
      ['condition: unanswerable from repo/tool', /unanswerable/i],
      ['condition: answerable by a human in one line', /one[- ]line/i],
      ['batches questions', /batch/i],
      ['asks once per tier, not per question', /once per tier/i],
    ],
    'AC-8'
  );

  console.log('\nAC-9: FACT-BLOCK cannot be closed by architect ruling');
  orchBothMust(
    [
      ['mentions FACT-BLOCK', /FACT-BLOCK/i],
      ['forbids an architect ruling from closing it', /architect.{0,60}(forbid|may not|cannot)/is],
    ],
    'AC-9'
  );

  console.log('\nAC-10: three dispute classes defined, architect ruling forbidden on fact');
  orchBothMust(
    [
      ['defines preference class', /preference/i],
      ['preference: architect rules after <=2 rounds', /2 rounds|two rounds/i],
      ['preference: override is logged', /override.{0,20}logged/i],
      ['defines fact class with architect ruling forbidden', /architect.{0,60}(forbidden|may not rule|cannot rule)/is],
      ['fact resolved via FACT-BLOCK or observation', /FACT-BLOCK/i],
      ['defines one-way/irreversible class', /one-way|irreversible/i],
      ['one-way requires explicit human sign-off', /human sign-?off/i],
    ],
    'AC-10'
  );

  console.log('\nAC-11: knowledge directory seeded, git-trackable, writePreserve');
  for (const kf of KNOWLEDGE_FILES) {
    const rel = `.lazysitter/knowledge/${kf}`;
    ok(has(tmp1, rel), `AC-11 — ${rel} exists after init`);
  }
  const manifestText = readOrNull(tmp1, '.lazysitter/manifest.json');
  let manifest = null;
  if (manifestText) {
    try {
      manifest = JSON.parse(manifestText);
    } catch (e) {}
  }
  if (manifest) {
    for (const kf of KNOWLEDGE_FILES) {
      const managedStr = JSON.stringify(manifest.managed || {});
      const preserveStr = JSON.stringify(manifest.preserve || {});
      ok(preserveStr.includes(kf) || preserveStr.includes('knowledge'), `AC-11 — ${kf} registered under manifest.preserve`);
      ok(!managedStr.includes(kf), `AC-11 — ${kf} NOT registered under manifest.managed`);
    }
  } else {
    ok(false, 'AC-11 — .lazysitter/manifest.json missing or unparsable');
  }
  const lsiGitignore = readOrNull(tmp1, '.lazysitter/.gitignore');
  ok(lsiGitignore !== null, 'AC-11 — .lazysitter/.gitignore written');
  if (lsiGitignore !== null) {
    ok(!/knowledge/i.test(lsiGitignore), 'AC-11 — .lazysitter/.gitignore does not ignore knowledge/');
    ok(/RUN\.lock/.test(lsiGitignore), 'AC-11/C8 — .lazysitter/.gitignore names RUN.lock');
    ok(/runs\//.test(lsiGitignore), 'AC-11/C8 — .lazysitter/.gitignore names runs/');
  }

  console.log('\nAC-12: knowledge files survive lazysitter update untouched');
  const pitfallsRel = '.lazysitter/knowledge/PROJECT-PITFALLS.md';
  const beforePitfalls = readOrNull(tmp1, pitfallsRel);
  let updateResultAC12 = { code: 1, out: '' };
  if (beforePitfalls !== null) {
    const appended = beforePitfalls + '\n[project][acceptance-test] appended by test/criteria.js AC-12 -> marker-8f2c3a\n';
    fs.writeFileSync(path.join(tmp1, pitfallsRel), appended, 'utf8');
    updateResultAC12 = tryRun(['update', tmp1], tmp1);
    ok(updateResultAC12.code === 0, 'AC-12 — update exits 0');
    const afterPitfalls = readOrNull(tmp1, pitfallsRel);
    ok(afterPitfalls === appended, 'AC-12 — PROJECT-PITFALLS.md byte-identical (incl. appended line) after update');
  } else {
    ok(false, 'AC-12 — PROJECT-PITFALLS.md missing before update; cannot test preservation');
    updateResultAC12 = tryRun(['update', tmp1], tmp1);
  }

  console.log('\nAC-13: doctor/install warns when knowledge is gitignored');
  tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'lazysitter-criteria-gi-'));
  const gitignoreContent =
    '# build artifacts\nnode_modules/\ndist/\n\n# local state a real user might mistakenly ignore\n.lazysitter/\n';
  fs.writeFileSync(path.join(tmp2, '.gitignore'), gitignoreContent, 'utf8');
  const initGi = tryRun(['init', tmp2], tmp2);
  ok(
    /\.lazysitter/.test(initGi.out) && /(gitignor|ignored)/i.test(initGi.out),
    'AC-13 — init stdout warns naming the gitignored .lazysitter path'
  );
  const doctorGi = tryRun(['doctor', tmp2], tmp2);
  ok(
    /\.lazysitter/.test(doctorGi.out) && /(gitignor|ignored)/i.test(doctorGi.out),
    'AC-13 — doctor stdout warns naming the gitignored .lazysitter path'
  );

  console.log('\nAC-14: CONVENTIONS.md template carries probe, hit count, SHA');
  fileMust(
    readOrNull(tmp1, '.lazysitter/knowledge/CONVENTIONS.md'),
    [
      ['requires the exact probe command', /probe/i],
      ['requires a hit count', /hit count/i],
      ['requires path:line citations', /path\s*:\s*line/i],
      ['requires the verified-at SHA', /\bSHA\b/],
    ],
    'AC-14'
  );

  console.log('\nAC-15: secrets scanning is baseline + delta, all three adapters');
  const secretsAgentFile = claudeAgentFiles.find((f) => /secret/i.test(f));
  const secretsAgentName = secretsAgentFile ? secretsAgentFile.replace(/\.md$/, '') : 'lazysitter-secrets-scanner';
  tripletMust(
    tmp1,
    secretsAgentName,
    [
      ['runs a full-repo baseline scan once at onboarding', /baseline/i],
      ['writes SECRETS-BASELINE.md', /SECRETS-BASELINE\.md/],
      ['subsequent runs report delta vs baseline', /delta/i],
      ['surfaces unresolved pre-existing criticals until fixed/accepted', /unresolved/i],
    ],
    'AC-15'
  );

  console.log('\nAC-16: dependency auditing gets the same baseline treatment');
  tripletMust(
    tmp1,
    'lazysitter-dependency-auditor',
    [
      ['reports pre-existing (not just newly added) vulnerable/stale deps', /pre-existing/i],
      ['is not scoped to the diff only', /not.{0,20}diff.{0,10}only|diff-only/i],
    ],
    'AC-16'
  );

  console.log('\nAC-17: verdict schema carries verified_by and independent');
  for (const agentName of ['lazysitter-code-reviewer', 'lazysitter-red-team', 'lazysitter-test-runner']) {
    const bodies = tripletRead(tmp1, agentName);
    for (const adapter of ['claude', 'codex', 'cursor']) {
      const text = bodies[adapter];
      if (text === null) {
        ok(false, `AC-17 [${adapter}] ${agentName} — body missing`);
        continue;
      }
      const block = /```lsi-verdict([\s\S]*?)```/.exec(text);
      if (!block) {
        ok(false, `AC-17 [${adapter}] ${agentName} — no lsi-verdict block found`);
        continue;
      }
      ok(/verified_by/.test(block[1]), `AC-17 [${adapter}] ${agentName} — verdict block has verified_by`);
      ok(/independent\s*:/.test(block[1]), `AC-17 [${adapter}] ${agentName} — verdict block has independent field`);
    }
  }

  console.log('\nAC-18: gate refuses GREEN on a self-cleared blocking finding');
  orchBothMust(
    [
      ['mentions independent:false', /independent\s*:\s*false/i],
      ['refuses GREEN in that case', /GREEN/],
      ['uses refuse/refusal language', /refus/i],
    ],
    'AC-18'
  );

  console.log('\nAC-19: orchestrator cannot write source; one-line fixes spawn an implementer');
  orchBothMust(
    [
      ['forbids orchestrator Edit', /\bEdit\b/],
      ['forbids orchestrator Write of source', /\bWrite\b/],
      ['uses "may not" prohibition language', /may not/i],
      ['names the MICRO lane', /\bMICRO\b/],
      ['MICRO still spawns an implementer', /implementer/i],
    ],
    'AC-19'
  );

  console.log('\nAC-20: explorer gains Bash in Claude');
  const explorerClaude = readOrNull(tmp1, '.claude/agents/lazysitter-explorer.md');
  if (explorerClaude !== null) {
    const toolsLine = /^tools:\s*(.+)$/m.exec(explorerClaude);
    const tools = toolsLine ? toolsLine[1] : '';
    ok(/\bBash\b/.test(tools), 'AC-20 — claude explorer tools: includes Bash');
    ok(
      /\bRead\b/.test(tools) && /\bGrep\b/.test(tools) && /\bGlob\b/.test(tools) && /\bWrite\b/.test(tools),
      'AC-20 — claude explorer retains Read, Grep, Glob, Write'
    );
  } else {
    ok(false, 'AC-20 — .claude/agents/lazysitter-explorer.md missing');
  }

  console.log('\nAC-21: explorer gains equivalent Bash capability in Codex');
  const explorerCodex = readOrNull(tmp1, '.codex/skills/lazysitter/agents/lazysitter-explorer.md');
  ok(explorerCodex !== null && /\bBash\b/.test(explorerCodex), 'AC-21 — codex explorer role documents Bash-execution capability');

  console.log('\nAC-22: explorer gains equivalent Bash capability in Cursor');
  const explorerCursor = readOrNull(tmp1, '.cursor/agents/lazysitter-explorer.md');
  ok(explorerCursor !== null && /^readonly:\s*false/m.test(explorerCursor), 'AC-22 — cursor explorer frontmatter readonly: false');

  console.log('\nAC-23: every convention claim carries its probe, all three adapters');
  tripletMust(
    tmp1,
    'lazysitter-explorer',
    [
      ['requires exact probe command per convention claim', /probe/i],
      ['requires hit count', /hit count/i],
      ['requires path:line citations', /path\s*:\s*line/i],
      ['requires verified-at SHA', /\bSHA\b/],
      ['states a claim without a probe is not a fact', /not a fact/i],
    ],
    'AC-23'
  );

  console.log('\nAC-24: narrow re-probe right; contradiction invalidates dependent verdicts');
  tripletMust(
    tmp1,
    'lazysitter-explorer',
    [
      ['allows re-running a cited probe (not re-exploring)', /re-run|re-probe/i],
      ['forbids re-exploring', /not re-explore/i],
      ['contradicted fact BLOCKs', /contradict.{0,40}BLOCK/is],
      ['invalidates every dependent verdict', /invalidat/i],
    ],
    'AC-24'
  );
  tripletMust(
    tmp1,
    'lazysitter-architect',
    [
      ['documents the downstream re-probe right', /re-run|re-probe/i],
      ['documents the contradiction-invalidates rule', /invalidat/i],
    ],
    'AC-24'
  );

  console.log('\nAC-25: mandatory probe sections, all three adapters');
  tripletMust(
    tmp1,
    'lazysitter-explorer',
    [
      ['mandates branch-inventory probe git branch -a', /git branch -a/],
      ['mandates a cross-branch grep/log search', /cross-branch|across branches|--all --grep/i],
      ['convention bank: date/number formatting', /date.{0,20}format|number.{0,20}format/i],
      ['convention bank: JSON casing', /JSON casing|casing/i],
      ['convention bank: enum wire values', /enum.{0,20}wire/i],
      ['convention bank: error shape', /error shape/i],
      ['convention bank: logging', /logging/i],
      ['convention bank: null handling', /null handling/i],
      ['mandates a "does this already exist?" section', /already exist/i],
      ['requires naming what was searched even for NONE-FOUND', /NONE-FOUND/i],
    ],
    'AC-25'
  );

  console.log('\nAC-26: explorer tier bump low -> mid, all three adapters');
  tierParity(tmp1, 'lazysitter-explorer', 'mid', 'AC-26');

  console.log('\nAC-27: triage documents the 2x2 lane matrix plus MICRO');
  tripletMust(
    tmp1,
    'lazysitter-triage',
    [
      ['documents volatility axis', /volatility/i],
      ['documents blast radius axis', /blast radius/i],
      ['yields SPIKE lane', /\bSPIKE\b/],
      ['yields SPIKE-then-HARDEN lane', /SPIKE-then-HARDEN/i],
      ['yields FAST lane', /\bFAST\b/],
      ['yields FULL lane', /\bFULL\b/],
      ['adds a MICRO lane for one-line fixes', /\bMICRO\b/],
      ['MICRO still spawns an implementer, skips spec/panel/plan', /skip/i],
    ],
    'AC-27'
  );

  console.log('\nAC-28: triage tier bump low -> mid, all three adapters');
  tierParity(tmp1, 'lazysitter-triage', 'mid', 'AC-28');

  console.log('\nAC-29: triage inclusions must cite evidence');
  tripletMust(
    tmp1,
    'lazysitter-triage',
    [
      ['requires citing evidence for panel inclusion', /cite/i],
      ['evidence is a detected package/directory/grep hit', /(detected package|directory|grep hit)/i],
    ],
    'AC-29'
  );

  console.log('\nAC-30: devils-advocate tools become Read, Grep, Glob, Bash, all three adapters');
  const daClaude = readOrNull(tmp1, '.claude/agents/lazysitter-devils-advocate.md');
  if (daClaude !== null) {
    const t = /^tools:\s*(.+)$/m.exec(daClaude);
    const tv = t ? t[1] : '';
    ok(
      /\bRead\b/.test(tv) && /\bGrep\b/.test(tv) && /\bGlob\b/.test(tv) && /\bBash\b/.test(tv),
      'AC-30 [claude] devils-advocate tools = Read, Grep, Glob, Bash'
    );
  } else {
    ok(false, 'AC-30 [claude] — lazysitter-devils-advocate.md missing');
  }
  const daCodex = readOrNull(tmp1, '.codex/skills/lazysitter/agents/lazysitter-devils-advocate.md');
  ok(daCodex !== null && /\bBash\b/.test(daCodex), 'AC-30 [codex] devils-advocate role documents Bash capability');
  const daCursor = readOrNull(tmp1, '.cursor/agents/lazysitter-devils-advocate.md');
  ok(daCursor !== null && /^readonly:\s*false/m.test(daCursor), 'AC-30 [cursor] devils-advocate frontmatter readonly: false');

  console.log('\nAC-31: mandate is falsifiable-counter-example-or-NO-CHALLENGE');
  tripletMust(
    tmp1,
    'lazysitter-devils-advocate',
    [
      ['requires a falsifiable counter-example', /falsifiable/i],
      ['or NO-CHALLENGE naming strongest objection', /NO-CHALLENGE/],
      ['names the strongest objection considered and why it fails', /strongest objection/i],
    ],
    'AC-31'
  );
  const daBodiesAC31 = tripletRead(tmp1, 'lazysitter-devils-advocate');
  for (const adapter of ['claude', 'codex', 'cursor']) {
    const text = daBodiesAC31[adapter];
    if (text !== null) {
      ok(!/always object/i.test(text), `AC-31 [${adapter}] devils-advocate does not retain "always object" as standing mandate`);
    }
  }

  console.log('\nAC-32: devils-advocate leaves never-skip slot; plan-attack takes it, all three adapters');
  const cmds = commandTexts(tmp1);
  const cursorCombined = `${cmds.cursorRule || ''}\n${cmds.cursorCmd || ''}`;
  const scopes = { claude: neverSkipScope(cmds.claude), codex: neverSkipScope(cmds.codex), cursor: neverSkipScope(cursorCombined) };
  for (const [label, scope] of Object.entries(scopes)) {
    if (!scope) {
      ok(false, `AC-32 [${label}] — no never-skip enumeration section found`);
      continue;
    }
    ok(!/devils-advocate/i.test(scope), `AC-32 [${label}] — never-skip enumeration does not name devils-advocate`);
    ok(/plan-attack/i.test(scope), `AC-32 [${label}] — never-skip enumeration names plan-attack`);
  }

  console.log('\nAC-33: --auto drift is fixed; neither orchestrator states it as default');
  const o33 = orchestratorTexts();
  for (const key of ['claude', 'codex']) {
    const text = o33[key];
    if (text === null) {
      ok(false, `AC-33 [orchestrator.${key}] — file missing`);
      continue;
    }
    ok(!/--auto[^\n]{0,60}\(default\)/i.test(text), `AC-33 [orchestrator.${key}] — does not describe --auto as (default)`);
    ok(/HOLD/.test(text), `AC-33 [orchestrator.${key}] — states the gate HOLDs`);
    ok(/--auto/.test(text) && /explicit/i.test(text), `AC-33 [orchestrator.${key}] — HOLD unless --auto passed explicitly`);
  }

  console.log('\nAC-34: release-agent requires recorded, verified, non-interactive deploy topology');
  tripletMust(
    tmp1,
    'lazysitter-release-agent',
    [
      ['requires deploy topology recorded', /deploy topology/i],
      ['requires it recorded at recon', /recorded/i],
      ['requires it verified', /verified/i],
      ['requires an explicit non-interactive check', /non-interactive/i],
    ],
    'AC-34'
  );

  console.log('\nAC-35: rollback-agent authority void without reversibility record');
  tripletMust(
    tmp1,
    'lazysitter-rollback-agent',
    [
      ['requires reversibility established', /reversibility/i],
      ['via the architect one-way-door inventory', /one-way[- ]door/i],
      ['standing authority is void otherwise', /\bvoid\b/i],
    ],
    'AC-35'
  );

  console.log('\nAC-36: monitor-agent requires a named, reachable signal source');
  tripletMust(
    tmp1,
    'lazysitter-monitor-agent',
    [
      ['requires a named signal source', /signal source/i],
      ['requires it be reachable', /reachable/i],
      ['absence reported as a gap', /\bgap\b/i],
      ['never reports stable with no signal source', /never.{0,60}stable/is],
    ],
    'AC-36'
  );

  console.log('\nAC-37: recon fails loudly on missing/duplicate high_alt');
  tripletMust(
    tmp1,
    'lazysitter-recon',
    [
      ['checks high_alt', /high_alt/i],
      ['fails loudly / stops / names a degradation', /fails? loudly|named degradation/i],
      ['blocks downstream blind-spot independence claims', /blind-spot|blind spot/i],
    ],
    'AC-37'
  );

  console.log('\nAC-38: doctor reports high_alt==high degradation for all three adapters');
  let ac38CursorOk = false;
  const cursorModelsTextAC38 = readOrNull(tmp1, '.cursor/lazysitter/models.json');
  if (cursorModelsTextAC38 !== null) {
    try {
      const cm = JSON.parse(cursorModelsTextAC38);
      cm.high_alt = cm.high;
      fs.writeFileSync(path.join(tmp1, '.cursor/lazysitter/models.json'), JSON.stringify(cm, null, 2) + '\n', 'utf8');
      ac38CursorOk = true;
    } catch (e) {}
  }
  ok(ac38CursorOk, 'AC-38 setup — cursor models.json high_alt forced equal to high');

  let ac38CodexOk = false;
  const codexEnvText = readOrNull(tmp1, '.codex/skills/lazysitter/models.env');
  if (codexEnvText !== null) {
    const highMatch = /^MODEL_HIGH="([^"]*)"/m.exec(codexEnvText);
    if (highMatch) {
      const highVal = highMatch[1];
      const newEnv = /^MODEL_HIGH_ALT="[^"]*"/m.test(codexEnvText)
        ? codexEnvText.replace(/^MODEL_HIGH_ALT="[^"]*"/m, `MODEL_HIGH_ALT="${highVal}"`)
        : `${codexEnvText}\nMODEL_HIGH_ALT="${highVal}"\n`;
      fs.writeFileSync(path.join(tmp1, '.codex/skills/lazysitter/models.env'), newEnv, 'utf8');
      ac38CodexOk = true;
    }
  }
  ok(ac38CodexOk, 'AC-38 setup — codex models.env MODEL_HIGH_ALT forced equal to MODEL_HIGH');

  let ac38ClaudeOk = false;
  const redTeamClaudeText = readOrNull(tmp1, '.claude/agents/lazysitter-red-team.md');
  const highPeerName = findPeerWithTier(roster, 'high', ['lazysitter-red-team']);
  if (redTeamClaudeText !== null && highPeerName) {
    const rm = /^model:\s*(\S+)/m.exec(redTeamClaudeText);
    const peerText = readOrNull(tmp1, `.claude/agents/${highPeerName}.md`);
    if (rm && peerText !== null && /^model:\s*\S+/m.test(peerText)) {
      const newPeerText = peerText.replace(/^model:\s*\S+/m, `model: ${rm[1]}`);
      fs.writeFileSync(path.join(tmp1, `.claude/agents/${highPeerName}.md`), newPeerText, 'utf8');
      ac38ClaudeOk = true;
    }
  }
  ok(ac38ClaudeOk, `AC-38 setup — claude ${highPeerName || 'high-tier peer'} model forced equal to red-team's model`);

  const doctorAc38 = tryRun(['doctor', tmp1], tmp1);
  const doctorOutAc38 = doctorAc38.out || '';
  ok(/cursor/i.test(doctorOutAc38), 'AC-38 — doctor stdout names Cursor in the model-separation warning');
  ok(/codex/i.test(doctorOutAc38), 'AC-38 — doctor stdout names Codex in the model-separation warning');
  ok(/claude/i.test(doctorOutAc38), 'AC-38 — doctor stdout names Claude in the model-separation warning');
  ok(/high_alt|high-alt/i.test(doctorOutAc38), 'AC-38 — doctor stdout references high_alt in the warning');

  console.log('\nAC-39: build-result classification is mechanical, not prose');
  tripletMust(
    tmp1,
    'lazysitter-code-reviewer',
    [
      ['requires a mechanical classification', /mechanical/i],
      ['names locked DLLs as an environment failure example', /locked DLL|DLL lock/i],
      ['names permission errors', /permission error/i],
      ['names missing SDK', /missing SDK/i],
      ['forbids exit-code + human-language-qualifier decisions', /exit code/i],
    ],
    'AC-39'
  );

  console.log('\nAC-40: implementers must preserve encoding and EOL');
  const implementerNames = claudeAgentFiles.map((f) => f.replace(/\.md$/, '')).filter((n) => /implementer/i.test(n));
  if (implementerNames.length === 0) {
    ok(false, 'AC-40 — no *implementer* agent file found in .claude/agents to check');
  }
  for (const name of implementerNames) {
    tripletMust(
      tmp1,
      name,
      [
        ['states encoding must be preserved on edit', /encoding/i],
        ['states line-ending style must be preserved', /line.?ending|EOL/i],
        ['forbids silent BOM stripping', /BOM/i],
        ['forbids silent CRLF/LF normalization', /CRLF/i],
      ],
      'AC-40'
    );
  }

  console.log('\nAC-41: orchestrator verifies producer self-persistence; does not trust the report');
  orchBothMust(
    [
      ['references the artifact-persist guard', /artifact-persist/i],
      ['does not trust a self-report alone', /self-report|self report/i],
      ['independently confirms the file exists', /independently confirm|independently verif/i],
      ['checks existence on disk', /on disk/i],
    ],
    'AC-41'
  );

  console.log('\nAC-42 [should]: ASSUMPTIONS.md with tagged external facts');
  tripletMust(
    tmp1,
    'lazysitter-architect',
    [
      ['requires producing ASSUMPTIONS.md', /ASSUMPTIONS\.md/],
      ['each external fact tagged verified-from', /verified-from/i],
      ['or tagged UNVERIFIED', /UNVERIFIED/],
      ['load-bearing UNVERIFIED BLOCKs the gate', /load-bearing/i],
    ],
    'AC-42'
  );

  console.log('\nAC-43 [should]: fixed non-functional checklist, separate from ACs');
  tripletMust(
    tmp1,
    'lazysitter-architect',
    [
      ['checklist: cost/capacity', /capacity/i],
      ['checklist: concurrency', /concurrency/i],
      ['checklist: ordering', /ordering/i],
      ['checklist: tenancy', /tenancy/i],
      ['checklist: cross-repo contract', /cross-repo/i],
      ['checklist: ecosystem staleness', /ecosystem staleness/i],
      ['checklist: build-topology invariants', /build-topology|build topology/i],
      ['checklist: reversibility', /reversibility/i],
    ],
    'AC-43'
  );

  console.log('\nAC-44 [should]: execute-do not-argue is standing rule for adversarial agents');
  for (const agentName of ['lazysitter-red-team', 'lazysitter-devils-advocate']) {
    tripletMust(
      tmp1,
      agentName,
      [
        ['states the standing rule to execute rather than reason', /execute/i],
        ['runs in a scratch directory', /scratch/i],
        ['outside the project tree', /outside.{0,20}project/i],
        ['references at least one per-ecosystem recipe', /(npm|dotnet|pip|cargo|go run|pytest|jest)/i],
      ],
      'AC-44'
    );
  }

  console.log('\nAC-45: run anchoring, lock, and HEAD watchdog documented in both orchestrators');
  orchBothMust(
    [
      ['anchors run dir via git rev-parse --show-toplevel', /git rev-parse --show-toplevel/],
      ['requires .lazysitter/RUN.lock at Tier 0', /RUN\.lock/],
      ['refuses a second concurrent run', /concurrent/i],
      ['halts and re-syncs if HEAD changes', /HEAD/],
      ['uses halt/re-sync language, not "continue"', /halt/i],
    ],
    'AC-45'
  );

  console.log('\nAC-46 [should]: reuse-first pack section and footprint accounting mandate');
  tripletMust(
    tmp1,
    'lazysitter-explorer',
    [
      ['reuse-first "what already solves this?" section', /already exist|already solves/i],
      ['NONE-FOUND fallback', /NONE-FOUND/i],
    ],
    'AC-46'
  );
  tripletMust(
    tmp1,
    'lazysitter-code-reviewer',
    [
      ['footprint accounting mandate', /footprint/i],
      ['files created vs justified', /files created/i],
      ['comments added', /comments added/i],
      ['dead code orphaned', /dead code/i],
      ['blocks on unjustified net-new surface', /unjustified/i],
    ],
    'AC-46'
  );

  console.log('\nAC-47: node test/smoke.js passes at every increment (baseline check)');
  try {
    execFileSync(process.execPath, [path.join(PKG, 'test', 'smoke.js')], {
      cwd: PKG,
      env: { ...process.env, NO_COLOR: '1', LAZYSITTER_NO_UPDATE_CHECK: '1' },
      encoding: 'utf8',
    });
    ok(true, 'AC-47 — node test/smoke.js exits 0');
  } catch (e) {
    ok(false, `AC-47 — node test/smoke.js exits 0 (failed: exit ${e.status})`);
  }

  console.log('\nAC-48: install/update/doctor/uninstall keep working, no orphans for new paths');
  ok(updateResultAC12.code === 0, 'AC-48 — update exits 0');
  const doctorFinal = tryRun(['doctor', tmp1], tmp1);
  ok(doctorFinal.code === 0 || doctorFinal.code === 1, 'AC-48 — doctor runs to completion');
  const uninstallResult = tryRun(['uninstall', tmp1], tmp1);
  ok(uninstallResult.code === 0, 'AC-48 — uninstall exits 0');
  const newManagedPaths = [
    '.claude/agents/lazysitter-recon.md',
    '.codex/skills/lazysitter/agents/lazysitter-recon.md',
    '.codex/skills/lazysitter/agents/lazysitter-recon.meta',
    '.cursor/agents/lazysitter-recon.md',
  ];
  for (const p of newManagedPaths) {
    ok(!has(tmp1, p), `AC-48 — managed path ${p} removed on uninstall (no orphan)`);
  }
  for (const kf of KNOWLEDGE_FILES) {
    ok(has(tmp1, `.lazysitter/knowledge/${kf}`), `AC-48 — writePreserve path .lazysitter/knowledge/${kf} retained after plain uninstall (C8)`);
  }

  console.log('\nAC-49: no R1-R7 change is present');
  const o49 = orchestratorTexts();
  for (const key of ['claude', 'codex']) {
    const text = o49[key];
    if (text === null) {
      ok(false, `AC-49 [orchestrator.${key}] — file missing`);
      continue;
    }
    ok(/gate/i.test(text), `AC-49 [orchestrator.${key}] — retains gate ownership language`);
    ok(/budget/i.test(text), `AC-49 [orchestrator.${key}] — retains budget language`);
    ok(/kill[- ]?switch/i.test(text), `AC-49 [orchestrator.${key}] — retains kill-switch language`);
    ok(/audit[- ]?log/i.test(text), `AC-49 [orchestrator.${key}] — retains audit-log language`);
  }
  if (roster && roster.agents) {
    const names = Object.keys(roster.agents);
    ok(names.length === 27, `AC-49 — roster.agents has exactly 27 entries (got ${names.length})`);
    ok(names.includes('lazysitter-recon'), 'AC-49 — roster additions include lazysitter-recon');
    for (const req of [
      'lazysitter-docs-agent',
      'lazysitter-ux-analyst',
      'lazysitter-frontend-expert',
      'lazysitter-dependency-auditor',
      'lazysitter-triage',
    ]) {
      ok(names.includes(req), `AC-49 — roster still includes ${req}`);
    }
    const tiers = new Set(names.map((n) => roster.agents[n] && roster.agents[n].tier).filter(Boolean));
    for (const t of ['low', 'mid', 'high', 'high_alt']) {
      ok(tiers.has(t), `AC-49 — roster tier '${t}' still present on at least one agent (no tier deleted)`);
    }
  } else {
    ok(false, 'AC-49 — core/roster.json unreadable or missing .agents map; cannot verify roster invariants');
  }
  const coreAgentFiles = fs.existsSync(path.join(PKG, 'core/agents'))
    ? fs.readdirSync(path.join(PKG, 'core/agents')).filter((f) => f.endsWith('.md'))
    : [];
  ok(coreAgentFiles.length === 27, `AC-49 — core/agents/*.md has exactly 27 files (got ${coreAgentFiles.length})`);
  let webGrantFound = false;
  const webGrantFiles = [];
  for (const f of coreAgentFiles) {
    const text = readOrNull(PKG, `core/agents/${f}`);
    if (text && /^tools:\s*.*(WebFetch|WebSearch)/m.test(text)) {
      webGrantFound = true;
      webGrantFiles.push(f);
    }
  }
  ok(
    !webGrantFound,
    `AC-49 — no agent frontmatter grants WebFetch or WebSearch${webGrantFiles.length ? '; flagged: ' + webGrantFiles.join(', ') : ''}`
  );
  const coreFilesAll = walk(path.join(PKG, 'core'), []);
  const srcFilesAll = walk(path.join(PKG, 'src'), []);
  const suspiciousNamePattern = /\.(csproj|sln)$/i;
  const suspiciousExact = new Set(['dockerfile', 'docker-compose.yml', 'docker-compose.yaml']);
  let harnessFound = false;
  const harnessHits = [];
  for (const f of [...coreFilesAll, ...srcFilesAll]) {
    const base = path.basename(f).toLowerCase();
    if (suspiciousNamePattern.test(base) || suspiciousExact.has(base)) {
      harnessFound = true;
      harnessHits.push(f);
    }
  }
  ok(
    !harnessFound,
    `AC-49 — no executable harness scaffold (.csproj/.sln/Dockerfile/docker-compose) under core/ or src/${harnessHits.length ? '; flagged: ' + harnessHits.join(', ') : ''}`
  );
  const explorerSrc = readOrNull(PKG, 'core/agents/lazysitter-explorer.md');
  if (explorerSrc !== null) {
    const hasHardCap =
      /\b\d{2,5}\s*[- ]?words?\b.{0,20}(max|maximum|cap|limit)/i.test(explorerSrc) ||
      /(max|maximum|cap|limit).{0,20}\b\d{2,5}\s*[- ]?words?\b/i.test(explorerSrc);
    ok(!hasHardCap, 'AC-49 — explorer source has no reintroduced hard word-count cap (density retained per R3)');
  } else {
    ok(false, 'AC-49 — core/agents/lazysitter-explorer.md missing; cannot check word-count cap');
  }

  console.log('\nAC-50: no code comments introduced (git diff vs HEAD, core/src/bin *.js)');
  const changedJsTracked = gitDiffNameOnly(['core', 'src', 'bin']).filter((f) => f.endsWith('.js'));
  const changedJsUntracked = gitUntracked(['core', 'src', 'bin']).filter((f) => f.endsWith('.js'));
  const uniqueChangedJs = Array.from(new Set([...changedJsTracked, ...changedJsUntracked]));
  let commentIntroduced = false;
  const commentedFiles = [];
  for (const rel of uniqueChangedJs) {
    const abs = path.join(PKG, rel);
    if (!fs.existsSync(abs)) continue;
    const isUntracked = changedJsUntracked.includes(rel);
    const addedLines = isUntracked
      ? fs.readFileSync(abs, 'utf8').split(/\r?\n/).map((l) => `+${l}`)
      : gitDiffAddedLines(rel);
    for (const line of addedLines) {
      const content = line.slice(1);
      const trimmed = content.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.includes('*/')) {
        commentIntroduced = true;
        commentedFiles.push(rel);
        break;
      }
    }
  }
  ok(
    !commentIntroduced,
    `AC-50 — no code comments introduced in changed .js files under core/src/bin, per git diff vs HEAD${commentedFiles.length ? '; flagged: ' + commentedFiles.join(', ') : ''} (vacuously true if nothing has changed yet)`
  );

  console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
} finally {
  if (tmp1) fs.rmSync(tmp1, { recursive: true, force: true });
  if (tmp2) fs.rmSync(tmp2, { recursive: true, force: true });
}
