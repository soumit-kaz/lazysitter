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
    log.warn(`  Pass that path if you meant the repo root: ${c.dim('lazysitter init ' + gitRoot)}`);
  }
  return root;
}

// Decide which tool adapters to install. Explicit flags win; otherwise detect
// existing .claude/.codex/.cursor dirs; if none exists, install all.
function resolveTools(opts, targetRoot) {
  const anyExplicit = opts.claude || opts.codex || opts.cursor;
  if (anyExplicit) {
    const tools = [];
    if (opts.claude) tools.push('claude');
    if (opts.codex) tools.push('codex');
    if (opts.cursor) tools.push('cursor');
    return tools;
  }

  const hasClaude = exists(path.join(targetRoot, '.claude'));
  const hasCodex =
    exists(path.join(targetRoot, '.codex')) || exists(path.join(targetRoot, 'AGENTS.md'));
  const hasCursor = exists(path.join(targetRoot, '.cursor'));

  if (hasClaude && !hasCodex && !hasCursor) return ['claude'];
  if (hasCodex && !hasClaude && !hasCursor) return ['codex'];
  if (hasCursor && !hasClaude && !hasCodex) return ['cursor'];

  const tools = [];
  if (hasClaude) tools.push('claude');
  if (hasCodex) tools.push('codex');
  if (hasCursor) tools.push('cursor');

  // If nothing is detected, install all adapters so the repo is ready
  // regardless of which client the user uses first.
  return tools.length ? tools : ['claude', 'codex', 'cursor'];
}

module.exports = { resolveTargetRoot, resolveTools };
