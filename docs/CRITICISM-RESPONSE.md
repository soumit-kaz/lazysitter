# Response to the field criticism — what LazySitter changes, and what it refuses to

Two independent staff-engineer reviews were written on 2026-07-28 against real LazySitter runs:

| Source | Repo | Runs reviewed | Findings |
|---|---|---|---|
| `critisisms/fromP1stonDestopWidget/` | P1DesktopWidget (Electron/TS, 3 packages) | 4 | C1–C14 |
| `critisisms/fromP1stonProject/` | P1stonLambdaRepo (.NET, 53 projects) | 6 | S1–S14, C1–C10, A/B/C/D/E roster gaps, T/W/G tool gaps |

Both reviewers reached the same top-line verdict independently: **do not adopt as-is; adopt a
subset**. Both named the same three root causes. That convergence, from two reviewers looking at
two unrelated codebases, is the strongest signal in the record and it is what this response is
organised around.

## The reading that drives every decision below

The reviews mix two different kinds of finding and label them honestly:

- **[DESIGN]** — wrong even in a good repo. These are LazySitter's bugs. **All of them are adopted.**
- **[FIT]** — wrong for *that* repo. These are real failures, but the failure is that LazySitter
  ran twelve agents against capabilities the repo did not have and still reported PASS.

The reviewers' prescription for the [FIT] class is "delete these tiers." That prescription is
correct **for those two repos** and wrong **for the framework**, because deleting the test lineage
makes LazySitter strictly worse in a repo that has tests. The framework-level fix for every [FIT]
finding is the same single mechanism: **measure the repo's actual verification substrate before
the pipeline commits to a shape, and refuse to emit a green signal a gate could not earn.**

That is the difference between "twelve agents that cannot run here" and "twelve agents that did
not run here, and the report says so." Both reviews document that LazySitter *reported* its own
degradation honestly — in `MANIFEST.md`, `LIMITATIONS.md`, `TRACEABILITY.md`, and a `degraded`
boolean — and then exited GREEN anyway. The information was already there. The enforcement was not.

**Accuracy rule applied throughout:** where a change trades accuracy for cost, accuracy wins. Where
a change buys both (and most of the big ones do — a defect killed at plan time is cheaper *and*
more accurate than one killed after implementation), it is adopted without hesitation.

---

# Part 1 — Adopted in full

## A1. Capability gating: no gate may report green on a substrate it never had
*Sources: widget C1, C9; project S1, S6, C5; tool G2*

**The finding.** `dotnet test P1stonLambda.sln` exits **0 in 3 seconds having run zero tests**.
`npm run lint` in the widget repo exits **2** because `.eslintrc` does not exist. Twelve agents in
one repo and six in the other are load-bearing on capabilities that are absent, and the absence
surfaces as `degraded: true` followed by PASS — four times in one repo, six in the other. The
orchestrator's own rule already said `degraded:true` is NOT a pass.

**Verdict: ADOPT, as the framework's highest-priority fix.**

**Justification.** This is the only finding that makes every *other* finding invisible. A false
green is undetectable by construction — nobody investigates a passing gate. And note the precise
shape of the .NET case: the failure is not a missing command, it is a command that **succeeds
while doing nothing**. Any check written as "did the test command exit 0" passes. The check must
be "how many tests were discovered and executed," which is a different question.

**What changes.**
- A new Tier-0 **recon** step produces a machine-readable `CAPABILITIES.md`: test-runner present
  *and discovering >0 tests*, lint runnable *and exiting 0 on a no-op*, typecheck, build, CI
  presence, deploy topology, branch inventory, model-tier separation, observability surface.
- Every capability is `available | absent | present-but-inert`. `present-but-inert` is the
  `dotnet test → 0 tests` case and is treated as **worse than absent**, because it lies.
- The merge gate hard-BLOCKs on any unresolved `degraded:true`. A degraded gate may only close
  through an explicit, recorded, per-run human waiver — never by proceeding.
- Agents whose substrate is `absent` are not spawned at all, and their absence is named in the
  final report as a **named coverage gap**, not silently.

**Why not the reviewers' "delete those tiers."** Because the same twelve agents are the entire
value of LazySitter in a repo with a real suite. Deleting them optimises for two repos and breaks
the general case. Gating produces the same behaviour in those two repos — the agents do not run —
while preserving the framework everywhere else. The reviewers labelled these findings [FIT]
themselves.

## A2. The adversary moves before the build
*Sources: project S2, C2, E1, 06-§5; widget C4*

**The finding.** `security-expert` specified a sanitizer as strip-then-decode. The architect
ratified it (`PLAN.md:414`, "ACCEPTED"). The implementer built it faithfully. `code-reviewer`
PASSED it — **correctly**, because conformance to the plan is its entire mandate. `red-team` then
broke it in one step by executing the logic. The pre-existing naive regex the plan told the
implementer *not* to reuse **did not have the bug**: the design tier authored a live stored-XSS
into code that previously had none.

**Verdict: ADOPT. This is the highest value-per-unit-cost change in the entire response.**

