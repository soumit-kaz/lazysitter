'use strict';

const path = require('path');
const { walk, readSource, classifyFile } = require('./walk');
const { parseFile } = require('./parse');
const { createResolver } = require('./resolve');
const { detectStack, detectTokens } = require('./stack');
const { analyze } = require('./signals');
const { clusterComponents, clusterBodies } = require('./cluster');
const graph = require('./graph');
const store = require('./store');
const { commentDensity, mask } = require('./lex');
const conventions = require('./conventions');

// Bump when a change makes previously-cached per-file records wrong. A stale
// cache silently serving an old schema is worse than a slow rebuild.
const INDEX_VERSION = 4;

const BRANCH_RE = /\b(if|for|while|case|catch)\b|\?\.|\?|&&|\|\|/g;

function complexityOf(src) {
  BRANCH_RE.lastIndex = 0;
  let n = 1;
  while (BRANCH_RE.exec(src)) n++;
  return n;
}

function deprecationSignal(raw, decl) {
  const head = raw.slice(Math.max(0, decl.start - 400), decl.start);
  if (/@deprecated/i.test(head)) return '@deprecated tag';
  if (/\b(legacy|deprecated|old|v1|obsolete)\b/i.test(decl.name)) return `name contains a legacy marker (${decl.name})`;
  return null;
}

