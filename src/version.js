'use strict';

// Version freshness check. `npx github:owner/repo` aggressively caches the fetched
// tarball, so a user can unknowingly run a stale copy. This probes the repo's
// package.json directly (independent of any npx cache) and reports whether a newer
// version exists — silent and offline-safe (resolves to nulls on any error/timeout).

const https = require('https');
const path = require('path');
const { readFile } = require('./util');

const RAW_PKG_URL = 'https://raw.githubusercontent.com/soumit-kaz/lazysitter/main/package.json';
// Reliable "always latest" invocation for a GitHub-distributed CLI: `#semver:*`
// resolves to the highest version *git tag* (npm dist-tags like @latest do NOT apply
// to github: specs — the committish must follow `#`). Quoted because `#`/`*` are shell-special.
const LATEST_CMD = 'npx -y "github:soumit-kaz/lazysitter#semver:*"';

function currentVersion(pkgRoot) {
  try {
    return JSON.parse(readFile(path.join(pkgRoot, 'package.json'))).version || null;
  } catch {
    return null;
  }
}

function cmpSemver(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

function fetchLatestVersion(timeoutMs = 2500) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    try {
      const req = https.get(
        RAW_PKG_URL,
        { headers: { 'User-Agent': 'lazysitter-cli' } },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            return done(null);
          }
          let body = '';
          res.on('data', (d) => {
            body += d;
            if (body.length > 1e6) req.destroy();
          });
          res.on('end', () => {
            try {
              done(JSON.parse(body).version || null);
            } catch {
              done(null);
            }
          });
        }
      );
      req.on('error', () => done(null));
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        done(null);
      });
    } catch {
      done(null);
    }
  });
}

async function checkLatest(pkgRoot) {
  if (process.env.LAZYSITTER_NO_UPDATE_CHECK) return { current: currentVersion(pkgRoot), latest: null, stale: false };
  const current = currentVersion(pkgRoot);
  const latest = await fetchLatestVersion();
  const stale = !!(current && latest && cmpSemver(latest, current) > 0);
  return { current, latest, stale };
}

// Print a one-line notice if a newer version exists. Never throws.
async function printUpdateNoticeIfStale(pkgRoot, log, c) {
  try {
    const { current, latest, stale } = await checkLatest(pkgRoot);
    if (stale) {
      log.warn(
        `A newer LazySitter is available: ${c.bold('v' + latest)} (you ran ${c.dim('v' + current)} — npx served a cached copy).`
      );
      log.info(`  Get the latest:  ${c.cyan(LATEST_CMD + ' update')}`);
    }
  } catch {
    /* offline / any error: stay silent */
  }
}

module.exports = { checkLatest, printUpdateNoticeIfStale, cmpSemver, currentVersion, LATEST_CMD };
