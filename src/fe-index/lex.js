'use strict';

// Structural masking pass. Everything downstream (imports, exports, JSX, props)
// runs against `masked` — a same-length copy of the source where comment bodies,
// string bodies, template bodies and regex bodies are replaced by spaces.
//
// This is the single reason the index beats grep: `grep "<Button"` matches a
// `<Button` written inside a doc comment, a Storybook code sample, a `describe()`
// title or a `dangerouslySetInnerHTML` blob. Masked scanning cannot, because by
// the time a pattern runs, those regions are literally blank.

const CODE = 0;
const LINE_COMMENT = 1;
const BLOCK_COMMENT = 2;
const SQ_STRING = 3;
const DQ_STRING = 4;
const TEMPLATE = 5;
const REGEX = 6;

// A `/` starts a regex only where a value may not precede it. After any of these
// the `/` is division; after anything else (operators, `(`, `,`, `return`, ...)
// it opens a regex literal.
const VALUE_ENDING = /[\w$\])}>]$/;
const KEYWORD_BEFORE_REGEX = /\b(return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/;

function lastMeaningful(src, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(src[j])) j--;
  return j;
}

// A regex literal must close on the same line. Requiring that up front is what
// keeps a misjudged `/` from blanking the rest of a line — which, before this
// check, silently ate whole component declarations in JSX files.
function regexEndsOnLine(src, i) {
  let inClass = false;
  for (let k = i + 1; k < src.length; k++) {
    const ch = src[k];
    if (ch === '\n') return false;
    if (ch === '\\') { k++; continue; }
    if (inClass) { if (ch === ']') inClass = false; continue; }
    if (ch === '[') { inClass = true; continue; }
    if (ch === '/') return k > i + 1;
  }
  return false;
}

function regexAllowedAt(src, i) {
  // `/>` self-closes a JSX element and `</` opens a closing tag. Neither is
  // ever a regex, and both appear on nearly every line of a component file.
  if (src[i + 1] === '>') return false;
  const j = lastMeaningful(src, i);
  if (j < 0) return true;
  const ch = src[j];
  if (ch === '<') return false;
  if (VALUE_ENDING.test(ch)) {
    // Identifier-looking tail: only a keyword permits a regex to follow.
    const head = src.slice(Math.max(0, j - 12), j + 1);
    if (!KEYWORD_BEFORE_REGEX.test(head)) return false;
  }
  return regexEndsOnLine(src, i);
}

