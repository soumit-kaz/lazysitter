# Newton

An **autonomous engineering team**: a **26-agent autonomous feature pipeline** you install *into your own project*. Give it a
plain-language feature request; it runs intake → research → spec → design → build →
independent verification → integration → release, with one hard guarantee threaded
throughout: **no agent verifies its own work, and tests are written from the spec, blind to
the code.**

Newton ships for **two runtimes from one source of truth**:

| Runtime | How agents run | Entry point |
|--------|----------------|-------------|
| **Claude Code** | Native typed subagents (`.claude/agents/*.md`) spawned by an orchestrator slash command | `/newton <feature>` |
| **Codex** | Each agent is a context-isolated `codex exec` process, driven by a Codex skill | say *"run Newton on \<feature\>"* |

The Codex port is **faithful, not degraded**: because every agent is its own `codex exec`
with its own context, sandbox, and model, the "no agent grades its own homework" property
holds structurally on both runtimes.

---

## Install (per-project, not global)

From the root of the project you want Newton in:

```bash
npx newton init
```

It auto-detects whether the project uses Claude Code, Codex, or both, and installs only what
fits. No global state is written — everything lands inside the target repo and is tracked in
`.newton/manifest.json`.

```bash
npx newton init . --codex     # Codex adapter only
npx newton init . --claude    # Claude Code adapter only
npx newton doctor             # verify the install + tooling + model tiering
npx newton list               # print the agent roster
npx newton update             # refresh agents/scripts, keep your config edits
npx newton uninstall          # remove Newton (--purge also deletes your config)
```

**Not published to npm yet?** Install straight from GitHub — `npx` clones and runs it, no
registry account needed. Replace `<owner>/newton` with the actual repo:

```bash
npx github:<owner>/newton init             # both adapters, into the current repo
npx github:<owner>/newton init . --codex   # Codex adapter only
npx github:<owner>/newton doctor           # verify the install
```

Or run it straight from a local clone:

```bash
git clone https://github.com/<owner>/newton && node newton/bin/newton.js init /path/to/your/project
```

Requires **Node ≥ 16** to run the installer. The pipeline itself needs the Claude Code CLI
and/or the Codex CLI at run time.

---

## What gets installed

**Claude Code adapter →**
```
.claude/agents/newton-*.md      26 typed subagents (model + tool restrictions per agent)
.claude/commands/newton.md      the /newton orchestrator command
.claude/newton/README.md        in-project usage notes
```

**Codex adapter →**
```
.codex/skills/newton/SKILL.md         the orchestrator skill (auto-discovered by Codex)
.codex/skills/newton/orchestrator.md  the full pipeline playbook (human-readable copy)
.codex/skills/newton/agents/*.md      26 role prompts (one per agent)
.codex/skills/newton/agents/*.meta    resolved tier / sandbox / approval per agent
.codex/skills/newton/run-agent.sh     spawns one context-isolated `codex exec` per agent
.codex/skills/newton/run-agent.ps1    Windows equivalent
.codex/skills/newton/models.env       ← you edit: map tiers to real model slugs
.codex/skills/newton/newton.config.json  ← you edit: budget, git auto-approve, monitor window
AGENTS.md                          a Newton block appended (points Codex at the skill)
```

Both share `.newton/manifest.json` (install record used by `update` / `uninstall` / `doctor`).

---

## Using it

**Claude Code**
```
/newton Add CSV export to the analytics dashboard --dry-run
```
Flags: `--dry-run` (stop after the plan), `--budget <tokens>` (default 400000), `--auto`
(proceed through merge + auto-rollback; the default).

**Codex** — open `codex` in the project and say:
> run Newton on: add CSV export to the analytics dashboard, dry run

Codex loads the skill and orchestrates the pipeline, spawning each agent as its own
`codex exec`. **First**, set your model slugs in `.codex/skills/newton/models.env` — especially
`MODEL_HIGH_ALT`, which gives the red-team a *distinct* model from the build lineage.

**Kill switch (both):** create `.claude/newton/KILL` or `.codex/newton/KILL` to halt before the
next tier. Every run writes a full audit trail under `.../newton/runs/<feature-slug>/`.

---

## The roster

26 agents across 8 tiers; most features wake 6–10 of them (triage decides), but the
verification and adversarial agents are **never skipped**. Run `npx newton list` for the
full table with per-agent tier, Codex sandbox, and approval mode.

| Tier | Agents |
|------|--------|
| 1 Intake | business-analyst, triage |
| 2 Research | explorer |
| 3 Spec | spec-writer |
| 4 Design | architect, database/infra/frontend/security experts, ux-analyst, devils-advocate |
| 5 Build | backend/frontend implementers, dependency-auditor, *(blind)* test-author |
| 6 Verification | test-runner, code-reviewer, red-team, security-auditor, secrets-scanner |
| 7 Integration & Intent | integration-checker, closing-loop-auditor |
| 8 Release & Recovery | release-agent, monitor-agent, rollback-agent, docs-agent |

Key invariants enforced by the orchestrator: merges only when tests **PASS** · security
**CLEAN** · review **CLEAN** · integration **CLEAN** · intent **MATCH**, all at once, never
force-merged; consensus is always challenged by the devils-advocate; the red-team always
runs on a distinct model; intent is checked against your *original* words, not the plan.

See [docs/CLAUDE.md](docs/CLAUDE.md) and [docs/CODEX.md](docs/CODEX.md) for how each runtime
maps to the design, and [docs/CUSTOMIZING.md](docs/CUSTOMIZING.md) to change models, tiers,
or sandboxes.

---

## How one source produces two runtimes

`core/` is the single source of truth:

```
core/agents/*.md            26 canonical agent definitions (name, description, tools, model + body)
core/roster.json            authoritative tier / codex-sandbox / approval / distinct-model map
core/orchestrator.claude.md the /newton command
core/orchestrator.codex.md  the Codex orchestrator skill
core/codex/*                Codex runner scripts + config templates + AGENTS.md snippet
```

`newton init` renders the Claude adapter (near-verbatim copy — the files are already native
Claude format) and the Codex adapter (strips frontmatter into role prompts, generates a
`.meta` per agent from `roster.json`, and wires the `codex exec` runner). Edit `core/` and
re-run `newton update` to propagate changes to every installed project.

## License

MIT © Newton. Rename the package scope in `package.json` freely before publishing your own copy.
