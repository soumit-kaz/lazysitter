'use strict';

// COORDINATOR — assigns disjoint ready nodes to concurrent worker sessions (§12). The
// coordinator owns the plan; workers claim, build in isolated worktrees, and merge serially.
// This is the deferred-but-buildable concurrency layer: the assignment + crash-reconcile logic
// is deterministic (inject `now`); the actual worktrees/merge order live in the orchestrator.
//
// Safety rule enforced here: never hand two sessions overlapping file-sets, and never assign a
// node that's already live-leased. A worker that can't reach the coordinator blocks — this
// module never invents an assignment it can't back with a lease.

const { readyNodes, disjoint } = require('./scheduler');
const lease = require('./lease');

// Release leases whose heartbeat has gone stale (a crashed/ended session). The freed node
// returns to selectable, and a future assign() re-hands it — resuming from its checkpoint.
function reconcile(plan, { now, ttl = lease.DEFAULT_TTL } = {}) {
  const freed = [];
  for (const node of Object.values(plan.nodes)) {
    if (node.lease && lease.isExpired(node.lease, now, node.lease.ttl || ttl)) {
      lease.release(node);
      freed.push(node.id);
    }
  }
  return freed;
}

// Assign work to free sessions this tick. `sessions` = list of session ids. Returns
// [{ session, node }]. Picks ready nodes that are unleased and mutually disjoint (and disjoint
// from nodes leased by others), claiming each so no two sessions collide.
function assign(plan, sessions, { now, ttl = lease.DEFAULT_TTL } = {}) {
  reconcile(plan, { now, ttl });
  const assignments = [];
  const leasedNodes = Object.values(plan.nodes).filter((n) => n.lease);
  const taken = leasedNodes.slice(); // nodes we must stay disjoint from
  const ready = readyNodes(plan).map((id) => plan.nodes[id]).filter((n) => !n.lease);

  for (const session of sessions) {
    const pick = ready.find(
      (n) => !assignments.some((a) => a.node === n.id) && taken.every((t) => disjoint(t, n))
    );
    if (!pick) continue; // this session idles this tick — no safe disjoint work
    lease.claim(pick, session, now, ttl);
    taken.push(pick);
    assignments.push({ session, node: pick.id });
  }
  return assignments;
}

module.exports = { reconcile, assign };
