# Autonomous Engineering Team (LazySitter)

A 26-agent autonomous feature pipeline, implemented as Claude Code subagents + one orchestrator command. Built from the "Autonomous Engineering Team — Full Design" spec.

## What it is

One **orchestrator** (the main Claude session, Opus) drives a pipeline of **25 specialized subagents** across 8 tiers: intake → research → spec → design → build → independent verification → integration/intent → release/recovery. The core guarantee: **no agent verifies its own work**, and **tests are written from the spec, blind to the code**.

## How to use it

Run the slash command with a plain-language feature request:

```
/lsi Add CSV export to the analytics dashboard
```

Options:

| Flag | Effect |
|------|--------|
| `--budget <tokens>` | Token ceiling for the feature (default 400000). Hitting it pauses and asks you. |
| `--auto` | Proceed through merge + auto-rollback autonomously (this is the default). |
| `--dry-run` | Stop after the plan (Tier 4). No code, no merge. Great for a first look. |

The orchestrator will:
1. Ask you clarifying questions **only** if the business scope is ambiguous (via `business-analyst`).
2. Run the whole pipeline autonomously.
3. Pause **only** if the budget cap is about to be exceeded.
4. Give you a skimmable final report + a full audit trail.

**Kill switch:** create the file `.claude/lazysitter/KILL` at any time. The orchestrator checks for it before each tier and halts immediately. Delete it to re-enable.

**Recommended first run:** `--dry-run` on a small feature, so you can see intake → triage → context pack → spec → plan without any code being written.

## Where things land

Every run writes to `.claude/lazysitter/runs/<feature-slug>/`:
- `audit.log` — one terse line per event (agent, event, verdict). Cheap to skim, fully reconstructable.
- `MANIFEST.md` — verified facts (commit SHAs, contracts, toolchain/deploy facts, frozen-test hashes) that agents read directly instead of the orchestrator re-narrating them.
- `REQUIREMENT.md`, `TRIAGE.md`, `CONTEXT-PACK.md`, `ACCEPTANCE-CRITERIA.md`, `PLAN.md`, `DECISIONS.md` — each **self-persisted by its producing agent**, not hand-transcribed.
- `gate-state.jsonl` — one structured `lsi-verdict` per verifier; the merge gate is evaluated from this, deterministically.
- `TRACEABILITY.md` (must-AC → test → verdict), `LIMITATIONS.md` (user-facing limitations, tracked from discovery).
- One report file per verification agent.

Two ledgers live outside the run dir:
- `.claude/lazysitter/PITFALL-LEDGER.md` — process/collaboration faults, seeded; read at preflight so known process faults aren't repeated. Preserved across `update`.
- `lazysitter/PROJECT-PITFALLS.md` — project-tech pitfalls; the explorer injects only the rows matching each feature's tech, and recurring ones graduate into guards.

## The roster (26 agents)

| Tier | Agents | Model |
|------|--------|-------|
| 0 Orchestration | orchestrator (the `/lsi` command, main session) | Opus |
| 1 Intake | `lazysitter-business-analyst`, `lazysitter-triage` | Sonnet, Haiku |
| 2 Research | `lazysitter-explorer` | Haiku |
| 3 Spec | `lazysitter-spec-writer` | Sonnet |
| 4 Design | `lazysitter-architect`, `lazysitter-database-expert`, `lazysitter-infra-expert`, `lazysitter-frontend-expert`, `lazysitter-security-expert`, `lazysitter-ux-analyst`, `lazysitter-devils-advocate` | Opus / Sonnet |
| 5 Build | `lazysitter-backend-implementer`, `lazysitter-frontend-implementer`, `lazysitter-dependency-auditor` | Sonnet |
| 6 Verification | `lazysitter-test-author`, `lazysitter-test-runner`, `lazysitter-code-reviewer`, `lazysitter-red-team`, `lazysitter-security-auditor`, `lazysitter-secrets-scanner` | Sonnet / Opus / Haiku |
| 7 Integration & Intent | `lazysitter-integration-checker`, `lazysitter-closing-loop-auditor` | Sonnet, Opus |
| 8 Release & Recovery | `lazysitter-release-agent`, `lazysitter-monitor-agent`, `lazysitter-rollback-agent`, `lazysitter-docs-agent` | Sonnet / Haiku |

Most features wake 6–10 of them; `triage` and the never-skip list decide which.

## Key policies (enforced by the orchestrator)

- **Merge gate:** evaluated from `gate-state.jsonl`, not prose — all verdicts green, no `degraded` gap, no OPEN observable concern, every must-AC traced + green, frozen-test hashes intact, limitations disclosed. Never force-merges.
- **Teeth check:** the frozen suite is run against the pre-implementation baseline first; ≥1 must-test must FAIL there or the criterion is toothless and blocks.
- **Observable claims are observed, not argued:** a concern about rendered/returned output can't be closed by reasoning while a harness that could observe it exists — it routes to the render/behavioral gate or to you as accepted-risk. (Raiser ≠ dismisser.)
- **Adversaries run un-anchored:** red-team / security-auditor / closing-loop-auditor get facts, never the orchestrator's bug-theory.
- **Failure handling:** capped at 3 auto-fix retries (mechanical ones at a cheaper tier), then left on the branch with a failure summary.
- **Consensus:** max 2 rounds; `devils-advocate` challenges every round; architect rules and logs overrides after round 2. Never escalates design conflict to you.
- **Verification independence:** design-time `security-expert` (reviews the plan) and post-build `security-auditor` (reviews the diff) are separate invocations; one never substitutes for the other. `red-team` uses a distinct Opus config from the implementers to avoid shared blind spots.
- **Connection policy:** the orchestrator is the only hub. No subagent has the `Task` tool, so none can spawn another — flat, always debuggable. Producers get run-dir-scoped `Write` to self-persist their own artifact (that is file I/O, not spawn authority).

## How the design maps to Claude Code (and one honest caveat)

Almost everything maps 1:1: model tiers → the `model:` field, tool restrictions → the `tools:` field, "orchestrator is the only hub" → no subagent has `Task`, budget/kill-switch/audit-log → orchestrator logic.

**The one approximation:** the design wants `test-author`'s read access to the implementation *dynamically revoked until a "tests frozen" flag flips*. Claude Code can't toggle a subagent's file permissions mid-run. So blindness is enforced **structurally** instead: `test-author` is spawned **in parallel with** the implementers, working only from the frozen acceptance criteria + public contracts — the implementation literally doesn't exist yet when the tests are authored, which achieves the same independence. Its agent definition also forbids reading implementation source. This is the intended behavior; only the *enforcement mechanism* differs from the spec.

## Requirements & notes

- Model tiers assume your plan can run Opus/Sonnet/Haiku subagents. If a tier isn't available, edit the `model:` field in the relevant `.claude/agents/lazysitter-*.md` file.
- Bash-capable agents are instructed to stay read-only/sandboxed; only `release-agent` and `rollback-agent` mutate git, and only at the gate. Review your Claude Code permission settings before the first `--auto` run.
- "devBase" in the spec = your integration branch. The `release-agent`/`integration-checker` rebase onto and validate against the current one.
