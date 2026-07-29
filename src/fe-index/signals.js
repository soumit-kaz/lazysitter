'use strict';

const { mask, lineIndex, lineAt, matchPair } = require('./lex');

// Mechanical rule engine. Every rule below produces a `path:line` finding with a
// stable id, so an agent cites `A11Y-CLICK-NONINTERACTIVE at ui/Row.tsx:44`
// instead of asserting "there may be accessibility issues". Rules marked
// `heuristic` are explicitly labelled in output — an agent must confirm those by
// reading the file before treating one as a fact.

const INTERACTIVE_HOSTS = new Set(['button', 'a', 'input', 'select', 'textarea', 'summary', 'option', 'label']);
const CLICKABLE_NONINTERACTIVE = new Set(['div', 'span', 'li', 'td', 'tr', 'p', 'section', 'article', 'img', 'header', 'footer', 'nav', 'main', 'ul', 'ol']);
const HEAVY_PACKAGES = new Map([
  ['lodash', 'import the single function (`lodash/get`) or use a native equivalent — the root import pulls the whole library into the bundle'],
  ['moment', 'moment is unmaintained and bundles every locale — prefer date-fns/dayjs/Intl'],
  ['@material-ui/icons', 'a root icon-set import can pull thousands of modules — import each icon by path'],
  ['@mui/icons-material', 'a root icon-set import can pull thousands of modules — import each icon by path'],
  ['rxjs', 'import from `rxjs/operators` paths rather than the root barrel'],
  ['aws-sdk', 'the v2 monolith is megabytes — use the v3 per-client packages'],
]);
const SECRET_WORDS = /(secret|token|password|passwd|private[_-]?key|api[_-]?key|apikey|credential|client[_-]?secret)/i;
const PUBLIC_ENV = /\b(NEXT_PUBLIC_|VITE_|REACT_APP_|PUBLIC_|EXPO_PUBLIC_)([A-Z0-9_]+)/g;

function attrValue(tagRaw, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*(\\{[\\s\\S]*?\\}|"[^"]*"|'[^']*')`);
  const m = re.exec(tagRaw);
  return m ? m[1] : null;
}

function hasAttr(el, name) {
  return el.attrs.includes(name);
}

function anyAttr(el, names) {
  return names.some((n) => el.attrs.includes(n));
}

function push(out, id, severity, file, line, message, extra) {
  out.push(Object.assign({ id, severity, file, line, message }, extra || {}));
}

