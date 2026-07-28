'use strict';

const fs = require('fs');
const path = require('path');
const { log, c, exists, readFile, readFileCapped, sha256 } = require('./util');
const { LAZYSITTER_BEGIN, LAZYSITTER_END } = require('./context');
const { isContained, hasSymlinkSegment } = require('./contain');

const MANAGED_PREFIXES = ['.claude/', '.codex/', '.cursor/', '.lazysitter/'];

function normalizeManagedRel(targetRoot, rawRel) {
  if (typeof rawRel !== 'string' || rawRel === '') return null;
  const resolved = path.resolve(targetRoot, rawRel);
  const rel = path.relative(targetRoot, resolved);
  if (rel === '' || path.isAbsolute(rel) || rel === '..' || rel.startsWith('..' + path.sep)) {
    return null;
  }
  return rel.split(path.sep).join('/');
}

function isManagedPathAllowed(rel) {
  return MANAGED_PREFIXES.some((prefix) => rel.startsWith(prefix));
}

function safeStat(abs) {
  try {
    return fs.statSync(abs);
  } catch {
    return null;
  }
}

function removeManagedFile(targetRoot, entry, opts) {
  const rel = normalizeManagedRel(targetRoot, entry.path);
  if (!rel || !isManagedPathAllowed(rel)) {
    log.err(`  refused to remove ${entry.path} (not a LazySitter-managed path)`);
    process.exitCode = 1;
    return { removed: false, dir: null, refused: true };
  }
  const abs = path.join(targetRoot, rel);
  if (!isContained(targetRoot, abs)) {
    log.err(`  refused to remove ${entry.path} (escapes ${targetRoot})`);
    process.exitCode = 1;
    return { removed: false, dir: null, refused: true };
  }
  if (hasSymlinkSegment(targetRoot, rel)) {
    log.err(`  refused to remove ${entry.path} (path traverses a symlink/junction)`);
    process.exitCode = 1;
    return { removed: false, dir: null, refused: true };
  }
  const stat = safeStat(abs);
  if (!stat) return { removed: false, dir: null, refused: false };
  if (stat.isDirectory()) {
    log.err(`  refused to remove ${entry.path} (recorded as a file but is a directory on disk)`);
    process.exitCode = 1;
    return { removed: false, dir: null, refused: true };
  }
  if (!entry.sha256) {
    if (!opts.forceUnverified) {
      log.err(
        `  refused to remove ${entry.path} (no sha256 recorded in manifest — refusing to remove without integrity verification; re-run with --force-unverified to remove anyway)`
      );
      process.exitCode = 1;
      return { removed: false, dir: null, refused: true };
    }
    try {
      fs.rmSync(abs);
    } catch (err) {
      log.err(`  failed to remove ${entry.path}: ${err.message}`);
      process.exitCode = 1;
      return { removed: false, dir: null, refused: true };
    }
    log.ok(`  removed ${entry.path} (no sha256 on record — forced via --force-unverified)`);
    return { removed: true, dir: path.dirname(abs), refused: false };
  }
  let onDisk;
  try {
    onDisk = sha256(readFile(abs));
  } catch (err) {
    log.err(`  refused to remove ${entry.path} (could not read to verify: ${err.message})`);
    process.exitCode = 1;
    return { removed: false, dir: null, refused: true };
  }
  if (onDisk !== entry.sha256) {
    log.err(`  refused to remove ${entry.path} (locally modified — run \`lazysitter doctor\` to inspect, or delete it by hand)`);
    process.exitCode = 1;
    return { removed: false, dir: null, refused: true };
  }
  try {
    fs.rmSync(abs);
  } catch (err) {
    log.err(`  failed to remove ${entry.path}: ${err.message}`);
    process.exitCode = 1;
    return { removed: false, dir: null, refused: true };
  }
  log.ok(`  removed ${entry.path}`);
  return { removed: true, dir: path.dirname(abs), refused: false };
}

