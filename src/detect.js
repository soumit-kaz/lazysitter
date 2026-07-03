'use strict';

const path = require('path');
const { exists, findGitRoot, log, c } = require('./util');

function resolveTargetRoot(dirArg) {
  const root = path.resolve(dirArg || process.cwd());
  const gitRoot = findGitRoot(root);
  if (gitRoot && gitRoot !== root) {
    log.warn(
      `Installing into ${c.bold(root)}, but the git root is ${c.bold(gitRoot)}.`
    );
    log.warn(`  Pass that path if you meant the repo root: ${c.dim('provenforge init ' + gitRoot)}`);
  }
  return root;
}

// Decide which tool adapters to install. Explicit flags win; otherwise detect
// existing .claude/.codex dirs; if neither exists, install both.
function resolveTools(opts, targetRoot) {
  if (opts.claude && !opts.codex) return ['claude'];
  if (opts.codex && !opts.claude) return ['codex'];
  if (opts.claude && opts.codex) return ['claude', 'codex'];

  const hasClaude = exists(path.join(targetRoot, '.claude'));
  const hasCodex =
    exists(path.join(targetRoot, '.codex')) || exists(path.join(targetRoot, 'AGENTS.md'));

  if (hasClaude && !hasCodex) return ['claude'];
  if (hasCodex && !hasClaude) return ['codex'];
  return ['claude', 'codex'];
}

module.exports = { resolveTargetRoot, resolveTools };
