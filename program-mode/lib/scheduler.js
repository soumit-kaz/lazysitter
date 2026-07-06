'use strict';

// SCHEDULER — the DAG algorithms that turn a PROGRAM-PLAN into parallelism and a
// long-pole estimate (docs/PROGRAM-MODE.md §5). Pure functions over a plan object.
//
// Honest framing: this computes *dependency ordering* and surfaces the long pole.
// It does NOT pretend the critical path is a wall-clock schedule — the real long
// pole is human-gated (PM/client latency), which no graph can predict.

const { allNodes, getNode } = require('./plan');

// A dependency is *satisfied* when the upstream node has reached the required point.
//   on 'contract' → upstream contract frozen, OR upstream done (done implies frozen)
//   on 'merged'   → upstream done
function depSatisfied(plan, dep) {
  const up = getNode(plan, dep.node);
  if (up.status === 'done') return true;
  if (dep.on === 'contract') return up.contract === 'frozen';
  return false;
}

// Detect a dependency cycle. Returns the first cycle found as an array of node ids
// (e.g. ['a','b','a']), or null if the graph is a DAG.
function detectCycle(plan) {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = {};
  const stack = [];
  for (const n of allNodes(plan)) color[n.id] = WHITE;

  function visit(id) {
    color[id] = GRAY;
    stack.push(id);
    for (const d of plan.nodes[id].deps) {
      if (!plan.nodes[d.node]) continue; // missing edges are validate()'s problem
      if (color[d.node] === GRAY) {
        const start = stack.indexOf(d.node);
        return stack.slice(start).concat(d.node);
      }
      if (color[d.node] === WHITE) {
        const found = visit(d.node);
        if (found) return found;
      }
    }
    stack.pop();
    color[id] = BLACK;
    return null;
  }

  for (const n of allNodes(plan)) {
    if (color[n.id] === WHITE) {
      const cyc = visit(n.id);
      if (cyc) return cyc;
    }
  }
  return null;
}

// Topological waves: layer 0 = nodes with no deps; layer k = nodes whose deps are
// all in layers < k. Each wave is a set that *could* run concurrently. Throws on a
// cycle (call detectCycle first for a friendlier message).
function topoWaves(plan) {
  const cyc = detectCycle(plan);
  if (cyc) throw new Error(`cannot layer a cyclic graph: ${cyc.join(' → ')}`);
  const remaining = new Set(allNodes(plan).map((n) => n.id));
  const placed = new Set();
  const waves = [];
  while (remaining.size) {
    const wave = [];
    for (const id of remaining) {
      const deps = plan.nodes[id].deps;
      if (deps.every((d) => placed.has(d.node))) wave.push(id);
    }
    if (!wave.length) throw new Error('scheduler: stuck — likely a cycle or dangling edge');
    wave.sort();
    for (const id of wave) {
      remaining.delete(id);
      placed.add(id);
    }
    waves.push(wave);
  }
  return waves;
}

// Longest weighted path by node cost — the "long pole" whose sum bounds the program.
// Returns { path: [ids], cost }.
function criticalPath(plan) {
  const cyc = detectCycle(plan);
  if (cyc) throw new Error(`cannot compute critical path on a cyclic graph: ${cyc.join(' → ')}`);
  const memo = {}; // id → { cost, next }
  function best(id) {
    if (memo[id]) return memo[id];
    const node = plan.nodes[id];
    let bestChild = null;
    let bestChildCost = 0;
    for (const d of node.deps) {
      const r = best(d.node);
      if (r.cost > bestChildCost) {
        bestChildCost = r.cost;
        bestChild = d.node;
      }
    }
    memo[id] = { cost: node.cost + bestChildCost, next: bestChild };
    return memo[id];
  }
  let head = null;
  let headCost = -1;
  for (const n of allNodes(plan)) {
    const r = best(n.id);
    if (r.cost > headCost) {
      headCost = r.cost;
      head = n.id;
    }
  }
  const path = [];
  let cur = head;
  while (cur) {
    path.push(cur);
    cur = memo[cur].next;
  }
  return { path, cost: headCost };
}

// Nodes eligible to start now: still pending and every dependency satisfied.
function readyNodes(plan) {
  return allNodes(plan)
    .filter((n) => n.status === 'pending')
    .filter((n) => n.deps.every((d) => depSatisfied(plan, d)))
    .map((n) => n.id)
    .sort();
}

// Two nodes are concurrency-safe only if their declared file-sets don't overlap
// (docs/PROGRAM-MODE.md §12: disjoint work only). A node with no declared files is
// treated as potentially-overlapping and never auto-parallelized.
function disjoint(a, b) {
  if (!a.files.length || !b.files.length) return false;
  const set = new Set(a.files);
  return !b.files.some((f) => set.has(f));
}

// Greedily pick up to `k` ready nodes with mutually disjoint file-sets — the set a
// coordinator can safely hand to concurrent sessions this tick.
function pickConcurrent(plan, k = Infinity) {
  const chosen = [];
  for (const id of readyNodes(plan)) {
    const node = plan.nodes[id];
    if (chosen.every((c) => disjoint(plan.nodes[c], node))) {
      chosen.push(id);
      if (chosen.length >= k) break;
    }
  }
  return chosen;
}

module.exports = {
  depSatisfied,
  detectCycle,
  topoWaves,
  criticalPath,
  readyNodes,
  disjoint,
  pickConcurrent,
};
