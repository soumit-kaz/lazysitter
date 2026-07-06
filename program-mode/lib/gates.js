'use strict';

// GATES — the fail-fast deterministic quality ladder (docs/PROGRAM-MODE.md §8).
//
// The whole thesis: a proof is 0% wrong and ~0 tokens; a judgment is ~0.1% wrong and
// token-costly. So checkable defects are caught by tools, cheapest-first, and the
// ladder short-circuits on the first blocking failure — a fast gate blocks before you
// pay for the expensive adversarial tail.
//
// Each gate emits an `lsi-verdict` — the same structured shape every verifier uses, so
// the merge gate is evaluated by READING verdicts, never by recalling prose.

// The default ladder. `cost` orders execution (ascending). `cmd` is what actually runs
// in the target repo; it is data, not executed here — the caller injects an `exec`.
// Gates 1–4 are the Phase-1 battery (§16): they buy ~80% of the quality floor for ~0
// tokens. 5–10 (dupe, complexity, architecture, diff-scope, traceability, mutation)
// slot in later at the same interface.
const DEFAULT_LADDER = [
  { id: 'secrets', cost: 1, cmd: 'lazysitter-gate-secrets', blocking: true },
  { id: 'lint', cost: 2, cmd: 'lazysitter-gate-lint', blocking: true },
  { id: 'typecheck-build', cost: 3, cmd: 'lazysitter-gate-build', blocking: true },
  { id: 'dead-code', cost: 4, cmd: 'lazysitter-gate-deadcode', blocking: true },
];

function ladder(extra = []) {
  return DEFAULT_LADDER.concat(extra).slice().sort((a, b) => a.cost - b.cost);
}

// Run one gate. `exec(cmd, ctx)` must return { code, stdout, stderr }; inject the real
// one (child_process) in production, a stub in tests. A non-zero exit is a BLOCK. A
// gate that cannot run (missing tool) is `degraded:true` — which is NOT a pass.
function runGate(gate, ctx, exec) {
  let res;
  try {
    res = exec(gate.cmd, ctx);
  } catch (e) {
    return verdict(gate, { pass: false, degraded: true, evidence: `exec failed: ${e.message}` });
  }
  if (res && res.degraded) {
    return verdict(gate, { pass: false, degraded: true, evidence: res.evidence || 'tool unavailable' });
  }
  const pass = res && res.code === 0;
  return verdict(gate, {
    pass,
    degraded: false,
    evidence: pass ? 'clean' : (res && (res.stderr || res.stdout) || 'non-zero exit').toString().slice(0, 500),
  });
}

function verdict(gate, { pass, degraded, evidence }) {
  return {
    gate: gate.id,
    verdict: pass ? 'PASS' : 'BLOCK',
    blocking: gate.blocking !== false,
    degraded: !!degraded,
    evidence,
  };
}

// Run the ladder cheapest-first, stopping at the first BLOCKING failure (fail-fast).
// A non-blocking gate that fails is recorded but does not halt the ladder. A degraded
// gate blocks the overall verdict — an unverified gate is not a passed gate.
// Returns { verdict, blockedBy, results }.
function runLadder(gates, ctx, exec) {
  const results = [];
  let blockedBy = null;
  for (const gate of gates) {
    const v = runGate(gate, ctx, exec);
    results.push(v);
    const failed = v.verdict === 'BLOCK' || v.degraded;
    if (failed && v.blocking) {
      blockedBy = v.gate;
      break; // fail-fast: don't pay for the rest
    }
  }
  const clean = !blockedBy && results.every((v) => v.verdict === 'PASS' && !v.degraded);
  return { verdict: clean ? 'PASS' : 'BLOCK', blockedBy, results };
}

// Render a verdict set as the fenced `lsi-verdict` block the orchestrator appends to
// gate-state.jsonl and reads at the merge gate.
function renderVerdict({ verdict, blockedBy, results }) {
  const lines = [
    '```lsi-verdict',
    `verdict: ${verdict}`,
    `blocking: ${verdict === 'BLOCK'}`,
    `degraded: ${results.some((r) => r.degraded)}`,
    `evidence: gate-ladder`,
    'claims:',
    ...results.map((r) => `  - "[observed][observable] gate:${r.gate} ${r.verdict} :: ${r.evidence}"`),
  ];
  if (blockedBy) lines.push('concerns:', `  - "[OPEN] blocked by gate:${blockedBy}"`);
  lines.push('```');
  return lines.join('\n');
}

module.exports = { DEFAULT_LADDER, ladder, runGate, runLadder, renderVerdict };
