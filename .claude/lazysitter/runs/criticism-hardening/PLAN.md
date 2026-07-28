# PLAN (v1)

## Approach

Seven waves. Each is independently shippable and ends with `node test/smoke.js` exit 0. The two
changes that can break the installer for every user — src/ path-and-name handling, and the roster
count 26→27 — are isolated into waves of their own (W0, W1) so a bisect lands on one cause.

Three rules bind every wave:
1. `core/` is the only edit surface for content. `.claude/`, `.codex/`, `.cursor/` are outputs.
2. A frontmatter change is never enough on its own. Claude reads `model:`/`tools:` from the agent
   file; Codex reads `TIER`/`SANDBOX` from `.meta` (derived from `core/roster.json`); Cursor derives
   `model:` from `roster.tier` and `readonly:` from `roster.codexSandbox === 'read-only'`. **Any tier
   bump or Bash grant must edit BOTH the agent frontmatter AND `core/roster.json`, or the three
   adapters silently disagree.** This is the single most likely defect in this work.
3. Every playbook sentence lands in `core/orchestrator.claude.md` AND `core/orchestrator.codex.md`,
   plus `core/cursor/LazySitter.rule.mdc` where it restates a guarantee. No code comments anywhere.

## Interfaces / contracts (for implementers & test-author)

**C1 — `neverSkip` mechanical teeth (backward compatible).**
`core/roster.json` keeps `neverSkip` as a flat array of strings; it GAINS `lazysitter-recon`-free
membership unchanged and **retains `lazysitter-devils-advocate`** (11 → still 10 names; no deletion).
A new sibling key `neverSkipModes` expresses a required *mode*:
```
"neverSkipModes": [
  { "agent": "lazysitter-red-team",    "mode": "plan-attack" },
  { "agent": "lazysitter-test-runner", "mode": "teeth-check" }
]
```
`core/roster.schema.json` adds `neverSkipModes` to `properties` but NOT to `required`, so any
existing reader and any older `roster.json` still validate. `src/roster.js` needs no change; the
whole parsed roster is already returned.

**C2 — assertable never-skip (what `test/smoke.js` must enforce).** For `core/roster.json`:
(a) every string in `neverSkip` is a key of `roster.agents`; (b) `neverSkip` is a superset of the
pre-change 10 names, `lazysitter-devils-advocate` included; (c) for every `neverSkipModes` entry the
`agent` is a key of `roster.agents` AND the literal `mode` token appears in
`core/agents/<agent>.md`; (d) for every `neverSkip` name and every `neverSkipModes.agent`, an
installed file exists at all three of `.claude/agents/<n>.md`,
`.codex/skills/lazysitter/agents/<n>.md`, `.cursor/agents/<n>.md`; (e) each `neverSkipModes.mode`
token appears in `.claude/commands/lsi.md`, `.codex/skills/lazysitter/SKILL.md`, and
`.cursor/commands/lsi.md`.

**C3 — capability probe is never cached authority.** `lazysitter-recon` RE-EXECUTES its probe every
run. `.lazysitter/knowledge/CAPABILITIES.md` is a drift-diff target and audit record only; no gate
may read a capability state from it. Both orchestrators must say this in those words.

**C4 — `SECRETS-BASELINE.md` schema (allowlist, not denylist).** Rows are scoped to `git ls-files`
output ONLY. Permitted columns: finding id, `path:line`, rule class, severity, first-seen SHA,
status, `sha256(ruleId + ':' + path + ':' + line)`. **Forbidden, absolutely:** the matched value, any
masked/truncated/redacted form of it, the surrounding source line, and any hash derived from the
value. Untracked-path hits are reported in-run only and recorded in the file as a withheld count.
An `accepted` status requires `accepted-by:` + ISO date + rationale on the same row.

**C5 — probe allowlist (applies to any committed probe command re-executed by an agent).**
Allowed heads only: `git log`, `git branch`, `git ls-files`, `git rev-parse`, `grep`, `rg`, and glob
expansion. Rejected if the string contains `;`, `&&`, `||`, `|`, `>`, a backtick, or `$(`, or names
`curl`, `wget`, `npm`, `node -e`, `sh -c`, `python -c`. Arguments are passed literally and are never
built by concatenating requirement or ticket text. **A malformed probe BLOCKs; it is never silently
executed and never silently skipped.**

