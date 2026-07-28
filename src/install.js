'use strict';

const path = require('path');
const { log, c, exists, readFile } = require('./util');
const { InstallCtx } = require('./context');
const { loadRoster } = require('./roster');
const { resolveTargetRoot, resolveTools } = require('./detect');
const { installClaude } = require('./install-claude');
const { installCodex } = require('./install-codex');
const { installCursor } = require('./install-cursor');
const { installKnowledge } = require('./install-knowledge');
const { warnIfKnowledgeGitignored } = require('./gitignore-check');

function install(pkgRoot, opts) {
  const version = JSON.parse(readFile(path.join(pkgRoot, 'package.json'))).version;
  const targetRoot = resolveTargetRoot(opts.dir);
  const tools = resolveTools(opts, targetRoot);
  const mode = exists(path.join(targetRoot, '.lazysitter', 'manifest.json')) ? 'update' : 'install';

  log.info('');
  log.info(`${c.bold('Autonomous Engineering Team')} ${c.dim('v' + version)}`);
  log.info(`  ${mode === 'update' ? 'Updating' : 'Installing'} into ${c.bold(targetRoot)}`);
  log.info(`  Adapters: ${c.cyan(tools.join(' + '))}`);
  log.info('');

  const data = loadRoster(path.join(pkgRoot, 'core'));
  const manifestPath = path.join(targetRoot, '.lazysitter', 'manifest.json');
  let priorManifest = null;
  if (exists(manifestPath)) {
    try {
      priorManifest = JSON.parse(readFile(manifestPath));
    } catch (err) {
      log.err(`Could not parse ${manifestPath}: ${err.message}`);
      log.err('Run `lazysitter uninstall --purge` and reinstall, or fix the manifest by hand.');
      process.exitCode = 1;
      return { targetRoot, tools, mode };
    }
  }
  const ctx = new InstallCtx(targetRoot, pkgRoot, opts, priorManifest);

  try {
    if (tools.includes('claude')) installClaude(ctx, data);
    if (tools.includes('codex')) installCodex(ctx, data);
    if (tools.includes('cursor')) installCursor(ctx, data);

    installKnowledge(ctx);
  } finally {
    ctx.writeManifest(version, tools);
  }
  try {
    warnIfKnowledgeGitignored(targetRoot);
  } catch (err) {
    log.warn(`  gitignore check failed: ${err.message}`);
  }
  printNextSteps(tools, data.agents.length);
  return { targetRoot, tools, mode };
}

function printNextSteps(tools, agentCount) {
  log.info('');
  log.ok(`${c.bold('LazySitter installed')} — ${agentCount} agents across the pipeline.`);
  log.info('');
  log.info(c.bold('Next steps:'));
  if (tools.includes('cursor')) {
    log.info(`  ${c.cyan('Cursor')}       run ${c.bold('/lsi <feature request>')} (or say "run LazySitter on <feature>").`);
    log.info(`               e.g. ${c.dim('/lsi Add CSV export to the analytics dashboard --dry-run')}`);
    log.info(`               Models are pinned per agent; edit ${c.dim('.cursor/lazysitter/models.json')} to change them.`);
  }
  if (tools.includes('claude')) {
    log.info(`  ${c.cyan('Claude Code')}  run ${c.bold('/lsi <feature request>')} in your project.`);
    log.info(`               e.g. ${c.dim('/lsi Add CSV export to the analytics dashboard --dry-run')}`);
  }
  if (tools.includes('codex')) {
    log.info(`  ${c.cyan('Codex')}        open ${c.bold('codex')} and say "run LazySitter on <feature>".`);
    log.info(`               Set model slugs in ${c.dim('.codex/skills/lazysitter/models.env')} first`);
    log.info(`               (esp. MODEL_HIGH_ALT for a distinct red-team model).`);
  }
  log.info('');
  log.info(
    `  Kill switch: create ${c.dim('.cursor/lazysitter/KILL')}, ${c.dim('.claude/lazysitter/KILL')}, or ${c.dim('.codex/lazysitter/KILL')} to halt.`
  );
  log.info(`  Uninstall:   ${c.dim('npx lazysitter uninstall')}`);
  log.info('');
}

module.exports = { install };
