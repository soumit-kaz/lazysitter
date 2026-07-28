# PLAN (v2 — rev 2; supersedes rev 1 in full)

Rev 2 implements the orchestrator's adjudication of six devils-advocate counter-examples (eight
rulings). Rev 1's C1/C2 precedent scheme, its `WebFetch` grant, and its four specialization agents
are **withdrawn** — see DECISIONS D-13…D-20. Do not implement rev 1.

## Approach

Same root cause, better oracle: **the codebase must be the oracle, and the implementer must not get
to choose which part of it counts.** Rev 1 let the implementer nominate its own precedent, which in a
162k-line repo is always satisfiable and, mid-migration, is *more* satisfiable for the convention the
team is retiring. So the precedent set is now machine-derived by `explorer`, ranked, and the
implementer picks from it. Two live clusters is not a tie to be broken — it is the migration signal,
and it goes to a human once via `FACT-BLOCK`.

Seven waves, each independently shippable, each ending `node test/smoke.js` green. **Wave 5 is the
only wave that moves the agent count or an agent name (27 → 28).**

### Parity vocabulary (each task cites one)
- **P-A — agent body.** `core/agents/*.md` below the frontmatter. Reaches Claude verbatim / Codex
  frontmatter-stripped / Cursor re-baked, no installer change. Cheapest path; prefer it.
- **P-B — tool grant.** **Two** edits: frontmatter `tools:` (Claude only) **and** `core/roster.json`
  (`codexSandbox`) — Cursor derives `readonly:` from the roster, not from `tools:`. The known trap.
- **P-C — playbook.** Both `core/orchestrator.claude.md` and `core/orchestrator.codex.md`, plus
  `core/cursor/LazySitter.rule.mdc` where it restates a guarantee. Cursor's `/lsi` is generated from
  the Claude orchestrator and follows automatically.
- **P-D — installer.** `src/*.js`; one code path, all three adapters.
- **P-E — knowledge template.** `templates/knowledge/*`; `writePreserve` → **new installs only** (L-11).

---

## Interfaces / contracts

**C1 — Ranked precedent set (explorer output, machine-derived).** Per artifact category the change
touches, `explorer` emits into `CONTEXT-PACK.md`:
```
### Precedent set — <category>            search: `<probe>` — clusters: <k>
1. <path:line> — hits: <n> — newest-blame: <YYYY-MM-DD> — deprecation: none|<signal>
2. ...
```
Deprecation signals: `@deprecated` / `[Obsolete]`, a suppression/lint-disable at the site, `legacy`
in path or name, or no blame activity while a competing cluster is active. Ranking is by hit count,
then newest-blame; a deprecation-signalled candidate never ranks 1.

**C2 — Selection, not declaration (implementer).** Build report:
```
## Precedent selection
- <new-path>[::<symbol>] — category: <cat> — chose: #<rank> <path:line> — reason (required if not #1)
- <new-path> — NONE-EXISTS — argued against set: <cat> (or `no set emitted for this category`) — why none fits
```
The implementer may not cite a precedent that is not in the ranked set, and may not argue
`NONE-EXISTS` against a free grep — only against the set.

**C3 — Verification (code-reviewer).** `blocker` if: the chosen candidate is absent from the emitted
set; the cited `path:line` does not resolve; or `NONE-EXISTS` is claimed for a category whose set is
non-empty and the stated reason does not survive reading the top candidate. Oracle is now
**plan AND the machine-derived precedent set**.

**C4 — Two clusters is the migration signal, and it is a `fact` dispute.** When C1 finds ≥2 live
clusters for one category that are not variants of each other, the orchestrator raises a
**`FACT-BLOCK`** (A3 machinery, already shipped): *"this repo has two live conventions for `<X>` —
A (`<n>` hits, newest `<date>`) vs B (`<m>` hits, newest `<date>`) — which is canonical?"* Batched
once per tier. **An architect ruling is forbidden** (A4 `fact` class). The answer is written into
`CONVENTIONS.md` as a durable row, so it is answered once, ever.

**C5 — Comment density (B15 / R-B).** Replaces the pipeline-wide no-comments ground rule: match the
measured comment density of the **selected** C2 candidate. Forbidden absolutely: AC-IDs, criterion
IDs, decision references, run slugs in shipped source — those live in `TRACEABILITY.md`. This repo's
own near-zero `src/` density is what the corrected rule yields here; LazySitter's constraint is
unchanged.

