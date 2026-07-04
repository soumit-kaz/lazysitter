'use strict';

const path = require('path');
const { log, readFile } = require('./util');

// Render the Claude Code adapter. The canonical agent files already carry valid
// Claude frontmatter (name/description/tools/model), so they are copied verbatim.
function installClaude(ctx, data) {
  log.step('Claude Code adapter → .claude/');

  for (const agent of data.agents) {
    ctx.copy(path.join(ctx.coreDir, 'agents', agent.file), `.claude/agents/${agent.file}`);
  }

  ctx.copy(path.join(ctx.coreDir, 'orchestrator.claude.md'), '.claude/commands/lsi.md');
  ctx.copy(path.join(ctx.templatesDir, 'LazySitter-README.md'), '.claude/lazysitter/README.md');

  // Seeded process-pitfall ledger — preserve so accumulated faults survive `update`.
  ctx.writePreserve(
    '.claude/lazysitter/PITFALL-LEDGER.md',
    readFile(path.join(ctx.coreDir, 'PITFALL-LEDGER.seed.md'))
  );
}

module.exports = { installClaude };
