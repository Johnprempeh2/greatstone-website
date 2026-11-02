// GRE-3776: the sanitiser for schema 2 CSS. Page and chrome CSS are scoped to their own region of the
// page (`[data-gs-scope="page"]` and so on), so a page cannot restyle the header, the footer or another
// page. The site stylesheet is not scoped but follows the same rules.
//
// It is a small parser, not a regex filter: it splits the CSS into rules and declarations, keeps only
// the forms listed here, and rebuilds the CSS from what it kept. Anything it cannot parse is refused as
// a whole. Backslash escapes and `<` are refused outright: escapes can hide a banned word from any
// filter, and `<` has no use in CSS but could close the <style> element it is rendered in.

export const MAX_CSS_BYTES = 256 * 1024;
export const scopeSelector = (scope) => `[data-gs-scope="${scope}"]`;

const GROUPING_AT_RULES = new Set(['media', 'supports', 'container']);
const KEYFRAMES = new Set(['keyframes', '-webkit-keyframes']);
const PROPERTY = /^(--[a-zA-Z0-9_-]{1,64}|-?[a-zA-Z][a-zA-Z-]{0,63})$/;
const BANNED_PROPERTIES = new Set(['behavior', '-moz-binding']);
const ALLOWED_FUNCTIONS_WITH_URLS = new Set(['url']);
const BANNED_FUNCTIONS = new Set(['expression', 'src', 'image', 'image-set', '-webkit-image-set', 'element', '-moz-element', 'paint', 'env']);
const KEYFRAME_SELECTOR = /^(from|to|\d{1,3}(\.\d{1,4})?%)(\s*,\s*(from|to|\d{1,3}(\.\d{1,4})?%))*$/;
const IDENTIFIER = /^-?[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/;

class CssError extends Error {}

function stripComments(css) {
  let out = '';
  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    if (char === '"' || char === "'") {
      const end = css.indexOf(char, i + 1);
      if (end === -1 || /[\n\r\f]/.test(css.slice(i, end))) throw new CssError('unterminated string');
      out += css.slice(i, end + 1);
      i = end;
    } else if (char === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end === -1) throw new CssError('unterminated comment');
      out += ' ';
      i = end + 1;
    } else out += char;
  }
  return out;
}

// Splits one level of CSS into `{ prelude, body }` items: `body` is the text inside `{…}`, or null for
// a statement ended by `;`. Strings, brackets and parentheses are skipped over; unbalanced input throws.
function split(text, { allowTrailing = false } = {}) {
  const items = [];
  let start = 0;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' || char === "'") i = text.indexOf(char, i + 1);
    else if (char === '(' || char === '[') depth++;
    else if (char === ')' || char === ']') { if (--depth < 0) throw new CssError('unbalanced brackets'); }
    else if (depth === 0 && char === ';') { items.push({ prelude: text.slice(start, i).trim(), body: null }); start = i + 1; }
    else if (depth === 0 && char === '}') throw new CssError('unbalanced braces');
    else if (depth === 0 && char === '{') {
      let level = 1;
      let j = i + 1;
      for (; j < text.length && level; j++) {
        const inner = text[j];
        if (inner === '"' || inner === "'") j = text.indexOf(inner, j + 1);
        else if (inner === '{') level++;
        else if (inner === '}') level--;
      }
      if (level) throw new CssError('unbalanced braces');
      items.push({ prelude: text.slice(start, i).trim(), body: text.slice(i + 1, j - 1) });
      start = j;
      i = j - 1;
    }
  }
  if (depth) throw new CssError('unbalanced brackets');
  const rest = text.slice(start).trim();
  if (rest && !allowTrailing) throw new CssError('unterminated statement');
  if (rest) items.push({ prelude: rest, body: null });
  return items.filter((item) => item.prelude || item.body !== null);
}

