# LazySitter Program Mode — the Enterprise Blueprint

> **Status:** blueprint + **the full deterministic engine is built, tested (79 assertions), and
> runnable** in [`program-mode/`](../program-mode/): the DAG scheduler, the fail-fast gate ladder
> with real JS-native + external gate commands, institutional memory, the Librarian, the
> specialist/tool registry, the decision queue, the traceability spine, fault-injection coverage
> measurement, the concurrency coordinator, durable state, and leases — with the `/lsi-program`
> orchestrator driving it via a CLI. What remains is *agent-layer* work (BRD-intake fan-out, the
> live PM loop, worktree wiring) and a real pilot. The single-feature pipeline is untouched and
> additive throughout.

**The beast is not a fork.** It is one LazySitter with two modes:

- **Feature Mode** — today's pipeline (`/lsi <feature>`), unchanged. A single feature, one
  session, intake → spec → design → build → verify → merge → release.
- **Program Mode** — a superset that wraps Feature Mode and calls it once per feature, adding
  a durable Program Office above it: a requirements graph, rare specialists, a bidirectional PM
  membrane, deterministic quality gates, institutional memory, self-tooling, and multi-session
  durability.

A single feature is the **degenerate case of a program** (a one-node graph). So Feature Mode is
Program Mode with everything above the feature turned off — which is what guarantees the
single-feature path can never regress. Everything program-level is **additive and lazy**: created
on the first program run, dormant and zero-overhead on a single feature.

---

## 0. The thesis

Three demands drove this design: **zero defects**, **token efficiency**, and **no quality
compromise**. They look like they trade off. They don't — they are one lever pulled repeatedly:

> **Graduation.** Move every property you can from a *judgment* (an agent decides — probabilistic,
> ~0.1% wrong, token-costly) to a *proof* (a deterministic check — 0% wrong, ~0 tokens after it's
> built). Then stop paying for the judgment.

This one move recurs at every layer:

| Layer | What graduates | Into what |
|---|---|---|
| Faults | a recurring mistake | a **gate** (deterministic check that blocks it) |
| Work | a recurring task | a **tool** (scaffolder / codemod / generator) |
| Knowledge | a checkable lesson | a gate or tool; the rest → a small **principle** |
| Verification | "an agent eyeballed it" | "a tool proved it" |

LazySitter already contains the seed — the pitfall ledger's rule that "a fault with hits ≥2 and no
guard is a signal to GRADUATE it into a lint rule / harness / preflight, then stop rereading it."
Program Mode makes graduation the **primary strategy**, not a cleanup afterthought.

**Zero-defect is a ratchet, not a wall.** Checkable defects go to *literally zero* (the machine
refuses to merge anything that fails a gate). Semantic defects (wrong-thing-built, subtle logic) go
*very low, not zero* — and every one that escapes is caught post-merge and **its class becomes a new
permanent gate**. The system converges toward zero by tightening after every miss.

---

## 1. Invariants (never break these)

Carried from Feature Mode:

1. **No agent verifies its own work.** Build lineage and verification lineage stay separate.
2. **Tests come from the spec, not the code.** `test-author` runs in parallel with implementers,
   blind to the implementation; tests are frozen and hashed the moment they're authored.
3. **Something always attacks it.** `red-team` always runs, un-anchored (handed facts, never your
   bug-theory), on a **distinct model** from the build lineage.
4. **Consensus must be challenged.** `devils-advocate` runs every round, even on agreement.
5. **Evaluate gates by reading structured state**, never by recalling prose.
6. **The shared substrate holds verified facts only** — never interpretations or labels.
7. **Carry pointers + summaries, not essays.** Re-read a frozen artifact by path when you need it.

New in Program Mode:

8. **State on disk is the truth; sessions are disposable workers.** No authority lives only in a
   context window.
9. **Both membranes are filtered and converged.** Neither agents-up nor PM-down crosses the
   boundary without a relevance filter and internal convergence first.
10. **Graduate knowledge *out* of memory.** The readable base stays small; experience lives in
    gates, tools, and conventions.
