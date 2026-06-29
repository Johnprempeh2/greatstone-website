// Studio Setup Guide model — a pure, read-only readiness ledger. For each setup task it derives `done`
// from real state, so the panel is a live checklist on day one AND an audit of a stale tenant.
// STORE-FREE: imports nothing (store.js pulls in puck.config.jsx = JSX, which bare node --test can't load).
// The facts state can't carry — the Greatstone DEFAULTS (siteName / logo / email / cta) and the build-time
// analytics flag — are INJECTED via opts (mirrors how schedule-model injects `now`), so the model never
// touches import.meta or the store, and the test stays env-free.
//
// `done` for a branded field means CHANGED FROM the Greatstone default, not merely non-empty: DEFAULT_SETTINGS
// ships siteName/logo/footerEmail/headerCtaLabel pre-filled and the seed injects {...DEFAULT_SETTINGS}
// verbatim, so a plain "non-empty" test would falsely read 100% set-up while the tenant still wears
// Greatstone's branding.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const filled = (v) => String(v == null ? '' : v).trim().length > 0;
const isEmail = (v) => EMAIL_RE.test(String(v == null ? '' : v).trim());
const changed = (v, def) => filled(v) && (def == null || String(v).trim() !== String(def).trim());

export function deriveChecklist(state = {}, opts = {}) {
  const s = state.settings || {};
  const pages = state.pages || {};
  const order = Array.isArray(state.order) ? state.order : [];
  const nav = Array.isArray(state.navigation) ? state.navigation : [];

  // a page is "published" when it has a live projection — mirrors OverviewPanel / ReleaseBoard so the
  // three dashboards never disagree.
  const published = order.filter((sl) => pages[sl] && pages[sl].published != null);
  const withDesc = published.filter((sl) => filled((pages[sl].seo || {}).description));

  const items = [
    { key: 'siteName', section: 'settings', label: 'Name your site', hint: 'Used as the logo alt text and the accessible site name.', done: changed(s.siteName, opts.defaultSiteName) },
    { key: 'logo', section: 'settings', label: 'Upload your logo', hint: 'Shown in the header and footer.', done: changed(s.logo, opts.defaultLogo) },
    { key: 'cta', section: 'settings', label: 'Set the header call-to-action', hint: 'The persistent button shown on every page.', done: changed(s.headerCtaLabel, opts.defaultCta) },
    { key: 'footerEmail', section: 'settings', label: 'Add a contact email', hint: 'Shown in the footer as a mailto link.', done: isEmail(s.footerEmail) && changed(s.footerEmail, opts.defaultEmail) },
    { key: 'nav', section: 'navigation', label: 'Build your navigation menu', hint: 'Add at least one item to the header menu.', done: nav.length > 0 },
    { key: 'published', section: 'pages', label: 'Publish a page', hint: 'Go live with at least one page so visitors see content.', done: published.length > 0 },
    { key: 'seo', section: 'seohealth', label: 'Write SEO descriptions', hint: 'Give every published page a meta description.', done: published.length > 0 && withDesc.length === published.length },
  ];

  // analytics: not derivable from state (build-time VITE_GTM_ID). Only shown when the caller asserts it
  // knows the flag — keeps the model honest and the test env-free.
  if (opts.analyticsKnown) {
    // section:null — analytics is a build-time setting (VITE_GTM_ID), not a UI action, so it gets no "Set up" link.
    items.push({ key: 'analytics', section: null, label: 'Connect analytics', hint: 'Set VITE_GTM_ID at build to start measuring traffic.', done: !!opts.analyticsConfigured });
  }

  const doneCount = items.filter((i) => i.done).length;
  const total = items.length;
  return {
    items, doneCount, total, remaining: total - doneCount,
    allDone: total > 0 && doneCount === total,
    pct: total ? Math.round((doneCount / total) * 100) : 100,
  };
}
