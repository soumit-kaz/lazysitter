'use strict';

const path = require('path');
const { readFile, listFiles } = require('./util');
const fm = require('./frontmatter');

const AGENT_NAME_RE = /^lazysitter-[a-z0-9-]+$/;

function loadRoster(coreDir) {
  const roster = JSON.parse(readFile(path.join(coreDir, 'roster.json')));
  const agentDir = path.join(coreDir, 'agents');
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
        `Agent "${name}" (${file}) is not registered in core/roster.json — refusing to install an unregistered agent (it would self-grant sandbox/tier from its own declared tools).`
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

  return { roster, agents };
}

function deriveSandbox(tools) {
  if (tools.includes('Write') || tools.includes('Edit') || tools.includes('Bash')) {
    return 'workspace-write';
  }
  return 'read-only';
}

module.exports = { loadRoster };
