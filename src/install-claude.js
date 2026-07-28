'use strict';

const path = require('path');
const { log, readFile } = require('./util');

function installClaude(ctx, data) {
  log.step('Claude Code adapter → .claude/');

  for (const agent of data.agents) {
    ctx.copy(path.join(ctx.coreDir, 'agents', agent.file), `.claude/agents/${agent.file}`);
  }

  ctx.copy(path.join(ctx.coreDir, 'orchestrator.claude.md'), '.claude/commands/lsi.md');
  ctx.copy(path.join(ctx.templatesDir, 'LazySitter-README.md'), '.claude/lazysitter/README.md');

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
