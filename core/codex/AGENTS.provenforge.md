<!-- PROVENFORGE:BEGIN — managed by the Autonomous Engineering Team installer. Do not edit between these markers; run `provenforge update` instead. -->
## Autonomous Engineering Team (Provenforge)

This repo has the Provenforge pipeline installed as a Codex skill at `.codex/skills/provenforge/`.

When the user asks to **run Provenforge**, **run the autonomous engineering team**, or drive a feature
through the full intake → design → build → verify → release pipeline, load and follow
`.codex/skills/provenforge/SKILL.md`. You act as the Tier-0 orchestrator and spawn each specialized
agent as its own context-isolated `codex exec` via `.codex/skills/provenforge/run-agent.sh`
(or `run-agent.ps1` on Windows). No agent verifies its own work; tests are authored blind
from the spec. See `.codex/skills/provenforge/orchestrator.md` for the full playbook.

Kill switch: create `.codex/provenforge/KILL` to halt the pipeline before the next tier.
<!-- PROVENFORGE:END -->
