'use strict';

const store = require('./store');
const { nameTokens } = require('./cluster');

// The agent-facing read layer. Every answer is derived from the built index, so
// a question that would take an agent six greps and a judgement call costs one
// command and returns `path:line` receipts.

function load(root) {
  const meta = store.readJson(root, 'meta.json');
  if (!meta) {
    const err = new Error('No frontend index found. Run `lazysitter fe-index build` first.');
    err.code = 'FE_INDEX_MISSING';
    throw err;
  }
  return {
    meta,
    components: store.readJson(root, 'components.json') || [],
    hooks: store.readJson(root, 'hooks.json') || [],
    utils: store.readJson(root, 'utils.json') || [],
    clusters: store.readJson(root, 'clusters.json') || { components: [], hooks: [], utils: [] },
    signals: store.readJson(root, 'signals.json') || [],
    graph: store.readJson(root, 'graph.json') || { imports: [], drills: [], cycles: [], orphans: [], barrels: [], externalUsage: [] },
    files: store.readJson(root, 'files.json') || [],
  };
}

function allEntities(idx, kind) {
  if (kind === 'component') return idx.components;
  if (kind === 'hook') return idx.hooks;
  if (kind === 'util') return idx.utils;
  return [...idx.components, ...idx.hooks, ...idx.utils];
}

// A feature request is prose ("Add a CSV export button to the analytics
// dashboard"), so the scorer must drop the words every request contains.
// Without this, `--like` scored on "add"/"the"/"to" and ranked noise.
const QUERY_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'to', 'for', 'of', 'in', 'on', 'at', 'by', 'with',
  'from', 'as', 'is', 'are', 'be', 'was', 'were', 'it', 'its', 'this', 'that', 'these',
  'add', 'adds', 'added', 'adding', 'make', 'makes', 'making', 'create', 'creates', 'new',
  'update', 'updates', 'change', 'changes', 'fix', 'fixes', 'implement', 'implements',
  'support', 'supports', 'allow', 'allows', 'enable', 'enables', 'when', 'should', 'can',
  'we', 'i', 'need', 'needs', 'want', 'wants', 'please', 'also', 'so', 'do', 'does',
  'not', 'no', 'if', 'then', 'than', 'into', 'out', 'up', 'down', 'all', 'any', 'src',
  'index', 'component', 'components', 'tsx', 'jsx', 'ts', 'js',
]);

function queryTokens(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !QUERY_STOPWORDS.has(t));
}

// Ranking is deliberately explainable: every point is attributable to a named
// signal, and `--explain` prints the breakdown. An agent citing rank #1 can say
// why it is #1.
function score(entity, qTokens) {
  if (!qTokens.length) return { total: 0, why: [] };
  const nameSet = new Set(nameTokens(entity.name));
  const propSet = new Set((entity.props || []).map((p) => p.name.toLowerCase()));
  const pathSet = new Set(queryTokens(entity.file));
  const hostSet = new Set((entity.hostTags || []).map((h) => h.toLowerCase()));
  const why = [];
  let total = 0;

  for (const t of qTokens) {
    if (nameSet.has(t)) { total += 3.0; why.push(`name:${t}`); }
    else if ([...nameSet].some((n) => n.startsWith(t) || t.startsWith(n))) { total += 1.6; why.push(`name~${t}`); }
    if (propSet.has(t)) { total += 2.0; why.push(`prop:${t}`); }
    if (pathSet.has(t)) { total += 1.4; why.push(`path:${t}`); }
    if (hostSet.has(t)) { total += 0.8; why.push(`host:${t}`); }
  }
  if (total > 0) {
    // Dominance and freshness break ties without ever outweighing a real
    // semantic match.
    const usage = Math.log10(1 + (entity.usageCount || 0)) * 0.9;
    if (usage) { total += usage; why.push(`usage:${entity.usageCount}`); }
    if (entity.deprecated) { total -= 2.5; why.push('deprecated'); }
    if (entity.fileClass === 'test' || entity.fileClass === 'story') { total -= 1.5; why.push(`class:${entity.fileClass}`); }
    if (!entity.exported) { total -= 0.8; why.push('not-exported'); }
  }
  return { total: +total.toFixed(3), why };
}

