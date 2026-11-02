// GRE-3776: the sanitiser for schema 2 page and chrome HTML. It runs at render time on every page;
// the engine does not trust GSAM to have cleaned the HTML.
//
// The output is a tree of plain nodes, never an HTML string. The renderer turns the tree into React
// elements, so text and attribute values are escaped by React and a parser difference between this
// parser and the browser cannot smuggle markup through. Only allow-listed elements and attributes
// survive. Dangerous elements are dropped with their content; other unknown elements are unwrapped.
import { Window } from 'happy-dom';
import { islandProps } from './islands.mjs';

export const MAX_HTML_BYTES = 512 * 1024;
const MAX_DEPTH = 48;

const ELEMENTS = new Set([
  'section', 'article', 'aside', 'header', 'footer', 'nav', 'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'a', 'img', 'picture', 'source', 'figure', 'figcaption', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'q',
  'cite', 'em', 'strong', 'b', 'i', 'u', 's', 'small', 'mark', 'sub', 'sup', 'br', 'hr', 'wbr', 'code', 'pre', 'kbd',
  'abbr', 'time', 'address', 'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'details', 'summary', 'button',
]);
// Dropped with everything inside them.
const DROPPED = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'template', 'noscript', 'noembed',
  'noframes', 'svg', 'math', 'form', 'input', 'textarea', 'select', 'option', 'link', 'meta', 'base', 'title',
  'portal', 'fencedframe', 'xmp', 'plaintext', 'video', 'audio', 'track', 'canvas', 'dialog', 'slot', 'main',
]);
// A browser closes an open <p> at these, so they cannot sit inside one.
const BLOCK_CLOSES_PARAGRAPH = new Set(['section', 'article', 'aside', 'header', 'footer', 'nav', 'div', 'p', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'figure', 'figcaption', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'hr', 'pre', 'address', 'table',
  'details', 'summary']);
// Table parts and the parents a browser accepts them in; rows straight in a table get a tbody later.
const TABLE_PARENTS = { caption: ['table'], colgroup: ['table'], col: ['colgroup'], thead: ['table'], tbody: ['table'],
  tfoot: ['table'], tr: ['table', 'thead', 'tbody', 'tfoot'], td: ['tr'], th: ['tr'] };
const TABLE_CHILDREN = { table: true, thead: true, tbody: true, tfoot: true, tr: true, colgroup: true };
export const VOID_ELEMENTS = new Set(['img', 'source', 'br', 'hr', 'wbr', 'col']);

const GLOBAL_ATTRIBUTES = new Set(['class', 'id', 'title', 'lang', 'dir', 'role', 'hidden', 'translate']);
const ELEMENT_ATTRIBUTES = {
  a: new Set(['href', 'target', 'rel', 'hreflang']),
  img: new Set(['src', 'srcset', 'sizes', 'alt', 'width', 'height', 'loading', 'decoding', 'fetchpriority']),
  source: new Set(['srcset', 'sizes', 'type', 'media', 'width', 'height']),
  blockquote: new Set(['cite']), q: new Set(['cite']),
  time: new Set(['datetime']),
  ol: new Set(['start', 'reversed', 'type']),
  td: new Set(['colspan', 'rowspan', 'headers']), th: new Set(['colspan', 'rowspan', 'headers', 'scope', 'abbr']),
  col: new Set(['span']), colgroup: new Set(['span']),
  details: new Set(['open']),
  button: new Set(['type']),
};
const URL_ATTRIBUTES = new Set(['href', 'src', 'cite']);
const LINK_SCHEMES = new Set(['https', 'http', 'mailto', 'tel']);
const IMAGE_SCHEMES = new Set(['https']);
const ENUMS = {
  target: /^_blank$/, loading: /^(lazy|eager)$/, decoding: /^(async|sync|auto)$/, fetchpriority: /^(high|low|auto)$/,
  dir: /^(ltr|rtl|auto)$/, translate: /^(yes|no)$/, scope: /^(row|col|rowgroup|colgroup)$/, type: /^[a-zA-Z0-9/+.-]{1,64}$/,
};
const NUMBER = /^\d{1,5}$/;
const NUMERIC = new Set(['width', 'height', 'colspan', 'rowspan', 'span', 'start']);
// Ids and classes stay inside a page namespace: no clobbering of the engine's own ids or Next's globals.
// An element id also becomes a window property, so the globals the site sets lazily (`window.x ||= …`)
// are reserved too: `<div id="dataLayer">` would otherwise replace the analytics queue.
const ID = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const RESERVED_ID = /^(gs-|__next|next-|_|(dataLayer|gtag|google_tag_manager|google_tag_data|turnstile|Calendly|mountGreatstoneTide)$)/i;
// `data-gs-*` belongs to the engine (`data-gs-scope` picks which region's CSS applies), so pages and
// chrome cannot set it.
const DATA_ATTRIBUTE = /^data-(?!gs-)[a-z][a-z0-9-]{0,47}$/;
const ARIA_ATTRIBUTE = /^aria-[a-z]{2,24}$/;
const ATTRIBUTE_VALUE_LIMIT = 2000;

