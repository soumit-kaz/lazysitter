'use strict';

const fs = require('fs');
const path = require('path');
const { ensureDir, exists, readFile, sha256, log, c } = require('./util');
const { assertContained } = require('./contain');

const LAZYSITTER_BEGIN = '<!-- LAZYSITTER:BEGIN';
const LAZYSITTER_END = 'LAZYSITTER:END -->';

function countOccurrences(haystack, needle) {
  let count = 0;
  let from = 0;
  for (;;) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) return count;
    count++;
    from = idx + needle.length;
  }
}

class InstallCtx {
  constructor(targetRoot, pkgRoot, opts, priorManifest) {
    this.targetRoot = targetRoot;
    this.pkgRoot = pkgRoot;
    this.opts = opts;
    this.coreDir = path.join(pkgRoot, 'core');
    this.templatesDir = path.join(pkgRoot, 'templates');
    this.manifest = { managed: [], preserve: [], agentsMd: null };
    this.priorAgentsMdCreatedByAet =
      priorManifest && priorManifest.agentsMd ? priorManifest.agentsMd.createdByAet : undefined;
  }

  abs(rel) {
    return path.join(this.targetRoot, rel);
  }

  write(rel, content, { exec = false } = {}) {
    const abs = this.abs(rel);
    assertContained(this.targetRoot, abs);
    ensureDir(path.dirname(abs));
    fs.writeFileSync(abs, content);
    if (exec) {
      try {
        fs.chmodSync(abs, 0o755);
      } catch {}
    }
    this.manifest.managed.push({ path: rel.replace(/\\/g, '/'), sha256: sha256(content) });
    log.ok(`  ${rel}`);
  }

  copy(srcAbs, rel, opts) {
    this.write(rel, readFile(srcAbs), opts);
  }

  writePreserve(rel, content) {
    const abs = this.abs(rel);
    assertContained(this.targetRoot, abs);
    this.manifest.preserve.push(rel.replace(/\\/g, '/'));
    if (exists(abs)) {
      log.info(`  ${c.dim(`${rel} (kept — your edits preserved)`)}`);
      return;
    }
    ensureDir(path.dirname(abs));
    fs.writeFileSync(abs, content);
    log.ok(`  ${rel}`);
  }

  mergeMarkedBlock(rel, block) {
    const abs = this.abs(rel);
    assertContained(this.targetRoot, abs);
    const existedBefore = exists(abs);
    let current = existedBefore ? readFile(abs) : '';

    const beginCount = countOccurrences(current, LAZYSITTER_BEGIN);
    const endCount = countOccurrences(current, LAZYSITTER_END);
    const beginIdx = current.indexOf(LAZYSITTER_BEGIN);
    const endIdx = current.indexOf(LAZYSITTER_END);

    if (beginCount === 0 && endCount === 0) {
      const sep = current && !current.endsWith('\n') ? '\n\n' : current ? '\n' : '';
      current = `${current}${sep}${block.trim()}\n`;
    } else if (beginCount === 1 && endCount === 1 && beginIdx !== -1 && endIdx > beginIdx) {
      const before = current.slice(0, beginIdx);
      const after = current.slice(endIdx + LAZYSITTER_END.length);
      current = `${before}${block.trim()}${after}`;
    } else {
      throw new Error(
        `Refusing to modify ${rel}: found ${beginCount} "${LAZYSITTER_BEGIN}" marker(s) and ` +
          `${endCount} "${LAZYSITTER_END}" marker(s), not a single well-formed pair LazySitter wrote. ` +
          `Resolve the markers in ${rel} by hand (or remove the file) and re-run — nothing was written.`
      );
    }
    ensureDir(path.dirname(abs));
    fs.writeFileSync(abs, current);
    const createdByAet =
      this.priorAgentsMdCreatedByAet !== undefined ? this.priorAgentsMdCreatedByAet : !existedBefore;
    this.manifest.agentsMd = { path: rel.replace(/\\/g, '/'), createdByAet };
    log.ok(`  ${rel} ${existedBefore ? '(LazySitter block merged)' : '(created)'}`);
  }

  writeManifest(version, tools) {
    const manifestRel = '.lazysitter/manifest.json';
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

module.exports = { InstallCtx, LAZYSITTER_BEGIN, LAZYSITTER_END, assertContained };
