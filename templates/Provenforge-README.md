# Autonomous Engineering Team (Provenforge)

A 24-agent autonomous feature pipeline, implemented as Claude Code subagents + one orchestrator command. Built from the "Autonomous Engineering Team — Full Design" spec.

## What it is

One **orchestrator** (the main Claude session, Opus) drives a pipeline of **23 specialized subagents** across 8 tiers: intake → research → spec → design → build → independent verification → integration/intent → release/recovery. The core guarantee: **no agent verifies its own work**, and **tests are written from the spec, blind to the code**.

## How to use it

Run the slash command with a plain-language feature request:

```
/provenforge Add CSV export to the analytics dashboard
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

**Kill switch:** create the file `.claude/provenforge/KILL` at any time. The orchestrator checks for it before each tier and halts immediately. Delete it to re-enable.

**Recommended first run:** `--dry-run` on a small feature, so you can see intake → triage → context pack → spec → plan without any code being written.

## Where things land

Every run writes to `.claude/provenforge/runs/<feature-slug>/`:
- `audit.log` — one terse line per event (agent, event, verdict). Cheap to skim, fully reconstructable.
- `REQUIREMENT.md`, `TRIAGE.md`, `CONTEXT-PACK.md`, `ACCEPTANCE-CRITERIA.md`, `PLAN.md`, `DECISIONS.md`
- One report file per verification agent.

## The roster (24 agents)

| Tier | Agents | Model |
|------|--------|-------|
| 0 Orchestration | orchestrator (the `/provenforge` command, main session) | Opus |
| 1 Intake | `provenforge-business-analyst`, `provenforge-triage` | Sonnet, Haiku |
| 2 Research | `provenforge-explorer` | Haiku |
| 3 Spec | `provenforge-spec-writer` | Sonnet |
| 4 Design | `provenforge-architect`, `provenforge-database-expert`, `provenforge-infra-expert`, `provenforge-frontend-expert`, `provenforge-security-expert`, `provenforge-ux-analyst`, `provenforge-devils-advocate` | Opus / Sonnet |
| 5 Build | `provenforge-backend-implementer`, `provenforge-frontend-implementer`, `provenforge-dependency-auditor` | Sonnet |
| 6 Verification | `provenforge-test-author`, `provenforge-test-runner`, `provenforge-code-reviewer`, `provenforge-red-team`, `provenforge-security-auditor`, `provenforge-secrets-scanner` | Sonnet / Opus / Haiku |
| 7 Integration & Intent | `provenforge-integration-checker`, `provenforge-closing-loop-auditor` | Sonnet, Opus |
| 8 Release & Recovery | `provenforge-release-agent`, `provenforge-monitor-agent`, `provenforge-rollback-agent`, `provenforge-docs-agent` | Sonnet / Haiku |

Most features wake 6–10 of them; `triage` and the never-skip list decide which.

## Key policies (enforced by the orchestrator)

- **Merge gate:** merges only when tests PASS · security CLEAN · review CLEAN · integration CLEAN · intent MATCH — all at once. Never force-merges.
- **Failure handling:** capped at 3 auto-fix retries, then left on the branch with a failure summary.
- **Consensus:** max 2 rounds; `devils-advocate` challenges every round; architect rules and logs overrides after round 2. Never escalates design conflict to you.
- **Verification independence:** design-time `security-expert` (reviews the plan) and post-build `security-auditor` (reviews the diff) are separate invocations; one never substitutes for the other. `red-team` uses a distinct Opus config from the implementers to avoid shared blind spots.
- **Connection policy:** the orchestrator is the only hub. No subagent has the `Task` tool, so none can spawn another — flat, always debuggable.

## How the design maps to Claude Code (and one honest caveat)

Almost everything maps 1:1: model tiers → the `model:` field, tool restrictions → the `tools:` field, "orchestrator is the only hub" → no subagent has `Task`, budget/kill-switch/audit-log → orchestrator logic.

**The one approximation:** the design wants `test-author`'s read access to the implementation *dynamically revoked until a "tests frozen" flag flips*. Claude Code can't toggle a subagent's file permissions mid-run. So blindness is enforced **structurally** instead: `test-author` is spawned **in parallel with** the implementers, working only from the frozen acceptance criteria + public contracts — the implementation literally doesn't exist yet when the tests are authored, which achieves the same independence. Its agent definition also forbids reading implementation source. This is the intended behavior; only the *enforcement mechanism* differs from the spec.

## Requirements & notes

- Model tiers assume your plan can run Opus/Sonnet/Haiku subagents. If a tier isn't available, edit the `model:` field in the relevant `.claude/agents/provenforge-*.md` file.
- Bash-capable agents are instructed to stay read-only/sandboxed; only `release-agent` and `rollback-agent` mutate git, and only at the gate. Review your Claude Code permission settings before the first `--auto` run.
- "devBase" in the spec = your integration branch. The `release-agent`/`integration-checker` rebase onto and validate against the current one.
