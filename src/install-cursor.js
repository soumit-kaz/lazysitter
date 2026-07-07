'use strict';

const path = require('path');
const { log, readFile } = require('./util');

// Cursor adapter: install a Cursor rule that teaches Cursor Chat how to run
// the LazySitter pipeline using native subagents (Task) with a cost/quality policy.
function installCursor(ctx) {
  log.step('Cursor adapter → .cursor/');

  ctx.copy(path.join(ctx.coreDir, 'cursor', 'LazySitter.rule.mdc'), '.cursor/rules/lazysitter.mdc');
  ctx.copy(path.join(ctx.templatesDir, 'Cursor-LazySitter-README.md'), '.cursor/lazysitter/README.md');

  // Seeded process-pitfall ledger — preserve so accumulated faults survive `update`.
  ctx.writePreserve(
    '.cursor/lazysitter/PITFALL-LEDGER.md',
    readFile(path.join(ctx.coreDir, 'PITFALL-LEDGER.seed.md'))
  );
}

module.exports = { installCursor };

