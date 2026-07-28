# CONTEXT PACK — LazySitter A1–A17 Criticism Hardening

## Conventions (with path:line evidence)

**Agent definition structure (frontmatter + body)**
- Frontmatter: YAML `---` delimited, flat `key: value` pairs. Required fields: `name`, `description`, `tools`, `model`. `src/frontmatter.js:6-27` parses this invariantly (handles BOM, CRLF/LF).
- Body sections follow explicit order: Role, Inputs, Do, Never, Output (or Persist artifact), Machine verdict. All follow this pattern (observed in `core/agents/lazysitter-explorer.md:8-50`, `core/agents/lazysitter-test-runner.md:8-50`, `core/agents/lazysitter-red-team.md:8-50`).
- **Machine-readable verdict block**: every agent that reports to orchestrator ends with a fenced ` ```lsi-verdict ``` ` block. Schema is consistent across all agents: `verdict: PASS|BLOCK`, `blocking: true|false`, `degraded: true|false`, `evidence:`, `claims:` (tagged `[observed|reasoned][observable|internal]`), `concerns:` (tagged disposition). Schema enforced by orchestrator gate evaluation (`core/orchestrator.claude.md:50-60`, `core/orchestrator.codex.md:67-76`).
- **Special mode precedent**: `lazysitter-test-runner.md:20-22` defines `teeth-check` mode — a distinct execution path within same agent; same for red-team's upcoming `plan-attack` mode (A2 copies this structure).

**Adapter file semantics** (`src/context.js:26-58`)
- `write(rel, content)`: managed file, overwritten on `lazysitter update`, removed on uninstall. Stored in manifest.managed with SHA256 hash for integrity (`line 38`).
- `writePreserve(rel, content)`: user-editable file, written ONLY on first install, never clobbered on update. Survives `update` and (unless `--purge`) survives `uninstall`. Stored in manifest.preserve (`line 50`).
- Example uses: Claude/Codex/Cursor agents are `write()` (managed, overwritten). PITFALL-LEDGER files are `writePreserve()` (line 18-22 of `src/install-claude.js`, line 36-39 of `src/install-codex.js`, line 40-44 of `src/install-cursor.js`). User config (models.env, models.json) is `writePreserve()`.

