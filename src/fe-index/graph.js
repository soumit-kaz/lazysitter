'use strict';

const IGNORED_ATTRS = new Set(['key', 'ref', 'children']);
const MAX_REEXPORT_HOPS = 6;

function isMetaAttr(name) {
  return name.startsWith('data-') || name.startsWith('aria-') || IGNORED_ATTRS.has(name);
}

function buildExportTable(parsedByFile, entitiesByFile) {
  const table = new Map(); // file -> Map(exportName -> entityId)
  for (const [file, parsed] of parsedByFile) {
    const map = new Map();
    for (const ent of entitiesByFile.get(file) || []) {
      if (ent.exported) map.set(ent.name, ent.id);
      if (ent.isDefault) map.set('default', ent.id);
    }
    if (parsed.defaultExport) {
      const target = (entitiesByFile.get(file) || []).find((e) => e.name === parsed.defaultExport);
      if (target) map.set('default', target.id);
    }
    table.set(file, map);
  }
  return table;
}

// Barrels chain, so follow `export … from`; otherwise a repo with an index.ts
// per folder reports near-zero usage for everything.
function resolveExport(file, name, exportTable, parsedByFile, resolver, hops = 0) {
  if (hops > MAX_REEXPORT_HOPS) return null;
  const direct = exportTable.get(file);
  if (direct && direct.has(name)) return direct.get(name);
  const parsed = parsedByFile.get(file);
  if (!parsed) return null;
  for (const imp of parsed.imports) {
    if (!imp.reExport) continue;
    const target = resolver.resolve(file, imp.source);
    if (!target) continue;
    const hit = resolveExport(target, name, exportTable, parsedByFile, resolver, hops + 1);
    if (hit) return hit;
  }
  return null;
}

function bindingsFor(file, parsed, exportTable, parsedByFile, resolver, entitiesByFile) {
  const bindings = new Map(); // local name -> entity id
  for (const ent of entitiesByFile.get(file) || []) bindings.set(ent.name, ent.id);
  for (const imp of parsed.imports) {
    if (imp.typeOnly || imp.reExport || imp.sideEffect) continue;
    const target = resolver.resolve(file, imp.source);
    for (const spec of imp.specifiers) {
      if (!target) {
        bindings.set(spec.local, `external:${imp.source}#${spec.imported}`);
        continue;
      }
      const id = resolveExport(target, spec.imported, exportTable, parsedByFile, resolver);
      if (id) bindings.set(spec.local, id);
    }
  }
  return bindings;
}

function passThroughProps(tagRaw) {
  const out = [];
  const re = /\b([A-Za-z_$][\w$-]*)\s*=\s*\{\s*([A-Za-z_$][\w$]*)\s*\}/g;
  let m;
  while ((m = re.exec(tagRaw))) out.push({ attr: m[1], value: m[2] });
  return out;
}

