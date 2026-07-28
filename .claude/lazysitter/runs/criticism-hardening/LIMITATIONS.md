# LIMITATIONS

User-facing constraints this run knowingly accepts. Disclosed here so they are not discovered at
the intent gate.

L-1…L-9 are round 1. L-10…L-14 were written for `PLAN-R2.md` rev 1; **L-10 is now VOID and L-12/L-14
are rewritten** after the rev-2 rulings. L-15…L-20 are new in rev 2.

## L-1 — No lint, no typecheck, no CI in this repo
Static-quality regressions in `src/*.js` are not mechanically detectable. `node test/smoke.js` is
the sole gate. Recorded at Tier 0c as a conscious gap; no tooling is installed mid-feature.
(Carried forward from `MANIFEST.md`.)

## L-2 — Adapter parity remains hand-maintained
`core/orchestrator.claude.md` and `core/orchestrator.codex.md` are two hand-written copies, and
`core/cursor/LazySitter.rule.mdc` is a third restatement. This work fixes the known `--auto` drift
and adds the same sentences to all three, but **no test asserts the two orchestrators are
semantically identical.** `test/smoke.js` can only assert that a required token appears in each. A
future edit to one file and not the other will still drift silently.

## L-3 — Never-skip teeth are test-time, not runtime
Per DECISIONS D-6, `neverSkip` / `neverSkipModes` are enforced by `test/smoke.js`, not by
`src/roster.js` or the orchestrator runtime. A user who edits an installed
`.claude/commands/lsi.md` to drop a never-skip agent is caught by `lazysitter doctor` (managed-file
hash drift) but not by any runtime refusal.

## L-4 — Probe allowlist (C5) is a documented mandate, not a parser — and not a security control
LazySitter ships markdown role definitions plus a zero-dependency installer; it does not ship a
shell-command validator. The allowlist, the rejected-metacharacter set (now including `-c`
config-injection flags, `alias.`, `bash -c`, `--upload-pack`, `--exec`, `--output`), and the
BLOCK-on-malformed rule are stated in the agent bodies and the `CONVENTIONS.md` template, and
`test/smoke.js` asserts that text is present in all three adapters. **Be honest about what this
achieves: a prose mandate constrains a cooperative agent choosing to honor it — it is not a control
against a hostile committed file.** Proven concretely: `git -c "alias.probe=!bash payload.sh" probe`
has an allowlisted head (`git`), contains none of the banned metacharacters, and names none of the
banned binaries in the command string itself, yet achieves arbitrary execution because `git` itself
re-executes config-driven aliases/hooks from whatever `.git/config` sits in the target repo — a file
the repo's own (possibly malicious) commit controls. Enforcement at execution time depends entirely
on the agent honoring its own charter and never invoking `git` against a working tree/config it has
not already trusted. This is the same class of guarantee as every other LazySitter mandate; it is
called out because the threat it answers (T2/C5) is an RCE class and the gap is easy to overclaim as
"mitigated" when it is only "documented." **Rev 2 makes this worse before it makes it better — see
L-20.**

## L-5 — Scratch-execution charter (C6) has no shipped harness
Per R4 (rejected) and A11, LazySitter mandates "execute rather than argue in an OS-temp scratch
directory" but ships no ecosystem runner. Where a candidate cannot run offline with no package
install and no container pull, the agent records `cannot-execute` and the claim is downgraded from
`[observed]` to `[reasoned]`. Some real defects will therefore remain reasoned-about rather than
demonstrated.

## L-6 — Ecosystem staleness stays UNVERIFIED (STANDING — reaffirmed in rev 2)
No agent gets `WebFetch` or `WebSearch`. Dependency maintenance status (e.g. a major version being
in maintenance mode) cannot be checked. `dependency-auditor` sees whatever local audit tooling
reports, not currency. Round 2's B14 briefly overturned this; **DECISIONS D-18 reverses that reversal
and R7's original rejection stands.** The gap is disclosed in `ASSUMPTIONS.md` as `UNVERIFIED` rather
than silently absent, and is now also surfaced per-run by L-15's named degradation.

## L-7 — `.lazysitter/knowledge/` is committed by design
The five knowledge files are tracked, `writePreserve`, and survive `uninstall --purge` (they require
the additional `--purge-knowledge` flag). Consequences the user must accept: the knowledge
directory appears in PRs and diffs; `SECRETS-BASELINE.md` is an attacker-writable gate input, so any
diff touching it is flagged and never auto-approved; and per C4 it may never carry a matched value,
a masked form of one, the surrounding source line, or any hash derived from the value. Untracked-path
secret hits are reported in-run only and appear in the committed file solely as a withheld count —
so a secret living in a gitignored file is deliberately under-recorded in the baseline.