let parserWindow;
function fragment(html) {
  parserWindow ||= new Window({ settings: {
    disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true,
    disableIframePageLoading: true, disableComputedStyleRendering: true,
  } });
  const template = parserWindow.document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

// A URL is safe when it is a site path, an in-page anchor, or uses an allowed scheme. Browsers ignore
// tabs and new lines inside a scheme and treat a backslash like a slash, so both are refused outright.
export function safeUrl(value, { schemes = LINK_SCHEMES, media = {} } = {}) {
  if (typeof value !== 'string' || !value || value.length > ATTRIBUTE_VALUE_LIMIT) return null;
  if (value !== value.trim() || /[\u0000-\u001f\u007f-\u009f\\]/.test(value)) return null;
  if (value.startsWith('media:')) {
    const item = Object.hasOwn(media, value.slice(6)) ? media[value.slice(6)] : null;
    return item?.key ? `/${item.key}` : null;
  }
  if (value.startsWith('#') || value.startsWith('?')) return value;
  if (value.startsWith('/')) return value.startsWith('//') ? null : value;
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(value);
  return scheme && schemes.has(scheme[1].toLowerCase()) ? value : null;
}

function safeSrcset(value, media) {
  const candidates = value.split(',').map((item) => item.trim()).filter(Boolean);
  if (!candidates.length || candidates.length > 12) return null;
  const out = [];
  for (const candidate of candidates) {
    const [url, descriptor, extra] = candidate.split(/\s+/);
    if (extra !== undefined || (descriptor !== undefined && !/^\d{1,5}(w|(\.\d{1,2})?x)$/.test(descriptor))) return null;
    const safe = safeUrl(url, { schemes: IMAGE_SCHEMES, media });
    if (!safe) return null;
    out.push(descriptor ? `${safe} ${descriptor}` : safe);
  }
  return out.join(', ');
}

function cleanAttributes(tag, element, removed, media) {
  const attributes = {};
  const allowed = ELEMENT_ATTRIBUTES[tag];
  for (const { name, value } of element.attributes) {
    const known = GLOBAL_ATTRIBUTES.has(name) || allowed?.has(name) || DATA_ATTRIBUTE.test(name) || ARIA_ATTRIBUTE.test(name);
    let clean = known && value.length <= ATTRIBUTE_VALUE_LIMIT ? value : null;
    if (clean !== null && URL_ATTRIBUTES.has(name)) clean = safeUrl(value, { schemes: tag === 'img' ? IMAGE_SCHEMES : LINK_SCHEMES, media });
    else if (clean !== null && name === 'srcset') clean = safeSrcset(value, media);
    else if (clean !== null && name === 'id') clean = ID.test(value) && !RESERVED_ID.test(value) ? value : null;
    else if (clean !== null && NUMERIC.has(name)) clean = NUMBER.test(value) ? value : null;
    else if (clean !== null && name === 'type' && tag === 'button') clean = value === 'button' ? value : null;
    else if (clean !== null && Object.hasOwn(ENUMS, name)) clean = ENUMS[name].test(value) ? value : null;
    if (clean === null) removed.push(`${tag} @${name}`);
    else attributes[name] = clean;
  }
  if (tag === 'a' && attributes.target) attributes.rel = 'noopener noreferrer';
  if (tag === 'button') attributes.type = 'button';
  return attributes;
}

function walk(parent, context, depth) {
  const nodes = [];
  for (const child of parent.childNodes) {
    if (child.nodeType === 3) {
      if (TABLE_CHILDREN[context.parent]) continue;
      if (child.nodeValue) nodes.push({ type: 'text', value: child.nodeValue });
      continue;
    }
    if (child.nodeType !== 1) continue;
    const tag = child.localName;
    if (depth >= MAX_DEPTH) { context.removed.push(`${tag} (too deep)`); continue; }
    const tablePart = TABLE_PARENTS[tag];
    // Stray content directly inside a table part is dropped, as a browser would move it out.
    if (tablePart === undefined && TABLE_CHILDREN[context.parent]) { context.removed.push(tag); continue; }
    if (tag === 'gs-island') {
      // Islands render block content, so they cannot sit in a paragraph, heading, link or button.
      const name = child.getAttribute('name') || '';
      const placed = !(context.inParagraph || context.inHeading || context.inLink || context.inButton);
      const island = placed ? islandProps(name, [...child.attributes].map((item) => [item.name, item.value]), context.removed) : null;
      if (island) nodes.push({ type: 'island', name, ...island });
      else context.removed.push(`gs-island[${name}]`);
      continue;
    }
    if (DROPPED.has(tag) || tag.includes(':')) { context.removed.push(tag); continue; }
    const heading = /^h[1-6]$/.test(tag);
    // The renderer's HTML must parse back into the same tree in the browser, or hydration fails. So
    // unknown elements, and nesting a browser would re-parent (a in a, button in button, heading in
    // heading, a block inside a paragraph, table parts out of place), keep their children but lose
    // the element. Those children are cleaned as if the element were not there.
    const reparented = (tag === 'a' && context.inLink) || (tag === 'button' && context.inButton) || (heading && context.inHeading) ||
      (context.inParagraph && BLOCK_CLOSES_PARAGRAPH.has(tag)) || (tablePart !== undefined && !tablePart.includes(context.parent));
    if (!ELEMENTS.has(tag) || reparented) {
      context.removed.push(tag);
      if (!VOID_ELEMENTS.has(tag)) nodes.push(...walk(child, context, depth + 1));
      continue;
    }
    const inside = { ...context, parent: tag, inLink: context.inLink || tag === 'a', inButton: context.inButton || tag === 'button',
      inHeading: context.inHeading || heading, inParagraph: tag === 'p' || (context.inParagraph && !BLOCK_CLOSES_PARAGRAPH.has(tag)) };
    const children = VOID_ELEMENTS.has(tag) ? [] : walk(child, inside, depth + 1);
    nodes.push({ type: 'element', tag, attributes: cleanAttributes(tag, child, context.removed, context.media), children });
  }
  return nodes;
}

// Browsers put table rows in a tbody; do it here so server and browser trees agree.
function addTableBodies(nodes) {
  for (const node of nodes) {
    if (node.type !== 'element') continue;
    if (node.tag === 'table') {
      const out = [];
      for (const child of node.children) {
        if (child.type === 'element' && child.tag === 'tr') {
          const last = out.at(-1);
          if (last?.implicitBody) last.children.push(child);
          else out.push({ type: 'element', tag: 'tbody', attributes: {}, children: [child], implicitBody: true });
        } else out.push(child);
      }
      for (const child of out) delete child.implicitBody;
      node.children = out;
    }
    addTableBodies(node.children);
  }
  return nodes;
}

// Returns { nodes, removed }. `removed` names each element or attribute the sanitiser took out, for logs
// and for GSAM to show the author; it never contains attribute values.
export function sanitiseHtml(html, { media = {} } = {}) {
  const removed = [];
  if (typeof html !== 'string' || !html) return { nodes: [], removed };
  if (Buffer.byteLength(html) > MAX_HTML_BYTES) return { nodes: [], removed: ['html (too large)'] };
  const nodes = walk(fragment(html), { removed, media, parent: null, inLink: false, inButton: false, inHeading: false, inParagraph: false }, 0);
  return { nodes: addTableBodies(nodes), removed };
}

const escapeText = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttribute = (value) => escapeText(value).replace(/"/g, '&quot;');

// Serialises the sanitised tree. The site renders through React; this is for tests and for GSAM previews.
export function toHtml(nodes) {
  return nodes.map((node) => {
    if (node.type === 'text') return escapeText(node.value);
    if (node.type === 'island') return `<gs-island name="${escapeAttribute(node.name)}"${Object.entries(node.attributes).map(([key, value]) => ` ${key}="${escapeAttribute(value)}"`).join('')}></gs-island>`;
    const attributes = Object.entries(node.attributes).map(([key, value]) => ` ${key}="${escapeAttribute(value)}"`).join('');
    return VOID_ELEMENTS.has(node.tag) ? `<${node.tag}${attributes}>` : `<${node.tag}${attributes}>${toHtml(node.children)}</${node.tag}>`;
  }).join('');
}
