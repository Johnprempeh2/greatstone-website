// Greatstone "SEO health" scorecard: a pure, read-only SITE-WIDE audit of every page's search/social
// meta (page.seo). Checks presence + length using the SAME thresholds as the SeoPanel length meter, so
// the audit and the editor never contradict (SeoPanel.jsx:20-21 meter(title.length,40,60) /
// meter(desc.length,110,158)), plus the one thing nothing else can see: cross-page DUPLICATE titles /
// descriptions, which split ranking signal. Heading structure (H1) is owned by a11y-check; this never
// touches it. Advisory + read-only: no React, no network, no mutation.

const TITLE_LO = 40, TITLE_HI = 60;   // SeoPanel.jsx:20 meter(title.length, 40, 60)
const DESC_LO = 110, DESC_HI = 158;   // SeoPanel.jsx:21 meter(desc.length, 110, 158)

const normVal = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
const displayTitle = (page, slug) => (page && page.data && page.data.root && page.data.root.props && page.data.root.props.title) || (page && page.title) || slug;

export function checkSeo(state) {
  const pages = (state && state.pages) || {};
  const order = (state && state.order) || Object.keys(pages);

  // PASS 1 — collect the slugs that share each non-empty, normalised meta value (for duplicate detection).
  const titleMap = new Map(); // normTitle -> Set(slug)
  const descMap = new Map();
  const add = (map, key, slug) => { if (!map.has(key)) map.set(key, new Set()); map.get(key).add(slug); };
  order.forEach((slug) => {
    const seo = (pages[slug] && pages[slug].seo) || {};
    const t = normVal(seo.title); if (t) add(titleMap, t, slug);
    const d = normVal(seo.description); if (d) add(descMap, d, slug);
  });
  // the OTHER pages sharing this value (display titles), or null if not a duplicate; never pairs with itself.
  const others = (map, key, slug) => {
    const set = map.get(key);
    if (!set || set.size < 2) return null;
    const list = [...set].filter((s) => s !== slug).map((s) => displayTitle(pages[s], s));
    return list.length ? list : null;
  };
  const nameList = (names) => names.slice(0, 3).map((n) => '“' + n + '”').join(', ') + (names.length > 3 ? ' and ' + (names.length - 3) + ' more' : '');

  const groups = [];
  let total = 0, errors = 0, warnings = 0;

  order.forEach((slug) => {
    const page = pages[slug];
    if (!page) return;
    const seo = page.seo || {};
    const issues = [];
    const title = String(seo.title || '').trim();
    const desc = String(seo.description || '').trim();

    // --- meta title: presence + length + duplicate ---
    if (!title) {
      issues.push({ ruleId: 'no-title', severity: 'error', field: 'title', fieldLabel: 'Meta title', label: 'Missing meta title', suggestion: 'add a meta title so search shows the right headline' });
    } else {
      if (title.length < TITLE_LO) issues.push({ ruleId: 'title-short', severity: 'warn', field: 'title', fieldLabel: 'Meta title', value: title, label: 'Meta title is short', suggestion: 'aim for ' + TITLE_LO + '–' + TITLE_HI + ' characters so the result fills the line' });
      else if (title.length > TITLE_HI) issues.push({ ruleId: 'title-long', severity: 'warn', field: 'title', fieldLabel: 'Meta title', value: title, label: 'Meta title is too long', suggestion: 'over ' + TITLE_HI + ' characters. Google truncates the end; tighten it' });
      const dup = others(titleMap, normVal(title), slug);
      if (dup) issues.push({ ruleId: 'dup-title', severity: 'error', field: 'title', fieldLabel: 'Meta title', value: title, label: 'Duplicate meta title', suggestion: 'also used on ' + nameList(dup) + '. Give each page its own title' });
    }

    // --- meta description: presence + length + duplicate ---
    if (!desc) {
      issues.push({ ruleId: 'no-desc', severity: 'error', field: 'description', fieldLabel: 'Meta description', label: 'Missing meta description', suggestion: 'add one honest line; search and social show it under the title' });
    } else {
      if (desc.length < DESC_LO) issues.push({ ruleId: 'desc-short', severity: 'warn', field: 'description', fieldLabel: 'Meta description', value: desc, label: 'Meta description is short', suggestion: 'aim for ' + DESC_LO + '–' + DESC_HI + ' characters to use the snippet fully' });
      else if (desc.length > DESC_HI) issues.push({ ruleId: 'desc-long', severity: 'warn', field: 'description', fieldLabel: 'Meta description', value: desc, label: 'Meta description is too long', suggestion: 'over ' + DESC_HI + ' characters. The snippet truncates; trim it' });
      const dup = others(descMap, normVal(desc), slug);
      if (dup) issues.push({ ruleId: 'dup-desc', severity: 'error', field: 'description', fieldLabel: 'Meta description', value: desc, label: 'Duplicate meta description', suggestion: 'also used on ' + nameList(dup) + '. Give each page its own description' });
    }

    if (issues.length) {
      issues.sort((a, b) => (a.severity === 'error' ? 0 : 1) - (b.severity === 'error' ? 0 : 1));
      total += issues.length;
      errors += issues.filter((i) => i.severity === 'error').length;
      warnings += issues.filter((i) => i.severity === 'warn').length;
      groups.push({ pageSlug: slug, title: displayTitle(page, slug), count: issues.length, issues });
    }
  });

  groups.sort((a, b) => b.count - a.count);
  return { total, errors, warnings, groups };
}