**C6 — scratch charter (A11).** Execution happens in a per-run unique directory under the OS temp
dir, deleted at run end. **Never** `.lazysitter/scratch` or anywhere in the repo tree. No package
install, no container pull, no network, no real database, no repo credential read. If the candidate
cannot run offline, record `cannot-execute` and downgrade the claim tag from `[observed]` to
`[reasoned]`.

**C7 — verdict schema addition.** `verified_by: <agent-name>` and `independent: true|false` join
`verdict`/`blocking`/`degraded`/`evidence`/`claims`/`concerns`.

**C8 — `.lazysitter/` tracking split.** `knowledge/**` is tracked and `writePreserve`. LazySitter
writes a managed `.lazysitter/.gitignore` containing exactly `RUN.lock` and `runs/` — and never
`knowledge/`. `uninstall --purge` MUST NOT delete `.lazysitter/knowledge/**`; that requires the
distinct additional flag `--purge-knowledge`, and the retained paths are printed.

## Tasks

### Wave 0 — installer safety net (src/ only; roster still 26; no adapter output change)
- [backend] `src/roster.js`: reject any agent whose resolved `name` fails `/^lazysitter-[a-z0-9-]+$/`
  — throw with the offending file name. All 26 current names pass.
- [backend] `src/context.js` `write`/`writePreserve`/`copy`/`mergeMarkedBlock`: assert the resolved
  absolute path is contained under `targetRoot` (resolve, then compare with a trailing-separator
  boundary, not a bare `startsWith`); throw on escape.
- [backend] `src/context.js` `mergeMarkedBlock`: treat the block as present only when
  `beginIdx !== -1 && endIdx > beginIdx`; otherwise take the append path. Fixes unbounded
  duplication of a user `AGENTS.md`.
- [backend] `src/uninstall.js`: containment-check every `fs.rmSync` target against `targetRoot`
  before deleting; fix the `dir.startsWith(stopAt)` prefix bug at line 79 (`d:\lazy` matches
  `d:\lazysitter-other`) by comparing on a separator boundary.
- [backend] `test/smoke.js`: add assertions for the `AGENTS.md` reversed/duplicate-marker case and
  for a second install into a sibling directory whose name is a prefix-extension of the first.

### Wave 1 — roster 26 → 27 (isolated)
- [backend] Add `core/agents/lazysitter-recon.md`: frontmatter `name: lazysitter-recon`,
  `tools: Read, Grep, Glob, Bash, Write`, `model: haiku`. Body states the three capability states
  `available | absent | present-but-inert`, defines `present-but-inert` (exits 0 having done zero
  work, e.g. a runner discovering 0 tests) as **worse than `absent`** (AC-3); states the probe
  re-executes every run and `CAPABILITIES.md` is never gate authority (C3); states it fails loudly
  with a named degradation when `high_alt` is unset or equals `high`, and that this degradation
  blocks any downstream claim of red-team blind-spot independence (AC-37); binds itself to C5 and to
  the explorer Bash scope (no `push`/`checkout`/`switch`/`reset`/`clean`, no writes outside
  `<run-dir>` and `.lazysitter/knowledge/`, no network, no `gh`/`aws`/`az`/`kubectl`); states its own
  output is **never** sufficient authorization for a production release (see W6).
- [backend] `core/roster.json`: add `"lazysitter-recon": { "tier": "low", "codexSandbox":
  "workspace-write", "codexApproval": "never", "note": ... }`. Tier `low` + `model: haiku` together
  satisfy AC-2 on all three adapters.
- [backend] `core/cursor/LazySitter.rule.mdc`: `26 agents` → `27 agents`.
- [backend] `test/smoke.js`: both `=== 26` assertions → `=== 27`; assert
  `.claude/agents/lazysitter-recon.md`, `.codex/skills/lazysitter/agents/lazysitter-recon.md` +
  `.meta`, and `.cursor/agents/lazysitter-recon.md` exist; assert the Cursor recon `model:` equals
  `models.json.low`.

### Wave 2 — never-skip teeth, `plan-attack`, devils-advocate retool
- [backend] `core/roster.json`: add `neverSkipModes` per C1; **do not remove
  `lazysitter-devils-advocate` from `neverSkip`**; change `lazysitter-devils-advocate.codexSandbox`
  from `read-only` to `workspace-write` (this is what makes Cursor render `readonly: false` for
  AC-30 — a frontmatter-only change would leave Cursor wrong).
