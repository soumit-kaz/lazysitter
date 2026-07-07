# LazySitter on Cursor

Cursor gets the **same structure as the Claude Code install** — not a lightweight rule. Cursor natively reads `.cursor/agents/*.md` subagents and `.cursor/commands/*.md` slash commands, so LazySitter installs one definition file per agent (each with its own pinned model and `readonly` scope) plus a real `/lsi` orchestrator command. All of it is generated from the same single-source roster the Claude and Codex adapters use, so the three never drift.

## Install

Install LazySitter into your project:

```bash
npx github:soumit-kaz/lazysitter init
```

Or install only the Cursor adapter:

```bash
npx github:soumit-kaz/lazysitter init . --cursor
```

This installs:
- `.cursor/agents/lazysitter-*.md` — **26 native Cursor subagents**, each with a pinned `model:` and `readonly:` scope
- `.cursor/commands/lsi.md` — the `/lsi` orchestrator command (the full pipeline playbook)
- `.cursor/rules/lazysitter.mdc` — a trigger rule so "run LazySitter" works without the slash command
- `.cursor/lazysitter/models.json` — the tier→model map (editable, preserved across updates)
- `.cursor/lazysitter/README.md` and `PITFALL-LEDGER.md`

## How to use it

In Cursor, run the slash command:

```text
/lsi Add CSV export to the analytics dashboard --dry-run
```

…or just say it in chat:

```text
run LazySitter on: Add CSV export to the analytics dashboard --dry-run
```

Flags:
- `--dry-run` — intake → plan only
- `--budget <tokens>` — token ceiling (default 400000)
- `--auto` — proceed through merge + auto-rollback (default)

## The audit trail

Runs are written to `.cursor/lazysitter/runs/<feature-slug>/`. Kill switch: create `.cursor/lazysitter/KILL` to halt before the next tier.

## Models (pinned per agent)

Every agent's model is baked into its `.cursor/agents/*.md` frontmatter from `.cursor/lazysitter/models.json`:

| Tier | Model | Used by |
|------|-------|---------|
| `high` | `claude-opus-4-8-thinking-high` | architect, security-expert, devils-advocate, security-auditor, closing-loop-auditor |
| `high_alt` (distinct) | `gpt-5.3-codex` | red-team — kept different from the build lineage to avoid shared blind spots |
| `mid` | `claude-sonnet-5-thinking-high` | spec-writer, design experts, implementers, dependency-auditor, test-author, test-runner, code-reviewer, integration-checker, release/rollback |
| `low` | `composer-2.5-fast` | business-analyst, triage, explorer, secrets-scanner, monitor, docs |

To change models, **edit `.cursor/lazysitter/models.json` and run `lazysitter update`** — the installer re-bakes every agent file. Don't hand-edit individual agent files, since update overwrites them.

## Parity notes & caveats

- **Tool scoping:** Cursor has no per-agent `tools:` allow-list like Claude Code. LazySitter uses `readonly: true` on every inspect/verify agent instead; implementers, producers, and the git-mutating release/rollback agents get write.
- **Flat hub:** Cursor allows one level of nested subagent spawning, but LazySitter forbids it — the orchestrator is the only hub. This is enforced by instruction in the `/lsi` command and the rule.
- **Model fallback:** if a pinned model isn't available on your Cursor plan (e.g. Max-Mode-only, or blocked by a team admin), Cursor silently falls back. That can weaken the "red-team on a distinct model" guarantee — pick model IDs your plan can actually run.
