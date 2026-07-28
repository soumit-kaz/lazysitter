'use strict';

const path = require('path');
const { execFileSync } = require('child_process');
const { log, c, exists, readFile, sha256 } = require('./util');
const { warnIfKnowledgeGitignored } = require('./gitignore-check');

const CLAUDE_HIGH_TIER_AGENTS = [
  'lazysitter-architect',
  'lazysitter-security-expert',
  'lazysitter-security-auditor',
  'lazysitter-closing-loop-auditor',
  'lazysitter-devils-advocate',
];

function extractModel(text) {
  const m = /^model:\s*(\S+)/m.exec(text);
  return m ? m[1] : null;
}

function doctor(pkgRoot, opts) {
  const targetRoot = path.resolve(opts.dir || process.cwd());
  const manifestPath = path.join(targetRoot, '.lazysitter', 'manifest.json');

  log.info('');
  log.info(`${c.bold('LazySitter doctor')} — ${targetRoot}`);
  log.info('');

  if (!exists(manifestPath)) {
    log.err('No LazySitter install found here (.lazysitter/manifest.json missing).');
    log.info(`  Run ${c.dim('npx lazysitter init')} first.`);
    process.exitCode = 1;
    return;
  }

  const manifest = JSON.parse(readFile(manifestPath));
  log.info(`  Version: ${c.bold(manifest.aetVersion)}   Adapters: ${c.cyan(manifest.tools.join(' + '))}`);
  log.info('');

  // 1. Managed-file integrity.
  let missing = 0;
  let drifted = 0;
  for (const entry of manifest.managed) {
    const abs = path.join(targetRoot, entry.path);
    if (!exists(abs)) {
      log.err(`  missing: ${entry.path}`);
      missing++;
    } else if (sha256(readFile(abs)) !== entry.sha256) {
      log.warn(`  modified: ${entry.path}`);
      drifted++;
    }
  }
  if (!missing && !drifted) log.ok(`  ${manifest.managed.length} managed files present and unmodified.`);
  else log.info(`  ${c.dim(`${missing} missing, ${drifted} locally modified (re-run \`lazysitter update\` to restore)`)}`);
  log.info('');

  // 2. Tool availability.
  if (manifest.tools.includes('claude')) checkBinary('claude', 'Claude Code CLI');
  if (manifest.tools.includes('codex')) checkBinary('codex', 'Codex CLI');

  // 3. Cursor model tiering sanity (red-team must be distinct from the build lineage).
  if (manifest.tools.includes('cursor')) {
    const cursorModels = path.join(targetRoot, '.cursor/lazysitter/models.json');
    if (exists(cursorModels)) {
      try {
        const m = JSON.parse(readFile(cursorModels));
        if (!m.high_alt || m.high_alt === m.high) {
          log.warn('  Cursor high_alt equals high — red-team will share the architect\'s model (weaker independence).');
          log.info(`    ${c.dim('Set a distinct high_alt slug in .cursor/lazysitter/models.json, then run `lazysitter update`.')}`);
        } else {
          log.ok(`  Cursor red-team model set (high_alt=${m.high_alt}).`);
        }
      } catch {
        log.warn('  Cursor .cursor/lazysitter/models.json is not valid JSON.');
      }
    }
  }

  // 3b. Codex model tiering sanity.
  if (manifest.tools.includes('codex')) {
    const modelsEnv = path.join(targetRoot, '.codex/skills/lazysitter/models.env');
    if (exists(modelsEnv)) {
      const env = readFile(modelsEnv);
      const alt = /^MODEL_HIGH_ALT="?([^"\n]*)"?/m.exec(env);
      if (!alt || !alt[1].trim()) {
        log.warn('  MODEL_HIGH_ALT is blank — red-team will share the architect\'s model (weaker independence).');
        log.info(`    ${c.dim('Set a distinct high-tier slug in .codex/skills/lazysitter/models.env')}`);
      } else {
        log.ok(`  Red-team model set (MODEL_HIGH_ALT=${alt[1].trim()}).`);
      }
    }
  }

  if (manifest.tools.includes('claude')) {
    const redTeamPath = path.join(targetRoot, '.claude/agents/lazysitter-red-team.md');
    if (exists(redTeamPath)) {
      const redModel = extractModel(readFile(redTeamPath));
      const sharedWith = CLAUDE_HIGH_TIER_AGENTS.filter((name) => {
        const p = path.join(targetRoot, '.claude/agents', `${name}.md`);
        return exists(p) && extractModel(readFile(p)) === redModel;
      });
      if (sharedWith.length) {
        log.warn(
          `  Claude red-team model (${redModel}) equals the high-tier build/design lineage's model (${sharedWith.join(', ')}) — Claude Code has no per-tier config file, so red-team shares blind spots with that lineage (weaker independence).`
        );
        log.info(
          `    ${c.dim('If your Claude Code CLI supports pinning a distinct opus snapshot, edit .claude/agents/lazysitter-red-team.md model: directly (note: `lazysitter update` overwrites it).')}`
        );
      } else {
        log.ok(`  Claude red-team model set distinct from the high-tier lineage (model=${redModel}).`);
      }
    }
  }

  warnIfKnowledgeGitignored(targetRoot);

  log.info('');
  if (missing) process.exitCode = 1;
}

function checkBinary(bin, label) {
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(cmd, [bin], { stdio: 'ignore' });
    log.ok(`  ${label} found on PATH (${bin}).`);
  } catch {
    log.warn(`  ${label} not found on PATH (${bin}) — install it to run LazySitter.`);
  }
}

module.exports = { doctor };