**C6 — Executable knowledge row (B3, revised).** `templates/knowledge/CONVENTIONS.md` format:
```
CLAIM | path:line | ASSERTION | PAIRED-POSITIVE | last_verified | status
```
`status` ∈ `live | STALE | unverifiable`.
- A **negative** assertion (expects zero hits) is invalid without `PAIRED-POSITIVE` — a probe proving
  the pattern is still findable somewhere with hits > 0. If the paired positive returns 0, the
  pattern has rotted: the row goes `STALE`, never `live`. This is what stops a renamed symbol or a
  deleted file passing forever.
- `STALE` rows are **excluded from the context pack**.
- **`unverifiable` rows are kept, not refused** — a temporal property (socket-driven invalidation
  ordering, "stale data with no error anywhere") has no passing shell command, and B11 exists to
  catch exactly that class. Such a row carries `owner: <human>` and `expires: <date>`, is excluded
  from the automatic trust path (it never satisfies an assertion-backed claim), and is surfaced to
  its owner at expiry.

**C7 — `lazysitter-recon` is the assertion executor.** Recon runs every `ASSERTION` and
`PAIRED-POSITIVE` at Tier-0 preflight; it already holds `Bash` and already re-executes every run
(A1/C3). `explorer` does **not** execute them and its Bash stays bound by the C5 probe allowlist —
**no exemption is granted.** Because this makes `CONVENTIONS.md` an execution surface, it inherits
`SECRETS-BASELINE.md`'s existing treatment: **any diff touching `CONVENTIONS.md` is flagged and never
auto-approved, even under `--auto`.** Disclosed honestly in L-20.

**C8 — `FACTS.tsv`.** Run-dir artifact beside the prose pack:
`key\tvalue\tcommand\texit_code\tverified_at_sha`. Mechanical facts only. Regenerable, never edited.

**C9 — AC oracle (B6).** Every criterion carries `oracle: build|test|execution|query-plan|human`.
`reasoning` is not legal; a `must` with no legal oracle BLOCKS at the spec gate, before Tier 4.

**C10 — `oracle:` field, and B7 is REPORT-ONLY (hard constraint).** `lsi-verdict` gains
`oracle: plan | spec | execution | precedent | intent` so grouping is computable. The **final report**
groups verdicts under those headings and prints `N agents, M oracles`. **The merge-gate enumeration
is FROZEN: the gate continues to require each named agent's PASS individually and MUST NOT read
`oracle:`.** Collapsing correlated verdicts into one check would weaken a gate that today requires
seven. Write this prohibition into both playbooks so no future implementer "improves" it.

**C11 — Blocking class (B9).** `blocking_class: MINE | ENVIRONMENT | PRE-EXISTING`. Only `MINE`
blocks this diff's gate; the others route to standing disclosure. **`blocking_class` governs whose
fault and whose fix — it does NOT override A1: an unresolved `degraded:true` still hard-BLOCKs and
still needs the recorded per-run human waiver.** Pipeline artifacts (`<run-dir>/`, `.lazysitter/`,
`.claude/`, `.codex/`, `.cursor/`) are excluded from product gates.

**C12 — Warning histogram (B10).** `warnings_by_code:` with one `<CODE>=<count>` line, never a total.
A new code, or an increase in any existing code, is a finding regardless of the total.

**C13 — Native test framework (B12).** `test-author` authors in the repo's detected native framework.
A perturbed solution/lock file is disclosed or raised as a `FACT-BLOCK` — never a reason to fall back
to ad-hoc shell on a non-POSIX target.

**C14 — Pre-gate cleanliness + narrow delete (B13).** Before the gate, `git status --porcelain`; every
added/untracked path must appear in the plan's justified file list or a C2 selection row, else BLOCK.
Delete authority: only the implementer that created the file, only within this run's created set,
every deletion recorded. No janitor agent.

**C15 — Tool grants (B8 only).** `Read` to the Bash-only cohort; `Glob` to `triage`, `code-reviewer`,
`devils-advocate`, `frontend-implementer`. **No network grant of any kind. `WebFetch`, `WebSearch`
and a `codexNetwork` roster field are all explicitly NOT added** (D-18).

**C16 — Honest offline dependency audit.** `lazysitter-dependency-auditor` may never return
`PASS(CLEAN)` when the license/CVE source is unreachable. It emits `degraded: true`,
`blocking_class: ENVIRONMENT`, and the named degradation token **`cannot-verify-offline`**, listing
which check could not run. Per C11 this still requires the A1 human waiver — the friction is real and
is disclosed in L-15, not hidden.

