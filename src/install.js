'use strict';

const path = require('path');
const { log, c, exists, readFile } = require('./util');
const { InstallCtx } = require('./context');
const { loadRoster, loadSkills } = require('./roster');
const { resolveTargetRoot, resolveTools } = require('./detect');
const { installClaude } = require('./install-claude');
const { installFrontend, printFrontendNextSteps } = require('./install-fe');
const { installCodex } = require('./install-codex');
const { installCursor } = require('./install-cursor');
const { installKnowledge } = require('./install-knowledge');
const { warnIfKnowledgeGitignored } = require('./gitignore-check');
const { pruneOrphans, teamOfPath } = require('./prune');

function install(pkgRoot, opts) {
  const version = JSON.parse(readFile(path.join(pkgRoot, 'package.json'))).version;
  const targetRoot = resolveTargetRoot(opts.dir);
  const tools = resolveTools(opts, targetRoot);
  const mode = exists(path.join(targetRoot, '.lazysitter', 'manifest.json')) ? 'update' : 'install';

  // `--frontend` alone installs only the frontend team. Add `--general` to get
  // both side by side; without `--frontend` the general team installs as before.
  const wantFrontend = !!opts.frontend;
  const wantGeneral = !wantFrontend || !!opts.general;

  if (wantFrontend && !tools.includes('claude')) {
    log.warn('The frontend team ships for the Claude Code adapter only — enabling it for this install.');
    tools.push('claude');
  }
  if (wantFrontend && (tools.includes('codex') || tools.includes('cursor'))) {
    log.warn('Codex and Cursor adapters receive the general team only; the frontend team is Claude Code for now.');
  }

  log.info('');
  log.info(`${c.bold('Autonomous Engineering Team')} ${c.dim('v' + version)}`);
  log.info(`  ${mode === 'update' ? 'Updating' : 'Installing'} into ${c.bold(targetRoot)}`);
  log.info(`  Adapters: ${c.cyan(tools.join(' + '))}`);
  log.info(`  Teams:    ${c.cyan([wantGeneral && 'general', wantFrontend && 'frontend'].filter(Boolean).join(' + '))}`);
  log.info('');

  const data = wantGeneral ? loadRoster(path.join(pkgRoot, 'core')) : { agents: [] };
  const feData = wantFrontend ? loadRoster(path.join(pkgRoot, 'core'), 'frontend') : { agents: [] };
  const feSkills = wantFrontend ? loadSkills(path.join(pkgRoot, 'core'), 'frontend') : [];
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
    if (wantGeneral) {
      if (tools.includes('claude')) installClaude(ctx, data);
      if (tools.includes('codex')) installCodex(ctx, data);
      if (tools.includes('cursor')) installCursor(ctx, data);
    }
    if (wantFrontend) installFrontend(ctx, feData, feSkills);

    installKnowledge(ctx);

    if (priorManifest && Array.isArray(priorManifest.managed) && priorManifest.managed.length) {
      const freshPaths = ctx.manifest.managed.map((entry) => entry.path);
      const { kept } = pruneOrphans(targetRoot, priorManifest.managed, freshPaths, tools, {
        general: wantGeneral,
        frontend: wantFrontend,
      });
      // Carry forward two classes of prior entry so they stay tracked:
      // orphans prune declined to delete, and files belonging to a team this
      // run did not install. Dropping the latter would leave the other team's
      // files on disk but invisible to `doctor` and `uninstall`.
      const freshSet = new Set(freshPaths);
      const keptSet = new Set(kept);
      for (const entry of priorManifest.managed) {
        if (!entry || typeof entry.path !== 'string') continue;
        if (freshSet.has(entry.path)) continue;
        const otherTeam =
          (teamOfPath(entry.path) === 'general' && !wantGeneral) ||
          (teamOfPath(entry.path) === 'frontend' && !wantFrontend);
        if (keptSet.has(entry.path) || otherTeam) ctx.manifest.managed.push(entry);
      }
    }
  } finally {
    // The manifest records what is present on disk, not merely what this run
    // wrote — a team left in place by an earlier install is still installed,
    // and `doctor`/`uninstall`/`update` must keep seeing it.
    const priorTeams = (priorManifest && priorManifest.teams) || {};
    ctx.writeManifest(version, tools, {
      general: wantGeneral || priorTeams.general === true,
      frontend: wantFrontend || priorTeams.frontend === true,
    });
  }
  try {
    warnIfKnowledgeGitignored(targetRoot);
  } catch (err) {
    log.warn(`  gitignore check failed: ${err.message}`);
  }
  if (wantGeneral) printNextSteps(tools, data.agents.length);
  if (wantFrontend) printFrontendNextSteps(feData.agents.length, feSkills.length);
  return { targetRoot, tools, mode, teams: { general: wantGeneral, frontend: wantFrontend } };
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
