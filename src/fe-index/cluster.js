'use strict';

const crypto = require('crypto');
const { mask } = require('./lex');

const STOP_TOKENS = new Set([
  'component', 'container', 'wrapper', 'view', 'page', 'screen', 'item', 'list',
  'new', 'base', 'common', 'shared', 'ui', 'index', 'default',
]);

const JS_KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do',
  'switch', 'case', 'break', 'continue', 'new', 'typeof', 'instanceof', 'in', 'of',
  'this', 'null', 'undefined', 'true', 'false', 'async', 'await', 'try', 'catch',
  'finally', 'throw', 'class', 'extends', 'super', 'import', 'export', 'from',
  'default', 'yield', 'delete', 'void',
]);

function nameTokens(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t && !STOP_TOKENS.has(t));
}

function jaccard(a, b) {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

// Identifiers collapse to `#` so renamed copy-paste still matches; keywords,
// punctuation and literal kinds are preserved so different logic diverges.
function normalizedTokens(src) {
  const { masked } = mask(src);
  const out = [];
  const re = /([A-Za-z_$][\w$]*)|(\d+(?:\.\d+)?)|(["'`])|([{}()[\];,.:?!<>=+\-*/%&|^~])/g;
  let m;
  while ((m = re.exec(masked))) {
    if (m[1]) out.push(JS_KEYWORDS.has(m[1]) ? m[1] : '#');
    else if (m[2]) out.push('0');
    else if (m[3]) out.push('"');
    else out.push(m[4]);
  }
  return out;
}

function shingles(tokens, k = 5) {
  const set = new Set();
  for (let i = 0; i + k <= tokens.length; i++) {
    set.add(crypto.createHash('sha1').update(tokens.slice(i, i + k).join(' ')).digest('hex').slice(0, 12));
  }
  return set;
}

function componentSignature(entity) {
  return {
    name: new Set(nameTokens(entity.name)),
    props: new Set((entity.props || []).map((p) => p.name)),
    hosts: new Set(entity.hostTags || []),
    hooks: new Set(entity.hooks || []),
    renders: new Set(entity.renders || []),
  };
}

function componentSimilarity(a, b) {
  const props = jaccard(a.props, b.props);
  const hosts = jaccard(a.hosts, b.hosts);
  const name = jaccard(a.name, b.name);
  const renders = jaccard(a.renders, b.renders);
  const hooks = jaccard(a.hooks, b.hooks);
  // Prop surface dominates: two components with the same prop contract are
  // interchangeable to a caller regardless of what they render internally.
  const weighted = 0.5 * props + 0.2 * hosts + 0.12 * name + 0.1 * renders + 0.08 * hooks;
  // Name is the smallest term on purpose: the duplicates worth finding are the
  // ones nobody named alike, so a shared prop contract alone must cluster them.
  if (props >= 0.75 && a.props.size >= 3 && b.props.size >= 3) return Math.max(weighted, 0.8);
  return weighted;
}

class UnionFind {
  constructor(n) {
    this.p = Array.from({ length: n }, (_, i) => i);
  }
  find(x) {
    while (this.p[x] !== x) {
      this.p[x] = this.p[this.p[x]];
      x = this.p[x];
    }
    return x;
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.p[rb] = ra;
  }
}

// Blocking keeps this out of O(n²) over every component in the repo.
function buildBlocks(entities, sigs) {
  const blocks = new Map();
  entities.forEach((e, i) => {
    const keys = new Set([...sigs[i].name, ...[...sigs[i].props].map((p) => `p:${p}`)]);
    for (const k of keys) {
      if (!blocks.has(k)) blocks.set(k, []);
      blocks.get(k).push(i);
    }
  });
  return blocks;
}

function clusterComponents(entities, threshold = 0.55, dropped) {
  const sigs = entities.map(componentSignature);
  const uf = new UnionFind(entities.length);
  const blocks = buildBlocks(entities, sigs);
  const compared = new Set();
  const pairs = [];

  for (const [key, idxs] of blocks.entries()) {
    // A pathological block (every component has `className`) would make this
    // quadratic. Skipping it is correct, but a SILENT skip is a coverage lie —
    // it is recorded so the index can disclose exactly what it did not compare.
    if (idxs.length > 400) {
      if (dropped) dropped.push({ kind: 'component', block: key, size: idxs.length });
      continue;
    }
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        const i = idxs[a];
        const j = idxs[b];
        const key = i < j ? `${i}:${j}` : `${j}:${i}`;
        if (compared.has(key)) continue;
        compared.add(key);
        const score = componentSimilarity(sigs[i], sigs[j]);
        if (score >= threshold) {
          uf.union(i, j);
          pairs.push({ a: entities[i].id, b: entities[j].id, score: +score.toFixed(3) });
        }
      }
    }
  }

  return finalize(entities, uf, pairs);
}

function clusterBodies(entities, threshold = 0.62, dropped) {
  const sets = entities.map((e) => shingles(normalizedTokens(e.source || '')));
  const uf = new UnionFind(entities.length);
  const pairs = [];
  const byToken = new Map();
  entities.forEach((e, i) => {
    for (const t of nameTokens(e.name)) {
      if (!byToken.has(t)) byToken.set(t, []);
      byToken.get(t).push(i);
    }
    // Arity is a cheap second blocking key so identically-shaped helpers with
    // unrelated names still meet.
    const ak = `arity:${e.arity || 0}`;
    if (!byToken.has(ak)) byToken.set(ak, []);
    byToken.get(ak).push(i);
  });

  const compared = new Set();
  for (const [key, idxs] of byToken.entries()) {
    if (idxs.length > 400) {
      if (dropped) dropped.push({ kind: 'body', block: key, size: idxs.length });
      continue;
    }
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        const i = idxs[a];
        const j = idxs[b];
        const key = i < j ? `${i}:${j}` : `${j}:${i}`;
        if (compared.has(key)) continue;
        compared.add(key);
        if (sets[i].size < 3 || sets[j].size < 3) continue;
        const score = jaccard(sets[i], sets[j]);
        if (score >= threshold) {
          uf.union(i, j);
          pairs.push({ a: entities[i].id, b: entities[j].id, score: +score.toFixed(3) });
        }
      }
    }
  }
  return finalize(entities, uf, pairs);
}

function finalize(entities, uf, pairs) {
  const groups = new Map();
  entities.forEach((e, i) => {
    const root = uf.find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(e);
  });

  const clusters = [];
  let n = 0;
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    // Dominance first, recency second; a deprecated member never takes rank 1.
    const ranked = members.slice().sort((x, y) => {
      if (!!x.deprecated !== !!y.deprecated) return x.deprecated ? 1 : -1;
      if ((y.usageCount || 0) !== (x.usageCount || 0)) return (y.usageCount || 0) - (x.usageCount || 0);
      return (y.mtimeMs || 0) - (x.mtimeMs || 0);
    });
    const id = `C${++n}`;
    for (const mem of ranked) mem.cluster = id;
    clusters.push({
      id,
      size: ranked.length,
      members: ranked.map((mm, i) => ({ rank: i + 1, id: mm.id, name: mm.name, file: mm.file, line: mm.line, usageCount: mm.usageCount || 0, deprecated: !!mm.deprecated })),
      totalUsage: ranked.reduce((s, mm) => s + (mm.usageCount || 0), 0),
    });
  }
  clusters.sort((a, b) => b.size - a.size || b.totalUsage - a.totalUsage);
  return { clusters, pairs };
}

module.exports = { clusterComponents, clusterBodies, nameTokens, jaccard, normalizedTokens, shingles };
