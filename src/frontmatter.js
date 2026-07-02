'use strict';

// Minimal YAML-frontmatter splitter for Newton agent files. Handles only the flat
// `key: value` frontmatter the agent files use (name, description, tools, model) —
// intentionally NOT a general YAML parser (no deps). Returns { data, body }.
function parse(raw) {
  const text = raw.replace(/^﻿/, '');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: {}, body: text };

  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    data[key] = val;
  }
  const body = text.slice(m[0].length);
  return { data, body };
}

// Split a comma/space separated tools string into an array.
function toolsArray(toolsStr) {
  if (!toolsStr) return [];
  return toolsStr
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

module.exports = { parse, toolsArray };