## L-8 — AC-32 is amended, not satisfied as written
Per DECISIONS D-2, the literal AC-32 clause requiring `devils-advocate` to be absent from the
never-skip enumeration is superseded by the orchestrator's ruling that it stays. The amended text is
in `DECISIONS.md`. Anyone verifying against the original `ACCEPTANCE-CRITERIA.md` text will see a
mismatch on that one clause; it is intentional and needs orchestrator acknowledgement at the intent
gate.

## L-9 — Existing installs do not retroactively gain the new tracking split
`.lazysitter/.gitignore` and the knowledge directory are written at install/update time. A project
whose `.gitignore` already ignores `.lazysitter/` keeps ignoring it; LazySitter warns (AC-13) but
does not edit the user's `.gitignore`. The warning is the whole remedy.

## L-10 — VOID (rev 1 only)
This entry described a `WebFetch` domain allowlist enforced on one adapter of three. **The grant no
longer exists** — DECISIONS D-18 drops `WebFetch`, `WebSearch` and the proposed `codexNetwork` roster
field entirely. Retained as a numbered void so a reader of rev 1 finds the reversal rather than
silence. The capability gap it was trying to close is L-6 + L-15.

## L-11 — Executable knowledge reaches new installs only
`templates/knowledge/CONVENTIONS.md` is `writePreserve`d. An existing install keeps its current
`CONVENTIONS.md` on `lazysitter update`, so its rows will not carry the six-column
`CLAIM | path:line | ASSERTION | PAIRED-POSITIVE | last_verified | status` shape and the preflight has
nothing to execute. Those rows are neither validated nor marked `STALE` — they are un-assertable, and
the preflight must treat an un-assertable row as excluded from the context pack rather than as
trusted. Migrating an existing file is a manual, per-repo act LazySitter will not perform.

## L-12 — The precedent ranking is heuristic, and a silently-retired convention still wins
Rev 2 removes the implementer's free choice of precedent (D-13), which closes the laundering path.
What it does not close: `explorer` ranks candidates by hit count, blame recency, and a fixed list of
deprecation signals (`@deprecated` / `[Obsolete]`, a suppression at the site, `legacy` in the path, no
blame activity beside an active competitor). **A convention the team is deliberately retiring without
any of those markers still ranks first and will be imitated.** The `FACT-BLOCK` of C4 only fires when
two clusters are both detectable as live clusters; a migration that is 95% complete presents as one
cluster plus noise and raises nothing. Residual failure mode: new code conformant to a convention the
repo is trying to retire — smaller than rev 1's, not eliminated.

## L-13 — Most of this work is prose-enforced, by design
C4, C9, C10, C13, C14, C16, C20 and C21 live in markdown and are enforced by the agent reading them;
`test/smoke.js` can only assert the text is present in each rendered adapter. This is the same class
of guarantee as L-3 and L-4, stated so rev 2 is not read as adding mechanical teeth it does not add.
The genuinely mechanical additions in rev 2 are exactly four: the `/fable/i` refusal in
`sanitizeModels()`, the `doctor` Fable checks, `src/roster.js`'s existing name/filename throw doing
the work of the C19 rename, and the smoke assertions themselves.

## L-14 — Framework expertise is text inside generic agents, not a specialist head
Per DECISIONS D-19 there is no `react-expert` / `angular-expert` / `nextjs-expert` / `aws-expert`.
Depth is bounded by what fits inside `frontend-expert`, `frontend-implementer` and `infra-expert`
bodies that must also stay useful for every other repo, and there is no per-framework model or tier
separation — a Next.js question and a plain-React question are answered by the same agent at the same
tier. Whether framework idiom would benefit from a dedicated head remains unmeasured; rev 2's choice
bounds the cost of being wrong to zero extra spawns rather than answering the question.

## L-15 — `dependency-auditor` now degrades on every run it cannot verify offline, and that costs a waiver
Per C16 / D-18 it may no longer return `PASS(CLEAN)` when the license/CVE source is unreachable: it
emits `degraded: true`, `blocking_class: ENVIRONMENT`, and the token `cannot-verify-offline`.
**Consequence the user must accept:** under A1 an unresolved `degraded:true` is a hard-BLOCK closable
only by an explicit, recorded, per-run human waiver — and `blocking_class: ENVIRONMENT` governs whose
fault it is, **not** whether it blocks. So in an offline or restricted environment, every run that
adds a dependency now requires one human waiver line in `DECISIONS.md`. That friction is the price of
not shipping a gate that returns clean because it looked at nothing. It is disclosed, not hidden, and
it is the single most likely rev-2 change to be experienced as a regression.

