# Customizing AET

Everything derives from `core/`. Edit there and run `aet update` in each installed project to
propagate — never hand-edit installed files (they're overwritten on update and listed in
`.aet/manifest.json`). The two exceptions are the Codex `models.env` and `aet.config.json`,
which are written once and preserved across updates.

## Change an agent's behavior

Edit the body of `core/agents/aet-<name>.md`. The body is shared by both runtimes: Claude
Code uses it directly; the Codex adapter strips the frontmatter and uses the body as the role
prompt. Keep the `## Output (structured)` block — the orchestrator relies on the shape.

## Change a model tier or sandbox

`core/roster.json` is authoritative. Per agent:

```json
"aet-red-team": { "tier": "high", "codexSandbox": "workspace-write", "codexApproval": "never", "distinctModel": true }
```

- `tier` — `high` / `mid` / `low`. Maps to `models.env` slots on Codex and, via the agent's
  own `model:` frontmatter, to opus/sonnet/haiku on Claude Code.
- `codexSandbox` — `read-only` / `workspace-write` / `danger-full-access` (avoid the last).
- `codexApproval` — `never` / `on-request` / `untrusted`.
- `distinctModel` — `true` routes the agent to `MODEL_HIGH_ALT` (used for the red-team).

The Claude tool allow-list lives in each agent file's `tools:` frontmatter; the Codex sandbox
is derived from `roster.json` (with a fallback inferred from `tools:` if an entry is missing).

## Add a new agent

1. Add `core/agents/aet-<name>.md` with `name`, `description`, `tools`, `model` frontmatter
   and a `## Role` / `## Do` / `## Never` / `## Output` body (copy an existing one).
2. Add its entry to `core/roster.json` → `agents`. If it must always run, add it to
   `neverSkip`.
3. Reference it in both orchestrators (`core/orchestrator.claude.md` and
   `core/orchestrator.codex.md`) at the right tier.
4. `aet update`.

## Change the never-skip set or the merge gate

`neverSkip` in `core/roster.json` documents the always-on agents, but the gate is *enforced*
by the orchestrators. Edit the "Merge gate" and "Never skip" sections in both
`core/orchestrator.claude.md` and `core/orchestrator.codex.md` together so the two runtimes
stay in lockstep.
