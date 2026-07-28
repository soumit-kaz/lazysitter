# DECISIONS / OVERRIDES

Format: agent · position · ruling · reason.

Round 1 (A1–A17) is D-1…D-7. Round 2 rev 1 is D-8…D-12. Round 2 rev 2 — the orchestrator's
adjudication of six devils-advocate counter-examples — is D-13…D-20. **D-18 reverses D-9 and D-19
reverses D-8; both are marked below.**

## D-1 — `docs/CRITICISM-RESPONSE.md` A12 is OVERRIDDEN (never-skip swap)

- **Agent:** the approved decision ledger (`docs/CRITICISM-RESPONSE.md`, A12), which states
  *"It leaves the `neverSkip` list; red-team `plan-attack` takes its place."*
- **Challenger:** `lazysitter-devils-advocate`, round 1.
- **Observation that settled it (not a ruling — an A4 `fact` dispute resolved by observation):**
  `core/roster.json` `neverSkip` already contains `lazysitter-red-team` (10 entries). Removing
  `lazysitter-devils-advocate` is therefore a net deletion 10 → 9, not a swap.
  `grep -rn "neverSkip" src/ bin/ test/` returns nothing — the list is prose-only, and a flat array
  of agent names cannot express a required *mode*.
- **RULING (orchestrator, already made; recorded here, not re-litigated):** A12 is AMENDED.
  `lazysitter-devils-advocate` **STAYS** on `neverSkip`. `plan-attack` is added as a required mode
  via the new `neverSkipModes` key.
- **Losing position:** the ledger's literal "swap" wording.
- **Reason:** the falsifiable-counter-example-or-`NO-CHALLENGE` mandate (A12's other half) is what
  removes the ritual-objection problem the swap was invented to solve. Removing the slot was never
  necessary and would have cost a guarantee under a label that read as neutral.

## D-2 — AC-32 is AMENDED as a consequence of D-1

- **Status:** criterion amendment, flagged for orchestrator acknowledgement. Not dropped.
- **AC-32 as written** requires that the never-skip enumeration in all three installed command files
  name **no** `devils-advocate`. That text is downstream of the A12 wording that D-1 overrode;
  satisfying it literally would re-introduce the net deletion the orchestrator ruled against.
- **Amended text to verify against:** *the never-skip enumeration in `.claude/commands/lsi.md`, the
  Codex equivalent, and the Cursor command/rule names red-team's `plan-attack` mode as a guaranteed
  slot, AND retains `devils-advocate`; the roster's mechanical never-skip set (`neverSkip` +
  `neverSkipModes`) is a strict superset of the pre-change set — no net deletion.*
- **Reason:** the criterion's intent (the guaranteed slot holds an evidence-based adversary) is fully
  met by adding `plan-attack`. Its incidental clause (removal of devils-advocate) is the exact defect
  D-1 corrected. A `must` criterion is not being discharged by argument; it is being restated to
  match a fact dispute already settled by observation.

## D-3 — `docs/CRITICISM-RESPONSE.md` A1 is AMENDED (capability cache)

- **Agent:** `lazysitter-devils-advocate`, secondary objection.
- **Observation:** A1's "cached across runs, refreshed on drift" design reproduces A1's own fault. A
  repo cached as `test-runner: present-but-inert` that later gains a real suite takes the
  "absent → not spawned, named gap" path and exits GREEN with the real suite never run.
- **RULING (orchestrator, already made):** the capability probe RE-EXECUTES every run.
  `.lazysitter/knowledge/CAPABILITIES.md` is a drift-diff target and audit record, never authority a
  gate consumes. Recorded as contract C3 in `PLAN.md`.
