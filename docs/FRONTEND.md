# The LazySitter Frontend Team

A **React/Next-only** engineering team: 41 specialist agents, 31 skills, and a real structural index of your components, hooks, utils and props.

```bash
npx github:soumit-kaz/lazysitter init . --frontend             # frontend team only
npx github:soumit-kaz/lazysitter init . --frontend --general   # both teams
```

That is the entire setup. The installer builds the index for you and git-ignores everything it
generates. Then, in Claude Code:

```text
/lsife Add a CSV export button to the analytics dashboard
```

Re-running the install command updates an existing install in place, preserving your config edits.
**Nothing below this line is something you have to run** — the agents drive the tooling themselves.

## Why a separate team

The general 28-agent team handles any stack. This one handles exactly one, and that constraint is what buys the depth:

- **It refuses non-React/Next repos.** Angular, Vue, Svelte and Solid halt at Tier 0. A React specialist improvising Angular change-detection advice arrives with the same confidence as the real thing — refusing is the more useful answer. Use `/lsi` for those, and for any backend work.
- **Every agent is a frontend specialist.** No generalist reviews UI code here. The design panel alone has separate experts for React correctness, RSC boundaries, state, styling, accessibility, performance, component API design, UX and client security.
- **Accessibility is a never-skip gate,** at design time and again on the built diff.

## The index: why not grep

`grep -r "ConfirmDialog"` matches a doc comment, a Storybook title, a test fixture and a changelog entry — and misses `AreYouSureModal`, which is the same component under a different name.

`lazysitter fe-index` builds a structural map instead. It:

- parses every file with **comments, strings, template literals and regex literals masked out**, so a match is always real code;
- resolves **`tsconfig`/`jsconfig` path aliases** and **Vite/webpack aliases**;
- follows **barrel re-export chains**, so `import { Button } from '@/ui'` still counts against the real file;
- extracts **full prop contracts** from TypeScript interfaces, type aliases (following `extends` and `&`), destructuring patterns and `defaultProps`;
- counts **real JSX call sites** and records which props are passed at each;
- clusters **near-duplicate components by prop-contract similarity** — deliberately weighting names lowest, because the duplicates worth finding are the ones nobody named alike;
- clusters **hooks and utils by alpha-normalised token shingles**, so two functions differing only in variable names are detected as clones;
- runs **36 mechanical rules** (hook order, dependency arrays, RSC boundary, hydration, a11y, XSS sinks, bundle weight, leaks, layout shift) that each report a `path:line` — `lazysitter fe-index rules` lists them.

It is incremental: a rebuild after a 12-file change re-parses 12 files.

### Commands

```bash
lazysitter fe-index build [--force] [--root src,packages/ui]
lazysitter fe-index precedent "confirm modal" --kind component
lazysitter fe-index query --like "date picker" --props onChange --min-usage 3
lazysitter fe-index props Button          # declared vs actually-passed props
lazysitter fe-index who Button            # every call site + props passed there
lazysitter fe-index impact src/ui/Button.tsx    # blast radius + routes affected
lazysitter fe-index dup --kind component  # near-duplicate clusters
lazysitter fe-index drill                 # prop-drilling chains, depth 3+
lazysitter fe-index dead-props            # prop APIs that drifted from usage
lazysitter fe-index orphans               # exported and never used
lazysitter fe-index signals --severity high --rule A11Y
lazysitter fe-index rules                 # the full rule catalogue
lazysitter fe-index stack                 # detected framework and tooling
```

Add `--json` to any of them.

**Read the output honestly.** `usageCount: 0` means no JSX call site *inside this repo* — a package export or a dynamic import shows as zero. Call sites using `{...spread}` hide props, so those counts are a lower bound. `meta.json` records the index's own skipped paths and parse errors; check them before claiming exhaustive coverage.

## Cost engineering

