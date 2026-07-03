# Provenforge — Autonomous AI Engineering Team for Claude Code & Codex

**Provenforge is an open-source, multi-agent AI coding pipeline that turns a plain-language feature request into shipped, independently-verified code.** It installs a 26-agent autonomous engineering team into your own repository and runs the whole software workflow — intake → spec → design → build → automated code review → testing → release — with one hard guarantee: **no agent checks its own work, and tests are written from the spec, blind to the code.**

Works with **[Claude Code](https://claude.com/claude-code)** and **OpenAI Codex** out of the box.

```bash
npx github:soumit-kaz/provenforge init
```

---

## Why Provenforge

- **Autonomous, end-to-end.** Describe a feature in one sentence; Provenforge runs the full engineering pipeline and hands you reviewed, tested, merge-ready code.
- **Unbiased verification.** Tests are authored from the spec by an agent that never sees the implementation — so passing tests actually mean something.
- **Built-in adversarial review.** A dedicated red-team and a "devil's advocate" agent actively try to break every feature and challenge every design decision.
- **Automated security & secrets scanning** on the real diff — not just the plan.
- **Runs in your repo, nothing global.** Everything installs into your project and is recorded in an audit trail you can inspect.
- **Two runtimes, one experience.** Use Claude Code's native subagents or OpenAI Codex — same pipeline, same guarantees.

## Install

From the root of the project you want Provenforge in:

```bash
npx github:soumit-kaz/provenforge init
```

It auto-detects whether your project uses Claude Code, Codex, or both, and installs only what fits. Install a single adapter:

```bash
npx github:soumit-kaz/provenforge init . --claude   # Claude Code only
npx github:soumit-kaz/provenforge init . --codex    # Codex only
```

Prefer a local clone?

```bash
git clone https://github.com/soumit-kaz/provenforge
node provenforge/bin/provenforge.js init /path/to/your/project
```

**Requirements:** Node.js ≥ 16 for the installer, plus the Claude Code CLI and/or the OpenAI Codex CLI at run time.

> The short `npx provenforge init` form works only once the package is published to npm. Until then, use the `npx github:soumit-kaz/provenforge …` form above.

## Quick start

**Claude Code** — run the orchestrator command in your project:

```text
/provenforge Add CSV export to the analytics dashboard --dry-run
```

Flags: `--dry-run` (stop after the plan), `--budget <tokens>` (default 400000), `--auto` (run through merge with auto-rollback — the default).

**Codex** — open `codex` in the project and say:

> run Provenforge on: add CSV export to the analytics dashboard, dry run

**Kill switch:** create `.claude/provenforge/KILL` or `.codex/provenforge/KILL` to stop before the next stage. Every run writes a full audit trail under `provenforge/runs/<feature>/`.

## The 26 agents

Provenforge is a team of 26 specialized agents across 8 tiers. Triage wakes 6–10 of them per feature, but the verification, security, and adversarial agents are **never skipped**.

| Tier | Agents |
|------|--------|
| 1 · Intake | business-analyst, triage |
| 2 · Research | explorer |
| 3 · Spec | spec-writer |
| 4 · Design | architect, database/infra/frontend/security experts, ux-analyst, devils-advocate |
| 5 · Build | backend/frontend implementers, dependency-auditor, *(blind)* test-author |
| 6 · Verification | test-runner, code-reviewer, red-team, security-auditor, secrets-scanner |
| 7 · Integration | integration-checker, closing-loop-auditor |
| 8 · Release | release-agent, monitor-agent, rollback-agent, docs-agent |

Provenforge merges only when tests **pass**, security is **clean**, review is **clean**, integration is **clean**, and the result matches your **original request** — all at once, never force-merged. Run `npx github:soumit-kaz/provenforge list` for the full roster.

## Commands

```bash
npx github:soumit-kaz/provenforge doctor      # verify install, tooling, and model config
npx github:soumit-kaz/provenforge list        # print the agent roster
npx github:soumit-kaz/provenforge update      # refresh agents, keep your config edits
npx github:soumit-kaz/provenforge uninstall   # remove Provenforge
```

## Documentation

- [docs/CLAUDE.md](docs/CLAUDE.md) — using Provenforge with Claude Code
- [docs/CODEX.md](docs/CODEX.md) — using Provenforge with OpenAI Codex
- [docs/CUSTOMIZING.md](docs/CUSTOMIZING.md) — change models, tiers, and sandboxes

## Contributing

Issues and pull requests are welcome. Open one at [github.com/soumit-kaz/provenforge](https://github.com/soumit-kaz/provenforge/issues).

## License

MIT
