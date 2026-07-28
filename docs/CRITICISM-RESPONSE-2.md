# Response to the field criticism — round 2 (fromEvv, fromP1stonFrontEnd)

Continues [CRITICISM-RESPONSE.md](CRITICISM-RESPONSE.md). Same rules: every decision adjudicated in
both directions, with the evidence that drove it.

| Source | Repo | Runs reviewed |
|---|---|---|
| `critisisms/fromEvv/` | evv-api-v2 — .NET 8, 946 files / 114k LOC, healthcare EVV (PHI + money) | **9 completed runs** |
| `critisisms/fromP1stonFrontEnd/` | P1ston UI — React/TS SPA, 162,863 lines, 1,549 files | 3 runs, **none reached implementation** |

These are the first reviews to cover a **frontend** repo and the first with a large body of
completed runs. Both reach the same verdict shape as round 1 — adopt a subset — and both
independently identify the same root cause, which neither of the first two reviews named cleanly.

---

## The finding that reframes everything: no agent's oracle is the codebase

Stated by the EVV review as S1 and by the frontend review as its finding #2. It is the same
sentence:

> Every gate's oracle is a document produced inside the pipeline. The codebase is an input to
> Tier 2 and is never consulted as an authority again. Nothing in eight tiers asks *"is this how
> this repo does it?"*

Trace it — this is a closed loop, not an opinion:

- `backend-implementer` builds **strictly against the approved plan**. The plan is its oracle.
- `code-reviewer` **diffs the implementation against the approved plan**. The plan is its oracle too.
- `test-author` writes from the acceptance criteria — which never say "use `IGenericRepository`".
- `closing-loop-auditor` compares to the business ask — which says nothing about naming.
- `architect` wrote the plan, so it cannot independently check it.

**Non-conformant code is 100% plan-conformant by construction.** Every gate returns green, correctly.

Measured consequences across the two repos:

| Symptom | Evidence |
|---|---|
| New code ignores repo-wide conventions | `ApiResponse<T>` in **51 files**, 0 in LazySitter's output. `IGenericRepository<T,TKey>` in **32 files**, 0 in LazySitter's output. It invented an `EvvRealtime.Infrastructure` assembly where every other layer is `EvvXService` — and was not internally consistent, putting one repository in the canonical location and its sibling in the new one. |
| File explosion | One run produced **51 new `.cs` files, 24 of them under 15 lines**, for one dashboard feature. A **second full run** existed solely to consolidate them to 22. *The cleanup cost more than the feature.* |
| Duplicate components | `deleteConditionConfirmationModal.tsx` landed beside **six existing confirm modals** and a ~100-member `EnumUiOverlay` registry it never joined — with a green code review. |
| Scratch files committed | `scratch_r1.json` — a captured HTTP response body — tracked at the root of a healthcare API repo, inside a `feat()` commit. It was in the diff, so it was reviewed and passed. |

**This is exactly the failure you described** — *"p1ston ui is 10 years old, so we have all the
components we need… but lazysitter never finds them correctly."* It is not a model-effort problem,
and more careful review will not fix it: **the reviewer is checking the wrong thing.**

---

# Adopted

## B1 — Precedent citation + dual-oracle code-reviewer
**The single highest-leverage change available.** Both reviews rank it first, independently, and
both reject a new agent in favour of it.

- Both implementers gain a required build-report field: **for each new file/export, the `path:line`
  of the existing sibling it imitates — or `NONE-EXISTS` plus the Grep/Glob that proves it.**
- `code-reviewer`'s oracle becomes **plan AND codebase precedent**. It verifies each citation
  against the cited file and **BLOCKS on an unresolvable citation.**

One schema field, one review rule. It is the structural fix for every row in the table above.

## B2 — `reuse-auditor` (Tier 6) — the one genuinely new head both reviews accept
For every new file, export, hook, util or component in the diff: name the existing repo artifact
that already does it, or certify — **with the search that proves it** — that none exists.
Tools `Read, Grep, Glob`. Skipped when the diff adds no new file and no new exported symbol.

**Why no existing tier can do it**, in the frontend review's words: *"`code-reviewer` diffs against
the PLAN, and the plan is what authorised the new file — plan-conformance is logically incapable of
raising 'the plan shouldn't have said to build this.' `architect` could catch it at design time but
is the plan's author, which violates LazySitter's own no-agent-verifies-its-own-work. Reuse-vs-create
is the one judgment left entirely inside the build lineage."*

**Why not just a prompt on the implementer:** asking the builder to argue itself out of building is
self-verification — the exact thing every Tier-6 agent exists to avoid. B1 makes the claim; B2
checks it. Complements, not alternatives.

This is the direct answer to your "must use existing components" requirement.

## B3 — Executable knowledge: a claim you cannot express as a command may not be written down
Both reviews converge on this independently, and both prove why a plain convention document is
**worse than nothing**. The frontend repo's `CLAUDE.md` is wrong in three places today — and
`explorer.md` instructs every run to read it **first**. The pipeline's first act is to ingest three
false facts and label them *"Conventions (with path:line evidence)."*