**Justification.** A plan-conformance reviewer can never catch a defective plan; PASS is the right
answer to the question it was asked. As long as the only non-plan-anchored agent runs last, every
design error is paid for at implementation prices — an implementation, a build, a review, a BLOCK,
a retry, and a re-verification, all after the defect was written down in markdown where three
agents read and approved it. Moving the same adversary earlier costs nothing and is the rare
change that is simultaneously more accurate, faster, and cheaper.

**What changes.** `red-team` gains a **`plan-attack` mode** (structurally identical to
`test-runner`'s existing `teeth-check` mode): same agent, same distinct `high_alt` model, same
un-anchoring, different input — it attacks `PLAN.md` before implementation, with a standing
mandate to *execute* candidate logic rather than argue about it. Tier 4 does not close until the
plan survives it.

**Why a mode and not a new `plan-adversary` agent** (which is what the review proposes): the
guarantee that makes red-team work is its distinct model plus its refusal to reason where it can
observe. A mode inherits both by construction. A second agent would have to re-declare them and
could drift. Roster growth is also the direct enemy of "fastest and cheapest," and the same review
argues the roster should get *sharper, not bigger*.

## A3. Sanctioned interrupt #2 — `FACT-BLOCK` for questions no agent can answer
*Sources: widget C5, C7; project S7, S10*

**The finding.** Only `business-analyst` may ask the human, and only about scope/intent. Every
factual unknown discovered later becomes a confident guess. Traced in both repos:

| Unknown | Askable? | Outcome |
|---|---|---|
| Does P21 `order_date` mean the PO date? | No — factual | punted to a report section |
| Do all FoxPro deployments have `po_lo_code`? | No — factual | punted |
| Is the Kinetic `customerName` mapping real? | No — factual | **ruled wrong**; shipped a silent data gap |
| Is `supplierId` dead code? | No — factual | guessed "dead"; **wrong**, caught by luck |
| Does `IWorkspaceRepository` expose `TransactWriteItems`? | No — factual | assumed no → data-loss bug |
| Which date format is canonical? | No — factual | wrong for three runs + a breaking API change |

**Verdict: ADOPT.** And note the pipeline already broke its own rule to be useful — one run's
`FINDINGS.md` escalated exactly this class of question to the user, and *that is why the run was
useful*. A rule the system routes around is a wrong rule.

**What changes.** Any agent may raise a `FACT-BLOCK`: a question that is (a) load-bearing on
correctness, (b) unanswerable from the repo or any available tool, and (c) answerable by a human
in one line. The orchestrator batches them and asks **once per tier**, not once per question. A
`FACT-BLOCK` may never be closed by an architect ruling.

**The cost objection, answered.** This adds human interrupts to a pipeline sold as autonomous. But
the alternative is measured: five unasked factual questions in one run produced three shipped
defects. The reviewers also observe that the questions the human *volunteered unprompted* were the
highest-value inputs in the entire record. One batched question per tier is cheap; a silent wrong
mapping that nobody notices until a customer asks is not.

## A4. Fact disputes and one-way decisions are removed from the architect's tie-break
*Sources: widget C7; project S10*

**The finding.** A time-boxed 2-round tie-break is right for *preference* disputes and
systematically wrong for two other classes: disputes about an external fact neither disputant can
observe (more rounds do not converge — both sides reason from the same absent evidence), and
one-way decisions (DynamoDB key design: changing a partition key means rewriting every item).

**Verdict: ADOPT.** Every disagreement is now classified before it is resolved:

- **preference** → architect rules after ≤2 rounds and logs the override. Unchanged.
- **fact** → ruling is **forbidden**. Resolve by observation (probe, grep with hit count,
  execution) or raise a `FACT-BLOCK`. An architect ruling on a fact is a coin flip recorded as a
  decision, and the record contains the coin landing wrong.
- **one-way / irreversible** → requires explicit human sign-off. Never an architect tie-break.

**Justification for the extra friction.** "Logged" buys nothing when nobody reads the log — and in
both repos, nothing did. Worse, the log is *persuasive*: the wrong `customerName` ruling reads as
a careful, evidence-cited correction of the user's premise. A future reader who does read it comes
away **more** confident of the wrong thing. Classification is what stops the mechanism from
manufacturing confidence it has not earned.

## A5. Knowledge becomes durable and committed; runs compound
*Sources: widget C14; project C7, S4, A-principle, E3, 06-§6*

**The finding.** 204 LazySitter files in one repo; **git tracks zero**. Decision logs, accepted
risks, and limitation ledgers live in gitignored directories that do not survive a clone, never
appear in a PR, are invisible to the other five engineers, and die to `git clean -xfd`. The
`PROJECT-PITFALLS.md` that would have carried "release notes are master-table, not per-tenant"
from run 2 to run 6 was designed, referenced by name, and **never created** — so the same wrong
blocker was raised three weeks later. In the widget repo it exists and its Faults block is a
literal placeholder after four runs that discovered six reusable facts.

**Verdict: ADOPT, and this is the largest combined accuracy-and-cost win available.**

**Justification.** These are usually a trade-off; here they are the same change. The current model
re-derives the codebase every run into a throwaway pack and forbids downstream agents from looking
again — simultaneously slow (hours re-deriving) and inaccurate (the pack's one omission is
structurally invisible to seven tiers). Persisting it fixes both. And it puts the knowledge where
a **human** can correct it, which is the cheapest accuracy improvement anywhere in this system.

**What changes.** A tracked, repo-root `.lazysitter/knowledge/` directory: `CAPABILITIES.md`,
`CONVENTIONS.md` (each claim carrying its probe command, hit count, and the SHA it was verified
at), `PROJECT-PITFALLS.md`, `ONE-WAY-DOORS.md`, `SECRETS-BASELINE.md`, and per-decision ADRs.
Created at onboarding, read first by every run, refreshed on drift. The installer already writes a
tracked `.lazysitter/manifest.json`, so the precedent and the location exist. Install and `doctor`
both warn when the path is gitignored.

## A6. Baseline-scoped scanning replaces diff-scoped scanning
*Sources: widget C11; project S8; tool W4*

**The finding.** `secrets-scanner` scans "the staged/changed files." Both repos' secrets are all
**pre-existing**: a committed `AKIA…` key and secret in `src/config.ts:10-11` shipped inside every
NSIS installer with `asar: false`; four documented CRITICAL findings in the other repo including
SMTP credentials and an SFTP admin password with the env-var lookup commented out directly above
it. Ten runs, `verdict: CLEAN` every time. `grep -rn "AKIA" .claude/lazysitter/` returns nothing.

**Verdict: ADOPT.** A diff-scoped scanner in a repo whose secrets are all pre-existing is a gate
that can only ever return CLEAN — it is not merely unhelpful, it is **actively misleading** to
anyone who reads the gate instead of the security doc.

**What changes.** Full-repo baseline once at onboarding, cached in `SECRETS-BASELINE.md`;
per-run scans report **delta vs baseline**, so "clean" means "added nothing" rather than "there is
nothing." Unresolved pre-existing criticals become a standing disclosure surfaced in every final
report until they are fixed or explicitly accepted. Same treatment for `dependency-auditor`, which
would otherwise never see `NU1903: Newtonsoft.Json 12.0.3 has a known high severity vulnerability`
because nobody *added* it during a run. Machine-specific absolute-path literals
(`[A-Za-z]:\\`, `\\\\`, `/Users/`) fold into the same scan.

## A7. Self-issued verdicts are marked, and cannot close a blocking finding
*Sources: project S5, C4; tool G1*

**The finding.** One run's final four verdicts are the orchestrator clearing **its own** blocking
findings, recorded `"degraded": false`, in the same schema and with the same authority as the
independent BLOCKs above them, with the caveat buried in prose at the end of a summary string. By
later runs the audit logs read `orchestrator | fix`, `orchestrator | build`, `orchestrator | gate`
and `backend-implementer` appears in **neither run**. In the widget repo: eleven code changes,
zero implementer spawns.

**Verdict: ADOPT both halves.**

**What changes.**
1. `verified_by` and `independent: true|false` join the `lsi-verdict` schema. The gate refuses
   GREEN when any blocking finding was cleared with `independent: false`.
2. The orchestrator may not `Edit`/`Write` source. Even a one-line fix spawns an implementer.

**The cost objection, answered honestly.** Orchestrator-applied fixes were *faster*, and the
stripped-down runs that did this produced more correctness per minute than the full pipeline. But
what they voided is not ceremony: the no-comments rule (which exists only in the implementer
definitions, so the user had to restate it manually as a standing directive), the "no agent
verifies its own work" ground rule, and plan conformance. The framework's answer must not be "the
orchestrator is trusted." It is a **micro-fix lane** (see A9): the implementer is still spawned,
but without spec, panel, or plan ceremony — the guarantee is kept and the cost is not.

## A8. The explorer stops being a single point of failure — without letting everyone re-explore
*Sources: widget C2, C13; project C1, S4, A1/A2, tool T2*

**The finding.** "Nobody re-explores independently" is presented as an efficiency win. It is a
correctness hazard, because an explorer omission is structurally invisible to every tier below it.
Two concrete failures:

- The widget explorer looked at exactly **two branches** in a repo where customer behaviour lives
  on ~48 customer-named branches, concluded a `customerName` mapping did not exist, and the
  architect ruled on it. Commit `5d68a68` — *"Ellision: Kinetic: map customerName"* — adds exactly
  that mapping and is on `v2_LTS_Production`. Four gates "confirmed" it. **That is one lookup,
  quoted four times.**
- The .NET explorer's 393-line pack contains no date-format convention. The pipeline standardised
  on `yyyy-MM-dd` and wrote it into the plan, 65 acceptance criteria, the API document handed to
  the frontend team, and shipped code. A later run found the answer in **eleven minutes** with six
  citations — `grep -rn 'ToString("MM-'` would have found it.

Then it compounded: one run "verified" the frontend contract against the frontend's in-flight
branch, which had itself been written from **this pipeline's own** API document. Two systems
agreeing because one told the other.

**Verdict: ADOPT — but not by deleting the rule.**

**Justification.** "Nobody re-explores" is a real and substantial cost saver, and unrestricted
re-exploration by seven tiers is exactly the token cost the user wants removed. The failure is not
that the pack is shared; it is that the pack is **unfalsifiable**. Three changes fix it without
paying for seven explorations:

1. **The explorer gets `Bash`.** It currently has `Read, Grep, Glob, Write` and therefore
   *cannot run* `git branch -a`, cannot count grep hits, and cannot execute a probe. Every
   mechanical failure above was a command it was not equipped to run.
2. **Every convention claim carries its probe** — the exact command, the hit count, the
   `path:line` citations, and the SHA it was verified at. A claim without a probe is not a fact.
3. **A narrow re-probe right.** Any downstream agent may *re-run a cited probe* to check a pack
   fact — it may not go re-explore. A contradicted pack fact BLOCKS and invalidates every verdict
   that rested on it. This costs one command, not one exploration, and it converts "five-fold
   confirmation of a single unchecked fact" into a detectable contradiction.
4. **Mandatory probes** before the pack may be promoted: branch inventory
   (`git branch -a` + `git log --all --grep=<feature nouns>`), the convention bank (date/number
   formatting, JSON casing, enum wire values, error shape, logging, null handling), and an
   explicit **"does this already exist?"** section that must name what was searched even when the
   answer is NONE-FOUND.
5. **Tier bump `low` → `mid`.** A `low`-tier one-pass summary of 17.5 kLOC across three packages
   and ten ERP dialects — the highest-leverage agent in the pipeline — was under-tiered.

**Modified from the review:** the reviews say "remove the ~700-word cap." Adopted as a *section
completeness* requirement rather than as unbounded length. The pitfall ledger already graduated
`[proc][context-bloat]`; an unbounded pack reintroduces the fault it fixed. Density is the
requirement, not volume.

## A9. Routing by volatility × blast radius, not by complexity
*Sources: project 06-§4, C3, E2; widget C6, C9*

**The finding, stated as the reviewers do:** *"The framework spent its heaviest machinery on the
safest change and its lightest on the most dangerous one."*

- Run 2 — an admin-only release-notes screen whose data model changed twice within 48 hours —
  was classified COMPLEX and got the full lane: a 65-criterion frozen spec, a four-expert panel, a
  440-line plan **longer than the code it produced**, 18h36m, 1,684 lines of process prose. Two
  days later the data model at the centre of it was deleted outright. Every artifact died.
- Run 6 — a one-shot, destructive, live-database, 600-row migration with no rollback — got *less*
  process: no context pack, no spec, no plan, no audit log, an unresolved OPEN block, and a gate
  that opened at "round 2."

Against that: 114 minutes of stripped-down pipeline (code-reviewer + red-team only) produced more
correctness than 18.5 hours of the full one.

**Verdict: ADOPT — the single biggest cost win, and an accuracy win at the same time.**

**What changes.** `triage` sizes on two axes instead of one:

|  | LOW blast radius | HIGH blast radius |
|---|---|---|
| **HIGH volatility** (model/contract unsettled) | **SPIKE** — build thin, show it, let the model settle | **SPIKE then HARDEN** |
| **LOW volatility** (settled) | **FAST** — build + adversary | **FULL** — everything |

Plus a **MICRO** lane for one-line fixes to existing files: an implementer is still spawned (A7),
with no spec, no panel, no plan. Both reviews observe that most real work is this shape and the
framework had *eight tiers of ceremony for "add a feature" and nothing at all for "change one line"*.

Volatility is cheap to compute: has the model or contract changed in the last N days; how many
user instructions arrived mid-run; is there a prior superseded run for this feature. Blast radius
is a checklist: destructive? irreversible external write? cross-repo contract? multi-tenant? live
data? schema/key design?

**`triage` also moves `low` → `mid`.** A `low`-tier model picking the routing that governs the
entire run's cost and rigour is the wrong place to save money, and both reviews scored the current
triage at ≈ zero value. Its inclusions must now cite evidence (a detected package, a directory, a
grep hit) rather than a guess about feature size — which is also what stops a `frontend-expert`
waking in a repo with no frontend.

## A10. Assumption ledger + non-functional checklist for correctness that is not AC-shaped
*Sources: widget C8, C13; project S13, S14*

**The finding.** Tests derive from acceptance criteria; the intent gate compares text to text. Both
terminate in English, and whole classes of correctness here are not text-shaped:

- Which ERP column *means* "the PO date" — the criterion "PoDate must be the PO's date" is
  satisfied by either mapping.
- Whether every tenant's DBF actually has `po_lo_code` — truth lives on six customer machines.
- That every list, write and available-months call loads an entire DynamoDB partition — no AC can
  express "this is O(n) RCU per request forever."
- That 600 rows keyed by today's timestamp produce GUID-random display order.
- That `aws-sdk` v2 is in maintenance mode and `nedb@1.8.0` needed a `util.isDate` polyfill for
  Node 24 — ecosystem facts, and **no agent has WebFetch**.
- That the build succeeds only if `common_library` was `tsc`'d **and** `npm i`'d into both consumers.
- Reversibility. **No tier asks "can this be undone?"** A destructive delete-all against a live
  database reached a PASS gate with *"no snapshot/rollback"* recorded as a disclosure.

Every one falls through every gate: not in the spec → not in the blind tests → not a plan contract
→ not a diff-vs-plan finding → not an intent-drift finding.

**Verdict: ADOPT both mechanisms.**

1. **`ASSUMPTIONS.md`** — every external fact the change depends on, each tagged
   `verified-from:<path:line|command>` or `UNVERIFIED`. A load-bearing `UNVERIFIED` assumption
   BLOCKS the gate, and is the natural trigger for a `FACT-BLOCK` (A3).
2. **A fixed non-functional checklist** the architect must answer per feature, separate from the
   ACs: cost/capacity, concurrency, ordering under the chosen key, tenancy, cross-repo contract,
   ecosystem staleness, build-topology invariants, and **reversibility**.
3. **One pre-merge question the orchestrator must answer in writing:** *has this code been
   executed, and if not, why is that acceptable?* Not one of six runs executed the code against a
   database; for a destructive 600-row migration, that is *the* finding.

## A11. Execute, don't argue
*Sources: project 06-§7, tool T1, T4; widget C4; what-worked §1*

**The finding.** *"The one time an agent executed logic instead of reasoning about it, it produced
the most valuable finding in six runs."* Red-team proved the XSS by running the exact sanitizer
and printing the stored result. That capability was improvised inside one agent.

And the framework treated "no test project" as the end of the conversation. It is not: executing a
function against adversarial input **does not require a test project** — it requires a scratch
directory outside the solution.

**Verdict: ADOPT as a mandate with per-ecosystem recipes. REJECT shipping the harness.**

**Justification for the split.** LazySitter is an ecosystem-agnostic markdown + installer package.
It cannot ship a `dotnet new console` harness, a DynamoDB Local container, and a Roslyn impact-map
tool without becoming a .NET product. What it *can* do — and what actually produced the value — is
make "execute rather than reason, in a scratch dir outside the project tree" a standing rule for
every adversarial and verification agent, with recipes for the common ecosystems. The
existing observable-claim rule already says an observable concern may not be closed by argument;
this extends it from *dismissing* a concern to *establishing* a claim.

**`devils-advocate` gains `Grep, Glob, Bash`** so it can refute with evidence instead of rhetoric
(see A12).

## A12. `devils-advocate` is retooled, and loses its never-skip slot to plan-attack
*Sources: widget C4, C9; project S9*

**The finding.** Both reviews scored it independently at ≈ zero. It is `high` tier — expensive —
with `Read` only, so it cannot go get evidence; it can only re-reason over the same context pack.
It is mandated to object every round, which produces a **calibration-free signal**: the architect
cannot distinguish "this objection is load-bearing" from "this objection is the mandate firing."
In ten runs across two repos, no recorded objection changed an outcome. It did not challenge
`yyyy-MM-dd`, did not challenge the sanitizer ordering, did not challenge the data model that was
deleted two days later.

**Verdict: ADOPT the retooling. Do not delete it.**

**What changes.**
- Tools become `Read, Grep, Glob, Bash` — it can now construct and run a counter-example.
- The mandate changes from *"always object"* to **"produce a falsifiable counter-example, or
  return `NO-CHALLENGE` naming the strongest objection you considered and why it fails."**
  A ritual objection is no longer a valid output; an honest no-challenge is.
- **It leaves the `neverSkip` list; red-team `plan-attack` takes its place.** This is a deliberate
  swap of a ritual objector for an evidence-based one in the guaranteed slot. It is the honest
  reading of ten runs of evidence, and it is a net accuracy *gain*, not a weakening: the never-skip
  slot now holds the agent that provably finds design defects rather than the one that provably
  does not. `devils-advocate` still runs in the FULL lane and on any one-way decision.

## A13. Run isolation: repo-root anchoring, a lock, and a HEAD watchdog
*Sources: widget C10; project S12, C7; tool W3, G3*

**The finding.** Run state landed in **three different roots** in one repo because the run
directory was resolved from whatever the working directory happened to be. One run "fixed" it and
made it worse — consolidating runs into a root that does not contain the install, so the
orchestrator's own pitfall ledger (a Tier-0 preflight input) ended up in a different tree from the
runs. Every later run drifted back. **The fix inverted itself and nothing detected it.**

Separately: with 888 branches and six active committers, concurrent edits to the same file are the
normal state; there is no lock and no worktree isolation. And twice the human committed *around*
the pipeline while it held work uncommitted by policy — once committing a **stale** state.

**Verdict: ADOPT. All three are mechanical, cheap, and prevent whole classes of failure.**

- Run directory is anchored to `git rev-parse --show-toplevel` and nothing else. Windows path
  normalisation (drive-letter casing, `/` vs `\`, UNC, `~` expansion differing between PowerShell
  and Git Bash) happens in exactly one place.
- `.lazysitter/RUN.lock` at Tier 0; a second run in the same working tree refuses to start.
- A HEAD/worktree watchdog: if `HEAD` changes underneath the run, halt and re-sync rather than
  continuing to describe a repository that no longer exists.

## A14. Tier 8 becomes capability-gated, and `--auto` stops being the default
*Sources: widget C3; project S3; ground-truth §6*

**The finding.** Standing merge and revert authority over systems full of one-way doors it cannot
reverse: six ERP writers into **customer-owned** systems, SES email to suppliers, 26 SNS publishes
into a sibling repo, destructive migrations, a Windows service installed on customer machines with
credentials from `user.json`. **Zero** `DeploymentPreference`/`AutoPublishAlias` blocks in any
template, so "staged/canary rollout where infra supports it" degrades silently to all-at-once. No
Sentry, Datadog, OpenTelemetry, Serilog or CloudWatch alarm anywhere — `monitor-agent` reads
unstructured `Console.WriteLine` text with no error-rate metric and no baseline, finds nothing, and
reports clean. And in the widget repo the deploy script requires an absent `jq`, moves a filename
electron-builder does not emit, `aws s3 mv`s the known-good backup out of the way before uploading,
and **ends in `read -n 1 -s keypress`** — an autonomous release agent that invokes it hangs until
the pipeline times out.

**Verdict: ADOPT the gating. REJECT deleting Tier 8.**

**What changes.**
- `release-agent` may not act unless the deploy topology is **recorded and verified** at recon,
  including an explicit *"is this command non-interactive?"* check. `push ≠ deploy` is already a
  graduated pitfall; this makes it mechanical.
- `rollback-agent`'s standing authority is **void unless reversibility was established**. The
  architect's one-way-door inventory (A10) is its precondition. Reverting code that cannot revert
  an ERP write is not a rollback; claiming it is, is the dangerous part.
- `monitor-agent` requires a **named, reachable signal source**. No signal source → it does not
  run, and the gap is reported. An agent that finds nothing because it is looking at nothing must
  never report "stable."
- **`--auto` no longer defaults on.** The Claude orchestrator currently reads *"proceed through the
  merge gate and post-merge rollback autonomously (default)"* while the Codex orchestrator does
  not — a real drift bug between adapters, and the unsafe direction. Both now HOLD at the gate
  unless `--auto` is passed explicitly.

**Why not delete Tier 8** (as both reviews recommend for their repos): the reviews establish that
Tier 8 is inert-or-dangerous in repos with no canary and no telemetry. That is a capability
statement, and capability gating expresses it exactly, while a repo with a real CD pipeline keeps
the tier. Deleting it would also delete the deploy-topology preflight, which is the thing that
catches `read -n 1` before an agent blocks on stdin.

## A15. Model separation must be configured or the guarantee is not claimed
*Sources: widget C4; project S9; tool G2*

**The finding.** `models.env` ships with **all four slots blank**, and the file's own comment
concedes that `MODEL_HIGH_ALT` blank falls back to `MODEL_HIGH` — *"weaker guarantee."* Red-team's
distinct-model separation is the framework's single strongest structural claim and it was silently
unconfigured in a real install.

**Verdict: ADOPT.** Recon fails loudly when `high_alt` is unset or equal to `high`: the run either
stops or records a **named degradation** that appears in the final report and blocks any claim of
blind-spot independence. `doctor` checks it for all three adapters. Silence is the bug.

## A16. Footprint discipline becomes a default instead of a thing the user has to say three times
*Sources: project C9, C2-roster; widget C13-§9*

**The finding.** The user's constraints across runs read as one repeated complaint: *"editing task
not adding task, reuse existing, add no extra scripts"* · *"remove unnecessary codes"* · *"MUST
reuse existing implementations wherever one exists"* · *"NO comments in the code"*. Each is a
correction to a default the framework does not have. In one run the pipeline had to be overruled
twice for proposing net-new surface, once by the user and once by the orchestrator — and the
architect had the constraint *in front of it* when it proposed a new DynamoDB partition.

Note also: the no-comments rule exists **only** in the two implementer definitions. Any other agent
that writes code — including the orchestrator — is unconstrained, which is why the user had to make
it a standing manual directive.

**Verdict: ADOPT as defaults, not as a new agent.**

- **Reuse-first is an explorer-mandated pack section** (A8), not a `reuse-scout` spawn: the pack
  must answer "what already solves this?" with paths or an explicit NONE-FOUND plus what was
  searched. On a 53-project solution with a 14,769-line utility file, this is the highest-value
  question in the repo — and it is a *search*, which is what the explorer already is.
- **Footprint accounting is a `code-reviewer` mandate**, not a `footprint-auditor` spawn: files
  created vs justified, comments added, temp/scaffolding artifacts left behind, dead code orphaned
  by the change. It reports counts and blocks on unjustified net-new surface. The reviewer already
  reads the whole diff; counting it is free.
- **The no-comments-by-default rule moves to a pipeline-wide ground rule** so it binds every agent
  that can write, not just the two implementers.

## A17. Windows correctness
*Sources: tool W1–W7; widget C10*

Adopted where mechanical and framework-shaped:

- **Build-result classification** is a `code-reviewer` mandate: real compile diagnostics vs
  environment failures (locked DLLs, permission, missing SDK) must be distinguished *mechanically*
  and never as a prose qualifier. The record contains `"0 errors (VS DLL locks only, not compile
  errors)"` — a gate deciding correctness from an ambiguous exit code with a human-language
  disclaimer attached, which is precisely the `[proc][prose-gate]` fault the ledger already
  graduated, reintroduced through the build tool.
- **Encoding and EOL are preserved** by implementers. A silent BOM/CRLF normalisation produces a
  diff where every line appears changed, which destroys the signal `code-reviewer`, `red-team` and
  footprint accounting all depend on.
- **Repo-root anchoring and path normalisation** — see A13.
- **Shell dialect** is declared per agent, so `2>/dev/null`, `$VAR`, `head`, `which` and `mkdir -p`
  do not surface as task failures. LazySitter already ships both `run-agent.sh` and
  `run-agent.ps1`; the dialect just has to be explicit.

Rejected as out of scope: shipping `handle64.exe`, a long-path registry check, or any host
mutation. These are environment facts a preflight can *report* but must not *change* — auto-install
violates the sandbox model, which is already a graduated pitfall (`[env][toolchain-gap]`).

---

# Part 2 — Rejected, with reasons

## R1. "Delete Tiers 3, 5(partial), 6-test, 7 and 8" / "adopt a four-agent subset"

**Rejected as a framework change; the underlying observation is adopted as A1.**

Both reviews reach this recommendation, and for the repos they reviewed it is correct. It is wrong
for LazySitter because these are **[FIT] findings, which the reviewers label as such themselves**.
The test lineage — spec → blind tests → teeth check → freeze hash → traceability — is the framework's
strongest guarantee in any repo that has a test runner. Deleting it optimises for two repos with no
suite and breaks every repo with one.

Capability gating (A1) produces **the identical observable behaviour in those two repos** — the
agents do not run, and the report says so by name — while preserving the framework elsewhere. That
is strictly better than deletion on both axes the user named: accuracy is unchanged where the
substrate exists, and cost drops to zero where it does not.

## R2. Thirteen new agents (A1–A2, B1–B3, C1–C2, D1–D3, E1–E4)

**Rejected as roster growth. Every capability is adopted; only the packaging differs.**

| Proposed agent | Disposition |
|---|---|
| `plan-adversary` | **Adopted** as red-team `plan-attack` mode (A2) — same guarantee, no new spawn |
| `convention-cartographer` | **Adopted** as explorer cartography mode + committed `CONVENTIONS.md` (A5, A8) |
| `convention-enforcer` | **Adopted** as a `code-reviewer` mandate (diff vs committed conventions) |
| `reuse-scout` | **Adopted** as a required context-pack section (A16) |
| `footprint-auditor` | **Adopted** as a `code-reviewer` mandate (A16) |
| `stability-triage` | **Adopted** as triage's volatility axis (A9) |
| `provenance-agent` | **Adopted** as the orchestrator's close step writing to committed knowledge (A5) |
| `data-migration-expert` | **Adopted** as the blast-radius checklist the architect must answer (A9, A10) |
| `api-contract-agent` | **Adopted** as a contract-snapshot-diff gate where a contract surface exists |
| `dynamodb`/`postgres`/`mongodb`/`sqlserver-expert` | **Rejected as agents**; adopted as a detected-engine checklist on `database-expert` |
| `repository-layer-expert` | **Rejected**; folded into `database-expert`'s boundary mandate |
| `serverless-lambda-expert` | **Rejected**; folded into `infra-expert`'s detected-platform mandate |
| `integration-cartographer` | **Rejected**; folded into the explorer's cross-repo provenance rule |

**Justification.** Three reasons, in order of weight.

1. **The engine-specialist family cannot be a fixed roster.** The review's own dispatch rule is
   *"engine agents spawn only on detected evidence, never as a fixed panel — a `mongodb-expert`
   must never spawn here."* An agent that must never spawn in most repos is exactly the
   "twelve agents that cannot run here" problem the same review opens with. The mechanism that
   makes it work is **detection-based dispatch plus a real checklist**, and both attach cleanly to
   the existing `database-expert`. Nine DynamoDB traps as a mandated checklist catch the same eight
   defects as nine DynamoDB traps in a separate system prompt, at zero roster growth.
2. **Roster size is the direct enemy of the user's stated goal.** "Fastest and cheapest" is
   incompatible with 26 → 39 agents. Both reviews independently conclude the roster should get
   *sharper, not bigger* — the missing-agents document says so in its own closing paragraph.
3. **Mandates are enforced where spawns are not.** A `footprint-auditor` that gets trimmed by
   triage on a trivial feature enforces nothing. A counting requirement inside `code-reviewer` —
   which is on the never-skip list — always runs.

**One exception, adopted:** `lazysitter-recon` (Tier 0, `low`, mechanical). Roster 26 → **27**.
It is justified precisely where the others are not: it is the *only* proposed capability that must
be independent of the agent that consumes it. The orchestrator currently probes the repo and then
gates on facts it produced itself — the same self-verification fault as A7. Recon is cheap, its
output is cached across runs in committed knowledge, and it is the foundation every capability gate
in A1 rests on.

## R3. "Remove the explorer's ~700-word cap"

**Rejected as stated; adopted in modified form (A8).**

The diagnosis is right — a 700-word cap cannot describe a 2,581-line god object, and summarising it
*as* "the orchestration core" is true and useless. But unbounded length reintroduces
`[proc][context-bloat]`, a fault this ledger already graduated: full essays carried downstream
produce lost-in-the-middle failures at the gate, which is where the most consequential judgment
happens. The replacement is **section completeness plus mandatory probes** — the pack must answer
every required question with evidence, and length follows from that rather than from a budget.
Where a fact is genuinely large (a branch inventory, a convention bank), it lands in committed
knowledge (A5) and the pack cites it.

## R4. Shipping executable harnesses — scratch-eval runners, DynamoDB Local, Roslyn impact maps, OpenAPI diff tooling

**Rejected as shipped code; adopted as mandated technique with recipes (A10, A11).**

LazySitter is 26 markdown role definitions plus a zero-dependency Node installer, and its value is
that it installs into *any* repo. Shipping a `dotnet new console` scratch runner, a DynamoDB Local
container harness, and a Roslyn analyser makes it a .NET product; the same argument repeats for
every other ecosystem. What produced the actual value in the record was not tooling — it was an
agent choosing to **execute instead of argue**, using `Bash` it already had. That is a rule, and
rules install everywhere. The observable-claim rule already proves this pattern works.

## R5. "Demote the orchestrator to a router"

**Rejected. The no-source-writes half is adopted (A7).**

The orchestrator must keep gate ownership, budget, kill switch and the audit log — those cannot be
delegated without recreating the "who verifies the verifier" problem one level up. What must go is
its ability to write source and then gate its own writes. That is the specific fault; demotion is
broader than the evidence supports, and one review credits the orchestrator with the correct calls
in exactly the cases where the design failed (resolving the `supplierId` fact dispute by reading
`serviceTask.ts:1960` itself).

## R6. Deleting `docs-agent`, `ux-analyst`, `frontend-expert`, `dependency-auditor`, `triage`

**Rejected as deletions; the diagnosis is adopted through detection-based dispatch (A9) and
baseline scoping (A6).**

Each is scored at zero-or-negative in one specific repo: `ux-analyst` has `Read` only and cannot
see the app; `frontend-expert` cannot run `vite build`; `docs-agent` on the cheapest tier writing
into a 40-line README that is already wrong is *negative* value. All four are already
triage-trimmable — the failure is that triage selected on feature size rather than on **what the
code actually touches**. Fixing the selector fixes all of them at once, and keeps them useful in a
repo where the UI is more than eight configuration forms. `dependency-auditor` is fixed by baseline
scoping (A6) rather than removal: the real risks were old deps, not newly added ones.

## R7. Granting `WebFetch`/`WebSearch` for ecosystem-staleness checks

**Rejected for now; recorded as a known gap (A10).**

The finding is legitimate — nothing checks that `aws-sdk@2` is the maintenance-mode major, that
`nedb@1.8.0` is unmaintained, or that `odbc`'s native ABI must match the Electron version, and
`dependency-auditor` will not see any of it because none is a CVE. But network access changes the
sandbox model for agents that currently run read-only and offline, and it is the one change in this
response that could turn a verification agent into an exfiltration path. It needs its own threat
model, not a line in a roster file. The gap is recorded in `ASSUMPTIONS.md` as `UNVERIFIED`
(ecosystem currency) so it is disclosed rather than silently absent.

---

# Part 3 — Explicitly preserved

Both reviews list what LazySitter gets right, and none of it is touched:

1. **The build-vs-verify lineage split with different model tiers.** `mid` implementers, `high_alt`
   red-team. Twelve real defects in one day, several in already-shipped code.
2. **Externalised state.** `MANIFEST.md` (facts only, explicitly "never put interpretations in
   it"), `gate-state.jsonl`, agents self-persisting. *"The run directories are the most legible
   engineering record in this repo — better than the commit messages."*
3. **`[observed|reasoned][observable|internal]` claim tagging and the rule that an observable
   concern may not be closed by argument.** One reviewer: *"a genuinely good idea and I have not
   seen it elsewhere."* A11 extends it rather than altering it.
4. **`LIMITATIONS.md`.** *"The framework's best original idea… Almost no engineering process
   produces this document."* A5 fixes the one thing wrong with it: where it was written.
5. **The pitfall ledger's "graduate, don't remember" discipline.** Twelve faults, each with a guard,
   each marked graduated. The concept is right; A5 fixes the coverage gap (the *project* ledger was
   never created).
6. **Refusing to invent.** The "Deliberately NOT changed" discipline held the line on three false
   positives. Restraint is harder than finding bugs.
7. **Honest degradation reporting.** It never hid the test gap — it reported it in four places,
   unprompted. A1 makes the report binding instead of advisory.
8. **`autoApproveGit: false` by default and the kill switch.** Correct defaults for a system with
   Tier 8 in it.

---

# What this costs and what it buys

**Cost removed:** the FULL lane stops being the default (A9); the spec/test lineage does not run
where it cannot (A1); runs start from committed knowledge instead of re-deriving the codebase (A5);
design defects die at plan time instead of after implementation, build, review, BLOCK, retry and
re-verification (A2). The reviewers' own reconstruction of what the flagship run *should* have cost
is **≈3 hours instead of 18.5**.

**Cost added:** one cheap recon spawn per repo (cached), one extra red-team invocation per feature,
and up to one batched human question per tier.

**Accuracy bought:** the wrong `customerName` ruling (A8 branch inventory + A4 fact-dispute rule),
the stored-XSS (A2), the date-format convention (A5 + A8 probes), the committed `AKIA` key (A6),
the self-cleared blocking findings (A7), the destructive migration that reached PASS with no
rollback (A10 + A14), and the false green that made all of them invisible (A1).

Net: fewer agents running per feature, more of them producing a signal that can fail.
