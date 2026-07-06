'use strict';

// REGISTRY — the trigger-indexed store shared by specialist rulings/playbooks (§6) and the
// self-built tool registry (§11). One mechanism, because both obey the same rules:
// discovery-before-creation, retrieval-by-trigger, and graduation (a ruling applied ≥2×
// becomes a standing playbook; a recurring bit of work becomes a durable tool).
//
// Deterministic; inject `now` (epoch seconds).

function makeRegistry() {
  return { entries: [] };
}

function add(reg, entry, { now } = {}) {
  if (!entry || !entry.kind) throw new Error('registry.add: entry.kind required (ruling|playbook|tool)');
  const e = {
    id: entry.id || `${entry.kind[0].toUpperCase()}${reg.entries.length + 1}`,
    kind: entry.kind, // 'ruling' | 'playbook' | 'tool'
    domain: entry.domain || null, // e.g. 'supabase', 'aws', 'payments'
    triggers: Array.isArray(entry.triggers) ? entry.triggers : [],
    text: entry.text || '',
    owner: entry.owner || null,
    status: 'active', // active | graduated | retired
    applied: 0, // how many times reused — the graduation signal
    createdAt: now,
  };
  reg.entries.push(e);
  return e;
}

// Discovery-before-creation: before summoning a specialist or building a tool, search here.
// Returns active entries whose triggers overlap the query, best-match first. An empty result
// means "genuinely new — proceed to create"; a hit means "reuse, don't rebuild".
function discover(reg, { triggers = [], kind = null } = {}) {
  const q = new Set(triggers);
  return reg.entries
    .filter((e) => e.status === 'active' && (!kind || e.kind === kind))
    .map((e) => ({ e, overlap: e.triggers.filter((t) => q.has(t)).length }))
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || b.e.applied - a.e.applied)
    .map((x) => x.e);
}

// Record a reuse. The count is the graduation signal (a ruling reused twice should become a
// playbook so you stop summoning the specialist).
function markApplied(reg, id) {
  const e = reg.entries.find((x) => x.id === id);
  if (e) e.applied += 1;
  return e;
}

function graduationCandidates(reg) {
  return reg.entries.filter((e) => e.status === 'active' && e.kind === 'ruling' && e.applied >= 2);
}

// Graduate a ruling into a standing playbook: mark the ruling graduated (it leaves the
// summon-a-specialist path) and mint a derived playbook entry that carries the guidance forward.
function graduate(reg, id, { now } = {}) {
  const ruling = reg.entries.find((x) => x.id === id);
  if (!ruling || ruling.kind !== 'ruling') throw new Error(`graduate: ${id} is not an active ruling`);
  ruling.status = 'graduated';
  return add(reg, {
    kind: 'playbook',
    domain: ruling.domain,
    triggers: ruling.triggers,
    text: `[graduated from ${ruling.id}] ${ruling.text}`,
    owner: ruling.owner,
  }, { now });
}

function retire(reg, id) {
  const e = reg.entries.find((x) => x.id === id);
  if (e) e.status = 'retired';
  return e;
}

module.exports = { makeRegistry, add, discover, markApplied, graduationCandidates, graduate, retire };
