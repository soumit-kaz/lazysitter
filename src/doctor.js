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

const FE_HIGH_TIER_AGENTS = [
  'lazysitter-fe-architect',
  'lazysitter-fe-security-expert',
  'lazysitter-fe-closing-loop-auditor',
  'lazysitter-fe-devils-advocate',
];

function checkFrontend(targetRoot) {
  log.info(`${c.bold('Frontend team')}`);

  const indexMeta = path.join(targetRoot, '.lazysitter', 'index', 'meta.json');
  if (!exists(indexMeta)) {
    log.warn('  No frontend index built yet — every FE agent depends on it.');
    log.info(`    ${c.dim('Run `lazysitter fe-index build` before your first `/lsife` run.')}`);
  } else {
    try {
      const meta = JSON.parse(readFileCapped(indexMeta));
      const fw = meta.stack && meta.stack.primary;
      if (!meta.stack || !meta.stack.supported) {
        log.err(`  Index reports an unsupported framework (${fw ? fw.name : 'none detected'}).`);
        log.info(`    ${c.dim('The frontend team refuses to run here by design — use the general team (/lsi).')}`);
      } else {
        log.ok(
          `  Index built ${meta.generatedAt} — ${fw.name}@${fw.version}, ${meta.counts.components} components, ${meta.counts.hooks} hooks, ${meta.counts.utils} utils.`
        );
      }
      const gaps = [];
      if (meta.coverage) {
        if (meta.coverage.skipped && meta.coverage.skipped.length) gaps.push(`${meta.coverage.skipped.length} skipped path(s)`);
        if (meta.coverage.parseErrors && meta.coverage.parseErrors.length) gaps.push(`${meta.coverage.parseErrors.length} parse error(s)`);
      }
      if (gaps.length) log.warn(`  Index coverage gaps: ${gaps.join(', ')} — see .lazysitter/index/meta.json`);
    } catch (err) {
      log.warn(`  Could not read the frontend index meta: ${err.message}`);
    }
  }

  // The FE red-team and supervisor both want a model distinct from the design
  // lineage. Claude Code has no per-tier config, so this can only be reported.
  for (const name of ['lazysitter-fe-red-team', 'lazysitter-fe-supervisor']) {
    const p = path.join(targetRoot, '.claude/agents', `${name}.md`);
    if (!exists(p)) continue;
    const model = extractModel(readFile(p));
    const shared = FE_HIGH_TIER_AGENTS.filter((other) => {
      const op = path.join(targetRoot, '.claude/agents', `${other}.md`);
      return exists(op) && extractModel(readFile(op)) === model;
    });
    if (shared.length) {
      log.warn(
        `  ${name} model (${model}) equals the design lineage's model (${shared.join(', ')}) — it shares their blind spots (weaker independence).`
      );
    }
  }

  const cfg = path.join(targetRoot, '.claude/lazysitter/lazysitter.fe.config.json');
  if (exists(cfg)) {
    try {
      const parsed = JSON.parse(readFileCapped(cfg));
      if (parsed.supervisor && parsed.supervisor.enabled === false) {
        log.warn('  Live supervision is disabled in lazysitter.fe.config.json — mid-flight agent drift will not be caught.');
      }
    } catch (err) {
      log.warn(`  .claude/lazysitter/lazysitter.fe.config.json is not valid JSON: ${err.message}`);
    }
  }
  log.info('');
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

  const teams = manifest.teams || { general: true, frontend: false };
  log.info(`  Teams: ${c.cyan([teams.general !== false && 'general', teams.frontend && 'frontend'].filter(Boolean).join(' + ') || 'none')}`);
  log.info('');

  if (teams.frontend) checkFrontend(targetRoot);

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
