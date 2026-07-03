<!-- LAZYSITTER:BEGIN — managed by the Autonomous Engineering Team installer. Do not edit between these markers; run `lazysitter update` instead. -->
## Autonomous Engineering Team (LazySitter)

This repo has the LazySitter pipeline installed as a Codex skill at `.codex/skills/lazysitter/`.

When the user asks to **run LazySitter**, **run the autonomous engineering team**, or drive a feature
through the full intake → design → build → verify → release pipeline, load and follow
`.codex/skills/lazysitter/SKILL.md`. You act as the Tier-0 orchestrator and spawn each specialized
agent as its own context-isolated `codex exec` via `.codex/skills/lazysitter/run-agent.sh`
(or `run-agent.ps1` on Windows). No agent verifies its own work; tests are authored blind
from the spec. See `.codex/skills/lazysitter/orchestrator.md` for the full playbook.

Kill switch: create `.codex/lazysitter/KILL` to halt the pipeline before the next tier.
<!-- LAZYSITTER:END -->