**Comment density in src/**
- Minimal inline comments; mostly docstring comments at function/method level. Example: `src/install-claude.js:7-8` is a function docstring, not multiple inline comments. `src/util.js` follows the same pattern.

**Quoting & module style**
- Single quotes for string literals (`'use strict';` on all src files).
- CommonJS (`require`, `module.exports`); zero dependencies.
- Windows path normalization happens in context.js line 38: `.replace(/\\/g, '/')` for manifest paths.

---

## The single-source contract (core → adapters)

**Trace of a core agent change → three adapters:**

A change to `core/agents/lazysitter-red-team.md` flows as follows:

1. **Claude** (`src/install-claude.js:11-13`): agent file copied VERBATIM to `.claude/agents/lazysitter-red-team.md`. Frontmatter and body unchanged. Function: `installClaude()` iterates `data.agents`, calls `ctx.copy()` which writes the raw file as-is.

2. **Codex** (`src/install-codex.js:24-26`): frontmatter stripped, body written separately. Function: `roleFile()` (lines 52-55) builds a header comment and concatenates `agent.body.trimStart()` with no frontmatter. Agent body is extracted once by `loadRoster()` (`src/roster.js:14-16`) via `fm.parse(raw)` and reused for all three adapters.

3. **Cursor** (`src/install-cursor.js:24-26`): frontmatter PARSED and RE-BAKED with Cursor-specific fields. Function: `cursorAgentFile()` (lines 54-72) reads agent metadata (tier, distinctModel, codexSandbox) and constructs new frontmatter with `model`, `readonly` fields (not `tools`). Body unchanged. Model is resolved by `resolveModel()` (lines 49-52) from `models.json`.

**Key insight**: agent BODIES are copied/preserved verbatim across all three. Only frontmatter handling differs:
- Claude: verbatim (body + original frontmatter)
- Codex: frontmatter → comment header only
- Cursor: frontmatter re-baked with Cursor-specific keys

**Roster loading** (`src/roster.js:9-39`):
- Single source: `core/roster.json` + `core/agents/*.md`.
- `loadRoster()` enumerates agents from disk (`fs.readdirSync(agentDir, '.md')`), parses each via frontmatter, merges with roster.json config.
- Returns normalized agent objects with fields: `name, file, raw, body, claudeModel, claudeTools, tier, codexSandbox, codexApproval, distinctModel`.
- This normalized form is what adapters consume; any new field must be plumbed through here.

---

## Adapter drift inventory

**`core/orchestrator.claude.md` vs `core/orchestrator.codex.md` — material differences:**

1. **`--auto` default** (REAL DRIFT BUG):
   - Claude (line 29): `--auto: proceed through the merge gate and post-merge rollback autonomously (default).`
   - Codex (line 45): `--auto: proceed through the merge gate and post-merge rollback autonomously. Without it, HOLD at the merge gate and summarize for the user.`
   - Claude **states it as default**; Codex does NOT. Both say same behavior ("without it HOLD"), but Claude's language implies it's the DEFAULT behavior. **This is a discrepancy that A14 must address:** which one is correct? Decision maker: verify the orchestrator's actual code logic for both (not in scope for this pack, but impacts implementation).

2. **Git mutation approval** (procedural difference, not semantic):
   - Claude (line 27): references `autoApproveGit` indirectly via the gate's autonomy rules.
   - Codex (line 43): explicitly documents `LAZYSITTER_AUTO_GIT=1` environment variable and `autoApproveGit` config option.
   - Codex is more explicit; both describe the same mechanism, Codex just names it more clearly.

3. **Playbook structure**:
   - Claude: uses `Task` tool + `AskUserQuestion` (Claude Code native).
   - Codex: uses `run-agent.sh/run-agent.ps1` helper spawning isolated processes.
   - Tier numbering and pipeline stages: IDENTICAL.

**`core/cursor/LazySitter.rule.mdc` drift risk:**
- File `core/cursor/LazySitter.rule.mdc:1-64` documents LazySitter playbook in Cursor-native language.
- Lines 36-46 specify model tiers (high, high_alt, mid, low) with concrete model examples.
- These are **example values, not live config** — actual models live in `.cursor/lazysitter/models.json` (user-editable).
- **Drift risk**: if the Cursor rule's model examples fall out of sync with the actual recommendation, users could be confused. Mitigation: rule should reference the models.json, not hardcode examples.

---

## Relevant files (why each matters for A1–A17)

| Path | Why it matters |
|------|---|
| `core/agents/lazysitter-*.md` (26 files) | A1: capability gating will add recon agent or modify existing ones; A7/A12: verdict schema changes; A8: explorer gets new mandates |
| `core/orchestrator.claude.md` | A1/A14: capability gates added to Tier 0; A2: plan-attack spawning added to Tier 4; A9: triage lanes documented |
| `core/orchestrator.codex.md` | Same as Claude + must be kept in sync (A14 fixes --auto drift) |
| `core/roster.json` | A12: neverSkip list changes (devils-advocate replaced by plan-attack); A9: routing config may expand |
| `core/PITFALL-LEDGER.seed.md` | A5: persisted knowledge; PROJECT-PITFALLS.md creation referenced |
| `src/install-claude.js` | A5: new .lazysitter/knowledge/ directory writes; A1: CAPABILITIES.md seeding |
| `src/install-codex.js` | Same as Claude adapter |
| `src/install-cursor.js` | Same as Claude adapter |
| `src/roster.js` | A12: neverSkip enforcement; any new agent type detection logic for A1 |
| `test/smoke.js` | A1: new agent count if recon spawns; fixture for all file assertions |

---

## Existing patterns to imitate

**Teeth-check mode precedent** (`core/agents/lazysitter-test-runner.md:20-22`):
```
- **Teeth-check mode.** When the orchestrator asks you to run in `teeth-check` mode (the frozen suite 
  against the PRE-implementation baseline commit), report which `must` tests FAIL there.
```
A2 (`plan-attack` mode for red-team) must copy this exact structure: same agent spawned twice, distinct `mode` parameter, different mandate but same tools/model/sandbox.

**Write vs writePreserve precedent** (`src/install-claude.js:12, 19-22`):
- Agents copied via `ctx.copy()` → `write()` (managed, overwritten).
- PITFALL-LEDGER seeded via `ctx.writePreserve()` (preserved across update).
- A5 commits knowledge to `.lazysitter/knowledge/`: follow this precedent — use `writePreserve()` for committed knowledge, `write()` for framework-managed files.

**neverSkip enforcement precedent** (`core/roster.json:16-27`, `core/orchestrator.claude.md:21`):
```
"neverSkip": [
  "lazysitter-spec-writer",
  "lazysitter-test-author",
  ...
]
```
- Listed in roster.json, enforced in orchestrator prose (line 21: "Never skip").
- A12 modifies this: devils-advocate leaves the list; a new never-skip agent (or mode) enters.
- Enforcement is **prose-based** (relying on orchestrator logic), not mechanical in code.

---

## Test layout & tooling (VERIFIED mechanics)

**How tests are run:**
- Entry point: `test/smoke.js` (no other test files; this is the ONLY verification).
- Execution: `npm test` → `node test/smoke.js` (hardcoded in package.json).
- Each test is a Node `execFileSync()` call spawning `bin/lazysitter.js` with args in a temp directory.
- No external dependencies, no network, hermetic (env vars `NO_COLOR=1`, `LAZYSITTER_NO_UPDATE_CHECK=1`).
- Temp dir cleaned up after tests.

**45 total assertions** (verified by line-by-line count):
- Lines 35-76: init command (26 Cursor agents, 26 Claude agents, 20 adapter-specific checks, file existence checks).
- Lines 91-109: update command (5 preservation checks: config, ledgers, models across adapters, idempotency).
- Lines 111-113: doctor command (2 checks: integrity reporting).
- Lines 115-117: list command (2 checks: roster + distinct-model flag).
- Lines 119-123: AGENTS.md idempotency (1 check).
- Lines 125-133: uninstall command (9 checks: file removal, block stripping, AGENTS.md handling).

**Agent count assertions** (critical for any roster change):
- Line 45: `ok(cursorAgents.length === 26, ...)` — cursor agents enumerated from `.cursor/agents/*.md`.
- Line 76: `ok(claudeAgents.length === 26, ...)` — claude agents enumerated from `.claude/agents/*.md`.
- Both count filenames ending `.md`; if A1 adds a new agent, both must be 27.

**File-path assertions** (hardcoded paths expected to exist):
- `.cursor/rules/lazysitter.mdc` (line 37).
- `.cursor/commands/lsi.md` (line 38).
- `.cursor/agents/lazysitter-architect.md` (line 39).
- `.cursor/lazysitter/models.json` (line 40).
- `.cursor/lazysitter/README.md` (line 41).
- `.cursor/lazysitter/PITFALL-LEDGER.md` (line 42).
- Similar enumeration for `.claude/` and `.codex/` paths.

**Preservation checks** (lines 91-109):
- Line 92: write to `.codex/skills/lazysitter/models.env`, re-run update.
- Line 100: verify the file is unchanged (not clobbered).
- Lines 93-98: same for PITFALL-LEDGER.md (Claude, Cursor) and models.json (Cursor).
- Lines 108-109: verify Cursor agents are RE-BAKED from edited models.json (frontmatter updated, body preserved).

**Verdict block mechanics** (⚠ unverified but inferred from agent definitions):
- Every agent that reports to the orchestrator ends output with a fenced ` ```lsi-verdict ``` ` block.
- Orchestrator parses this block (not prose) to evaluate the gate (`core/orchestrator.claude.md:50, 138-145`).
- Schema: `verdict`, `blocking`, `degraded`, `evidence`, `claims`, `concerns` (all observed in agent definitions).
- A7 will add `verified_by` and `independent: true|false` to this schema.

---

## Data-shape facts (worst-case real values for adversarial fixtures)

**Agent names:**
- Longest: `lazysitter-closing-loop-auditor` (31 characters including hyphens).
- All 26 follow pattern `lazysitter-<hyphenated-name>`.
- All carry valid frontmatter with `name:`, `description:`, `tools:`, `model:` fields.

**Verdict block presence:**
- All observed agent definitions have an `lsi-verdict` block in their template output. None are optional in the observed agents (red-team, test-runner, explorer, architect, code-reviewer).
- ⚠ unverified: whether ALL 26 agents carry one, but strong pattern suggests yes.

**Agent with largest tools list:**
- `lazysitter-explorer.md:4` has `tools: Read, Grep, Glob, Write, mcp__atlassian__getJiraIssue, mcp__atlassian__searchJiraIssuesUsingJql` — 6 tools + Atlassian MCP tools.
- `lazysitter-architect.md:4` has `tools: Read, Grep, Glob, Write` — 4 tools.
- Most agents have 1–4 tools.

**Windows path forms observed in repo:**
- Backslash path separators: `src/context.js:38` shows `.replace(/\\/g, '/')` to normalize to forward slashes in manifest.
- UNC paths: ⚠ unverified (not seen in code, but context normalizes drive letters and slashes).
- `.replace(/\\/g, '/')` at `src/context.js:38, 50, 78` indicates Windows paths are actively converted.

**Encoding and EOL:**
- `src/frontmatter.js:7`: BOM stripping `replace(/^﻿/, '')` (UTF-8 BOM `\xEF\xBB\xBF`).
- `src/frontmatter.js:8`: regex `/\r?\n/` handles CRLF (Windows) and LF (Unix).
- `src/frontmatter.js:26`: body extraction preserves original EOL form.
- Core agent files are UTF-8, no BOM observed (not stripped on read-back), mixed CRLF/LF likely in repo.

**Collection sizes:**
- Agent roster: fixed at 26 (A1 may add 1 for recon, pushing to 27).
- neverSkip list: 10 agents (line 16-27 of `core/roster.json`).
- Expert panel optionally spawned: 4 database/infra/frontend/ux (+ always security-expert).

---

## Known pitfalls (feature triggers: core framework, adapters, CI/deploy)

From `core/PITFALL-LEDGER.seed.md` (read at Tier 0):

```
[proc][artifact-persist]   producer output re-transcribed by hand → lost / mislabeled 
  → producers self-persist to <run-dir>; orchestrator promotes | 2 | graduated
  
[proc][context-bloat]      full essays carried in orchestrator context → lost-in-the-middle 
  → externalize; carry pointer + summary + machine verdict | 2 | graduated
  
[verify][observable-claim] observable concern dismissed by reasoning → real bug shipped 
  → discharge only by observation; raiser ≠ dismisser | 1 | graduated
  
[verify][toothless-test]   teeth check done by eye / skippable → toothless AC passes silently 
  → mechanical teeth-check mode; ≥1 must-test must FAIL | 1 | graduated
  
[env][push-not-deploy]     release-agent assumed git push = deploy 
  → read deploy topology at Tier 0; release runs recorded deploy step | 1 | graduated
```

**Relevance to A1–A17:**
- A1 (capability gating) directly addresses `[verify][toothless-test]` and `[env][push-not-deploy]`.
- A2 (plan-attack mode) builds on `[verify][observable-claim]` (execute vs argue).
- A5 (knowledge commits) addresses `[proc][artifact-persist]` and `[proc][context-bloat]`.
- All are already `graduated`, meaning guards exist; A1–A17 reinforce/extend them.

---

## Known limitations (user-facing constraints discovered)

1. **Recon is cached across runs** (A1): CAPABILITIES.md refreshes on drift, but "drift detection" is heuristic (file timestamps, SHA checks). A run that changes undetected toolchain state (e.g., `npm install` adds a test runner) will not auto-refresh unless explicitly re-run.

2. **Network access forbidden for agents** (from CLAUDE.md, A11 exception): agents run sandboxed read-only (except implementers). A10 identifies ecosystem staleness (deprecated deps) but cannot check if `aws-sdk@2` is in maintenance mode without WebFetch. Workaround: human enters facts in ASSUMPTIONS.md as UNVERIFIED.

3. **Adapter parity by design, not enforcement**: three orchestrators (Claude, Codex, Cursor) are hand-maintained. A14 fixes the `--auto` default drift, but future drifts require manual sync. No automated test checks that Claude and Codex orchestrators are semantically identical.

4. **Project-PITFALLS.md creation is voluntary**: framework seeds PITFALL-LEDGER.md (process faults), but repo must create PROJECT-PITFALLS.md (tech faults). A5 names this file as committed knowledge; until it exists, no per-project pitfalls flow to the pack. Workaround: explorer must create empty `.lazysitter/PROJECT-PITFALLS.md` on onboarding if absent.

---

## Adjacent risk (code that could break)

**`src/roster.js:9-39` (`loadRoster()` enumerates agents from disk):**
- If a new agent file is added to `core/agents/`, it is automatically discovered and installed to all three adapters.
- Test assertion `test/smoke.js:45` and `:76` hardcode agent count as 26. Adding an agent → both must become 27.
- If an agent file is **deleted**, it silently disappears; uninstall correctly removes it (manifest tracks it), but a developer deleting an agent must also update the test count assertion or tests will FAIL.
- **Risk**: roster.js has no validation that agent names match `lazysitter-*` pattern or that required frontmatter fields exist. Adding a malformed agent file will propagate to all adapters.

**`src/doctor.js:26-39` (integrity hashing of managed files):**
- Each managed file's SHA256 is stored in manifest.json at install time.
- `doctor` command re-hashes and reports drifts. If a managed file is edited (accidentally or intentionally), it appears as "modified" in doctor output.
- `install.js` overwrites managed files on update (not a problem), but a user manually editing a managed file (e.g., `.claude/agents/lazysitter-architect.md`) will be flagged as drift and overwritten on next `lazysitter update`.
- **Risk**: no "whitelisted diffs" mechanism; any change to a managed file is treated as corruption.

**`src/uninstall.js:23-29` (manifest.managed enumeration):**
- Uninstall removes files listed in manifest.managed.
- If `install.js` is changed to write a file differently (e.g., different path or managed vs preserved), the old manifest may still point to the old location. A file left behind on uninstall is invisible to the user.
- **Risk**: if A5 introduces new knowledge files and changes which ones are preserved vs managed, old installs (with old manifests) could orphan files.

**`test/smoke.js` (file path assertions):**
- Lines 37-42, 63-73 assert specific files exist after init. Each path is hardcoded.
- If a5 adds `.lazysitter/knowledge/CAPABILITIES.md`, the test must be updated to assert its existence, or the assertion suite becomes unreliable.
- **Risk**: new files added by A1–A17 must have corresponding test assertions, or they silently fail to be created/verified.

**Orchestrator drift between adapters:**
- `core/orchestrator.claude.md` and `core/orchestrator.codex.md` are hand-maintained copies of the same playbook.
- A14 fixes the `--auto` default difference; if future changes modify one but not the other, the drift is silent (no test catches it).
- **Risk**: a user running the same feature through Claude and Codex adapters could experience different behavior if the playbooks diverge.

---

## Summary

This is a framework-internal refactoring that:
- Touches **26 agent definitions** (bodies preserved, frontmatter consistent)
- Modifies **2 orchestrator playbooks** (must stay in sync)
- Adds/modifies **3 adapter installers** (frontmatter handling, new file writes)
- Updates **test suite** (agent count, file assertions, preservation checks)
- Introduces **committed knowledge** paths (A5: `.lazysitter/knowledge/`)
- Adds **verdict schema fields** (A7: verified_by, independent)
- Modifies **roster metadata** (A12: neverSkip list swap)

The single biggest risk is **adapter drift**: keeping Claude, Codex, and Cursor orchestrators semantically identical while their implementation details differ significantly.