function analyze(file, raw, parsed, ctx = {}) {
  const findings = [];
  const { masked } = mask(raw);
  const starts = lineIndex(raw);
  const isNext = !!ctx.isNext;
  const usesTailwind = !!ctx.usesTailwind;
  const tokens = ctx.designTokens || null;
  const at = (offset) => lineAt(starts, offset);

  // --- accessibility ------------------------------------------------------
  const headings = [];
  for (const el of parsed.jsx) {
    const tag = el.tag;
    const line = el.line;

    if (tag === 'img' && !hasAttr(el, 'alt') && el.spreads.length === 0) {
      push(findings, 'A11Y-IMG-ALT', 'high', file, line, '<img> without an alt attribute — screen readers announce the filename or nothing');
    }
    if (tag === 'iframe' && !hasAttr(el, 'title')) {
      push(findings, 'A11Y-IFRAME-TITLE', 'high', file, line, '<iframe> without a title — it is announced as an unlabelled frame');
    }
    if (CLICKABLE_NONINTERACTIVE.has(tag) && hasAttr(el, 'onClick')) {
      const keyboardOk = anyAttr(el, ['onKeyDown', 'onKeyUp', 'onKeyPress']);
      const semanticsOk = hasAttr(el, 'role') && hasAttr(el, 'tabIndex');
      if (!keyboardOk || !semanticsOk) {
        push(findings, 'A11Y-CLICK-NONINTERACTIVE', 'high', file, line,
          `<${tag}> has onClick but ${!semanticsOk ? 'no role+tabIndex' : 'no keyboard handler'} — unreachable by keyboard`);
      }
    }
    if (tag === 'a' && hasAttr(el, 'onClick') && !hasAttr(el, 'href')) {
      push(findings, 'A11Y-ANCHOR-NO-HREF', 'high', file, line, '<a> with onClick and no href is not focusable or announced as a link — use <button>');
    }
    if (hasAttr(el, 'tabIndex')) {
      const v = attrValue(el.raw, 'tabIndex');
      if (v && /\{?\s*["']?[1-9]/.test(v)) {
        push(findings, 'A11Y-POSITIVE-TABINDEX', 'medium', file, line, 'positive tabIndex overrides natural focus order across the whole page');
      }
    }
    if (hasAttr(el, 'autoFocus')) {
      push(findings, 'A11Y-AUTOFOCUS', 'low', file, line, 'autoFocus moves focus without user intent — disorienting for screen-reader and magnifier users');
    }
    if (hasAttr(el, 'aria-hidden') && (INTERACTIVE_HOSTS.has(tag) || hasAttr(el, 'tabIndex') || hasAttr(el, 'onClick'))) {
      push(findings, 'A11Y-ARIA-HIDDEN-FOCUSABLE', 'high', file, line, 'aria-hidden on a focusable element creates a focusable node with no accessible name');
    }
    if (['input', 'select', 'textarea'].includes(tag) && el.spreads.length === 0) {
      const typed = attrValue(el.raw, 'type') || '';
      const isHiddenOrButton = /hidden|submit|button|reset/.test(typed);
      if (!isHiddenOrButton && !anyAttr(el, ['aria-label', 'aria-labelledby', 'id', 'placeholder', 'title'])) {
        push(findings, 'A11Y-FORM-LABEL', 'high', file, line, `<${tag}> has no id/aria-label — nothing associates a <label> with it`);
      }
    }
    if (/^h[1-6]$/.test(tag)) headings.push({ level: +tag[1], line });
    if (tag === 'svg' && hasAttr(el, 'role') && /img/.test(attrValue(el.raw, 'role') || '') && !anyAttr(el, ['aria-label', 'aria-labelledby'])) {
      push(findings, 'A11Y-SVG-NO-NAME', 'medium', file, line, 'svg role="img" without an accessible name');
    }

    // --- security ---------------------------------------------------------
    if (hasAttr(el, 'dangerouslySetInnerHTML')) {
      const v = attrValue(el.raw, 'dangerouslySetInnerHTML') || '';
      const sanitized = /sanitiz|DOMPurify|purify|clean\(/i.test(v);
      push(findings, 'SEC-DANGEROUS-HTML', sanitized ? 'medium' : 'critical', file, line,
        sanitized ? 'dangerouslySetInnerHTML with an apparent sanitizer — confirm the sanitizer covers this sink' : 'dangerouslySetInnerHTML with no visible sanitizer — XSS sink');
    }
    if (tag === 'a' || tag === 'Link') {
      const href = attrValue(el.raw, 'href') || '';
      if (href.startsWith('{') && !/^\{["'`]/.test(href)) {
        push(findings, 'SEC-HREF-EXPR', 'medium', file, line, 'href from an expression — a `javascript:` value reaching it is an XSS sink; validate the scheme', { heuristic: true });
      }
      const target = attrValue(el.raw, 'target') || '';
      const rel = attrValue(el.raw, 'rel') || '';
      if (/_blank/.test(target) && !/noopener/.test(rel)) {
        push(findings, 'SEC-TARGET-BLANK', 'medium', file, line, 'target="_blank" without rel="noopener" — the opened page gets a handle on window.opener');
      }
    }

    // --- performance / render identity ------------------------------------
    if (!el.host) {
      for (const attr of el.attrs) {
        const v = attrValue(el.raw, attr);
        if (!v || !v.startsWith('{')) continue;
        const inner = v.slice(1, -1).trim();
        if (/^\{[\s\S]*\}$/.test(inner) || /^\[[\s\S]*\]$/.test(inner)) {
          push(findings, 'PERF-INLINE-LITERAL-PROP', 'medium', file, line,
            `<${el.tag} ${attr}={...}> is a fresh object/array identity every render — it defeats React.memo and any dependency array downstream`);
        } else if (/^(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(inner) && !/^\s*handle|^\s*on[A-Z]/.test(inner)) {
          push(findings, 'PERF-INLINE-FN-PROP', 'low', file, line,
            `<${el.tag} ${attr}={() => ...}> allocates a new function identity every render`, { heuristic: true });
        }
      }
    }
    if (hasAttr(el, 'key')) {
      const v = attrValue(el.raw, 'key') || '';
      if (/^\{\s*(i|idx|index|_?i)\s*\}$/.test(v)) {
        push(findings, 'PERF-INDEX-KEY', 'medium', file, line, 'key={index} — React reuses the wrong DOM node and component state when the list reorders, filters, or gets an insert');
      }
    }
    if (isNext && tag === 'img') {
      push(findings, 'NEXT-RAW-IMG', 'medium', file, line, 'raw <img> in a Next app — next/image gives sizing, lazy-loading and format negotiation, and prevents the CLS this causes');
    }
  }

  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level - headings[i - 1].level > 1) {
      push(findings, 'A11Y-HEADING-SKIP', 'low', file, headings[i].line,
        `heading level jumps h${headings[i - 1].level} → h${headings[i].level} — screen-reader users navigate by this outline`);
    }
  }

  // --- module-level scans -------------------------------------------------
  PUBLIC_ENV.lastIndex = 0;
  let m;
  while ((m = PUBLIC_ENV.exec(masked))) {
    if (SECRET_WORDS.test(m[2])) {
      push(findings, 'SEC-PUBLIC-ENV-SECRET', 'critical', file, at(m.index),
        `${m[1]}${m[2]} is inlined into the client bundle at build time — a secret-shaped name behind a public prefix is a shipped secret`);
    }
  }
  const evalRe = /\b(eval|new\s+Function)\s*\(/g;
  while ((m = evalRe.exec(masked))) push(findings, 'SEC-EVAL', 'high', file, at(m.index), 'eval/new Function in client code — an arbitrary-code sink');

  const storageRe = /\b(?:localStorage|sessionStorage)\s*\.\s*setItem\s*\(\s*['"]([^'"]+)['"]/g;
  while ((m = storageRe.exec(masked))) {
    const key = raw.slice(m.index, m.index + m[0].length);
    if (SECRET_WORDS.test(key)) {
      push(findings, 'SEC-TOKEN-IN-STORAGE', 'high', file, at(m.index),
        'a credential-shaped value in localStorage is readable by any script on the origin — an httpOnly cookie is not');
    }
  }

  for (const imp of parsed.imports) {
    const pkg = imp.source;
    const heavy = HEAVY_PACKAGES.get(pkg);
    if (heavy && imp.specifiers.some((s) => s.kind === 'default' || s.kind === 'namespace')) {
      push(findings, 'PERF-HEAVY-IMPORT', 'medium', file, imp.line, `root import of \`${pkg}\` — ${heavy}`);
    }
    if (isNext && /^(fs|path|crypto|child_process|node:)/.test(pkg) && parsed.directives.includes('use client')) {
      push(findings, 'NEXT-SERVER-MODULE-IN-CLIENT', 'critical', file, imp.line, `'use client' file imports the server-only module \`${pkg}\` — this fails the client build`);
    }
  }

  // --- React correctness --------------------------------------------------
  for (const decl of parsed.decls) {
    if (decl.kind !== 'component' && decl.kind !== 'hook') continue;
    const body = masked.slice(decl.bodyStart, decl.bodyEnd);
    const bodyRaw = raw.slice(decl.bodyStart, decl.bodyEnd);
    const propNames = new Set((decl.props && decl.props.list || []).map((p) => p.name));

    // Conditional hooks: any hook call nested deeper than the function body's
    // own brace level is inside a block — if/for/while/&&/try.
    const hookRe = /\b(use[A-Z][\w$]*)\s*\(/g;
    let firstReturn = -1;
    {
      let depth = 0;
      for (let i = 0; i < body.length; i++) {
        const ch = body[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        else if (depth === 1 && body.startsWith('return', i) && !/[\w$]/.test(body[i - 1] || ' ')) { firstReturn = i; break; }
      }
    }
    while ((m = hookRe.exec(body))) {
      let depth = 0;
      for (let i = 0; i < m.index; i++) {
        if (body[i] === '{') depth++;
        else if (body[i] === '}') depth--;
      }
      const line = at(decl.bodyStart + m.index);
      if (depth > 1) {
        push(findings, 'REACT-CONDITIONAL-HOOK', 'critical', file, line,
          `${m[1]}() is called inside a nested block in ${decl.name} — hook order must be identical on every render`);
      }
      if (firstReturn !== -1 && m.index > firstReturn && depth <= 1) {
        push(findings, 'REACT-HOOK-AFTER-RETURN', 'critical', file, line,
          `${m[1]}() runs after an early return in ${decl.name} — it is skipped on the early-return path, changing hook order`);
      }
    }

    // Effect dependency arrays vs the identifiers the callback actually reads.
    const effectRe = /\b(useEffect|useLayoutEffect|useMemo|useCallback|useInsertionEffect)\s*\(/g;
    while ((m = effectRe.exec(body))) {
      const open = m.index + m[0].length - 1;
      const close = matchPair(body, open, '(', ')');
      if (close === -1) continue;
      const argsMasked = body.slice(open + 1, close);
      const argsRaw = bodyRaw.slice(open + 1, close);
      const line = at(decl.bodyStart + m.index);
      const depStart = argsMasked.lastIndexOf('[');
      const hasDeps = depStart !== -1 && matchPair(argsMasked, depStart, '[', ']') === argsMasked.length - argsMasked.slice(depStart).indexOf(']') - 1
        ? true
        : /,\s*\[[\s\S]*\]\s*$/.test(argsMasked.trim());
      if (m[1] === 'useEffect' || m[1] === 'useLayoutEffect') {
        if (!hasDeps) {
          push(findings, 'REACT-EFFECT-NO-DEPS', 'medium', file, line,
            `${m[1]} with no dependency array in ${decl.name} runs after every render — confirm that is intended`);
        }
      }
      const depsMatch = /,\s*\[([\s\S]*)\]\s*$/.exec(argsMasked.trim());
      if (depsMatch) {
        const declared = new Set(
          depsMatch[1]
            .split(',')
            .map((s) => s.trim().split(/[.[]/)[0])
            .filter(Boolean)
        );
        const callbackText = argsRaw.slice(0, argsRaw.length - (depsMatch[0].length - 1));
        const referenced = new Set();
        const idRe = /\b([A-Za-z_$][\w$]*)\b/g;
        let im;
        while ((im = idRe.exec(callbackText))) referenced.add(im[1]);
        const missing = [...propNames].filter((p) => referenced.has(p) && !declared.has(p));
        if (missing.length) {
          push(findings, 'REACT-MISSING-DEP', 'high', file, line,
            `${m[1]} in ${decl.name} reads prop(s) ${missing.map((x) => `\`${x}\``).join(', ')} but does not list them — stale-closure bug, not a lint nag`,
            { heuristic: true, missing });
        }
      }
    }

    if (/\beslint-disable(-next-line)?\s+react-hooks\/exhaustive-deps/.test(bodyRaw)) {
      push(findings, 'REACT-DEPS-SUPPRESSED', 'high', file, decl.line,
        `exhaustive-deps is suppressed in ${decl.name} — the suppression hides a real stale-closure risk unless a comment proves otherwise`);
    }

    const setStateInRender = /^\s*set[A-Z][\w$]*\s*\(/gm;
    while ((m = setStateInRender.exec(body))) {
      let depth = 0;
      for (let i = 0; i < m.index; i++) {
        if (body[i] === '{') depth++;
        else if (body[i] === '}') depth--;
      }
      if (depth === 1) {
        push(findings, 'REACT-SET-STATE-IN-RENDER', 'critical', file, at(decl.bodyStart + m.index),
          `a state setter is called directly in ${decl.name}'s render body — infinite re-render loop`, { heuristic: true });
      }
    }

    if (isNext) {
      const nd = /\b(Math\.random|Date\.now|new Date\s*\(\s*\)|window\.|document\.|localStorage|navigator\.)/g;
      while ((nd.lastIndex = nd.lastIndex), (m = nd.exec(body))) {
        let depth = 0;
        for (let i = 0; i < m.index; i++) {
          if (body[i] === '{') depth++;
          else if (body[i] === '}') depth--;
        }
        if (depth === 1) {
          push(findings, 'HYDRATE-NONDETERMINISTIC', 'high', file, at(decl.bodyStart + m.index),
            `${m[1].replace(/[.(].*$/, '')} evaluated during ${decl.name}'s render — server and client produce different HTML, which is a hydration mismatch`, { heuristic: true });
        }
      }
    }

    const mapRe = /\.map\s*\(/g;
    while ((m = mapRe.exec(body))) {
      const open = m.index + m[0].length - 1;
      const close = matchPair(body, open, '(', ')');
      if (close === -1) continue;
      const inner = body.slice(open, close);
      if (/<[A-Za-z]/.test(inner) && !/\bkey\s*=/.test(inner)) {
        push(findings, 'REACT-LIST-NO-KEY', 'high', file, at(decl.bodyStart + m.index),
          `.map() in ${decl.name} renders elements without a key — React falls back to index reconciliation`);
      }
      mapRe.lastIndex = close;
    }

    const leakRe = /\b(addEventListener|setInterval|setTimeout|new\s+(?:MutationObserver|ResizeObserver|IntersectionObserver)|\.subscribe\s*\()/g;
    let leaks = 0;
    while ((m = leakRe.exec(body))) leaks++;
    if (leaks) {
      const teardown = /\breturn\s*\(?\s*\(\s*\)\s*=>|removeEventListener|clearInterval|clearTimeout|\.disconnect\s*\(|unsubscribe/.test(body);
      if (!teardown) {
        push(findings, 'LEAK-NO-TEARDOWN', 'high', file, decl.line,
          `${decl.name} registers ${leaks} listener/timer/observer/subscription(s) with no visible teardown — this accumulates on every mount`);
      }
    }
  }

  // --- Next.js client boundary -------------------------------------------
  if (isNext) {
    const isClient = parsed.directives.includes('use client');
    const usesClientOnly = /\b(useState|useReducer|useEffect|useLayoutEffect|useRef|useContext|createContext)\s*\(/.test(masked) ||
      parsed.jsx.some((el) => el.attrs.some((a) => /^on[A-Z]/.test(a)));
    if (!isClient && usesClientOnly && /(^|\/)(app)\//.test(file)) {
      push(findings, 'NEXT-MISSING-USE-CLIENT', 'critical', file, 1,
        "uses client-only React APIs or event handlers without a 'use client' directive — this is a Server Component and will fail to build or silently drop interactivity");
    }
    if (isClient && /(^|\/)(app\/.*\/)?(layout|page)\.[jt]sx?$/.test(file)) {
      push(findings, 'NEXT-CLIENT-BOUNDARY-TOO-HIGH', 'medium', file, 1,
        "'use client' on a layout/page forfeits server rendering for the entire subtree — push the boundary down to the narrowest interactive component");
    }
  }

  // --- styling / design tokens -------------------------------------------
  const hexRe = /#[0-9a-fA-F]{3,8}\b/g;
  const hexSeen = new Set();
  while ((m = hexRe.exec(raw))) {
    const line = at(m.index);
    if (hexSeen.has(line)) continue;
    hexSeen.add(line);
    if (tokens && tokens.colors && tokens.colors.has(m[0].toLowerCase())) continue;
    push(findings, 'STYLE-HARDCODED-COLOR', 'low', file, line,
      `hardcoded colour ${m[0]} — the design system defines colour tokens; a literal here will not follow theme or dark mode`);
  }
  if (usesTailwind) {
    const arbitrary = /class(?:Name)?\s*=\s*["'`][^"'`]*\[[^\]]+\][^"'`]*["'`]/g;
    while ((m = arbitrary.exec(raw))) {
      push(findings, 'STYLE-ARBITRARY-VALUE', 'low', file, at(m.index),
        'Tailwind arbitrary value escapes the design scale — confirm no token covers it');
    }
  }
  const importantRe = /!important/g;
  while ((m = importantRe.exec(masked))) push(findings, 'STYLE-IMPORTANT', 'low', file, at(m.index), '!important defeats the cascade and forces the next override to escalate too');

  return findings;
}

const RULES = {
  'A11Y-IMG-ALT': 'Image without a text alternative',
  'A11Y-IFRAME-TITLE': 'Frame without a title',
  'A11Y-CLICK-NONINTERACTIVE': 'Click handler on a non-interactive element',
  'A11Y-ANCHOR-NO-HREF': 'Anchor used as a button',
  'A11Y-POSITIVE-TABINDEX': 'Positive tabIndex',
  'A11Y-AUTOFOCUS': 'Unrequested focus move',
  'A11Y-ARIA-HIDDEN-FOCUSABLE': 'aria-hidden on a focusable node',
  'A11Y-FORM-LABEL': 'Form control with no label association',
  'A11Y-HEADING-SKIP': 'Heading level skipped',
  'A11Y-SVG-NO-NAME': 'svg role="img" without a name',
  'SEC-DANGEROUS-HTML': 'Raw HTML injection sink',
  'SEC-HREF-EXPR': 'Dynamic href scheme not validated',
  'SEC-TARGET-BLANK': 'target=_blank without noopener',
  'SEC-PUBLIC-ENV-SECRET': 'Secret-shaped value behind a public env prefix',
  'SEC-EVAL': 'eval / new Function',
  'SEC-TOKEN-IN-STORAGE': 'Credential in web storage',
  'PERF-INLINE-LITERAL-PROP': 'New object/array identity every render',
  'PERF-INLINE-FN-PROP': 'New function identity every render',
  'PERF-INDEX-KEY': 'List keyed by array index',
  'PERF-HEAVY-IMPORT': 'Root import of a heavy package',
  'REACT-CONDITIONAL-HOOK': 'Hook called conditionally',
  'REACT-HOOK-AFTER-RETURN': 'Hook after an early return',
  'REACT-EFFECT-NO-DEPS': 'Effect with no dependency array',
  'REACT-MISSING-DEP': 'Effect reads a prop it does not depend on',
  'REACT-DEPS-SUPPRESSED': 'exhaustive-deps suppressed',
  'REACT-SET-STATE-IN-RENDER': 'State set during render',
  'REACT-LIST-NO-KEY': 'List rendered without keys',
  'LEAK-NO-TEARDOWN': 'Subscription/timer/observer without teardown',
  'HYDRATE-NONDETERMINISTIC': 'Non-deterministic value in render',
  'NEXT-MISSING-USE-CLIENT': "Client APIs without 'use client'",
  'NEXT-CLIENT-BOUNDARY-TOO-HIGH': "'use client' at a page/layout root",
  'NEXT-SERVER-MODULE-IN-CLIENT': 'Server-only module in a client file',
  'NEXT-RAW-IMG': 'Raw <img> in a Next app',
  'STYLE-HARDCODED-COLOR': 'Hardcoded colour outside the token set',
  'STYLE-ARBITRARY-VALUE': 'Arbitrary value outside the design scale',
  'STYLE-IMPORTANT': '!important',
};

module.exports = { analyze, RULES };
