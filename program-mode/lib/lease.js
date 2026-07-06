'use strict';

// LEASE — claim/heartbeat/expiry for concurrent sessions (docs/PROGRAM-MODE.md §12).
//
// A session claims a node by writing a lease; other sessions see it's taken and pick a
// different ready node. A crashed session's heartbeat goes stale, the lease expires, and
// the next session reclaims and resumes from the node's last checkpoint. Crash recovery
// and planned handoff are the same mechanism.
//
// All timestamps are injected epoch seconds (from Bash `date`) — never Date.now(), which
// would break deterministic resume. TTL is seconds.

const DEFAULT_TTL = 900; // 15 minutes without a heartbeat → considered dead

function claim(node, session, now, ttl = DEFAULT_TTL) {
  if (typeof now !== 'number') throw new Error('claim: inject numeric `now`');
  if (node.lease && !isExpired(node.lease, now, node.lease.ttl || ttl)) {
    throw new Error(`node ${node.id} already leased by ${node.lease.session}`);
  }
  node.lease = { session, heartbeat: now, ttl };
  return node.lease;
}

function heartbeat(node, session, now) {
  if (!node.lease) throw new Error(`node ${node.id} has no lease to beat`);
  if (node.lease.session !== session) {
    throw new Error(`node ${node.id} leased by ${node.lease.session}, not ${session}`);
  }
  node.lease.heartbeat = now;
  return node.lease;
}

function isExpired(lease, now, ttl = DEFAULT_TTL) {
  if (!lease) return true;
  return now - lease.heartbeat > (lease.ttl || ttl);
}

function release(node) {
  node.lease = null;
  return node;
}

// Reclaim an expired lease for a new session — the crash-recovery path. Returns the new
// lease, or throws if the current lease is still live (someone's actively working it).
function reclaim(node, session, now, ttl = DEFAULT_TTL) {
  if (node.lease && !isExpired(node.lease, now, node.lease.ttl || ttl)) {
    throw new Error(`node ${node.id} lease still live (${node.lease.session})`);
  }
  node.lease = { session, heartbeat: now, ttl };
  return node.lease;
}

module.exports = { DEFAULT_TTL, claim, heartbeat, isExpired, release, reclaim };
