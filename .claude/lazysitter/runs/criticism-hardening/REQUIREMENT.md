# REQUIREMENT

> Persistence note: produced by `lazysitter-business-analyst`, which reported writing this file but
> did not. Recovered verbatim from the agent's returned output by the orchestrator (no paraphrase).
> See PITFALL row `[proc][false-persist]`.

## Goal
Harden LazySitter (the framework itself, dogfooded on itself) against the seventeen structural failure modes identified in two independent field-review sets (`critisisms/fromP1stonDestopWidget/`, `critisisms/fromP1stonProject/`) and already adjudicated in the approved decision ledger `d:\lazysitter\docs\CRITICISM-RESPONSE.md`. Implement every item in that ledger's Part 1 ("Adopted in full", A1–A17); do not implement anything in Part 2 ("Rejected", R1–R7).

## Value
Closes false-green gates, plan-time-catchable defects shipped to implementation, silent knowledge loss between runs, pre-existing-secret blind spots, self-verified fixes, single-point-of-failure exploration, misrouted process weight (heavy ceremony on safe changes, none on dangerous ones), unenforced model-tier separation, and Windows-specific correctness gaps — the concrete, evidenced causes of wrong or dangerous outcomes across the reviewed runs. Net effect per the ledger: the pipeline gets faster and cheaper on average while accuracy strictly improves, because every change either buys accuracy at no cost or refuses a cost cut that would trade accuracy away.

## In scope
Full implementation of A1–A17 as specified in CRITICISM-RESPONSE.md: capability gating (A1), plan-attack red-team mode (A2), FACT-BLOCK (A3), fact/preference/one-way dispute classification (A4), committed `.lazysitter/knowledge/` (A5), baseline-scoped secret/dependency scanning (A6), non-self-verified verdicts + orchestrator no-source-writes (A7), explorer hardening with Bash + probes (A8), volatility×blast-radius triage + MICRO lane (A9), assumption ledger + non-functional checklist (A10), execute-don't-argue mandate (A11), devils-advocate retooling (A12), run isolation/lock/watchdog (A13), capability-gated Tier 8 + `--auto` opt-in (A14), model-separation enforcement (A15), footprint-discipline defaults (A16), Windows correctness (A17). Changes land in `core/` as the single source of truth and propagate to generated `.claude/`, `.codex/`, `.cursor/` installs, with equivalent behavior across all three adapters.

## Out of scope
R1–R7: no framework-level tier deletion, no new specialist agents beyond the one exception already granted in the ledger (`lazysitter-recon`, roster 26→27), no unbounded explorer pack length, no shipped executable harnesses, no orchestrator demotion, no deletion of `docs-agent`/`ux-analyst`/`frontend-expert`/`dependency-auditor`/`triage`, no `WebFetch`/`WebSearch` grants.

## Definition of done (business-level)
Every A1–A17 behavior is observable in a real run: false-green gates are blocked, plan-level defects are caught before implementation, knowledge persists and is git-tracked, secrets baseline covers pre-existing findings, orchestrator cannot self-clear blocking findings, triage weight matches actual risk, model separation failures are loud, and the same observable behavior holds when run through Claude Code, Codex, and Cursor. `node test/smoke.js` passes throughout; install/update/uninstall/doctor keep working at every increment.

## Known constraints
Accuracy strictly dominates cost/speed; no code comments anywhere; `core/` is canonical, adapter copies are generated and never hand-edited; work proceeds and is verified in waves; nothing may regress existing passing behavior.
