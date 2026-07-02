'use strict';

// Zero-dependency smoke test: install into a temp project, assert both adapters
// render, config is preserved across update, and uninstall cleans up.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const PKG = path.join(__dirname, '..');
const BIN = path.join(PKG, 'bin', 'newton.js');
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
    env: { ...process.env, NO_COLOR: '1' },
    encoding: 'utf8',
  });
}
const has = (root, rel) => fs.existsSync(path.join(root, rel));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'newton-smoke-'));
try {
  console.log(`temp project: ${tmp}\n`);

  console.log('init (both adapters)');
  run(['init', tmp], tmp);
  ok(has(tmp, '.claude/commands/newton.md'), 'claude command written');
  ok(has(tmp, '.claude/agents/newton-architect.md'), 'claude agent written');
  ok(has(tmp, '.codex/skills/newton/SKILL.md'), 'codex skill written');
  ok(has(tmp, '.codex/skills/newton/run-agent.sh'), 'codex runner written');
  ok(has(tmp, '.codex/skills/newton/agents/newton-red-team.md'), 'codex role written');
  ok(has(tmp, '.codex/skills/newton/agents/newton-red-team.meta'), 'codex meta written');
  ok(has(tmp, '.codex/skills/newton/models.env'), 'models.env written');
  ok(has(tmp, 'AGENTS.md'), 'AGENTS.md created');
  ok(has(tmp, '.newton/manifest.json'), 'manifest written');

  const claudeAgents = fs.readdirSync(path.join(tmp, '.claude/agents')).filter((f) => f.endsWith('.md'));
  ok(claudeAgents.length === 26, `26 claude agents (got ${claudeAgents.length})`);

  const meta = fs.readFileSync(path.join(tmp, '.codex/skills/newton/agents/newton-red-team.meta'), 'utf8');
  ok(/DISTINCT_MODEL=1/.test(meta), 'red-team flagged distinct-model');
  ok(/SANDBOX=workspace-write/.test(meta), 'red-team sandbox = workspace-write');

  const relMeta = fs.readFileSync(path.join(tmp, '.codex/skills/newton/agents/newton-release-agent.meta'), 'utf8');
  ok(/APPROVAL=on-request/.test(relMeta), 'release-agent approval = on-request');

  const roleBody = fs.readFileSync(path.join(tmp, '.codex/skills/newton/agents/newton-architect.md'), 'utf8');
  ok(!/^---/.test(roleBody), 'codex role has frontmatter stripped');

  const agentsMd = fs.readFileSync(path.join(tmp, 'AGENTS.md'), 'utf8');
  ok(/NEWTON:BEGIN/.test(agentsMd) && /NEWTON:END/.test(agentsMd), 'AGENTS.md has Newton block markers');

  console.log('\nupdate (preserves user config)');
  fs.writeFileSync(path.join(tmp, '.codex/skills/newton/models.env'), 'MODEL_HIGH="x"\nMODEL_HIGH_ALT="y"\n');
  run(['update', tmp], tmp);
  const preserved = fs.readFileSync(path.join(tmp, '.codex/skills/newton/models.env'), 'utf8');
  ok(/MODEL_HIGH_ALT="y"/.test(preserved), 'models.env edits preserved across update');

  console.log('\ndoctor');
  const doc = run(['doctor', tmp], tmp);
  ok(/managed files present/.test(doc) || /present and unmodified/.test(doc), 'doctor reports integrity');

  console.log('\nlist');
  const list = run(['list'], tmp);
  ok(/newton-red-team/.test(list) && /distinct-model/.test(list), 'list shows roster + distinct-model flag');

  console.log('\nAGENTS.md idempotency');
  const before = fs.readFileSync(path.join(tmp, 'AGENTS.md'), 'utf8');
  run(['update', tmp], tmp);
  const after = fs.readFileSync(path.join(tmp, 'AGENTS.md'), 'utf8');
  ok(before === after, 'AGENTS.md block not duplicated on re-run');

  console.log('\nuninstall');
  run(['uninstall', tmp], tmp);
  ok(!has(tmp, '.claude/agents/newton-architect.md'), 'claude agents removed');
  ok(!has(tmp, '.codex/skills/newton/SKILL.md'), 'codex skill removed');
  ok(!has(tmp, '.newton/manifest.json'), 'manifest removed');
  ok(!has(tmp, 'AGENTS.md') || !/NEWTON:BEGIN/.test(fs.readFileSync(path.join(tmp, 'AGENTS.md'), 'utf8')), 'AGENTS.md block stripped/removed');

  console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
