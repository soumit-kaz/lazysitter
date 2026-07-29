'use strict';

const fs = require('fs');
const path = require('path');
const q = require('./query');
const conventions = require('./conventions');
const store = require('./store');

// The deterministic context pack.
//
// Everything here was previously derived by five explorer agents reading source
// and reasoning in prose — roughly 130k tokens per run. All of it is a counting,
// ranking or graph-walking problem, so it is computed here for zero tokens and
// with no possibility of hallucination, omission, or a miscounted call site.
//
// What a program CANNOT decide is separated out into `90-open-questions.md`.
// That separation is the quality guarantee: agents still do every judgement
// call, they just stop paying to re-derive the facts underneath them.

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'to', 'for', 'of', 'in', 'on', 'at', 'by', 'with',
  'from', 'as', 'is', 'are', 'be', 'was', 'were', 'it', 'its', 'this', 'that', 'these',
  'add', 'adds', 'added', 'adding', 'make', 'makes', 'making', 'create', 'creates', 'new',
  'update', 'updates', 'change', 'changes', 'fix', 'fixes', 'implement', 'implements',
  'support', 'supports', 'allow', 'allows', 'enable', 'enables', 'when', 'should', 'can',
  'we', 'i', 'user', 'users', 'need', 'needs', 'want', 'wants', 'please', 'also', 'so',
  'do', 'does', 'not', 'no', 'if', 'then', 'than', 'into', 'out', 'up', 'down', 'all', 'any',
]);

// Functional categories a frontend feature is normally assembled from. Matching
// the request against this vocabulary is what turns free text into precedent
// searches, and it is deliberately conservative: a category is only searched
// when the request actually names it or a close synonym.
const CATEGORY_VOCAB = [
  ['confirm dialog', ['confirm', 'confirmation', 'are you sure', 'delete', 'remove', 'destructive']],
  ['modal dialog', ['modal', 'dialog', 'popup', 'overlay']],
  ['drawer panel', ['drawer', 'sidebar', 'panel', 'sheet', 'flyout']],
  ['data table', ['table', 'grid', 'rows', 'columns', 'datagrid', 'listing']],
  ['list', ['list', 'items', 'feed', 'results']],
  ['form', ['form', 'input', 'field', 'submit', 'validation', 'edit']],
  ['button', ['button', 'action', 'cta']],
  ['menu dropdown', ['menu', 'dropdown', 'select', 'picker', 'combobox', 'autocomplete']],
  ['tabs', ['tab', 'tabs']],
  ['toast notification', ['toast', 'notification', 'snackbar', 'alert', 'banner']],
  ['empty state', ['empty', 'no results', 'placeholder']],
  ['loading skeleton', ['loading', 'skeleton', 'spinner', 'pending']],
  ['error state', ['error', 'failure', 'retry']],
  ['pagination', ['pagination', 'paginate', 'page', 'infinite scroll']],
  ['filter search', ['filter', 'search', 'query', 'facet']],
  ['export download', ['export', 'download', 'csv', 'excel', 'pdf', 'report']],
  ['upload', ['upload', 'file', 'attachment', 'drop']],
  ['chart visualization', ['chart', 'graph', 'plot', 'dashboard', 'metric', 'analytics']],
  ['avatar user', ['avatar', 'profile', 'user', 'account']],
  ['badge tag', ['badge', 'tag', 'chip', 'label', 'status', 'pill']],
  ['card', ['card', 'tile']],
  ['date picker', ['date', 'calendar', 'schedule', 'time']],
  ['navigation', ['nav', 'navigation', 'breadcrumb', 'header', 'menu bar']],
  ['auth permission', ['login', 'auth', 'permission', 'role', 'access']],
  ['settings preferences', ['setting', 'settings', 'preference', 'config', 'toggle']],
];

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function inferCategories(featureText) {
  const lower = String(featureText || '').toLowerCase();
  const tokens = new Set(tokenize(featureText));
  const hits = [];
  for (const [category, cues] of CATEGORY_VOCAB) {
    const matched = cues.filter((cue) => (cue.includes(' ') ? lower.includes(cue) : tokens.has(cue)));
    if (matched.length) hits.push({ category, matched, score: matched.length });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, 8);
}

