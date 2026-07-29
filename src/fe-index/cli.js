'use strict';

const path = require('path');
const { log, c } = require('../util');
const store = require('./store');
const q = require('./query');
const { RULES } = require('./signals');

const SUBCOMMANDS = ['build', 'brief', 'gate', 'cost', 'query', 'precedent', 'props', 'who', 'impact', 'dup', 'signals', 'drill', 'orphans', 'dead-props', 'stack', 'stats', 'rules', 'clear'];

function out(json, text) {
  if (json) console.log(JSON.stringify(json.payload, null, 2));
  else console.log(text);
}

function pad(s, n) {
  s = String(s == null ? '' : s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function table(rows, cols) {
  const widths = cols.map((col) => Math.max(col.header.length, ...rows.map((r) => String(col.get(r) ?? '').length)));
  const head = cols.map((col, i) => pad(col.header, widths[i])).join('  ');
  const sep = widths.map((w) => '-'.repeat(w)).join('  ');
  const body = rows.map((r) => cols.map((col, i) => pad(col.get(r), widths[i])).join('  '));
  return [head, sep, ...body].join('\n');
}

async function run(root, sub, flags) {
  const asJson = !!flags.json;

  if (sub === 'build') {
    const { buildIndex } = require('./build');
    const res = await buildIndex(root, { force: !!flags.force, roots: flags.root ? String(flags.root).split(',') : null });
    const m = res.meta;
    if (asJson) return out({ payload: m });
    const fw = m.stack.primary ? `${m.stack.primary.name}@${m.stack.primary.version || '?'}` : 'none detected';
    log.info('');
    log.ok(`Frontend index built in ${m.durationMs}ms → ${store.indexDir(root)}`);
    log.info(`  stack        ${fw}${m.stack.supported ? '' : c.red('  UNSUPPORTED by the FE team')}   router: ${m.stack.router}   ts: ${m.stack.typescript}`);
    log.info(`  indexed      ${m.counts.files} files (${m.coverage.parsed} parsed, ${m.coverage.reusedFromCache} cached)`);
    log.info(`  entities     ${m.counts.components} components · ${m.counts.hooks} hooks · ${m.counts.utils} utils`);
    log.info(`  duplicates   ${m.counts.clusters} near-duplicate clusters`);
    log.info(`  graph        ${m.counts.orphans} unused exports · ${m.counts.cycles} import cycles · ${m.counts.drillChains} prop-drill chains`);
    log.info(`  signals      ${m.counts.findings} mechanical findings across ${Object.keys(m.findingsByRule).length} rules`);
    if (m.coverage.skipped.length) log.warn(`  skipped      ${m.coverage.skipped.length} path(s) — see meta.json coverage.skipped`);
    if (m.coverage.parseErrors.length) log.warn(`  parse errors ${m.coverage.parseErrors.length} file(s) — see meta.json coverage.parseErrors`);
    if (!m.stack.supported) {
      log.info('');
      log.err('This repo is not React or Next.js. The LazySitter frontend team refuses to run here by design —');
      log.err('shallow cross-framework advice is worse than none. Use the general team (`/lsi`) instead.');
    }
    log.info('');
    return;
  }

  if (sub === 'clear') {
    store.clear(root);
    log.ok(`Cleared ${store.indexDir(root)}`);
    return;
  }

  if (sub === 'brief') {
    const feature = flags.feature || flags._rest;
    if (!feature) return log.err('brief needs a feature request, e.g. `fe-index brief --feature "add CSV export to the dashboard"`');
    const res = await require('./brief').writeBrief(root, feature, flags.out ? String(flags.out) : null, { limit: flags.limit });
    if (asJson) return out({ payload: { dir: res.dir, written: res.written, categories: res.categories, caps: res.caps } });
    log.info('');
    log.ok(`Feature brief written → ${res.dir}`);
    log.info('');
    console.log(
      table(res.written, [
        { header: 'shard', get: (w) => w.name },
        { header: '~tokens', get: (w) => w.tokens },
      ])
    );
    const total = res.written.reduce((a, w) => a + w.tokens, 0);
    log.info('');
    log.info(`  ${c.bold(`~${total} tokens total`)} — but no agent reads all of it. See INDEX.md for per-role routing.`);
    log.info(`  Categories inferred: ${res.categories.length ? res.categories.map((x) => x.category).join(', ') : c.yellow('none — the annotator must name them')}`);
    if (res.caps.length) for (const cap of res.caps) log.warn(`  ${cap}`);
    log.info('');
    log.info(c.dim('  Facts are in the shards. Judgement calls are in 90-open-questions.md — those are still the agents\' job.'));
    log.info('');
    return;
  }

  if (sub === 'gate') {
    const { runGate } = require('./gate');
    let opts = { base: flags.base || null };
    if (flags.input) {
      // The plan's ownership map, justified file list and the implementers'
      // precedent citations arrive as one JSON file the orchestrator writes.
      try {
        opts = Object.assign(opts, JSON.parse(require('fs').readFileSync(String(flags.input), 'utf8')));
      } catch (err) {
        log.err(`could not read --input ${flags.input}: ${err.message}`);
        process.exitCode = 1;
        return;
      }
    }
    const res = runGate(root, opts);
    if (asJson) return out({ payload: res.report });
    const r = res.report;
    if (res.error) {
      log.err(res.error);
      console.log('\n' + res.verdicts.join('\n\n'));
      process.exitCode = 1;
      return;
    }
    log.info('');
    log.info(`${c.bold('Mechanical gate')} — ${r.changed.length} changed path(s), ${r.sourceChanged.length} source file(s)`);
    log.info('');
    const line = (label, val, bad) => log.info(`  ${pad(label, 26)} ${bad ? c.red(String(val)) : c.green(String(val))}`);
    line('secrets (new lines)', r.secrets.length, r.secrets.some((s) => s.severity === 'critical'));
    line('pipeline refs in source', r.forbiddenReferences.length, r.forbiddenReferences.length > 0);
    line('unowned changed files', r.ownership.checked ? r.ownership.unowned.length : 'not checked', r.ownership.checked && r.ownership.unowned.length > 0);
    line('double-owned files', r.ownership.checked ? r.ownership.doubleOwned.length : 'not checked', r.ownership.checked && r.ownership.doubleOwned.length > 0);
    line('unplanned added files', r.footprint.plannedListProvided ? r.footprint.unplanned.length : 'no plan list', r.footprint.unplanned.length > 0);
    line('scratch suspects', r.footprint.scratchSuspects.length, r.footprint.scratchSuspects.length > 0);
    line('bad precedent citations', r.citations.filter((x) => x.verdict !== 'RESOLVES').length, r.citations.some((x) => x.verdict !== 'RESOLVES'));
    line('new rule findings', r.newSignals ? r.newSignals.length : 'no index', r.newSignals && r.newSignals.some((s) => s.severity === 'critical' || s.severity === 'high'));
    line('duplicate clusters hit', r.duplicateClusters ? r.duplicateClusters.length : 'n/a', r.duplicateClusters && r.duplicateClusters.length > 0);
    if (r.degraded.length) {
      log.info('');
      for (const d of r.degraded) log.warn(`  degraded: ${d}`);
    }
    log.info('');
    console.log(res.verdicts.join('\n\n'));
    log.info('');
    log.info(c.dim('  These verdicts state WHAT fired, never whether it is acceptable — that judgement stays with the named verifier.'));
    log.info('');
    return;
  }

  if (sub === 'cost') {
    const feature = flags.feature || flags._rest;
    if (!feature) return log.err('cost needs a feature request, e.g. `fe-index cost --feature "add CSV export"`');
    const est = await require('./cost').estimate(root, feature, { size: flags.size, budget: flags.budget, limit: flags.limit });
    if (asJson) return out({ payload: est });
    log.info('');
    log.info(`${c.bold('Run cost forecast')} — size: ${c.cyan(est.size)}${est.sizeOverridden ? ' (overridden)' : ` (inferred: ${est.sizeInferred.why})`}`);
    log.info('');
    console.log(
      table(est.waves.filter((w) => w.agents > 0), [
        { header: 'wave', get: (w) => w.name },
        { header: 'agents', get: (w) => w.agents },
        { header: '~each', get: (w) => w.perAgent },
        { header: '~total', get: (w) => w.total },
        { header: 'note', get: (w) => (w.note || '').slice(0, 62) },
      ])
    );
    log.info('');
    log.info(`  ${pad('subtotal', 22)} ${est.subtotal}`);
    log.info(`  ${pad('orchestrator overhead', 22)} ${est.overhead}`);
    log.info(`  ${pad(c.bold('forecast total'), 22)} ${c.bold(String(est.total))}`);
    log.info(`  ${pad('budget', 22)} ${est.budget}`);
    log.info(
      `  ${pad('headroom', 22)} ${est.fitsBudget ? c.green(String(est.headroom)) : c.red(String(est.headroom) + ' — OVER BUDGET')}`
    );
    log.info('');
    for (const cav of est.caveats) log.info(c.dim(`  · ${cav}`));
    log.info('');
    return;
  }

  const idx = q.load(root);

  if (sub === 'stack' || sub === 'stats') {
    if (asJson) return out({ payload: idx.meta });
    const m = idx.meta;
    const line = (k, v) => log.info(`  ${pad(k, 14)} ${Array.isArray(v) ? (v.length ? v.join(', ') : c.dim('none')) : v}`);
    log.info('');
    log.info(c.bold('Frontend stack'));
    line('framework', m.stack.primary ? `${m.stack.primary.name}@${m.stack.primary.version}` : 'none');
    line('supported', m.stack.supported ? c.green('yes') : c.red('NO — FE team refuses'));
    line('router', m.stack.router);
    line('bundler', m.stack.bundler);
    line('monorepo', m.stack.monorepo || 'no');
    line('state', m.stack.state);
    line('server-state', m.stack.serverState);
    line('styling', m.stack.styling);
    line('ui kit', m.stack.ui);
    line('forms', m.stack.forms);
    line('i18n', m.stack.i18n);
    line('testing', m.stack.testing);
    line('a11y tools', m.stack.a11yTooling);
    line('perf tools', m.stack.perfTooling);
    line('visual', m.stack.visualTooling);
    log.info('');
    log.info(c.bold('Index'));
    line('generated', m.generatedAt);
    line('files', m.counts.files);
    line('components', m.counts.components);
    line('hooks', m.counts.hooks);
    line('utils', m.counts.utils);
    line('clusters', m.counts.clusters);
    line('findings', m.counts.findings);
    line('tokens', `${m.tokens.colors} colours, ${m.tokens.cssVars} css vars`);
    log.info('');
    return;
  }

  if (sub === 'query') {
    const hits = q.search(idx, {
      like: flags.like || flags._rest,
      kind: flags.kind,
      props: flags.props,
      file: flags.file,
      minUsage: flags['min-usage'],
      hasHook: flags['has-hook'],
      renders: flags.renders,
      exported: !!flags.exported,
      includeTests: !!flags['include-tests'],
      limit: flags.limit,
    });
    if (asJson) return out({ payload: hits.map((h) => ({ score: h.total, why: h.why, ...h.entity })) });
    if (!hits.length) return log.info('no match');
    console.log(
      table(hits, [
        { header: '#', get: (_, i) => '' },
        { header: 'entity', get: (h) => h.entity.name },
        { header: 'kind', get: (h) => h.entity.kind },
        { header: 'location', get: (h) => `${h.entity.file}:${h.entity.line}` },
        { header: 'used', get: (h) => h.entity.usageCount || 0 },
        { header: 'props', get: (h) => (h.entity.props || []).length },
        { header: 'cluster', get: (h) => h.entity.cluster || '-' },
        { header: 'score', get: (h) => h.total },
        { header: 'why', get: (h) => h.why.slice(0, 4).join(',') },
      ]).replace(/^#\s\s/, '  ')
    );
    return;
  }

  if (sub === 'precedent') {
    const category = flags.like || flags._rest;
    if (!category) return log.err('precedent needs a category, e.g. `fe-index precedent "confirm modal"`');
    const set = q.precedentSet(idx, category, { kind: flags.kind, limit: flags.limit });
    if (asJson) return out({ payload: set });
    console.log(`### Precedent set — ${set.category}   clusters: ${set.clusters}`);
    if (!set.rows.length) {
      console.log(`NONE-FOUND — probe: \`fe-index precedent "${category}"\` — hits: 0`);
      return;
    }
    for (const r of set.rows) {
      console.log(
        `${r.rank}. ${r.location} — hits: ${r.hits} — newest-blame: ${r.newestBlame} — deprecation: ${r.deprecation} — props: ${r.props} — comment-density: ${r.commentDensity}`
      );
    }
    return;
  }

  if (sub === 'props') {
    const name = flags.name || flags._rest;
    if (!name) return log.err('props needs a component name, e.g. `fe-index props Button`');
    const reports = q.propReport(idx, name);
    if (!reports) return log.err(`no component/hook named ${name} in the index`);
    if (asJson) return out({ payload: reports });
    for (const r of reports) {
      log.info('');
      log.info(`${c.bold(r.name)}  ${c.dim(r.location)}   kind: ${r.kind}   rendered at ${r.usageCount} call site(s)`);
      log.info(`  props type: ${r.typeRef || c.dim('(inline/inferred)')}${r.rest ? `   rest: ...${r.rest}` : ''}${r.spreadCallSites ? `   ${c.yellow(`${r.spreadCallSites} call site(s) use {...spread} — passed props there are invisible`)}` : ''}`);
      if (r.unresolvedTypes.length) log.warn(`  unresolved prop types (declared outside this file): ${r.unresolvedTypes.join(', ')}`);
      log.info('');
      console.log(
        table(r.props, [
          { header: 'prop', get: (p) => p.name },
          { header: 'req', get: (p) => (p.required ? 'yes' : '') },
          { header: 'default', get: (p) => p.default || '' },
          { header: 'passed', get: (p) => p.passedAt },
          { header: 'type', get: (p) => String(p.type).slice(0, 46) },
          { header: 'from', get: (p) => p.source },
        ])
      );
      if (r.neverPassed.length) log.warn(`  dead prop surface — declared but passed at 0 call sites: ${r.neverPassed.join(', ')}`);
      if (r.undeclared.length) log.warn(`  passed but not declared (absorbed by rest/spread or dropped): ${r.undeclared.join(', ')}`);
      if (r.booleanTrapCount >= 3) log.warn(`  ${r.booleanTrapCount} boolean-ish props — a boolean-flag cluster this size usually wants a variant union instead`);
    }
    log.info('');
    return;
  }

  if (sub === 'who') {
    const name = flags.name || flags._rest;
    const res = q.whoUses(idx, name);
    if (asJson) return out({ payload: res });
    if (!res.length) return log.err(`no entity named ${name}`);
    for (const r of res) {
      log.info('');
      log.info(`${c.bold(name)} ${c.dim(r.location)} — ${r.usageCount} call site(s)`);
      if (!r.callSites.length) log.info(c.dim('  (no JSX call site found — it may be exported for consumers outside this repo, or only used dynamically)'));
      for (const s of r.callSites) log.info(`  ${s.file}:${s.line}${s.spreads ? '  {...spread}' : ''}  props: ${s.attrs.join(', ') || c.dim('none')}`);
    }
    log.info('');
    return;
  }

  if (sub === 'impact') {
    const target = flags.name || flags._rest;
    const res = q.impact(idx, target);
    if (!res) return log.err(`no file or entity matching ${target}`);
    if (asJson) return out({ payload: res });
    log.info('');
    log.info(`${c.bold('Blast radius')} for ${target}`);
    log.info(`  seed: ${res.seed.join(', ')}`);
    log.info(`  ${res.totalAffectedFiles} file(s) transitively import it, across ${res.layers.length} hop(s)`);
    res.layers.forEach((layer, i) => {
      log.info(`  hop ${i + 1} (${layer.length}): ${layer.slice(0, 12).join(', ')}${layer.length > 12 ? ` … +${layer.length - 12}` : ''}`);
    });
    if (res.routes.length) log.info(`  ${c.yellow('routes affected')}: ${res.routes.join(', ')}`);
    log.info('');
    return;
  }

  if (sub === 'dup') {
    const res = q.duplicates(idx, { kind: flags.kind, limit: flags.limit });
    if (asJson) return out({ payload: res });
    if (!res.length) return log.ok('no near-duplicate clusters found');
    for (const cl of res) {
      log.info('');
      log.info(`${c.bold(cl.id)} (${cl.kind}) — ${cl.size} near-duplicates, ${cl.totalUsage} total call sites`);
      for (const m of cl.members) {
        log.info(`  ${m.rank}. ${m.file}:${m.line}  ${m.name}  used:${m.usageCount}${m.deprecated ? c.yellow('  [deprecated]') : ''}`);
      }
    }
    log.info('');
    return;
  }

  if (sub === 'signals') {
    const res = q.signals(idx, {
      rule: flags.rule,
      severity: flags.severity,
      file: flags.file,
      excludeHeuristic: !!flags['no-heuristic'],
      limit: flags.limit,
    });
    if (asJson) return out({ payload: res });
    if (!res.length) return log.ok('no findings for that filter');
    for (const f of res) {
      const sev = f.severity === 'critical' ? c.red('CRIT') : f.severity === 'high' ? c.red('HIGH') : f.severity === 'medium' ? c.yellow('MED ') : c.dim('LOW ');
      log.info(`${sev} ${pad(f.id, 32)} ${f.file}:${f.line}${f.heuristic ? c.dim(' [heuristic]') : ''}`);
      log.info(`     ${f.message}`);
    }
    log.info('');
    log.info(c.dim(`${res.length} finding(s). [heuristic] rules must be confirmed by reading the file before you treat one as a fact.`));
    return;
  }

  if (sub === 'drill') {
    const res = idx.graph.drills.slice(0, Number(flags.limit) || 25);
    if (asJson) return out({ payload: res });
    if (!res.length) return log.ok('no prop-drilling chains of depth 3+ found');
    for (const d of res) {
      log.info(`depth ${d.depth}  prop \`${d.prop}\`  ${d.path.join(' → ')}`);
      log.info(c.dim(`         ${d.sites.join('  ')}`));
    }
    return;
  }

  if (sub === 'orphans') {
    const res = idx.graph.orphans.slice(0, Number(flags.limit) || 60);
    if (asJson) return out({ payload: res });
    if (!res.length) return log.ok('no unused exports found');
    console.log(
      table(res, [
        { header: 'entity', get: (r) => r.name },
        { header: 'kind', get: (r) => r.kind },
        { header: 'location', get: (r) => `${r.file}:${r.line}` },
      ])
    );
    log.info('');
    log.info(c.dim('Exported and never rendered/imported inside this repo. A public package export or a dynamic import will show up here too — confirm before deleting.'));
    return;
  }

  if (sub === 'dead-props') {
    const res = q.unusedProps(idx, { minUsage: flags['min-usage'], limit: flags.limit });
    if (asJson) return out({ payload: res });
    if (!res.length) return log.ok('no dead or undeclared prop surface found');
    for (const r of res) {
      log.info(`${r.location}  used:${r.usageCount}`);
      if (r.neverPassed.length) log.info(`  never passed: ${r.neverPassed.join(', ')}`);
      if (r.undeclared.length) log.info(`  undeclared:   ${r.undeclared.join(', ')}`);
    }
    return;
  }

  if (sub === 'rules') {
    if (asJson) return out({ payload: RULES });
    console.log(
      table(Object.entries(RULES).map(([id, desc]) => ({ id, desc })), [
        { header: 'rule', get: (r) => r.id },
        { header: 'what it catches', get: (r) => r.desc },
      ])
    );
    return;
  }

  log.err(`Unknown fe-index subcommand: ${sub}`);
  log.info(`  known: ${SUBCOMMANDS.join(', ')}`);
  process.exitCode = 1;
}

function help() {
  log.info(`
${c.bold('lazysitter fe-index')} — the frontend component/hook/util index

${c.bold('Build')}
  fe-index build [--force] [--root src,packages/ui]     scan the repo and write .lazysitter/index/
  fe-index clear                                        delete the index

${c.bold('Pipeline (these are what make a run affordable)')}
  fe-index brief --feature "<request>" [--out <dir>]    the whole factual context pack, sharded,
                                                        computed deterministically for ZERO tokens
  fe-index gate  [--base <ref>] [--input <json>]        mechanical pre-verification of the diff:
                                                        citations, ownership, footprint, secrets
                                                        (incl. untracked files), new rule findings
  fe-index cost  --feature "<request>" [--size] [--budget N]
                                                        per-wave token forecast vs the budget

${c.bold('Find')}
  fe-index query --like "confirm modal" [--kind component|hook|util]
                 [--props onConfirm,title] [--file ui/] [--min-usage 3]
                 [--has-hook useQuery] [--renders Button] [--limit 20]
  fe-index precedent "confirm modal" [--kind component]   ranked precedent set, pipeline format
  fe-index who Button                                     every call site, with the props passed
  fe-index impact src/ui/Button.tsx                       transitive blast radius + routes hit

${c.bold('Analyse')}
  fe-index props Button            declared vs actually-passed props, defaults, dead surface
  fe-index dead-props              components whose prop API has drifted from its call sites
  fe-index dup [--kind component]  near-duplicate clusters, ranked
  fe-index drill                   prop-drilling chains of depth 3+
  fe-index orphans                 exported and never used
  fe-index signals [--rule A11Y] [--severity high] [--no-heuristic]
  fe-index rules                   list every mechanical rule
  fe-index stack                   detected framework, libraries, tooling

${c.dim('Add --json to any command for machine-readable output.')}
`);
}

module.exports = { run, help, SUBCOMMANDS };