A 41-agent pipeline is only useful if you can afford to run it. Measured on a MEDIUM feature, the naive shape costs about **790k tokens** — nearly double the 400k default budget. The shipped shape costs about **316k**, a **61% reduction**, with **zero agents, verifiers or adversaries removed**.

The saving comes from two rules, neither of which trades quality:

**1. Never pay an LLM to derive what a program can compute.**

`fe-index brief` computes the entire factual context pack — ranked precedent sets, the convention bank (which date library, which casing, which error shape, counted across every file), state topology, route and boundary coverage, design tokens, blast radii, existing findings — deterministically, for zero tokens. It also writes `90-open-questions.md`, listing exactly what a program *cannot* decide. That separation is the quality guarantee: agents still make every judgement call, they just stop re-deriving the facts underneath them. A deterministic derivation also cannot miscount a call site, forget a file, or hallucinate a precedent.

`fe-index gate` does the same for verification: it opens every precedent citation at its stated `path:line`, checks the ownership map, measures footprint and comment density, scans added lines for credentials **including the full contents of untracked new files** (which `git diff` cannot see — the exact hole that would let a brand-new file ship a hardcoded key), and diffs the rule findings. Verifiers adjudicate those findings instead of deriving them.

**2. Route context; never broadcast it.**

The brief is sharded, and `INDEX.md` carries a per-role routing table. The styling expert reads the design-token shard; the state expert reads the state shard. Previously all eleven experts received the whole pack — twice, because round 2 re-spawned the full panel. Now round 2 re-spawns only the experts named in an open item; the rest of round 1 stands, because an expert with no open item has nothing further to add.

| wave | before | after | why |
| ---- | ------ | ----- | --- |
| explore | 104k | 18k | the brief is precomputed; agents annotate instead of crawling |
| synthesize | 27k | 3k | the brief is already merged; only annotations need reconciling |
| design r1 | 161k | 61k | routed shards instead of the whole pack |
| design r2 | 161k | 19k | only experts with open items are re-spawned |
| verify | 112k | 90k | the mechanical gate runs first, for zero tokens |

**What is explicitly NOT how the savings were found:** no verifier was removed, no adversary was dropped, the never-skip list is unchanged, the teeth check still runs, and accessibility is still its own gate at both design and verification time. Those would trade quality for tokens. Everything above trades *waste* for tokens, which is a different thing — and where a real trade-off appears, the pipeline escalates the budget to you rather than quietly doing less.

Run `fe-index cost --feature "<request>" --budget 400000` before a run. It forecasts per wave from measured prompt sizes and your feature's actual brief, and the orchestrator raises it with you at Tier 0 if it does not fit — not mid-wave with the work half-done.

## Maximum parallelism

Each wave is one parallel batch:

| wave | agents | parallel |
| --- | --- | --- |
| 0 · preflight | recon | 1 |
| 1 · intake | analyst · triage | 2 |
| 2 · explore | component · utils · design-system · state · route explorers | **5** |
| 2b · synthesize | context-synthesizer | 1 |
| 3 · spec | spec-writer | 1 |
| 4 · design | architect + 9 experts + devil's advocate | **11** |
| 5 · build | 3 implementers + blind test-author + dependency-auditor | **5** |
| 6 · verify | test-runner · code-reviewer · reuse-auditor · a11y-auditor · perf-auditor · visual-auditor · red-team · secrets-scanner | **8** |
| 7 · integrate | integration-checker · closing-loop-auditor | 2 |
| 8 · release | release · monitor · rollback · docs | up to 4 |

Three implementers write concurrently because the architect's plan carries a **file-ownership map**: every file assigned to exactly one owner. A file with two owners is a plan defect the merge gate blocks on, not a merge conflict to resolve later.

Five explorers cost roughly what one used to, because all five start from the same index instead of each crawling the tree.

## Supervising a running agent

An agent that misreads its brief burns its whole budget before anyone notices. This team watches agents *while they run*, through three mechanisms of deliberately different strength:

