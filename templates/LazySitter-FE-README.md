# LazySitter Frontend Team

A React/Next-only autonomous engineering team: **41 specialist agents**, **31 skills**, and a real structural index of your codebase.

## How to use it

```text
/lsife <what you want>
```

That is the whole workflow. The index was built during install and the team keeps it current on
every run — there is nothing to configure and nothing to run by hand.

Re-running the install command later just updates in place, preserving your config edits.

## What makes this team different from a general one

**The index is the oracle.** `grep "ConfirmDialog"` matches doc comments, Storybook titles and test fixtures, and misses `AreYouSureModal` — the same component under a different name. The index parses each file with comments, strings and regexes masked out, resolves path aliases and barrel re-exports, counts real JSX call sites, extracts full prop contracts, and clusters near-duplicates by **prop-contract similarity** rather than by name.

**It refuses work it cannot do well.** Angular, Vue, Svelte and Solid repos halt at Tier 0. A React specialist improvising Angular change-detection advice arrives with the same confidence as the real thing, and that is worse than no advice. Use the general team (`/lsi`) for those, and for anything backend.

**Five explorers in parallel, not one.** Components, hooks/utils, design system, state topology, and routes — each starting from the same index, so five explorers cost roughly what one used to and cover far more.

**Agents are supervised while they run.** Each declares an intent contract before starting; a watchdog on a distinct model compares behaviour against it and can REDIRECT, NARROW, ABORT or QUARANTINE a drifting agent — instead of discovering the drift after it spent its whole budget.

**Accessibility is a never-skip gate**, not a polish pass. So are the reuse audit, the security review, the red team and the intent audit.

## Optional: the same tools, by hand

The agents drive these for you. They are here only if you ever want to ask the codebase
something directly — you never need to run them.

```bash
lazysitter fe-index impact src/ui/Button.tsx     # blast radius before touching something shared
lazysitter fe-index props Button                 # declared vs actually-passed props
lazysitter fe-index dup                          # what you are already duplicating
lazysitter fe-index signals --severity high      # mechanical defects with path:line
```

`lazysitter fe-index --help` lists the rest. Add `--json` to any of them.

## Flags for `/lsife`

- `--dry-run` — stop after the plan.
- `--budget <tokens>` — token ceiling (default 400000).
- `--auto` — proceed through the merge gate autonomously. It does **not** waive a `degraded` verdict.
- `--no-supervisor` — disable live supervision. Recorded as a coverage gap in the final report.

**Kill switch:** create `.claude/lazysitter/KILL` to halt before the next wave.

## The waves

| wave | agents |
| --- | --- |
| 0 · preflight | recon (builds the index, holds the refusal authority) |
| 1 · intake | analyst · triage |
| 2 · explore | component · utils · design-system · state · route explorers (parallel) |
| 2b · synthesize | context-synthesizer |
| 3 · spec | spec-writer (UI state matrix is mandatory) |
| 4 · design | architect + react · rsc · state · styling · a11y · perf · api-contract · ux · security experts + devil's advocate |
| 5 · build | component · state · style implementers + blind test-author + dependency-auditor |
| 6 · verify | test-runner · code-reviewer · reuse-auditor · a11y-auditor · perf-auditor · visual-auditor · red-team · secrets-scanner |
| 7 · integrate | integration-checker · closing-loop-auditor |
| 8 · release | release · monitor · rollback · docs |
| cross-cutting | supervisor |

## Harnesses the team uses if you have them

The team measures where it can and reports `degraded` where it cannot — it never substitutes an argument for a missing measurement.

- **test** — vitest/jest + Testing Library
- **a11y-engine** — jest-axe, `@axe-core/react`, `@axe-core/playwright`
- **render/visual** — Storybook test-runner, Playwright screenshots, Chromatic
- **bundle-measure** — bundle analyzer, size-limit

A missing harness is surfaced once at preflight as a conscious choice, not discovered at the merge gate.

## Files this installs

```text
.claude/agents/lazysitter-fe-*.md          41 agents
.claude/skills/*/SKILL.md                  31 skills
.claude/commands/lsife.md                  the /lsife orchestrator
.claude/lazysitter/roster.fe.json          the roster (reference)
.claude/lazysitter/lazysitter.fe.config.json   your config (preserved on update)
.lazysitter/index/                         the generated index (git-ignored)
```

Runs are recorded under `.claude/lazysitter/runs/<slug>/`.

## If a session hits a limit

A run is 250-320k tokens across nine waves, so this will happen. It is handled.

```bash
lazysitter fe-session start --feature "<request>" --budget 400000   # at the start
lazysitter fe-session checkpoint --run <slug> --wave <id> --status complete   # after every wave
lazysitter fe-session resume --run <slug>                            # in the next session
```

`resume` verifies HEAD has not moved, the working tree matches, every artifact a completed wave
claims exists, and no frozen test was edited — then writes `RESUME-BRIEF.md`. That file is the
whole handoff, under 2k tokens: what the feature is, which waves are done, **exactly which agents
already finished inside the interrupted wave**, open FACT-BLOCKs, and pointers to every artifact.
Anything that diverged BLOCKS with the reason named, rather than continuing against a moved target.

Leases expire after 15 minutes without a heartbeat, so a crashed session never blocks the tree.

## Several sessions at once

```bash
lazysitter fe-session split --run <slug> --sessions 3
```

Splits the next wave **only if it is safe to split** — `2-annotate`, `5-build` and `6-verify` are;
`4-design` is not, because its experts all report to one architect. Each session claims a partition,
and in the build wave its own files (one writer per file, enforced).

Two features at once need a git worktree each — two runs in one tree are refused, because their
implementers write the same files.

`lazysitter fe-session status` lists every run, its progress, and which sessions are live or stale.
