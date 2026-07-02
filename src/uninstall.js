'use strict';

const fs = require('fs');
const path = require('path');
const { log, c, exists, readFile } = require('./util');
const { AET_BEGIN, AET_END } = require('./context');

function uninstall(pkgRoot, opts) {
  const targetRoot = path.resolve(opts.dir || process.cwd());
  const manifestPath = path.join(targetRoot, '.aet', 'manifest.json');
  if (!exists(manifestPath)) {
    log.err(`No AET install found in ${targetRoot} (missing .aet/manifest.json).`);
    process.exitCode = 1;
    return;
  }
  const manifest = JSON.parse(readFile(manifestPath));

  log.info('');
  log.info(`${c.bold('Removing AET')} from ${c.bold(targetRoot)}`);
  log.info('');

  const dirs = new Set();
  for (const entry of manifest.managed || []) {
    const abs = path.join(targetRoot, entry.path);
    if (exists(abs)) {
      fs.rmSync(abs);
      log.ok(`  removed ${entry.path}`);
      dirs.add(path.dirname(abs));
    }
  }

  if (opts.purge) {
    for (const rel of manifest.preserve || []) {
      const abs = path.join(targetRoot, rel);
      if (exists(abs)) {
        fs.rmSync(abs);
        log.ok(`  removed ${rel} (purged config)`);
        dirs.add(path.dirname(abs));
      }
    }
  } else if ((manifest.preserve || []).length) {
    log.info(`  ${c.dim('kept your config: ' + manifest.preserve.join(', '))}`);
    log.info(`  ${c.dim('use --purge to remove it too')}`);
  }

  if (manifest.agentsMd) stripAgentsMd(targetRoot, manifest.agentsMd);

  // Remove the manifest and any now-empty AET directories.
  fs.rmSync(manifestPath);
  dirs.add(path.dirname(manifestPath));
  removeEmptyDirsUpward(dirs, targetRoot);

  log.info('');
  log.ok(`${c.bold('AET removed.')}`);
  log.info('');
}

function stripAgentsMd(targetRoot, info) {
  const abs = path.join(targetRoot, info.path);
  if (!exists(abs)) return;
  let text = readFile(abs);
  const b = text.indexOf(AET_BEGIN);
  const e = text.indexOf(AET_END);
  if (b !== -1 && e !== -1) {
    text = (text.slice(0, b) + text.slice(e + AET_END.length)).replace(/\n{3,}/g, '\n\n').trimStart();
  }
  if (info.createdByAet && text.trim() === '') {
    fs.rmSync(abs);
    log.ok(`  removed ${info.path}`);
  } else {
    fs.writeFileSync(abs, text.endsWith('\n') ? text : text + '\n');
    log.ok(`  stripped AET block from ${info.path}`);
  }
}

function removeEmptyDirsUpward(dirSet, stopAt) {
  const sorted = [...dirSet].sort((a, b) => b.length - a.length);
  for (let dir of sorted) {
    while (dir.startsWith(stopAt) && dir !== stopAt) {
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
