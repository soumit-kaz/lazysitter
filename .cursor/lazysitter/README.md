# LazySitter on Cursor

LazySitter installs into Cursor with the **same structure as Claude Code**: native per-agent subagents in `.cursor/agents/`, a real `/lsi` orchestrator command in `.cursor/commands/`, and a trigger rule in `.cursor/rules/`. No agent verifies its own work, and tests are written from the spec, blind to the implementation.

## How to use it

In Cursor, run the slash command:

```text
/lsi Add CSV export to the analytics dashboard --dry-run
```

…or say it in chat: "run LazySitter on: add CSV export to the analytics dashboard, dry run".

Flags:
- `--dry-run` — stop after the plan (Tier 4). No code, no merge.
- `--budget <tokens>` — token ceiling (default 400000).
- `--auto` — proceed through merge + auto-rollback autonomously (default).

## What got installed

- `.cursor/agents/lazysitter-*.md` — 26 subagents, each with a pinned `model:` and `readonly:` scope
- `.cursor/commands/lsi.md` — the `/lsi` orchestrator (full pipeline playbook)
- `.cursor/rules/lazysitter.mdc` — triggers the pipeline when you ask for it in chat
- `.cursor/lazysitter/models.json` — tier→model map (edit this, then `lazysitter update`)

## Where things land

Every run writes to `.cursor/lazysitter/runs/<feature-slug>/`:
- `audit.log`, `MANIFEST.md`, `REQUIREMENT.md`, `TRIAGE.md`, `CONTEXT-PACK.md`, `ACCEPTANCE-CRITERIA.md`, `PLAN.md`, `DECISIONS.md`
- `gate-state.jsonl`, `TRACEABILITY.md`, `LIMITATIONS.md`
- one report per verification agent

**Kill switch:** create `.cursor/lazysitter/KILL` to halt before the next tier.

## Changing models

Models are pinned per agent from `.cursor/lazysitter/models.json`. Edit that file and run
`lazysitter update` to re-bake every agent's `model:` field. Keep `high_alt` different from
`high` so the red-team doesn't share the implementers' blind spots.
