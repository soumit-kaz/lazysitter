# Newronaut on Claude Code

The Claude Code adapter is a near-verbatim copy of `core/` — the canonical agent files are
already native Claude Code format.

## What runs where

- **Orchestrator** = the `/newronaut` slash command (`.claude/commands/newronaut.md`), running in your
  main Claude session (Opus). It is the only role with the `Task` tool, so it is the only hub —
  no subagent can spawn another. The pipeline stays flat and debuggable.
- **Agents** = `.claude/agents/newronaut-*.md`. Each has a `model:` (opus/sonnet/haiku) and a
  `tools:` allow-list. Claude Code enforces both natively.

## The design → Claude Code mapping

| Design intent | Mechanism |
|---------------|-----------|
| Model tiers | the `model:` frontmatter field |
| Tool restriction / least privilege | the `tools:` frontmatter field |
| "Orchestrator is the only hub" | no subagent is granted `Task` |
| Budget cap / kill switch / audit log | orchestrator logic in the command |
| Tests blind to code | `newronaut-test-author` is spawned **in parallel** with the implementers, from the frozen spec — the implementation does not exist yet when tests are authored |

## Running

```
/newronaut <feature request> [--dry-run] [--budget <tokens>] [--auto]
```

- `--dry-run` — intake → plan only; no code, no merge. Best first run.
- `--budget N` — token ceiling (default 400000); pauses and asks before exceeding it.
- `--auto` — proceed through the merge gate + auto-rollback autonomously (default).

Artifacts land in `.claude/newronaut/runs/<slug>/`. Kill switch: create `.claude/newronaut/KILL`.

## Changing models

Edit the `model:` field in the relevant `.claude/agents/newronaut-*.md`, or change `core/` and run
`newronaut update`. If your plan can't run a given tier, downgrade there — but keep the red-team on
a *different* model from the implementers to preserve independent blind spots.