function build(parsedByFile, entitiesByFile, resolver, opts = {}) {
  const exportTable = buildExportTable(parsedByFile, entitiesByFile);
  const entities = new Map();
  for (const list of entitiesByFile.values()) for (const e of list) entities.set(e.id, e);

  const fileEdges = new Map();
  const externalUsage = new Map();
  const passEdges = [];

  for (const [file, parsed] of parsedByFile) {
    const bindings = bindingsFor(file, parsed, exportTable, parsedByFile, resolver, entitiesByFile);
    const owners = (entitiesByFile.get(file) || []).slice().sort((a, b) => a.bodyStart - b.bodyStart);

    const edges = new Set();
    for (const imp of parsed.imports) {
      const target = resolver.resolve(file, imp.source);
      if (target) edges.add(target);
      else {
        const pkg = resolver.packageOf(imp.source);
        if (pkg) externalUsage.set(pkg, (externalUsage.get(pkg) || 0) + 1);
      }
    }
    fileEdges.set(file, edges);

    for (const el of parsed.jsx) {
      if (el.host) continue;
      const base = el.tag.split('.')[0];
      const targetId = bindings.get(base);
      if (!targetId) continue;

      const owner = owners.filter((o) => el.start >= o.bodyStart && el.start <= o.bodyEnd).pop();
      const attrs = el.attrs.filter((a) => !isMetaAttr(a));

      if (targetId.startsWith('external:')) {
        const pkg = targetId.slice('external:'.length).split('#')[0];
        externalUsage.set(pkg, (externalUsage.get(pkg) || 0) + 1);
        continue;
      }
      const target = entities.get(targetId);
      if (!target) continue;

      target.usageCount = (target.usageCount || 0) + 1;
      target.callSites = target.callSites || [];
      const cap = opts.maxCallSites || 60;
      if (target.callSites.length < cap) {
        target.callSites.push({ file, line: el.line, owner: owner ? owner.id : null, attrs, spreads: el.spreads.length });
      } else {
        // usageCount stays exact; only the recorded sample is capped.
        target.callSitesTruncated = (target.callSitesTruncated || 0) + 1;
      }
      target.spreadCallSites = (target.spreadCallSites || 0) + (el.spreads.length ? 1 : 0);
      for (const a of attrs) {
        target.propUsage = target.propUsage || {};
        target.propUsage[a] = (target.propUsage[a] || 0) + 1;
      }
      if (owner) {
        owner.renders = owner.renders || [];
        if (!owner.rendersIds) owner.rendersIds = [];
        if (!owner.rendersIds.includes(targetId)) owner.rendersIds.push(targetId);
        for (const pt of passThroughProps(el.raw)) {
          const ownerProp = (owner.props || []).find((p) => p.name === pt.value);
          if (ownerProp) passEdges.push({ from: owner.id, to: targetId, prop: pt.attr, via: pt.value, file, line: el.line });
        }
      }
    }
  }

  reconcileProps(entities);
  const limits = [];
  const drills = drillChains(passEdges, entities, limits);
  const cycles = findCycles(fileEdges, limits);
  const orphans = findOrphans(entities, opts);
  const barrels = findBarrels(parsedByFile, entitiesByFile);
  const truncated = [...entities.values()].filter((e) => e.callSitesTruncated);
  if (truncated.length) {
    limits.push({
      what: 'recorded call sites',
      reported: `${truncated.length} entit${truncated.length === 1 ? 'y' : 'ies'} exceeded the ${opts.maxCallSites || 60}-site sample cap`,
      suppressed: 'usageCount stays exact; only the listed sample is capped',
    });
  }

  return { entities, fileEdges, externalUsage, passEdges, drills, cycles, orphans, barrels, limits };
}

function reconcileProps(entities) {
  for (const ent of entities.values()) {
    if (!ent.props) continue;
    const declared = new Set(ent.props.map((p) => p.name));
    const used = new Set(Object.keys(ent.propUsage || {}));
    ent.propStats = {
      declared: declared.size,
      passedSomewhere: [...declared].filter((p) => used.has(p)).length,
      neverPassed: [...declared].filter((p) => !used.has(p)),
      undeclared: [...used].filter((p) => !declared.has(p)),
      requiredCount: ent.props.filter((p) => p.required).length,
      spreadCallSites: ent.spreadCallSites || 0,
    };
    for (const p of ent.props) p.passedAt = (ent.propUsage || {})[p.name] || 0;
  }
}