// Splits on top-level commas, skipping strings and brackets.
function splitList(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' || char === "'") i = text.indexOf(char, i + 1);
    else if (char === '(' || char === '[') depth++;
    else if (char === ')' || char === ']') depth--;
    else if (char === ',' && depth === 0) { parts.push(text.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

function safeCssUrl(raw, media) {
  const value = raw.trim().replace(/^(['"])(.*)\1$/, '$2');
  if (!value || /[\s"'()]/.test(value)) return null;
  if (value.startsWith('media:')) {
    const item = Object.hasOwn(media, value.slice(6)) ? media[value.slice(6)] : null;
    return item?.key ? `/${item.key}` : null;
  }
  return value.startsWith('/') && !value.startsWith('//') ? value : null;
}

function cleanValue(property, value, media) {
  if (!value || /[{}]/.test(value) || /(javascript|vbscript)\s*:/i.test(value)) return null;
  let out = '';
  let last = 0;
  for (const match of value.matchAll(/([a-zA-Z_-][a-zA-Z0-9_-]*)\(/g)) {
    const name = match[1].toLowerCase();
    if (BANNED_FUNCTIONS.has(name)) return null;
    if (name === 'attr' && property !== 'content') return null;
    if (!ALLOWED_FUNCTIONS_WITH_URLS.has(name)) continue;
    const open = match.index + match[0].length;
    const close = value.indexOf(')', open);
    if (close === -1) return null;
    const url = safeCssUrl(value.slice(open, close), media);
    if (!url) return null;
    out += `${value.slice(last, match.index)}url("${url}")`;
    last = close + 1;
  }
  return (out + value.slice(last)).trim();
}

function cleanDeclarations(body, context) {
  if (body.includes('{')) throw new CssError('nested rules');
  const out = [];
  for (const { prelude } of split(body, { allowTrailing: true })) {
    const colon = prelude.indexOf(':');
    const property = colon > 0 ? prelude.slice(0, colon).trim() : '';
    const value = colon > 0 ? cleanValue(property.toLowerCase(), prelude.slice(colon + 1).trim(), context.media) : null;
    if (!PROPERTY.test(property) || BANNED_PROPERTIES.has(property.toLowerCase()) || value === null) {
      context.removed.push(`declaration ${property || '(invalid)'}`);
      continue;
    }
    out.push(`${property}:${value}`);
  }
  return out.join(';');
}

// Prefixes each selector with the scope, so it can only match inside its region. `:root`, `html` and
// `body` at the start of a selector mean the region itself. A selector that starts with a sibling
// combinator, or uses the nesting selector, could reach outside the region and is refused.
function scopeSelectors(prelude, scope) {
  if (!prelude || /[@;]/.test(prelude)) return null;
  const selectors = splitList(prelude);
  if (selectors.some((selector) => !selector)) return null;
  if (!scope) return selectors.join(',');
  const root = scopeSelector(scope);
  const out = [];
  for (const selector of selectors) {
    if (/^[~+]/.test(selector) || selector.includes('&')) return null;
    const rooted = /^(:root|html|body)(?![a-zA-Z0-9_-])/i.exec(selector);
    if (rooted && /^\s*[~+]/.test(selector.slice(rooted[0].length))) return null;
    out.push(rooted ? `${root}${selector.slice(rooted[0].length)}` : `${root} ${selector}`);
  }
  return out.join(',');
}

function cleanRules(text, context) {
  const out = [];
  for (const { prelude, body } of split(text)) {
    if (prelude.startsWith('@')) {
      const name = (/^@([a-zA-Z-]+)/.exec(prelude)?.[1] || '').toLowerCase();
      const rest = prelude.slice(name.length + 1).trim();
      if (GROUPING_AT_RULES.has(name) && body !== null && rest && !/url\(/i.test(rest)) {
        const inner = cleanRules(body, context);
        if (inner) out.push(`@${name} ${rest}{${inner}}`);
      } else if (KEYFRAMES.has(name) && body !== null && IDENTIFIER.test(rest)) {
        const frames = [];
        for (const frame of split(body)) {
          if (frame.body === null || !KEYFRAME_SELECTOR.test(frame.prelude)) throw new CssError('invalid keyframe');
          frames.push(`${frame.prelude}{${cleanDeclarations(frame.body, context)}}`);
        }
        out.push(`@${name} ${rest}{${frames.join('')}}`);
      } else if (name === 'font-face' && context.fontFace && body !== null && !rest) {
        out.push(`@font-face{${cleanDeclarations(body, context)}}`);
      } else context.removed.push(`@${name || '(invalid)'}`);
      continue;
    }
    const selectors = body === null ? null : scopeSelectors(prelude, context.scope);
    if (selectors === null) { context.removed.push(`rule ${prelude.slice(0, 60)}`); continue; }
    out.push(`${selectors}{${cleanDeclarations(body, context)}}`);
  }
  return out.join('\n');
}

// Returns { css, removed }. `scope` is the region name ('page', 'header', 'footer' or 'nav'), or null
// for the site stylesheet; `fontFace` allows @font-face (site stylesheet only). Invalid CSS returns ''.
export function sanitiseCss(css, { scope = null, media = {}, fontFace = false } = {}) {
  const removed = [];
  if (typeof css !== 'string' || !css.trim()) return { css: '', removed };
  if (Buffer.byteLength(css) > MAX_CSS_BYTES) return { css: '', removed: ['css (too large)'] };
  if (/[<\\\u0000]/.test(css)) return { css: '', removed: ['css (contains < or a backslash escape)'] };
  try {
    return { css: cleanRules(stripComments(css), { scope, media, fontFace, removed }), removed };
  } catch (error) {
    if (!(error instanceof CssError)) throw error;
    return { css: '', removed: [`css (${error.message})`] };
  }
}
