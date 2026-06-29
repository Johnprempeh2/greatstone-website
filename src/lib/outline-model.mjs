// Pure document-outline model (cycle 21). STORE-FREE (imports nothing from store.js/puck.config.jsx).
// headingsOf is INJECTED (it lives in headings-of.mjs / App) so this stays a pure graph function and the
// file is bare-node-test loadable. Rule split with cycle 7 (a11y-check): NO-H1 / MULTI-H1 / EMPTY-H1 stay
// owned by checkA11y. This model owns ONLY heading-ORDER: skipped-level (a DOWN jump of >1) + not-h1-first.
// Going UP (h3 -> h2, closing a subsection) is always valid and must never flag.

export function buildOutline(page, headingsOf) {
  const content = (page && page.data && page.data.content) || [];
  const items = [];
  content.forEach((block, index) => {
    for (const h of headingsOf(block)) {
      items.push({ level: h.level, text: (h.text || '').trim(), blockType: block.type, index });
    }
  });

  const issues = [];
  // not-h1-first: the first heading in document order should be the H1
  if (items.length && items[0].level !== 1) {
    issues.push({ ruleId: 'not-h1-first', wcag: '1.3.1', level: items[0].level, blockType: items[0].blockType, index: items[0].index,
      label: 'Page does not open with its main heading',
      detail: 'the first heading is an H' + items[0].level + '; a page should open with its H1 so the structure starts at the top' });
  }
  // skipped-level: a DOWN jump of more than one (e.g. H2 -> H4). UP jumps are always valid.
  let prev = null;
  for (const it of items) {
    if (prev != null && it.level > prev + 1) {
      issues.push({ ruleId: 'skipped-level', wcag: '1.3.1', from: prev, to: it.level, blockType: it.blockType, index: it.index,
        label: 'Heading level jumps from H' + prev + ' to H' + it.level,
        detail: 'screen-reader users navigate by heading level; don’t skip a level going down — add an H' + (prev + 1) + ' first' });
    }
    prev = it.level;
  }
  return { items, issues };
}

// opts.dynamic = slugs that render a LIVE/runtime component instead of their authored blocks (App passes
// these, mirroring the renderer's own special-cases, e.g. the Intelligence page renders the AI hub via
// `current === 'insights'`). Such a page's authored blocks are NOT what the DOM renders, so we never claim
// a (fictional) static outline for it — we list it as `dynamic` with a note instead.
export function buildSiteOutline(state, headingsOf, opts) {
  const pages = (state && state.pages) || {};
  const order = (state && state.order) || Object.keys(pages); // products lives in pages but not order → intentionally skipped
  const dynamic = new Set((opts && opts.dynamic) || []);
  const groups = [];
  let total = 0;
  for (const slug of order) {
    const page = pages[slug];
    if (!page || !page.data) continue;
    const title = (page.data.root && page.data.root.props && page.data.root.props.title) || page.title || slug;
    if (dynamic.has(slug)) { groups.push({ pageSlug: slug, title, items: [], issues: [], count: 0, dynamic: true }); continue; }
    const { items, issues } = buildOutline(page, headingsOf);
    total += issues.length;
    groups.push({ pageSlug: slug, title, items, issues, count: issues.length });
  }
  groups.sort((a, b) => b.count - a.count); // worst-first (dynamic pages have count 0, sort to the end)
  return { total, groups };
}