function search(idx, opts = {}) {
  const qTokens = queryTokens(opts.like);
  const wantProps = (opts.props || '').split(',').map((s) => s.trim()).filter(Boolean);
  let list = allEntities(idx, opts.kind);

  if (opts.file) list = list.filter((e) => e.file.toLowerCase().includes(String(opts.file).toLowerCase()));
  if (opts.exported) list = list.filter((e) => e.exported);
  if (opts.minUsage) list = list.filter((e) => (e.usageCount || 0) >= Number(opts.minUsage));
  if (!opts.includeTests) list = list.filter((e) => e.fileClass !== 'test');
  if (wantProps.length) {
    list = list.filter((e) => {
      const names = new Set((e.props || []).map((p) => p.name));
      return wantProps.every((p) => names.has(p));
    });
  }
  if (opts.hasHook) list = list.filter((e) => (e.hooks || []).includes(opts.hasHook));
  if (opts.renders) list = list.filter((e) => (e.renders || []).includes(opts.renders));

  const scored = list.map((e) => ({ entity: e, ...score(e, qTokens) }));
  if (qTokens.length) {
    return scored
      .filter((s) => s.total > 0)
      .sort((a, b) => b.total - a.total || (b.entity.usageCount || 0) - (a.entity.usageCount || 0))
      .slice(0, Number(opts.limit) || 20);
  }
  return scored
    .sort((a, b) => (b.entity.usageCount || 0) - (a.entity.usageCount || 0))
    .slice(0, Number(opts.limit) || 20);
}

function findByName(idx, name) {
  const target = String(name);
  const all = allEntities(idx, null);
  const exact = all.filter((e) => e.id === target || e.name === target);
  if (exact.length) return exact;
  const lower = target.toLowerCase();
  return all.filter((e) => e.name.toLowerCase() === lower);
}

// The precedent-set contract the pipeline's reuse rules are written against.
// Emitting it from the index (rather than from an agent's prose) is what makes
// "chose #1" a mechanically checkable claim.
function precedentSet(idx, category, opts = {}) {
  const hits = search(idx, { like: category, kind: opts.kind, limit: Number(opts.limit) || 8, includeTests: false });
  const clusterIds = new Set();
  for (const h of hits) if (h.entity.cluster) clusterIds.add(h.entity.cluster);
  const ranked = hits
    .map((h) => h.entity)
    .slice()
    .sort((a, b) => {
      if (!!a.deprecated !== !!b.deprecated) return a.deprecated ? 1 : -1;
      return (b.usageCount || 0) - (a.usageCount || 0) || (b.mtimeMs || 0) - (a.mtimeMs || 0);
    });
  return {
    category,
    clusters: clusterIds.size || (ranked.length ? 1 : 0),
    rows: ranked.map((e, i) => ({
      rank: i + 1,
      id: e.id,
      location: `${e.file}:${e.line}`,
      hits: e.usageCount || 0,
      newestBlame: e.mtimeMs ? new Date(e.mtimeMs).toISOString().slice(0, 10) : 'unknown',
      deprecation: e.deprecated || 'none',
      props: (e.props || []).length,
      commentDensity: e.commentDensity,
      cluster: e.cluster || null,
    })),
  };
}

function propReport(idx, name) {
  const matches = findByName(idx, name);
  if (!matches.length) return null;
  return matches.map((e) => {
    const props = (e.props || []).slice().sort((a, b) => (b.passedAt || 0) - (a.passedAt || 0));
    const stats = e.propStats || {};
    return {
      id: e.id,
      name: e.name,
      kind: e.kind,
      location: `${e.file}:${e.line}`,
      typeRef: e.propsTypeRef,
      rest: e.propsRest,
      unresolvedTypes: e.propsUnresolved || [],
      usageCount: e.usageCount || 0,
      callSites: e.callSites || [],
      spreadCallSites: stats.spreadCallSites || 0,
      props: props.map((p) => ({
        name: p.name,
        type: p.type || '(inferred)',
        required: !!p.required,
        default: p.default || null,
        source: p.source,
        passedAt: p.passedAt || 0,
        deadAtEveryCallSite: (p.passedAt || 0) === 0,
      })),
      neverPassed: stats.neverPassed || [],
      undeclared: stats.undeclared || [],
      requiredCount: stats.requiredCount || 0,
      booleanTrapCount: props.filter((p) => /^(is|has|should|can|show|hide|enable|disable)[A-Z]/.test(p.name) || /boolean/.test(p.type || '')).length,
    };
  });
}