function entityFor(fileRec, decl, raw) {
  const source = raw.slice(decl.start, Math.min(decl.bodyEnd + 1, raw.length));
  const hooks = [...new Set(decl.hookCalls || [])];
  const props = decl.props ? decl.props.list : null;
  return {
    id: `${fileRec.path}::${decl.name}`,
    name: decl.name,
    kind: decl.kind,
    file: fileRec.path,
    line: decl.line,
    fileClass: fileRec.fileClass,
    exported: !!decl.exported,
    isDefault: !!decl.isDefault,
    wrapper: decl.wrapper || null,
    form: decl.form,
    displayName: decl.displayName || null,
    directives: fileRec.directives,
    props,
    propsTypeRef: decl.props ? decl.props.typeRef : null,
    propsRest: decl.props ? decl.props.rest : null,
    propsUnresolved: decl.props ? decl.props.unresolvedTypes : [],
    hooks,
    stateCount: hooks.filter((h) => h === 'useState' || h === 'useReducer').length,
    effectCount: hooks.filter((h) => /^use(Effect|LayoutEffect|InsertionEffect)$/.test(h)).length,
    contextCount: hooks.filter((h) => h === 'useContext').length,
    fetches: /\b(fetch\s*\(|axios\.|useQuery\s*\(|useSWR\s*\(|useMutation\s*\()/.test(source),
    renders: [...new Set(decl.renders || [])],
    hostTags: [...new Set(decl.hostTags || [])],
    loc: Math.max(1, source.split('\n').length),
    complexity: complexityOf(source),
    arity: (decl.paramsRaw || '').split(',').filter((s) => s.trim()).length,
    deprecated: deprecationSignal(raw, decl),
    bodyStart: decl.bodyStart,
    bodyEnd: decl.bodyEnd,
    usageCount: 0,
    source: decl.kind === 'util' || decl.kind === 'hook' ? source.slice(0, 12000) : undefined,
  };
}

function fileRecordFor(rel, raw, meta, ctx) {
  const parsed = parseFile(rel, raw);
  const fileClass = classifyFile(rel);
  const density = commentDensity(raw);
  const base = {
    path: rel,
    sha1: meta.sha1,
    mtimeMs: meta.mtimeMs,
    bytes: meta.bytes,
    eol: meta.eol,
    bom: meta.bom,
    fileClass,
    directives: parsed.directives,
    lines: parsed.lines,
    commentDensity: density.density,
    commentLines: density.commentLines,
    imports: parsed.imports,
    exportedNames: parsed.exportedNames,
    defaultExport: parsed.defaultExport,
    types: parsed.types.map((t) => ({ name: t.name, kind: t.kind, memberCount: t.members.length })),
    jsx: parsed.jsx.map((el) => ({ tag: el.tag, host: el.host, attrs: el.attrs, spreads: el.spreads, line: el.line, start: el.start, raw: el.raw.slice(0, 600) })),
  };
  base.entities = parsed.decls
    .filter((d) => d.kind === 'component' || d.kind === 'hook' || (d.kind === 'util' && d.exported) || (d.kind === 'class' && d.exported))
    .map((d) => entityFor(base, d, raw));
  base.findings = analyze(rel, raw, parsed, ctx);
  base.conventions = conventions.collect(mask(raw).masked);
  return base;
}

async function buildIndex(root, opts = {}) {
  const started = Date.now();
  const stack = detectStack(root);
  const { files, styles, skipped } = walk(root, { roots: opts.roots, ignore: opts.ignore });
  const tokens = detectTokens(root, styles);
  const ctx = {
    isNext: !!(stack.primary && stack.primary.name === 'next'),
    usesTailwind: stack.styling.some((s) => s.startsWith('tailwindcss')),
    designTokens: { colors: tokens.colors },
  };

  const prior = new Map();
  const priorMeta = store.readJson(root, 'meta.json');
  const cacheUsable = !opts.force && priorMeta && priorMeta.indexVersion === INDEX_VERSION;
  if (cacheUsable) {
    await store.readCache(root, (rec) => {
      if (rec && rec.path) prior.set(rec.path, rec);
    });
  }

  const records = [];
  let reused = 0;
  let parsed = 0;
  const parseErrors = [];

  for (const f of files) {
    let src;
    try {
      src = readSource(f.abs);
    } catch (err) {
      parseErrors.push({ file: f.rel, error: `read failed: ${err.message}` });
      continue;
    }
    const cached = prior.get(f.rel);
    if (cached && cached.sha1 === src.sha1) {
      records.push(cached);
      reused++;
      continue;
    }
    try {
      records.push(fileRecordFor(f.rel, src.text, { sha1: src.sha1, mtimeMs: f.mtimeMs, bytes: src.bytes, eol: src.eol, bom: src.bom }, ctx));
      parsed++;
    } catch (err) {
      // One unparseable file must never abort the index — it is disclosed and
      // the remaining files are still indexed.
      parseErrors.push({ file: f.rel, error: err.message });
    }
  }

  const parsedByFile = new Map();
  const entitiesByFile = new Map();
  for (const rec of records) {
    parsedByFile.set(rec.path, rec);
    for (const ent of rec.entities) {
      ent.usageCount = 0;
      ent.callSites = [];
      ent.propUsage = {};
      ent.mtimeMs = rec.mtimeMs;
      ent.commentDensity = rec.commentDensity;
    }
    entitiesByFile.set(rec.path, rec.entities);
  }

  const resolver = createResolver(root, records.map((r) => r.path));
  const g = graph.build(parsedByFile, entitiesByFile, resolver, opts);

  const all = [...g.entities.values()];
  const components = all.filter((e) => e.kind === 'component');
  const hooks = all.filter((e) => e.kind === 'hook');
  const utils = all.filter((e) => e.kind === 'util' || e.kind === 'class');

  // Every bound this build hits is collected and published in meta.json. A
  // capped comparison that nobody is told about reads exactly like an
  // exhaustive one that found nothing.
  const droppedBlocks = [];
  const componentClusters = clusterComponents(components, opts.threshold || 0.55, droppedBlocks);
  const hookClusters = clusterBodies(hooks, opts.bodyThreshold || 0.62, droppedBlocks);
  const utilClusters = clusterBodies(utils, opts.bodyThreshold || 0.62, droppedBlocks);

  const findings = [];
  for (const rec of records) for (const f of rec.findings) findings.push(f);
  const findingsByRule = {};
  for (const f of findings) findingsByRule[f.id] = (findingsByRule[f.id] || 0) + 1;

  const strip = (e) => {
    const copy = Object.assign({}, e);
    delete copy.source;
    delete copy.bodyStart;
    delete copy.bodyEnd;
    return copy;
  };

  const meta = {
    indexVersion: INDEX_VERSION,
    generatedAt: opts.now || new Date().toISOString(),
    root: path.basename(root),
    stack: {
      primary: stack.primary,
      supported: stack.supported,
      frameworks: stack.frameworks,
      router: stack.router,
      typescript: stack.typescript,
      bundler: stack.bundler,
      monorepo: stack.monorepo,
      state: stack.state,
      serverState: stack.serverState,
      styling: stack.styling,
      ui: stack.ui,
      forms: stack.forms,
      i18n: stack.i18n,
      testing: stack.testing,
      a11yTooling: stack.a11yTooling,
      perfTooling: stack.perfTooling,
      visualTooling: stack.visualTooling,
      scripts: stack.scripts,
    },
    counts: {
      files: records.length,
      styleFiles: styles.length,
      components: components.length,
      hooks: hooks.length,
      utils: utils.length,
      clusters: componentClusters.clusters.length + hookClusters.clusters.length + utilClusters.clusters.length,
      findings: findings.length,
      orphans: g.orphans.length,
      cycles: g.cycles.length,
      drillChains: g.drills.length,
    },
    tokens: { colors: tokens.colors.size, cssVars: tokens.vars.size, sources: tokens.sources.slice(0, 20) },
    coverage: {
      parsed,
      reusedFromCache: reused,
      skipped,
      parseErrors,
      aliasesResolved: resolver.aliases.length,
      // Disclosed bounds — never a silent cap.
      clusterBlocksDropped: droppedBlocks,
      graphLimits: g.limits || [],
    },
    findingsByRule,
    durationMs: Date.now() - started,
  };

  store.writeJson(root, 'meta.json', meta);
  store.writeJson(root, 'components.json', components.map(strip));
  store.writeJson(root, 'hooks.json', hooks.map(strip));
  store.writeJson(root, 'utils.json', utils.map(strip));
  store.writeJson(root, 'clusters.json', {
    components: componentClusters.clusters,
    hooks: hookClusters.clusters,
    utils: utilClusters.clusters,
  });
  store.writeJson(root, 'signals.json', findings);
  store.writeJson(root, 'graph.json', {
    imports: [...g.fileEdges.entries()].map(([file, set]) => ({ file, imports: [...set] })),
    externalUsage: [...g.externalUsage.entries()].sort((a, b) => b[1] - a[1]).map(([pkg, n]) => ({ pkg, count: n })),
    drills: g.drills,
    cycles: g.cycles,
    orphans: g.orphans,
    barrels: g.barrels,
  });
  store.writeJson(root, 'files.json', records.map((r) => ({
    path: r.path,
    sha1: r.sha1,
    fileClass: r.fileClass,
    lines: r.lines,
    bytes: r.bytes,
    eol: r.eol,
    bom: r.bom,
    directives: r.directives,
    commentDensity: r.commentDensity,
    entities: r.entities.length,
  })));
  await store.writeCache(root, records);

  return { meta, components, hooks, utils, clusters: { components: componentClusters.clusters, hooks: hookClusters.clusters, utils: utilClusters.clusters }, graph: g, findings };
}

module.exports = { buildIndex, INDEX_VERSION };