1. **The intent contract (structural).** Every agent declares, before doing any work, which files it will touch, which index rows it will cite, what it is answering, and what is out of scope. An agent that touches a file absent from its own contract has drifted by its own declaration.
2. **The intervention inbox (cooperative).** Agents re-read `<run-dir>/supervision/INBOX-<agent>.md` at declared checkpoints. A `REDIRECT`, `NARROW` or `ABORT` there overrides their direction. This is a prose mandate an agent honours because it was told to — it handles the common case (a confused agent, not a hostile one) cheaply and immediately, and it cannot stop an agent that ignores it.
3. **Quarantine (structural).** Output that contradicts its own contract is not promoted, not passed downstream, not written to the substrate. This needs no cooperation from the agent — you simply refuse to use it.

`lazysitter-fe-supervisor` runs on a distinct model from the build lineage and reports which enforcement level was actually available each run. Disable it with `--no-supervisor`, and the final report records that as a named coverage gap.

## Loops with honest terminators

Every loop appends a record to `<run-dir>/rounds.jsonl` and is evaluated by reading it back, never by recalling a round count.

| terminator | what it claims |
| --- | --- |
| **`index-exhaustive`** | every candidate the index holds for that category was visited — a real completeness claim, available because the index enumerates components, hooks, utils, props and call sites |
| **`converged-dry` (K=2)** | two consecutive rounds found nothing new. **Not** proof of exhaustion — reported as a terminator, never as coverage |
| **`signature-repeat`** | the same normalized failure hash recurred across two rounds; terminates immediately rather than burning the retry cap |
| **`budget-met`** | a measured loop (a11y, perf, visual) reached its criterion by measurement, not by judgement |
| **`cap` / `budget` / `fact-block`** | legitimate, weaker, always disclosed |

## Sessions: surviving a limit, and running several at once

A run is 250-320k tokens across nine waves, so hitting a context or usage limit mid-run is normal. `lazysitter fe-session` makes the run state durable and resumable, and lets several sessions work on one run without corrupting each other.

### One session stops, the next continues

```bash
lazysitter fe-session start --feature "<request>" --budget 400000
# ...after every wave, and as each agent in a parallel batch returns:
lazysitter fe-session checkpoint --run <slug> --wave 5-build --status in_progress \
  --agent-complete fe-component-implementer --spent 180000
# ...in the new session:
lazysitter fe-session resume --run <slug>
```

`resume` refuses to continue blind. It verifies the checkpoint schema, that you are in the worktree that owns the run, that **HEAD has not moved**, that the working-tree digest matches, that every artifact a completed wave claims **actually exists on disk**, that every frozen test still hashes to its recorded value, and that no live session holds the lease.

- Clear → `SAFE TO CONTINUE`, the lease transfers, and `RESUME-BRIEF.md` is written.
- Diverged → `BLOCKED`, naming the specific divergence. A moved HEAD needs `--reconcile` (recorded as degraded). A live lease needs `--takeover` (explicit and logged).

`RESUME-BRIEF.md` is the whole handoff — under 2k tokens: the verbatim feature, per-wave state, **exactly which agents already finished inside an interrupted wave**, open FACT-BLOCKs, recorded limitations, budget spent, and pointers to every artifact. The new session reads that instead of reconstructing 300k of dead context.

An interrupted wave **re-runs**, minus its finished agents. A partially-finished wave is never treated as complete.

### Several sessions at once

```bash
lazysitter fe-session split --run <slug> --sessions 3
```

Only three waves may be split, and the tool refuses the rest:

| wave | splittable | why |
| ---- | ---------- | --- |
| `2-annotate` | yes | annotators write separate artifacts |
| `5-build` | yes | the plan's file-ownership map already guarantees disjoint writes |
| `6-verify` | yes | verifiers are independent by construction |
| `4-design` | **no** | the experts are independent but all report to **one** architect — splitting the wave splits the mediator |
| everything else | **no** | single-agent or join steps; running one twice produces two conflicting results |

Each session claims its own partition, and in `5-build` its own files:

