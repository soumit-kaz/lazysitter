# ACCEPTANCE CRITERIA
## Scope: LazySitter A1–A17 (per `docs/CRITICISM-RESPONSE.md` Part 1). Part 2 (R1–R7) is explicitly
## out of scope and no criterion below may be satisfied by any R1–R7 change.

## Verification-substrate note
The only mechanical harness is `test/smoke.js`: it runs the real CLI (`init`/`update`/`doctor`/
`uninstall`/`list`) against a temp project and asserts on installed output (`fs` + regex) and on
`core/` source. Every `must` criterion below is written to be dischargeable by exactly one of:
(a) CLI exit code / stdout, (b) an installed file under `.claude/`, `.codex/`, `.cursor/`, or
`.lazysitter/`, read with a regex/JSON/frontmatter check, or (c) a `core/` source file read the
same way. No criterion presupposes lint, typecheck, or CI — none exist.

**Tag convention used below:** `observable` = decided by reading the actual **installed** output
(what `lazysitter init` renders into `.claude/`, `.codex/`, `.cursor/`, `.lazysitter/`, or what a
CLI command prints) — this is this project's equivalent of "the chart draws." `internal` = decided
by reading `core/` source directly, where the installed copy is either identical by the
single-source contract or the file (e.g. `roster.json`) is build-time config never itself shipped
verbatim to an adapter.

---

## A1 — Capability gating

### AC-1 [must] [observable] Roster grows by exactly one, everywhere
Given a fresh `lazysitter init` into an empty temp project, When `.claude/agents/*.md`,
`.cursor/agents/*.md`, and the Codex agent role files are enumerated, Then each adapter contains
exactly **27** LazySitter agent files (26 pre-existing + `lazysitter-recon`), and a
`lazysitter-recon` role file exists in all three adapter trees.

