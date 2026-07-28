# MANIFEST — verified facts only

No interpretations. Every line below was observed by running a command or reading a file.

## Run identity
- repo root: `d:\lazysitter` (from `git rev-parse`)
- baseline commit: `de2277c2226f18f24434549cb83832354446f522`
- branch: `main` (default; `origin/HEAD -> origin/main`)
- run dir: `.claude/lazysitter/runs/criticism-hardening/`
- run start: `2026-07-28T12:49:46+06:00`
- working tree at start: clean except `.gitignore` (user-modified, added `/critisisms/`) and untracked `docs/CRITICISM-RESPONSE.md`

## Capability probe (A1 shape, dogfooded on this repo)
| capability | state | evidence |
|---|---|---|
| test runner | **available** | `npm test` → `node test/smoke.js`; 45 `ok(...)` assertions; executed at baseline → `PASS — 0 failure(s)` |
| test discovery non-inert | **verified** | assertions actually execute and can fail; this is NOT the `exit 0 / 0 tests` failure mode |
| lint | **absent** | no `.eslintrc*`, no `eslint.config.*`, no prettier config |
| typecheck | **absent** | plain CommonJS JavaScript; no TypeScript, no `tsconfig.json` |
| CI | **absent** | no `.github/workflows` |
| render/behavioral harness | **absent** | no declared harness; feature has no observable render surface |
| runtime deps | **zero** | `package.json` has no `dependencies` |
| node | v20.20.1 | `node --version` |

## Deploy topology (A14 precondition)
- Consumers install via `npx -y "github:soumit-kaz/lazysitter#semver:*"`.
- No `publishConfig`, no npm publish step, no `repository` field in `package.json`.
- **`git push` alone does NOT ship a release.** `#semver:*` resolves against git **tags**; a release requires push + a semver tag.
- Therefore `push ≠ deploy` holds for this repo. Recorded so Tier 8 cannot assume a push shipped.

## Verification substrate for this run
- Sole gate: `node test/smoke.js` (exit code + `PASS — N failure(s)` line).
- Hardcoded counts in that file that any roster change invalidates: two `=== 26` agent-count assertions (Cursor and Claude).
- Recorded gap (conscious, per Tier 0c — proceeding with a recorded gap rather than installing tooling mid-feature): **no lint, no typecheck, no CI.** Static-quality regressions in `src/*.js` are not mechanically detectable in this repo. This is disclosed in LIMITATIONS.md.

## Single-source contract (verified by explorer)
- `core/agents/*.md` → Claude: copied **verbatim** (`src/install-claude.js`, frontmatter preserved).
- `core/agents/*.md` → Codex: frontmatter **stripped**, `.meta` sidecar generated (`src/install-codex.js`).
- `core/agents/*.md` → Cursor: frontmatter **re-baked** from `core/cursor/models.json` (`src/install-cursor.js`).
- `src/roster.js:loadRoster` enumerates `core/agents/*.md` **from disk**; an agent file is discovered by existing, and `core/roster.json` supplies its tier/sandbox/approval.
- Agent **bodies are never transformed** by any adapter. A body edit in `core/` reaches all three.

## Adapter drift observed at baseline
- `core/orchestrator.claude.md:29` states `--auto` is **(default)**; `core/orchestrator.codex.md` does not. Materially different autonomy defaults between adapters. Independently found by the orchestrator preflight and the explorer.
- `core/cursor/LazySitter.rule.mdc` restates playbook guarantees and the model-tier table; a third hand-maintained copy that can drift.

## Frozen artifacts
- (populated at Tier 5 freeze)

## Frozen artifacts (Tier 5 freeze)
- `test/criteria.js` — sha256 `77a80a236067a21353882a997b7633fe1b7c51bdb21a40a9b56b8ca35663304c` (1039 lines)
- Frozen at: W0+W1 complete, W2–W6 not started.
- **Teeth check result: PASS.** Running the frozen suite at this baseline yields **397 failures**.
  The suite fails hard before the features exist, so it is not toothless. Recorded mechanically,
  not by eye.
- Only legal post-freeze change: a mechanics-only harness repair with a logged exception here.

## Wave verification log
- W0 (installer safety net) — `node test/smoke.js` → PASS 0 failures
- W1 (roster 26→27) — `node test/smoke.js` → PASS 0 failures; `list` shows 27 incl. lazysitter-recon
