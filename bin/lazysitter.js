#!/usr/bin/env node
'use strict';

const path = require('path');
const { log, c, exists, readFile } = require('../src/util');

const PKG_ROOT = path.join(__dirname, '..');
const VERSION = JSON.parse(readFile(path.join(PKG_ROOT, 'package.json'))).version;

function parseArgs(argv) {
  const flags = {};
  const positionals = [];
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [k, v] = arg.slice(2).split('=');
      flags[k] = v === undefined ? true : v;
    } else {
      positionals.push(arg);
    }
  }
  return { flags, positionals };
}

function main() {
  const { flags, positionals } = parseArgs(process.argv.slice(2));
  let cmd = positionals[0] || 'init';
  const dirArg = positionals[1];

  if (flags.version || flags.v || cmd === 'version') return console.log(VERSION);
  if (flags.help || flags.h || cmd === 'help') return help();

  const opts = {
    dir: dirArg,
    claude: !!flags.claude,
    codex: !!flags.codex,
    cursor: !!flags.cursor,
    frontend: !!flags.frontend || !!flags.fe,
    general: !!flags.general,
    force: !!flags.force,
    purge: !!flags.purge,
    purgeKnowledge: !!flags['purge-knowledge'],
    forceUnverified: !!flags['force-unverified'],
  };

  // Commands where knowing you're on a stale npx-cached copy matters.
  let notifyStale = false;

  switch (cmd) {
    case 'init':
    case 'install':
      require('../src/install').install(PKG_ROOT, opts);
      notifyStale = true;
      break;
    case 'update': {
      // Reuse the adapters recorded in the existing manifest.
      const mf = manifestFor(opts.dir);
      if (mf) {
        opts.claude = mf.tools.includes('claude');
        opts.codex = mf.tools.includes('codex');
        opts.cursor = mf.tools.includes('cursor');
        // Teams recorded at install time are reused, so `update` never silently
        // adds or drops a team the user did not ask for. A manifest predating
        // the field is a general-only install.
        const teams = mf.teams || { general: true, frontend: false };
        opts.frontend = opts.frontend || !!teams.frontend;
        opts.general = opts.general || teams.general !== false;
      }
      require('../src/install').install(PKG_ROOT, opts);
      notifyStale = true;
      break;
    }
    case 'uninstall':
    case 'remove':
      require('../src/uninstall').uninstall(PKG_ROOT, opts);
      break;
    case 'doctor':
    case 'check':
      require('../src/doctor').doctor(PKG_ROOT, opts);
      notifyStale = true;
      break;
    case 'list':
    case 'roster':
      listRoster(flags);
      break;
    case 'fe-index': {
      const sub = positionals[1];
      if (!sub || flags.help) return require('../src/fe-index/cli').help();
      const root = path.resolve(flags.dir || process.cwd());
      const feFlags = Object.assign({ _rest: positionals.slice(2).join(' ') || null }, flags);
      require('../src/fe-index/cli')
        .run(root, sub, feFlags)
        .catch((err) => {
          log.err(err.message);
          process.exitCode = 1;
        });
      return;
    }
    case 'fe-session': {
      const sub = positionals[1];
      if (!sub || flags.help) return require('../src/fe-session-cli').help();
      const cwd = path.resolve(flags.dir || process.cwd());
      // The run directory is anchored to the repo root, never to cwd — the same
      // rule the orchestrator follows, so a session started from a subdirectory
      // still finds its own run.
      const { findGitRoot } = require('../src/util');
      const root = findGitRoot(cwd) || cwd;
      const sFlags = Object.assign({ _rest: positionals.slice(2).join(' ') || null }, flags);
      try {
        require('../src/fe-session-cli').run(root, cwd, sub, sFlags);
      } catch (err) {
        log.err(err.message);
        process.exitCode = 1;
      }
      return;
    }
    default:
      log.err(`Unknown command: ${cmd}`);
      help();
      process.exitCode = 1;
  }

  // Fire-and-forget freshness check (offline-safe, ~2.5s cap). Keeps the event loop
  // alive only until the probe resolves, then the process exits with its set code.
  if (notifyStale) {
    require('../src/version').printUpdateNoticeIfStale(PKG_ROOT, log, c);
  }
}

function manifestFor(dir) {
  const p = path.join(path.resolve(dir || process.cwd()), '.lazysitter', 'manifest.json');
  return exists(p) ? JSON.parse(readFile(p)) : null;
}

