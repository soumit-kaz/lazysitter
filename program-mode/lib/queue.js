'use strict';

// DECISION QUEUE — the async PM membrane (§7). The PM is a non-technical business/client
// boundary, so the queue holds ONLY business decisions: money, vendor, scope, risk, or
// client-gated info. A raw technical question in the queue is a bug — it should have resolved
// below the membrane. Enqueue rejects any non-business type, structurally.
//
// A feature that hits a PM-gated blocker PARKS (its plan node → 'parked') and the scheduler
// moves other independent nodes forward; resolving the item un-parks it. The PM is never a
// per-feature blocking prompt — items batch here and the PM drains them.

const BUSINESS_TYPES = ['money', 'vendor', 'scope', 'risk', 'client-gated'];

function makeQueue() {
  return { items: [] };
}

// Enqueue a decision. Must be pre-packaged in business terms (options + recommendation) so a
// non-technical PM can decide. `type` must be a business type — this is the structural guard
// that keeps tech out of the PM's inbox.
function enqueue(q, item, { now } = {}) {
  if (!BUSINESS_TYPES.includes(item.type)) {
    throw new Error(`queue.enqueue: '${item.type}' is not a business decision — resolve it below the membrane`);
  }
  if (!item.title) throw new Error('queue.enqueue: title required');
  const it = {
    id: item.id || `D${q.items.length + 1}`,
    type: item.type,
    node: item.node || null, // the parked feature awaiting this decision
    title: item.title,
    options: Array.isArray(item.options) ? item.options : [],
    recommendation: item.recommendation || null,
    needsClient: item.type === 'client-gated' || !!item.needsClient, // PM must fetch from client
    status: 'open', // open | resolved
    decision: null,
    createdAt: now,
    resolvedAt: null,
  };
  q.items.push(it);
  return it;
}

function open(q) {
  return q.items.filter((i) => i.status === 'open');
}

// What the PM must take to the client vs. can decide alone (§7 split).
function clientBatch(q) {
  return open(q).filter((i) => i.needsClient);
}

// Resolve an item. Returns the node to un-park (caller flips the plan node back to ready).
function resolve(q, id, decision, { now } = {}) {
  const it = q.items.find((x) => x.id === id);
  if (!it) throw new Error(`queue.resolve: unknown item ${id}`);
  if (it.status === 'resolved') throw new Error(`queue.resolve: ${id} already resolved`);
  it.status = 'resolved';
  it.decision = decision;
  it.resolvedAt = now;
  return it.node;
}

module.exports = { BUSINESS_TYPES, makeQueue, enqueue, open, clientBatch, resolve };
