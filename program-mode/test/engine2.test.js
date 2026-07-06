'use strict';

// Tests for the Phase 4–10 engine layers: registry, decision queue, traceability, librarian,
// fault-injection, coordinator, and real gate commands. Run: node program-mode/test/engine2.test.js

const {
  plan, gates, gatecmds, memory, librarian, registry, queue, trace, faultinject, coordinator,
} = require('../index');

let failures = 0;
function ok(cond, msg) {
  if (cond) console.log(`  ok   ${msg}`);
  else {
    console.log(`  FAIL ${msg}`);
    failures++;
  }
}
function throws(fn, msg) {
  try {
    fn();
    console.log(`  FAIL ${msg} (expected throw)`);
    failures++;
  } catch {
    console.log(`  ok   ${msg}`);
  }
}
const NOW = 1_700_000_000;

// ── registry: discovery-before-creation + graduation ─────────────────────────
console.log('registry');
{
  const reg = registry.makeRegistry();
  registry.add(reg, { kind: 'ruling', domain: 'supabase', triggers: ['supabase-rls'], text: 'enable RLS on every table' }, { now: NOW });
  registry.add(reg, { kind: 'ruling', domain: 'aws', triggers: ['aws-lambda'], text: 'set a concurrency cap' }, { now: NOW });

  const found = registry.discover(reg, { triggers: ['supabase-rls'] });
  ok(found.length === 1 && found[0].domain === 'supabase', 'discover finds the matching ruling (reuse, don\'t re-summon)');
  ok(registry.discover(reg, { triggers: ['kafka'] }).length === 0, 'no match → genuinely new, proceed to create');

  const rls = found[0];
  registry.markApplied(reg, rls.id);
  registry.markApplied(reg, rls.id);
  ok(registry.graduationCandidates(reg).some((e) => e.id === rls.id), 'ruling applied ≥2× is a graduation candidate');
  const pb = registry.graduate(reg, rls.id, { now: NOW });
  ok(pb.kind === 'playbook' && /graduated from/.test(pb.text), 'ruling graduates into a playbook');
  ok(reg.entries.find((e) => e.id === rls.id).status === 'graduated', 'the ruling leaves the active summon path');
}

// ── decision queue: business-only, parking, client batch ─────────────────────
console.log('queue');
{
  const q = queue.makeQueue();
  throws(() => queue.enqueue(q, { type: 'schema-design', title: 'denormalize?' }, { now: NOW }), 'raw technical item rejected from PM queue');
  queue.enqueue(q, { type: 'money', title: 'DynamoDB is $4k/mo vs $400', options: ['A', 'B'], recommendation: 'B', node: 'orders' }, { now: NOW });
  queue.enqueue(q, { type: 'client-gated', title: 'need prod Stripe account', node: 'checkout' }, { now: NOW });

  ok(queue.open(q).length === 2, 'two open decisions');
  ok(queue.clientBatch(q).length === 1, 'one item needs the client (batched separately)');

  const node = queue.resolve(q, 'D1', 'go with B', { now: NOW });
  ok(node === 'orders', 'resolving returns the parked node to un-park');
  ok(queue.open(q).length === 1, 'resolved item leaves the open set');
}

// ── traceability: coverage gap, scope creep, must-req gate ───────────────────
console.log('trace');
{
  const t = trace.makeTrace();
  throws(() => trace.addRequirement(t, { id: 'R1' }), 'requirement without a BRD source rejected');
  trace.addRequirement(t, { id: 'R1', source: 'BRD-§4.1', must: true });
  trace.addRequirement(t, { id: 'R2', source: 'BRD-§4.2', must: true });
  trace.addFeature(t, { id: 'F1', requirement: 'R1' });
  trace.addFeature(t, { id: 'F-rogue' }); // no requirement → scope creep

  ok(trace.coverage(t).join() === 'R2', 'R2 is an uncovered must-requirement (gap)');
  ok(trace.scopeCreep(t).join() === 'F-rogue', 'F-rogue flagged as scope creep');

  trace.addFeature(t, { id: 'F2', requirement: 'R2' });
  trace.addTest(t, { id: 'T1', requirement: 'R1', verdict: 'green' });
  trace.addTest(t, { id: 'T2', requirement: 'R2', verdict: 'red' });
  let problems = trace.gate(t);
  ok(problems.some((p) => /R2 has no green test/.test(p)), 'gate BLOCKS: R2 tested but red');
  ok(problems.some((p) => /F-rogue/.test(p)), 'gate still flags the scope-creep feature');

  trace.setVerdict(t, 'T2', 'green');
  trace.addFeature(t, { id: 'F-rogue', requirement: 'R2' }); // adopt it
  ok(trace.gate(t).length === 0, 'gate clean once every must-req is implemented + green and nothing is orphaned');
}