function uninstall(pkgRoot, opts) {
  const targetRoot = path.resolve(opts.dir || process.cwd());
  const manifestPath = path.join(targetRoot, '.lazysitter', 'manifest.json');
  if (!exists(manifestPath)) {
    log.err(`No LazySitter install found in ${targetRoot} (missing .lazysitter/manifest.json).`);
    process.exitCode = 1;
    return;
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileCapped(manifestPath));
  } catch (err) {
    log.err(`Could not parse ${manifestPath}: ${err.message}`);
    log.err('Fix the manifest by hand, or remove .lazysitter/, .claude/, .codex/, and .cursor/ by hand and reinstall.');
    process.exitCode = 1;
    return;
  }

  log.info('');
  log.info(`${c.bold('Removing LazySitter')} from ${c.bold(targetRoot)}`);
  log.info('');

  let refusedCount = 0;
  const dirs = new Set();
  for (const entry of manifest.managed || []) {
    const { removed, dir, refused } = removeManagedFile(targetRoot, entry, opts);
    if (removed) dirs.add(dir);
    if (refused) refusedCount++;
  }

  const KNOWLEDGE_PREFIX = '.lazysitter/knowledge/';

  if (opts.purge) {
    const retainedKnowledge = [];
    for (const rel of manifest.preserve || []) {
      if (rel.toLowerCase().startsWith(KNOWLEDGE_PREFIX.toLowerCase()) && !opts.purgeKnowledge) {
        retainedKnowledge.push(rel);
        continue;
      }
      const normalizedRel = normalizeManagedRel(targetRoot, rel);
      if (!normalizedRel || !isManagedPathAllowed(normalizedRel)) {
        log.err(`  refused to remove ${rel} (not a LazySitter-managed path)`);
        process.exitCode = 1;
        refusedCount++;
        continue;
      }
      const abs = path.join(targetRoot, normalizedRel);
      if (!isContained(targetRoot, abs)) {
        log.err(`  refused to remove ${rel} (escapes ${targetRoot})`);
        process.exitCode = 1;
        refusedCount++;
        continue;
      }
      if (hasSymlinkSegment(targetRoot, normalizedRel)) {
        log.err(`  refused to remove ${rel} (path traverses a symlink/junction)`);
        process.exitCode = 1;
        refusedCount++;
        continue;
      }
      const stat = safeStat(abs);
      if (!stat) continue;
      if (stat.isDirectory()) {
        log.err(`  refused to remove ${rel} (recorded as a file but is a directory on disk)`);
        process.exitCode = 1;
        refusedCount++;
        continue;
      }
      try {
        fs.rmSync(abs);
      } catch (err) {
        log.err(`  failed to remove ${rel}: ${err.message}`);
        process.exitCode = 1;
        refusedCount++;
        continue;
      }
      log.ok(`  removed ${rel} (purged config)`);
      dirs.add(path.dirname(abs));
    }
    if (retainedKnowledge.length) {
      log.info(`  ${c.dim('kept committed knowledge: ' + retainedKnowledge.join(', '))}`);
      log.info(`  ${c.dim('use --purge --purge-knowledge to remove it too')}`);
    }
  } else if ((manifest.preserve || []).length) {
    log.info(`  ${c.dim('kept your config: ' + manifest.preserve.join(', '))}`);
    log.info(`  ${c.dim('use --purge to remove it too')}`);
  }

  if (manifest.agentsMd) {
    const { refused } = stripAgentsMd(targetRoot, manifest.agentsMd);
    if (refused) refusedCount++;
  }

  if (refusedCount > 0) {
    log.info('');
    log.err(
      `  ${refusedCount} entr${refusedCount === 1 ? 'y was' : 'ies were'} refused — .lazysitter/manifest.json was NOT removed so uninstall can be re-run.`
    );
    log.err('  Resolve the entries above, then re-run `lazysitter uninstall`:');
    log.err('    - locally modified managed files: restore them or delete them by hand, or run `lazysitter doctor` to inspect.');
    log.err('    - entries with no recorded sha256 (a manifest from before that field existed): re-run with --force-unverified to remove them without an integrity check.');
    log.info('');
    process.exitCode = 1;
    return;
  }

  try {
    fs.rmSync(manifestPath);
  } catch (err) {
    log.err(`  failed to remove .lazysitter/manifest.json: ${err.message}`);
    process.exitCode = 1;
    return;
  }
  dirs.add(path.dirname(manifestPath));
  removeEmptyDirsUpward(dirs, targetRoot);

  log.info('');
  log.ok(`${c.bold('LazySitter removed.')}`);
  log.info('');
}

function stripAgentsMd(targetRoot, info) {
  if (info.path !== 'AGENTS.md') {
    log.err(`  refused to touch ${info.path} (agentsMd.path must be AGENTS.md)`);
    process.exitCode = 1;
    return { refused: true };
  }
  const abs = path.join(targetRoot, info.path);
  if (!isContained(targetRoot, abs)) {
    log.err(`  refused to touch ${info.path} (escapes ${targetRoot})`);
    process.exitCode = 1;
    return { refused: true };
  }
  if (hasSymlinkSegment(targetRoot, info.path)) {
    log.err(`  refused to touch ${info.path} (path traverses a symlink/junction)`);
    process.exitCode = 1;
    return { refused: true };
  }
  if (!exists(abs)) return { refused: false };
  const stat = safeStat(abs);
  if (stat && stat.isDirectory()) {
    log.err(`  refused to touch ${info.path} (recorded as a file but is a directory on disk)`);
    process.exitCode = 1;
    return { refused: true };
  }
  const text = readFile(abs);
  const b = text.indexOf(LAZYSITTER_BEGIN);
  const e = text.indexOf(LAZYSITTER_END);
  if (b === -1 || e === -1 || e <= b) {
    return { refused: false };
  }
  const stripped = (text.slice(0, b) + text.slice(e + LAZYSITTER_END.length)).replace(/\n{3,}/g, '\n\n').trimStart();
  if (info.createdByAet && stripped.trim() === '') {
    fs.rmSync(abs);
    log.ok(`  removed ${info.path}`);
  } else {
    fs.writeFileSync(abs, stripped.endsWith('\n') ? stripped : stripped + '\n');
    log.ok(`  stripped LazySitter block from ${info.path}`);
  }
  return { refused: false };
}

function removeEmptyDirsUpward(dirSet, stopAt) {
  const sorted = [...dirSet].sort((a, b) => b.length - a.length);
  for (let dir of sorted) {
    while (isContained(stopAt, dir) && dir !== stopAt) {
      try {
        if (fs.readdirSync(dir).length === 0) {
          fs.rmdirSync(dir);
          dir = path.dirname(dir);
        } else break;
      } catch {
        break;
      }
    }
  }
}

module.exports = { uninstall };
