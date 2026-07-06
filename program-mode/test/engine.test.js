'use strict';

// Zero-dependency tests for the Program Mode engine. Run: node program-mode/test/engine.test.js
// Proves the deterministic core actually holds its invariants — the blueprint's #1 rule
// is "prove it before believing any scale claim" (docs/PROGRAM-MODE.md §15).

const { plan, scheduler, gates, memory, lease } = require('../index');

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

const NOW = 1_700_000_000; // fixed injected clock — no Date.now() anywhere

// ── plan: model + transitions ────────────────────────────────────────────────
console.log('plan');
{
  const p = plan.createPlan({ now: NOW });
  plan.addNode(p, { id: 'schema', cost: 3 });
  plan.addNode(p, { id: 'api', cost: 2 });
  plan.addNode(p, { id: 'ui', cost: 2 });
  plan.addDep(p, 'api', 'schema', 'contract'); // api can start on schema's frozen contract
  plan.addDep(p, 'ui', 'api', 'merged'); // ui needs api fully merged

  ok(plan.allNodes(p).length === 3, 'three nodes added');
  ok(p.nodes.api.deps.length === 1, 'api has one dep');
  ok(plan.validate(p).length === 0, 'valid plan has no structural problems');

  throws(() => plan.addNode(p, { id: 'api' }), 'duplicate node id rejected');
  throws(() => plan.addDep(p, 'api', 'api'), 'self-dependency rejected');
  throws(() => plan.addDep(p, 'api', 'ghost'), 'edge to missing node rejected');

  plan.setStatus(p, 'schema', 'ready', { now: NOW });
  plan.setStatus(p, 'schema', 'claimed', { now: NOW });
  throws(() => plan.setStatus(p, 'schema', 'done', { now: NOW }), 'illegal transition claimed→done rejected');

  const dangling = plan.createPlan({ now: NOW });
  plan.addNode(dangling, { id: 'a' });
  dangling.nodes.a.deps.push({ node: 'nope', on: 'merged' });
  ok(plan.validate(dangling).length === 1, 'validate catches dangling edge');
}

// ── scheduler: cycles, waves, critical path, contract-first readiness ─────────
console.log('scheduler');
{
  const p = plan.createPlan({ now: NOW });
  ['schema', 'api', 'ui', 'auth'].forEach((id, i) => plan.addNode(p, { id, cost: [3, 2, 2, 4][i] }));
  plan.addDep(p, 'api', 'schema', 'contract');
  plan.addDep(p, 'ui', 'api', 'merged');
  plan.addDep(p, 'ui', 'auth', 'merged');

  ok(scheduler.detectCycle(p) === null, 'acyclic graph reports no cycle');

  const waves = scheduler.topoWaves(p);
  ok(waves[0].join(',') === 'auth,schema', 'wave 0 = the two roots (sorted)');
  ok(waves[1].join(',') === 'api', 'wave 1 = api');
  ok(waves[2].join(',') === 'ui', 'wave 2 = ui');

  const cp = scheduler.criticalPath(p);
  // longest weighted path: ui(2)->auth(4) = 6  vs  ui(2)->api(2)->schema(3) = 7
  ok(cp.cost === 7, `critical path cost is 7 (got ${cp.cost})`);
  ok(cp.path.join('→') === 'ui→api→schema', `critical path is ui→api→schema (got ${cp.path.join('→')})`);

  // contract-first: api becomes ready when schema's CONTRACT freezes, before schema is done
  ok(scheduler.readyNodes(p).sort().join(',') === 'auth,schema', 'initially only roots are ready');
  plan.freezeContract(p, 'schema', { now: NOW });
  ok(scheduler.readyNodes(p).includes('api'), 'api ready once schema contract frozen (not merged!)');
  ok(!scheduler.readyNodes(p).includes('ui'), 'ui still blocked (needs api MERGED, not contract)');

  // cycle detection + rejection
  const cyc = plan.createPlan({ now: NOW });
  ['x', 'y', 'z'].forEach((id) => plan.addNode(cyc, { id }));
  plan.addDep(cyc, 'x', 'y');
  plan.addDep(cyc, 'y', 'z');
  plan.addDep(cyc, 'z', 'x');
  ok(scheduler.detectCycle(cyc) !== null, 'cycle detected');
  throws(() => scheduler.topoWaves(cyc), 'topoWaves throws on cycle');
}

// ── scheduler: concurrency safety via disjoint file-sets ──────────────────────
console.log('concurrency');
{
  const p = plan.createPlan({ now: NOW });
  plan.addNode(p, { id: 'a', files: ['src/a.js', 'src/shared.js'] });
  plan.addNode(p, { id: 'b', files: ['src/b.js'] });
  plan.addNode(p, { id: 'c', files: ['src/shared.js', 'src/c.js'] }); // overlaps a
  plan.addNode(p, { id: 'd', files: [] }); // undeclared → never auto-parallelized

  const picked = scheduler.pickConcurrent(p);
  ok(picked.includes('a') && picked.includes('b'), 'a and b (disjoint) both picked');
  ok(!picked.includes('c'), 'c excluded (file overlap with a)');
  ok(!picked.includes('d'), 'd excluded (no declared file-set)');
  ok(scheduler.pickConcurrent(p, 1).length === 1, 'k caps the concurrent set');
}

