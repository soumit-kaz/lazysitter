'use strict';

const fs = require('fs');
const path = require('path');

function realContainmentPath(p) {
  const target = path.resolve(p);
  try {
    return fs.realpathSync(target);
  } catch {}

  const tail = [];
  let dir = target;
  for (;;) {
    const parent = path.dirname(dir);
    if (parent === dir) return target;
    tail.unshift(path.basename(dir));
    try {
      return path.join(fs.realpathSync(parent), ...tail);
    } catch {
      dir = parent;
    }
  }
}

function isSegmentContained(rootReal, targetReal) {
  const rel = path.relative(rootReal, targetReal);
  if (rel === '') return true;
  if (path.isAbsolute(rel)) return false;
  return rel !== '..' && !rel.startsWith('..' + path.sep);
}

function isContained(targetRoot, abs) {
  const rootReal = realContainmentPath(targetRoot);
  const targetReal = realContainmentPath(abs);
  return isSegmentContained(rootReal, targetReal);
}

function assertContained(targetRoot, abs) {
  if (!isContained(targetRoot, abs)) {
    throw new Error(`Refusing to write outside target root: ${abs}`);
  }
}

function hasSymlinkSegment(root, rel) {
  const parts = rel.split('/').filter(Boolean);
  let cur = path.resolve(root);
  for (const part of parts) {
    cur = path.join(cur, part);
    let st;
    try {
      st = fs.lstatSync(cur);
    } catch {
      return false;
    }
    if (st.isSymbolicLink()) return true;
  }
  return false;
}

module.exports = { assertContained, isContained, realContainmentPath, hasSymlinkSegment };
