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
    force: !!flags.force,
    purge: !!flags.purge,
  };

  switch (cmd) {
    case 'init':
    case 'install':
      require('../src/install').install(PKG_ROOT, opts);
      break;
    case 'update': {
      // Reuse the adapters recorded in the existing manifest.
      const mf = manifestFor(opts.dir);
      if (mf) {
        opts.claude = mf.tools.includes('claude');
        opts.codex = mf.tools.includes('codex');
      }
      require('../src/install').install(PKG_ROOT, opts);
      break;
    }
    case 'uninstall':
    case 'remove':
      require('../src/uninstall').uninstall(PKG_ROOT, opts);
      break;
    case 'doctor':
    case 'check':
      require('../src/doctor').doctor(PKG_ROOT, opts);
      break;
    case 'list':
    case 'roster':
      listRoster();
      break;
    default:
      log.err(`Unknown command: ${cmd}`);
      help();
      process.exitCode = 1;
  }
}

function manifestFor(dir) {
  const p = path.join(path.resolve(dir || process.cwd()), '.aet', 'manifest.json');
  return exists(p) ? JSON.parse(readFile(p)) : null;
}

function listRoster() {
  const { loadRoster } = require('../src/roster');
  const { agents } = loadRoster(path.join(PKG_ROOT, 'core'));
  log.info('');
  log.info(`${c.bold('AET roster')} — ${agents.length} agents`);
  log.info('');
  log.info(`  ${'agent'.padEnd(26)} ${'tier'.padEnd(6)} ${'codex sandbox'.padEnd(16)} approval`);
  log.info(`  ${'-'.repeat(26)} ${'-'.repeat(6)} ${'-'.repeat(16)} ${'-'.repeat(10)}`);
  for (const a of agents) {
    const flag = a.distinctModel ? c.yellow(' ⚑ distinct-model') : '';
    log.info(
      `  ${a.name.padEnd(26)} ${a.tier.padEnd(6)} ${a.codexSandbox.padEnd(16)} ${a.codexApproval}${flag}`
    );
  }
  log.info('');
}

function help() {
  log.info(`
${c.bold('aet')} — install the Autonomous Engineering Team into a project (Claude Code + Codex)

${c.bold('Usage')}
  npx @newton/aet <command> [dir] [flags]

${c.bold('Commands')}
  init [dir]        Install AET into a project (default). Auto-detects Claude/Codex.
  update [dir]      Refresh managed files; keeps your models.env / config edits.
  uninstall [dir]   Remove AET. Add --purge to also delete your config.
  doctor [dir]      Verify the install, tool availability, and model tiering.
  list              Print the agent roster with tiers and sandboxes.
  help · version

${c.bold('Flags')}
  --claude          Install only the Claude Code adapter.
  --codex           Install only the Codex adapter.
  --purge           (uninstall) also remove user config (models.env, aet.config.json).
  --force           Overwrite without prompting.

${c.bold('Examples')}
  npx @newton/aet init                 ${c.dim('# both adapters, into the current repo')}
  npx @newton/aet init . --codex       ${c.dim('# Codex only')}
  npx @newton/aet doctor
  npx @newton/aet uninstall --purge
`);
}

main();
