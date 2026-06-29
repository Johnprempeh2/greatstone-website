// Studio Setup Guide model — a pure, read-only readiness ledger. For each setup task it derives `done`
// from real state, so the panel is a live checklist on day one AND an audit of a stale tenant.
// STORE-FREE: imports nothing (store.js pulls in puck.config.jsx = JSX, which bare node --test can't load).
// The facts state can't carry — the Greatstone DEFAULTS (siteName / logo / email / cta) and the build-time
// analytics flag — are INJECTED via opts (mirrors how schedule-model injects `now`), so the model never
// touches import.meta or the store, and the test stays env-free.
//
// `done` for a branded field means the field carries a REAL value (filled; a valid address for email).
// This is Greatstone's own owner-operated studio, so the shipped Greatstone defaults ARE the intended
// values — a filled "Greatstone International" / "Book a Diagnostic" is genuinely set up and ticks off. We
// deliberately do NOT require changing away from the default (that read as permanently-incomplete for the
// actual owner, who has nothing to change). Only a CLEARED field reads as a still-to-do step.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const filled = (v) => String(v == null ? '' : v).trim().length > 0;
const isEmail = (v) => EMAIL_RE.test(String(v == null ? '' : v).trim());

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
    { key: 'siteName', section: 'settings', label: 'Name your site', hint: 'Used as the logo alt text and the accessible site name.', done: filled(s.siteName) },
    { key: 'logo', section: 'settings', label: 'Upload your logo', hint: 'Shown in the header and footer.', done: filled(s.logo) },
    { key: 'cta', section: 'settings', label: 'Set the header call-to-action', hint: 'The persistent button shown on every page.', done: filled(s.headerCtaLabel) },
    { key: 'footerEmail', section: 'settings', label: 'Add a contact email', hint: 'Shown in the footer as a mailto link.', done: isEmail(s.footerEmail) },
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
