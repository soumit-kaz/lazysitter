'use strict';

const fs = require('fs');
const path = require('path');
const { log, readFile, sha256 } = require('./util');
const { isContained, hasSymlinkSegment } = require('./contain');
const { normalizeManagedRel, isManagedPathAllowed, safeStat, removeEmptyDirsUpward } = require('./uninstall');

const TOOL_PREFIXES = {
  claude: '.claude/',
  codex: '.codex/',
  cursor: '.cursor/',
};

function toolOfPath(rel) {
  for (const tool of Object.keys(TOOL_PREFIXES)) {
    if (rel.startsWith(TOOL_PREFIXES[tool])) return tool;
  }
  return null;
}

// Both teams live under `.claude/`, so tool prefix alone is not enough to decide
// what this run is entitled to prune. Installing only the frontend team must
// never silently delete the general team's agents, and vice versa.
function teamOfPath(rel) {
  if (
    rel.startsWith('.claude/agents/lazysitter-fe-') ||
    rel.startsWith('.claude/skills/') ||
    rel === '.claude/commands/lsife.md' ||
    rel === '.claude/lazysitter/roster.fe.json' ||
    rel === '.claude/lazysitter/FRONTEND-README.md' ||
    rel === '.claude/lazysitter/lazysitter.fe.config.json' ||
    rel.startsWith('.lazysitter/index/')
  ) {
    return 'frontend';
  }
  return 'general';
}

function pruneOrphans(targetRoot, priorManaged, freshManagedPaths, tools, teams) {
  const installed = Object.assign({ general: true, frontend: true }, teams || {});
  const fresh = new Set(freshManagedPaths);
  const renderedTools = new Set(tools);
  const candidates = (priorManaged || []).filter((entry) => {
    if (!entry || typeof entry.path !== 'string') return false;
    if (fresh.has(entry.path)) return false;
    if (!installed[teamOfPath(entry.path)]) return false;
    const tool = toolOfPath(entry.path);
    return tool !== null && renderedTools.has(tool);
  });

  if (candidates.length === 0) return { pruned: [], kept: [] };

  log.step('Pruning orphaned files (no longer in the roster)');

  const pruned = [];
  const kept = [];
  const dirs = new Set();

  for (const entry of candidates) {
    const rel = normalizeManagedRel(targetRoot, entry.path);
    if (!rel || !isManagedPathAllowed(rel)) {
      log.err(`  refused to prune ${entry.path} (not a LazySitter-managed path)`);
      process.exitCode = 1;
      continue;
    }
    const abs = path.join(targetRoot, rel);
    if (!isContained(targetRoot, abs)) {
      log.err(`  refused to prune ${entry.path} (escapes ${targetRoot})`);
      process.exitCode = 1;
      continue;
    }
    if (hasSymlinkSegment(targetRoot, rel)) {
      log.err(`  refused to prune ${entry.path} (path traverses a symlink/junction)`);
      process.exitCode = 1;
      continue;
    }
    const stat = safeStat(abs);
    if (!stat) continue;
    if (stat.isDirectory()) {
      log.err(`  refused to prune ${entry.path} (recorded as a file but is a directory on disk)`);
      process.exitCode = 1;
      continue;
    }
    if (!entry.sha256) {
      log.warn(`  kept ${entry.path} (orphaned, but no sha256 on record — cannot verify it is unmodified; remove by hand if no longer needed)`);
      kept.push(entry.path);
      continue;
    }
    let onDisk;
    try {
      onDisk = sha256(readFile(abs));
    } catch (err) {
      log.warn(`  kept ${entry.path} (orphaned, but could not read to verify: ${err.message})`);
      kept.push(entry.path);
      continue;
    }
    if (onDisk !== entry.sha256) {
      log.warn(`  kept ${entry.path} (orphaned, but locally modified — not deleted; remove by hand once you've confirmed you don't need the edits)`);
      kept.push(entry.path);
      continue;
    }
    try {
      fs.rmSync(abs);
    } catch (err) {
      log.err(`  failed to prune ${entry.path}: ${err.message}`);
      process.exitCode = 1;
      continue;
    }
    log.ok(`  pruned ${entry.path} (removed from the roster)`);
    pruned.push(entry.path);
    dirs.add(path.dirname(abs));
  }

  removeEmptyDirsUpward(dirs, targetRoot);

  if (kept.length) {
    log.warn(`  ${kept.length} orphaned file(s) left in place — see warnings above.`);
  }

  return { pruned, kept };
}

module.exports = { pruneOrphans, teamOfPath };