11. **Discovery before creation.** Search the registry before building a tool or summoning a
    specialist. Never rebuild what exists.
12. **Deterministic-first.** Never spend an agent on what a tool can prove.

---

## 2. The two modes and when to use which

`/lsi` detects the **unit of work** first:

| Input | Mode | What wakes |
|---|---|---|
| one feature request | **Feature** (today) | the pipeline, one run-dir, budget-only escalation |
| a project / epic / 100-page BRD | **Program** | the Program Office builds a graph, then calls Feature Mode per node |

**Mode-selection rule (the break-even guard).** Program Mode's orchestration overhead is real. Below
a threshold, plain Feature-Mode-per-feature + a human PM beats it. Use Program Mode only when the
work has **genuine cross-feature dependencies**, spans **multiple sessions**, or needs **rare
specialists / a BRD intake**. A handful of independent features is not a program — don't deploy the
battleship for a canoe.

---

## 3. Architecture

```
┌───────────────────────────────────────────────────────────────┐
│ CLIENT ── (only via) ── PM  (non-technical: budget, vendor,     │
│                              scope, business decisions)         │
└───────────────▲──────────────────────┬────────────────────────┘
     escalations │ (authority/info)     │ directives (proposals)
┌───────────────┴──────────────────────▼────────────────────────┐
│ TIER -1  PROGRAM OFFICE   (durable, git-backed, multi-session)  │
│  BRD intake · requirements graph · scheduler · contract         │
│  registry · decision queue · institutional memory · tool        │
│  registry · coordinator of concurrent sessions                  │
└───────────────┬───────────────────────────────────────────────┘
                │ "build feature X against contract C, constraints K"
┌───────────────▼───────────────────────────────────────────────┐
│ TIER 0   FEATURE ORCHESTRATOR  = today's LazySitter run         │
│          (sealed unit — does not know it's in a program)        │
└───────────────┬───────────────────────────────────────────────┘
                │ summon-on-trigger
┌───────────────▼───────────────────────────────────────────────┐
│ SPECIALIST REGISTRY (catalog; instantiate ≤4)                   │
│  AWS · Supabase · Render · Postgres · ML · Python · …           │
│  + standing governance constraints (FinOps · Compliance · a11y) │
└───────────────────────────────────────────────────────────────┘
```

The Feature Orchestrator is a **sealed unit**: it reads its inputs (requirement + contracts +
constraints + a memory pre-brief) and emits verdicts. It never learns whether 1 or 40 siblings
exist. That seal is what stops program concerns from corrupting single-feature behavior.

Durable program state (git-backed):

```
program/
  brd/{SOURCE.md, REGISTER.md, CONFLICTS.md}   # verbatim BRD + traced requirements + client Qs
  PROGRAM-PLAN.json        # the DAG: nodes, edges, status, leases, cost estimates
  CONSTRAINTS.md           # budget / cloud / compliance / SLAs (PM-confirmed)
  contracts/               # frozen interface contracts features build against
  rulings/                 # durable specialist rulings
  playbooks/               # graduated rulings → standing guardrails
  tools/                   # the self-built tool registry
  memory/                  # institutional memory: hot set + cold store
  DECISION-QUEUE.md        # the PM inbox (append-only)
  DECISIONS-LOG.md         # program ADRs + recorded overrides
  gate-state.jsonl         # append-only structured verdicts
  runs/<feature>/          # each = one existing Feature-Mode run-dir, unchanged
```

---

## 4. Program intake — the 100-page BRD front door

A BRD is not a request; it's too big to hold, it's the source of truth for intent, and it's often
**wrong**. Rules:

- **Never paraphrase it into the new source of truth.** A lossy summary that drops page 73's
  compliance clause poisons everything downstream. The BRD is preserved **verbatim**, split into
  stable-ID sections (`BRD-§4.2`), read once, then **retrieved by ID** — never reloaded whole.
