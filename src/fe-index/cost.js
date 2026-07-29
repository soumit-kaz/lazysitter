'use strict';

const path = require('path');
const brief = require('./brief');
const q = require('./query');

// Budget forecasting.
//
// The orchestrator is required to "forecast per-wave token spend and pause
// before the cap is hit". Until now it had nothing to forecast FROM, so the
// forecast was a guess and the cap was discovered mid-wave. This computes the
// estimate from things that are actually known: the measured agent-prompt
// sizes, the real shard sizes of this feature's brief, and the wave roster
// triage selected.
//
// Estimates are estimates. They are labelled as such, and the accounting is
// printed per wave so a wrong one is visible rather than absorbed.

// Measured from the shipped agent files (mean 1114 tokens) and skill files
// (mean 1358). Rounded up, because under-forecasting a budget is the failure
// that matters.
const AGENT_PROMPT = 1200;
const SKILL = 1400;
const PLAN = 3000;
const SPEC = 4000;
const DIFF = 5000;
const ORCH_OVERHEAD = 0.12;

const SIZE_ROSTER = {
  micro: { explorers: 0, experts: 0, implementers: 1, verifiers: 8, rounds: 0 },
  small: { explorers: 2, experts: 5, implementers: 1, verifiers: 8, rounds: 1 },
  medium: { explorers: 4, experts: 8, implementers: 2, verifiers: 8, rounds: 1 },
  large: { explorers: 5, experts: 11, implementers: 3, verifiers: 8, rounds: 2 },
};

function inferSize(idx, featureText) {
  const hits = q.search(idx, { like: featureText, limit: 10, includeTests: false });
  if (!hits.length) return { size: 'medium', why: 'no existing code matched the request — treated as new surface' };
  const top = hits[0].entity;
  const impact = q.impact(idx, top.file);
  const affected = impact ? impact.totalAffectedFiles : 0;
  const routes = impact ? impact.routes.length : 0;
  if (affected >= 25 || routes >= 5) return { size: 'large', why: `top-ranked surface ${top.file} affects ${affected} files across ${routes} routes` };
  if (affected >= 6 || routes >= 2) return { size: 'medium', why: `top-ranked surface ${top.file} affects ${affected} files across ${routes} routes` };
  return { size: 'small', why: `top-ranked surface ${top.file} affects only ${affected} files` };
}

function shardTokens(shards) {
  const out = {};
  for (const [name, body] of Object.entries(shards)) out[name] = Math.round(body.length / 4);
  return out;
}

function routedCost(role, tokens) {
  const shards = brief.ROLE_ROUTING[role] || ['00', '90'];
  let sum = 0;
  for (const prefix of shards) {
    for (const [name, t] of Object.entries(tokens)) {
      if (name.startsWith(prefix)) sum += t;
    }
  }
  return sum;
}

function estimate(root, featureText, opts = {}) {
  const idx = q.load(root);
  return brief.buildBrief(root, featureText, opts).then((b) => {
    const tokens = shardTokens(b.shards);
    const digest = tokens['00-DIGEST.md'] + tokens['90-open-questions.md'];
    const allShards = Object.values(tokens).reduce((a, x) => a + x, 0);

    const inferred = inferSize(idx, featureText);
    const size = (opts.size && opts.size !== 'auto' ? String(opts.size) : inferred.size).toLowerCase();
    const roster = SIZE_ROSTER[size] || SIZE_ROSTER.medium;

    const avgExpert = Math.round(
      Object.keys(brief.ROLE_ROUTING)
        .filter((r) => r.endsWith('-expert') || r === 'fe-ux-analyst' || r === 'fe-devils-advocate')
        .reduce((a, r) => a + routedCost(r, tokens), 0) /
        Math.max(1, Object.keys(brief.ROLE_ROUTING).filter((r) => r.endsWith('-expert') || r === 'fe-ux-analyst' || r === 'fe-devils-advocate').length)
    );

    const waves = [];
    const add = (name, n, per, note) => waves.push({ name, agents: n, perAgent: Math.round(per), total: Math.round(n * per), note });

    add('0 · preflight (recon)', 1, AGENT_PROMPT + 1200, 'index build is a CLI call — 0 LLM tokens');
    add('1 · intake (analyst + triage)', 2, AGENT_PROMPT + digest + 1200, 'triage reads the digest, not the repo');
    add('2 · explore (annotate the brief)', roster.explorers, AGENT_PROMPT + SKILL + digest + Math.round(allShards / 5) + 1200,
      roster.explorers ? 'brief is precomputed — explorers annotate, they do not derive' : 'skipped at this size: the brief is complete for the scope');
    add('2b · synthesize (contradiction check)', roster.explorers ? 1 : 0, AGENT_PROMPT + digest + 1500, 'brief is already merged; this only reconciles annotations');
    add('3 · spec', 1, AGENT_PROMPT + SKILL + routedCost('fe-spec-writer', tokens) + 3500, 'reads the conventions shard, not the whole pack');
    add(`4 · design round 1 (${roster.experts} experts)`, roster.experts, AGENT_PROMPT + SKILL + avgExpert + PLAN + 1200, 'each expert reads only its routed shards');
    const r2 = roster.rounds >= 2 ? Math.max(2, Math.ceil(roster.experts * 0.3)) : 0;
    add('4 · design round 2 (open items only)', r2, AGENT_PROMPT + avgExpert + PLAN + 1200,
      r2 ? 'only experts with an open item are re-spawned; the rest of round 1 stands' : 'no second round at this size');
    add('4a · plan-attack (red-team)', 1, AGENT_PROMPT + PLAN + routedCost('fe-red-team', tokens) + 1500, 'never skipped');
    add('5 · build', roster.implementers + 1, AGENT_PROMPT + SKILL + PLAN + Math.round(allShards / 4) + 2500, 'implementers + blind test-author');
    add('6 · verify (mechanical gate first)', roster.verifiers, AGENT_PROMPT + SKILL + DIFF + Math.round(SPEC / 2) + 1800,
      'fe-index gate computes the mechanical facts for 0 tokens; verifiers adjudicate findings');
    add('7 · integrate', 2, AGENT_PROMPT + DIFF + SPEC + 1500, null);
    add('8 · release', 4, AGENT_PROMPT + 1200, null);
    add('supervision (1 pass per writing wave)', 3, AGENT_PROMPT + 2000, 'watches waves 2, 4 and 5');

    const subtotal = waves.reduce((a, w) => a + w.total, 0);
    const overhead = Math.round(subtotal * ORCH_OVERHEAD);
    const total = subtotal + overhead;
    const budget = opts.budget ? Number(opts.budget) : 400000;

    return {
      feature: featureText,
      size,
      sizeInferred: inferred,
      sizeOverridden: !!(opts.size && opts.size !== 'auto'),
      briefTokens: { digest, allShards, perShard: tokens },
      waves,
      subtotal,
      overhead,
      total,
      budget,
      fitsBudget: total <= budget,
      headroom: budget - total,
      caveats: [
        'These are ESTIMATES from measured prompt sizes and this feature\'s real brief. Actual spend varies with how much source an agent chooses to read.',
        'Retries are not included: each merge-gate auto-fix retry re-runs only the affected verifiers (~' + Math.round(waves.find((w) => w.name.startsWith('6')).perAgent * 2 / 1000) + 'k each).',
        'A FACT-BLOCK interrupt pauses the run; it does not add tokens.',
      ],
    };
  });
}

module.exports = { estimate, SIZE_ROSTER, inferSize };
