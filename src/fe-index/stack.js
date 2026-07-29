'use strict';

const fs = require('fs');
const path = require('path');

// Stack detection. The FE team is deliberately narrow: React and Next.js are
// supported in depth, and anything else is REFUSED rather than served shallow
// advice. `supported:false` is what makes `lazysitter-fe-recon` halt the run.

const SUPPORTED = new Set(['react', 'next']);

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function detectStack(root) {
  const pkg = readJson(path.join(root, 'package.json')) || {};
  const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies, pkg.peerDependencies);
  const has = (name) => Object.prototype.hasOwnProperty.call(deps, name);
  const version = (name) => deps[name] || null;

  const frameworks = [];
  if (has('next')) frameworks.push({ name: 'next', version: version('next'), evidence: 'package.json dependency `next`' });
  if (has('react') && !has('next')) frameworks.push({ name: 'react', version: version('react'), evidence: 'package.json dependency `react`' });
  if (has('@angular/core')) frameworks.push({ name: 'angular', version: version('@angular/core'), evidence: 'package.json dependency `@angular/core`' });
  if (has('vue')) frameworks.push({ name: 'vue', version: version('vue'), evidence: 'package.json dependency `vue`' });
  if (has('svelte')) frameworks.push({ name: 'svelte', version: version('svelte'), evidence: 'package.json dependency `svelte`' });
  if (has('solid-js')) frameworks.push({ name: 'solid', version: version('solid-js'), evidence: 'package.json dependency `solid-js`' });
  if (has('@remix-run/react')) frameworks.push({ name: 'remix', version: version('@remix-run/react'), evidence: 'package.json dependency `@remix-run/react`' });

  const primary = frameworks[0] || null;
  const supported = !!primary && SUPPORTED.has(primary.name);

  const router = has('next')
    ? fs.existsSync(path.join(root, 'app')) || fs.existsSync(path.join(root, 'src', 'app'))
      ? fs.existsSync(path.join(root, 'pages')) || fs.existsSync(path.join(root, 'src', 'pages'))
        ? 'app+pages (mid-migration)'
        : 'app'
      : 'pages'
    : has('react-router-dom')
      ? `react-router ${version('react-router-dom')}`
      : has('@tanstack/react-router')
        ? '@tanstack/react-router'
        : 'unknown';

  const pick = (names) => names.filter(has).map((n) => `${n}@${deps[n]}`);

  return {
    primary,
    frameworks,
    supported,
    react: version('react'),
    typescript: has('typescript'),
    router,
    state: pick(['redux', '@reduxjs/toolkit', 'zustand', 'jotai', 'recoil', 'mobx', 'valtio', 'xstate', 'effector']),
    serverState: pick(['@tanstack/react-query', 'react-query', 'swr', '@apollo/client', 'urql', 'relay-runtime', 'trpc', '@trpc/client']),
    styling: pick(['tailwindcss', 'styled-components', '@emotion/react', '@stitches/react', 'sass', 'vanilla-extract', '@vanilla-extract/css', 'unocss']),
    ui: pick(['@mui/material', 'antd', '@chakra-ui/react', '@mantine/core', 'react-bootstrap', '@radix-ui/react-dialog', 'shadcn-ui', '@headlessui/react']),
    forms: pick(['react-hook-form', 'formik', 'zod', 'yup', '@hookform/resolvers']),
    i18n: pick(['react-i18next', 'next-intl', 'i18next', 'react-intl', 'lingui']),
    testing: pick(['jest', 'vitest', '@testing-library/react', '@testing-library/user-event', 'playwright', '@playwright/test', 'cypress', '@storybook/react', 'msw']),
    a11yTooling: pick(['eslint-plugin-jsx-a11y', 'axe-core', '@axe-core/react', 'jest-axe', '@axe-core/playwright']),
    perfTooling: pick(['@next/bundle-analyzer', 'webpack-bundle-analyzer', 'rollup-plugin-visualizer', 'size-limit', 'lighthouse', 'web-vitals']),
    visualTooling: pick(['@storybook/test-runner', 'chromatic', '@percy/cli', 'jest-image-snapshot', 'loki']),
    bundler: has('vite') ? 'vite' : has('next') ? 'next' : has('webpack') ? 'webpack' : has('parcel') ? 'parcel' : 'unknown',
    monorepo: fs.existsSync(path.join(root, 'pnpm-workspace.yaml'))
      ? 'pnpm-workspaces'
      : Array.isArray(pkg.workspaces) || (pkg.workspaces && pkg.workspaces.packages)
        ? 'npm/yarn-workspaces'
        : fs.existsSync(path.join(root, 'nx.json'))
          ? 'nx'
          : fs.existsSync(path.join(root, 'turbo.json'))
            ? 'turborepo'
            : null,
    scripts: pkg.scripts || {},
  };
}

// Design tokens: CSS custom properties and the Tailwind theme are both worth
// reading, because "is this colour a token or a magic literal?" is otherwise
// unanswerable and the STYLE-HARDCODED-COLOR rule would fire on the token file
// that defines the palette.
function detectTokens(root, styleFiles) {
  const colors = new Set();
  const vars = new Map();
  const sources = [];

  for (const rel of styleFiles.slice(0, 400)) {
    let text = '';
    try {
      const abs = path.join(root, rel);
      if (fs.statSync(abs).size > 2 * 1024 * 1024) continue;
      text = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    let m;
    const varRe = /(--[\w-]+)\s*:\s*([^;}]+)/g;
    let found = 0;
    while ((m = varRe.exec(text))) {
      vars.set(m[1], m[2].trim());
      found++;
      const hex = /#[0-9a-fA-F]{3,8}/.exec(m[2]);
      if (hex) colors.add(hex[0].toLowerCase());
    }
    if (found) sources.push({ file: rel, vars: found });
  }

  for (const name of ['tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.cjs', 'tailwind.config.mjs']) {
    const abs = path.join(root, name);
    if (!fs.existsSync(abs)) continue;
    try {
      const text = fs.readFileSync(abs, 'utf8');
      let m;
      const hexRe = /#[0-9a-fA-F]{3,8}\b/g;
      while ((m = hexRe.exec(text))) colors.add(m[0].toLowerCase());
      sources.push({ file: name, vars: colors.size });
    } catch {}
  }

  return { colors, vars, sources };
}

module.exports = { detectStack, detectTokens, SUPPORTED };