// Template literals nest: `a ${ `b ${c}` } d`. Track the `${` depth stack so the
// closing backtick of an inner template does not terminate the outer one.
function mask(src) {
  const n = src.length;
  const out = new Array(n);
  const strings = [];
  const comments = [];
  const templates = [];

  let state = CODE;
  let start = 0;
  let templateStack = [];
  let braceDepthAtTemplate = 0;
  let braceDepth = 0;
  let i = 0;

  const blank = (from, to) => {
    for (let k = from; k < to; k++) out[k] = src[k] === '\n' ? '\n' : ' ';
  };

  while (i < n) {
    const ch = src[i];
    const next = src[i + 1];

    if (state === CODE) {
      if (ch === '/' && next === '/') {
        state = LINE_COMMENT;
        start = i;
        out[i] = ' ';
        out[i + 1] = ' ';
        i += 2;
        continue;
      }
      if (ch === '/' && next === '*') {
        state = BLOCK_COMMENT;
        start = i;
        out[i] = ' ';
        out[i + 1] = ' ';
        i += 2;
        continue;
      }
      if (ch === "'") {
        state = SQ_STRING;
        start = i;
        out[i] = ch;
        i++;
        continue;
      }
      if (ch === '"') {
        state = DQ_STRING;
        start = i;
        out[i] = ch;
        i++;
        continue;
      }
      if (ch === '`') {
        state = TEMPLATE;
        start = i;
        templateStack.push(braceDepth);
        out[i] = ch;
        i++;
        continue;
      }
      if (ch === '/' && regexAllowedAt(src, i)) {
        state = REGEX;
        start = i;
        out[i] = ch;
        i++;
        continue;
      }
      if (ch === '{') braceDepth++;
      if (ch === '}') {
        braceDepth--;
        // Closing a `${ ... }` hole returns us to the enclosing template body.
        if (templateStack.length && braceDepth === templateStack[templateStack.length - 1]) {
          state = TEMPLATE;
          out[i] = ch;
          i++;
          continue;
        }
      }
      out[i] = ch;
      i++;
      continue;
    }

    if (state === LINE_COMMENT) {
      if (ch === '\n') {
        comments.push({ start, end: i, kind: 'line' });
        out[i] = '\n';
        state = CODE;
        i++;
        continue;
      }
      out[i] = ' ';
      i++;
      continue;
    }

    if (state === BLOCK_COMMENT) {
      if (ch === '*' && next === '/') {
        comments.push({ start, end: i + 2, kind: 'block' });
        out[i] = ' ';
        out[i + 1] = ' ';
        state = CODE;
        i += 2;
        continue;
      }
      out[i] = ch === '\n' ? '\n' : ' ';
      i++;
      continue;
    }

    if (state === SQ_STRING || state === DQ_STRING) {
      const quote = state === SQ_STRING ? "'" : '"';
      if (ch === '\\') {
        out[i] = ' ';
        out[i + 1] = ' ';
        i += 2;
        continue;
      }
      if (ch === quote) {
        strings.push({ start, end: i + 1, value: src.slice(start + 1, i) });
        out[i] = ch;
        state = CODE;
        i++;
        continue;
      }
      // Unterminated string at EOL — recover rather than swallowing the file.
      if (ch === '\n') {
        strings.push({ start, end: i, value: src.slice(start + 1, i) });
        out[i] = '\n';
        state = CODE;
        i++;
        continue;
      }
      out[i] = ' ';
      i++;
      continue;
    }

    if (state === TEMPLATE) {
      if (ch === '\\') {
        out[i] = ' ';
        out[i + 1] = ' ';
        i += 2;
        continue;
      }
      if (ch === '$' && next === '{') {
        braceDepth++;
        out[i] = ' ';
        out[i + 1] = '{';
        state = CODE;
        i += 2;
        continue;
      }
      if (ch === '`') {
        templates.push({ start, end: i + 1 });
        templateStack.pop();
        out[i] = ch;
        state = CODE;
        i++;
        continue;
      }
      out[i] = ch === '\n' ? '\n' : ' ';
      i++;
      continue;
    }

    if (state === REGEX) {
      if (ch === '\\') {
        out[i] = ' ';
        out[i + 1] = ' ';
        i += 2;
        continue;
      }
      if (ch === '\n') {
        // Not a regex after all (they cannot span lines) — the earlier `/` was
        // division. Rewind to code rather than masking the rest of the file.
        state = CODE;
        out[i] = '\n';
        i++;
        continue;
      }
      if (ch === '[') {
        // Character class: `/` inside it does not close the literal.
        let k = i + 1;
        while (k < n && src[k] !== ']' && src[k] !== '\n') {
          if (src[k] === '\\') k++;
          k++;
        }
        blank(i, Math.min(k + 1, n));
        i = Math.min(k + 1, n);
        continue;
      }
      if (ch === '/') {
        out[i] = ch;
        state = CODE;
        i++;
        continue;
      }
      out[i] = ' ';
      i++;
      continue;
    }
  }

  if (state === LINE_COMMENT || state === BLOCK_COMMENT) comments.push({ start, end: n, kind: 'eof' });
  for (let k = 0; k < n; k++) if (out[k] === undefined) out[k] = ' ';

  return { masked: out.join(''), strings, comments, templates };
}

// Line starts, computed once per file and reused by every extractor that needs
// to turn an offset into a 1-based line number.
function lineIndex(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
  return starts;
}

function lineAt(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

// Forward-scan a balanced pair starting at `open` (which must sit on the opening
// char). Returns the index of the matching close, or -1. Runs on masked text, so
// braces inside strings/comments are already gone.
function matchPair(masked, open, openCh, closeCh) {
  if (masked[open] !== openCh) return -1;
  let depth = 0;
  for (let i = open; i < masked.length; i++) {
    const ch = masked[i];
    if (ch === openCh) depth++;
    else if (ch === closeCh) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// Comment density, measured the way the pipeline's precedent rules require:
// comment lines / non-blank lines. Uses the mask so a URL containing `//`
// inside a string is not counted as a comment.
function commentDensity(src) {
  const { comments } = mask(src);
  const starts = lineIndex(src);
  const commentLines = new Set();
  for (const cm of comments) {
    const from = lineAt(starts, cm.start);
    const to = lineAt(starts, Math.max(cm.start, cm.end - 1));
    for (let l = from; l <= to; l++) commentLines.add(l);
  }
  let nonBlank = 0;
  for (const line of src.split('\n')) if (line.trim()) nonBlank++;
  return {
    commentLines: commentLines.size,
    nonBlankLines: nonBlank,
    density: nonBlank ? +(commentLines.size / nonBlank).toFixed(4) : 0,
  };
}

module.exports = { mask, lineIndex, lineAt, matchPair, commentDensity };
