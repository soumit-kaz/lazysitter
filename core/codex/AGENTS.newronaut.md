<!-- NEWRONAUT:BEGIN — managed by the Autonomous Engineering Team installer. Do not edit between these markers; run `newronaut update` instead. -->
## Autonomous Engineering Team (Newronaut)

This repo has the Newronaut pipeline installed as a Codex skill at `.codex/skills/newronaut/`.

When the user asks to **run Newronaut**, **run the autonomous engineering team**, or drive a feature
through the full intake → design → build → verify → release pipeline, load and follow
`.codex/skills/newronaut/SKILL.md`. You act as the Tier-0 orchestrator and spawn each specialized
agent as its own context-isolated `codex exec` via `.codex/skills/newronaut/run-agent.sh`
(or `run-agent.ps1` on Windows). No agent verifies its own work; tests are authored blind
from the spec. See `.codex/skills/newronaut/orchestrator.md` for the full playbook.

Kill switch: create `.codex/newronaut/KILL` to halt the pipeline before the next tier.
<!-- NEWRONAUT:END -->
