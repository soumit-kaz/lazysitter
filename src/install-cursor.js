'use strict';

const path = require('path');
const { log, readFile, exists } = require('./util');
const fm = require('./frontmatter');

// Render the Cursor adapter. Cursor natively reads `.cursor/agents/*.md` subagents
// and `.cursor/commands/*.md` slash commands, so LazySitter installs the SAME
// structure it gives Claude Code: one definition file per agent (with its own
// pinned model + readonly scope) plus a real `/lsi` orchestrator command carrying
// the full playbook. Everything is derived from the single-source roster so the
// three adapters never drift.
function installCursor(ctx, data) {
  log.step('Cursor adapter → .cursor/');

  // Resolve the tier→model map. A user-edited copy at the target wins over the
  // shipped default (same preserve semantics as Codex's models.env), so agent
  // frontmatter is baked from the model IDs the user actually wants.
  const coreModels = JSON.parse(readFile(path.join(ctx.coreDir, 'cursor', 'models.json')));
  const targetModels = ctx.abs('.cursor/lazysitter/models.json');
  const models = exists(targetModels) ? JSON.parse(readFile(targetModels)) : coreModels;

  // Per-agent Cursor subagent definitions — structural parity with .claude/agents/.
  for (const agent of data.agents) {
    ctx.write(`.cursor/agents/${agent.file}`, cursorAgentFile(agent, models));
  }

  // The orchestrator as a native Cursor slash command (/lsi), carrying the full
  // Claude playbook with paths retargeted to .cursor/.
  const orchRaw = readFile(path.join(ctx.coreDir, 'orchestrator.claude.md'));
  ctx.write('.cursor/commands/lsi.md', cursorCommand(orchRaw, models));

  // A rule so "run LazySitter" (without the slash command) still triggers the pipeline.
  ctx.copy(path.join(ctx.coreDir, 'cursor', 'LazySitter.rule.mdc'), '.cursor/rules/lazysitter.mdc');

  // Local docs.
  ctx.copy(path.join(ctx.templatesDir, 'Cursor-LazySitter-README.md'), '.cursor/lazysitter/README.md');

  // User-editable model map + seeded process-pitfall ledger — preserved across updates.
  ctx.writePreserve('.cursor/lazysitter/models.json', JSON.stringify(coreModels, null, 2) + '\n');
  ctx.writePreserve(
    '.cursor/lazysitter/PITFALL-LEDGER.md',
    readFile(path.join(ctx.coreDir, 'PITFALL-LEDGER.seed.md'))
  );
}

// Map an agent to its Cursor model ID. The red-team (distinctModel) uses the
// `high_alt` slot so it never shares the build lineage's blind spots.
function resolveModel(agent, models) {
  const tier = agent.distinctModel ? 'high_alt' : agent.tier;
  return models[tier] || models.mid || 'inherit';
}

function cursorAgentFile(agent, models) {
  const model = resolveModel(agent, models);
  // Cursor has no per-agent tools allow-list; `readonly` is the scoping knob.
  // Anything that only inspects/analyzes runs read-only; producers/implementers/
  // git-mutating agents get write.
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

// Build the /lsi command body from the Claude orchestrator: retarget .claude paths
// to .cursor and prepend a short Cursor-specific spawn contract.
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

// Quote a value for a single-line YAML frontmatter field.
function yamlQuote(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

module.exports = { installCursor };
