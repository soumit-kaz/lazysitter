'use strict';

// Runnable demonstration of the Program Mode engine. Run: node program-mode/demo.js
// Builds a small program the way the Program Office would after BRD intake, then shows
// the scheduler's waves + long pole, contract-first unblocking, and a gate-ladder run.
// Pure deterministic core — no LLM, no tokens, injected clock.

const { plan, scheduler, gates, memory } = require('./index');

const NOW = 1_700_000_000;
const line = (s = '') => console.log(s);
const h = (s) => line(`\n\x1b[1m${s}\x1b[0m`);

// ── 1. A program graph (what BRD intake → DAG produces) ───────────────────────
const p = plan.createPlan({ now: NOW });
[
  ['schema', 4, ['db/schema.sql']],
  ['auth', 5, ['src/auth/*']],
  ['api-orders', 3, ['src/api/orders.js']],
  ['api-search', 3, ['src/api/search.js']],
  ['ui-checkout', 2, ['src/ui/checkout.jsx']],
].forEach(([id, cost, files]) => plan.addNode(p, { id, cost, files }));

plan.addDep(p, 'api-orders', 'schema', 'contract'); // can start on frozen schema contract
plan.addDep(p, 'api-search', 'schema', 'contract');
plan.addDep(p, 'ui-checkout', 'api-orders', 'merged'); // needs orders API merged
plan.addDep(p, 'ui-checkout', 'auth', 'merged');

h('Program graph');
line(`  ${plan.allNodes(p).length} nodes, ${plan.allNodes(p).reduce((n, x) => n + x.deps.length, 0)} edges`);
line(`  structural problems: ${plan.validate(p).length}`);
line(`  cycle: ${scheduler.detectCycle(p) || 'none'}`);

// ── 2. Parallelism waves + the long pole ──────────────────────────────────────
h('Execution waves (what can run concurrently)');
scheduler.topoWaves(p).forEach((w, i) => line(`  wave ${i}: ${w.join(', ')}`));

const cp = scheduler.criticalPath(p);
h('Critical path (the long pole — dependency ordering, not a wall-clock promise)');
line(`  ${cp.path.join(' → ')}   (cost ${cp.cost})`);

// ── 3. Contract-first unblocking (real parallelism, §5) ───────────────────────
h('Contract-first scheduling');
line(`  ready now: ${scheduler.readyNodes(p).join(', ')}`);
line('  → freezing schema\'s interface contract (before it is merged)…');
plan.freezeContract(p, 'schema', { now: NOW });
line(`  ready now: ${scheduler.readyNodes(p).join(', ')}   ← APIs unblocked early`);
line(`  concurrency-safe set this tick: ${scheduler.pickConcurrent(p).join(', ')} (disjoint files)`);

// ── 4. The fail-fast gate ladder (§8) ─────────────────────────────────────────
h('Gate ladder on a feature diff (deterministic, ~0 tokens)');
const cleanExec = () => ({ code: 0 });
line(`  clean diff  → ${gates.runLadder(gates.ladder(), {}, cleanExec).verdict}`);
const leakyExec = (cmd) => ({ code: cmd.includes('secrets') ? 1 : 0 });
const blocked = gates.runLadder(gates.ladder(), {}, leakyExec);
line(`  leaked key  → ${blocked.verdict}  (blocked by: ${blocked.blockedBy}; later gates never ran — fail-fast)`);

// ── 5. Institutional memory (§10) ─────────────────────────────────────────────
h('Institutional memory — targeted, bounded injection');
const mem = memory.makeStore();
memory.capture(mem, { text: 'orders API missed idempotency', situation: ['orders', 'payments'], producer: ['backend-implementer'], severity: 4 }, { now: NOW });
memory.capture(mem, { text: 'NEVER log secrets', alwaysOn: true, severity: 5 }, { now: NOW });
for (let i = 0; i < 2000; i++) memory.capture(mem, { text: `noise ${i}`, situation: ['misc'], severity: 1 }, { now: NOW });
const brief = memory.retrieve(mem, { situation: ['orders'], producer: ['backend-implementer'], k: 5, now: NOW });
line(`  base size: ${mem.lessons.length} lessons`);
line(`  injected for an orders/backend task: ${brief.length}  (top-K + always-on, O(K))`);
brief.forEach((l) => line(`    • ${l.text}${l.alwaysOn ? '  [always-on]' : ''}`));

h('This is the deterministic spine the Program-Office orchestrator drives.');
line('See docs/PROGRAM-MODE.md for the full architecture and phased rollout.\n');
