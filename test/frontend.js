'use strict';

// Zero-dependency suite for the frontend team: the structural index, then the
// installer's team separation. Same shape as test/smoke.js.
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
const write = (root, rel, body) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body, 'utf8');
};
const has = (root, rel) => fs.existsSync(path.join(root, rel));

function buildFixture(root) {
  write(root, 'package.json', JSON.stringify({
    name: 'fixture',
    dependencies: { next: '14.2.3', react: '18.3.1', lodash: '4.17.21' },
    devDependencies: { typescript: '5.4.0', tailwindcss: '3.4.0' },
    scripts: { build: 'next build', test: 'vitest' },
  }));
  write(root, 'tsconfig.json', JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } }));

  // Canonical component. The interface members deliberately include a function
  // type, which broke member splitting before the `=>` guard existed.
  write(root, 'src/ui/ConfirmDialog.tsx', `import React, { useState, useEffect } from 'react';

export interface ConfirmDialogProps {
  title: string;
  body?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
  legacyMode?: boolean;
}

/** Canonical confirm dialog. A <Fake /> in this comment must never be indexed. */
export function ConfirmDialog({ title, body, onConfirm, onCancel, destructive = false }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  useEffect(() => { document.addEventListener('keydown', onCancel); }, []);
  return (
    <div role="dialog" aria-modal="true">
      <h2>{title}</h2>
      <p>{body}</p>
      <button onClick={onCancel}>Cancel</button>
      <button onClick={() => { setBusy(true); onConfirm(); }} disabled={busy}>OK</button>
    </div>
  );
}
`);

  // Same prop contract, unrelated name — only structural clustering finds this.
  write(root, 'src/ui/AreYouSureModal.tsx', `import React from 'react';
type Props = { title: string; body?: string; onConfirm: () => void; onCancel: () => void; destructive?: boolean };
export const AreYouSureModal = ({ title, body, onConfirm, onCancel }: Props) => (
  <div role="dialog">
    <h2>{title}</h2>
    <p>{body}</p>
    <button onClick={onCancel}>No</button>
    <button onClick={onConfirm}>Yes</button>
  </div>
);
`);

  write(root, 'src/ui/Row.tsx', `import React from 'react';
export interface RowProps { label: string; onSelect: () => void; theme?: string; density?: 'a' | 'b'; }
export function Row({ label, onSelect, theme }: RowProps) {
  return <div onClick={onSelect} style={{ color: '#ff0044' }}>{label}</div>;
}
`);

  write(root, 'src/ui/index.ts', `export { ConfirmDialog } from './ConfirmDialog';
export { AreYouSureModal } from './AreYouSureModal';
export * from './Row';
`);

  // Imports through a barrel via a path alias — both must resolve for usage
  // counts and the blast radius to be right.
  write(root, 'src/features/UserList.tsx', `'use client';
import React, { useState } from 'react';
import { ConfirmDialog, Row } from '@/ui';
import _ from 'lodash';

export function UserList({ users, theme }: { users: { id: string; name: string }[]; theme?: string }) {
  const [pending, setPending] = useState<string | null>(null);
  return (
    <ul>
      {users.map((u, i) => (
        <Row key={i} label={u.name} onSelect={() => setPending(u.id)} theme={theme} />
      ))}
      {pending && <ConfirmDialog title="Delete?" onConfirm={() => {}} onCancel={() => setPending(null)} style={{ a: 1 }} />}
      <img src="/x.png" />
    </ul>
  );
}
`);

  write(root, 'src/features/Page.tsx', `import React from 'react';
import { UserList } from './UserList';
export function Page({ theme }: { theme?: string }) {
  return <UserList users={[]} theme={theme} />;
}
`);

  // A Server Component using client-only APIs — the NEXT-MISSING-USE-CLIENT case.
  write(root, 'app/dashboard/page.tsx', `import React, { useState } from 'react';
import { Page } from '@/features/Page';
export default function DashboardPage() {
  const [t, setT] = useState('dark');
  return <Page theme={t} />;
}
`);

  // Renamed copy-paste: identical logic, no shared identifier names.
  write(root, 'src/utils.ts', `export function formatMoney(cents: number, currency: string) {
  const value = cents / 100;
  if (!currency) { return String(value); }
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(value);
}
export function toCurrency(amount: number, code: string) {
  const v = amount / 100;
  if (!code) { return String(v); }
  return new Intl.NumberFormat('en', { style: 'currency', currency: code }).format(v);
}
`);

  // A conditional hook, which is a correctness bug rather than a lint nag.
  write(root, 'src/features/Cond.tsx', `import React, { useState } from 'react';
export function Cond({ flag }: { flag: boolean }) {
  if (flag) { const [x] = useState(0); return <span>{x}</span>; }
  return <span />;
}
`);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lazysitter-fe-'));
try {
  console.log(`temp project: ${tmp}\n`);
  buildFixture(tmp);

  // ---------------------------------------------------------------- indexer
  console.log('fe-index build');
  const buildOut = run(['fe-index', 'build', `--dir=${tmp}`], tmp);
  ok(/next@14\.2\.3/.test(buildOut), 'detects Next.js from package.json');
  ok(/router: app/.test(buildOut), 'detects the App Router from the app/ directory');
  ok(has(tmp, '.lazysitter/index/meta.json'), 'writes meta.json');
  ok(has(tmp, '.lazysitter/index/components.json'), 'writes components.json');
  ok(has(tmp, '.lazysitter/index/cache.jsonl'), 'writes the incremental cache');

  const meta = JSON.parse(fs.readFileSync(path.join(tmp, '.lazysitter/index/meta.json'), 'utf8'));
  ok(meta.stack.supported === true, 'marks a Next repo as supported');
  ok(meta.counts.components === 7, `indexes all 7 components (got ${meta.counts.components})`);
  ok(meta.counts.utils === 2, `indexes both exported utils (got ${meta.counts.utils})`);
  ok(meta.coverage.parseErrors.length === 0, 'no parse errors across the fixture');

  console.log('\nlexer / parser');
  const components = JSON.parse(fs.readFileSync(path.join(tmp, '.lazysitter/index/components.json'), 'utf8'));
  const userList = components.find((c) => c.name === 'UserList');
  ok(!!userList, 'a component whose JSX contains /> is not swallowed by regex-literal lexing');
  const confirm = components.find((c) => c.name === 'ConfirmDialog');
  ok(!!confirm && confirm.props.length === 6, `reads all 6 interface props past a () => void member (got ${confirm ? confirm.props.length : 0})`);
  const onConfirm = confirm && confirm.props.find((p) => p.name === 'onConfirm');
  ok(!!onConfirm && onConfirm.type === '() => void', 'keeps the function type intact');
  ok(!components.some((c) => c.name === 'Fake'), 'a JSX-looking tag inside a comment is not indexed');
  ok(confirm && confirm.directives.length === 0, 'no false `use client` on a plain component');
  ok(userList && userList.directives.includes('use client'), "reads the 'use client' directive");

  console.log('\ngraph: alias + barrel resolution');
  const row = components.find((c) => c.name === 'Row');
  ok(row && row.usageCount === 1, `counts a call site imported via @/ alias through a barrel (got ${row ? row.usageCount : 0})`);
  const whoOut = run(['fe-index', 'who', 'Row', `--dir=${tmp}`], tmp);
  ok(/src\/features\/UserList\.tsx:\d+/.test(whoOut), 'reports the real call-site path:line');
  ok(/label, onSelect, theme/.test(whoOut), 'reports the props actually passed at the call site');

  const impact = JSON.parse(run(['fe-index', 'impact', 'src/ui/Row.tsx', `--dir=${tmp}`, '--json'], tmp));
  ok(impact.totalAffectedFiles === 4, `blast radius crosses the barrel (got ${impact.totalAffectedFiles})`);
  ok(impact.routes.includes('app/dashboard/page.tsx'), 'names the affected route');

  console.log('\nduplicate detection');
  const dup = JSON.parse(run(['fe-index', 'dup', `--dir=${tmp}`, '--json'], tmp));
  const compCluster = dup.find((c) => c.kind === 'component');
  ok(!!compCluster, 'clusters components');
  const names = compCluster ? compCluster.members.map((m) => m.name).sort() : [];
  ok(names.join(',') === 'AreYouSureModal,ConfirmDialog', `groups differently-named duplicates by prop contract (got ${names.join(',')})`);
  ok(compCluster && compCluster.members[0].name === 'ConfirmDialog', 'ranks the dominant implementation first');

  const utilCluster = dup.find((c) => c.kind === 'util');
  const utilNames = utilCluster ? utilCluster.members.map((m) => m.name).sort() : [];
  ok(utilNames.join(',') === 'formatMoney,toCurrency', `finds renamed copy-paste with no shared identifiers (got ${utilNames.join(',')})`);

  console.log('\nprecedent set');
  const precedent = run(['fe-index', 'precedent', 'confirm modal dialog', `--dir=${tmp}`], tmp);
  ok(/^### Precedent set — .+ {3}clusters: \d+$/m.test(precedent), 'emits the pipeline precedent-set header verbatim');
  ok(/^1\. src\/ui\/ConfirmDialog\.tsx:\d+ — hits: \d+ — newest-blame: \d{4}-\d{2}-\d{2} — deprecation: none/m.test(precedent), 'rank-1 row carries hits, blame date and deprecation');
  ok(/comment-density: /.test(precedent), 'carries the measured comment density for the implementer to match');

  console.log('\nprop analysis');
  const props = JSON.parse(run(['fe-index', 'props', 'ConfirmDialog', `--dir=${tmp}`, '--json'], tmp))[0];
  ok(props.neverPassed.includes('body') && props.neverPassed.includes('legacyMode'), 'reports declared props passed at zero call sites');
  ok(props.undeclared.includes('style'), 'reports props passed but not declared');
  const title = props.props.find((p) => p.name === 'title');
  ok(title && title.required === true && title.passedAt === 1, 'joins requiredness with real call-site usage');
  const destructive = props.props.find((p) => p.name === 'destructive');
  ok(destructive && destructive.default === 'false', 'reads a destructuring default');

  console.log('\ndrill chains and orphans');
  const drill = run(['fe-index', 'drill', `--dir=${tmp}`], tmp);
  ok(/depth 3 {2}prop `theme` {2}Page → UserList → Row/.test(drill), 'finds the prop-drilling chain through three components');
  const orphans = JSON.parse(run(['fe-index', 'orphans', `--dir=${tmp}`, '--json'], tmp));
  ok(orphans.some((o) => o.name === 'AreYouSureModal'), 'reports an exported-but-never-rendered component');
  ok(!orphans.some((o) => o.name === 'DashboardPage'), 'does not report a route entry as an orphan');

  console.log('\nmechanical signals');
  const signals = JSON.parse(run(['fe-index', 'signals', `--dir=${tmp}`, '--json', '--limit=200'], tmp));
  const rule = (id) => signals.filter((s) => s.id === id);
  ok(rule('REACT-CONDITIONAL-HOOK').length === 1, 'flags a hook called inside a conditional block');
  ok(rule('NEXT-MISSING-USE-CLIENT').some((s) => s.file === 'app/dashboard/page.tsx'), "flags client APIs without 'use client'");
  ok(rule('A11Y-IMG-ALT').length === 1, 'flags an image with no alt');
  ok(rule('A11Y-CLICK-NONINTERACTIVE').length === 1, 'flags a click handler on a non-interactive element');
  ok(rule('PERF-INDEX-KEY').length === 1, 'flags a list keyed by array index');
  ok(rule('PERF-HEAVY-IMPORT').length === 1, 'flags a root import of a heavy package');
  ok(rule('LEAK-NO-TEARDOWN').length === 1, 'flags a listener registered with no teardown');
  ok(rule('STYLE-HARDCODED-COLOR').length === 1, 'flags a hardcoded colour outside the token set');
  ok(signals.every((s) => s.file && s.line > 0), 'every finding carries a path:line');

  console.log('\nincremental rebuild');
  const rebuild = run(['fe-index', 'build', `--dir=${tmp}`], tmp);
  ok(/\(0 parsed, \d+ cached\)/.test(rebuild), 'an unchanged tree is served entirely from cache');
  write(tmp, 'src/ui/Row.tsx', fs.readFileSync(path.join(tmp, 'src/ui/Row.tsx'), 'utf8') + '\nexport const ROW_GAP = 8;\n');
  const rebuild2 = run(['fe-index', 'build', `--dir=${tmp}`], tmp);
  ok(/\(1 parsed, \d+ cached\)/.test(rebuild2), 'only the changed file is reparsed');

  console.log('\nfeature brief (deterministic context pack)');
  const briefOut = run(['fe-index', 'brief', `--dir=${tmp}`, '--feature=Add a confirm dialog before deleting a user from the list'], tmp);
  ok(/Feature brief written/.test(briefOut), 'brief writes a sharded pack');
  const briefDir = path.join(tmp, '.lazysitter/index/brief');
  for (const shard of ['INDEX.md', '00-DIGEST.md', '10-precedents.md', '20-conventions.md', '30-state.md', '40-routes.md', '50-design-tokens.md', '70-risk.md', '90-open-questions.md']) {
    ok(fs.existsSync(path.join(briefDir, shard)), `shard ${shard} written`);
  }
  const digest = fs.readFileSync(path.join(briefDir, '00-DIGEST.md'), 'utf8');
  ok(/confirm dialog/.test(digest), 'infers the feature category from the request text');
  ok(!/\badd\b|\bthe\b.*category/i.test(digest.split('## Categories')[1] || ''), 'stopwords do not become categories');
  ok(/ConfirmDialog/.test(digest), 'names the real neighbourhood component');
  ok(/render\/visual: \*\*absent\*\*/.test(digest), 'reports absent harnesses honestly in the digest');
  const precedents = fs.readFileSync(path.join(briefDir, '10-precedents.md'), 'utf8');
  ok(/^### Precedent set — .+ {3}clusters: \d+$/m.test(precedents), 'brief emits the pipeline precedent-set format');
  ok(/NONE-FOUND — probe: `fe-index precedent/.test(precedents), 'NONE-FOUND rows carry the probe that proves them');
  const conventions = fs.readFileSync(path.join(briefDir, '20-conventions.md'), 'utf8');
  ok(/Intl\.NumberFormat/.test(conventions), 'derives the number-formatting convention mechanically');
  ok(/NONE-FOUND \(no usage detected/.test(conventions), 'absent conventions read as NONE-FOUND, not as silence');
  const open = fs.readFileSync(path.join(briefDir, '90-open-questions.md'), 'utf8');
  ok(/a program cannot answer these/.test(open), 'separates judgement calls from facts');
  ok(/heuristic/.test(open), 'flags that heuristic findings still need a human read');
  const indexShard = fs.readFileSync(path.join(briefDir, 'INDEX.md'), 'utf8');
  ok(/fe-architect/.test(indexShard) && /fe-styling-expert/.test(indexShard), 'carries the per-role shard routing table');
  ok(/Read `00-DIGEST.md` always/.test(indexShard), 'tells agents to read only their shards');

  console.log('\ncost forecast');
  const cost = JSON.parse(run(['fe-index', 'cost', `--dir=${tmp}`, '--feature=Add a confirm dialog before deleting a user', '--json'], tmp));
  ok(cost.total > 0 && cost.waves.length > 8, 'produces a per-wave forecast');
  ok(typeof cost.fitsBudget === 'boolean' && cost.budget === 400000, 'compares against the default budget');
  ok(cost.sizeInferred && /affects/.test(cost.sizeInferred.why), 'infers size from the measured blast radius');
  ok(cost.caveats.some((c) => /ESTIMATE/.test(c)), 'labels the forecast as an estimate');
  const large = JSON.parse(run(['fe-index', 'cost', `--dir=${tmp}`, '--feature=Add a confirm dialog before deleting a user', '--size=large', '--json'], tmp));
  const r1 = large.waves.find((w) => /design round 1/.test(w.name));
  const r2 = large.waves.find((w) => /design round 2/.test(w.name));
  ok(r2 && r2.agents > 0 && r2.agents < r1.agents, `round 2 re-spawns fewer experts than round 1 (${r2 && r2.agents} vs ${r1 && r1.agents})`);
  ok(r2 && /open item/.test(r2.note || ''), 'round 2 is scoped to open items, not the full panel');
  ok(cost.size === 'small' && large.sizeOverridden, 'size is inferred by default and overridable');

  console.log('\nmechanical gate');
  const gtmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lazysitter-gate-'));
  try {
    buildFixture(gtmp);
    execFileSync('git', ['init', '-q', '.'], { cwd: gtmp });
    execFileSync('git', ['add', '-A'], { cwd: gtmp });
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'base'], { cwd: gtmp });
    // An UNTRACKED new file — git diff cannot see it, which is the exact hole
    // that would let a brand-new file ship a hardcoded credential.
    write(gtmp, 'src/features/Export.tsx', `import React from 'react';
const API_KEY = "sk_live_9f8a7b6c5d4e3f2a1b0c";
export function ExportButton({ onExport }: { onExport: () => void }) {
  return <div onClick={onExport}>Export</div>;
}
`);
    write(gtmp, 'scratch-notes.log', 'noise');
    write(gtmp, 'gate-input.json', JSON.stringify({
      ownershipMap: { 'lazysitter-fe-component-implementer': ['src/features/Export.tsx'] },
      plannedFiles: ['src/features/Export.tsx'],
      citations: [
        { location: 'src/ui/ConfirmDialog.tsx:13', symbol: 'ConfirmDialog' },
        { location: 'src/ui/Nope.tsx:99', symbol: 'Ghost' },
      ],
    }));
    run(['fe-index', 'build', `--dir=${gtmp}`], gtmp);
    const g = JSON.parse(run(['fe-index', 'gate', `--dir=${gtmp}`, `--input=${path.join(gtmp, 'gate-input.json')}`, '--json'], gtmp));

    ok(g.secrets.some((s) => s.file === 'src/features/Export.tsx'), 'scans UNTRACKED new files — a secret in one is caught');
    ok(g.secrets.every((s) => !/sk_live_9f8a/.test(JSON.stringify(s))), 'never echoes the secret value back');
    ok(g.citations.some((c) => c.location === 'src/ui/Nope.tsx:99' && c.verdict === 'MISSING-FILE'), 'catches a fabricated precedent citation');
    ok(g.citations.some((c) => c.location.includes('ConfirmDialog') && c.verdict === 'RESOLVES'), 'confirms a real citation by opening the line');
    ok(g.footprint.scratchSuspects.includes('scratch-notes.log'), 'flags a scratch artifact');
    ok(g.ownership.checked && g.ownership.unowned.includes('scratch-notes.log'), 'flags a changed file with no owner in the plan');
    ok(g.newSignals && g.newSignals.some((s) => s.id === 'A11Y-CLICK-NONINTERACTIVE'), 'reports rule findings the diff introduced');
    ok(g.verdicts.length >= 3 && g.verdicts.every((v) => /^```lsi-verdict/.test(v)), 'emits pipeline lsi-verdict blocks');
    ok(g.verdicts.some((v) => /verdict: BLOCK/.test(v)), 'blocks on the findings above');
    ok(g.verdicts.every((v) => /independent: true/.test(v)), 'gate verdicts are independent of the build lineage');

    const clean = JSON.parse(run(['fe-index', 'gate', `--dir=${gtmp}`, '--base=HEAD', '--json'], gtmp));
    ok(clean.changed.length === 0, 'a base-to-HEAD gate on an unchanged tree reports no changes');
  } finally {
    fs.rmSync(gtmp, { recursive: true, force: true });
  }

  console.log('\ndisclosed bounds (no silent caps)');
  const metaNow = JSON.parse(fs.readFileSync(path.join(tmp, '.lazysitter/index/meta.json'), 'utf8'));
  ok(Array.isArray(metaNow.coverage.clusterBlocksDropped), 'records any clustering block it skipped');
  ok(Array.isArray(metaNow.coverage.graphLimits), 'records any graph bound it hit');

  console.log('\nsessions: checkpoint, resume, integrity');
  const stmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lazysitter-sess-'));
  try {
    const S = require(path.join(PKG, 'src', 'fe-session'));
    buildFixture(stmp);
    execFileSync('git', ['init', '-q', '.'], { cwd: stmp });
    execFileSync('git', ['add', '-A'], { cwd: stmp });
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'base'], { cwd: stmp });

    const started = S.start(stmp, stmp, { feature: 'Add CSV export to the dashboard', budget: 400000 });
    ok(started.ok && started.slug === 'add-csv-export-to-the-dashboard', 'start creates a run and takes the lease');
    const sid = started.sessionId;

    S.checkpointWave(stmp, stmp, { run: started.slug, wave: '0-preflight', status: 'complete', sessionId: sid, spent: 3000 });
    S.checkpointWave(stmp, stmp, { run: started.slug, wave: '4-design', status: 'in_progress', sessionId: sid,
      agentComplete: ['fe-react-expert'], agentsPending: ['fe-a11y-expert', 'fe-security-expert'], spent: 95000 });
    const cp1 = S.loadCheckpoint(stmp, started.slug);
    ok(cp1.waves.find((w) => w.id === '0-preflight').status === 'complete', 'wave completion is recorded');
    ok(cp1.budget.spent === 95000, 'budget spend is carried in the checkpoint');

    // A live lease must block a second session.
    const blocked = S.resume(stmp, stmp, { run: started.slug });
    ok(!blocked.ok && blocked.verification.report.blocking.some((b) => /held by a live session/.test(b)), 'a live lease blocks a second session');

    // Age the lease past its TTL: a dead session must not block forever.
    const leaseFile = path.join(S.runDir(stmp, started.slug), 'LEASE.json');
    const lease = JSON.parse(fs.readFileSync(leaseFile, 'utf8'));
    lease.holders.main.heartbeat = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    fs.writeFileSync(leaseFile, JSON.stringify(lease));
    const resumed = S.resume(stmp, stmp, { run: started.slug });
    ok(resumed.ok, 'an expired lease is taken over — a dead session never blocks the tree forever');
    ok(resumed.sessionId !== sid, 'the resume runs under a new session id');
    ok(fs.existsSync(resumed.briefPath), 'resume writes RESUME-BRIEF.md');

    const brief = fs.readFileSync(resumed.briefPath, 'utf8');
    ok(/Add CSV export to the dashboard/.test(brief), 'brief carries the verbatim feature');
    ok(/fe-react-expert/.test(brief) && /fe-a11y-expert/.test(brief), 'brief names both completed and pending agents of the interrupted wave');
    ok(/already complete, do NOT re-spawn/.test(brief), 'brief tells the next session what to skip');
    ok(brief.length < 8000, `brief is a compact handoff, not a context dump (${brief.length} chars)`);
    const rerun = resumed.verification.report.willRerun.find((w) => w.wave === '4-design');
    ok(rerun && rerun.agentsAlreadyComplete.includes('fe-react-expert'), 'an interrupted wave re-runs, minus its finished agents');

    // A moved HEAD must block until explicitly reconciled.
    write(stmp, 'src/ui/New.tsx', 'export const X = 1;\n');
    execFileSync('git', ['add', '-A'], { cwd: stmp });
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'moved'], { cwd: stmp });
    const moved = S.verifyResumable(stmp, started.slug, stmp, { sessionId: resumed.sessionId });
    ok(!moved.ok && moved.report.blocking.some((b) => /HEAD moved/.test(b)), 'a moved HEAD blocks the resume');
    const reconciled = S.verifyResumable(stmp, started.slug, stmp, { sessionId: resumed.sessionId, reconcile: true });
    ok(reconciled.report.degraded.some((d) => /HEAD moved/.test(d)), '--reconcile accepts a moved HEAD but records it as degraded');

    // Frozen tests must not be editable after freezing.
    write(stmp, 'src/ui/Frozen.test.tsx', 'test("a", () => {});\n');
    S.checkpointWave(stmp, stmp, { run: started.slug, wave: '5-build', frozenTest: ['src/ui/Frozen.test.tsx'] });
    write(stmp, 'src/ui/Frozen.test.tsx', 'test("tampered", () => {});\n');
    const tampered = S.verifyResumable(stmp, started.slug, stmp, { sessionId: resumed.sessionId, reconcile: true });
    ok(tampered.report.blocking.some((b) => /modified after freezing/.test(b)), 'a tampered frozen test blocks the resume');

    // A completed wave that claims a missing artifact is a lie the resume catches.
    S.checkpointWave(stmp, stmp, { run: started.slug, wave: '1-intake', status: 'complete', artifact: 'GONE.md' });
    const missing = S.verifyResumable(stmp, started.slug, stmp, { sessionId: resumed.sessionId, reconcile: true });
    ok(missing.report.blocking.some((b) => /artifact is missing/.test(b)), 'a completed wave with a missing artifact blocks');

    console.log('\nsessions: parallelism safety');
    const second = S.start(stmp, stmp, { feature: 'A different feature entirely' });
    ok(!second.ok && second.reason === 'TREE-BUSY', 'a second run in the same working tree is refused');
    ok(/git worktree add/.test(second.message), 'and it names the safe alternative');

    // Everything before the design wave must be complete, so that `4-design` is
    // genuinely the next wave the splitter would look at.
    for (const w of ['0-preflight', '1-intake', '2-annotate', '2b-reconcile', '3-spec']) {
      S.checkpointWave(stmp, stmp, { run: started.slug, wave: w, status: 'complete' });
    }
    const cp2 = S.loadCheckpoint(stmp, started.slug);
    const design = cp2.waves.find((w) => w.id === '4-design');
    design.status = 'pending';
    design.agentsPending = ['fe-react-expert', 'fe-a11y-expert', 'fe-perf-expert'];
    S.saveCheckpoint(stmp, started.slug, cp2, {});
    const barrier = S.planSplit(stmp, stmp, { run: started.slug, sessions: 3 });
    ok(!barrier.ok && /barrier/.test(barrier.message), 'a barrier wave refuses to be split across sessions');
    ok(/one architect/.test(barrier.message), 'and explains that splitting design splits the mediator');

    for (const w of ['0-preflight', '1-intake', '2-annotate', '2b-reconcile', '3-spec', '4-design', '4a-plan-attack']) {
      S.checkpointWave(stmp, stmp, { run: started.slug, wave: w, status: 'complete' });
    }
    S.checkpointWave(stmp, stmp, { run: started.slug, wave: '5-build', status: 'pending',
      agentsPending: ['fe-component-implementer', 'fe-state-implementer', 'fe-style-implementer', 'fe-test-author'] });
    const split = S.planSplit(stmp, stmp, { run: started.slug, sessions: 3 });
    ok(split.ok && split.wave === '5-build', 'a parallelisable wave splits');
    ok(split.sessions.length === 3, 'into the requested number of sessions');
    const assigned = split.sessions.flatMap((s) => s.agents);
    ok(new Set(assigned).size === assigned.length && assigned.length === 4, 'every pending agent is assigned exactly once');
    ok(split.partitionedBy === 'ownership', 'the build wave partitions by the file-ownership map');

    const c1 = S.claim(stmp, { run: started.slug, partition: '5-build#1', sessionId: 'sA', files: ['src/ui/Row.tsx', 'src/ui/Card.tsx'] });
    ok(c1.ok, 'a partition can claim files');
    const c2 = S.claim(stmp, { run: started.slug, partition: '5-build#2', sessionId: 'sB', files: ['src/ui/Card.tsx'] });
    ok(!c2.ok && c2.conflicts[0].heldBy === '5-build#1', 'a file already claimed by another partition is refused, with the owner named');
    const c3 = S.claim(stmp, { run: started.slug, partition: '5-build#2', sessionId: 'sB', files: ['src/ui/Other.tsx'] });
    ok(c3.ok, 'a disjoint claim succeeds');

    console.log('\nsessions: durability');
    const cpFile = path.join(S.runDir(stmp, started.slug), 'CHECKPOINT.json');
    const before = fs.readFileSync(cpFile, 'utf8');
    ok(JSON.parse(before).schema === S.SCHEMA, 'checkpoint records its schema version');
    ok(!fs.readdirSync(S.runDir(stmp, started.slug)).some((f) => /\.tmp$/.test(f)), 'atomic writes leave no temp files behind');
    const ended = S.end(stmp, { run: started.slug, sessionId: resumed.sessionId, reason: 'usage-limit' });
    ok(ended.ok && ended.released, 'ending a session releases its lease');
    const after = S.loadCheckpoint(stmp, started.slug);
    ok(after.sessions.some((s) => s.reason === 'usage-limit'), 'the stop reason is recorded in the session history');
    const reacquire = S.start(stmp, stmp, { run: started.slug, feature: 'Add CSV export to the dashboard' });
    ok(reacquire.ok && reacquire.resumed, 'a released run can be re-attached immediately');

    const log = fs.readFileSync(path.join(S.runDir(stmp, started.slug), 'session-log.jsonl'), 'utf8').trim().split('\n');
    ok(log.length >= 4 && log.every((l) => JSON.parse(l).at), 'every session event is appended to an audit log');
  } finally {
    fs.rmSync(stmp, { recursive: true, force: true });
  }

  console.log('\nunsupported framework');
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'lazysitter-vue-'));
  try {
    write(other, 'package.json', JSON.stringify({ name: 'v', dependencies: { vue: '3.4.0' } }));
    // The refusal is printed to stderr, so capture both streams here.
    const vue = require('child_process').spawnSync(process.execPath, [BIN, 'fe-index', 'build', `--dir=${other}`], {
      cwd: other,
      env: { ...process.env, NO_COLOR: '1', LAZYSITTER_NO_UPDATE_CHECK: '1' },
      encoding: 'utf8',
    });
    const vueOut = `${vue.stdout}${vue.stderr}`;
    const vueMeta = JSON.parse(fs.readFileSync(path.join(other, '.lazysitter/index/meta.json'), 'utf8'));
    ok(vueMeta.stack.supported === false, 'marks a Vue repo as unsupported');
    ok(/UNSUPPORTED/.test(vueOut) && /refuses to run here by design/.test(vueOut), 'the CLI states the refusal plainly');
  } finally {
    fs.rmSync(other, { recursive: true, force: true });
  }

  // -------------------------------------------------------------- installer
  console.log('\ninstall --frontend');
  run(['init', tmp, '--frontend'], tmp);
  const agents = fs.readdirSync(path.join(tmp, '.claude/agents')).filter((f) => f.endsWith('.md'));
  ok(agents.length === 41, `41 frontend agents installed (got ${agents.length})`);
  ok(agents.every((f) => f.startsWith('lazysitter-fe-')), 'no general-team agent is installed alongside');
  const skills = fs.readdirSync(path.join(tmp, '.claude/skills'));
  ok(skills.length === 31, `31 skills installed (got ${skills.length})`);
  ok(has(tmp, '.claude/skills/prop-analyzer/SKILL.md'), 'the prop-analyzer skill is installed');
  ok(has(tmp, '.claude/skills/fe-index-query/SKILL.md'), 'the index-query skill is installed');
  ok(has(tmp, '.claude/commands/lsife.md'), 'the /lsife orchestrator is installed');
  ok(!has(tmp, '.claude/commands/lsi.md'), 'the general /lsi command is NOT installed');
  ok(has(tmp, '.claude/lazysitter/lazysitter.fe.config.json'), 'the frontend config is written');
  ok(has(tmp, '.lazysitter/index/.gitignore'), 'the generated index is git-ignored');
  const gi = fs.readFileSync(path.join(tmp, '.lazysitter/index/.gitignore'), 'utf8');
  ok(gi.includes('!.gitignore'), 'the ignore file keeps itself tracked so a fresh clone inherits it');

  const manifest = JSON.parse(fs.readFileSync(path.join(tmp, '.lazysitter/manifest.json'), 'utf8'));
  ok(manifest.teams && manifest.teams.frontend === true && manifest.teams.general === false, 'the manifest records frontend-only');

  console.log('\nteam separation');
  run(['init', tmp, '--frontend', '--general'], tmp);
  const both = fs.readdirSync(path.join(tmp, '.claude/agents')).filter((f) => f.endsWith('.md'));
  ok(both.length === 69, `both teams coexist (got ${both.length} agents)`);
  ok(has(tmp, '.claude/commands/lsi.md') && has(tmp, '.claude/commands/lsife.md'), 'both commands are present');

  const backToFe = run(['init', tmp, '--frontend'], tmp);
  ok(!/pruned .*lazysitter-architect/.test(backToFe), 'installing one team never prunes the other');
  ok(fs.existsSync(path.join(tmp, '.claude/agents/lazysitter-architect.md')), 'the general team survives a frontend-only reinstall');
  const manifest2 = JSON.parse(fs.readFileSync(path.join(tmp, '.lazysitter/manifest.json'), 'utf8'));
  ok(manifest2.teams.general === true, 'the manifest keeps tracking the team left in place');
  ok(manifest2.managed.some((e) => e.path === '.claude/agents/lazysitter-architect.md'), 'the other team stays in the manifest so doctor/uninstall still see it');

  console.log('\nroster integrity');
  const list = run(['list', '--frontend'], tmp);
  ok(/LazySitter frontend roster — 41 agents/.test(list), 'list --frontend prints the FE roster');
  ok(/Skills — 31/.test(list), 'list --frontend prints the skills');
  ok(!/fable/i.test(list), 'no Fable model in the frontend roster');
  const supervisor = fs.readFileSync(path.join(tmp, '.claude/agents/lazysitter-fe-supervisor.md'), 'utf8');
  ok(/QUARANTINE/.test(supervisor) && /cooperative/.test(supervisor), 'the supervisor documents quarantine and is honest about cooperative enforcement');
  const orchestrator = fs.readFileSync(path.join(tmp, '.claude/commands/lsife.md'), 'utf8');
  ok(/index-exhaustive/.test(orchestrator), 'the orchestrator documents the index-exhaustive loop terminator');
  ok(/INTENT-CONTRACT/.test(orchestrator), 'the orchestrator documents the intent-contract supervision mechanism');
  ok(/rounds\.jsonl/.test(orchestrator), 'the orchestrator carries the structured round record');

  console.log('\nuninstall');
  run(['uninstall', tmp, '--purge'], tmp);
  ok(!fs.existsSync(path.join(tmp, '.claude/agents')), 'agents removed');
  ok(!fs.existsSync(path.join(tmp, '.claude/skills')), 'skills removed');
  ok(!fs.existsSync(path.join(tmp, '.lazysitter/index')), 'the generated index is purged');
  ok(fs.existsSync(path.join(tmp, '.lazysitter/knowledge')), 'committed knowledge is kept');
  ok(fs.existsSync(path.join(tmp, 'src/ui/Row.tsx')), 'project files are untouched');

  console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