- **Losing position:** "cached across runs, refreshed on drift" (A1 and R2's recon justification).
- **Reason:** a heuristic drift check is exactly the "did the command exit 0" shape A1 exists to
  destroy. The probe is `low`-tier and cheap; caching it saves nothing worth a false green.

## D-4 — recon stays `low` tier AND is removed from the authorization path

- **Agent:** `lazysitter-security-expert`, T9(a): a `low`-tier recon agent must not be the sole
  authorizer of a production release.
- **Competing constraint:** AC-2 is a `must` and pins recon to `low` in all three adapters.
- **RULING:** both hold. Recon stays `low`. Release and rollback each gain a human-signed
  precondition line, and Tier 8 re-executes deploy topology and the non-interactivity check rather
  than reading recon's record (T9(b), same rule as C3).
- **Reason:** the threat is authority, not tier. Raising the tier would cost money and still leave an
  agent as the sole authorizer. Removing it from the authorization path closes the threat exactly.

## D-5 — `neverSkipModes` as a sibling key, not a restructured `neverSkip`

- **Agent:** architect (this document), against the alternative of promoting `neverSkip` entries to
  objects.
- **RULING:** `neverSkip` remains a flat array of strings. A new optional `neverSkipModes` array of
  `{agent, mode}` objects carries the mode requirement. `core/roster.schema.json` adds it to
  `properties` but not to `required`.
- **Losing position:** union-typed `neverSkip` items (`string | {agent, mode}`).
- **Reason:** the orchestrator's backward-compatibility constraint is explicit — `neverSkip` must
  remain a valid array of strings for any existing reader, and `roster.schema.json` must still
  validate. A union type breaks every existing reader that does a string compare, for no gain.

## D-6 — no `src/` enforcement of never-skip in this work

- **Agent:** architect, against a stronger reading of "mechanical teeth."
- **RULING:** teeth are supplied by `test/smoke.js` (contract C2), not by new runtime enforcement
  inside `src/roster.js` or the installer.
- **Losing position:** make `loadRoster` throw when a `neverSkipModes` mode is missing from its
  agent body.
- **Reason:** `neverSkip` governs orchestrator *runtime* routing, which lives in markdown, not in the
  Node installer. Runtime enforcement in the installer would fail an install over a playbook
  authoring error — the wrong failure mode. The smoke suite is the project's only mechanical gate and
  fails the build, which is where this belongs. Recorded so a future reader knows the weaker
  enforcement was chosen deliberately.

## D-7 — T2 (stored command injection) is treated as gating, not advisory

- **Agent:** `lazysitter-security-expert`, T2.
- **RULING:** ACCEPTED without modification, and sequenced as a precondition: the C5 allowlist ships
  in the `CONVENTIONS.md` template (W3) and in the explorer/recon bodies (W1, W4) in the same waves
  that first tell an agent it may re-run a committed probe. A malformed probe BLOCKs.
- **Reason:** A5 (committed knowledge) × A8 (agents re-run probes) × Bash grants is an RCE class, not
  a hardening nicety. A PR editing a tracked knowledge file would otherwise get code execution on the
  next maintainer's run.

## D-8 — REVERSED by D-19. Round-1 R2 amended for four specialization agents

- **Original ruling (rev 1):** ship `lazysitter-react-expert`, `-angular-expert`, `-nextjs-expert`,
  `-aws-expert` as Tier-4 roles under a REPLACES rule; roster 27 → 32.
- **Status: REVERSED.** See D-19. Retained because D-19's reasoning is only legible against it, and
  because the falsifier D-8 recorded is close to what the DA actually used to break it.

## D-9 — REVERSED by D-18. Round-1 R7 overturned to grant `WebFetch`

- **Original ruling (rev 1):** `WebFetch` only, never `WebSearch`, to `dependency-auditor` and the
  woken specialization experts, domain-allowlisted to four hosts.
- **Status: REVERSED.** See D-18. Retained because the *need* argument in it remains correct and is
  what L-15 now discloses; only the mitigation was unsound.

## D-10 — A16's pipeline-wide no-comments ground rule is REPLACED (B15 / R-B)

- **Losing position:** round-1 A16, which elevated *"never add code comments"* to a pipeline-wide
  ground rule binding every writing agent.
- **Settled by observation, not by ruling (an A4 `fact` dispute):** measured comment density in the
  EVV repo — baseline 7.03%, LazySitter's surviving code 4.23%, i.e. **40% below** norm, the opposite
  of the reported symptom. The densest comment block found was the most valuable artifact the pipeline
  produced.
- **RULING:** replaced by *match the measured comment density of the sibling file you selected from
  the ranked precedent set*, plus an absolute ban on AC-IDs and decision references in shipped source.
  Rev 2 changes only *which* sibling: the C2 selection, not a free citation.
- **Guard against a false read:** this repo's own near-zero density is exactly what the corrected rule
  yields here. LazySitter's own no-comments constraint is **unchanged**; a reader who takes D-10 as
  licence to add comments to `src/` has misread it.

## D-11 — `database-expert` → `data-layer-expert` is a rename, and the rename is the point (B11)

- **RULING:** rename the role file and rekey the roster; do not add a second agent. Unchanged in rev 2.
- **Reason:** the name is load-bearing on dispatch. `triage` reads `database-expert`, sees no DB in a
  frontend repo, and skips it forever — in a repo whose real data layer is IndexedDB,
  `localStorage`, in-memory API caches, and socket-driven invalidation ordering.
- **Mechanical constraint carried into the plan:** `src/roster.js:24-29` throws when frontmatter
  `name:` and filename disagree, and `:34-38` throws on an agent absent from `core/roster.json`. So
  the file rename, the `name:` field, and the roster key must move together or the installer fails
  loudly. That is the desired failure mode, and it is why the rename cannot be partial.

## D-12 — one wave is the sole carrier of roster-count and roster-name change

- **RULING:** every count/name change lands in a single wave and nowhere else. Rev 2 shrinks the
  payload (one addition + one rename, 27 → 28) but the rule is unchanged, and the wave is W5.
- **Losing position:** grouping by theme, which would put `reuse-auditor` alongside the precedent
  work in W1.
- **Reason:** `test/smoke.js` hardcodes the count at lines 46, 77 and 321 and carries an
  `ORIGINAL_26_AGENTS` allow-list that reads a rename as a deletion. Spreading roster changes across
  waves makes every intermediate wave red for a reason unrelated to its own content, destroying the
  "each wave ships green" property. Shippability beats thematic tidiness when the suite has
  hardcoded counts.

## D-13 — B1 is REVISED: the precedent set is machine-derived, not implementer-declared

- **Challenger:** `lazysitter-devils-advocate`, round 2, counter-example 1 — **SUSTAINED**.
- **The counter-example, which is decisive:** six existing confirm modals are six *citable*
  precedents. Citing #4 is a correct, resolvable, reviewer-verifiable citation that **still ships the
  seventh duplicate.** In 162k lines, "did some file once do it this way?" is always yes. Worse,
  mid-migration the legacy convention has MORE hits and is therefore MORE citable — rev 1's B1
  mechanically rewarded imitating what the team is migrating away from.
- **RULING:** rev 1's C1/C2 (implementer-declared `path:line` citation) is **WITHDRAWN**. `explorer`
  emits a **ranked candidate set** per artifact category — hit count, newest-blame date, deprecation
  signal — and the implementer must **select from that set** or argue `NONE-EXISTS` against it
  (rev 2 C1–C3).
- **Losing position:** the architect's rev 1 design, and B1's own wording in
  `docs/CRITICISM-RESPONSE-2.md`.
- **Reason:** the free choice is where laundering enters. Removing it costs one section in a document
  that already exists and needs no new schema field.

## D-14 — a tie between two precedent clusters is a `fact` dispute, not a tiebreak

- **Challenger:** DA counter-example 2, the must-answer — **SUSTAINED**: rev 1 supplied no oracle for
  choosing between competing conventions.
- **RULING:** the ranked set carries *all* clusters with counts and dates, and **two live clusters IS
  the migration signal.** It raises a `FACT-BLOCK` (A3 machinery, already shipped): *"repo has two
  live conventions for X — which is canonical?"* One human line settles it; the answer is written into
  `CONVENTIONS.md` so it is answered once, ever.
- **Explicitly forbidden:** an architect ruling. This is an A4 `fact` dispute, and ruling on facts is
  forbidden — a coin flip recorded as a decision is exactly what A4 exists to prevent.

## D-15 — a `reuse-auditor` finding may break the test freeze, and that is sanctioned

- **Challenger:** DA counter-example 3 — **SUSTAINED**: B2 is most expensive exactly when it is most
  right, because "delete your new modal, use the existing one" changes the public contract the frozen
  suite was authored against.
- **RULING:** a B2-driven contract change is an **explicitly sanctioned freeze exception**, logged in
  `DECISIONS.md` like a mechanics-only repair but distinguished from one by the fact that it *does*
  change assertions: affected tests are re-authored from the amended contract, re-hashed, and the
  teeth check is re-run. Stated in both playbooks.
- **Skip rule widened in the same ruling:** `reuse-auditor` must still run when the diff duplicates a
  **non-exported internal helper** inside an existing file — a common frontend duplication shape that
  "no new file, no new export" would have skipped.
- **Cost accepted knowingly:** this makes a correct B2 finding expensive rather than free. The
  alternative — leaving the exception unstated — makes the pipeline structurally prefer suppressing
  its most valuable finding.

## D-16 — `reuse-auditor` is justified by independence, not by novelty

- **Challenger:** DA counter-example 4 — **SUSTAINED**: `explorer.md:29` already mandates reuse-first
  search with probe, hit count and an explicit `NONE-FOUND`, and it already shipped. Six confirm
  modals happened anyway.
- **RULING (a diagnosis, stated in one line in the plan):** explorer's reuse output is advisory **to
  the architect**, and the architect then authored the plan that authorised the file — so the finding
  never reached an oracle outside the build lineage. **B2 is not a new capability; it is the same
  capability placed outside the lineage that consumed it.**
- **Reason it must be written down:** without this sentence, `reuse-auditor` is indistinguishable from
  a mechanism already known to fail, and the first cost-cutting pass will delete it.

## D-17 — B3 is REVISED on all three defects

- **Challenger:** DA counter-example 5 — **SUSTAINED** in three parts.
- **(a) Negative assertions are vacuous.** A grep finding nothing cannot distinguish "convention
  upheld" from "symbol renamed / file deleted / my pattern rotted." **RULING:** every negative
  assertion is paired with a **positive existence probe** proving the pattern is still findable
  somewhere; a paired positive returning 0 marks the row `STALE`, never `live`.
- **(b) No in-pipeline executor.** `explorer`'s Bash is bound by the C5 probe allowlist, which
  excludes `dotnet build`, `npm test` and exit-code tests. **RULING:** assertions are executed by
  **`lazysitter-recon`** at preflight — it already holds `Bash` and already re-executes every run per
  A1/C3. Not explorer, and **no C5 exemption is granted.**
- **(c) B3 contradicted B11.** B11's headline example — socket-driven invalidation ordering, "stale
  data with no error anywhere" — is a temporal property with no passing shell command, so B3 as
  written **forbade recording the exact defect class B11 exists to catch.** **RULING:**
  non-executable conventions are kept as `unverifiable` rows with a named human owner and an expiry,
  excluded from the automatic trust path but **not deleted.**

## D-18 — REVERSES D-9. B14 is dropped; round-1 R7's original rejection stands

- **Challenger:** DA counter-example 7 — **SUSTAINED**, and the orchestrator's own reversal of R7 is
  withdrawn as wrong.
- **Why the mitigation was unsound, point by point:** there is no enforcement point (no
  `settings.json`); the domain allowlist would be prose in an agent body, **structurally identical to
  the C5 allowlist red-team already proved bypassable** (L-4); `WebFetch` follows redirects, so an
  allowlisted host is one 302 from anywhere; and the fetched page is untrusted text entering an
  agent's context. Round 2 argued the *need* convincingly and the *mitigation* not at all.
- **RULING:** **no `WebFetch`, no `WebSearch`, no `codexNetwork` roster field.** The task is dropped
  entirely. `dependency-auditor` instead emits an explicit **`cannot-verify-offline`** named
  degradation rather than returning clean.
- **Losing position:** D-9, and B14 in `docs/CRITICISM-RESPONSE-2.md`.
- **What survives from the losing position:** its diagnosis. An auditor that returns CLEAN because it
  cannot reach a CVE database is worse than absent. That is now fixed by honesty (rev 2 C16) instead
  of by network, and the residual capability gap is disclosed in L-15.

## D-19 — REVERSES D-8. No new expert agents; framework/cloud expertise ships as playbook sections

- **Challenger:** DA counter-examples against R-A — **SUSTAINED** on three independent grounds:
  detection is **non-exclusive** (a Next.js repo contains `react`; a monorepo can carry React and
  Angular), rev 1 supplied **no resolution rule** for that, and specializing the *advisor* while
  leaving `frontend-implementer` generic **recreates the exact advisor→implementer seam** that
  per-layer implementers were rejected over.
- **RULING:** zero new expert agents. Framework and cloud expertise ships as **per-framework sections
  inside the existing `frontend-expert`, `frontend-implementer` and `infra-expert` bodies**, scoped by
  a `framework:` / `cloud:` fact that `triage` records in `MANIFEST.md`. Detection precedence is
  explicit (`next` beats `react`); **multiple frameworks detected raises a `FACT-BLOCK`, never a
  guess.**
- **Consequences:** roster 27 → **28** (`reuse-auditor` only). The advisor→implementer seam is removed
  because the same section text binds both. Three DA objections close at once.
- **Preserved unchanged from D-8:** the user's AWS hard default — do not introduce an AWS service the
  project does not already use; suggest only, with an estimated monthly cost delta; a new Lambda must
  be justified against extending an existing one.

## D-20 — `CONVENTIONS.md` becomes an execution surface, and inherits the never-auto-approve rule

- **Agent:** architect, consequent on D-17(b). Not handed down — raised and decided here.
- **Observation:** moving assertion execution to `recon` means a **tracked, committed file now
  supplies commands that run on every preflight**, and unlike the C5 re-probe path those commands are
  deliberately unconstrained (`dotnet build`, `npm test`). This is a strict escalation of the T2
  stored-command-injection class D-7 already treats as gating.
- **RULING:** `CONVENTIONS.md` inherits `SECRETS-BASELINE.md`'s existing treatment verbatim — **any
  diff touching it is flagged and NEVER auto-approved, even under `--auto`.** Precedent:
  `core/orchestrator.claude.md:174`.
- **Reason:** the guard costs one line, reuses a mechanism already shipped and already asserted in
  smoke, and puts a human in front of the only path by which a committed file executes arbitrary code.
  It does not make the surface safe — that is L-20 — but it makes it reviewed.