**C17 — `reuse-auditor` (B2), and why it is not `explorer.md:29` again.** New Tier-6 agent
`lazysitter-reuse-auditor`, `mid`, `read-only`, tools `Read, Grep, Glob`. Input: the diff **and** the
C1 ranked sets. Output: for every new artifact, the existing repo artifact that already does it, or a
certification of NONE with the search that proves it.
**Diagnosis (one line, per the ruling):** `explorer.md:29` already mandates reuse-first search and the
six confirm modals shipped anyway, because explorer's reuse output is advisory **to the architect**,
who then authored the plan that authorised the file — the finding never reached an oracle outside the
build lineage. **B2's justification is independence, not novelty.**
**Skip rule (widened):** skipped only when the diff adds no new file, no new exported symbol, **and**
no new non-exported internal helper (function / component / hook / class) inside an existing file.

**C18 — B2-driven contract change is a sanctioned freeze exception.** When `reuse-auditor` correctly
fires against a plan-authorised artifact, the plan's public contract changes and the frozen suite was
authored against the old one. That is an **explicitly sanctioned exception to freeze integrity**,
distinct from a mechanics-only repair because it *does* change assertions: log it in `DECISIONS.md`
(what changed, which frozen tests are affected), have `test-author` re-author the affected tests from
the amended contract only, re-hash, and **re-run the teeth check**. State this in both playbooks so
the most valuable B2 finding is not suppressed by the cost of acting on it. Blindness is preserved by
instruction, not by parallel construction, at this point — disclosed as L-16.

**C19 — `data-layer-expert` (B11).** Rename `lazysitter-database-expert` →
`lazysitter-data-layer-expert`; one role file, two invocation modes (Tier-4 advisory, Tier-6 diff
audit). Scope explicitly includes client-side stores: IndexedDB, `localStorage`, in-memory API
caches, socket-driven invalidation ordering. `triage` selects it on client-store evidence, not only
on a database.

**C20 — Framework / cloud expertise ships as playbook sections, not agents (R-A, revised).** No
`react-expert` / `angular-expert` / `nextjs-expert` / `aws-expert` files. `triage` records
`framework: next|react|angular|none` and `cloud: aws|none` in `MANIFEST.md` with the detection
evidence; that fact scopes which section of `frontend-expert`, `frontend-implementer` and
`infra-expert` applies. **Detection precedence is explicit: `next` beats `react`** (a Next repo
contains React). **Two frameworks detected on independent evidence raises a `FACT-BLOCK`, never a
guess.** The same section binds advisor and implementer, so no advisor→implementer seam is created —
which is the reason per-layer implementers were rejected.

**C21 — AWS section hard default.** May not propose introducing an AWS service the project does not
already use. Suggest only, in `## New-service suggestions (not adopted) — service | why | estimated
monthly cost delta`. A new Lambda must carry an explicit justification against extending an existing
one, or it is not proposed.

**C22 — Standing constraints.** (R-C) verbatim in both playbooks, the Cursor rule, both implementers
and every expert body: **accuracy > time > memory; sometimes accuracy > memory > time; accuracy is
never traded** — plus a file-handling clause requiring explicit treatment of buffering, streaming,
encoding, partial reads/writes and large-file paths. (R-D) **never Fable**, in any tier, adapter or
recommendation: enforced mechanically in `sanitizeModels()` (`src/install-cursor.js`) by refusing a
model id matching `/fable/i` and falling back with a warning; checked in `src/doctor.js` for Codex
`models.env` and Claude agent `model:` fields; stated in `core/cursor/models.json`,
`core/codex/models.env` and both playbooks.

---

## Tasks (ordered; all assigned to `backend-implementer`)

### W1 — Precedent oracle (B1 revised, B15/R-B). No roster change.
- [backend] C1 into `core/agents/lazysitter-explorer.md` output schema + the required
  `### Precedent set` section in the pack contract. **P-A.**
- [backend] C2 into both implementers' report schemas, replacing rev 1's free-citation section. **P-A.**
- [backend] C3 into `core/agents/lazysitter-code-reviewer.md`; oracle restatement. **P-A.**
- [backend] C4 into both playbooks: competing-cluster detection → batched `FACT-BLOCK` → durable
  `CONVENTIONS.md` row; architect ruling forbidden. **P-C.**
- [backend] C5: replace the ground-rule bullet at `orchestrator.claude.md:25` and its codex twin, the
  `Never` bullet in both implementers, and `code-reviewer`'s footprint-accounting bullet; restate in
  the Cursor rule. **P-A + P-C.**
