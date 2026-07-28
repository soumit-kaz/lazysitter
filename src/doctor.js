'use strict';

const path = require('path');
const { execFileSync } = require('child_process');
const { log, c, exists, readFile, readFileCapped, sha256 } = require('./util');
const { warnIfKnowledgeGitignored } = require('./gitignore-check');

function readTargetFileSafely(abs) {
  if (!exists(abs)) return null;
  try {
    return readFileCapped(abs);
  } catch (err) {
    log.warn(`  could not read ${abs}: ${err.message}`);
    return null;
  }
}

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

  let manifest;
  try {
    manifest = JSON.parse(readFileCapped(manifestPath));
  } catch (err) {
    log.err(`Could not parse ${manifestPath}: ${err.message}`);
    log.err('Run `lazysitter uninstall --purge` and reinstall, or fix the manifest by hand.');
    process.exitCode = 1;
    return;
  }
  log.info(`  Version: ${c.bold(manifest.aetVersion)}   Adapters: ${c.cyan(manifest.tools.join(' + '))}`);
  log.info('');

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

  if (manifest.tools.includes('claude')) checkBinary('claude', 'Claude Code CLI');
  if (manifest.tools.includes('codex')) checkBinary('codex', 'Codex CLI');

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

  if (manifest.tools.includes('codex')) {
    const modelsEnv = path.join(targetRoot, '.codex/skills/lazysitter/models.env');
    const env = readTargetFileSafely(modelsEnv);
    if (env !== null) {
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

  const FABLE_RE = /fable/i;
  if (manifest.tools.includes('codex')) {
    const modelsEnv = path.join(targetRoot, '.codex/skills/lazysitter/models.env');
    const env = readTargetFileSafely(modelsEnv);
    if (env !== null) {
      const fableVars = ['MODEL_HIGH', 'MODEL_HIGH_ALT', 'MODEL_MID', 'MODEL_LOW'].filter((key) => {
        const m = new RegExp(`^${key}="?([^"\\n]*)"?`, 'm').exec(env);
        return m && FABLE_RE.test(m[1]);
      });
      if (fableVars.length) {
        log.err(`  .codex/skills/lazysitter/models.env names a Fable model in: ${fableVars.join(', ')} — Fable is never used in any tier (C22).`);
      }
    }
  }
  if (manifest.tools.includes('claude')) {
    const fableAgents = [];
    for (const entry of manifest.managed) {
      if (!/^\.claude\/agents\/.*\.md$/.test(entry.path)) continue;
      const abs = path.join(targetRoot, entry.path);
      if (!exists(abs)) continue;
      const model = extractModel(readFile(abs));
      if (model && FABLE_RE.test(model)) fableAgents.push(entry.path);
    }
    if (fableAgents.length) {
      log.err(`  Fable model id found in Claude agent frontmatter: ${fableAgents.join(', ')} — Fable is never used in any tier (C22).`);
    }
  }

  try {
    warnIfKnowledgeGitignored(targetRoot);
  } catch (err) {
    log.warn(`  gitignore check failed: ${err.message}`);
  }

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
