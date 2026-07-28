# TRIAGE

> Persistence note: produced by `lazysitter-triage`, recovered verbatim by the orchestrator after the
> agent did not self-persist. See PITFALL row `[proc][false-persist]`.

size: moderate
experts: []
implementers: [backend-implementer]

## Rationale (evidence-cited)

- **size: moderate** — 6+ mechanisms across 26 agent markdown definitions + 2 orchestrator playbooks + the Node installer. Cross-cutting changes within established patterns; adds no architectural layer. Evidence: `core/agents/` = 26 `.md` files; `core/orchestrator.claude.md` + `core/orchestrator.codex.md`; `src/install.js`, `src/doctor.js`.

- **database-expert: exclude** — zero database code. Evidence: grep `database|sql|postgres|mysql|dynamodb|collection|schema` across `src/` and `core/` → zero matches.

- **infra-expert: exclude** — LazySitter ships markdown + a zero-dependency installer; this feature changes no deployment topology, CI wiring, or branch strategy. Evidence: `package.json` has zero dependencies and no infrastructure code exists in `src/` or `core/`.

- **frontend-expert: exclude** — zero frontend/UI code. Evidence: grep `react|vue|angular|svelte|jsx|tsx|html|css|frontend` across `src/` → zero matches. All outputs are markdown.

- **ux-analyst: exclude** — the changes are internal pipeline mechanics (FACT-BLOCK, degraded-gate blocking). The user-facing surface (`/lsi <request>`) is unchanged. Evidence: CRITICISM-RESPONSE.md Part 1 describes accuracy/correctness fixes, not a UX redesign.

- **backend-implementer: INCLUDE** — required. Touches (1) the Node installer `src/install.js` / `src/doctor.js`, (2) 26 agent markdown definitions in `core/agents/`, (3) both orchestrator playbooks.

- **frontend-implementer: exclude** — no frontend code to implement.

## Never-skipped regardless of size
spec-writer · test-author · test-runner · code-reviewer · security-expert · security-auditor · red-team · devils-advocate · secrets-scanner · closing-loop-auditor

## Orchestrator note on this triage
The panel selection is accepted. One correction recorded against the agent's own output: its rationale
cites "CRITICISM-RESPONSE.md (Part 1 — Adopted in full, items A1–A6)", i.e. it read only part of the
adopted scope. The panel conclusion is unaffected (the excluded stacks are absent from this repo on
evidence the agent did verify), so the selection stands, but the under-read is logged rather than
silently inherited.
