'use strict';

const fs = require('fs');
const path = require('path');
const { readFile, listFiles, exists } = require('./util');
const fm = require('./frontmatter');

const AGENT_NAME_RE = /^lazysitter-[a-z0-9-]+$/;

// The frontend team is a second, independent roster living beside the general
// one. Both load through here so an unregistered agent can never install with
// self-granted tier/sandbox, whichever team it belongs to.
const ROSTERS = {
  general: { rosterFile: 'roster.json', agentsDir: 'agents', skillsDir: null },
  frontend: { rosterFile: 'roster.fe.json', agentsDir: 'agents-fe', skillsDir: 'skills-fe' },
};

function loadRoster(coreDir, kind = 'general') {
  const spec = ROSTERS[kind];
  if (!spec) throw new Error(`Unknown roster kind "${kind}" — expected one of ${Object.keys(ROSTERS).join(', ')}`);
  const roster = JSON.parse(readFile(path.join(coreDir, spec.rosterFile)));
  const agentDir = path.join(coreDir, spec.agentsDir);
  const files = listFiles(agentDir, '.md');

  const seenNames = new Set();
  const agents = files.map((file) => {
    const raw = readFile(path.join(agentDir, file));
    const { data, body } = fm.parse(raw);
    const name = data.name || file.replace(/\.md$/, '');
    if (!AGENT_NAME_RE.test(name)) {
      throw new Error(`Invalid agent name "${name}" in ${file}: must match ${AGENT_NAME_RE}`);
    }
    const expectedFile = `${name}.md`;
    if (file !== expectedFile) {
      throw new Error(
        `Agent name "${name}" declared in ${file} does not match its own filename (expected ${expectedFile}) — refusing to let one agent file overwrite another agent's identity.`
      );
    }
    if (seenNames.has(name)) {
      throw new Error(`Duplicate agent name "${name}" declared by more than one file in ${agentDir}.`);
    }
    seenNames.add(name);
    if (!Object.prototype.hasOwnProperty.call(roster.agents, name)) {
      throw new Error(
        `Agent "${name}" (${file}) is not registered in core/${spec.rosterFile} — refusing to install an unregistered agent (it would self-grant sandbox/tier from its own declared tools).`
      );
    }
    const cfg = roster.agents[name];
    const tools = fm.toolsArray(data.tools);

    const tier = cfg.tier || roster.modelTierByLogical[data.model] || 'mid';
    const codexSandbox = cfg.codexSandbox || deriveSandbox(tools);
    const codexApproval = cfg.codexApproval || 'on-request';

    return {
      name,
      file,
      raw,
      body,
      description: data.description || '',
      claudeModel: data.model || 'sonnet',
      claudeTools: tools,
      tier,
      codexSandbox,
      codexApproval,
      distinctModel: cfg.distinctModel === true,
      note: cfg.note || '',
    };
  });

  return { roster, agents, kind, spec };
}

// Skills are validated the same way agents are: a skill directory the roster
// does not declare is refused rather than silently installed.
function loadSkills(coreDir, kind = 'frontend') {
  const spec = ROSTERS[kind];
  if (!spec || !spec.skillsDir) return [];
  const roster = JSON.parse(readFile(path.join(coreDir, spec.rosterFile)));
  const declared = new Set(roster.skills || []);
  const root = path.join(coreDir, spec.skillsDir);
  if (!exists(root)) return [];

  const skills = [];
  for (const name of fs.readdirSync(root).sort()) {
    const skillFile = path.join(root, name, 'SKILL.md');
    if (!exists(skillFile)) continue;
    if (!declared.has(name)) {
      throw new Error(
        `Skill "${name}" is not declared in core/${spec.rosterFile} "skills" — refusing to install an undeclared skill.`
      );
    }
    const raw = readFile(skillFile);
    const { data } = fm.parse(raw);
    if (data.name && data.name !== name) {
      throw new Error(`Skill "${name}" declares name "${data.name}" — the directory name and the declared name must match.`);
    }
    skills.push({ name, raw, description: data.description || '', file: skillFile });
  }

  const found = new Set(skills.map((s) => s.name));
  for (const name of declared) {
    if (!found.has(name)) throw new Error(`Roster declares skill "${name}" but core/${spec.skillsDir}/${name}/SKILL.md does not exist.`);
  }
  return skills;
}

function deriveSandbox(tools) {
  if (tools.includes('Write') || tools.includes('Edit') || tools.includes('Bash')) {
    return 'workspace-write';
  }
  return 'read-only';
}

module.exports = { loadRoster, loadSkills, ROSTERS };