- **Read it by fan-out, then reconcile.** (1) a cheap structural pass builds the section index;
  (2) parallel readers each extract atomic requirements from their slice, tagged with source
  `BRD-§`; (3) a **reconciliation pass** finds cross-slice contradictions (page 12 vs page 78) and
  duplicates; (4) the deduped register rolls up into epics → features → the DAG. `business-analyst`
  scales from one agent into this intake team.
- **Traceability spine — nothing ships un-traced:**
  `BRD-§ → requirement → epic → feature → AC → test → verdict`.
  Top-down: every `must` requirement maps to ≥1 feature (a gap surfaces *before* commit).
  Bottom-up: every feature traces to a `BRD-§` (scope creep is flagged). `closing-loop-auditor`
  checks the **verbatim BRD section**, never a paraphrase.
- **Extract constraints.** Budget, cloud, compliance, SLAs already in the BRD → `CONSTRAINTS.md`,
  confirmed with the PM once. What's missing/contradictory → the **first, biggest client-question
  batch** (front-loaded, so the PM does one client round-trip, not forty).
- **The BRD is a suspect witness.** A devil's-advocate pass challenges the requirements themselves,
  and **increments are demoed to the client (via the PM) at milestones** — you catch intent drift
  against a human, not against a document that may be wrong. Traceability to a flawed source is
  false confidence.
- **The BRD changes.** `SOURCE.md` is frozen + hashed; a v2 produces a **diff → which requirements,
  epics, and DAG nodes are invalidated** and must re-run. Contract-drift discipline, applied to the
  founding document.
- **Intake is itself a milestone gate.** The register + DAG + conflict batch get PM (and client)
  sign-off before a single feature runs. Committing 40 features against a misread BRD is the most
  expensive mistake the program can make.

---

## 5. The task network — parallelism and honest time-planning

Model the program as a **DAG**. Nodes = features (each a Feature-Mode run) + foundation tasks +
specialist consultations. Edges = **hard** (B needs a capability A creates) and **resource** (both
need a bottleneck specialist).

**The decoupling move — depend on contracts, not implementations.** An upstream feature publishes a
**frozen interface contract** into `contracts/` *before it's fully built*. Downstream features plan
and build against the frozen contract while upstream is still in Tier 5. The real edge is
`B.plan → A.contract_frozen`, which fires far earlier than `A.merged`. This is Feature Mode's
freeze+hash discipline lifted from intra-feature to inter-feature, and `integration-checker` —
already written to check "concurrent branches" — is the drift alarm.

From the DAG the scheduler computes **topological waves** (what can run now, in parallel) and the
**critical path** (the long pole).

**Honest time-planning.** Agent token-cost is a noisy predictor, and the real critical path is
**human-gated** — PM and client latency dominate. So this is **dependency ordering + surfacing the
long pole**, not a Gantt chart pretending to be a schedule. The biggest time lever is *not* agent
parallelism; it's the scheduler **predicting every decision a wave needs and batching it to the PM
before the wave starts.** Draining the PM's queue once unblocks ten features.

---

## 6. Specialists — the consultants who rarely come

Modeled the **opposite** of Feature Mode's always-present experts. They are advisory **oracles**:
summoned by trigger, they emit a durable ruling, and leave.

**Lifecycle:** trigger fires → Program Office summons → specialist reads the requirement + relevant
contracts + **prior `rulings/` for this domain** (never re-answers a solved question) + **real infra
via read-only MCP/CLI** (an AWS ruling that inspects live infra beats one guessing from memory) →
emits a versioned **ruling** → leaves. Applied ≥2× → the ruling **graduates into a playbook**
(a template / lint rule / preflight), so you rarely summon that specialist twice. This is the
fault-graduation mechanic applied to *expertise*: pay for the brain once, then bank it.

**Team Leads.** Each domain has a durable Lead — the accountable owner of its rulings, the first
escalation stop, and the node that declares "this needs the PM." The Lead is the "leader" in *"if
none of their leaders can provide it, the PM is asked."*

