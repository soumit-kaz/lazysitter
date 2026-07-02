<!-- AET:BEGIN — managed by the Autonomous Engineering Team installer. Do not edit between these markers; run `aet update` instead. -->
## Autonomous Engineering Team (AET)

This repo has the AET pipeline installed as a Codex skill at `.codex/skills/aet/`.

When the user asks to **run AET**, **run the autonomous engineering team**, or drive a feature
through the full intake → design → build → verify → release pipeline, load and follow
`.codex/skills/aet/SKILL.md`. You act as the Tier-0 orchestrator and spawn each specialized
agent as its own context-isolated `codex exec` via `.codex/skills/aet/run-agent.sh`
(or `run-agent.ps1` on Windows). No agent verifies its own work; tests are authored blind
from the spec. See `.codex/skills/aet/orchestrator.md` for the full playbook.

Kill switch: create `.codex/aet/KILL` to halt the pipeline before the next tier.
<!-- AET:END -->