- [backend] `core/roster.schema.json`: add `neverSkipModes` to `properties` only.
- [backend] `core/agents/lazysitter-red-team.md`: add a `plan-attack` mode section structurally
  parallel to `lazysitter-test-runner`'s `teeth-check` (same agent, same `high_alt` distinct model,
  input `PLAN.md`, before implementation, mandate to execute rather than argue, bound by C6).
- [backend] `core/agents/lazysitter-devils-advocate.md`: `tools: Read, Grep, Glob, Bash`; mandate
  becomes falsifiable-counter-example **or** `NO-CHALLENGE` naming the strongest objection considered
  and why it fails; remove any "always object" standing mandate; bind to C6.
- [backend] Both orchestrators + cursor rule: place red-team `plan-attack` strictly before the
  implementer tier; Tier 4 does not close until the plan survives it; the never-skip enumeration
  names `plan-attack` as a guaranteed slot **and retains devils-advocate**.
- [backend] `test/smoke.js`: implement C2 (a)–(e).

### Wave 3 — committed knowledge, gitignore warning, doctor parity (src/ + templates)
- [backend] `templates/knowledge/`: seed `CAPABILITIES.md`, `CONVENTIONS.md`,
  `PROJECT-PITFALLS.md`, `ONE-WAY-DOORS.md`, `SECRETS-BASELINE.md`. `CONVENTIONS.md` template
  mandates per-claim probe command + hit count + `path:line` + verified-at SHA (AC-14) and restates
  C5. `SECRETS-BASELINE.md` template carries the C4 column allowlist and the forbidden-columns line
  verbatim. Every template states: cite a Jira **key only**, never quoted ticket text.
- [backend] All three installers: `ctx.writePreserve('.lazysitter/knowledge/<file>')` for the five
  files (repo-root, shared, written once regardless of which adapters are selected).
- [backend] `ctx.write('.lazysitter/.gitignore', 'RUN.lock\nruns/\n')` per C8.
- [backend] `src/install.js` + `src/doctor.js`: read `.gitignore` files from repo root down; if
  `.lazysitter/` or `.lazysitter/knowledge/` is ignored, print a warning naming the ignored path
  (AC-13).
- [backend] `src/doctor.js`: extend the `high_alt == high` check to name **each** of the three
  adapters affected in one run — Cursor `models.json`, Codex `models.env`, and Claude (agent
  `model:` frontmatter of `lazysitter-red-team` vs the high-tier agents) (AC-38).
- [backend] `src/uninstall.js`: implement C8's `--purge-knowledge` gate.
- [backend] `test/smoke.js`: assert the five knowledge files exist, appear in `manifest.preserve`
  and not in `manifest.managed`; assert an appended line to `PROJECT-PITFALLS.md` is byte-identical
  after `update`; assert the gitignore warning fires; assert `--purge` retains `knowledge/` and
  `--purge --purge-knowledge` removes it; assert `.lazysitter/.gitignore` names `RUN.lock` and
  `runs/` and does not name `knowledge`.

### Wave 4 — explorer + triage hardening (A8, A9, A16-reuse)
- [backend] `core/agents/lazysitter-explorer.md`: frontmatter `tools:` gains `Bash`; `model: haiku`
  → `sonnet`. `core/roster.json` explorer `tier: low` → `mid` **in the same commit** (AC-26 across
  all three). Body gains: the C5 probe allowlist and the C8/T8 Bash scope; every convention claim
  carries probe + hit count + `path:line` + verified-at SHA and "a claim without a probe is not a
  fact"; mandatory branch-inventory probe (`git branch -a` + a cross-branch `git log --all --grep`);
  the convention bank (date/number formatting, JSON casing, enum wire values, error shape, logging,
  null handling); an explicit "does this already exist?" reuse-first section that must name what was
  searched even when the answer is `NONE-FOUND`; the narrow re-probe right and the rule that a
  contradicted pack fact BLOCKs and invalidates every verdict that rested on it. Density, not volume
  — no unbounded-length license (R3 stays rejected).
- [backend] `core/agents/lazysitter-architect.md`: document the downstream re-probe right and the
  contradiction-invalidates rule from the consumer side (AC-24).
