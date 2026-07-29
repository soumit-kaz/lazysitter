'use strict';

const path = require('path');
const { log, readFile } = require('./util');

// Run artifacts are per-run working state — diffs, reports, checkpoints, leases,
// the feature text. They are not source and must not be committed, but the
// agent files and config next to them must stay tracked.
const RUN_ARTIFACT_GITIGNORE = `# Per-run working state written by a LazySitter run. Not source; never commit it.
runs/
RUN.lock
# Everything else here (agents, commands, config, ledgers) IS tracked.
!.gitignore
`;

function installClaude(ctx, data) {
  log.step('Claude Code adapter → .claude/');

  for (const agent of data.agents) {
    ctx.copy(path.join(ctx.coreDir, 'agents', agent.file), `.claude/agents/${agent.file}`);
  }

  ctx.copy(path.join(ctx.coreDir, 'orchestrator.claude.md'), '.claude/commands/lsi.md');
  ctx.copy(path.join(ctx.templatesDir, 'LazySitter-README.md'), '.claude/lazysitter/README.md');
  ctx.write('.claude/lazysitter/.gitignore', RUN_ARTIFACT_GITIGNORE);

  ctx.writePreserve(
    '.claude/lazysitter/PITFALL-LEDGER.md',
    readFile(path.join(ctx.coreDir, 'PITFALL-LEDGER.seed.md'))
  );

  ctx.writePreserve(
    '.claude/lazysitter/lazysitter.config.json',
    readFile(path.join(ctx.coreDir, 'claude', 'lazysitter.config.json'))
  );
}

module.exports = { installClaude };
