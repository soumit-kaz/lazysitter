'use strict';

// LIBRARIAN — the consolidation pass that keeps institutional memory from rotting (§10).
// Runs at milestones (amortized), not per feature. Without it a knowledge base only grows and
// eventually lies. Operates on a memory store (see memory.js).

const memory = require('./memory');

function keyOf(l) {
  return (l.key || l.text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Merge active duplicates that slipped in with different ids: keep the earliest, sum hits.
function mergeDuplicates(store) {
  const byKey = new Map();
  let merged = 0;
  for (const l of store.lessons) {
    if (l.status !== 'active') continue;
    const k = keyOf(l);
    if (byKey.has(k)) {
      const keep = byKey.get(k);
      keep.hits += l.hits;
      keep.caught += l.caught || 0;
      l.status = 'retired';
      merged++;
    } else byKey.set(k, l);
  }
  return merged;
}

// Retire lessons past their review-by date — forgetting is a feature.
function retireStale(store, { now }) {
  let retired = 0;
  for (const l of store.lessons) {
    if (l.status === 'active' && l.reviewBy && now > l.reviewBy) {
      l.status = 'retired';
      retired++;
    }
  }
  return retired;
}

// Retire noisy lessons — injected often, never caught anything. Pattern noise, not wisdom.
function pruneNoisy(store, opts = {}) {
  const noisy = memory.noisy(store, opts);
  noisy.forEach((l) => (l.status = 'retired'));
  return noisy.length;
}

// The full milestone pass. Returns a report the Program Office surfaces.
function consolidate(store, { now, minInjections = 10 } = {}) {
  const merged = mergeDuplicates(store);
  const stale = retireStale(store, { now });
  const pruned = pruneNoisy(store, { minInjections });
  const candidates = memory.graduationCandidates(store).map((l) => l.id);
  return { merged, stale, pruned, graduationCandidates: candidates, metrics: metrics(store) };
}

// Health metrics — the success signals from §17. A healthy base has a plateauing hot set and a
// rising graduated count (experience compiling out of text).
function metrics(store) {
  const by = (s) => store.lessons.filter((l) => l.status === s).length;
  return {
    hotSet: by('active'),
    graduated: by('graduated'),
    retired: by('retired'),
    total: store.lessons.length,
  };
}

module.exports = { mergeDuplicates, retireStale, pruneNoisy, consolidate, metrics };
