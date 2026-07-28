'use strict';

const path = require('path');
const { exists, readFile, log, c } = require('./util');

const MAX_PATTERN_LENGTH = 512;

function tokenizePattern(pattern) {
  const tokens = [];
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*' && pattern[i + 1] === '*') {
      tokens.push({ t: 'globstar' });
      i++;
      if (pattern[i + 1] === '/') i++;
    } else if (ch === '*') {
      tokens.push({ t: 'star' });
    } else if (ch === '?') {
      tokens.push({ t: 'any' });
    } else {
      tokens.push({ t: 'lit', c: ch });
    }
  }
  return tokens;
}

function matchTokens(tokens, str, anchored) {
  const n = str.length;
  let dp = new Array(n + 1).fill(false);
  if (anchored) {
    dp[0] = true;
  } else {
    for (let i = 0; i <= n; i++) {
      if (i === 0 || str[i - 1] === '/') dp[i] = true;
    }
  }

  for (const tok of tokens) {
    const next = new Array(n + 1).fill(false);
    if (tok.t === 'lit') {
      for (let i = 0; i < n; i++) {
        if (dp[i] && str[i] === tok.c) next[i + 1] = true;
      }
    } else if (tok.t === 'any') {
      for (let i = 0; i < n; i++) {
        if (dp[i] && str[i] !== '/') next[i + 1] = true;
      }
    } else if (tok.t === 'star') {
      let active = false;
      for (let i = 0; i <= n; i++) {
        if (dp[i]) active = true;
        next[i] = active;
        if (i < n && str[i] === '/') active = false;
      }
    } else if (tok.t === 'globstar') {
      let active = false;
      for (let i = 0; i <= n; i++) {
        if (dp[i]) active = true;
        next[i] = active;
      }
    }
    dp = next;
    if (!dp.some(Boolean)) return false;
  }

  for (let i = 0; i <= n; i++) {
    if (dp[i] && (i === n || str[i] === '/')) return true;
  }
  return false;
}

function parseGitignoreLine(line) {
  let pattern = line;
  let negate = false;
  if (pattern.startsWith('!')) {
    negate = true;
    pattern = pattern.slice(1);
  }
  pattern = pattern.replace(/\\ /g, ' ');
  if (pattern.endsWith('/')) {
    pattern = pattern.slice(0, -1);
  }
  let anchored = pattern.startsWith('/');
  if (anchored) pattern = pattern.slice(1);
  if (!anchored && pattern.includes('/')) anchored = true;

  if (pattern.length > MAX_PATTERN_LENGTH) return null;

  return { tokens: tokenizePattern(pattern), anchored, negate };
}

function loadRulesFromDir(dir, baseRel) {
  const gi = path.join(dir, '.gitignore');
  if (!exists(gi)) return [];
  return readFile(gi)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'))
    .map((line) => ({ baseRel, rule: parseGitignoreLine(line) }))
    .filter((entry) => entry.rule !== null)
    .map((entry) => ({ baseRel: entry.baseRel, ...entry.rule }));
}

function isPathIgnored(repoRoot, relPath) {
  const normalized = relPath.split(path.sep).join('/');
  const segments = normalized.split('/');

  const dirsToScan = [repoRoot];
  let cur = repoRoot;
  for (let i = 0; i < segments.length - 1; i++) {
    cur = path.join(cur, segments[i]);
    dirsToScan.push(cur);
  }

  const rules = [];
  for (const dir of dirsToScan) {
    const baseRel = path.relative(repoRoot, dir).split(path.sep).filter(Boolean).join('/');
    for (const rule of loadRulesFromDir(dir, baseRel)) {
      rules.push(rule);
    }
  }

  let ignored = false;
  for (const rule of rules) {
    if (rule.baseRel && !normalized.startsWith(rule.baseRel + '/')) continue;
    const testPath = rule.baseRel ? normalized.slice(rule.baseRel.length + 1) : normalized;
    if (matchTokens(rule.tokens, testPath, rule.anchored)) {
      ignored = !rule.negate;
    }
  }
  return ignored;
}

function warnIfKnowledgeGitignored(targetRoot) {
  const candidates = ['.lazysitter', '.lazysitter/knowledge'];
  const ignored = candidates.filter((rel) => isPathIgnored(targetRoot, rel));
  if (!ignored.length) return;
  log.warn(
    `  ${ignored.join(', ')} ${ignored.length > 1 ? 'are' : 'is'} gitignored — committed knowledge in .lazysitter/knowledge/ will not be tracked.`
  );
  log.info(
    `    ${c.dim('Remove the ignore rule (or add a negation for .lazysitter/knowledge/) so curated institutional memory survives in git.')}`
  );
}

module.exports = { isPathIgnored, warnIfKnowledgeGitignored };
