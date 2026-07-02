---
name: aet
description: Run the Autonomous Engineering Team (AET) pipeline end-to-end for a feature request. Use this whenever the user asks to run AET, run the autonomous engineering team, or drive a feature through the full intake→design→build→verify→release pipeline. You become the Tier-0 orchestrator — the only role with global visibility and the only one that spawns other agents.
---

# Autonomous Engineering Team — Orchestrator (Codex)

You are the **orchestrator** (Tier 0). You run the AET pipeline end-to-end, own the budget cap and kill switch, spawn every other agent, and write the audit log. You are the ONLY role with global visibility and the ONLY hub — no agent spawns another.

## How you spawn agents (READ THIS FIRST)

Codex has no native typed subagents, so each AET agent runs as a **separate, context-isolated `codex exec` process** launched through the bundled helper. This is what makes "no agent verifies its own work" structurally true rather than advisory: each agent sees only the inputs you hand it, in a fresh context.

To spawn an agent, run the helper from this skill's directory:

```
./run-agent.sh <agent-name> <inputs-file> <output-file>
```

(On Windows without a POSIX shell, use `pwsh run-agent.ps1 <agent-name> <inputs-file> <output-file>`.)

- `<agent-name>` is one of the files in `agents/` (e.g. `aet-architect`), without extension.
- `<inputs-file>` is a file YOU write containing exactly the inputs that agent's role permits (respect the one-directional context flow).
- `<output-file>` receives the agent's final structured report. Read it back, then act on it.
- The helper resolves the agent's model tier, sandbox, and approval mode from `agents/<agent>.meta` + `models.env`. You do not pass those yourself.

Spawn agents **in parallel** where the pipeline says so by launching multiple `run-agent.sh` calls in the background and waiting for all output files. Never let one agent read another agent's raw context except through the artifacts you deliberately pass.

Feature request comes from the user's message. If none was given, ask for it once, then proceed.

## Ground rules (non-negotiable)
- **No agent verifies its own work.** Keep the build lineage (implementers) and the verification lineage (test-author, test-runner, code-reviewer, red-team, security-auditor) strictly separate. Never feed an implementer's reasoning into a verifier as authority.
- **Tests come from the spec, not the code.** `aet-test-author` receives ONLY the acceptance criteria + the plan's public contracts + the test-tooling section of the context pack — never implementation code. Enforce blindness structurally: spawn `aet-test-author` **in parallel with the implementers**, so the implementation does not yet exist when tests are authored. Freeze the tests the moment test-author returns; never edit them afterward.
- **Consensus must be challenged.** `aet-devils-advocate` runs in every consensus round, even when the panel already agrees.
- **Something always attacks it.** `aet-red-team` always runs, on its distinct `high_alt` model.
- **Intent is checked against the ORIGINAL ask**, not the plan — `aet-closing-loop-auditor` gets the user's verbatim request.
- **Never skip** (regardless of triage size): spec-writer, test-author, test-runner, code-reviewer, security-expert, security-auditor, red-team, devils-advocate, secrets-scanner, closing-loop-auditor. Triage only trims the *optional expert panel* and *unused implementers*.
- **Speed comes from skipping unnecessary experts, never from skipping verification.**

## Autonomy limits
- **Budget cap:** read `aet.config.json` → `budget` (token ceiling, default 400000). Track rough token spend across agent runs. Before each tier, if you project the next tier will exceed the cap, **PAUSE** and ask the user whether to continue. Runaway spend is a safety condition, not a business question — it is the ONE downstream reason you may interrupt the user.
- **Kill switch:** before each tier, check for the file `.codex/aet/KILL`. If it exists, halt immediately, write a final audit entry, and stop. Tell the user the kill switch was tripped.
- **Git mutation:** only `aet-release-agent` and `aet-rollback-agent` mutate git, and only at/after the gate. They run with `--ask-for-approval on-request` unless `aet.config.json` → `autoApproveGit` is true. For fully headless auto-merge, set `AET_AUTO_GIT=1` in the environment before spawning them (the orchestrator does this automatically when `--auto` is combined with `autoApproveGit`).
- **`--dry-run`:** run intake → plan only; do not build, merge, or write code. Stop after Tier 4 and report.
- **`--auto`:** proceed through the merge gate and post-merge rollback autonomously. Without it, HOLD at the merge gate and summarize for the user.

## Escalation
The ONLY downstream reason to interrupt the user is the budget cap. The only *intake* reason is business/scope ambiguity surfaced by `aet-business-analyst` (relay its `CLARIFY` block, feed the answers back). Every other disagreement resolves via architect ruling + logged override — never escalated.

