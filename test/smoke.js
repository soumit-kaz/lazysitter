'use strict';

// Zero-dependency smoke test: install into a temp project, assert adapters
// render, config is preserved across update, and uninstall cleans up.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const PKG = path.join(__dirname, '..');
const BIN = path.join(PKG, 'bin', 'lazysitter.js');
let failures = 0;

function ok(cond, msg) {
  if (cond) console.log(`  ok   ${msg}`);
  else {
    console.log(`  FAIL ${msg}`);
    failures++;
  }
}
function run(args, cwd) {
  return execFileSync(process.execPath, [BIN, ...args], {
    cwd,
    // Keep the smoke test hermetic: no network probe from the version freshness check.
    env: { ...process.env, NO_COLOR: '1', LAZYSITTER_NO_UPDATE_CHECK: '1' },
    encoding: 'utf8',
  });
}
const has = (root, rel) => fs.existsSync(path.join(root, rel));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lazysitter-smoke-'));
try {
  console.log(`temp project: ${tmp}\n`);

  console.log('init (all adapters)');
  run(['init', tmp], tmp);
  ok(has(tmp, '.cursor/rules/lazysitter.mdc'), 'cursor rule written');
  ok(has(tmp, '.cursor/commands/lsi.md'), 'cursor /lsi command written');
  ok(has(tmp, '.cursor/agents/lazysitter-architect.md'), 'cursor agent written');
  ok(has(tmp, '.cursor/lazysitter/models.json'), 'cursor models.json written');
  ok(has(tmp, '.cursor/lazysitter/README.md'), 'cursor README written');
  ok(has(tmp, '.cursor/lazysitter/PITFALL-LEDGER.md'), 'cursor process-pitfall ledger seeded');

  const cursorAgents = fs.readdirSync(path.join(tmp, '.cursor/agents')).filter((f) => f.endsWith('.md'));
  ok(cursorAgents.length === 26, `26 cursor agents (got ${cursorAgents.length})`);

  const cursorArchitect = fs.readFileSync(path.join(tmp, '.cursor/agents/lazysitter-architect.md'), 'utf8');
  ok(/^model:\s*\S+/m.test(cursorArchitect), 'cursor agent pins a model');

  const cursorRedTeam = fs.readFileSync(path.join(tmp, '.cursor/agents/lazysitter-red-team.md'), 'utf8');
  const cursorBackend = fs.readFileSync(path.join(tmp, '.cursor/agents/lazysitter-backend-implementer.md'), 'utf8');
  const redModel = /^model:\s*(\S+)/m.exec(cursorRedTeam)[1];
  const backendModel = /^model:\s*(\S+)/m.exec(cursorBackend)[1];
  ok(redModel !== backendModel, 'cursor red-team model distinct from implementer');

  const cursorSecrets = fs.readFileSync(path.join(tmp, '.cursor/agents/lazysitter-secrets-scanner.md'), 'utf8');
  ok(/^readonly:\s*true/m.test(cursorSecrets), 'cursor read-only agent flagged readonly');
  ok(/^readonly:\s*false/m.test(cursorBackend), 'cursor implementer not readonly');

  const cursorCmd = fs.readFileSync(path.join(tmp, '.cursor/commands/lsi.md'), 'utf8');
  ok(/\$ARGUMENTS/.test(cursorCmd), 'cursor command uses $ARGUMENTS');
  ok(/\.cursor\/lazysitter/.test(cursorCmd) && !/\.claude\/lazysitter/.test(cursorCmd), 'cursor command retargets paths to .cursor');
  ok(has(tmp, '.claude/commands/lsi.md'), 'claude command written');
  ok(has(tmp, '.claude/agents/lazysitter-architect.md'), 'claude agent written');
  ok(has(tmp, '.codex/skills/lazysitter/SKILL.md'), 'codex skill written');
  ok(has(tmp, '.codex/skills/lazysitter/run-agent.sh'), 'codex runner written');
  ok(has(tmp, '.codex/skills/lazysitter/agents/lazysitter-red-team.md'), 'codex role written');
  ok(has(tmp, '.codex/skills/lazysitter/agents/lazysitter-red-team.meta'), 'codex meta written');
  ok(has(tmp, '.codex/skills/lazysitter/models.env'), 'models.env written');
  ok(has(tmp, 'AGENTS.md'), 'AGENTS.md created');
  ok(has(tmp, '.lazysitter/manifest.json'), 'manifest written');
  ok(has(tmp, '.claude/lazysitter/PITFALL-LEDGER.md'), 'claude process-pitfall ledger seeded');
  ok(has(tmp, '.codex/skills/lazysitter/PITFALL-LEDGER.md'), 'codex process-pitfall ledger seeded');

  const claudeAgents = fs.readdirSync(path.join(tmp, '.claude/agents')).filter((f) => f.endsWith('.md'));
  ok(claudeAgents.length === 26, `26 claude agents (got ${claudeAgents.length})`);

  const meta = fs.readFileSync(path.join(tmp, '.codex/skills/lazysitter/agents/lazysitter-red-team.meta'), 'utf8');
  ok(/DISTINCT_MODEL=1/.test(meta), 'red-team flagged distinct-model');
  ok(/SANDBOX=workspace-write/.test(meta), 'red-team sandbox = workspace-write');

  const relMeta = fs.readFileSync(path.join(tmp, '.codex/skills/lazysitter/agents/lazysitter-release-agent.meta'), 'utf8');
  ok(/APPROVAL=on-request/.test(relMeta), 'release-agent approval = on-request');

  const roleBody = fs.readFileSync(path.join(tmp, '.codex/skills/lazysitter/agents/lazysitter-architect.md'), 'utf8');
  ok(!/^---/.test(roleBody), 'codex role has frontmatter stripped');

  const agentsMd = fs.readFileSync(path.join(tmp, 'AGENTS.md'), 'utf8');
  ok(/LAZYSITTER:BEGIN/.test(agentsMd) && /LAZYSITTER:END/.test(agentsMd), 'AGENTS.md has LazySitter block markers');

  console.log('\nupdate (preserves user config)');
  fs.writeFileSync(path.join(tmp, '.codex/skills/lazysitter/models.env'), 'MODEL_HIGH="x"\nMODEL_HIGH_ALT="y"\n');
  fs.writeFileSync(path.join(tmp, '.claude/lazysitter/PITFALL-LEDGER.md'), '# my accumulated pitfalls\n[proc][x] y -> z | 3 | no\n');
  fs.writeFileSync(path.join(tmp, '.cursor/lazysitter/PITFALL-LEDGER.md'), '# my cursor accumulated pitfalls\n[proc][x] y -> z | 3 | no\n');
  fs.writeFileSync(
    path.join(tmp, '.cursor/lazysitter/models.json'),
    '{\n  "high": "my-high",\n  "high_alt": "my-alt",\n  "mid": "my-mid",\n  "low": "my-low"\n}\n'
  );
  run(['update', tmp], tmp);
  const preserved = fs.readFileSync(path.join(tmp, '.codex/skills/lazysitter/models.env'), 'utf8');
  ok(/MODEL_HIGH_ALT="y"/.test(preserved), 'models.env edits preserved across update');
  const ledger = fs.readFileSync(path.join(tmp, '.claude/lazysitter/PITFALL-LEDGER.md'), 'utf8');
  ok(/my accumulated pitfalls/.test(ledger), 'accumulated pitfall-ledger preserved across update');
  const cursorLedger = fs.readFileSync(path.join(tmp, '.cursor/lazysitter/PITFALL-LEDGER.md'), 'utf8');
  ok(/my cursor accumulated pitfalls/.test(cursorLedger), 'accumulated cursor pitfall-ledger preserved across update');
  const cursorModels = fs.readFileSync(path.join(tmp, '.cursor/lazysitter/models.json'), 'utf8');
  ok(/my-alt/.test(cursorModels), 'cursor models.json edits preserved across update');
  const rebakedRedTeam = fs.readFileSync(path.join(tmp, '.cursor/agents/lazysitter-red-team.md'), 'utf8');
  ok(/^model:\s*my-alt/m.test(rebakedRedTeam), 'cursor agents re-baked from edited models.json on update');

  console.log('\ndoctor');
  const doc = run(['doctor', tmp], tmp);
  ok(/managed files present/.test(doc) || /present and unmodified/.test(doc), 'doctor reports integrity');

  console.log('\nlist');
  const list = run(['list'], tmp);
  ok(/lazysitter-red-team/.test(list) && /distinct-model/.test(list), 'list shows roster + distinct-model flag');

  console.log('\nAGENTS.md idempotency');
  const before = fs.readFileSync(path.join(tmp, 'AGENTS.md'), 'utf8');
  run(['update', tmp], tmp);
  const after = fs.readFileSync(path.join(tmp, 'AGENTS.md'), 'utf8');
  ok(before === after, 'AGENTS.md block not duplicated on re-run');

  console.log('\nuninstall');
  run(['uninstall', tmp], tmp);
  ok(!has(tmp, '.cursor/rules/lazysitter.mdc'), 'cursor rule removed');
  ok(!has(tmp, '.cursor/agents/lazysitter-architect.md'), 'cursor agents removed');
  ok(!has(tmp, '.cursor/commands/lsi.md'), 'cursor command removed');
  ok(!has(tmp, '.claude/agents/lazysitter-architect.md'), 'claude agents removed');
  ok(!has(tmp, '.codex/skills/lazysitter/SKILL.md'), 'codex skill removed');
  ok(!has(tmp, '.lazysitter/manifest.json'), 'manifest removed');
  ok(!has(tmp, 'AGENTS.md') || !/LAZYSITTER:BEGIN/.test(fs.readFileSync(path.join(tmp, 'AGENTS.md'), 'utf8')), 'AGENTS.md block stripped/removed');

  console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
