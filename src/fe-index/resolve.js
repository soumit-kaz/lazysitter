'use strict';

const fs = require('fs');
const path = require('path');

const TRY_EXT = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs', '.mts', '.cts'];
const INDEX_NAMES = TRY_EXT.map((e) => `index${e}`);

// Module resolution good enough to turn `import { Button } from '@/ui/button'`
// into a real file path. Without this, the usage graph collapses on any repo
// using path aliases — which is most of them — and every "who renders this?"
// answer silently under-counts.

function stripComments(json) {
  return json
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'\\])\/\/.*$/gm, '$1')
    .replace(/,(\s*[}\]])/g, '$1');
}

function readJsonLoose(file) {
  try {
    return JSON.parse(stripComments(fs.readFileSync(file, 'utf8')));
  } catch {
    return null;
  }
}

function loadAliasConfig(root) {
  const aliases = [];
  let baseUrl = root;
  const configs = ['tsconfig.json', 'jsconfig.json', 'tsconfig.base.json'];
  for (const name of configs) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    const cfg = readJsonLoose(file);
    const co = cfg && cfg.compilerOptions;
    if (!co) continue;
    if (co.baseUrl) baseUrl = path.resolve(root, co.baseUrl);
    if (co.paths) {
      for (const [pattern, targets] of Object.entries(co.paths)) {
        if (!Array.isArray(targets)) continue;
        aliases.push({ pattern, targets, base: co.baseUrl ? path.resolve(root, co.baseUrl) : root });
      }
    }
  }
  // Vite / webpack aliases are common and cheap to pick up from the raw config
  // text; a missed alias only degrades to "external", never to a wrong answer.
  for (const name of ['vite.config.ts', 'vite.config.js', 'webpack.config.js', 'next.config.js', 'next.config.mjs']) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    let text = '';
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const re = /['"]([@~][\w./-]*)['"]\s*:\s*(?:path\.resolve\([^,]*,\s*)?['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(text))) {
      aliases.push({ pattern: `${m[1]}/*`, targets: [`${m[2].replace(/^\.\//, '')}/*`], base: root });
    }
  }
  return { aliases, baseUrl };
}

function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function dirExists(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function tryFile(candidate, known) {
  const test = (p) => (known ? known.has(p.replace(/\\/g, '/')) : fileExists(p));
  if (path.extname(candidate) && test(candidate)) return candidate;
  for (const ext of TRY_EXT) {
    const withExt = candidate + ext;
    if (test(withExt)) return withExt;
  }
  // `./foo.js` in an ESM/TS repo frequently means `./foo.ts` on disk.
  const swapped = candidate.replace(/\.(js|jsx|mjs)$/, '');
  if (swapped !== candidate) {
    for (const ext of TRY_EXT) {
      const withExt = swapped + ext;
      if (test(withExt)) return withExt;
    }
  }
  for (const idx of INDEX_NAMES) {
    const p = path.posix.join(candidate, idx);
    if (test(p)) return p;
  }
  return null;
}

function createResolver(root, knownFiles) {
  const { aliases, baseUrl } = loadAliasConfig(root);
  const known = new Set(knownFiles);
  const cache = new Map();

  const toRel = (abs) => path.relative(root, abs).replace(/\\/g, '/');

  function resolve(fromRel, spec) {
    const key = `${fromRel}\u0000${spec}`;
    if (cache.has(key)) return cache.get(key);
    let result = null;

    if (spec.startsWith('.')) {
      const candidate = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
      result = tryFile(candidate, known);
    } else {
      for (const alias of aliases) {
        const star = alias.pattern.indexOf('*');
        if (star === -1) {
          if (spec !== alias.pattern) continue;
          for (const t of alias.targets) {
            const abs = path.resolve(alias.base, t);
            const hit = tryFile(toRel(abs), known);
            if (hit) { result = hit; break; }
          }
        } else {
          const prefix = alias.pattern.slice(0, star);
          const suffix = alias.pattern.slice(star + 1);
          if (!spec.startsWith(prefix) || !spec.endsWith(suffix)) continue;
          const middle = spec.slice(prefix.length, spec.length - suffix.length);
          for (const t of alias.targets) {
            const abs = path.resolve(alias.base, t.replace('*', middle));
            const hit = tryFile(toRel(abs), known);
            if (hit) { result = hit; break; }
          }
        }
        if (result) break;
      }
      if (!result && baseUrl) {
        const hit = tryFile(toRel(path.resolve(baseUrl, spec)), known);
        if (hit) result = hit;
      }
    }

    cache.set(key, result);
    return result;
  }

  function isExternal(spec) {
    return !spec.startsWith('.') && !resolve('index.ts', spec);
  }

  function packageOf(spec) {
    if (spec.startsWith('.') || spec.startsWith('/')) return null;
    const parts = spec.split('/');
    return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  }

  return { resolve, isExternal, packageOf, aliases, baseUrl, dirExists };
}

module.exports = { createResolver, loadAliasConfig, TRY_EXT };