### AC-2 [must] [observable] Recon is tier `low` in all three adapters
Given the installed `lazysitter-recon` agent/role file in each of the three adapters, When its
resolved `model:` (Claude/Codex frontmatter, or Cursor's `resolveModel()`-rebaked frontmatter) is
compared against the adapter's own `models.json`/`models.env`, Then it resolves to the `low` tier
in all three, not `mid`/`high`/`high_alt`.

### AC-3 [must] [observable] Three-state capability model, and present-but-inert is worse than absent
Given the installed `lazysitter-recon` body (`.claude/agents/lazysitter-recon.md` and its Codex and
Cursor counterparts), When read, Then all three state a capability is one of `available`, `absent`,
or `present-but-inert`, and explicitly define `present-but-inert` (a command that exits 0 while
doing zero work — e.g. a test runner discovering 0 tests) as **worse than `absent`**.

### AC-4 [must] [internal] Hard-BLOCK on unresolved `degraded:true`, all three orchestrators
Given `core/orchestrator.claude.md`, `core/orchestrator.codex.md`, and `core/cursor/LazySitter.rule.mdc`,
When all three are read, Then all three state the merge gate hard-BLOCKs on any unresolved
`degraded:true`, closable only by an explicit, recorded, per-run human waiver — never by
proceeding — with no wording in any of the three that permits an implicit or automatic close.

### AC-5 [must] [internal] Absent-substrate agents are not spawned, and the gap is named
Given `core/orchestrator.claude.md` and `core/orchestrator.codex.md`, When both are read, Then both
state agents whose required substrate is `absent` are not spawned, and that the absence is recorded
in the final report as a named coverage gap (not silently omitted).

---

## A2 — Plan-attack (red-team moves before the build)

### AC-6 [must] [observable] `plan-attack` mode mirrors `teeth-check`'s structure, in all three adapters
Given the installed `lazysitter-red-team` agent/role file in Claude, Codex, and Cursor, When read,
Then all three define a `plan-attack` mode: same agent, same distinct model reference as its normal
mode (not the implementer's model), operating on `PLAN.md` before implementation, with a mandate to
**execute** candidate logic rather than reason about it — structurally parallel to
`lazysitter-test-runner`'s `teeth-check` mode.

### AC-7 [must] [internal] Tier 4 does not close until the plan survives `plan-attack`
Given `core/orchestrator.claude.md` and `core/orchestrator.codex.md`, When both are read, Then both
place `red-team` in `plan-attack` mode strictly before the implementer tier in pipeline order, and
both state Tier 4 (or the plan-approval gate) does not close until the plan survives it.

---

## A3 — `FACT-BLOCK`

### AC-8 [must] [internal] `FACT-BLOCK` is defined with all three conditions and batched per tier
Given `core/orchestrator.claude.md` and `core/orchestrator.codex.md`, When both are read, Then both
define `FACT-BLOCK` as raisable by any agent for a question that is (a) load-bearing on
correctness, (b) unanswerable from the repo or any available tool, and (c) answerable by a human in
one line; both state the orchestrator batches these and asks once per tier (not once per question).

### AC-9 [must] [internal] `FACT-BLOCK` cannot be closed by architect ruling
Given `core/orchestrator.claude.md` and `core/orchestrator.codex.md`, When both are read, Then both
explicitly forbid an architect ruling from closing a `FACT-BLOCK`.

---

## A4 — Fact / preference / one-way dispute classification

### AC-10 [must] [internal] All three dispute classes are defined, in both orchestrators
Given `core/orchestrator.claude.md` and `core/orchestrator.codex.md`, When both are read, Then both
define exactly three dispute classes — `preference` (architect rules after ≤2 rounds, override
logged), `fact` (architect **ruling is forbidden**; resolved only by observation/probe/execution or
a `FACT-BLOCK`), and `one-way`/irreversible (requires explicit human sign-off, never an architect
tie-break) — and neither file permits an architect ruling to close a `fact`-classified dispute.

---

## A5 — Committed `.lazysitter/knowledge/`

### AC-11 [must] [observable] Knowledge directory is seeded on init and is git-trackable
Given a fresh `lazysitter init`, When `.lazysitter/knowledge/` is inspected, Then it contains
`CAPABILITIES.md`, `CONVENTIONS.md`, `PROJECT-PITFALLS.md`, `ONE-WAY-DOORS.md`, and
`SECRETS-BASELINE.md`, none of these paths appear in any `.gitignore` LazySitter writes, and the
files are registered as `writePreserve` in `.lazysitter/manifest.json` (not `managed`).

### AC-12 [must] [observable] Knowledge files survive `lazysitter update` untouched
Given an installed project where a user has appended a line to
`.lazysitter/knowledge/PROJECT-PITFALLS.md`, When `lazysitter update` is run, Then the file's
content (including the appended line) is byte-identical before and after — matching the existing
`writePreserve` behavior already verified for `PITFALL-LEDGER.md` and `models.json`.

### AC-13 [must] [observable] Doctor/install warns when knowledge is gitignored
Given a project where `.lazysitter/` (or `.lazysitter/knowledge/`) is listed in `.gitignore`, When
`lazysitter init` or `lazysitter doctor` is run, Then stdout contains an explicit warning naming the
gitignored knowledge path.

### AC-14 [should] [observable] Convention claims carry probe, hit count, and SHA
Given the seeded `CONVENTIONS.md` template written by `lazysitter init`, When read, Then it
specifies that each claim entry must carry the exact probe command, a hit count, `path:line`
citations, and the SHA it was verified at. (`should`: this is a template/seed-content check with no
downstream mechanical enforcement visible to the harness beyond the template text itself.)

---

## A6 — Baseline-scoped scanning

### AC-15 [must] [observable] Secrets scanning is baseline + delta, in all three adapters
Given the installed `lazysitter-secrets-scanner` (or equivalently named) agent/role file in Claude,
Codex, and Cursor, When read, Then all three state a full-repo baseline scan runs once at
onboarding into `SECRETS-BASELINE.md`, subsequent runs report **delta vs baseline** (not full-repo
CLEAN/DIRTY), and unresolved pre-existing criticals are surfaced in every final report until fixed
or explicitly accepted.

### AC-16 [must] [observable] Dependency auditing gets the same baseline treatment
Given the installed `lazysitter-dependency-auditor` agent/role file in Claude, Codex, and Cursor,
When read, Then all three state pre-existing (not just newly added) vulnerable/stale dependencies
are reported, i.e. the auditor is not scoped to the diff only.

---

## A7 — `verified_by` / `independent`, and no orchestrator source-writes

### AC-17 [must] [observable] Verdict schema carries `verified_by` and `independent`
Given the installed body of at least three representative agents that emit an `lsi-verdict` block
(e.g. `lazysitter-code-reviewer`, `lazysitter-red-team`, `lazysitter-test-runner`) across Claude,
Codex, and Cursor, When their documented verdict schema is read, Then all include `verified_by` and
`independent: true|false` alongside the pre-existing `verdict`/`blocking`/`degraded`/`evidence`/
`claims`/`concerns` fields.

### AC-18 [must] [internal] Gate refuses GREEN on a self-cleared blocking finding
Given `core/orchestrator.claude.md` and `core/orchestrator.codex.md`, When both are read, Then both
state the merge gate refuses a GREEN result when any blocking finding was cleared with
`independent: false`.

### AC-19 [must] [internal] Orchestrator cannot write source; one-line fixes still spawn an implementer
Given `core/orchestrator.claude.md` and `core/orchestrator.codex.md`, When both are read, Then both
state the orchestrator may not `Edit`/`Write` source files itself, and that even a one-line fix is
routed through an implementer spawn (the MICRO lane: implementer spawned, no spec/panel/plan
ceremony).

---

## A8 — Explorer hardening (Bash, probes, re-probe right)

### AC-20 [must] [observable] Explorer gains `Bash` in Claude
Given the installed `.claude/agents/lazysitter-explorer.md`, When its frontmatter `tools:` list is
parsed, Then it includes `Bash` in addition to the pre-existing `Read, Grep, Glob, Write`.

### AC-21 [must] [observable] Explorer gains equivalent Bash capability in Codex
Given the installed Codex explorer role file, When its header/body is read, Then it documents the
same Bash-execution capability as the Claude adapter (command execution for branch inventory / hit
counts / probes), consistent with AC-20.

### AC-22 [must] [observable] Explorer gains equivalent Bash capability in Cursor
Given the installed `.cursor/agents/lazysitter-explorer.md`, When its rebaked frontmatter is read,
Then it is marked non-`readonly` (`readonly: false` or equivalent), consistent with the Bash grant
in AC-20/AC-21 — Cursor's frontmatter carries `readonly` in place of a `tools` list per the adapter's
own re-baking convention.

### AC-23 [must] [observable] Every convention claim carries its probe, in all three adapters
Given the installed `lazysitter-explorer` body in Claude, Codex, and Cursor, When read, Then all
three require every convention-bank entry to carry the exact probe command, its hit count,
`path:line` citations, and the SHA verified at, and state a claim without a probe is not a fact.

### AC-24 [must] [observable] Narrow re-probe right, and contradiction invalidates dependent verdicts
Given the installed `lazysitter-explorer` body (any adapter) and at least one downstream consumer
agent's body (e.g. `lazysitter-architect`), When read, Then they document that a downstream agent
may re-run a cited probe (not re-explore), and that a contradicted pack fact BLOCKs and invalidates
every verdict that rested on it.

### AC-25 [must] [observable] Mandatory probe sections, in all three adapters
Given the installed `lazysitter-explorer` body in Claude, Codex, and Cursor, When read, Then all
three mandate: a branch-inventory probe (`git branch -a` plus a cross-branch grep/log search), a
convention-bank probe covering date/number formatting, JSON casing, enum wire values, error shape,
logging, and null handling, and an explicit "does this already exist?" section that must name what
was searched even when the answer is NONE-FOUND.

### AC-26 [must] [observable] Explorer tier bump `low` → `mid`, in all three adapters
Given the installed `lazysitter-explorer` agent/role file's resolved model in Claude, Codex, and
Cursor, When compared against each adapter's own `models.json`/`models.env`, Then it resolves to the
`mid` tier in all three, not `low`.

---

## A9 — Volatility × blast-radius triage, plus MICRO lane

### AC-27 [must] [observable] Triage documents the 2×2 lane matrix plus MICRO
Given the installed `lazysitter-triage` agent/role file in Claude, Codex, and Cursor, When read,
Then all three document lane selection on two axes (volatility × blast radius) yielding `SPIKE`,
`SPIKE-then-HARDEN`, `FAST`, and `FULL`, plus a `MICRO` lane for one-line fixes in which an
implementer is still spawned but spec/panel/plan are skipped.

### AC-28 [must] [observable] Triage tier bump `low` → `mid`, in all three adapters
Given the installed `lazysitter-triage` agent/role file's resolved model in Claude, Codex, and
Cursor, When compared against each adapter's own `models.json`/`models.env`, Then it resolves to the
`mid` tier in all three, not `low`.

### AC-29 [must] [observable] Triage inclusions must cite evidence
Given the installed `lazysitter-triage` body in Claude, Codex, and Cursor, When read, Then all three
require each panel-inclusion decision (e.g. spawning `frontend-expert`) to cite concrete evidence —
a detected package, directory, or grep hit — rather than a size/complexity guess.

---

## A12 — `devils-advocate` retooling and never-skip swap

### AC-30 [must] [observable] `devils-advocate` tools become `Read, Grep, Glob, Bash`, all three adapters
Given the installed `lazysitter-devils-advocate` agent/role file in Claude, Codex, and Cursor, When
its tool grant (frontmatter `tools:` for Claude, header/body for Codex, non-`readonly` marker for
Cursor) is inspected, Then it reflects `Read, Grep, Glob, Bash` (or Cursor's non-readonly
equivalent), not `Read`-only.

### AC-31 [must] [observable] Mandate is falsifiable-counter-example-or-`NO-CHALLENGE`
Given the installed `lazysitter-devils-advocate` body in Claude, Codex, and Cursor, When read, Then
all three state the mandate is to produce a falsifiable counter-example **or** return
`NO-CHALLENGE` naming the strongest objection considered and why it fails, and none of the three
retain "always object" as the standing mandate.

### AC-32 [must] [observable] `devils-advocate` leaves the never-skip slot; `plan-attack` takes it, all three adapters
Given the installed orchestrator command files (`.claude/commands/lsi.md`, the Codex equivalent, and
`.cursor/rules/lazysitter.mdc` or `.cursor/commands/lsi.md`), When the never-skip enumeration in
each is read, Then none names `devils-advocate`, and all three name red-team's `plan-attack` mode as
occupying the guaranteed slot.

---

## A14 — Tier 8 capability gating; `--auto` opt-in

### AC-33 [must] [internal] `--auto` drift is fixed: neither orchestrator states it as default
Given `core/orchestrator.claude.md` and `core/orchestrator.codex.md`, When both are read, Then
neither describes `--auto` as `(default)` or as the default behavior, and both state the merge gate
and post-merge rollback **HOLD** and summarize for the user unless `--auto` is passed explicitly —
resolving the documented drift where Claude previously read "(default)" and Codex did not.

### AC-34 [must] [observable] `release-agent` requires recorded, verified, non-interactive deploy topology
Given the installed `lazysitter-release-agent` body in Claude, Codex, and Cursor, When read, Then
all three state the agent may not act unless deploy topology is recorded and verified at recon,
including an explicit "is this command non-interactive?" check.

### AC-35 [must] [observable] `rollback-agent` authority is void without an established reversibility record
Given the installed `lazysitter-rollback-agent` body in Claude, Codex, and Cursor, When read, Then
all three state standing rollback authority is void unless reversibility was established via the
architect's one-way-door inventory.

### AC-36 [must] [observable] `monitor-agent` requires a named, reachable signal source
Given the installed `lazysitter-monitor-agent` body in Claude, Codex, and Cursor, When read, Then
all three state the agent does not run without a named, reachable signal source, that the absence is
reported as a gap, and that it must never report "stable" when no signal source exists.

---

## A15 — Model separation enforced

### AC-37 [must] [observable] Recon fails loudly on missing/duplicate `high_alt`
Given the installed `lazysitter-recon` body in Claude, Codex, and Cursor, When read, Then all three
state recon fails loudly (stop, or a named degradation appearing in the final report) when
`high_alt` is unset or resolves to the same value as `high`, and that this named degradation blocks
any downstream claim of red-team blind-spot independence.

### AC-38 [must] [observable] `lazysitter doctor` reports the same degradation for all three adapters
Given an installed project whose Claude, Codex, and Cursor model configs each set (or leave unset,
falling back to) `high_alt == high`, When `lazysitter doctor` is run, Then stdout contains an
explicit model-separation warning naming each of the three adapters affected — not just one.

---

## A17 — Windows correctness

### AC-39 [must] [observable] Build-result classification is mechanical, not prose
Given the installed `lazysitter-code-reviewer` body in Claude, Codex, and Cursor, When read, Then
all three require distinguishing real compile diagnostics from environment failures (locked DLLs,
permission errors, missing SDK) via a mechanical classification, and explicitly forbid deciding this
from an exit code plus a human-language qualifier (e.g. "0 errors, DLL locks only").

### AC-40 [must] [observable] Implementers must preserve encoding and EOL
Given the installed implementer agent body/bodies (`lazysitter-implementer` and/or its `mid`/`high`
variants) in Claude, Codex, and Cursor, When read, Then all three state file encoding and
line-ending style must be preserved on edit, with no silent BOM stripping or CRLF/LF normalization.

---

## Cross-cutting: self-persist verification fault (observed live in this run)

### AC-41 [must] [internal] Orchestrator verifies producer self-persistence; does not trust the report
Given `core/orchestrator.claude.md` and `core/orchestrator.codex.md`, When both are read, Then both
state that after any agent reports having persisted an artifact to `<run-dir>` (per the
`[proc][artifact-persist]` guard), the orchestrator independently confirms the file exists on disk
(a read/glob against the claimed path) before treating the artifact as available — an agent's
self-report of persistence is never sufficient on its own. This directly closes the fault observed
in this run, where `business-analyst` and `triage` each reported writing their artifact and did not.

---

## Supporting scope (A10, A11, A13, A16 — in scope per REQUIREMENT, not in the mandatory-coverage list)

### AC-42 [should] [observable] `ASSUMPTIONS.md` with tagged external facts
Given the installed `lazysitter-architect` body in Claude, Codex, and Cursor, When read, Then all
three require producing `ASSUMPTIONS.md` where each external fact is tagged
`verified-from:<path:line|command>` or `UNVERIFIED`, and a load-bearing `UNVERIFIED` assumption
BLOCKs the gate. (`should`: content check only; the harness cannot exercise an actual gate BLOCK.)

### AC-43 [should] [observable] Fixed non-functional checklist, separate from ACs
Given the installed `lazysitter-architect` body in Claude, Codex, and Cursor, When read, Then all
three require answering a fixed non-functional checklist (cost/capacity, concurrency, ordering,
tenancy, cross-repo contract, ecosystem staleness, build-topology invariants, reversibility) as a
mandate distinct from acceptance criteria.

### AC-44 [should] [observable] Execute-don't-argue is a standing rule for adversarial/verification agents
Given the installed `lazysitter-red-team` and `lazysitter-devils-advocate` bodies in Claude, Codex,
and Cursor, When read, Then all three state the standing rule to execute candidate logic in a
scratch directory outside the project tree rather than reason about it, with at least one
per-ecosystem recipe referenced.

### AC-45 [must] [internal] Run anchoring, lock, and HEAD watchdog documented in both orchestrators
Given `core/orchestrator.claude.md` and `core/orchestrator.codex.md`, When both are read, Then both
state the run directory is anchored via `git rev-parse --show-toplevel` (and nothing else), require
a `.lazysitter/RUN.lock` at Tier 0 that refuses a second concurrent run in the same working tree,
and require halting and re-syncing (not continuing) if `HEAD` changes under the run.

### AC-46 [should] [observable] Reuse-first pack section and footprint accounting mandate
Given the installed `lazysitter-explorer` body (reuse-first "what already solves this?" section with
a NONE-FOUND fallback) and the installed `lazysitter-code-reviewer` body (footprint accounting:
files created vs justified, comments added, dead code orphaned, blocking on unjustified net-new
surface) in Claude, Codex, and Cursor, When read, Then both mandates are present in all three
adapters.

---

## Non-functional criteria

### AC-47 [must] [observable] `node test/smoke.js` passes at every increment
Given the repository at any commit that claims to implement any subset of A1–A17, When
`node test/smoke.js` is run, Then it exits 0 — the pre-existing 45 assertions (agent counts,
file-path existence, preservation, doctor integrity, uninstall cleanup) all still pass, updated
where required for the new agent count (27) and new files (`.lazysitter/knowledge/*`).

### AC-48 [must] [observable] Install / update / uninstall / doctor keep working across all three adapters
Given a fresh temp project, When `lazysitter init`, `lazysitter update`, `lazysitter doctor`, and
`lazysitter uninstall` are each run in sequence, Then each exits 0, and `uninstall` leaves no
orphaned managed file behind for any newly introduced path (agent files, knowledge directory,
orchestrator command files) in any of the three adapters.

### AC-49 [must] [internal] No R1–R7 change is present
Given `core/roster.json` and the full `core/agents/` directory listing, When compared against the
pre-change roster, Then no tier is deleted, no agent beyond `lazysitter-recon` is added, the
explorer pack has no hard word-count cap reintroduced as unbounded (density requirement retained
per A8/R3), no executable harness ships under `core/` or `src/` (e.g. no `dotnet new console`
scratch runner, no bundled DB-local container config), the orchestrator is not demoted (retains gate
ownership, budget, kill switch, audit log per R5), `docs-agent`/`ux-analyst`/`frontend-expert`/
`dependency-auditor`/`triage` all still exist in the roster, and no agent frontmatter grants
`WebFetch` or `WebSearch`.

### AC-50 [must] [internal] No code comments introduced
Given the diff/final state of any file under `core/`, `src/`, or `bin/` touched by this work, When
inspected, Then no inline or block code comments are present in any changed `.js` file (per the
existing project-wide no-comments constraint), consistent with the project's own convention already
observed in `src/`.