- [backend] `core/agents/lazysitter-triage.md`: `model: haiku` → `sonnet` **and** roster
  `tier: low` → `mid`; document the volatility × blast-radius 2×2 (`SPIKE`, `SPIKE-then-HARDEN`,
  `FAST`, `FULL`) plus the `MICRO` lane (implementer still spawned; spec/panel/plan skipped); every
  panel-inclusion decision must cite a detected package, directory, or grep hit.
- [backend] `test/smoke.js`: assert Claude explorer `tools:` contains `Bash`; Cursor explorer
  `readonly: false`; Cursor explorer and triage `model:` equal `models.json.mid`; Codex explorer
  `.meta` `TIER=mid`.

### Wave 5 — gate integrity and orchestrator playbook (A3, A4, A7, A13, A14 `--auto`, AC-41)
- [backend] Both orchestrators: define `FACT-BLOCK` with all three conditions, batched once per
  tier, never closable by an architect ruling. Define the three dispute classes (`preference` /
  `fact` / `one-way`) with an architect ruling forbidden on `fact` and on `one-way`.
- [backend] Both orchestrators: C7 verdict fields; the gate refuses GREEN when any blocking finding
  was cleared with `independent: false`; the orchestrator may not `Edit`/`Write` source and even a
  one-line fix spawns an implementer via the MICRO lane.
- [backend] Both orchestrators: merge gate hard-BLOCKs on unresolved `degraded:true`, closable only
  by an explicit recorded per-run human waiver. **State in all three files that `--auto` does NOT
  satisfy that waiver** — otherwise `--auto` silently voids the hard-BLOCK.
- [backend] `core/orchestrator.claude.md:29`: delete `(default)`. Both files state the merge gate
  and post-merge rollback HOLD and summarize unless `--auto` is passed explicitly (AC-33).
- [backend] Both orchestrators: agents whose required substrate is `absent` are not spawned and the
  absence is recorded in the final report as a named coverage gap; the unresolved-critical count
  from `SECRETS-BASELINE.md` is printed in **every** final report regardless of that file's state;
  any diff touching `SECRETS-BASELINE.md` is a flagged, never-auto-approved change.
- [backend] Both orchestrators: run dir anchored via `git rev-parse --show-toplevel` and nothing
  else; `.lazysitter/RUN.lock` at Tier 0 refusing a second concurrent run in the same working tree;
  halt and re-sync (not continue) if `HEAD` changes under the run.
- [backend] Both orchestrators: after any agent reports persisting an artifact, the orchestrator
  independently confirms the file exists on disk before treating it as available (AC-41).
- [backend] `core/cursor/LazySitter.rule.mdc`: restate the `degraded:true` hard-BLOCK, the `--auto`
  non-waiver, and the `independent: false` refusal.
- [backend] Add three agent bodies (C7) to `code-reviewer`, `red-team`, `test-runner` at minimum;
  `test/smoke.js` asserts `verified_by` and `independent` in all three across all three adapters.

### Wave 6 — adversary charter, Tier 8 gating, reviewer/implementer mandates
- [backend] `red-team` + `devils-advocate` bodies: the C6 scratch charter verbatim, with at least one
  per-ecosystem recipe referenced (AC-44).
- [backend] `secrets-scanner`: baseline-once + delta-vs-baseline; C4 schema; unresolved pre-existing
  criticals surfaced in every final report until fixed or explicitly accepted.
  `dependency-auditor`: pre-existing (not diff-only) vulnerable/stale deps reported.
- [backend] `release-agent`: may not act unless deploy topology is recorded and verified at recon,
  including an explicit "is this command non-interactive?" check — and **both the topology and the
  non-interactivity check are RE-EXECUTED at Tier 8, never read from `CAPABILITIES.md`**. Add a
  human-signed precondition line: a `low`-tier recon output is never the sole authorizer of a
  production release or rollback.
- [backend] `rollback-agent`: standing authority void unless reversibility was established via the
  architect's one-way-door inventory; same human-signed precondition line.
- [backend] `monitor-agent`: requires a named, reachable signal source; absent → does not run, gap
  reported; must never report "stable" with no signal source.
