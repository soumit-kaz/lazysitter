'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SOURCE_EXT = new Set(['.tsx', '.jsx', '.ts', '.js', '.mjs', '.cjs', '.mts', '.cts']);
const STYLE_EXT = new Set(['.css', '.scss', '.sass', '.less']);

const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out', 'coverage',
  '.next', '.nuxt', '.svelte-kit', '.turbo', '.cache', '.parcel-cache', '.vercel',
  'vendor', '__snapshots__', '.yarn', '.pnpm-store', 'storybook-static', '.astro',
  '.claude', '.codex', '.cursor', '.lazysitter',
]);

// Source files are read whole; anything past this is recorded as a disclosed
// skip rather than pulled into memory. A 4 MB single-file React component does
// not exist in practice — a match here means a generated bundle or a vendored
// blob, and indexing it would poison the precedent sets anyway.
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;

function sha1(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

// Explicit decode: read as a Buffer, strip a UTF-8 BOM if present, decode UTF-8.
// Never relies on an assumed platform default encoding, and reports the BOM back
// so a writer downstream can preserve it.
function readSource(abs) {
  const buf = fs.readFileSync(abs);
  const bom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const body = bom ? buf.subarray(3) : buf;
  const text = body.toString('utf8');
  const crlf = /\r\n/.test(text);
  return { text: crlf ? text.replace(/\r\n/g, '\n') : text, bom, eol: crlf ? 'crlf' : 'lf', bytes: buf.length, sha1: sha1(buf) };
}

function loadIgnoreExtras(root) {
  const extra = new Set();
  const gi = path.join(root, '.gitignore');
  if (!fs.existsSync(gi)) return extra;
  try {
    for (const line of fs.readFileSync(gi, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#') || t.startsWith('!')) continue;
      // Only whole-directory ignores are honoured; glob semantics are
      // deliberately out of scope — an over-broad pattern must never silently
      // shrink the index. Anything not matched here is still walked.
      const clean = t.replace(/^\/+/, '').replace(/\/+$/, '');
      if (clean && !clean.includes('*') && !clean.includes('/') && !clean.includes('.')) extra.add(clean);
    }
  } catch {}
  return extra;
}

function walk(root, opts = {}) {
  const ignoreDirs = new Set([...DEFAULT_IGNORE_DIRS, ...loadIgnoreExtras(root), ...(opts.ignore || [])]);
  const roots = opts.roots && opts.roots.length ? opts.roots.map((r) => path.join(root, r)) : [root];
  const files = [];
  const styles = [];
  const skipped = [];
  const seen = new Set();

  const visit = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      skipped.push({ path: path.relative(root, dir).replace(/\\/g, '/'), reason: `unreadable: ${err.code || err.message}` });
      return;
    }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isSymbolicLink()) {
        skipped.push({ path: path.relative(root, abs).replace(/\\/g, '/'), reason: 'symlink (not followed)' });
        continue;
      }
      if (e.isDirectory()) {
        if (ignoreDirs.has(e.name)) continue;
        visit(abs);
        continue;
      }
      if (!e.isFile()) continue;
      const ext = path.extname(e.name);
      const rel = path.relative(root, abs).replace(/\\/g, '/');
      if (seen.has(rel)) continue;
      if (STYLE_EXT.has(ext)) {
        seen.add(rel);
        styles.push(rel);
        continue;
      }
      if (!SOURCE_EXT.has(ext)) continue;
      if (e.name.endsWith('.d.ts')) continue;
      let stat;
      try {
        stat = fs.statSync(abs);
      } catch {
        continue;
      }
      if (stat.size > MAX_SOURCE_BYTES) {
        skipped.push({ path: rel, reason: `${stat.size} bytes > ${MAX_SOURCE_BYTES} cap` });
        continue;
      }
      seen.add(rel);
      files.push({ rel, abs, size: stat.size, mtimeMs: stat.mtimeMs });
    }
  };

  for (const r of roots) if (fs.existsSync(r)) visit(r);
  files.sort((a, b) => (a.rel < b.rel ? -1 : 1));
  styles.sort();
  return { files, styles, skipped };
}

function classifyFile(rel) {
  const lower = rel.toLowerCase();
  if (/\.(test|spec)\.[jt]sx?$/.test(lower)) return 'test';
  if (/\.stories\.[jt]sx?$/.test(lower)) return 'story';
  if (/(^|\/)(__tests__|__mocks__|e2e|cypress|playwright)\//.test(lower)) return 'test';
  if (/(^|\/)(app|pages)\//.test(lower)) return 'route';
  if (/\.config\.[jt]s$/.test(lower) || /(^|\/)(next|vite|webpack|rollup|tailwind|postcss)\.config\./.test(lower)) return 'config';
  return 'source';
}

module.exports = { walk, readSource, classifyFile, sha1, SOURCE_EXT, STYLE_EXT, MAX_SOURCE_BYTES, DEFAULT_IGNORE_DIRS };
