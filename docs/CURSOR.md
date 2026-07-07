# LazySitter on Cursor

Cursor is the best runtime for LazySitter if you want **top quality at the lowest cost**, because Cursor supports **native subagents**. That lets the pipeline keep strict role separation (no agent checks its own work) without paying for separate external processes.

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
- `.cursor/rules/lazysitter.mdc` — Cursor rule that makes LazySitter “just work” in chat
- `.cursor/lazysitter/README.md` — local usage notes
- `.cursor/lazysitter/PITFALL-LEDGER.md` — preserved across updates

## How to use it

In Cursor Chat, ask for LazySitter explicitly. Example:

```text
run LazySitter on: Add CSV export to the analytics dashboard --dry-run
```

Flags:
- `--dry-run` — intake → plan only
- `--budget <tokens>` — token ceiling (default 400000)
- `--auto` — proceed through merge + auto-rollback (default)

## Where the audit trail is written

Runs are written to:

` .cursor/lazysitter/runs/<feature-slug>/ `

Kill switch:

` .cursor/lazysitter/KILL `

## Model strategy (quality vs cost)

The Cursor rule applies a “cheapest safe model” strategy:
- low tier for intake/triage/explorer and mechanical tasks
- mid tier for implementers and test-author/test-runner
- high tier for architect/security-expert/red-team/security-auditor/intent auditing

If you want maximum quality, say “run LazySitter in beast mode”. If you want minimum cost, say “run LazySitter in budget mode”.