One claim per row:

```
CLAIM | path:line | ASSERTION (a command that must succeed) | last_verified
```

A preflight re-runs every `ASSERTION`. A failure flips the row to `STALE` and **excludes it from the
context pack**. Non-executable claims are never accepted into the file. A failing assertion *is* the
staleness signal — no separate mechanism needed.

This is your *"if found once then cache them forever"*, made safe. The rot it prevents is not
hypothetical; it is the observed state of that repo.

## B4 — The explorer becomes callable mid-run
Round 1 (A8) moved it off the cheapest tier and granted it `Bash`. Round 2 adds the piece I missed:
**it must be re-callable during the run**, not one frozen pass. This is your *"not like at the first
time need to find them out — find when need to find"*, and it is the frontend review's #1 item.

## B5 — Machine-generated fact table alongside the prose pack
Mechanical facts are the wrong content for a prose summary: concrete constructor signatures,
solution membership, per-project build status, `git check-attr`. One pack asserted *"Jest available
via `npm test`"* — false. Prose pack once (cheap) **plus** a regenerable `FACTS.tsv` (near-zero cost).

## B6 — Every acceptance criterion must name its oracle
`build | test | execution | query-plan | human`. **A must-criterion whose oracle is "reasoning"
blocks.** One run produced **22 acceptance criteria, all 22 tagged `[observable]`**, in a repo where
zero could be observed by any tool the pipeline held. Another had **7 of 19 criteria carrying no
evidence**, its own auditor recording *"only 4 of 19 must-criteria carry real teeth."*

## B7 — Report gate verdicts grouped by **oracle**, not by agent
*"The pipeline manufactures the appearance of 7 independent confirmations from roughly three
distinct oracles: does it match the plan, does it match the spec, does it survive execution. Only
the third is load-bearing."* `code-reviewer` and `test-runner` are **fully correlated** — one oracle,
two green ticks. "3 agents, 1 oracle" is honest; seven green ticks is not.

## B8 — `Read` for the Bash-only cohort; `Glob` for the discovery agents
*"`Read` is not a convenience for these agents; its absence is what made them author broken shell."*
Seven agents hold `Bash` without `Read` and read files through a shell — no line numbers, no
structure, exposed to CRLF and path-with-space hazards. That is the direct cause of a harness-bug
cluster in which **4 criteria were broken and 3 vacuous**, one of which *could never fail*.
`Glob` to `triage`, `code-reviewer`, `devils-advocate`, `frontend-implementer`.

## B9 — Separate `BLOCK-MINE` from `BLOCK-ENVIRONMENT`; exclude pipeline artifacts from product gates
Both blocking verdicts in one run were **out of scope and unfixable by the implementer** — the
pipeline's terminal state was BLOCKED for reasons unrelated to its own work. Separately,
`secrets-scanner` BLOCKed on 21 pre-existing hygiene items, and a gate criterion was spent auditing
the pipeline's *own* bookkeeping.

## B10 — Warning **histogram**, not warning count
A `warnings <= 116` gate lets a nullable warning be traded for a route conflict at zero cost. That
repo carries two `ASP0023` ambiguous-route conflicts — a runtime exception waiting for the first
request — inside a "green" tree as warnings #N of 141.

## B11 — Rename `database-expert` → `data-layer-expert`, client-side stores in scope
The name is load-bearing: `triage` reads it, sees no DB, and skips it **forever** in a frontend repo
— where the real data layer is IndexedDB, `localStorage`, in-memory API caches, and socket-driven
invalidation ordering (a 1,027-line file where mis-ordered invalidation shows stale order data with
no error anywhere). One role file, two invocation modes (Tier-4 advisory, Tier-6 diff audit),
mirroring the security-expert/security-auditor split — *"the one genuinely-independent pairing in
the current roster."*

## B12 — Frozen tests must use the repo's native framework
One run authored its frozen suite as **19 POSIX `.sh` scripts on Windows to verify a .NET solution**,
because adding an xUnit project would perturb the solution file and break another criterion.
*The pipeline's own gate design forced it to abandon the repo's native test framework*, producing 4
harness bugs and 3 vacuous criteria — every one a POSIX text-munging defect that xUnit would not have.

## B13 — `janitor` capability: no agent in 26 has delete authority
`test-author` creates and cannot delete; `test-runner` executes only; `code-reviewer` passed
`scratch_r1.json` because it was plan-conformant. **Adopted as a pre-gate assertion plus narrowly
scoped delete authority**, not a free-roaming agent — delete authority is the most dangerous grant
in the roster, and the frontend review rejects a janitor *agent* for that reason.

## B14 — R7 is OVERTURNED: grant `WebFetch` (never `WebSearch`), allowlisted
Round 1 rejected all network access on sandbox grounds. Both round-2 reviews argue against that with
evidence, and they are right:

- `dependency-auditor`'s **entire mandate** is *"license compatibility and known vulnerabilities."*
  With no network it cannot reach a CVE database or read a license. **Its stated purpose is
  unachievable with its tool grant** — it returns clean, always.