function drillChains(passEdges, entities, limits) {
  const byFrom = new Map();
  for (const e of passEdges) {
    const key = `${e.from}::${e.via}`;
    if (!byFrom.has(key)) byFrom.set(key, []);
    byFrom.get(key).push(e);
  }
  const chains = [];
  // A dense prop graph can make this walk combinatorial. The bound keeps a
  // large monorepo from hanging, and hitting it is disclosed rather than
  // silently returning a partial answer that looks complete.
  const MAX_CHAINS = 4000;
  const MAX_DEPTH = 12;
  let hitBound = false;
  const walk = (edge, path, seen) => {
    if (chains.length >= MAX_CHAINS || path.length > MAX_DEPTH) {
      hitBound = true;
      return;
    }
    const nextKey = `${edge.to}::${edge.prop}`;
    const next = byFrom.get(nextKey) || [];
    const grew = next.filter((n) => !seen.has(`${n.from}::${n.to}::${n.prop}`));
    // Two hops means the prop crosses one component that does nothing with it
    // but forward it — the point at which drilling becomes a design signal.
    if (!grew.length) {
      if (path.length >= 2) chains.push(path.slice());
      return;
    }
    for (const n of grew) {
      seen.add(`${n.from}::${n.to}::${n.prop}`);
      path.push(n);
      walk(n, path, seen);
      path.pop();
    }
  };
  for (const edges of byFrom.values()) {
    for (const e of edges) walk(e, [e], new Set([`${e.from}::${e.to}::${e.prop}`]));
  }
  const seenSig = new Set();
  const out = [];
  for (const chain of chains) {
    const sig = chain.map((c) => `${c.from}>${c.to}:${c.prop}`).join('|');
    if (seenSig.has(sig)) continue;
    seenSig.add(sig);
    const nameOf = (id) => (entities.get(id) ? entities.get(id).name : id);
    out.push({
      prop: chain[0].prop,
      depth: chain.length + 1,
      path: [nameOf(chain[0].from), ...chain.map((c) => nameOf(c.to))],
      sites: chain.map((c) => `${c.file}:${c.line}`),
    });
  }
  out.sort((a, b) => b.depth - a.depth);
  if (hitBound && limits) {
    limits.push({ what: 'prop-drill chain search', reported: out.length, suppressed: 'bound reached — the chain list is a sample, not the complete set' });
  }
  return out;
}

function findCycles(fileEdges, limits) {
  const state = new Map();
  const stack = [];
  const cycles = [];
  let suppressed = 0;
  const visit = (node) => {
    state.set(node, 1);
    stack.push(node);
    for (const next of fileEdges.get(node) || []) {
      if (!fileEdges.has(next)) continue;
      const s = state.get(next) || 0;
      if (s === 0) visit(next);
      else if (s === 1) {
        const at = stack.lastIndexOf(next);
        if (at !== -1) {
          if (cycles.length < 50) cycles.push(stack.slice(at).concat(next));
          else suppressed++;
        }
      }
    }
    stack.pop();
    state.set(node, 2);
  };
  for (const node of fileEdges.keys()) if (!state.get(node)) visit(node);
  if (suppressed && limits) limits.push({ what: 'import cycles', reported: cycles.length, suppressed });
  return cycles;
}

const ENTRY_RE = /(^|\/)(app|pages)\/.*(page|layout|template|loading|error|not-found|route|default)\.[jt]sx?$/;

function findOrphans(entities, opts) {
  const out = [];
  for (const ent of entities.values()) {
    if (!ent.exported) continue;
    if ((ent.usageCount || 0) > 0) continue;
    if (ENTRY_RE.test(ent.file)) continue;
    if (ent.fileClass === 'test' || ent.fileClass === 'story' || ent.fileClass === 'config') continue;
    if (ent.isDefault && /(^|\/)(app|pages)\//.test(ent.file)) continue;
    out.push({ id: ent.id, name: ent.name, kind: ent.kind, file: ent.file, line: ent.line });
  }
  return out;
}

function findBarrels(parsedByFile, entitiesByFile) {
  const out = [];
  for (const [file, parsed] of parsedByFile) {
    const reExports = parsed.imports.filter((i) => i.reExport).length;
    const own = (entitiesByFile.get(file) || []).length;
    if (reExports >= 3 && own === 0) out.push({ file, reExports });
  }
  return out;
}

module.exports = { build, drillChains, findCycles, resolveExport };