function listRoster(flags) {
  const { loadRoster, loadSkills } = require('../src/roster');
  const kind = flags && (flags.frontend || flags.fe) ? 'frontend' : 'general';
  const { agents, roster } = loadRoster(path.join(PKG_ROOT, 'core'), kind);
  const width = Math.max(26, ...agents.map((a) => a.name.length));
  log.info('');
  log.info(
    `${c.bold(kind === 'frontend' ? 'LazySitter frontend roster' : 'LazySitter roster')} — ${agents.length} agents` +
      (kind === 'frontend' ? c.dim('  (React/Next only)') : '')
  );
  log.info('');
  log.info(`  ${'agent'.padEnd(width)} ${'tier'.padEnd(6)} ${'wave'.padEnd(14)} ${'codex sandbox'.padEnd(16)} approval`);
  log.info(`  ${'-'.repeat(width)} ${'-'.repeat(6)} ${'-'.repeat(14)} ${'-'.repeat(16)} ${'-'.repeat(10)}`);
  for (const a of agents) {
    const cfg = roster.agents[a.name] || {};
    const flag = a.distinctModel ? c.yellow(' ⚑ distinct-model') : '';
    log.info(
      `  ${a.name.padEnd(width)} ${a.tier.padEnd(6)} ${(cfg.wave || '-').padEnd(14)} ${a.codexSandbox.padEnd(16)} ${a.codexApproval}${flag}`
    );
  }
  if (kind === 'frontend') {
    const skills = loadSkills(path.join(PKG_ROOT, 'core'), 'frontend');
    log.info('');
    log.info(`${c.bold('Skills')} — ${skills.length}`);
    log.info('');
    for (const s of skills) log.info(`  ${s.name.padEnd(width)} ${c.dim(s.description.slice(0, 84))}`);
  }
  log.info('');
}

function help() {
  log.info(`
${c.bold('lazysitter')} — install the Autonomous Engineering Team into a project (Cursor + Claude Code + Codex)

${c.bold('Usage')}
  npx lazysitter <command> [dir] [flags]

${c.bold('Commands')}
  init [dir]        Install LazySitter into a project (default). Auto-detects Cursor/Claude/Codex.
  update [dir]      Refresh managed files; keeps your models.env / config edits.
  uninstall [dir]   Remove LazySitter. Add --purge to also delete your config.
  doctor [dir]      Verify the install, tool availability, and model tiering.
  list              Print the agent roster with tiers and sandboxes. Add --frontend for the FE team.
  fe-index <sub>    The frontend component/hook/util index. Run ${c.dim('fe-index --help')} for its commands.
  fe-session <sub>  Resume a run in a new session; run several sessions safely. ${c.dim('fe-session --help')}
  help · version

${c.bold('Teams')}
  --frontend        Install the frontend team (41 React/Next specialists + 31 skills, /lsife).
                    Alone, it installs ONLY the frontend team. Claude Code adapter.
  --general         Keep the general 28-agent team too. Combine with --frontend for both.
                    (Default when --frontend is absent.)

${c.bold('Flags')}
  --claude          Install only the Claude Code adapter.
  --codex           Install only the Codex adapter.
  --cursor          Install only the Cursor adapter.
  --purge           (uninstall) also remove user config (models.env, lazysitter.config.json).
  --purge-knowledge (uninstall, with --purge) also remove .lazysitter/knowledge/ (committed
                    institutional memory). Ignored without --purge.
  --force-unverified (uninstall) remove managed entries recorded in a manifest that predates
                    the sha256 field, without an integrity check. Use only if you trust the
                    manifest; without it, such entries are left on disk and the manifest is kept.
  --force           Overwrite without prompting.

${c.bold('Examples')}
  npx lazysitter init                        ${c.dim('# general team, all detected adapters')}
  npx lazysitter init . --frontend           ${c.dim('# frontend team only (React/Next)')}
  npx lazysitter init . --frontend --general ${c.dim('# both teams, side by side')}
  npx lazysitter init . --codex              ${c.dim('# Codex only')}
  npx lazysitter list --frontend             ${c.dim('# the FE roster + skills')}
  npx lazysitter fe-index build              ${c.dim('# build the frontend index')}
  npx lazysitter doctor
  npx lazysitter uninstall --purge

${c.bold('Always the latest')}
  npx -y "github:soumit-kaz/lazysitter#semver:*" update   ${c.dim('# highest release tag; bypasses the npx cache')}
  ${c.dim('(npm @latest does not apply to github: specs — use #semver:* or #main.)')}
  ${c.dim('init/update/doctor also warn when a newer version exists. Silence with LAZYSITTER_NO_UPDATE_CHECK=1.')}
`);
}

main();
