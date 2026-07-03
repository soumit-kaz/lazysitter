# LazySitter — Autonomous AI Engineering Team for Claude Code & Codex

**LazySitter is an open-source, multi-agent AI coding pipeline that turns a plain-language feature request into shipped, independently-verified code.** It installs a 26-agent autonomous engineering team into your own repository and runs the whole software workflow — intake → spec → design → build → automated code review → testing → release — with one hard guarantee: **no agent checks its own work, and tests are written from the spec, blind to the code.**

Works with **[Claude Code](https://claude.com/claude-code)** and **OpenAI Codex** out of the box.

```bash
npx github:soumit-kaz/lazysitter init
```

---

## Why LazySitter

- **Autonomous, end-to-end.** Describe a feature in one sentence; LazySitter runs the full engineering pipeline and hands you reviewed, tested, merge-ready code.
- **Unbiased verification.** Tests are authored from the spec by an agent that never sees the implementation — so passing tests actually mean something.
- **Built-in adversarial review.** A dedicated red-team and a "devil's advocate" agent actively try to break every feature and challenge every design decision.
- **Automated security & secrets scanning** on the real diff — not just the plan.
- **Reads your Jira tickets.** Point it at a ticket key or URL and the intake, research, and intent-audit agents pull the ticket via the Atlassian MCP server (read-only) — every other agent stays ticket-blind by design.
- **Runs in your repo, nothing global.** Everything installs into your project and is recorded in an audit trail you can inspect.
- **Two runtimes, one experience.** Use Claude Code's native subagents or OpenAI Codex — same pipeline, same guarantees.

## Install

From the root of the project you want LazySitter in:

```bash
npx github:soumit-kaz/lazysitter init
```

It auto-detects whether your project uses Claude Code, Codex, or both, and installs only what fits. Install a single adapter:

```bash
npx github:soumit-kaz/lazysitter init . --claude   # Claude Code only
npx github:soumit-kaz/lazysitter init . --codex    # Codex only
```

Prefer a local clone?

```bash
git clone https://github.com/soumit-kaz/lazysitter
node lazysitter/bin/lazysitter.js init /path/to/your/project
```

**Requirements:** Node.js ≥ 16 for the installer, plus the Claude Code CLI and/or the OpenAI Codex CLI at run time.

> The short `npx lazysitter init` form works only once the package is published to npm. Until then, use the `npx github:soumit-kaz/lazysitter …` form above.

## Quick start

**Claude Code** — run the orchestrator command in your project:

```text
/lsi Add CSV export to the analytics dashboard --dry-run
```

Flags: `--dry-run` (stop after the plan), `--budget <tokens>` (default 400000), `--auto` (run through merge with auto-rollback — the default).

**Codex** — open `codex` in the project and say:

> run LazySitter on: add CSV export to the analytics dashboard, dry run

**Kill switch:** create `.claude/lazysitter/KILL` or `.codex/lazysitter/KILL` to stop before the next stage. Every run writes a full audit trail under `lazysitter/runs/<feature>/`.

## The 26 agents

LazySitter is a team of 26 specialized agents across 8 tiers. Triage wakes 6–10 of them per feature, but the verification, security, and adversarial agents are **never skipped**.

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

LazySitter merges only when tests **pass**, security is **clean**, review is **clean**, integration is **clean**, and the result matches your **original request** — all at once, never force-merged. Run `npx github:soumit-kaz/lazysitter list` for the full roster.

## Commands

```bash
npx github:soumit-kaz/lazysitter doctor      # verify install, tooling, and model config
npx github:soumit-kaz/lazysitter list        # print the agent roster
npx github:soumit-kaz/lazysitter update      # refresh agents, keep your config edits
npx github:soumit-kaz/lazysitter uninstall   # remove LazySitter
```

## Documentation

- [docs/CLAUDE.md](docs/CLAUDE.md) — using LazySitter with Claude Code
- [docs/CODEX.md](docs/CODEX.md) — using LazySitter with OpenAI Codex
- [docs/CUSTOMIZING.md](docs/CUSTOMIZING.md) — change models, tiers, and sandboxes

## Contributing

Issues and pull requests are welcome. Open one at [github.com/soumit-kaz/lazysitter](https://github.com/soumit-kaz/lazysitter/issues).

## License

MIT