function neighbourhood(idx, featureText, limit) {
  const hits = q.search(idx, { like: featureText, limit: limit || 25, includeTests: false });
  const files = new Set(hits.map((h) => h.entity.file));
  const routes = idx.files
    .filter((f) => /(^|\/)(app|pages)\/.*(page|layout|route)\.[jt]sx?$/.test(f.path))
    .map((f) => f.path);
  return { entities: hits.map((h) => h.entity), files, routes };
}

function estimateTokens(text) {
  return Math.round(text.length / 4);
}

function section(title, lines) {
  return `## ${title}\n\n${lines.filter(Boolean).join('\n')}\n`;
}

function verdictLine(name, d) {
  if (d.verdict === 'NONE-FOUND') return `- **${name}**: NONE-FOUND (no usage detected anywhere in the index)`;
  if (d.verdict === 'COMPETING') {
    return `- **${name}**: ⚠ COMPETING — ${d.options.slice(0, 3).map((o) => `${o.name} (${o.hits})`).join(', ')} — ${d.note}`;
  }
  return `- **${name}**: ${d.winner} (${d.hits} occurrences, dominant)`;
}

function buildBrief(root, featureText, opts = {}) {
  const idx = q.load(root);
  const meta = idx.meta;
  const categories = inferCategories(featureText);
  const hood = neighbourhood(idx, featureText, opts.limit);
  const caps = [];

  // ---- aggregate the per-file convention counters recorded at build time ----
  const totals = {};
  let countedFiles = 0;
  return store
    .readCache(root, (rec) => {
      if (rec && rec.conventions) {
        conventions.merge(totals, rec.conventions);
        countedFiles++;
      }
    })
    .then(() => {
      if (!countedFiles) {
        caps.push('Convention counters are absent from the cache — rebuild with `fe-index build --force` after upgrading. Convention sections below are UNAVAILABLE, not empty.');
      }
      const conv = conventions.summarize(totals);
      const shards = {};

      // ------------------------------------------------------------ digest
      const fw = meta.stack.primary;
      const competing = Object.entries(conv)
        .filter(([k, v]) => k !== 'raw' && v && v.verdict === 'COMPETING')
        .map(([k]) => k);
      shards['00-DIGEST.md'] = [
        `# Feature brief — digest`,
        ``,
        `> Computed by \`lazysitter fe-index brief\`. Every number here is mechanical — a count, a rank, or a graph walk.`,
        `> Judgement calls are NOT in this file; they are listed in \`90-open-questions.md\`.`,
        ``,
        `**Feature**: ${featureText}`,
        `**Index digest**: ${meta.generatedAt} · ${meta.counts.files} files · ${meta.counts.components} components · ${meta.counts.hooks} hooks · ${meta.counts.utils} utils`,
        `**Stack**: ${fw ? `${fw.name}@${fw.version}` : 'none'} · router: ${meta.stack.router} · TS: ${meta.stack.typescript} · bundler: ${meta.stack.bundler}${meta.stack.monorepo ? ` · ${meta.stack.monorepo}` : ''}`,
        `**Supported by this team**: ${meta.stack.supported ? 'yes' : 'NO — the run must halt'}`,
        ``,
        section('Categories this feature needs', categories.length
          ? categories.map((c) => `- \`${c.category}\` (matched: ${c.matched.join(', ')})`)
          : ['- none inferred from the request text — the annotator must name the categories']),
        section('Neighbourhood (top-ranked existing code for this request)', hood.entities.length
          ? hood.entities.slice(0, 12).map((e, i) => `${i + 1}. ${e.file}:${e.line} — ${e.name} (${e.kind}, used ${e.usageCount || 0}×, ${(e.props || []).length} props)`)
          : ['- NONE — no existing code scored against this request. Confirm the request wording, then treat this as greenfield.']),
        section('Harness reality (the four observable oracles)', [
          `- test: ${meta.stack.testing.length ? meta.stack.testing.join(', ') : '**absent**'}`,
          `- a11y-engine: ${meta.stack.a11yTooling.length ? meta.stack.a11yTooling.join(', ') : '**absent**'}`,
          `- render/visual: ${meta.stack.visualTooling.length ? meta.stack.visualTooling.join(', ') : '**absent**'}`,
          `- bundle-measure: ${meta.stack.perfTooling.length ? meta.stack.perfTooling.join(', ') : '**absent**'}`,
        ]),
        competing.length
          ? section('⚠ FACT-BLOCK candidates (competing live conventions)', competing.map((k) => `- \`${k}\` — ${conv[k].note}`))
          : section('Competing conventions', ['- none detected; every convention below has a dominant winner']),
        section('Index coverage gaps (this brief is only as complete as these allow)', [
          `- skipped paths: ${meta.coverage.skipped.length}`,
          `- parse errors: ${meta.coverage.parseErrors.length}`,
          `- path aliases resolved: ${meta.coverage.aliasesResolved}`,
          meta.coverage.skipped.length || meta.coverage.parseErrors.length
            ? '- **a category reported empty may be empty, or may live in a skipped file — check `meta.json` before claiming exhaustive coverage**'
            : '- no gaps recorded',
        ]),
      ].join('\n');

      // -------------------------------------------------------- precedents
      const precedentBlocks = [];
      for (const c of categories) {
        for (const kind of ['component', 'hook', 'util']) {
          const set = q.precedentSet(idx, c.category, { kind, limit: 6 });
          if (!set.rows.length) {
            precedentBlocks.push(`### Precedent set — ${c.category} (${kind})   clusters: 0\nNONE-FOUND — probe: \`fe-index precedent "${c.category}" --kind ${kind}\` — hits: 0`);
            continue;
          }
          precedentBlocks.push(
            `### Precedent set — ${c.category} (${kind})   clusters: ${set.clusters}\n` +
              set.rows
                .map((r) => `${r.rank}. ${r.location} — hits: ${r.hits} — newest-blame: ${r.newestBlame} — deprecation: ${r.deprecation} — props: ${r.props} — comment-density: ${r.commentDensity}`)
                .join('\n')
          );
        }
      }
      const dupes = q.duplicates(idx, { limit: 15 });
      shards['10-precedents.md'] = [
        `# Precedent sets (ranked, mechanical)`,
        ``,
        `Rank order is dominance (call-site count) then recency. A deprecation-signalled candidate never ranks 1.`,
        `**Choosing anything other than #1 requires a stated reason.** \`NONE-FOUND\` rows carry the probe that proves it.`,
        ``,
        precedentBlocks.join('\n\n') || '_no categories inferred_',
        ``,
        section('Duplicate clusters already in this repo (existing reuse debt)', dupes.length
          ? dupes.map((c) => `- **${c.id}** (${c.kind}, ${c.size} members, ${c.totalUsage} call sites): ${c.members.map((m) => `${m.rank}. ${m.file}:${m.line} ${m.name}(${m.usageCount}×)${m.deprecated ? ' [deprecated]' : ''}`).join(' · ')}`)
          : ['- none']),
      ].join('\n');

      // ------------------------------------------------------- conventions
      shards['20-conventions.md'] = [
        `# Convention bank (mechanical counts across ${countedFiles} files)`,
        ``,
        `Each line is a count, not an opinion. A \`⚠ COMPETING\` line is a mid-migration signal:`,
        `**it is a FACT-BLOCK for a human, never a choice for an agent** — the legacy convention usually has more`,
        `hits precisely because it predates the migration.`,
        ``,
        section('Data & formatting', [
          verdictLine('date formatting', conv.dateFormatting),
          verdictLine('number formatting', conv.numberFormatting),
          verdictLine('null/absent handling', conv.nullHandling),
          verdictLine('wire casing', conv.wireCasing),
          verdictLine('error surface', conv.errorSurface),
        ]),
        section('Architecture', [
          verdictLine('client state', conv.clientState),
          verdictLine('server state', conv.serverState),
          verdictLine('styling', conv.styling),
          verdictLine('forms', conv.forms),
          verdictLine('i18n', conv.i18n),
        ]),
        section('Testing', [
          verdictLine('test queries', conv.testQueries),
          `- role-query vs test-id ratio: ${totals['test.getByRole'] || 0} : ${totals['test.getByTestId'] || 0}${(totals['test.getByTestId'] || 0) > (totals['test.getByRole'] || 0) ? ' — **test-id dominant; role queries would be the improvement, not the convention**' : ''}`,
          `- accessibility assertions in tests: ${totals['test.axe'] || 0}`,
        ]),
      ].join('\n');

      // ------------------------------------------------------------- state
      const drills = idx.graph.drills.slice(0, 12);
      const contexts = idx.components.filter((c) => (c.hooks || []).includes('useContext'));
      shards['30-state.md'] = [
        `# State topology (mechanical)`,
        ``,
        section('Libraries in play', [
          `- client state: ${meta.stack.state.length ? meta.stack.state.join(', ') : 'none installed'}`,
          `- server state: ${meta.stack.serverState.length ? meta.stack.serverState.join(', ') : 'none installed'}`,
          `- URL state usage: ${totals['url.searchParams'] || 0} search-param reads, ${totals['url.router'] || 0} router uses`,
        ]),
        section('Prop-drill chains (depth 3+, from the import/JSX graph)', drills.length
          ? drills.map((d) => `- depth ${d.depth} · \`${d.prop}\` · ${d.path.join(' → ')} · ${d.sites.join(' ')}`)
          : ['- none found at depth 3+']),
        section('Context consumers', contexts.length
          ? contexts.slice(0, 15).map((c) => `- ${c.file}:${c.line} — ${c.name}`)
          : ['- none']),
        section('Components in the neighbourhood that fetch', hood.entities.filter((e) => e.fetches).length
          ? hood.entities.filter((e) => e.fetches).map((e) => `- ${e.file}:${e.line} — ${e.name}`)
          : ['- none']),
      ].join('\n');

      // ------------------------------------------------------------ routes
      const routeFiles = idx.files.filter((f) => /(^|\/)(app|pages)\//.test(f.path));
      const hasBoundary = (dir, kind) => routeFiles.some((f) => f.path.startsWith(dir) && new RegExp(`/${kind}\\.[jt]sx?$`).test(f.path));
      const segments = [...new Set(routeFiles.map((f) => f.path.replace(/\/[^/]+$/, '')))].sort();
      shards['40-routes.md'] = [
        `# Routes & boundaries (mechanical)`,
        ``,
        `Router mode: **${meta.stack.router}**${/mid-migration/.test(meta.stack.router) ? ' — ⚠ mid-migration is a FACT-BLOCK, not a free choice' : ''}`,
        ``,
        section('Route segments and boundary coverage', segments.length
          ? segments.slice(0, 40).map((s) => {
              const gaps = ['loading', 'error', 'not-found'].filter((k) => !hasBoundary(s, k));
              return `- \`${s}\` — ${gaps.length ? `**missing: ${gaps.join(', ')}**` : 'loading + error + not-found present'}`;
            })
          : ['- no app/ or pages/ routes found']),
        section("'use client' boundary placement", idx.files.filter((f) => (f.directives || []).includes('use client')).length
          ? idx.files.filter((f) => (f.directives || []).includes('use client')).slice(0, 30).map((f) => `- ${f.path}${/(layout|page)\.[jt]sx?$/.test(f.path) ? ' — ⚠ at a page/layout root: the whole subtree below becomes client code' : ''}`)
          : ['- no client boundaries declared']),
      ].join('\n');

      // ----------------------------------------------------- design tokens
      const styleSignals = idx.signals.filter((s) => s.id.startsWith('STYLE'));
      shards['50-design-tokens.md'] = [
        `# Design system (mechanical)`,
        ``,
        section('Token source', [
          `- colour tokens found: ${meta.tokens.colors}`,
          `- CSS custom properties: ${meta.tokens.cssVars}`,
          ...(meta.tokens.sources.length ? meta.tokens.sources.map((s) => `- source: \`${s.file}\` (${s.vars} definitions)`) : ['- **no token source found — every colour in this repo is a literal**']),
        ]),
        section('Styling system', [verdictLine('styling', conv.styling), `- UI kit: ${meta.stack.ui.length ? meta.stack.ui.join(', ') : 'none'}`]),
        section(`Token violations already in the repo (${styleSignals.length})`, styleSignals.length
          ? styleSignals.slice(0, 20).map((s) => `- ${s.id} · ${s.file}:${s.line}`)
          : ['- none']),
      ].join('\n');

      // -------------------------------------------------------------- risk
      const hoodFiles = [...hood.files];
      const hoodSignals = idx.signals.filter((s) => hoodFiles.some((f) => s.file === f));
      const bySeverity = (sev) => hoodSignals.filter((s) => s.severity === sev);
      const impacts = hoodFiles.slice(0, 8).map((f) => ({ file: f, impact: q.impact(idx, f) })).filter((x) => x.impact);
      shards['70-risk.md'] = [
        `# Risk in the neighbourhood (mechanical)`,
        ``,
        section('Blast radius of the files this feature is most likely to touch', impacts.length
          ? impacts.map((x) => `- \`${x.file}\` → ${x.impact.totalAffectedFiles} file(s), ${x.impact.routes.length} route(s)${x.impact.routes.length ? `: ${x.impact.routes.slice(0, 4).join(', ')}` : ''}`)
          : ['- none computed']),
        section('Existing mechanical findings in these files', [
          `- critical: ${bySeverity('critical').length} · high: ${bySeverity('high').length} · medium: ${bySeverity('medium').length} · low: ${bySeverity('low').length}`,
          ...hoodSignals
            .filter((s) => s.severity === 'critical' || s.severity === 'high')
            .slice(0, 25)
            .map((s) => `- ${s.severity.toUpperCase()} ${s.id} · ${s.file}:${s.line}${s.heuristic ? ' [heuristic — confirm by reading]' : ''} — ${s.message}`),
        ]),
        section('Orphaned exports nearby (possible abandoned prior attempts)', idx.graph.orphans.filter((o) => hoodFiles.includes(o.file)).length
          ? idx.graph.orphans.filter((o) => hoodFiles.includes(o.file)).map((o) => `- ${o.file}:${o.line} — ${o.name} (${o.kind})`)
          : ['- none']),
        section('Import cycles touching these files', idx.graph.cycles.filter((c) => c.some((f) => hoodFiles.includes(f))).length
          ? idx.graph.cycles.filter((c) => c.some((f) => hoodFiles.includes(f))).slice(0, 8).map((c) => `- ${c.join(' → ')}`)
          : ['- none']),
      ].join('\n');

      // --------------------------------------------------- open questions
      // Everything a program cannot decide. Naming these explicitly is what
      // keeps the brief from reading as though it answered them.
      shards['90-open-questions.md'] = [
        `# Open questions — a program cannot answer these`,
        ``,
        `The shards above are facts. **These are the judgement calls**, and they are exactly what the`,
        `annotating agents and the design panel exist to decide. An agent that treats this file as`,
        `already-answered has skipped its own job.`,
        ``,
        section('Always open', [
          '1. **Is the top-ranked precedent actually the right thing to reuse here?** The rank is mechanical (dominance + recency); whether it *fits this feature* is not.',
          '2. **What does each duplicate cluster member actually do differently?** The clustering proves structural similarity, never semantic equivalence — someone must read both.',
          '3. **Which UI states apply to this feature, and what should each say?** The state matrix is a design decision.',
          '4. **Where should the server/client boundary go for the new code?** The map shows where it is today, not where it belongs.',
          '5. **Is a flagged `[heuristic]` finding a real defect here?** Heuristic rules need a human read before being treated as fact.',
          '6. **Does the feature need a backend change?** The index sees only this repo.',
          '7. **Is a `usageCount: 0` entity genuinely dead?** A package export, a dynamic import, or a registry lookup all read as zero.',
        ]),
        competing.length
          ? section('Open because the repo disagrees with itself (FACT-BLOCK)', competing.map((k) => `- **${k}** — ${conv[k].note}`))
          : '',
        caps.length ? section('Degradations in this brief', caps.map((c) => `- ${c}`)) : '',
      ].join('\n');

      // ------------------------------------------------------------- index
      const shardNames = Object.keys(shards).sort();
      const manifestLines = shardNames.map((n) => {
        const t = estimateTokens(shards[n]);
        return `| \`${n}\` | ~${t} | ${SHARD_PURPOSE[n] || ''} |`;
      });
      shards['INDEX.md'] = [
        `# Feature brief — shard index`,
        ``,
        `**Read \`00-DIGEST.md\` always. Read only the shards your role needs.** Reading all of them`,
        `costs ~${shardNames.reduce((s, n) => s + estimateTokens(shards[n]), 0)} tokens; most roles need under a quarter of that.`,
        ``,
        `| shard | ~tokens | who needs it |`,
        `| ----- | ------- | ------------ |`,
        ...manifestLines,
        ``,
        `## Routing`,
        ``,
        ...Object.entries(ROLE_ROUTING).map(([role, list]) => `- **${role}** → ${list.map((s) => `\`${s}\``).join(', ')}`),
      ].join('\n');

      return { shards, meta, categories, conventions: conv, neighbourhood: hood, caps };
    });
}

const SHARD_PURPOSE = {
  '00-DIGEST.md': 'everyone — always',
  '10-precedents.md': 'component/utils explorers, architect, implementers, reuse-auditor',
  '20-conventions.md': 'implementers, code-reviewer, spec-writer',
  '30-state.md': 'state expert, state implementer, data-fetching work',
  '40-routes.md': 'rsc expert, route work, error-boundary coverage',
  '50-design-tokens.md': 'styling expert, style implementer, visual auditor',
  '70-risk.md': 'architect, red-team, perf/a11y auditors',
  '90-open-questions.md': 'everyone — this is what you are being paid to decide',
};

// Which shards each role reads. This table is the mechanism that replaced
// broadcasting the whole pack to eleven experts.
const ROLE_ROUTING = {
  'fe-architect': ['00', '10', '30', '40', '70', '90'],
  'fe-react-expert': ['00', '70', '90'],
  'fe-rsc-expert': ['00', '40', '90'],
  'fe-state-expert': ['00', '30', '90'],
  'fe-styling-expert': ['00', '50', '90'],
  'fe-a11y-expert': ['00', '90'],
  'fe-perf-expert': ['00', '70', '90'],
  'fe-api-contract-expert': ['00', '10', '90'],
  'fe-ux-analyst': ['00', '90'],
  'fe-security-expert': ['00', '70', '90'],
  'fe-devils-advocate': ['00', '90'],
  'fe-spec-writer': ['00', '20', '90'],
  'fe-component-implementer': ['00', '10', '20'],
  'fe-state-implementer': ['00', '10', '20', '30'],
  'fe-style-implementer': ['00', '20', '50'],
  'fe-test-author': ['00', '20'],
  'fe-code-reviewer': ['00', '10', '20'],
  'fe-reuse-auditor': ['00', '10'],
  'fe-red-team': ['00', '70'],
};

function writeBrief(root, featureText, outDir, opts = {}) {
  return buildBrief(root, featureText, opts).then((res) => {
    const dir = outDir || path.join(root, '.lazysitter', 'index', 'brief');
    fs.mkdirSync(dir, { recursive: true });
    const written = [];
    for (const [name, body] of Object.entries(res.shards)) {
      const file = path.join(dir, name);
      fs.writeFileSync(file, body.replace(/\n{3,}/g, '\n\n') + '\n', 'utf8');
      written.push({ name, path: file, tokens: estimateTokens(body) });
    }
    return Object.assign({}, res, { dir, written });
  });
}

module.exports = { buildBrief, writeBrief, inferCategories, tokenize, ROLE_ROUTING, STOPWORDS };
