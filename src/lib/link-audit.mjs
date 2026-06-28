import { resolveLink, LINK_KINDS } from './link-resolver.mjs';

// Site-wide link integrity. A pure, read-only walk over the CMS state (pages + navigation + the
// redirect table) that finds: internal links pointing at a page that was deleted or renamed, links a
// rename made RECOVERABLE via the redirect table (the site forwards them, but they're worth repointing),
// labelled buttons that link nowhere (dead CTAs), and orphan pages nothing reaches. No network, no
// backend — it only reads what already lives in the localStorage store, so it runs fully offline and is
// unit-testable. It classifies the same link values resolveLink/LinkField render, and finally gives a
// purpose to setSlug's redirect table, which nothing consumed before.

// Block prop keys that carry a legacy STRING link value. Structured {kind} link objects (from LinkField)
// are detected by shape regardless of key, so this only needs the string-link keys across the block set.
export const LINK_PROPS = ['ctaHref', 'ctaHref2', 'cardCtaHref', 'href', 'link', 'buttonHref', 'primaryHref', 'secondaryHref'];
const LINK_PROP_SET = new Set(LINK_PROPS);
// labelled-button pairs: a non-empty label with an empty link is a dead CTA a visitor can click to nowhere.
const LABEL_PAIRS = [['ctaHref', 'ctaLabel'], ['ctaHref2', 'ctaLabel2'], ['cardCtaHref', 'cardCtaLabel']];
const LINK_KIND_SET = new Set(LINK_KINDS.map((k) => k.value));
// structural pages reached by fixed routes — never "orphans". Mirror of store.RESERVED_SLUGS, kept here
// to avoid a store <-> audit import cycle (store re-exports this module).
const RESERVED = ['home', 'contact'];

// The page slug a link value targets, or null when it is not a page link (booking/url/email/anchor/empty).
export function linkPageSlug(value) {
  if (value && typeof value === 'object') return value.kind === 'page' ? String(value.page || '') : null;
  const m = String(value == null ? '' : value).trim().match(/^#go\/([\w-]+)$/);
  return m ? m[1] : null;
}

// Follow the redirect table from a slug to the live page it now resolves to (chain-collapsed + cycle
// guarded), or null if it dead-ends. Returns the slug itself when it is already a live page.
export function resolveRedirect(state, slug) {
  const pages = (state && state.pages) || {};
  const redirects = (state && state.redirects) || [];
  let cur = slug;
  const seen = new Set();
  while (cur && !pages[cur]) {
    if (seen.has(cur)) return null; // cycle guard
    seen.add(cur);
    const r = redirects.find((x) => x && x.from === cur);
    cur = r ? r.to : null;
  }
  return cur && pages[cur] ? cur : null;
}

// 'ok' (live, or empty pick which renders nothing) | 'recoverable' (resolves via a redirect) | 'broken'.
function classifyPageSlug(slug, state) {
  if (!slug) return 'ok';
  if (state.pages && state.pages[slug]) return 'ok';
  return resolveRedirect(state, slug) ? 'recoverable' : 'broken';
}

// Recurse a block's props, invoking cb(field, value) for every link value: a string under a link key, or
// any structured {kind} link object wherever it sits (including inside arrays, e.g. pillars[].href).
function walkLinkValues(node, cb, key) {
  if (Array.isArray(node)) { node.forEach((n) => walkLinkValues(n, cb, key)); return; }
  if (node && typeof node === 'object') {
    if (typeof node.kind === 'string' && LINK_KIND_SET.has(node.kind)) { cb(key || 'link', node); return; }
    Object.keys(node).forEach((k) => walkLinkValues(node[k], cb, k));
    return;
  }
  if (typeof node === 'string' && key && LINK_PROP_SET.has(key)) cb(key, node);
}

function walkNav(tree, cb) {
  (tree || []).forEach((item) => { if (item) { cb(item); if (Array.isArray(item.children)) walkNav(item.children, cb); } });
}

// Audit every internal link in the site. Pure: returns { issues, orphans, broken, recoverable } and never
// mutates state. Each issue: { pageSlug, blockId, blockType, field, target, severity, fixSlug, ... }.
export function auditLinks(state) {
  const pages = (state && state.pages) || {};
  const order = (state && state.order) || [];
  const navigation = (state && state.navigation) || [];
  const issues = [];
  const inbound = new Set(); // live slugs something points at (for orphan detection)

  const note = (slug) => { const live = resolveRedirect(state, slug); if (live) inbound.add(live); };

  order.forEach((pageSlug) => {
    const content = (pages[pageSlug] && pages[pageSlug].data && pages[pageSlug].data.content) || [];
    content.forEach((block) => {
      const props = (block && block.props) || {};
      const blockId = props.id || '';
      const blockType = (block && block.type) || 'Block';
      walkLinkValues(props, (field, value) => {
        const slug = linkPageSlug(value);
        if (slug === null) return; // not a page link (booking/url/email/anchor)
        if (slug) note(slug);
        const sev = classifyPageSlug(slug, state);
        if (sev === 'broken' || sev === 'recoverable') {
          issues.push({ pageSlug, blockId, blockType, field, target: slug, severity: sev, fixSlug: sev === 'recoverable' ? resolveRedirect(state, slug) : '' });
        }
      });
      // labelled button that links nowhere (a dead CTA the visitor can click)
      LABEL_PAIRS.forEach(([hrefKey, labelKey]) => {
        if (props[labelKey] && hrefKey in props) {
          const r = resolveLink(props[hrefKey]);
          if (!r.href || r.href === '#') issues.push({ pageSlug, blockId, blockType, field: hrefKey, target: '(empty)', severity: 'broken', fixSlug: '', dead: true });
        }
      });
    });
  });

  walkNav(navigation, (item) => {
    const slug = item.type === 'page' || item.pageSlug ? String(item.pageSlug || '') : '';
    if (!slug) return;
    note(slug);
    const sev = classifyPageSlug(slug, state);
    if (sev === 'broken' || sev === 'recoverable') {
      issues.push({ pageSlug: '(navigation)', blockId: '', blockType: 'Navigation', field: item.label || slug, target: slug, severity: sev, fixSlug: sev === 'recoverable' ? resolveRedirect(state, slug) : '', nav: true });
    }
  });

  // orphans: live, non-reserved pages nothing reaches. Only meaningful once a nav tree exists (when it's
  // empty the header falls back to page order, so every page is reachable that way).
  const orphans = navigation.length
    ? order.filter((s) => pages[s] && !RESERVED.includes(s) && !inbound.has(s))
    : [];

  return {
    issues,
    orphans,
    broken: issues.filter((i) => i.severity === 'broken').length,
    recoverable: issues.filter((i) => i.severity === 'recoverable').length,
  };
}
