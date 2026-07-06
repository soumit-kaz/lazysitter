'use strict';

// TRACEABILITY — the spine that guarantees nothing ships un-traced (§4):
//   BRD-§ → requirement → feature → AC → test → verdict
// Two teeth:
//   coverage()   (top-down)  — every `must` requirement maps to ≥1 feature. A gap surfaces
//                              BEFORE commit, not at delivery.
//   scopeCreep() (bottom-up) — every feature traces to a requirement. Unrequested work flagged.
//   gate()       — the mechanical merge assertion: every must-req is implemented AND has a
//                  green test. An orphan or red must-req BLOCKS. No must-req passes on prose.

function makeTrace() {
  return { requirements: {}, features: {}, tests: {} };
}

function addRequirement(t, { id, source, must = false }) {
  if (!id) throw new Error('addRequirement: id required');
  if (!source) throw new Error('addRequirement: source (BRD-§) required — a requirement with no source is unanchored');
  t.requirements[id] = { id, source, must: !!must, features: [] };
  return t.requirements[id];
}

// A feature implements a requirement (a feature with no requirement is scope creep).
function addFeature(t, { id, requirement = null }) {
  if (!id) throw new Error('addFeature: id required');
  t.features[id] = { id, requirement };
  if (requirement) {
    const r = t.requirements[requirement];
    if (!r) throw new Error(`addFeature: unknown requirement ${requirement}`);
    if (!r.features.includes(id)) r.features.push(id);
  }
  return t.features[id];
}

// A test derived from a requirement's acceptance criteria, with its last verdict.
function addTest(t, { id, requirement, verdict = null }) {
  if (!id) throw new Error('addTest: id required');
  if (!t.requirements[requirement]) throw new Error(`addTest: unknown requirement ${requirement}`);
  t.tests[id] = { id, requirement, verdict }; // verdict: 'green' | 'red' | null
  return t.tests[id];
}

function setVerdict(t, testId, verdict) {
  const test = t.tests[testId];
  if (!test) throw new Error(`setVerdict: unknown test ${testId}`);
  test.verdict = verdict;
  return test;
}

// Top-down: must-requirements with no implementing feature = gaps.
function coverage(t) {
  return Object.values(t.requirements).filter((r) => r.must && r.features.length === 0).map((r) => r.id);
}

// Bottom-up: features not traced to any requirement = scope creep.
function scopeCreep(t) {
  return Object.values(t.features).filter((f) => !f.requirement).map((f) => f.id);
}

// The mechanical merge gate. Returns a list of problems; empty = clean.
function gate(t) {
  const problems = [];
  for (const id of coverage(t)) problems.push(`must-requirement ${id} has no implementing feature (gap)`);
  for (const id of scopeCreep(t)) problems.push(`feature ${id} traces to no requirement (scope creep)`);
  for (const r of Object.values(t.requirements)) {
    if (!r.must) continue;
    const tests = Object.values(t.tests).filter((x) => x.requirement === r.id);
    if (tests.length === 0) problems.push(`must-requirement ${r.id} has no test (untested)`);
    else if (!tests.some((x) => x.verdict === 'green')) {
      problems.push(`must-requirement ${r.id} has no green test (last verdicts: ${tests.map((x) => x.verdict).join(',')})`);
    }
  }
  return problems;
}

module.exports = { makeTrace, addRequirement, addFeature, addTest, setVerdict, coverage, scopeCreep, gate };