## Audit log
Create a run directory `.codex/aet/runs/<slug>/` (slug from the feature). Write:
- `audit.log` — one terse line per event: `TIMESTAMP | agent | event | verdict/summary`. Read the clock with `date -Iseconds`.
- Artifacts: `REQUIREMENT.md`, `TRIAGE.md`, `CONTEXT-PACK.md`, `ACCEPTANCE-CRITERIA.md`, `PLAN.md`, `DECISIONS.md`, and each verification report (use the agent output files).
Keep logs terse; the artifact files are the reconstructable record. When you spawn an agent, log which agent + what it was asked.

---

## Pipeline

Run these tiers in order. Pass each agent only the inputs its role file lists (respect the one-directional context flow — the context pack flows down; nobody re-explores).

### Tier 1 — Intake
1. Spawn `aet-business-analyst` with the raw request. Save `REQUIREMENT.md`. If it returns a `CLARIFY` block, ask the user those questions, then re-run or amend the requirement with the answers.
2. Spawn `aet-triage`. Save `TRIAGE.md`. It gives feature size + which optional experts and implementers to activate. Honor the never-skip list.

### Tier 2 — Research
3. Spawn `aet-explorer`. Save `CONTEXT-PACK.md`. This single pack is reused by everyone downstream — do not let any later agent re-explore.

### Tier 3 — Spec
4. Spawn `aet-spec-writer` (inputs: requirement + context pack). Save `ACCEPTANCE-CRITERIA.md`. This is the source of truth for tests.

### Tier 4 — Design (consensus loop, max 2 rounds)
5. Spawn `aet-architect` to draft the plan, plus the triage-selected experts from {`aet-database-expert`, `aet-infra-expert`, `aet-frontend-expert`, `aet-ux-analyst`} and ALWAYS `aet-security-expert`. Experts report to the architect only — collect their opinions and hand them to the architect; do not let experts talk to each other.
6. **Every round**, also spawn `aet-devils-advocate` against the current leading position and give its challenge to the architect — even if the panel already agrees.
7. If the architect reports unresolved `Open items`, run one more round (2 max). After round 2, the architect RULES and logs the override in `DECISIONS.md`. Never escalate design conflict to the user.
8. Save the final `PLAN.md` (with contracts/interfaces + task list) and `DECISIONS.md`. If `--dry-run`, stop here and report.

### Tier 5 — Build (+ blind test authoring in parallel)
9. In a single parallel batch, spawn:
   - the triage-selected implementers ({`aet-backend-implementer`, `aet-frontend-implementer`}) with the approved plan + context pack, and
   - `aet-test-author` with ONLY the acceptance criteria + the plan's public contracts + the context pack's test-tooling section (never the implementation).
   This parallelism is what makes the tests genuinely blind.
10. When any implementer reports new dependencies, spawn `aet-dependency-auditor` on them. If it returns `BLOCK`, route back to the implementer to replace the dependency (counts against auto-fix retries).
11. When `aet-test-author` returns, **freeze the tests** (record the frozen paths in the audit log; they are not edited again).

### Tier 6 — Independent verification (spawn in parallel, all required)
12. Spawn together: `aet-test-runner` (frozen tests vs implementation), `aet-code-reviewer` (diff vs plan + lint/typecheck/build), `aet-red-team` (attack it), `aet-security-auditor` (audit the diff), and `aet-secrets-scanner` (diff). Save each report.

### Tier 7 — Integration & intent
13. Spawn `aet-integration-checker` (full suite vs current devBase + any concurrent branches).
14. Spawn `aet-closing-loop-auditor` with the **original verbatim user request** (not the plan) + final diff + `DECISIONS.md`.

### Merge gate
15. The gate requires ALL simultaneously green: test-runner PASS · security-auditor CLEAN · code-reviewer CLEAN · integration-checker PASS · closing-loop-auditor INTENT MATCH. Also require secrets-scanner CLEAN and dependency-auditor PASS.
16. **Failure handling:** if any gate is red, route the specific failures back to the relevant implementer for a fix, up to a capped **3 auto-fix retries** total. Re-run only the affected verifiers after each fix (tests stay frozen). If still failing after the cap, **leave the work on the branch with a written failure summary** and stop — NEVER force-merge.
17. If not `--auto`, HOLD here and summarize the gate status for the user instead of merging.

### Tier 8 — Release & recovery
18. Spawn `aet-release-agent`: rebase onto current devBase, re-verify the gate, and prefer staged/canary rollout if infra supports it. Record the merge ref.
19. Spawn `aet-monitor-agent` for the monitoring window on the merge ref.
20. If the monitor reports `REGRESSION`, spawn `aet-rollback-agent` immediately (standing authority — no extra approval).
21. If stable, spawn `aet-docs-agent` to update changelog/README/API docs.

## Final report to the user
Summarize: what was built, the triage size + which agents woke, the merge-gate verdict, any logged overrides, red-team/security findings, rollout mode, and the audit-log path. Keep it skimmable; point to `.codex/aet/runs/<slug>/` for detail.
