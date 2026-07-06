'use strict';

// INSTITUTIONAL MEMORY — experience without a gigantic file (docs/PROGRAM-MODE.md §10).
//
// The trap: a flat ledger you READ to use eventually costs more than it saves. The fix:
// history need not be read to be used. A fault climbs a ladder OUT of memory —
//   capture → dedup+count → graduate (to a gate/tool, leaves text) → abstract → retire
// and whatever stays as text is retrieved in a fixed top-K, so injection cost is O(K),
// independent of how big the base grows.
//
// A store is a plain array of lessons. Each lesson is indexed on two axes:
//   situation[] — what tech/operation it applies to  (e.g. 'supabase-rls', 'migration')
//   producer[]  — which agent/team tends to trigger it (e.g. 'backend-implementer')
// Retrieval matches BOTH → targeted awareness ("the reviewer knows THIS team does THIS").

function makeStore() {
  return { lessons: [] };
}

function keyOf(lesson) {
  return (lesson.key || lesson.text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Capture a fault. Dedup by key: a repeat increments hits (anecdote → pattern) instead
// of appending a duplicate. `now` is injected epoch seconds.
function capture(store, lesson, { now } = {}) {
  const key = keyOf(lesson);
  if (!key) throw new Error('capture: lesson needs text or key');
  const existing = store.lessons.find((l) => keyOf(l) === key && l.status !== 'retired');
  if (existing) {
    existing.hits += 1;
    existing.lastSeen = now;
    return existing;
  }
  const l = {
    id: lesson.id || `L${store.lessons.length + 1}`,
    key,
    text: lesson.text || key,
    situation: Array.isArray(lesson.situation) ? lesson.situation : [],
    producer: Array.isArray(lesson.producer) ? lesson.producer : [],
    severity: typeof lesson.severity === 'number' ? lesson.severity : 3, // 1..5
    hits: 1,
    caught: 0, // how often this lesson actually prevented something (injection precision)
    status: 'active', // active | graduated | retired
    alwaysOn: !!lesson.alwaysOn, // catastrophic tier — injected regardless of trigger
    lastSeen: now,
    reviewBy: lesson.reviewBy || null,
  };
  store.lessons.push(l);
  return l;
}

// Relevance score for a task fingerprint. Higher = more worth injecting.
//   relevance = overlap on situation + overlap on producer
//   weighted by severity and recency (recent lessons score higher)
function score(lesson, { situation = [], producer = [], now = 0 }) {
  const sit = new Set(situation);
  const prod = new Set(producer);
  const overlap =
    lesson.situation.filter((s) => sit.has(s)).length +
    lesson.producer.filter((p) => prod.has(p)).length;
  if (overlap === 0 && !lesson.alwaysOn) return -1; // not relevant, not catastrophic
  const ageDays = lesson.lastSeen ? Math.max(0, (now - lesson.lastSeen) / 86400) : 999;
  const recency = 1 / (1 + ageDays / 30); // ~half-life a month
  return lesson.severity * (1 + overlap) * (0.5 + recency);
}

// Retrieve the top-K relevant ACTIVE lessons for a task, plus every always-on lesson.
// Graduated and retired lessons are never injected — they've left the context budget.
// This is the function that makes a gigantic base cost the same as a small one.
function retrieve(store, { situation = [], producer = [], k = 6, now = 0 } = {}) {
  const alwaysOn = store.lessons.filter((l) => l.alwaysOn && l.status === 'active');
  const scored = store.lessons
    .filter((l) => l.status === 'active' && !l.alwaysOn)
    .map((l) => ({ l, s: score(l, { situation, producer, now }) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map((x) => x.l);
  return alwaysOn.concat(scored);
}

// The targeted pre-brief injected into an agent before it runs: the top faults its own
// role historically triggers, so it starts already warned about its own failure modes.
function preBrief(store, producer, { k = 5, now = 0 } = {}) {
  return retrieve(store, { producer: [producer], k, now });
}

// Faults ripe to GRADUATE into a deterministic gate/tool: recurring (hits ≥ 2) or
// high-severity, and not already graduated. Graduating one removes it from injection.
function graduationCandidates(store) {
  return store.lessons.filter((l) => l.status === 'active' && (l.hits >= 2 || l.severity >= 5));
}

function markGraduated(store, id) {
  const l = store.lessons.find((x) => x.id === id);
  if (l) l.status = 'graduated';
  return l;
}

// Retire stale/superseded lessons (past their review-by date) or demote a misdiagnosis.
// Promotion is bidirectional — a lesson that only ever accumulates would lie to you.
function retire(store, id) {
  const l = store.lessons.find((x) => x.id === id);
  if (l) l.status = 'retired';
  return l;
}

// Prune the noisy: active lessons injected many times that never caught anything are
// pattern noise, not wisdom. Consolidation (the Librarian) runs this at milestones.
function noisy(store, { minInjections = 10 } = {}) {
  return store.lessons.filter(
    (l) => l.status === 'active' && l.caught === 0 && (l._injected || 0) >= minInjections
  );
}

module.exports = {
  makeStore,
  capture,
  score,
  retrieve,
  preBrief,
  graduationCandidates,
  markGraduated,
  retire,
  noisy,
};
