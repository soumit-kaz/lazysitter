'use strict';

// Per-file convention counters, collected during the parse pass that is already
// running. Repo-wide convention questions ("which date library does this repo
// actually use?", "camelCase or snake_case on the wire?") are the single most
// expensive thing an explorer agent derives by hand, and every one of them is a
// counting problem. Counting them here costs microseconds and zero tokens.

const COUNTERS = [
  ['date.dateFns', /\bfrom\s*['"]date-fns/],
  ['date.dayjs', /\bfrom\s*['"]dayjs/],
  ['date.moment', /\bfrom\s*['"]moment/],
  ['date.luxon', /\bfrom\s*['"]luxon/],
  ['date.intl', /\bIntl\.DateTimeFormat\s*\(/],
  ['date.toLocaleDate', /\.toLocaleDateString\s*\(/],
  ['date.toISOString', /\.toISOString\s*\(/],

  ['number.intl', /\bIntl\.NumberFormat\s*\(/],
  ['number.toFixed', /\.toFixed\s*\(/],
  ['number.toLocaleString', /\.toLocaleString\s*\(/],

  ['null.nullish', /\?\?/],
  ['null.orDefault', /\|\|\s*['"]/],
  ['null.optionalChain', /\?\./],

  ['error.message', /\berror\s*(?:\?\.)?\.message\b|\berr\s*(?:\?\.)?\.message\b/],
  ['error.detail', /\berror\s*(?:\?\.)?\.detail\b/],
  ['error.toast', /\btoast\s*(?:\.\w+)?\s*\(/],
  ['error.boundary', /\bErrorBoundary\b/],

  ['state.useState', /\buseState\s*\(/],
  ['state.useReducer', /\buseReducer\s*\(/],
  ['state.context', /\bcreateContext\s*\(/],
  ['state.zustand', /\bfrom\s*['"]zustand/],
  ['state.redux', /\bfrom\s*['"]@reduxjs|\bfrom\s*['"]react-redux/],
  ['state.jotai', /\bfrom\s*['"]jotai/],

  ['fetch.reactQuery', /\buseQuery\s*\(|\buseMutation\s*\(|\buseSuspenseQuery\s*\(/],
  ['fetch.swr', /\buseSWR\s*\(/],
  ['fetch.apollo', /\buseQuery\s*<|\bgql`/],
  ['fetch.raw', /\bfetch\s*\(/],
  ['fetch.axios', /\bfrom\s*['"]axios/],
  ['fetch.serverAction', /['"]use server['"]/],

  ['url.searchParams', /\buseSearchParams\s*\(|\bURLSearchParams\b/],
  ['url.router', /\buseRouter\s*\(|\buseNavigate\s*\(/],

  ['style.tailwind', /\bclassName\s*=\s*["'`][^"'`]*\b(flex|grid|px-|py-|mt-|mb-|text-|bg-)/],
  ['style.cssModule', /\bfrom\s*['"][^'"]*\.module\.(css|scss)/],
  ['style.styled', /\bstyled\s*[.(]/],
  ['style.emotion', /\bfrom\s*['"]@emotion/],
  ['style.cva', /\bcva\s*\(/],
  ['style.clsx', /\b(clsx|classnames|cn)\s*\(/],

  ['i18n.t', /\bt\s*\(\s*['"]/],
  ['i18n.useTranslation', /\buseTranslation\s*\(|\buseTranslations\s*\(/],
  ['i18n.formatMessage', /\bformatMessage\s*\(/],

  ['test.rtl', /\bfrom\s*['"]@testing-library\/react/],
  ['test.userEvent', /\buserEvent\s*\./],
  ['test.axe', /\baxe\s*\(|\btoHaveNoViolations\b/],
  ['test.getByRole', /\bgetByRole\s*\(|\bfindByRole\s*\(/],
  ['test.getByTestId', /\bgetByTestId\s*\(|\bfindByTestId\s*\(/],

  ['form.hookForm', /\buseForm\s*\(/],
  ['form.formik', /\bfrom\s*['"]formik/],
  ['form.zod', /\bfrom\s*['"]zod|\bz\.object\s*\(/],

  ['a11y.ariaLabel', /\baria-label\b/],
  ['a11y.role', /\brole\s*=/],
  ['a11y.liveRegion', /\baria-live\b|role\s*=\s*["'](status|alert)["']/],
  ['a11y.focusRef', /\.focus\s*\(\)/],

  ['motion.framer', /\bfrom\s*['"]framer-motion/],
  ['motion.reducedMotion', /prefers-reduced-motion/],
];

// Wire-format casing is the convention most likely to be silently disagreed
// with, and it is decided by what the code actually reads off API payloads.
const SNAKE_ACCESS = /\.\s*[a-z]+_[a-z_]+\b/g;
const CAMEL_ACCESS = /\.\s*[a-z]+[A-Z][A-Za-z]*\b/g;

function collect(masked) {
  const counts = {};
  for (const [key, re] of COUNTERS) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let n = 0;
    while (g.exec(masked)) n++;
    if (n) counts[key] = n;
  }
  let snake = 0;
  SNAKE_ACCESS.lastIndex = 0;
  while (SNAKE_ACCESS.exec(masked)) snake++;
  let camel = 0;
  CAMEL_ACCESS.lastIndex = 0;
  while (CAMEL_ACCESS.exec(masked)) camel++;
  if (snake) counts['casing.snake'] = snake;
  if (camel) counts['casing.camel'] = camel;
  return counts;
}

function merge(target, counts) {
  for (const [k, v] of Object.entries(counts || {})) target[k] = (target[k] || 0) + v;
  return target;
}

// A convention is only reportable when one option genuinely dominates. Two
// close options is a mid-migration signal, and reporting either as "the
// convention" would send new code the wrong way — so it is escalated instead.
function decide(totals, prefix, options) {
  const scored = options
    .map((o) => ({ name: o.label, key: `${prefix}.${o.key}`, hits: totals[`${prefix}.${o.key}`] || 0 }))
    .filter((o) => o.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  if (!scored.length) return { verdict: 'NONE-FOUND', options: [] };
  const top = scored[0];
  const second = scored[1];
  const dominant = !second || top.hits >= second.hits * 3;
  return {
    verdict: dominant ? 'DOMINANT' : 'COMPETING',
    winner: top.name,
    hits: top.hits,
    options: scored,
    note: dominant
      ? null
      : `two live conventions (${scored.slice(0, 2).map((s) => `${s.name}:${s.hits}`).join(' vs ')}) — mid-migration signal, needs a human answer, not a guess`,
  };
}

function summarize(totals) {
  return {
    dateFormatting: decide(totals, 'date', [
      { key: 'dateFns', label: 'date-fns' },
      { key: 'dayjs', label: 'dayjs' },
      { key: 'moment', label: 'moment' },
      { key: 'luxon', label: 'luxon' },
      { key: 'intl', label: 'Intl.DateTimeFormat' },
      { key: 'toLocaleDate', label: 'toLocaleDateString' },
    ]),
    numberFormatting: decide(totals, 'number', [
      { key: 'intl', label: 'Intl.NumberFormat' },
      { key: 'toLocaleString', label: 'toLocaleString' },
      { key: 'toFixed', label: 'toFixed' },
    ]),
    nullHandling: decide(totals, 'null', [
      { key: 'nullish', label: '?? (nullish coalescing)' },
      { key: 'orDefault', label: '|| "default"' },
    ]),
    errorSurface: decide(totals, 'error', [
      { key: 'message', label: 'error.message' },
      { key: 'detail', label: 'error.detail' },
    ]),
    clientState: decide(totals, 'state', [
      { key: 'zustand', label: 'zustand' },
      { key: 'redux', label: 'redux' },
      { key: 'jotai', label: 'jotai' },
      { key: 'context', label: 'React context' },
      { key: 'useState', label: 'local useState' },
    ]),
    serverState: decide(totals, 'fetch', [
      { key: 'reactQuery', label: 'react-query' },
      { key: 'swr', label: 'SWR' },
      { key: 'apollo', label: 'Apollo' },
      { key: 'serverAction', label: 'server actions' },
      { key: 'axios', label: 'axios' },
      { key: 'raw', label: 'raw fetch' },
    ]),
    styling: decide(totals, 'style', [
      { key: 'tailwind', label: 'Tailwind utilities' },
      { key: 'cssModule', label: 'CSS modules' },
      { key: 'styled', label: 'styled-components' },
      { key: 'emotion', label: 'emotion' },
      { key: 'cva', label: 'cva variants' },
    ]),
    i18n: decide(totals, 'i18n', [
      { key: 'useTranslation', label: 'useTranslation/useTranslations' },
      { key: 'formatMessage', label: 'formatMessage' },
      { key: 't', label: 't() calls' },
    ]),
    forms: decide(totals, 'form', [
      { key: 'hookForm', label: 'react-hook-form' },
      { key: 'formik', label: 'formik' },
      { key: 'zod', label: 'zod schemas' },
    ]),
    testQueries: decide(totals, 'test', [
      { key: 'getByRole', label: 'role queries' },
      { key: 'getByTestId', label: 'test-id queries' },
    ]),
    wireCasing: decide(totals, 'casing', [
      { key: 'camel', label: 'camelCase' },
      { key: 'snake', label: 'snake_case' },
    ]),
    raw: totals,
  };
}

module.exports = { collect, merge, summarize, decide };