## L-16 — After a `reuse-auditor` contract change, test blindness is by instruction, not by construction
The A-round guarantee is structural: `test-author` runs *in parallel with* the implementers, so the
implementation does not exist when tests are authored. When C18's sanctioned freeze exception fires,
implementation already exists, and `test-author` re-authors the affected tests from the amended
contract while being *instructed* not to look at the code. That is a genuinely weaker guarantee than
the original and it applies to exactly the tests covering the artifact `reuse-auditor` objected to.
Recorded so the difference is never elided in a report.

## L-17 — A legacy repo's first run may raise several `FACT-BLOCK` interrupts
C4 raises a `FACT-BLOCK` per artifact category carrying two live convention clusters. In a
10-year-old codebase mid-migration that can be several on the first run. They are batched once per
tier (A3), and each answer is written durably into `CONVENTIONS.md` so it is never asked twice — but
the first run against a legacy repo is interactive in a way LazySitter is otherwise sold as not being.
This is the deliberate price of refusing to guess which of two live conventions is canonical.

## L-18 — `unverifiable` conventions are carried on trust, bounded only by an expiry
Per D-17(c), a convention with no passing shell command (the socket-invalidation-ordering class) is
kept as an `unverifiable` row with a named human owner and an expiry date. Nothing mechanically
prevents such a row from being stale-but-believed at any point before its expiry, and nothing verifies
the owner is still on the team. The alternative — deleting them — is worse, because it deletes exactly
the defect class B11 exists to catch. Accepted knowingly.

## L-19 — Multi-framework monorepos are refused, not handled
Per C20, two frameworks detected on independent evidence raises a `FACT-BLOCK` asking which owns the
change. LazySitter does not route a single run across two framework idioms, and a repo that genuinely
needs both in one change will be answered one framework at a time. `next` beating `react` is a fixed
precedence rule, not a detection — a repo that has `next` in `package.json` but does not use the app
router will still be scoped as Next.

## L-20 — `CONVENTIONS.md` is now an arbitrary-code execution surface on every preflight
D-17(b) moves assertion execution to `lazysitter-recon`, whose `Bash` is deliberately **not** bound by
the C5 probe allowlist — the whole point is to run `dotnet build` and `npm test`. So a tracked,
committed file now supplies unconstrained commands that execute on every run's preflight, on the
machine of whoever runs the pipeline next. This is strictly worse than the T2 surface L-4 describes,
because there the commands were allowlisted and here they are not. **The guard is procedural, and it
is the strongest one available without shipping a sandbox:** per D-20, `CONVENTIONS.md` inherits
`SECRETS-BASELINE.md`'s treatment — any diff touching it is flagged and never auto-approved, even
under `--auto`, so the change is human-reviewed before it can run. **Do not read that as mitigation.**
A reviewer who approves a plausible-looking `ASSERTION` line has approved code execution, and the file
is designed to accumulate such lines. Anyone installing LazySitter into a repo that accepts untrusted
pull requests should treat `.lazysitter/knowledge/CONVENTIONS.md` with the same care as a CI workflow
file, and should consider `CODEOWNERS` on it.

## Undisclosed items recorded after the intent audit (U-1..U-8)
- U-1 This change INTRODUCED a code-execution regression mid-run (a `git` subprocess run inside the
  untrusted target repo, exploitable via that repo's `core.fsmonitor`). Found by red-team, fixed,
  independently re-verified. Graduated into `core/PITFALL-LEDGER.seed.md`.
- U-2 W7/W8 remediations were verified only by their author (`independent: false`) before an
  independent re-clear was run. W9 has NOT yet been independently re-cleared.
- U-3 32 frozen `must` assertions in `test/criteria.js` remain red; see TRACEABILITY.md.
- U-4 Per-wave smoke verification was recorded for W0/W1 only; W2-W9 were verified but not logged
  per wave as PLAN.md required.
- U-5 Five user instructions arrived mid-run and are deferred, not dropped — see DEFERRED-SCOPE.md.
- U-6 `README.md` documented `--auto` as default after core was fixed. Corrected in W8.
- U-7 Stale agent-count and model-tier tables shipped to Cursor/Codex users. Corrected in W8.
- U-8 PRE-EXISTING and now fixed: `core/codex/run-agent.sh` sourced committed `models.env` and
  `.meta` as bash, giving any tracked-file editor arbitrary code execution on the Codex path. This
  existed at HEAD (`de2277c`) and in every prior release.