```bash
lazysitter fe-session claim --run <slug> --partition 5-build#1 --files src/ui/Table.tsx,src/ui/Row.tsx
```

A file already claimed elsewhere is refused **with the owner named**. One writer per file — a file two sessions want is a plan defect, not a merge conflict for later.

### Two features at once

Two runs in the same working tree are refused: their implementers write the same files. Use a worktree each — `git worktree add ../feature-b -b feature-b` — and each gets its own run directory, lease and index. `fe-session status` lists every run, its progress, its next wave, and which sessions are live or stale.

### Why it does not hang or corrupt

- **Leases expire** after 15 minutes without a heartbeat. A crashed session never blocks the tree permanently; the next one takes the expired lease and the takeover is recorded. Checkpointing refreshes the heartbeat, so a working session never loses its lease.
- **A live lease is never silently stolen** — `--takeover` is explicit, logged, and forces a full integrity re-check.
- **Writes are atomic**: serialize → temp file → fsync → parse-verify → rename. An interruption *during* a checkpoint cannot corrupt it.
- **Lease updates are compare-and-swap** on a version counter, so two sessions racing for one partition cannot both win.
- **Every session event** — start, resume, checkpoint, takeover, end — is appended to `session-log.jsonl`.

Run artifacts (`.claude/lazysitter/runs/`) are git-ignored: they are per-run working state, not source.

## The four harness slots

The team measures where it can and reports `degraded` where it cannot — it never substitutes an argument for a missing measurement.

| slot | examples | arbitrates |
| --- | --- | --- |
| **test** | vitest/jest + Testing Library | behaviour |
| **a11y-engine** | jest-axe, `@axe-core/react`, `@axe-core/playwright` | every accessibility criterion |
| **render/visual** | Storybook test-runner, Playwright, Chromatic | every `observable` visual criterion |
| **bundle-measure** | bundle analyzer, size-limit | every bundle-budget criterion |

A missing harness is surfaced once at preflight as a conscious choice, never discovered at the merge gate. LazySitter does not ship a project's harness; it only invokes the slot.

## The skills

Agents load these instead of carrying the knowledge inline, so the depth lives in one place:

`fe-index-query` · `prop-analyzer` · `component-precedent` · `utils-precedent` · `component-api-design` · `hook-rules-audit` · `render-performance` · `state-topology` · `data-fetching-cache` · `rsc-boundary` · `hydration-safety` · `a11y-audit` · `focus-management` · `keyboard-interaction` · `forms-validation` · `ui-state-matrix` · `design-tokens` · `responsive-layout` · `bundle-budget` · `core-web-vitals` · `virtualization` · `image-media` · `i18n-rtl` · `client-security` · `error-boundaries` · `memory-leaks` · `test-selectors` · `visual-regression` · `animation-motion` · `loop-engineering` · `agent-supervision`

## Flags

- `--dry-run` — stop after the plan.
- `--budget <tokens>` — token ceiling (default 400000).
- `--auto` — proceed through the merge gate autonomously. It does **not** waive a `degraded` verdict; only a recorded per-run human waiver does.
- `--no-supervisor` — disable live supervision (recorded as a coverage gap).

**Kill switch:** create `.claude/lazysitter/KILL` to halt before the next wave.

## Installed files

```text
.claude/agents/lazysitter-fe-*.md              41 agents
.claude/skills/*/SKILL.md                      31 skills
.claude/commands/lsife.md                      the /lsife orchestrator
.claude/lazysitter/roster.fe.json              the roster (reference copy)
.claude/lazysitter/lazysitter.fe.config.json   your config (preserved across updates)
.lazysitter/index/                             the generated index (git-ignored)
```

Both teams can be installed side by side: `/lsi` for general and full-stack work, `/lsife` for frontend. Installing one never prunes the other, and `uninstall` removes whatever is present.

## Current limitation

The frontend team ships for the **Claude Code** adapter. Codex and Cursor receive the general team only; the installer says so rather than writing a partial adapter.
