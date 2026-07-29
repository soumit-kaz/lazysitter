'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const INDEX_DIRNAME = path.join('.lazysitter', 'index');
const CACHE_FILE = 'cache.jsonl';

function indexDir(root) {
  return path.join(root, INDEX_DIRNAME);
}

function ensure(root) {
  const dir = indexDir(root);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeJson(root, name, data) {
  const file = path.join(ensure(root), name);
  fs.writeFileSync(file, JSON.stringify(data, null, name === 'meta.json' ? 2 : 0) + '\n', 'utf8');
  return file;
}

function readJson(root, name) {
  const file = path.join(indexDir(root), name);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function exists(root) {
  return fs.existsSync(path.join(indexDir(root), 'meta.json'));
}

// The per-file cache is the only structure that can grow with repo size without
// bound, so it is never held in memory as one blob: it is written line-by-line
// and read back through a line stream.
function writeCache(root, records) {
  const file = path.join(ensure(root), CACHE_FILE);
  const tmp = `${file}.tmp`;
  const out = fs.createWriteStream(tmp, { encoding: 'utf8' });
  return new Promise((resolve, reject) => {
    out.on('error', reject);
    out.on('close', () => {
      try {
        fs.renameSync(tmp, file);
        resolve(file);
      } catch (err) {
        reject(err);
      }
    });
    const pump = (i) => {
      while (i < records.length) {
        if (!out.write(JSON.stringify(records[i]) + '\n')) {
          out.once('drain', () => pump(i + 1));
          return;
        }
        i++;
      }
      out.end();
    };
    pump(0);
  });
}

async function readCache(root, onRecord) {
  const file = path.join(indexDir(root), CACHE_FILE);
  if (!fs.existsSync(file)) return 0;
  const stream = fs.createReadStream(file, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let n = 0;
  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        onRecord(JSON.parse(line));
        n++;
      } catch {
        // A corrupt line only costs that file its cache entry; it is reparsed.
      }
    }
  } finally {
    rl.close();
    stream.destroy();
  }
  return n;
}

function clear(root) {
  const dir = indexDir(root);
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    try {
      fs.rmSync(path.join(dir, f), { recursive: true, force: true });
    } catch {}
  }
}

module.exports = { indexDir, ensure, writeJson, readJson, writeCache, readCache, exists, clear, INDEX_DIRNAME };
