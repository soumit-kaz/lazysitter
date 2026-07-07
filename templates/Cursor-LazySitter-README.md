# LazySitter on Cursor

LazySitter runs best on Cursor because Cursor supports **native subagents**, so the pipeline can preserve strict role separation: no agent verifies its own work, and tests are written from the spec, blind to the implementation.

## Install

From the root of the project you want LazySitter in:

```bash
npx github:soumit-kaz/lazysitter init . --cursor
```

If you want multiple adapters:

```bash
npx github:soumit-kaz/lazysitter init . --cursor --claude --codex
```

## How to use it

In Cursor Chat, ask for LazySitter explicitly, for example:

```text
run LazySitter on: Add CSV export to the analytics dashboard --dry-run
```

Flags you can include in the request:
- `--dry-run` — stop after the plan (Tier 4). No code, no merge.
- `--budget <tokens>` — token ceiling (default 400000).
- `--auto` — proceed through merge + auto-rollback autonomously (default).

## Where things land

Every run writes to `.cursor/lazysitter/runs/<feature-slug>/` with:
- `audit.log`, `MANIFEST.md`, `REQUIREMENT.md`, `TRIAGE.md`, `CONTEXT-PACK.md`, `ACCEPTANCE-CRITERIA.md`, `PLAN.md`, `DECISIONS.md`
- `gate-state.jsonl`, `TRACEABILITY.md`, `LIMITATIONS.md`
- one report per verification agent

**Kill switch:** create `.cursor/lazysitter/KILL` to halt before the next tier.

