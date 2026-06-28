import { LINK_PROPS } from './link-audit.mjs';

// In-studio content search. A pure, read-only full-text search across every page's block PROSE plus the
// page titles — the words an editor actually wrote (headlines, body, FAQ answers, step text). The ⌘K
// palette only matches page/command LABELS, never block prop values, so today there's no way to find
// "where did we write that phrase". Same contract as auditLinks(state): no React, no network, no
// mutation; it reads state.order + state.pages + each page's data.content / data.root.props.title.
//
// Text is indexed by EXCLUSION (skip ids, link/href values, asset refs, layout enums, numbers; keep the
// rest), so a new block's new text field is searchable the day it's added — no per-block registry.

export const SKIP_KEYS = new Set([
  'id', 'kind', 'page', 'url', 'email', 'anchor',            // link-object internals
  ...LINK_PROPS,                                             // ctaHref, ctaHref2, href, link, …
  'align', 'size', 'variant', 'columns', 'numberStyle', 'cueStyle', // layout / enum props
  'ogImage', 'image', 'src', 'logo', 'icon', 'asset', 'media', 'photo', // asset references
  'n', 'index', 'value', 'prefix', 'suffix', 'dec',         // numbering / numerics (StatStrip, Terrace)
]);

// Guard against a token (slug/url/domain) that slips a non-skipped key: reject strings that look like a
// reference, not a sentence. Multi-word prose never matches (the domain branch is whole-string anchored).
const LOOKS_LIKE_REF = /^(#|https?:|mailto:|\/|[\w-]+\.[\w-]+$)/i;

const SNIPPET_RADIUS = 40;
export const MIN_QUERY = 2; // 0–1 char queries match everything → noise; ignored

export function isSearchableText(key, value) {
  if (typeof value !== 'string') return false;
  const t = value.trim();
  if (!t) return false;
  if (key && SKIP_KEYS.has(key)) return false;
  if (LOOKS_LIKE_REF.test(t)) return false;
  return true;
}

// strip the inline **bold** markers (src/blocks/emphasis.jsx) so we search + show the words, not markup
export function stripMarks(s) { return String(s).replace(/\*\*/g, ''); }

// recurse props, invoking cb(fieldPath, text) for every searchable prose string; fieldPath is a dotted
// trail ('body', 'items.0.q', 'slabs.1.title') used for display + ranking only.
export function walkText(node, key, path, cb) {
  if (Array.isArray(node)) { node.forEach((n, i) => walkText(n, key, path ? path + '.' + i : String(i), cb)); return; }
  if (node && typeof node === 'object') { Object.keys(node).forEach((k) => walkText(node[k], k, path ? path + '.' + k : k, cb)); return; }
  if (isSearchableText(key, node)) cb(path || key, node);
}

// case-insensitive literal-substring offsets (NEVER RegExp(query) — user input, no ReDoS), on the
// mark-stripped text.
function findMatches(text, qLower) {
  const hay = stripMarks(text);
  const lower = hay.toLowerCase();
  const out = [];
  let from = 0, idx;
  while ((idx = lower.indexOf(qLower, from)) !== -1) { out.push({ start: idx, end: idx + qLower.length }); from = idx + qLower.length; if (out.length >= 8) break; }
  return { hay, matches: out };
}

// snippet around the first match; hi offsets are snippet-relative so the UI splits [before][mark][after]
// without re-searching (avoids mis-locating on repeated terms).
export function buildSnippet(hay, m) {
  let s = Math.max(0, m.start - SNIPPET_RADIUS);
  const e = Math.min(hay.length, m.end + SNIPPET_RADIUS);
  if (s > 0) { const sp = hay.indexOf(' ', s); if (sp !== -1 && sp < m.start) s = sp + 1; } // snap to a word boundary
  const text = hay.slice(s, e);
  return { text, hi: { start: m.start - s, end: m.end - s }, truncatedStart: s > 0, truncatedEnd: e < hay.length };
}

// ranking only (no effect on correctness): page title > heading-class fields > body copy.
function fieldWeight(field, blockType) {
  if (blockType === 'Page title') return 100;
  const leaf = String(field).split('.').pop();
  if (/headline|heading|title|kicker|eyebrow|q$/.test(leaf)) return 60;
  if (/body|text|coda|intro|a$|label|prompt|lede/.test(leaf)) return 30;
  return 20;
}
function bestScore(group) { return group.hits.length ? group.hits[0].score : 0; }

const KEY_LABELS = { q: 'question', a: 'answer', body: 'Body', text: 'Text', headline: 'Headline', heading: 'Heading', kicker: 'Kicker', eyebrow: 'Eyebrow', coda: 'Coda', intro: 'Intro', lede: 'Lede', label: 'Label', phase: 'Phase', timing: 'Timing', title: 'Title', slabs: 'Step', items: 'Item', stats: 'Stat', pillars: 'Pillar', highlight: 'Highlight', prompt: 'Prompt' };
function prettyKey(k) { return KEY_LABELS[k] || (k.charAt(0).toUpperCase() + k.slice(1)); }

// turn a field path into something an editor reads: 'slabs.1.title' → 'Step 2 · Title' (1-based index).
export function fieldLabel(blockType, field) {
  if (field === 'title') return 'Page title';
  const parts = String(field).split('.');
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (/^\d+$/.test(p)) out[out.length - 1] = (out[out.length - 1] || '') + ' ' + (Number(p) + 1);
    else out.push(prettyKey(p));
  }
  return out.filter(Boolean).join(' · ');
}

function pushHits(hits, meta, text, qLower) {
  const { hay, matches } = findMatches(text, qLower);
  if (!matches.length) return;
  hits.push({ ...meta, snippet: buildSnippet(hay, matches[0]), count: matches.length, score: fieldWeight(meta.field, meta.blockType) });
}

// Public entry: grouped-by-page, ranked search results with a highlighted snippet per field hit.
export function searchContent(state, query) {
  const q = String(query == null ? '' : query).trim();
  if (q.length < MIN_QUERY) return { query: q, total: 0, groups: [] };
  const qLower = q.toLowerCase();
  const pages = (state && state.pages) || {};
  const order = (state && state.order) || Object.keys(pages);
  const groups = [];
  let total = 0;

  order.forEach((slug) => {
    const page = pages[slug];
    if (!page || !page.data) return;
    const title = (page.data.root && page.data.root.props && page.data.root.props.title) || page.title || slug;
    const hits = [];
    pushHits(hits, { blockId: '', blockType: 'Page title', field: 'title', label: 'Page title' }, title, qLower);
    (page.data.content || []).forEach((block) => {
      const props = (block && block.props) || {};
      const blockId = props.id || '';
      const blockType = (block && block.type) || 'Block';
      walkText(props, null, '', (fieldPath, text) => {
        pushHits(hits, { blockId, blockType, field: fieldPath, label: fieldLabel(blockType, fieldPath) }, text, qLower);
      });
    });
    if (hits.length) {
      const count = hits.reduce((n, h) => n + h.count, 0);
      total += count;
      hits.sort((a, b) => b.score - a.score || b.count - a.count);
      groups.push({ pageSlug: slug, title, count, hits });
    }
  });

  groups.sort((a, b) => bestScore(b) - bestScore(a) || b.count - a.count);
  return { query: q, total, groups };
}