**The registry is a catalog, not an org chart.** Instantiate ≤4 for a given program — most projects
touch 3–4 platforms. Catalog: cloud (AWS/GCP/Azure/Render/Vercel/Fly/Cloudflare), data
(Postgres/Supabase/Redis/Kafka/Search/Vector), languages (Python/Node/Go/Rust/Java), data+ML
(ML/MLOps, Data Eng, Data Science, Data Governance), infra (IaC/K8s/Networking/Secrets/Observability),
integrations (Auth/Payments/Realtime/Mobile).

**Standing governance constraints** (not per-feature advisors — injected into *every* feature's
context): **FinOps** (nobody's watching the cloud bill), **Compliance** (GDPR/HIPAA/SOC2),
**Accessibility**. These three become emergencies in enterprise builds precisely because they're
forgotten. Summon them live only at milestone gates.

---

## 7. The bidirectional PM membrane

The PM is a **non-technical business/client boundary** with exactly three authorities: **budget,
platform/vendor, business decisions (scope/priority/risk).** No technical decision ever reaches the
PM. The team never touches the client — the PM is the sole membrane.

Both directions are **filtered** (not every time) and **converged** (resolve internally, then cross):

**Up (agents → PM).** Escalate only what needs authority/info no agent has: money, credentials/access
(*PM collects from client*), scope/priority, accepting a business risk, a missing external artifact.
Each item is **pre-packaged by a Lead in business terms** — options + cost + impact + recommendation —
so a non-technical PM can decide. Raw tech reaching the PM is a bug in the Lead.

**Down (PM → engineering).** PM input is a **proposal, not a command.** A filter decides if it needs
evaluation; if so, the Tier-4 consensus loop (architect + experts + `devils-advocate`) **evaluates and
debates until satisfied**, then returns to the PM *only if* it surfaces a real decision (infeasible /
10× cost / contradicts a constraint / forces a tradeoff). If it's fine and cheap, it's silently
accepted — no round-trip. `devils-advocate` here argues *"just do what the PM said"* to prevent
reflexive resistance.

**Mandatory-evaluate list** (the filter's never-skip): any PM input touching **money, production data,
security, auth, or vendor lock-in** is evaluated regardless of how trivial it sounds. "Just point it
at the prod DB" is one sentence and a landmine.

**Tie-break:**

| Conflict | Winner | Rule |
|---|---|---|
| Business (budget/vendor/scope/priority) | **PM** | engineering logs a **recorded-risk** if it advised against |
| Technical feasibility | **Engineering** | can't order the impossible — return the closest **feasible options** |
| Infeasible *under a PM constraint* | **becomes a business decision** | relax the constraint or cut scope — PM picks |

The PM owns the *what/why/constraints*; engineering owns the *how* and whether it satisfies the
*what* within the constraints. All of it is **async and batched** through `DECISION-QUEUE.md` — the
PM sees resolved, framed decisions, never a live debate. **The client round-trip is the true
critical path**, so front-load and batch it.

---

## 8. Quality architecture — driving defects to zero

Two defect classes, attacked differently:

| Class | Examples | Target | Mechanism |
|---|---|---|---|
| **Checkable** | dead code, dupes, unused exports, complexity, layering, scope creep, missing tests, secrets, orphan requirements, contract drift | **literally zero** | deterministic gates refuse the merge |
| **Semantic** | wrong thing built, subtle logic bug, misread intent | **very low, not zero** | layered independent + adversarial + blind verification |

**The deterministic gate battery (JS tools).** Small tools run under Bash, emitting compact
machine-readable verdicts in the `lsi-verdict` / `gate-state.jsonl` dialect (5 lines of JSON, not 500
of prose). Ordered **cheapest-first** so a fast gate blocks before the expensive adversarial tail:

| # | Gate (wraps) | Kills | Cost |
|---|---|---|---|
| 1 | secrets / license / CVE | leaked keys, bad licenses, vuln deps | ~0 |
| 2 | lint + format + no-debug-cruft | commented-out code, `console.log`, TODO graveyards | ~0 |
| 3 | typecheck + build (cached once/commit) | type errors, hallucinated APIs, broken builds | ~0 |
| 4 | **dead-code / orphan** (knip, ts-prune, madge) | **dead/unused/unreferenced code** | ~0 |
| 5 | **duplication** (jscpd / AST) | feature 30 reimplements feature 8 | ~0 |
| 6 | complexity / size budgets | "bad quality" → a hard threshold | ~0 |
| 7 | architecture fitness (dependency-cruiser) | layering violations, import cycles, drift | ~0 |
| 8 | **diff-scope enforcer** | files touched ≠ files the plan declared → scope creep / stray scaffolding | ~0 |
| 9 | **traceability linter** | orphan requirements, unrequested features, untested must-ACs | ~0 |
| 10 | mutation testing (Stryker) | **toothless tests** — proves tests fail on real bugs | moderate (critical paths) |

Gates 4/5/8/9 directly kill the "dirty code / dupes / scope creep / unrequested code" enemies —
**none exist in LazySitter today.** Build the first four first; 5–10 are milestone-scale additions.

**The ratchet.** Every semantic defect that escapes is caught post-merge (monitor → rollback) and
**its class is forged into a new permanent gate.** The battery grows; the escape rate falls.

**Measure it or it's theater.** Periodic **fault injection** — inject known defects and measure what
fraction the gates catch — is the only way to know how close to zero you actually are. A defect class
with no gate passes silently and looks exactly like success.

**Honest floor.** `test-author` and implementer are both LLMs reasoning from the same (possibly wrong)
spec — **correlated blindness** is the irreducible risk. Blind separation reduces it; nothing erases it.

---

## 9. Efficiency — token-optimized without quality loss

Each lever is an existing LazySitter mechanic scaled up. Tokens go **down because certainty goes up**:

| Lever | Seed | Scaled |
|---|---|---|
| Deterministic-first | pitfall graduation | the §8 gate battery |
| Retrieval over exploration | "one context pack, nobody re-explores" | a JS context-builder hands each agent its minimal slice |
| Cache ground truth, not judgment | build/typecheck/test once per commit, shared raw | one build serves every verifier program-wide |
| Model tiering | high/mid/low + distinct red-team | cheap models mechanical; expensive only for design/adversarial/intent |
| Fail-fast ladder | "secrets-scanner cheap, always" | cheapest deterministic gates first |
| Freeze + reuse | spec/contract freeze | contracts, rulings, playbooks, tools computed once |
| Incremental scope | diff-scoped review | verify the diff / affected subgraph; full sweep at milestones |

The expensive probabilistic agents shrink to the **semantic core** (design, intent, attack); cheap
deterministic tools absorb everything checkable.

---

## 10. Institutional memory — experience without a gigantic file

The trap: a flat markdown ledger you **read** to use eventually costs more than it saves, and then
learning makes you *slower*. The fix: **history need not be read to be used.** Real experience is
knowledge moving *out* of active memory — into reflexes (gates), tools, and conventions — not piling
up inside it.

**The lifecycle — a fault climbs a ladder *out* of memory:**

```
CAPTURE (raw row, an inbox) → DEDUP+COUNT (anecdote vs pattern)
   → GRADUATE to a gate or tool  (leaves text entirely, ~0 tokens, never forgets)
   → ABSTRACT to one actionable principle  (archive the incidents)
   → RETIRE  (cold archive; never injected)
```

**Two decouplings make "gigantic doesn't slow you down" literally true:**

1. **Graduation** removes the guardable majority from text — it becomes a check that costs nothing.
2. **Retrieval-bounded injection.** Whatever stays as text is never loaded whole. Every lesson carries
   trigger metadata on **two axes — `situation × producer`** (what tech/operation × which agent/team).
   Before a task, retrieve only the **top-K** (fixed, ~5–8) ranked by `severity × recency × relevance`.
   Injection is **O(K), constant — independent of base size.** The base can hold 50,000 lessons; the
   agent reads 6.

**Storage.** Hot set = a small, curated, human-readable file (graduated principles + active lessons,
kept small *by the lifecycle*). Cold store = a structured store (append-only JSONL / SQLite), never
loaded wholesale, only queried by tag — an indexed query returns the top-5 for
`{payments, backend-implementer}` in O(log n) whether there are 50 rows or 50,000.

**Team-specific awareness.** Index by **producer**: before spawning `backend-implementer`, inject the
top faults *that agent-type* historically triggers as a targeted pre-brief, and weight the matching
verifier harder. That's "the reviewer knows the backend team forgets idempotency."

**Always-on tier.** A tiny set of catastrophic lessons (data-loss, security, auth) is injected
regardless of trigger — the safety net for retrieval false-negatives.

**The Librarian, with teeth.** A periodic consolidation pass (amortized at milestones): merge
near-duplicates, generalize clusters into principles, promote graduation candidates, **retire stale
lessons via a review-by date**, and **prune the noisy** (injected often, never caught anything).
Promotion is bidirectional — a misdiagnosed "lesson" is **demoted**, not just accumulated.

**Prove it or rip it out.** Measure **fault-recurrence rate** (must trend down — the one metric that
says learning is real), graduation rate, hot-set size (should plateau), injection precision. If
recurrence isn't falling, the loop is decoration.

---

## 11. Self-tooling — the team builds its own platform

The productive twin of fault-graduation: recurring **work** graduates into a **tool**. Knowledge
exits text into a **gate** (defensive), a **tool** (productive), or a **principle** (irreducible).
LazySitter already anticipates this — the visual/behavioral gate is "a generic slot; the project owns
the harness." The framework ships the **factory and the slots**; the project's toolkit accretes.

**The rule that makes it safe:** a tool the system builds for itself is **just another artifact** —
run it through the same factory (spec → build → verify → gate → own → retire). A self-built tool that
skips the pipeline is ungoverned code in the heart of your quality system.

**Discovery before creation.** Search the tool registry first (retrieved by `situation × producer`,
like lessons). The duplication-detector and **Janitor police tools too** — an unused tool is retired.

**Authorization ladder:**

| Tool | Authorized by | Bar |
|---|---|---|
| ephemeral helper (dies with one feature) | the agent, freely | not registered |
| reusable tool (across features) | Program Office | measured recurrence + projected savings > build+maintenance cost |
| trust-boundary / expensive tool | **PM** (investment decision via the membrane) | ROI scoped by engineering, PM approves the spend |
| meta-tooling (tools that build tools; framework changes) | **human red line** | the self-modification boundary |

**Trust boundary.** Provenance separation extends to tools: **a build-lineage tool cannot be the sole
verifier of that lineage's output** (else "I verified myself" is laundered through a tool). Self-built
tools **stay sandboxed** — building a tool grants no new authority. A tool is a **defect multiplier**,
so it must be the most-tested code in the repo, with an owner and its own CI — an unowned, untested
tool *slows* development, the exact failure it was meant to prevent.

---

## 12. Durability and concurrency

**The rule:** state on disk is the truth; sessions are disposable, interchangeable workers.

**Resume (serial — build this first).** A new session **rehydrates** from `PROGRAM-PLAN.json`, and
**checkpoints at tier boundaries**: it skips every tier whose artifact already exists and continues
from the first missing one. **Crash = planned end** — a dead session's lease goes stale and the next
session resumes from the last checkpoint. Reuses the harness's `Workflow resumeFromRunId` (cached
prefix), GSD `pause-work`/`resume-work`, and the run-dir artifacts. *Requirement: every step is
idempotent or guarded by a done-marker.*

**Concurrency (multiple sessions — defer to a later stage; highest-risk part).**

- **Claim-by-lease + heartbeat.** A session writes `{node, session-id, heartbeat}` (timestamps from
  **Bash `date`** — workflow scripts can't call `Date.now()`). A stale heartbeat → reclaim + resume.
- **Disjoint work only.** The scheduler hands concurrent sessions nodes with **non-overlapping file
  sets** (the diff-scope enforcer supplies the file set); overlapping features are serialized.
- **Worktree isolation.** Each concurrent feature builds in its own git worktree/branch.
- **Parallel build, serial merge.** Features integrate through **one gate, in order** (the
  Release-Train Conductor); `integration-checker` runs vs devBase + concurrent branches.
- **Shared state is append-only or single-writer.** JSONL logs for multi-writer; optimistic
  concurrency (Artifact-style `baseVersion` → conflict) for the plan.

**Coordinator, not peer.** One session runs the Program Office (owns plan writes, scheduling, the PM
queue); others are workers that claim nodes, build in worktrees, **append** to logs, and push
branches. **Git is the atomic substrate** — branches, atomic commits, push-conflict-as-optimistic-check.
A worker that can't reach the coordinator **blocks, not guesses** (a partitioned worker inventing
scheduling is how you get two implementations of one feature).

---

## 13. The new roster

Additive agents/roles, on top of the existing 26. They **emerge at scale** — do not stand them all up
for a 6-feature program.

| Role | Why it's missing today | Owns |
|---|---|---|
| **Janitor / Codebase Steward** | every agent *adds* code; none *removes* it | dead/orphan/dup removal (proposes, never auto-deletes) |
| **Consolidation / Refactor** | dupe-detector finds; someone must merge | DRY-ing cross-feature reimplementations |
| **Architecture Guardian** | per-feature architect has no cross-feature view | dependency-cruiser rules; prevents structural drift |
| **Requirements Tracer** | TRACEABILITY is per-feature | the whole BRD-§→verdict chain; no orphans |
| **Migration / Schema-evolution** | db-expert designs; nobody owns safe evolution | reversible, forward/backward-safe migrations |
| **Performance / Load** | nobody tests the BRD's SLAs | perf gates vs declared SLAs |
| **Resilience / Chaos** | red-team attacks one feature | program-level failure injection |
| **Release-Train Conductor** | release-agent ships one feature | merge order + canary across N features |
| **Knowledge Librarian** | rulings/playbooks/tools rot | consolidation, expiry, graduation, dedup |
| **Escalation Packager** | Leads must translate tech→business | turns blockers into PM-decidable options |

Plus the specialist catalog (§6), instantiated ≤4 per program.

---

## 14. The cut list (the design's own Janitor)

What is deliberately **not** built up front, to stop the architecture from accreting the same dead
weight it polices:

- **Concurrent sessions** — deferred. Serial resume delivers ~90% of the value at ~10% of the risk.
  Concurrency is the highest-risk, lowest-early-value piece; add it only when proven necessary, and
  keep it dumb (disjoint worktrees + git referee) before adding any coordinator sophistication.
- **The full specialist registry** — a catalog, not a standing org. Instantiate ≤4.
- **Gates 5–10** — staged. The first four buy ~80% of the quality floor.
- **Program-scale roles** — emerge past ~15 features. A single coordinator does it inline before then.
- **Heavy BRD reconciliation** — gated behind a "is this BRD clean or a mess?" triage.

---

## 15. Honest limitations (permanent — manage, don't pretend to erase)

1. **Correlated LLM blindness.** `test-author` and implementer can misread the same ambiguous spec
   the same way. The irreducible core of "semantic defects → low, not zero."
2. **Unproven.** No empirical validation. The design is complex enough that **its own bugs could
   exceed the defects it prevents.** *Prove it on a small program before believing any scale claim.*
3. **Cost/ROI unknown.** ~26 agents × rounds × per-feature × N + specialists + gates + retries could
   be 10–100× a naive approach for uncertain marginal quality. Measure cost per feature; it must
   trend down as gates and playbooks graduate.
4. **PM is bus-factor-1.** One non-technical human is the sole client membrane and a hard throughput
   bottleneck. No backup, no handoff design yet.
5. **Retrieval false-negatives.** A lesson whose trigger doesn't match won't surface — mitigated but
   not solved by the always-on tier.
6. **Gate false-positive tax.** A large battery *will* have false positives that make agents waste
   tokens fighting gates or route around them. Tune for zero false positives; measure it.
7. **Stateful rollback has limits.** Once a destructive migration ran and dependents built on it, you
   can't `git revert`. Needs forward-only migrations + saga-style compensation.
8. **The orchestration layer is an attack surface.** A verbatim-ingested BRD and fetched third-party
   data are **prompt-injection vectors** straight into agents that hold live MCP credentials. Threat-
   model the machine, not just the features.
9. **"Done" ≠ merged.** Provisioning, real-data migrations, compliance signoff, runbooks are not git
   merges. The operational layer is under-designed and needs its own definition of done.

---

## 16. Phased rollout

Build in this order; advance only on measured triggers, not calendar.

1. **[BUILT] Durable program state + serial resume.** `program/` on disk, rehydrate,
   tier-checkpoints, lease protocol — `program-mode/lib/{plan,store,lease}.js`.
2. **[BUILT] DAG scheduler + contract-first decoupling.** Waves + critical path + contract-first
   readiness + disjoint-file concurrency selection — `program-mode/lib/scheduler.js`.
3. **[BUILT — ladder] Gates 1–4** (secrets, lint, typecheck+build, dead-code). The fail-fast
   ladder + `lsi-verdict` emission is in `program-mode/lib/gates.js`; wiring the four real gate
   commands into the Feature-Mode Tier-6 gate is the remaining step.
4. **[BUILT — data layer] The async PM membrane** + `DECISION-QUEUE`. Business-only enqueue,
   parking/resume, client-batch split — `program-mode/lib/queue.js`. The live PM loop is
   orchestrator work.
5. **[BUILT — data layer] Specialist registry** (catalog + discovery-before-creation +
   ruling→playbook graduation) — `program-mode/lib/registry.js`.
6. **[BUILT] Institutional memory** (lifecycle + `situation × producer` retrieval + the Librarian
   consolidation pass) — `program-mode/lib/{memory,librarian}.js`.
7. **[BUILT — same registry] Self-tooling registry** (discovery-before-creation + graduation).
8. **[BUILT — spine] BRD intake** traceability (`BRD-§→feature→AC→test→verdict`, coverage +
   scope-creep gate) — `program-mode/lib/trace.js`. The parallel-reader fan-out is orchestrator work.
9. **[BUILT] Fault injection** to *measure* gate coverage — `program-mode/lib/faultinject.js`
   (`cli.js coverage`). Program roles + heavy gates as scale demands.
10. **[BUILT — mechanism] Concurrent sessions** — the coordinator's disjoint-assignment +
    crash-reconcile is in `program-mode/lib/coordinator.js`; worktree/merge wiring is the
    remaining orchestrator step, still gated on a real need.

---

## 17. Success metrics

The program is working only if these move:

- **Fault-recurrence rate** ↓ (the headline — is experience real?)
- **Graduation rate** (faults/work → gates/tools) ↑ then plateau
- **Hot memory set size** — plateaus, doesn't grow unbounded
- **Injection precision** — injected lessons that actually catch something ↑
- **Gate coverage** (via fault injection) — fraction of injected defects caught ↑
- **Escape rate** (defects past the gate, caught post-merge) ↓
- **Cost per feature** ↓ over the program's life

---

### One-paragraph synthesis

Keep the feature pipeline exactly as it is and treat one run as a sealed "build one feature" unit.
Above it, build a durable, git-backed **Program Office** that: intakes a 100-page BRD verbatim into a
traced requirements graph; schedules features as a **contract-decoupled DAG** for real parallelism;
summons **rare specialists** who leave reusable rulings that graduate into guardrails; runs a
**bidirectional PM membrane** where escalations go up only for business authority and PM directives
come down as proposals engineering evaluates; drives **checkable defects to zero** with a fail-fast
deterministic gate battery and **semantic defects toward zero** with a ratchet that forges a new gate
after every escape; keeps **institutional memory** small and fast by graduating faults out of text
into gates/tools and retrieving the rest in fixed top-K; lets the team **build its own tools** through
the same governed factory; and survives sessions because **state lives on disk and sessions are
disposable**. Every one of these is an existing LazySitter instinct — graduation, freeze+hash,
un-anchored adversaries, facts-not-essays, evaluate-by-reading — scaled one level up. And all of it
stays additive, so the very same machinery still runs a single feature at near-zero overhead.