function whoUses(idx, name) {
  const matches = findByName(idx, name);
  return matches.map((e) => ({
    id: e.id,
    location: `${e.file}:${e.line}`,
    usageCount: e.usageCount || 0,
    callSites: e.callSites || [],
  }));
}

// Blast radius: everything that transitively imports this file. The number an
// architect actually needs before touching a shared component.
function impact(idx, target) {
  const reverse = new Map();
  for (const row of idx.graph.imports) {
    for (const dep of row.imports) {
      if (!reverse.has(dep)) reverse.set(dep, new Set());
      reverse.get(dep).add(row.file);
    }
  }
  const seedFiles = new Set();
  if (idx.files.some((f) => f.path === target)) seedFiles.add(target);
  else for (const e of findByName(idx, target)) seedFiles.add(e.file);
  if (!seedFiles.size) return null;

  const seen = new Set(seedFiles);
  let frontier = [...seedFiles];
  const layers = [];
  while (frontier.length && layers.length < 12) {
    const next = [];
    for (const f of frontier) {
      for (const parent of reverse.get(f) || []) {
        if (seen.has(parent)) continue;
        seen.add(parent);
        next.push(parent);
      }
    }
    if (!next.length) break;
    layers.push(next.slice().sort());
    frontier = next;
  }
  const routes = [...seen].filter((f) => /(^|\/)(app|pages)\/.*(page|layout|route)\.[jt]sx?$/.test(f));
  return { seed: [...seedFiles], layers, totalAffectedFiles: seen.size - seedFiles.size, routes };
}

function duplicates(idx, opts = {}) {
  const kind = opts.kind || 'all';
  const out = [];
  if (kind === 'all' || kind === 'component') out.push(...idx.clusters.components.map((c) => ({ ...c, kind: 'component' })));
  if (kind === 'all' || kind === 'hook') out.push(...idx.clusters.hooks.map((c) => ({ ...c, kind: 'hook' })));
  if (kind === 'all' || kind === 'util') out.push(...idx.clusters.utils.map((c) => ({ ...c, kind: 'util' })));
  return out.sort((a, b) => b.size - a.size || b.totalUsage - a.totalUsage).slice(0, Number(opts.limit) || 40);
}

function signals(idx, opts = {}) {
  let list = idx.signals;
  if (opts.rule) {
    const rules = String(opts.rule).split(',').map((s) => s.trim().toUpperCase());
    list = list.filter((f) => rules.some((r) => f.id === r || f.id.startsWith(r)));
  }
  if (opts.severity) {
    const order = { critical: 4, high: 3, medium: 2, low: 1 };
    const min = order[String(opts.severity).toLowerCase()] || 1;
    list = list.filter((f) => (order[f.severity] || 0) >= min);
  }
  if (opts.file) list = list.filter((f) => f.file.includes(opts.file));
  if (opts.excludeHeuristic) list = list.filter((f) => !f.heuristic);
  const order = { critical: 4, high: 3, medium: 2, low: 1 };
  return list
    .slice()
    .sort((a, b) => (order[b.severity] || 0) - (order[a.severity] || 0) || a.file.localeCompare(b.file))
    .slice(0, Number(opts.limit) || 100);
}

function unusedProps(idx, opts = {}) {
  return idx.components
    .filter((e) => (e.usageCount || 0) >= (Number(opts.minUsage) || 2))
    .map((e) => ({
      id: e.id,
      location: `${e.file}:${e.line}`,
      usageCount: e.usageCount,
      neverPassed: (e.propStats && e.propStats.neverPassed) || [],
      undeclared: (e.propStats && e.propStats.undeclared) || [],
    }))
    .filter((r) => r.neverPassed.length || r.undeclared.length)
    .sort((a, b) => b.neverPassed.length + b.undeclared.length - (a.neverPassed.length + a.undeclared.length))
    .slice(0, Number(opts.limit) || 40);
}

module.exports = {
  load,
  search,
  findByName,
  precedentSet,
  propReport,
  whoUses,
  impact,
  duplicates,
  signals,
  unusedProps,
  score,
  queryTokens,
  QUERY_STOPWORDS,
};
