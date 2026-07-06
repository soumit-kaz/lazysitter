'use strict';

// PROGRAM-PLAN — the durable DAG state model for LazySitter Program Mode.
//
// A plan is a plain JSON-serializable object (state on disk is the truth; see
// docs/PROGRAM-MODE.md §12). Every mutator is a pure-ish function that validates
// before it writes, so a corrupt transition throws instead of silently poisoning
// the substrate. No wall-clock is read here — callers inject `now` (epoch seconds
// from Bash `date`), because Program Mode must be resumable and Date.now() breaks
// deterministic replay.

const NODE_TYPES = ['feature', 'foundation', 'consultation'];

// Lifecycle: pending → ready → claimed → in-progress → (done | failed | parked | blocked)
// parked/blocked can return to ready; a failed node can be retried back to ready.
const STATUSES = [
  'pending',
  'ready',
  'claimed',
  'in-progress',
  'blocked',
  'parked',
  'done',
  'failed',
];

const TRANSITIONS = {
  pending: ['ready', 'blocked'],
  ready: ['claimed', 'blocked', 'parked'],
  claimed: ['in-progress', 'ready', 'parked'], // ready = lease released/expired
  'in-progress': ['done', 'failed', 'parked', 'blocked'],
  blocked: ['ready', 'parked'],
  parked: ['ready', 'blocked'],
  failed: ['ready'], // retry
  done: [], // terminal
};

// A dependency edge: this node may start once `node` reaches `on`.
//   on: 'contract' → the dep's interface contract is frozen (or the dep is done)
//   on: 'merged'   → the dep is fully done
const DEP_ON = ['contract', 'merged'];

function createPlan({ now } = {}) {
  if (typeof now !== 'number') throw new Error('createPlan: inject numeric `now` (epoch seconds)');
  return { version: 1, createdAt: now, updatedAt: now, nodes: {} };
}

function getNode(plan, id) {
  const n = plan.nodes[id];
  if (!n) throw new Error(`unknown node: ${id}`);
  return n;
}

function allNodes(plan) {
  return Object.values(plan.nodes);
}

function addNode(plan, node) {
  if (!node || !node.id) throw new Error('addNode: node.id is required');
  if (plan.nodes[node.id]) throw new Error(`addNode: duplicate node id ${node.id}`);
  const type = node.type || 'feature';
  if (!NODE_TYPES.includes(type)) throw new Error(`addNode: bad type ${type}`);
  plan.nodes[node.id] = {
    id: node.id,
    title: node.title || node.id,
    type,
    status: 'pending',
    deps: [],
    files: Array.isArray(node.files) ? node.files.slice() : [],
    contract: null, // null | 'frozen'
    lease: null,
    checkpoint: null, // last completed tier, for resume
    cost: typeof node.cost === 'number' ? node.cost : 1, // triage weight
  };
  return plan.nodes[node.id];
}

function addDep(plan, from, to, on = 'merged') {
  const node = getNode(plan, from);
  getNode(plan, to); // asserts target exists
  if (from === to) throw new Error(`addDep: self-dependency on ${from}`);
  if (!DEP_ON.includes(on)) throw new Error(`addDep: bad edge kind ${on}`);
  if (!node.deps.some((d) => d.node === to && d.on === on)) node.deps.push({ node: to, on });
  return node;
}

function setStatus(plan, id, status, { now } = {}) {
  const node = getNode(plan, id);
  if (!STATUSES.includes(status)) throw new Error(`setStatus: unknown status ${status}`);
  if (node.status === status) return node;
  const allowed = TRANSITIONS[node.status] || [];
  if (!allowed.includes(status)) {
    throw new Error(`illegal transition ${node.status} → ${status} for ${id}`);
  }
  node.status = status;
  if (typeof now === 'number') plan.updatedAt = now;
  return node;
}

// Freeze a node's interface contract — this is what unblocks downstream `on:'contract'`
// dependants BEFORE the node itself is merged (docs/PROGRAM-MODE.md §5).
function freezeContract(plan, id, { now } = {}) {
  const node = getNode(plan, id);
  node.contract = 'frozen';
  if (typeof now === 'number') plan.updatedAt = now;
  return node;
}

// A checkpoint records the last tier a node completed, so a resumed session skips
// finished tiers rather than restarting (docs/PROGRAM-MODE.md §12).
function checkpoint(plan, id, tier, { now } = {}) {
  const node = getNode(plan, id);
  node.checkpoint = tier;
  if (typeof now === 'number') plan.updatedAt = now;
  return node;
}

// Structural validation: every dep points at a real node, and there is no cycle.
// Cycle detection lives in scheduler.js to keep graph algorithms in one place.
function validate(plan) {
  const problems = [];
  for (const node of allNodes(plan)) {
    for (const d of node.deps) {
      if (!plan.nodes[d.node]) problems.push(`${node.id} depends on missing node ${d.node}`);
    }
  }
  return problems;
}

module.exports = {
  NODE_TYPES,
  STATUSES,
  TRANSITIONS,
  DEP_ON,
  createPlan,
  getNode,
  allNodes,
  addNode,
  addDep,
  setStatus,
  freezeContract,
  checkpoint,
  validate,
};