- [backend] `test/smoke.js`: assert `Precedent set`, `newest-blame`, `deprecation`,
  `argued against set`, and the comment-density phrasing render in all three adapters.

### W2 — Executable knowledge (B3 revised, B4, B5). No roster change.
- [backend] C6 into `templates/knowledge/CONVENTIONS.md` — new columns, `PAIRED-POSITIVE` rule,
  `unverifiable` rows with `owner`/`expires`. **P-E.**
- [backend] C7: assertion execution into `core/agents/lazysitter-recon.md` + Tier-0 preflight in both
  playbooks; explicit "explorer does not execute assertions, C5 allowlist unchanged, no exemption";
  `CONVENTIONS.md` added to the never-auto-approved diff list beside `SECRETS-BASELINE.md`. **P-A + P-C.**
- [backend] B4: scoped explorer re-call mode (any tier may request a scoped re-run against one
  question) — extends A8's narrow re-probe right, does not replace it. **P-A + P-C.**
- [backend] C8 `FACTS.tsv` into recon + explorer bodies and the run-dir artifact set. **P-A + P-C.**
- [backend] `test/smoke.js`: assert the six-column header, `PAIRED-POSITIVE`, `unverifiable`,
  `FACTS.tsv`, and the `CONVENTIONS.md` auto-approval exclusion.

### W3 — Gate honesty (B6, B7 report-only, B9, B10, B12, B13). No roster change.
- [backend] C9 into `lazysitter-spec-writer.md` + the spec-gate BLOCK rule. **P-A + P-C.**
- [backend] C10: add `oracle:` to the `lsi-verdict` block in both playbooks **and** every agent body
  that emits one; group in the final report; write the **gate-must-not-read-`oracle:`** prohibition
  into both playbooks and the Cursor rule. **P-A + P-C.**
- [backend] C11 `blocking_class` into the schema everywhere, with the explicit "does not override the
  A1 degraded waiver" sentence; add the pipeline-artifact exclusion list. **P-A + P-C.**
- [backend] C12 into code-reviewer; C13 into test-author; C14 pre-gate assertion + `## Deletions`
  build-report row (no P-B — implementers already hold `Write, Edit, Bash`). **P-A + P-C.**
- [backend] `test/smoke.js`: assert `oracle:`, `blocking_class:`, `warnings_by_code:`,
  `git status --porcelain`, and the gate-prohibition sentence.

### W4 — Tool grants + honest offline (B8, C16). No roster count change.
- [backend] C15: add `Read` to the Bash-only cohort and `Glob` to the four discovery agents —
  frontmatter `tools:` **and** confirm each `codexSandbox` in `core/roster.json` still matches real
  scope. Neither grant changes write scope, so no sandbox value should move; verify rather than
  assume. **P-B.**
- [backend] C16 into `core/agents/lazysitter-dependency-auditor.md`: `cannot-verify-offline` token,
  `degraded: true`, `blocking_class: ENVIRONMENT`, and removal of the stale roster `note` suggesting
  network be enabled for Codex. **P-A + P-B.**
- [backend] `test/smoke.js`: assert `Glob`/`Read` in the named agents' Claude frontmatter, assert
  `cannot-verify-offline` in all three adapters, and assert **no** adapter output contains `WebFetch`,
  `WebSearch`, or `codexNetwork`.

### W5 — Roster 27 → 28 (B2, B11). **The only wave that moves counts or names.**
- [backend] Create `core/agents/lazysitter-reuse-auditor.md` per C17 (including the widened skip rule
  and the independence diagnosis); register in `core/roster.json` (`tier: mid`,
  `codexSandbox: read-only`, `codexApproval: never`); add to the Tier-6 spawn batch. **P-A + P-B + P-C.**
- [backend] C18 freeze-exception clause into both playbooks and `lazysitter-test-author.md`. **P-A + P-C.**
- [backend] C19 rename: `core/agents/lazysitter-database-expert.md` → `lazysitter-data-layer-expert.md`
  + frontmatter `name:` + `core/roster.json` key **must move together** (`src/roster.js:24-29` throws
  on filename/name mismatch, `:34-38` on an unregistered agent). Update every reference in both
  playbooks, the Cursor rule, `lazysitter-triage.md`, and `docs/`. **P-A + P-B + P-C.**
- [backend] `test/smoke.js`: `27 → 28` at lines 46, 77, 321; handle the rename in
  `ORIGINAL_26_AGENTS` so it does not read as a deletion; assert `lazysitter-reuse-auditor` present
  and `lazysitter-database-expert` absent from every adapter.
