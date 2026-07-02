'use strict';

const path = require('path');
const { log } = require('./util');

// Render the Claude Code adapter. The canonical agent files already carry valid
// Claude frontmatter (name/description/tools/model), so they are copied verbatim.
function installClaude(ctx, data) {
  log.step('Claude Code adapter → .claude/');

  for (const agent of data.agents) {
    ctx.copy(path.join(ctx.coreDir, 'agents', agent.file), `.claude/agents/${agent.file}`);
  }

  ctx.copy(path.join(ctx.coreDir, 'orchestrator.claude.md'), '.claude/commands/aet.md');
  ctx.copy(path.join(ctx.templatesDir, 'AET-README.md'), '.claude/aet/README.md');
}

module.exports = { installClaude };