// ── gates: fail-fast ladder + degraded ≠ pass ─────────────────────────────────
console.log('gates');
{
  const ran = [];
  const passAll = (cmd) => {
    ran.push(cmd);
    return { code: 0 };
  };
  const cleanRun = gates.runLadder(gates.ladder(), {}, passAll);
  ok(cleanRun.verdict === 'PASS', 'all gates pass → PASS');
  ok(ran.length === 4, 'all four default gates ran on a clean tree');

  // secrets (cheapest) fails → ladder short-circuits, later gates never run
  ran.length = 0;
  const failFirst = (cmd) => {
    ran.push(cmd);
    return { code: cmd.includes('secrets') ? 1 : 0 };
  };
  const blocked = gates.runLadder(gates.ladder(), {}, failFirst);
  ok(blocked.verdict === 'BLOCK', 'a failing gate → BLOCK');
  ok(blocked.blockedBy === 'secrets', 'blocked by the secrets gate');
  ok(ran.length === 1, 'fail-fast: only the cheapest gate ran before short-circuit');

  // a degraded (un-runnable) gate is NOT a pass
  const degraded = gates.runLadder(gates.ladder(), {}, () => ({ degraded: true }));
  ok(degraded.verdict === 'BLOCK', 'degraded gate blocks (unverified ≠ passed)');

  const rendered = gates.renderVerdict(blocked);
  ok(/```lsi-verdict/.test(rendered) && /verdict: BLOCK/.test(rendered), 'renders an lsi-verdict block');
}

// ── memory: dedup, O(K) retrieval, two-axis targeting, graduation ─────────────
console.log('memory');
{
  const store = memory.makeStore();
  memory.capture(store, { text: 'forgot idempotency key', situation: ['payments'], producer: ['backend-implementer'], severity: 4 }, { now: NOW });
  memory.capture(store, { text: 'forgot idempotency key', situation: ['payments'], producer: ['backend-implementer'] }, { now: NOW });
  ok(store.lessons.length === 1 && store.lessons[0].hits === 2, 'duplicate capture increments hits, no new row');

  memory.capture(store, { text: 'missing RLS policy', situation: ['supabase-rls'], producer: ['backend-implementer'], severity: 5 }, { now: NOW });
  memory.capture(store, { text: 'unlabeled chart axis', situation: ['charts'], producer: ['frontend-implementer'], severity: 2 }, { now: NOW });
  memory.capture(store, { text: 'NEVER log secrets', situation: [], producer: [], severity: 5, alwaysOn: true }, { now: NOW });

  // two-axis retrieval: a payments+backend task surfaces the relevant lessons, not the chart one
  const hits = memory.retrieve(store, { situation: ['payments'], producer: ['backend-implementer'], k: 6, now: NOW });
  const texts = hits.map((l) => l.text);
  ok(texts.includes('forgot idempotency key'), 'relevant lesson retrieved by situation×producer');
  ok(texts.includes('NEVER log secrets'), 'always-on lesson injected regardless of trigger');
  ok(!texts.includes('unlabeled chart axis'), 'irrelevant (non-matching) lesson NOT injected');

  // O(K): a huge base still injects a bounded set
  for (let i = 0; i < 5000; i++) {
    memory.capture(store, { text: `noise ${i}`, situation: ['payments'], producer: ['backend-implementer'], severity: 1 }, { now: NOW });
  }
  const bounded = memory.retrieve(store, { situation: ['payments'], producer: ['backend-implementer'], k: 6, now: NOW });
  ok(bounded.length <= 6 + 1, 'retrieval stays bounded (top-K + always-on) despite a 5000-lesson base');

  // per-producer pre-brief
  const brief = memory.preBrief(store, 'frontend-implementer', { k: 5, now: NOW });
  ok(brief.some((l) => l.text === 'unlabeled chart axis'), 'pre-brief surfaces the producer\'s own fault');

  // graduation removes a lesson from injection
  const cands = memory.graduationCandidates(store);
  ok(cands.some((l) => l.text === 'forgot idempotency key'), 'recurring fault (hits≥2) is a graduation candidate');
  ok(cands.some((l) => l.text === 'missing RLS policy'), 'high-severity fault is a graduation candidate');
  const inSet = (q) => memory.retrieve(store, { situation: ['supabase-rls'], producer: ['backend-implementer'], k: 6, now: NOW }).some((l) => l.text === q);
  ok(inSet('missing RLS policy'), 'high-severity lesson is injected before graduation');
  memory.markGraduated(store, store.lessons.find((l) => l.text === 'missing RLS policy').id);
  ok(!inSet('missing RLS policy'), 'graduated lesson leaves the injection set (compiled out of text)');
}

// ── lease: claim, expiry, crash-reclaim ───────────────────────────────────────
console.log('lease');
{
  const node = { id: 'feat', lease: null };
  lease.claim(node, 'sessionA', NOW, 900);
  ok(node.lease.session === 'sessionA', 'node claimed by session A');
  throws(() => lease.claim(node, 'sessionB', NOW + 10, 900), 'live lease blocks a second claimant');

  ok(!lease.isExpired(node.lease, NOW + 100, 900), 'fresh lease not expired');
  lease.heartbeat(node, 'sessionA', NOW + 100);
  ok(node.lease.heartbeat === NOW + 100, 'heartbeat advances the lease');
  throws(() => lease.heartbeat(node, 'sessionB', NOW + 120), 'non-owner cannot heartbeat');

  ok(lease.isExpired(node.lease, NOW + 100 + 901, 900), 'stale lease expires past TTL');
  const released = lease.reclaim(node, 'sessionB', NOW + 100 + 902, 900); // crash of A
  ok(released.session === 'sessionB', 'expired lease reclaimed by a new session (crash recovery)');
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
