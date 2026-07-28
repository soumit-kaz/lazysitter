'use strict';

const path = require('path');
const { log, readFile } = require('./util');

const KNOWLEDGE_DIR = '.lazysitter/knowledge';
const KNOWLEDGE_FILES = [
  'CAPABILITIES.md',
  'CONVENTIONS.md',
  'PROJECT-PITFALLS.md',
  'ONE-WAY-DOORS.md',
  'SECRETS-BASELINE.md',
];

function installKnowledge(ctx) {
  log.step('Committed knowledge → .lazysitter/knowledge/');
  for (const file of KNOWLEDGE_FILES) {
    ctx.writePreserve(`${KNOWLEDGE_DIR}/${file}`, readFile(path.join(ctx.templatesDir, 'knowledge', file)));
  }
  ctx.writePreserve('.lazysitter/.gitignore', 'RUN.lock\nruns/\n');
}

module.exports = { installKnowledge, KNOWLEDGE_DIR, KNOWLEDGE_FILES };
