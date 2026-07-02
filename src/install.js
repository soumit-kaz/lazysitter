'use strict';

const path = require('path');
const { log, c, exists, readFile } = require('./util');
const { InstallCtx } = require('./context');
const { loadRoster } = require('./roster');
const { resolveTargetRoot, resolveTools } = require('./detect');
const { installClaude } = require('./install-claude');
const { installCodex } = require('./install-codex');

function install(pkgRoot, opts) {
  const version = JSON.parse(readFile(path.join(pkgRoot, 'package.json'))).version;
  const targetRoot = resolveTargetRoot(opts.dir);
  const tools = resolveTools(opts, targetRoot);
  const mode = exists(path.join(targetRoot, '.aet', 'manifest.json')) ? 'update' : 'install';

  log.info('');
  log.info(`${c.bold('Autonomous Engineering Team')} ${c.dim('v' + version)}`);
  log.info(`  ${mode === 'update' ? 'Updating' : 'Installing'} into ${c.bold(targetRoot)}`);
  log.info(`  Adapters: ${c.cyan(tools.join(' + '))}`);
  log.info('');

  const data = loadRoster(path.join(pkgRoot, 'core'));
  const ctx = new InstallCtx(targetRoot, pkgRoot, opts);

  if (tools.includes('claude')) installClaude(ctx, data);
  if (tools.includes('codex')) installCodex(ctx, data);

  ctx.writeManifest(version, tools);
  printNextSteps(tools, data.agents.length);
  return { targetRoot, tools, mode };
}

function printNextSteps(tools, agentCount) {
  log.info('');
  log.ok(`${c.bold('AET installed')} — ${agentCount} agents across the pipeline.`);
  log.info('');
  log.info(c.bold('Next steps:'));
  if (tools.includes('claude')) {
    log.info(`  ${c.cyan('Claude Code')}  run ${c.bold('/aet <feature request>')} in your project.`);
    log.info(`               e.g. ${c.dim('/aet Add CSV export to the analytics dashboard --dry-run')}`);
  }
  if (tools.includes('codex')) {
    log.info(`  ${c.cyan('Codex')}        open ${c.bold('codex')} and say "run AET on <feature>".`);
    log.info(`               Set model slugs in ${c.dim('.codex/skills/aet/models.env')} first`);
    log.info(`               (esp. MODEL_HIGH_ALT for a distinct red-team model).`);
  }
  log.info('');
  log.info(`  Kill switch: create ${c.dim('.claude/aet/KILL')} or ${c.dim('.codex/aet/KILL')} to halt.`);
  log.info(`  Uninstall:   ${c.dim('npx @newton/aet uninstall')}`);
  log.info('');
}

module.exports = { install };
