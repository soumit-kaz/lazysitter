'use strict';

const { mask, lineIndex, lineAt, matchPair } = require('./lex');

// Patterns run against the masked copy from lex.js; values needing original
// text are read back from `raw` at the offsets the masked scan located.

const RE_DIRECTIVE = /^\s*(?:['"])use (client|server|strict)(?:['"])\s*;?/;
const RE_IMPORT = /\bimport\s+(type\s+)?([\s\S]*?)\s+from\s*(['"])/g;
const RE_IMPORT_BARE = /\bimport\s*(['"])/g;
const RE_REQUIRE = /\brequire\s*\(\s*(['"])/g;
const RE_EXPORT_FROM = /\bexport\s+(type\s+)?(\*|\{[\s\S]*?\})\s+from\s*(['"])/g;

const RE_FN_DECL = /\bexport\s+default\s+function\s+([A-Za-z_$][\w$]*)?|\bexport\s+function\s+([A-Za-z_$][\w$]*)|\bfunction\s+([A-Za-z_$][\w$]*)/g;
const RE_CONST_DECL = /\b(export\s+default\s+|export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*([^=]+?))?=/g;
const RE_CLASS_DECL = /\b(export\s+default\s+|export\s+)?class\s+([A-Za-z_$][\w$]*)(\s+extends\s+[\w$.]+(?:<[^>]*>)?)?/g;
const RE_INTERFACE = /\b(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)(?:\s*<[^>]*>)?(?:\s+extends\s+([^{]+))?\s*\{/g;
const RE_TYPE_ALIAS = /\b(?:export\s+)?type\s+([A-Za-z_$][\w$]*)(?:\s*<[^>]*>)?\s*=/g;
const RE_EXPORT_NAMED = /\bexport\s*\{([\s\S]*?)\}/g;
const RE_EXPORT_DEFAULT_EXPR = /\bexport\s+default\s+([A-Za-z_$][\w$.]*)/g;
const RE_HOOK_CALL = /\b(use[A-Z][\w$]*)\s*\(/g;
const RE_JSX_OPEN = /<([A-Za-z][\w$]*(?:\.[A-Za-z][\w$]*)*)/g;
const RE_DISPLAY_NAME = /\b([A-Za-z_$][\w$]*)\.displayName\s*=\s*(['"])/g;
const RE_DEFAULT_PROPS = /\b([A-Za-z_$][\w$]*)\.defaultProps\s*=\s*\{/g;

const WRAPPERS = ['memo', 'forwardRef', 'React.memo', 'React.forwardRef', 'observer', 'withRouter', 'styled'];

function readQuoted(raw, masked, quotePos) {
  const q = masked[quotePos];
  for (let i = quotePos + 1; i < masked.length; i++) {
    if (masked[i] === q) return raw.slice(quotePos + 1, i);
    if (masked[i] === '\n') break;
  }
  return '';
}

function isPascal(name) {
  return !!name && /^[A-Z]/.test(name) && !/^[A-Z0-9_]+$/.test(name);
}

function isHookName(name) {
  return !!name && /^use[A-Z]/.test(name);
}

// Splits on top-level separators only, so a member whose type contains `;`
// inside nested braces stays one member.
function splitMembers(body) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    const prev = body[i - 1];
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === ')' || ch === ']') depth--;
    // `<` only opens a generic when it follows a type name. `>` only closes one
    // when it is not the tail of `=>` — without this, every `() => void` member
    // unbalances the depth counter and swallows the rest of the interface.
    else if (ch === '<' && prev && /[\w$>\]]/.test(prev)) depth++;
    else if (ch === '>' && prev !== '=' && depth > 0) depth--;
    else if (depth === 0 && (ch === ';' || ch === ',' || ch === '\n')) {
      const seg = body.slice(start, i).trim();
      if (seg) parts.push(seg);
      start = i + 1;
    }
  }
  const tail = body.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function parseTypeMembers(body) {
  const members = [];
  for (const seg of splitMembers(body)) {
    if (!seg || seg.startsWith('//')) continue;
    const m = /^(readonly\s+)?(\[[^\]]+\]|[A-Za-z_$][\w$]*|'[^']*'|"[^"]*")\s*(\?)?\s*:\s*([\s\S]+)$/.exec(seg);
    if (m) {
      const rawName = m[2];
      members.push({
        name: rawName.replace(/^['"]|['"]$/g, ''),
        optional: !!m[3],
        type: m[4].trim(),
        indexSignature: rawName.startsWith('['),
        readonly: !!m[1],
      });
      continue;
    }
    // Method shorthand: `onSelect(id: string): void`
    const fn = /^([A-Za-z_$][\w$]*)\s*(\?)?\s*\(([\s\S]*)\)\s*:\s*([\s\S]+)$/.exec(seg);
    if (fn) {
      members.push({ name: fn[1], optional: !!fn[2], type: `(${fn[3]}) => ${fn[4]}`, method: true });
    }
  }
  return members;
}

function collectTypeDecls(raw, masked) {
  const types = new Map();
  RE_INTERFACE.lastIndex = 0;
  let m;
  while ((m = RE_INTERFACE.exec(masked))) {
    const open = masked.indexOf('{', m.index);
    const close = matchPair(masked, open, '{', '}');
    if (close === -1) continue;
    types.set(m[1], {
      name: m[1],
      kind: 'interface',
      extends: (m[2] || '').split(',').map((s) => s.trim()).filter(Boolean),
      members: parseTypeMembers(raw.slice(open + 1, close)),
      start: m.index,
    });
  }
  RE_TYPE_ALIAS.lastIndex = 0;
  while ((m = RE_TYPE_ALIAS.exec(masked))) {
    const eq = masked.indexOf('=', m.index + m[0].length - 1);
    let end = masked.length;
    for (let i = eq + 1, depth = 0; i < masked.length; i++) {
      const ch = masked[i];
      const prev = masked[i - 1];
      if (ch === '{' || ch === '(' || ch === '[') depth++;
      else if (ch === '}' || ch === ')' || ch === ']') depth--;
      // Same rule as splitMembers: `<` only opens a generic after a type name,
      // and `>` only closes one when it is not the tail of `=>`. Without this
      // every `() => void` member drives the depth negative and the alias body
      // is truncated at the next `;`.
      else if (ch === '<' && prev && /[\w$>\]]/.test(prev)) depth++;
      else if (ch === '>' && prev !== '=' && depth > 0) depth--;
      else if (depth === 0 && (ch === ';' || ch === '\n')) {
        // A newline only ends the alias when the next line starts a new statement.
        if (ch === ';') { end = i; break; }
        const rest = masked.slice(i + 1, i + 200);
        if (/^\s*(export|import|const|let|var|function|class|interface|type|\/\/|$)/.test(rest)) { end = i; break; }
      }
    }
    const bodyRaw = raw.slice(eq + 1, end).trim();
    const members = [];
    // Intersections and single literals both reduce to a member list.
    const literalRe = /\{/g;
    let lm;
    while ((lm = literalRe.exec(bodyRaw))) {
      const localMasked = mask(bodyRaw).masked;
      const close = matchPair(localMasked, lm.index, '{', '}');
      if (close === -1) break;
      members.push(...parseTypeMembers(bodyRaw.slice(lm.index + 1, close)));
      literalRe.lastIndex = close + 1;
    }
    const refs = bodyRaw
      .split('&')
      .map((s) => s.trim())
      .filter((s) => /^[A-Za-z_$][\w$.]*(<[\s\S]*>)?$/.test(s));
    types.set(m[1], { name: m[1], kind: 'type', members, refs, body: bodyRaw, start: m.index });
  }
  return types;
}

function resolveTypeMembers(typeName, types, seen = new Set()) {
  if (!typeName) return { members: [], unresolved: [] };
  const bare = typeName.replace(/<[\s\S]*$/, '').trim();
  if (seen.has(bare)) return { members: [], unresolved: [] };
  seen.add(bare);
  const decl = types.get(bare);
  if (!decl) return { members: [], unresolved: [bare] };
  const members = [...decl.members];
  const unresolved = [];
  for (const parent of [...(decl.extends || []), ...(decl.refs || [])]) {
    const sub = resolveTypeMembers(parent, types, seen);
    members.push(...sub.members);
    unresolved.push(...sub.unresolved);
  }
  const byName = new Map();
  for (const mem of members) if (!byName.has(mem.name)) byName.set(mem.name, mem);
  return { members: [...byName.values()], unresolved };
}


function parseDestructured(paramsRaw, paramsMasked) {
  const open = paramsMasked.indexOf('{');
  if (open === -1) return null;
  const close = matchPair(paramsMasked, open, '{', '}');
  if (close === -1) return null;
  const body = paramsRaw.slice(open + 1, close);
  const entries = [];
  let rest = null;
  for (const seg of splitMembers(body)) {
    if (!seg) continue;
    if (seg.startsWith('...')) {
      rest = seg.slice(3).trim();
      continue;
    }
    const m = /^([A-Za-z_$][\w$]*)\s*(?::\s*([A-Za-z_$][\w$]*|\{[\s\S]*\}))?\s*(?:=\s*([\s\S]+))?$/.exec(seg.trim());
    if (m) entries.push({ name: m[1], alias: m[2] && !m[2].startsWith('{') ? m[2] : null, default: m[3] ? m[3].trim() : null });
  }
  // Trailing type annotation after the destructuring pattern: `}: Props`
  const after = paramsRaw.slice(close + 1);
  const ann = /^\s*:\s*([\s\S]+?)\s*$/.exec(after.replace(/\)\s*$/, ''));
  let typeRef = null;
  let inlineMembers = null;
  if (ann) {
    const t = ann[1].trim();
    if (t.startsWith('{')) {
      const localMasked = mask(t).masked;
      const c2 = matchPair(localMasked, 0, '{', '}');
      if (c2 !== -1) inlineMembers = parseTypeMembers(t.slice(1, c2));
    } else {
      typeRef = t;
    }
  }
  return { entries, rest, typeRef, inlineMembers };
}

function paramTypeRef(paramsRaw) {
  const m = /^\s*\(?\s*[A-Za-z_$][\w$]*\s*:\s*([A-Za-z_$][\w$.]*(?:<[^)]*>)?)/.exec(paramsRaw);
  return m ? m[1].trim() : null;
}

function genericTypeRef(annotation) {
  if (!annotation) return null;
  const m = /(?:React\.)?(?:FC|FunctionComponent|VFC|ComponentType|SFC)\s*<\s*([A-Za-z_$][\w$.]*)/.exec(annotation);
  return m ? m[1] : null;
}


// Brace-aware, so `style={{ a: 1 }}` and `onClick={() => x > y}` do not end the
// tag early.
function readJsxAttributes(masked, tagNameEnd) {
  const attrs = [];
  const spreads = [];
  let i = tagNameEnd;
  let pendingName = '';
  while (i < masked.length) {
    const ch = masked[i];
    if (ch === '{') {
      const close = matchPair(masked, i, '{', '}');
      if (close === -1) break;
      if (!pendingName) spreads.push(masked.slice(i + 1, close).replace(/^\.\.\./, '').trim());
      pendingName = '';
      i = close + 1;
      continue;
    }
    if (ch === '>') return { attrs, spreads, end: i };
    if (ch === '/' && masked[i + 1] === '>') return { attrs, spreads, end: i + 1, selfClosing: true };
    if (ch === '<') break;
    const nameMatch = /^([A-Za-z_$][\w$:.-]*)/.exec(masked.slice(i));
    if (nameMatch) {
      pendingName = nameMatch[1];
      attrs.push(pendingName);
      i += nameMatch[1].length;
      const rest = /^\s*=\s*/.exec(masked.slice(i));
      if (rest) {
        i += rest[0].length;
        if (masked[i] === '"' || masked[i] === "'") {
          const q = masked[i];
          let k = i + 1;
          while (k < masked.length && masked[k] !== q) k++;
          i = k + 1;
        }
      } else {
        pendingName = '';
      }
      continue;
    }
    i++;
  }
  return { attrs, spreads, end: i };
}

function scanJsx(raw, masked, starts) {
  const elements = [];
  RE_JSX_OPEN.lastIndex = 0;
  let m;
  while ((m = RE_JSX_OPEN.exec(masked))) {
    const tag = m[1];
    const prev = masked[m.index - 1];
    // `a < b` and generics `Foo<Bar>` must not read as JSX.
    if (prev && /[\w$)\]]/.test(prev)) continue;
    const tagEnd = m.index + m[0].length;
    const nextCh = masked[tagEnd];
    if (nextCh && !/[\s/>]/.test(nextCh)) continue;
    const { attrs, spreads, end, selfClosing } = readJsxAttributes(masked, tagEnd);
    const isHost = /^[a-z]/.test(tag);
    elements.push({
      tag,
      host: isHost,
      attrs,
      spreads,
      selfClosing: !!selfClosing,
      start: m.index,
      end,
      line: lineAt(starts, m.index),
      raw: raw.slice(m.index, Math.min(end + 1, raw.length)),
    });
    RE_JSX_OPEN.lastIndex = Math.max(tagEnd, m.index + 1);
  }
  return elements;
}

function hasJsxIn(masked, from, to) {
  const slice = masked.slice(from, to);
  if (/<\s*\/|\/\s*>/.test(slice)) return true;
  RE_JSX_OPEN.lastIndex = 0;
  let m;
  while ((m = RE_JSX_OPEN.exec(slice))) {
    const prev = slice[m.index - 1];
    if (prev && /[\w$)\]]/.test(prev)) continue;
    const after = slice[m.index + m[0].length];
    if (after && /[\s/>]/.test(after)) return true;
  }
  return /\bjsxs?\s*\(|\bcreateElement\s*\(/.test(slice);
}


function bodySpan(masked, from) {
  const brace = masked.indexOf('{', from);
  const paren = masked.indexOf('(', from);
  let open = brace;
  if (paren !== -1 && (brace === -1 || paren < brace)) {
    const pClose = matchPair(masked, paren, '(', ')');
    if (pClose !== -1) open = masked.indexOf('{', pClose);
  }
  if (open === -1) return null;
  const close = matchPair(masked, open, '{', '}');
  if (close === -1) return null;
  return { open, close };
}

function statementEnd(masked, from) {
  let depth = 0;
  for (let i = from; i < masked.length; i++) {
    const ch = masked[i];
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === ')' || ch === ']') {
      depth--;
      if (depth < 0) return i;
    } else if (depth === 0 && ch === '\n') {
      const rest = masked.slice(i + 1, i + 240);
      if (/^\s*(export|import|const|let|var|function|class|interface|type|\/\/|$)/.test(rest)) return i;
    }
  }
  return masked.length;
}

function parseFile(relPath, raw) {
  const { masked } = mask(raw);
  const starts = lineIndex(raw);
  const types = collectTypeDecls(raw, masked);
  const jsx = scanJsx(raw, masked, starts);

  const directives = [];
  for (const line of raw.split('\n').slice(0, 6)) {
    const d = RE_DIRECTIVE.exec(line);
    if (d) directives.push(`use ${d[1]}`);
    else if (line.trim() && !line.trim().startsWith('//') && !line.trim().startsWith('/*')) break;
  }

  const imports = [];
  RE_IMPORT.lastIndex = 0;
  let m;
  while ((m = RE_IMPORT.exec(masked))) {
    const quotePos = m.index + m[0].length - 1;
    const source = readQuoted(raw, masked, quotePos);
    const clauseRaw = raw.slice(m.index + m[0].indexOf(m[2] || ''), quotePos);
    const clause = (m[2] || '').trim();
    const specifiers = [];
    const namespace = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(clause);
    if (namespace) specifiers.push({ imported: '*', local: namespace[1], kind: 'namespace' });
    const braceOpen = clause.indexOf('{');
    if (braceOpen !== -1) {
      const inner = clause.slice(braceOpen + 1, clause.lastIndexOf('}'));
      for (const part of inner.split(',')) {
        const t = part.trim().replace(/^type\s+/, '');
        if (!t) continue;
        const asMatch = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(t);
        if (asMatch) specifiers.push({ imported: asMatch[1], local: asMatch[2], kind: 'named' });
        else specifiers.push({ imported: t, local: t, kind: 'named' });
      }
      const def = clause.slice(0, braceOpen).replace(/,\s*$/, '').trim();
      if (def && !def.startsWith('*')) specifiers.push({ imported: 'default', local: def, kind: 'default' });
    } else if (clause && !namespace) {
      specifiers.push({ imported: 'default', local: clause.replace(/,\s*$/, '').trim(), kind: 'default' });
    }
    imports.push({
      source,
      typeOnly: !!m[1],
      specifiers,
      line: lineAt(starts, m.index),
      raw: clauseRaw.trim(),
    });
  }
  RE_IMPORT_BARE.lastIndex = 0;
  while ((m = RE_IMPORT_BARE.exec(masked))) {
    const before = masked.slice(Math.max(0, m.index - 40), m.index);
    if (/from\s*$/.test(before)) continue;
    imports.push({ source: readQuoted(raw, masked, m.index + m[0].length - 1), typeOnly: false, specifiers: [], sideEffect: true, line: lineAt(starts, m.index) });
  }
  RE_REQUIRE.lastIndex = 0;
  while ((m = RE_REQUIRE.exec(masked))) {
    imports.push({ source: readQuoted(raw, masked, m.index + m[0].length - 1), typeOnly: false, specifiers: [], cjs: true, line: lineAt(starts, m.index) });
  }
  RE_EXPORT_FROM.lastIndex = 0;
  while ((m = RE_EXPORT_FROM.exec(masked))) {
    imports.push({ source: readQuoted(raw, masked, m.index + m[0].length - 1), reExport: true, typeOnly: !!m[1], specifiers: [], line: lineAt(starts, m.index) });
  }

  const displayNames = new Map();
  RE_DISPLAY_NAME.lastIndex = 0;
  while ((m = RE_DISPLAY_NAME.exec(masked))) {
    displayNames.set(m[1], readQuoted(raw, masked, m.index + m[0].length - 1));
  }

  const defaultPropsFor = new Map();
  RE_DEFAULT_PROPS.lastIndex = 0;
  while ((m = RE_DEFAULT_PROPS.exec(masked))) {
    const open = masked.indexOf('{', m.index);
    const close = matchPair(masked, open, '{', '}');
    if (close === -1) continue;
    const entries = {};
    for (const seg of splitMembers(raw.slice(open + 1, close))) {
      const kv = /^([A-Za-z_$][\w$]*)\s*:\s*([\s\S]+)$/.exec(seg.trim());
      if (kv) entries[kv[1]] = kv[2].trim();
    }
    defaultPropsFor.set(m[1], entries);
  }

  const exportedNames = new Set();
  const exportedDefault = { name: null };
  RE_EXPORT_NAMED.lastIndex = 0;
  while ((m = RE_EXPORT_NAMED.exec(masked))) {
    if (/from\s*['"]/.test(masked.slice(m.index + m[0].length, m.index + m[0].length + 20))) continue;
    for (const part of m[1].split(',')) {
      const t = part.trim().replace(/^type\s+/, '');
      if (!t) continue;
      const asMatch = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(t);
      exportedNames.add(asMatch ? asMatch[2] : t);
      if (asMatch && asMatch[2] === 'default') exportedDefault.name = asMatch[1];
    }
  }
  RE_EXPORT_DEFAULT_EXPR.lastIndex = 0;
  while ((m = RE_EXPORT_DEFAULT_EXPR.exec(masked))) {
    if (!/^(function|class|async)$/.test(m[1])) exportedDefault.name = m[1];
  }

  const decls = [];
  const seenSpans = new Set();

  const pushDecl = (d) => {
    const key = `${d.name}@${d.start}`;
    if (seenSpans.has(key)) return;
    seenSpans.add(key);
    decls.push(d);
  };

  RE_FN_DECL.lastIndex = 0;
  while ((m = RE_FN_DECL.exec(masked))) {
    const name = m[1] || m[2] || m[3];
    if (!name) continue;
    const span = bodySpan(masked, m.index);
    if (!span) continue;
    const parenOpen = masked.indexOf('(', m.index);
    const parenClose = parenOpen === -1 ? -1 : matchPair(masked, parenOpen, '(', ')');
    pushDecl({
      name,
      start: m.index,
      line: lineAt(starts, m.index),
      bodyStart: span.open,
      bodyEnd: span.close,
      paramsRaw: parenClose === -1 ? '' : raw.slice(parenOpen, parenClose + 1),
      paramsMasked: parenClose === -1 ? '' : masked.slice(parenOpen, parenClose + 1),
      annotation: null,
      exported: /export/.test(m[0]),
      isDefault: /export\s+default/.test(m[0]),
      form: 'function',
    });
  }

  RE_CONST_DECL.lastIndex = 0;
  while ((m = RE_CONST_DECL.exec(masked))) {
    const name = m[2];
    const eq = m.index + m[0].length;
    const end = statementEnd(masked, eq);
    const initRaw = raw.slice(eq, end);
    const initMasked = masked.slice(eq, end);
    const arrowParen = initMasked.indexOf('(');
    const arrowIdx = initMasked.indexOf('=>');
    let paramsRaw = '';
    let paramsMasked = '';
    if (arrowIdx !== -1) {
      if (arrowParen !== -1 && arrowParen < arrowIdx) {
        const pc = matchPair(initMasked, arrowParen, '(', ')');
        if (pc !== -1) {
          paramsRaw = initRaw.slice(arrowParen, pc + 1);
          paramsMasked = initMasked.slice(arrowParen, pc + 1);
        }
      } else {
        paramsRaw = initRaw.slice(0, arrowIdx);
        paramsMasked = initMasked.slice(0, arrowIdx);
      }
    }
    const wrapper = WRAPPERS.find((w) => new RegExp(`^\\s*${w.replace('.', '\\.')}\\s*[(<]`).test(initMasked));
    if (wrapper && !paramsMasked) {
      const inner = initMasked.indexOf('(');
      const innerParen = inner === -1 ? -1 : initMasked.indexOf('(', inner + 1);
      if (innerParen !== -1) {
        const pc = matchPair(initMasked, innerParen, '(', ')');
        if (pc !== -1) {
          paramsRaw = initRaw.slice(innerParen, pc + 1);
          paramsMasked = initMasked.slice(innerParen, pc + 1);
        }
      }
    }
    pushDecl({
      name,
      start: m.index,
      line: lineAt(starts, m.index),
      bodyStart: eq,
      bodyEnd: end,
      paramsRaw,
      paramsMasked,
      annotation: m[3] ? m[3].trim() : null,
      exported: !!m[1],
      isDefault: /default/.test(m[1] || ''),
      wrapper: wrapper || null,
      form: arrowIdx !== -1 ? 'arrow' : 'const',
      initHead: initRaw.slice(0, 120).trim(),
    });
  }

  RE_CLASS_DECL.lastIndex = 0;
  while ((m = RE_CLASS_DECL.exec(masked))) {
    const span = bodySpan(masked, m.index);
    if (!span) continue;
    const generic = m[3] ? /<\s*([A-Za-z_$][\w$.]*)/.exec(m[3]) : null;
    pushDecl({
      name: m[2],
      start: m.index,
      line: lineAt(starts, m.index),
      bodyStart: span.open,
      bodyEnd: span.close,
      paramsRaw: '',
      paramsMasked: '',
      annotation: generic ? generic[1] : null,
      exported: !!m[1],
      isDefault: /default/.test(m[1] || ''),
      extends: m[3] ? m[3].replace(/^\s*extends\s+/, '').trim() : null,
      form: 'class',
    });
  }

  decls.sort((a, b) => a.start - b.start);

  for (const d of decls) {
    d.hasJsx = hasJsxIn(masked, d.bodyStart, d.bodyEnd);
    d.hookCalls = [];
    RE_HOOK_CALL.lastIndex = 0;
    const body = masked.slice(d.bodyStart, d.bodyEnd);
    let hm;
    while ((hm = RE_HOOK_CALL.exec(body))) d.hookCalls.push(hm[1]);
    d.renders = jsx
      .filter((el) => el.start >= d.bodyStart && el.start <= d.bodyEnd && !el.host)
      .map((el) => el.tag);
    d.hostTags = jsx
      .filter((el) => el.start >= d.bodyStart && el.start <= d.bodyEnd && el.host)
      .map((el) => el.tag);
    d.displayName = displayNames.get(d.name) || null;
    d.exported = d.exported || exportedNames.has(d.name);
    d.isDefault = d.isDefault || exportedDefault.name === d.name;

    // `isPascal` deliberately rejects ALL-CAPS names so `MAX_SIZE` is not read
    // as a component — but that also rejects single-letter names like `T` or
    // `A`, which are real components in i18n and layout code. A constant never
    // returns JSX, so returning JSX settles it on its own.
    const startsUpper = /^[A-Z]/.test(d.name);
    const isComponentShape =
      (startsUpper && d.hasJsx) ||
      ((isPascal(d.name) || d.name === '__default') &&
        ((d.form === 'class' && /Component|PureComponent/.test(d.extends || '')) || !!d.wrapper));
    d.kind = isComponentShape ? 'component' : isHookName(d.name) ? 'hook' : d.form === 'class' ? 'class' : 'util';

    if (d.kind === 'component' || d.kind === 'hook') {
      d.props = extractProps(d, types, defaultPropsFor.get(d.name) || null);
    }
  }

  return {
    path: relPath,
    directives,
    imports,
    types: [...types.values()].map((t) => ({ name: t.name, kind: t.kind, members: t.members, extends: t.extends || [] })),
    decls,
    jsx,
    exportedNames: [...exportedNames],
    defaultExport: exportedDefault.name,
    lines: starts.length,
    bytes: Buffer.byteLength(raw, 'utf8'),
  };
}

function extractProps(decl, types, defaultProps) {
  const destructured = decl.paramsMasked ? parseDestructured(decl.paramsRaw, decl.paramsMasked) : null;
  const typeRef =
    (destructured && destructured.typeRef) ||
    genericTypeRef(decl.annotation) ||
    (decl.form === 'class' ? decl.annotation : null) ||
    (decl.paramsRaw ? paramTypeRef(decl.paramsRaw) : null);

  const resolved = typeRef ? resolveTypeMembers(typeRef, types) : { members: [], unresolved: [] };
  const inline = (destructured && destructured.inlineMembers) || [];
  const byName = new Map();

  for (const mem of [...resolved.members, ...inline]) {
    byName.set(mem.name, {
      name: mem.name,
      type: mem.type,
      optional: !!mem.optional,
      required: !mem.optional,
      default: null,
      source: 'type',
      indexSignature: !!mem.indexSignature,
    });
  }
  if (destructured) {
    for (const e of destructured.entries) {
      const prior = byName.get(e.name);
      if (prior) {
        prior.default = e.default || prior.default;
        prior.destructured = true;
        if (e.default) prior.required = false;
      } else {
        byName.set(e.name, {
          name: e.name,
          type: null,
          optional: !!e.default,
          required: !e.default,
          default: e.default,
          source: 'destructured',
          destructured: true,
        });
      }
    }
  }
  if (defaultProps) {
    for (const [k, v] of Object.entries(defaultProps)) {
      const prior = byName.get(k);
      if (prior) {
        prior.default = prior.default || v;
        prior.required = false;
      } else byName.set(k, { name: k, type: null, optional: true, required: false, default: v, source: 'defaultProps' });
    }
  }

  return {
    typeRef: typeRef || null,
    unresolvedTypes: resolved.unresolved,
    rest: destructured ? destructured.rest : null,
    list: [...byName.values()],
  };
}

module.exports = { parseFile, parseTypeMembers, splitMembers, resolveTypeMembers, isPascal, isHookName };
