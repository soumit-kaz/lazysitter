'use strict';

// STORE — durable, git-friendly persistence for Program Mode state
// (docs/PROGRAM-MODE.md §12: state on disk is the truth; sessions are disposable).
//
// Two write disciplines:
//   • the plan is a single JSON doc → atomic write (temp + rename) so a crash mid-write
//     never leaves a half-parsed PROGRAM-PLAN.json.
//   • high-write, multi-writer logs (gate-state, decisions, events) are append-only
//     JSONL → concurrent sessions can append without clobbering each other.
// Git itself is the atomic coordination substrate; this module just lays state out so
// commits are clean and diffs are legible.

const fs = require('fs');
const path = require('path');

const PLAN_FILE = 'PROGRAM-PLAN.json';
const GATE_STATE = 'gate-state.jsonl';
const DECISIONS = 'DECISION-QUEUE.jsonl';
const MEMORY_HOT = path.join('memory', 'hot.json');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function programDir(root) {
  return path.join(root, 'program');
}

function loadPlan(root) {
  const p = path.join(programDir(root), PLAN_FILE);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function savePlan(root, plan) {
  const dir = programDir(root);
  ensureDir(dir);
  const target = path.join(dir, PLAN_FILE);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(plan, null, 2) + '\n');
  fs.renameSync(tmp, target); // atomic on POSIX and Windows same-volume
}

function appendJsonl(root, file, obj) {
  const dir = programDir(root);
  ensureDir(dir);
  fs.appendFileSync(path.join(dir, file), JSON.stringify(obj) + '\n');
}

function readJsonl(root, file) {
  const p = path.join(programDir(root), file);
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function loadMemory(root) {
  const p = path.join(programDir(root), MEMORY_HOT);
  if (!fs.existsSync(p)) return { lessons: [] };
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function saveMemory(root, store) {
  const dir = path.join(programDir(root), 'memory');
  ensureDir(dir);
  const target = path.join(programDir(root), MEMORY_HOT);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2) + '\n');
  fs.renameSync(tmp, target);
}

module.exports = {
  PLAN_FILE,
  GATE_STATE,
  DECISIONS,
  programDir,
  loadPlan,
  savePlan,
  appendJsonl,
  readJsonl,
  loadMemory,
  saveMemory,
};