- [backend] `core/cursor/LazySitter.rule.mdc`: agent count `27` → `28`; tier table updated.

### W6 — Framework / cloud sections (R-A revised). No roster change.
- [backend] C20 detection + precedence + two-frameworks-`FACT-BLOCK` into
  `core/agents/lazysitter-triage.md`; `framework:`/`cloud:` recorded in `MANIFEST.md` per the
  playbooks. **P-A + P-C.**
- [backend] Per-framework sections (Next.js app-router / RSC boundary; React hook rules; Angular DI /
  RxJS / change detection) into `lazysitter-frontend-expert.md` **and**
  `lazysitter-frontend-implementer.md` — same text binds advisor and implementer. **P-A.**
- [backend] AWS section per C21 into `lazysitter-infra-expert.md`. **P-A.**
- [backend] `test/smoke.js`: assert `framework:`, `cloud:`, the `next` > `react` precedence sentence,
  the two-frameworks-FACT-BLOCK sentence, and the AWS suggest-only + cost-delta line.

### W7 — Standing constraints (R-C, R-D). No roster change.
- [backend] C22 (R-C) into both playbooks, the Cursor rule, both implementers and every expert body.
  **P-A + P-C.**
- [backend] C22 (R-D): `/fable/i` refusal in `sanitizeModels()`; `doctor` checks for Codex
  `models.env` and Claude agent `model:`; ban text in both model configs and both playbooks. **P-C + P-D.**
- [backend] `test/smoke.js`: write `"high": "fable-1"` into `.cursor/lazysitter/models.json`, run
  `update`, assert the re-baked agents carry the fallback and not `fable`; assert the
  priority-ordering sentence in all three adapters.

---

## Expert concerns addressed

All eight rulings adopted as issued; none re-litigated.
**(1) Precedent laundering** — accepted in full; rev 1's implementer-declared citation is withdrawn
for the machine-derived ranked set (C1–C3). The DA is right that six citable modals make citation #4
a correct, C2-verifiable citation that still ships the seventh duplicate.
**(2) Missing tiebreak oracle** — accepted; C4 routes competing clusters to `FACT-BLOCK` and forbids
an architect ruling (A4 `fact` class), with the answer durably recorded so it is asked once.
**(3) B2 × freeze integrity** — accepted; C18 makes it a sanctioned, logged exception with a teeth
re-check, and C17 widens the skip rule to internal helpers.
**(4) B2 duplicates a shipped, failed mechanism** — accepted; the diagnosis is now stated in C17:
explorer's reuse output is advisory to the plan's own author, so it never reached an independent
oracle. Independence is B2's justification, not novelty.
**(5) B3's three defects** — accepted; C6 pairs every negative assertion with a positive existence
probe, C7 moves execution to `recon` with no C5 exemption, and `unverifiable` rows are kept with an
owner and an expiry so the B11 invalidation-ordering class is not forbidden from being written down.
**(6) B7 cosmetic-or-regressive** — accepted; C10 adds the `oracle:` field, groups it in the report,
and writes a standing prohibition against the gate ever reading it.
**(7) B14 reverted** — accepted; no network grant exists anywhere in this plan. C16 replaces it with
an honest named degradation. The capability gap returns to L-6 and is re-disclosed in L-15.
**(8) R-A revised** — accepted; zero new expert agents, roster 27 → 28, expertise ships as sections
that bind advisor and implementer together (C20/C21).

## Devils-advocate response

Rev 2 exists because of it; every counter-example is implemented above rather than answered.
**What rev 2 still does not close, stated rather than papered over:** C1's ranking is heuristic — hit
count, blame recency and a deprecation-signal list. A convention the team is deliberately retiring
*without* any of those markers still ranks first and will be imitated, and C4 only fires when two
clusters are both live enough to be detected as clusters. That residual is L-12, not a covered case.
Second: C18 preserves test blindness by instruction rather than by parallel construction, which is a
genuinely weaker guarantee than the one the A-round shipped — L-16.

## DECISIONS / OVERRIDES

D-13…D-20 in `DECISIONS.md`. D-18 **reverses D-9**; D-19 **reverses D-8**; D-13 withdraws rev 1's
C1/C2.

## LIMITATIONS

L-6 restored to live; L-10 voided; L-12 and L-14 rewritten; L-15…L-20 added.

## Open items

None. The one item previously open (whether framework idiom deserves its own head) is closed by
ruling 8: it ships as sections, not heads, and L-19 records what that bounds.