- [backend] `architect`: `ASSUMPTIONS.md` with each external fact tagged
  `verified-from:<path:line|command>` or `UNVERIFIED`, a load-bearing `UNVERIFIED` BLOCKs the gate;
  the fixed non-functional checklist (cost/capacity, concurrency, ordering, tenancy, cross-repo
  contract, ecosystem staleness, build-topology invariants, reversibility) as a mandate distinct
  from the ACs.
- [backend] `code-reviewer`: mechanical build-result classification separating real compile
  diagnostics from environment failures, explicitly forbidding an exit code plus a human-language
  qualifier; footprint accounting (files created vs justified, comments added, dead code orphaned)
  blocking on unjustified net-new surface.
- [backend] Both implementer bodies: encoding and EOL preserved on edit; no silent BOM stripping, no
  CRLF/LF normalization.
- [backend] Both orchestrators: move the no-comments rule to a pipeline-wide ground rule binding
  every agent that can write.
- [backend] `test/smoke.js`: AC-15/16, AC-34/35/36, AC-39/40, AC-42/43/44/46 content assertions
  across all three adapter renderings; plus AC-49 (no `WebFetch`/`WebSearch` in any frontmatter, all
  five named agents still in the roster, roster additions == exactly `lazysitter-recon`) and AC-50
  (no `//` or `/* */` comments introduced into changed `src/`, `bin/` files).

## Expert concerns addressed

- **T1 (SECRETS-BASELINE as targeting map)** — ACCEPTED in full as C4, plus the unresolved-critical
  count printed in every final report regardless of file state and the flagged-never-auto-approved
  diff rule (W5, W6).
- **T2 (stored command injection via committed probes)** — ACCEPTED in full as C5. This is the
  highest-severity finding in the panel and it gates W3 and W4: the `CONVENTIONS.md` template ships
  the allowlist, and the explorer/recon bodies bind to it before any agent is told it may re-run a
  committed probe.
- **T3 (Jira exfiltration)** — ACCEPTED. Key only, never quoted ticket text, in every knowledge
  template (W3).
- **T4/T5/T6 (name traversal, uninstall containment + prefix bug, merge ordering)** — ACCEPTED and
  pulled forward to W0 so they ship before anything new writes to disk.
- **T7 (scratch charter)** — ACCEPTED in full as C6, including the `cannot-execute` →
  `[reasoned]` downgrade. This is what keeps A11 from becoming R4.
- **T8 (explorer Bash scope)** — ACCEPTED. Bound into the explorer and recon bodies in W1/W4.
- **T9(a) recon is not an authorizer** — ACCEPTED, and note it does not conflict with AC-2: recon
  stays `low` (AC-2 is a `must`) and is simply removed from the authorization path by the
  human-signed precondition line on release/rollback.
- **T9(b) re-execute at Tier 8** — ACCEPTED, and generalized: it is the same rule as C3. No Tier-8
  precondition is ever read from `CAPABILITIES.md`.
- **T9(c) `--auto` is not the A1 waiver** — ACCEPTED and treated as blocking. Without it, W5's
  hard-BLOCK is decorative. Stated in all three files.
- **Tracking split / `--purge`** — ACCEPTED as C8.

## Devils-advocate response

Both objections were verified mechanically by the orchestrator and both are **correct**; neither is
argued with here.

1. *A12's "swap" is a net deletion, and `neverSkip` is read by no code.* Sustained. The plan
   implements the orchestrator's ruling: devils-advocate stays, `plan-attack` is added as a mode,
   and `neverSkipModes` + C2 give the list mechanical teeth for the first time. The challenge is the
   reason W2 exists as a wave at all — the original A12 text would have shipped a guarantee
   reduction under the label "swap."
2. *A1's capability cache reproduces A1's own fault.* Sustained. C3 makes the probe re-execute every
   run and demotes `CAPABILITIES.md` to a drift-diff and audit record. The specific scenario named
   (a repo cached `present-but-inert`, later gaining a real suite, exiting GREEN on the
   "absent → named gap" path) is no longer reachable, because no gate reads the file.

## DECISIONS / OVERRIDES

See `DECISIONS.md` in this directory.

## LIMITATIONS

See `LIMITATIONS.md` in this directory (appended, not replaced).

## Open items

None blocking. One criterion amendment (AC-32) is recorded in `DECISIONS.md` as D-2 and needs the
orchestrator's acknowledgement at the intent gate, not a second design round — the underlying fact
dispute is already settled by observation.