// ── librarian: merge, retire-stale, prune-noisy, metrics ─────────────────────
console.log('librarian');
{
  const store = memory.makeStore();
  const a = memory.capture(store, { text: 'dup lesson', situation: ['x'], severity: 3 }, { now: NOW });
  a.reviewBy = NOW + 100;
  // a second active row with the same key but a different id (simulates a slip)
  store.lessons.push({ id: 'DUP', key: 'dup lesson', text: 'dup lesson', situation: [], producer: [], severity: 3, hits: 2, caught: 0, status: 'active', alwaysOn: false, lastSeen: NOW });
  memory.capture(store, { text: 'stale lesson', severity: 2, reviewBy: NOW - 1 }, { now: NOW });
  const noisy = memory.capture(store, { text: 'noisy lesson', situation: ['y'], severity: 2 }, { now: NOW });
  noisy._injected = 20; noisy.caught = 0;

  const rep = librarian.consolidate(store, { now: NOW + 200, minInjections: 10 });
  ok(rep.merged === 1, 'duplicate merged');
  ok(rep.stale >= 1, 'stale (past review-by) lesson retired');
  ok(rep.pruned === 1, 'noisy lesson pruned');
  ok(rep.metrics.retired >= 3, 'metrics count the retirements');
  ok(typeof rep.metrics.hotSet === 'number', 'metrics report hot-set size (should plateau over time)');
}

// ── fault injection: measure gate coverage, expose blind spots ───────────────
console.log('faultinject');
{
  const ladder = gates.ladder();
  const defects = [
    { id: 'leaked-key', expectGate: 'secrets' },
    { id: 'unused-export', expectGate: 'dead-code' },
    { id: 'type-error', expectGate: 'typecheck-build' },
    { id: 'sql-injection', expectGate: 'taint-analysis' }, // no such gate → a blind spot
  ];
  const cov = faultinject.measureCoverage(ladder, defects);
  ok(cov.caught === 3, 'the three defects with a matching gate are caught');
  ok(Math.abs(cov.rate - 0.75) < 1e-9, 'coverage rate is 3/4 = 0.75 (measurable, not faith)');
  ok(cov.uncovered.join() === 'sql-injection', 'the uncovered defect class is surfaced as a blind spot');
}

// ── coordinator: disjoint assignment + crash reconcile ───────────────────────
console.log('coordinator');
{
  const p = plan.createPlan({ now: NOW });
  plan.addNode(p, { id: 'a', files: ['src/a.js'] });
  plan.addNode(p, { id: 'b', files: ['src/b.js'] });
  plan.addNode(p, { id: 'c', files: ['src/a.js'] }); // overlaps a

  const first = coordinator.assign(p, ['s1', 's2'], { now: NOW, ttl: 900 });
  ok(first.length === 2, 'two disjoint nodes assigned to two sessions');
  ok(new Set(first.map((x) => x.node)).size === 2, 'no node assigned twice');
  ok(p.nodes[first[0].node].lease, 'assigned nodes are leased');

  // a third session gets nothing safe (c overlaps a, b taken)
  const second = coordinator.assign(p, ['s3'], { now: NOW + 10, ttl: 900 });
  ok(second.length === 0, 's3 idles — no disjoint work available (safety over utilization)');

  // s1 crashes: its lease goes stale, coordinator reconciles and reassigns
  const freed = coordinator.reconcile(p, { now: NOW + 10 + 901, ttl: 900 });
  ok(freed.length >= 1, 'expired lease(s) reclaimed on the crash-recovery path');
}

// ── real gate commands: JS-native secrets scan + degraded external tool ───────
console.log('gatecmds');
{
  ok(gatecmds.scanSecrets('const k = "AKIA1234567890ABCDEF";').length === 1, 'AWS access key detected');
  ok(gatecmds.scanSecrets('-----BEGIN RSA PRIVATE KEY-----').length === 1, 'private key block detected');
  ok(gatecmds.scanSecrets('const name = "harmless string value";').length === 0, 'clean code → no false positive');

  const clean = gates.runLadder(
    gates.ladder(),
    { diffText: 'export function add(a,b){return a+b}' },
    gatecmds.makeExec({ spawn: () => ({ code: 0 }) }) // stub external tools as clean
  );
  ok(clean.verdict === 'PASS', 'clean diff passes the real ladder (secrets JS-native, externals stubbed clean)');

  const leaky = gates.runLadder(
    gates.ladder(),
    { diffText: 'const t = "ghp_012345678901234567890123456789012345";' },
    gatecmds.makeExec({ spawn: () => ({ code: 0 }) })
  );
  ok(leaky.verdict === 'BLOCK' && leaky.blockedBy === 'secrets', 'real secrets gate blocks a leaked GitHub token');

  // a missing external tool degrades (→ BLOCK), never silently passes
  const degraded = gates.runLadder(
    [{ id: 'lint', cost: 2, cmd: 'lazysitter-gate-lint', blocking: true }],
    { diffText: '' },
    gatecmds.makeExec({ spawn: () => ({ degraded: true, evidence: 'eslint not installed' }) })
  );
  ok(degraded.verdict === 'BLOCK', 'a missing tool degrades to BLOCK (unverified ≠ passed)');
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
