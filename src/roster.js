'use strict';

const path = require('path');
const { readFile, listFiles } = require('./util');
const fm = require('./frontmatter');

// Resolve the Provenforge roster from the package's core/ directory into a normalized
// per-agent view that both adapters consume.
function loadRoster(coreDir) {
  const roster = JSON.parse(readFile(path.join(coreDir, 'roster.json')));
  const agentDir = path.join(coreDir, 'agents');
  const files = listFiles(agentDir, '.md');

  const agents = files.map((file) => {
    const raw = readFile(path.join(agentDir, file));
    const { data, body } = fm.parse(raw);
    const name = data.name || file.replace(/\.md$/, '');
    const cfg = roster.agents[name] || {};
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

// Fallback sandbox inference when roster.json lacks an explicit mapping.
function deriveSandbox(tools) {
  if (tools.includes('Write') || tools.includes('Edit') || tools.includes('Bash')) {
    return 'workspace-write';
  }
  return 'read-only';
}

module.exports = { loadRoster };
