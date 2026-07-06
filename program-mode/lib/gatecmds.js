'use strict';

// GATE COMMANDS — turns the abstract gate ladder (gates.js) into real checks (§8, §16 step 3).
//
// Gate 1 (secrets) is implemented in pure JS here — zero dependencies, so the cheapest gate is
// ALWAYS available and can never be "degraded". Gates 2–4 wrap external tools (eslint / tsc /
// knip) and degrade gracefully (a missing tool → degraded, which the ladder treats as BLOCK,
// not pass — an unverified gate is never a passed gate).
//
// `spawn` is injectable so the wrappers are testable without the real tools installed.

const { execFileSync } = require('child_process');

// Common credential shapes. Conservative — tuned to avoid false positives (§15: the gate
// false-positive tax is real; a noisy secrets gate trains people to route around it).
const SECRET_PATTERNS = [
  { name: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'aws-secret-key', re: /\baws_secret_access_key\s*[=:]\s*['"][A-Za-z0-9/+]{40}['"]/i },
  { name: 'private-key-block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { name: 'github-token', re: /\bghp_[A-Za-z0-9]{36}\b/ },
  { name: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'stripe-secret', re: /\bsk_live_[A-Za-z0-9]{16,}\b/ },
  { name: 'generic-bearer', re: /\b(?:api[_-]?key|secret|token|password)\s*[=:]\s*['"][A-Za-z0-9_\-]{16,}['"]/i },
];

// Pure, dependency-free. Returns every secret-looking hit in `text`. Testable in isolation.
function scanSecrets(text) {
  if (!text) return [];
  const hits = [];
  for (const p of SECRET_PATTERNS) {
    const m = text.match(p.re);
    if (m) hits.push({ name: p.name, match: m[0].slice(0, 24) });
  }
  return hits;
}

// Maps the abstract gate to a real external command, keyed by the token that appears in the
// gate's `cmd` string (see gates.js DEFAULT_LADDER) so dispatch is an exact `cmd.includes(key)`
// and never a loose partial miss. Not run here — dispatched by makeExec.
const EXTERNAL = {
  lint: { file: 'npx', args: ['--no-install', 'eslint', '.', '--max-warnings', '0'] },
  build: { file: 'npx', args: ['--no-install', 'tsc', '--noEmit'] }, // cmd: lazysitter-gate-build
  deadcode: { file: 'npx', args: ['--no-install', 'knip', '--no-progress'] }, // cmd: ...-deadcode
};

function defaultSpawn(file, args, cwd) {
  try {
    execFileSync(file, args, { cwd, stdio: 'pipe', encoding: 'utf8' });
    return { code: 0, stdout: '' };
  } catch (e) {
    // ENOENT / "not found" → the tool isn't installed → degraded, not a real failure.
    const msg = `${e.code || ''} ${e.message || ''}`;
    if (/ENOENT|not found|could not determine executable|command not found/i.test(msg)) {
      return { degraded: true, evidence: `tool unavailable: ${file} ${args[0]}` };
    }
    return { code: e.status || 1, stdout: (e.stdout || '').toString(), stderr: (e.stderr || '').toString() };
  }
}

// Build the exec(cmd, ctx) the ladder calls. `diffText` (or ctx.diffText) is what the secrets
// gate scans; external gates run in `root`. Inject `spawn` in tests.
function makeExec({ root = '.', diffText = '', spawn = defaultSpawn } = {}) {
  return function exec(cmd, ctx = {}) {
    const text = ctx.diffText != null ? ctx.diffText : diffText;
    if (cmd.includes('secrets')) {
      const hits = scanSecrets(text);
      return hits.length
        ? { code: 1, stdout: `secrets found: ${hits.map((h) => h.name).join(', ')}` }
        : { code: 0, stdout: 'no secrets' };
    }
    for (const key of Object.keys(EXTERNAL)) {
      if (cmd.includes(key)) {
        const spec = EXTERNAL[key];
        return spawn(spec.file, spec.args, root);
      }
    }
    return { degraded: true, evidence: `no command mapped for ${cmd}` };
  };
}

module.exports = { SECRET_PATTERNS, scanSecrets, EXTERNAL, defaultSpawn, makeExec };