- The distinction I missed: fetching a **named URL** is verifiable and falsifiable; open-ended
  search is a hallucination surface with no falsifiability. Different risk classes.

Adopted narrowly: `WebFetch` only, to `dependency-auditor` and whichever design-time specialist is
woken, **domain-allowlisted** (`learn.microsoft.com`, `docs.aws.amazon.com`, `mongodb.com/docs`,
`github.com/advisories`). `WebSearch` stays rejected. The allowlist rots — review it quarterly.

## B15 — A16's no-comments rule is AMENDED: the premise was wrong
Round 1 elevated *"never add code comments"* to a pipeline-wide ground rule. Round 2 refutes the
premise. Measured in the EVV repo: baseline **7.03%** comment lines; LazySitter's surviving code
**4.23%** — *40% below* norm, the opposite of the reported symptom. And the densest comment block
found was **the most valuable artifact the pipeline produced**: 13 lines documenting an unindexed
250k-document collection scan, stating plainly that the timeout bump was *"a mitigation, not the cure."*

Corrected rule: **match the measured comment density of the sibling files named in your precedent
citation (B1).** What is genuinely forbidden is narrower — AC-IDs and decision references leaking
into shipped source; those belong in `TRACEABILITY.md`.

*(This repo's own near-zero density is what the corrected rule yields here, so the constraint you set
for LazySitter itself is unchanged.)*

---

# Rejected in round 2

| Proposal | Why |
|---|---|
| **Per-layer implementers** (controller / service / repository / persistence) | **Both reviews reject it independently.** The boundary that actually eroded was decided **in the plan, by the architect, before any implementer ran** — splitting the implementer into four would produce four agents faithfully implementing the same wrong plan. The known handoff-loss fault already sits at hits ≥ 2 at a *single* seam; three more seams multiply it. Where layer rules are mechanical (import direction), ~15 lines of ESLint boundary config enforces them on **every** commit including human ones, for zero tokens. |
| **Per-engine DB specialists as standing agents** | Consistent with R2. Dispatch on **detected** evidence only. In the frontend repo, DynamoDB/Postgres/Mongo are all unreachable — three agents `triage` could never wake. The EVV review accepts exactly **one** (`mongo-specialist`) because Mongo is the primary store there and the shipped defect was five links of Mongo-specific knowledge. That is detection-based dispatch working, not a roster of engines. |
| **Accessibility agent** | Real gap, wrong fix. **No agent can render a page** — an a11y agent would read JSX and guess. Re-enable the two disabled `jsx-a11y` lint rules first; revisit when a browser harness lands. |
| **Observability / cost / migration-safety / concurrency agents** | Nothing to observe (no APM, no health endpoint) — *"the missing thing is a Sentry DSN, not a head."* No cloud spend originates from the frontend repo. No migrations exist. Concurrency is an orchestrator locking primitive, not an agent. |
| **Windows-compatibility agent** | Rejected in favour of a **preflight script**. Every Windows issue found is a mechanical assertion; none needs judgment. *"An agent that reviews for Windows-compat after the fact is strictly worse than not generating POSIX shell in the first place."* |
| **Comment-density agent** | One `awk` one-liner against a measured baseline. Belongs in `code-reviewer`. |
| **Knowledge-document owner agent** | The specialist that produces the knowledge writes it. A separate owner adds a handoff and a second source of truth. The *invalidation* is a script, not an agent. |

---

# What this means for the frontend and AWS team requests

You asked for dedicated **React / Angular / Next.js** teams and an **AWS** expert team.

The frontend review is the only one that examined a frontend repo, and it explicitly rejects
framework-shaped team-splitting in favour of **B1 + B2 + B3 + B4** — precedent citation, the
reuse-auditor, executable cached knowledge, and a re-callable explorer. On the evidence, that
quartet *is* the fix for the problem you actually named, and it is framework-agnostic: it works
identically for React, Angular, Next.js, and for the 10-year-old P1ston UI specifically.

What the reviews do **not** settle — because none examined Angular or Next.js — is whether framework
*idiom* expertise is a separate axis worth a head: Angular DI / RxJS / change detection, Next.js
app-router vs pages and the RSC–client boundary, React hook rules. That is a different question from
"which layer writes the file," which is the one they rejected. **It stays open, and it is the first
thing to settle before building anything.**

The AWS request maps onto the same machinery. *"Most of the time we don't want to use any new service
that isn't already used — we can just suggest"* is **B2's reuse test applied to infrastructure**, and
the EVV review supplies the evidence that a generalist is not enough where a service is load-bearing.

## Standing constraints recorded from your instructions

- **Never use Fable** — no Fable model in any tier, any adapter, or any recommendation.
- **Priority order: accuracy > time > memory**, and sometimes accuracy > memory > time. Accuracy is
  never traded.
- **File-handling work requires FAANG-class engineering** — no junior-grade expert may advise on it.
- **Frontend conventions are discovered lazily and cached permanently** (B3 + B4).
