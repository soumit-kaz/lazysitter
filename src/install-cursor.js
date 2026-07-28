'use strict';

const path = require('path');
const { log, readFile, readFileCapped, exists } = require('./util');
const fm = require('./frontmatter');

function installCursor(ctx, data) {
  log.step('Cursor adapter → .cursor/');

  const coreModels = JSON.parse(readFile(path.join(ctx.coreDir, 'cursor', 'models.json')));
  const targetModels = ctx.abs('.cursor/lazysitter/models.json');
  let rawModels = coreModels;
  if (exists(targetModels)) {
    try {
      rawModels = JSON.parse(readFileCapped(targetModels));
    } catch (err) {
      log.warn(`  could not read/parse .cursor/lazysitter/models.json (${err.message}) — falling back to the shipped defaults.`);
      rawModels = coreModels;
    }
  }
  const models = sanitizeModels(rawModels, coreModels);

  for (const agent of data.agents) {
    ctx.write(`.cursor/agents/${agent.file}`, cursorAgentFile(agent, models));
  }

  const orchRaw = readFile(path.join(ctx.coreDir, 'orchestrator.claude.md'));
  ctx.write('.cursor/commands/lsi.md', cursorCommand(orchRaw, models));

  ctx.copy(path.join(ctx.coreDir, 'cursor', 'LazySitter.rule.mdc'), '.cursor/rules/lazysitter.mdc');

  ctx.copy(path.join(ctx.templatesDir, 'Cursor-LazySitter-README.md'), '.cursor/lazysitter/README.md');

  ctx.writePreserve('.cursor/lazysitter/models.json', JSON.stringify(coreModels, null, 2) + '\n');
  ctx.writePreserve(
    '.cursor/lazysitter/PITFALL-LEDGER.md',
    readFile(path.join(ctx.coreDir, 'PITFALL-LEDGER.seed.md'))
  );
  ctx.writePreserve(
    '.cursor/lazysitter/lazysitter.config.json',
    readFile(path.join(ctx.coreDir, 'cursor', 'lazysitter.config.json'))
  );
}

const MODEL_ID_RE = /^[A-Za-z0-9._:@\/-]+$/;

const FABLE_RE = /fable/i;

function sanitizeModels(rawModels, fallbackModels) {
  const out = {};
  for (const tier of ['high', 'high_alt', 'mid', 'low']) {
    const value = rawModels && rawModels[tier];
    const isFable = typeof value === 'string' && FABLE_RE.test(value);
    if (typeof value === 'string' && MODEL_ID_RE.test(value) && !isFable) {
      out[tier] = value;
      continue;
    }
    const fallback = fallbackModels && fallbackModels[tier];
    if (typeof fallback === 'string' && MODEL_ID_RE.test(fallback) && !FABLE_RE.test(fallback)) {
      out[tier] = fallback;
    } else {
      out[tier] = 'inherit';
    }
    if (value !== undefined && isFable) {
      log.warn(`  refused Fable model id for tier "${tier}" in .cursor/lazysitter/models.json: ${JSON.stringify(value)} — Fable is never used in any tier (C22)`);
    } else if (value !== undefined) {
      log.warn(`  refused invalid model id for tier "${tier}" in .cursor/lazysitter/models.json: ${JSON.stringify(value)}`);
    }
  }
  return out;
}

function resolveModel(agent, models) {
  const tier = agent.distinctModel ? 'high_alt' : agent.tier;
  return models[tier] || models.mid || 'inherit';
}

function cursorAgentFile(agent, models) {
  const model = resolveModel(agent, models);
  const readonly = agent.codexSandbox === 'read-only';

  const front = [
    '---',
    `name: ${agent.name}`,
    `description: ${yamlQuote(agent.description)}`,
    `model: ${model}`,
    `readonly: ${readonly}`,
    '---',
    '',
  ].join('\n');

  return front + '\n' + agent.body.trimStart();
}

function cursorCommand(orchRaw, models) {
  const { data, body } = fm.parse(orchRaw);
  const retargeted = body.replace(/\.claude\/lazysitter/g, '.cursor/lazysitter');

  const front = [
    '---',
    `description: ${yamlQuote(data.description || 'Run the LazySitter Autonomous Engineering Team pipeline end-to-end.')}`,
    '---',
    '',
  ].join('\n');

  const cursorContract = [
    '# LazySitter on Cursor — spawn contract (read first)',
    '',
    'You are the Tier-0 orchestrator. Spawn each specialized agent with the `Task` tool,',
    'using the matching `subagent_type` from `.cursor/agents/` (e.g. `lazysitter-architect`,',
    '`lazysitter-red-team`). Each agent file pins its OWN model and `readonly` scope — do',
    'not override them. Run agents in parallel wherever the pipeline says so.',
    '',
    'Cursor allows one level of nested spawning; LazySitter forbids it. **No agent you spawn',
    'may spawn another** — you are the only hub. If a run directory or artifact is needed,',
    'agents self-persist under `.cursor/lazysitter/runs/<slug>/`.',
    '',
    `Models are pinned per-agent (high=\`${models.high}\`, high_alt=\`${models.high_alt}\`,`,
    `mid=\`${models.mid}\`, low=\`${models.low}\`). Edit \`.cursor/lazysitter/models.json\` and`,
    'run `lazysitter update` to change them.',
    '',
    'Feature request: **$ARGUMENTS**',
    '',
    '---',
    '',
  ].join('\n');

  return front + cursorContract + retargeted.trimStart();
}

function yamlQuote(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

module.exports = { installCursor };
