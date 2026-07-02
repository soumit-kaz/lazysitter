<!-- NEWTON:BEGIN — managed by the Autonomous Engineering Team installer. Do not edit between these markers; run `newton update` instead. -->
## Autonomous Engineering Team (Newton)

This repo has the Newton pipeline installed as a Codex skill at `.codex/skills/newton/`.

When the user asks to **run Newton**, **run the autonomous engineering team**, or drive a feature
through the full intake → design → build → verify → release pipeline, load and follow
`.codex/skills/newton/SKILL.md`. You act as the Tier-0 orchestrator and spawn each specialized
agent as its own context-isolated `codex exec` via `.codex/skills/newton/run-agent.sh`
(or `run-agent.ps1` on Windows). No agent verifies its own work; tests are authored blind
from the spec. See `.codex/skills/newton/orchestrator.md` for the full playbook.

Kill switch: create `.codex/newton/KILL` to halt the pipeline before the next tier.
<!-- NEWTON:END -->
