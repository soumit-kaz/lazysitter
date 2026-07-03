'use strict';

const fs = require('fs');
const path = require('path');
const { ensureDir, exists, readFile, sha256, log, c } = require('./util');

const PROVENFORGE_BEGIN = '<!-- PROVENFORGE:BEGIN';
const PROVENFORGE_END = 'PROVENFORGE:END -->';

// Shared install context passed to each adapter. Owns file writing, the
// preserve-vs-managed distinction, AGENTS.md block merging, and manifest tracking.
class InstallCtx {
  constructor(targetRoot, pkgRoot, opts) {
    this.targetRoot = targetRoot;
    this.pkgRoot = pkgRoot;
    this.opts = opts;
    this.coreDir = path.join(pkgRoot, 'core');
    this.templatesDir = path.join(pkgRoot, 'templates');
    this.manifest = { managed: [], preserve: [], agentsMd: null };
  }

  abs(rel) {
    return path.join(this.targetRoot, rel);
  }

  // Write a file Provenforge fully owns (overwritten on update, removed on uninstall).
  write(rel, content, { exec = false } = {}) {
    const abs = this.abs(rel);
    ensureDir(path.dirname(abs));
    fs.writeFileSync(abs, content);
    if (exec) {
      try {
        fs.chmodSync(abs, 0o755);
      } catch {
        /* windows: no-op */
      }
    }
    this.manifest.managed.push({ path: rel.replace(/\\/g, '/'), sha256: sha256(content) });
    log.ok(`  ${rel}`);
  }

  // Copy a package file verbatim as a managed file.
  copy(srcAbs, rel, opts) {
    this.write(rel, readFile(srcAbs), opts);
  }

  // Write a user-editable file only if it does not already exist (never clobbers edits).
  writePreserve(rel, content) {
    const abs = this.abs(rel);
    this.manifest.preserve.push(rel.replace(/\\/g, '/'));
    if (exists(abs)) {
      log.info(`  ${c.dim(`${rel} (kept — your edits preserved)`)}`);
      return;
    }
    ensureDir(path.dirname(abs));
    fs.writeFileSync(abs, content);
    log.ok(`  ${rel}`);
  }

  // Insert or replace the Provenforge block inside a doc file (AGENTS.md), preserving the rest.
  mergeMarkedBlock(rel, block) {
    const abs = this.abs(rel);
    const existedBefore = exists(abs);
    let current = existedBefore ? readFile(abs) : '';

    const beginIdx = current.indexOf(PROVENFORGE_BEGIN);
    const endIdx = current.indexOf(PROVENFORGE_END);
    if (beginIdx !== -1 && endIdx !== -1) {
      const before = current.slice(0, beginIdx);
      const after = current.slice(endIdx + PROVENFORGE_END.length);
      current = `${before}${block.trim()}${after}`;
    } else {
      const sep = current && !current.endsWith('\n') ? '\n\n' : current ? '\n' : '';
      current = `${current}${sep}${block.trim()}\n`;
    }
    ensureDir(path.dirname(abs));
    fs.writeFileSync(abs, current);
    this.manifest.agentsMd = { path: rel.replace(/\\/g, '/'), createdByAet: !existedBefore };
    log.ok(`  ${rel} ${existedBefore ? '(Provenforge block merged)' : '(created)'}`);
  }

  writeManifest(version, tools) {
    const manifestRel = '.provenforge/manifest.json';
    const data = {
      aetVersion: version,
      installedAt: this.opts.now || new Date().toISOString(),
      tools,
      managed: this.manifest.managed,
      preserve: this.manifest.preserve,
      agentsMd: this.manifest.agentsMd,
    };
    const abs = this.abs(manifestRel);
    ensureDir(path.dirname(abs));
    fs.writeFileSync(abs, JSON.stringify(data, null, 2) + '\n');
    log.ok(`  ${manifestRel}`);
  }
}

module.exports = { InstallCtx, PROVENFORGE_BEGIN, PROVENFORGE_END };
