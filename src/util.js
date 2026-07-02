'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);

const c = {
  dim: (s) => paint('2', s),
  bold: (s) => paint('1', s),
  red: (s) => paint('31', s),
  green: (s) => paint('32', s),
  yellow: (s) => paint('33', s),
  cyan: (s) => paint('36', s),
};

const log = {
  info: (m) => console.log(m),
  step: (m) => console.log(`${c.cyan('•')} ${m}`),
  ok: (m) => console.log(`${c.green('✓')} ${m}`),
  warn: (m) => console.warn(`${c.yellow('!')} ${m}`),
  err: (m) => console.error(`${c.red('✗')} ${m}`),
  plain: (m) => console.log(m),
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function readFile(p) {
  return fs.readFileSync(p, 'utf8');
}

function writeFile(p, content) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, content);
}

function copyInto(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function listFiles(dir, filterExt) {
  if (!exists(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => (filterExt ? f.endsWith(filterExt) : true))
    .sort();
}

// Walk upward from `start` looking for a directory containing `.git`.
// Returns that directory, or null if none found before the filesystem root.
function findGitRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (exists(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

module.exports = {
  c,
  log,
  ensureDir,
  exists,
  readFile,
  writeFile,
  copyInto,
  sha256,
  listFiles,
  findGitRoot,
};
