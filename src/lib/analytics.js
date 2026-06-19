// Analytics foundation (Phase 1 + 2 of docs/ANALYTICS-CRM-PLAN.md).
//
// DORMANT until a GTM container id is provided via the VITE_GTM_ID build env var: with no id, no tag
// loads and no cookies are set, but first-touch attribution is still captured locally so it's ready to
// attach to a CRM conversion later. Set VITE_GTM_ID (the GTM-XXXXXXX container) at build time to go live;
// GA4 + any ad pixels are then configured inside GTM, no further code change needed.
//
// Privacy: nothing identifying is ever sent. Events carry locations / form names / opaque ids only.
// Consent: Google Consent Mode v2 — analytics_storage starts denied until the visitor accepts (EU-safe).

const GTM_ID = (import.meta.env && import.meta.env.VITE_GTM_ID) || '';
const CONSENT_KEY = 'gs-consent';     // 'granted' | 'denied'
const FIRST_KEY = 'gs-attr-first';    // first-touch attribution, never overwritten
const LAST_KEY = 'gs-attr-last';      // last-touch, refreshed when a new campaign lands

const w = typeof window !== 'undefined' ? window : null;

export const analyticsConfigured = !!GTM_ID;

function dataLayer() { w.dataLayer = w.dataLayer || []; return w.dataLayer; }
// the standard gtag shim: pushes the raw arguments object so GTM's Consent API can read the commands
function gtag() { dataLayer().push(arguments); } // eslint-disable-line prefer-rest-params

// ---- first/last-touch attribution: captured regardless of GTM so it's ready for the CRM (Layer 2) ----
function captureAttribution() {
  if (!w) return;
  try {
    const p = new URLSearchParams(w.location.search);
    const utm = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((k) => { const v = p.get(k); if (v) utm[k] = v.slice(0, 120); });
    const hasUtm = Object.keys(utm).length > 0;
    const touch = { ...utm, landing: w.location.pathname + w.location.hash, referrer: (w.document.referrer || '').slice(0, 200), at: new Date().toISOString() };
    // last-touch refreshes when a campaign is present (or there's nothing stored yet)
    if (hasUtm || !localStorage.getItem(LAST_KEY)) localStorage.setItem(LAST_KEY, JSON.stringify(touch));
    // first-touch is written once and never overwritten — "what originally brought them"
    if (!localStorage.getItem(FIRST_KEY)) localStorage.setItem(FIRST_KEY, JSON.stringify(touch));
  } catch (e) { /* storage blocked (private mode / no consent for storage) — skip */ }
}

export function getAttribution() {
  try {
    return {
      first: JSON.parse(localStorage.getItem(FIRST_KEY) || 'null'),
      last: JSON.parse(localStorage.getItem(LAST_KEY) || 'null'),
    };
  } catch (e) { return { first: null, last: null }; }
}

export function getConsent() { try { return localStorage.getItem(CONSENT_KEY); } catch (e) { return null; } }

let started = false;
export function initAnalytics() {
  if (!w || started) return;
  started = true;
  captureAttribution();          // always, even when dormant
  if (!GTM_ID) return;           // no container configured yet → stay dormant
  // Consent Mode v2 defaults: deny until the visitor accepts (a returning visitor who accepted starts granted)
  const consent = getConsent();
  gtag('consent', 'default', {
    ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    analytics_storage: consent === 'granted' ? 'granted' : 'denied',
    wait_for_update: 500,
  });
  dataLayer().push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  const s = w.document.createElement('script');
  s.async = true; s.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(GTM_ID);
  w.document.head.appendChild(s);
}

export function setConsent(granted) {
  try { localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied'); } catch (e) { /* ignore */ }
  if (!GTM_ID || !w) return;
  gtag('consent', 'update', {
    analytics_storage: granted ? 'granted' : 'denied',
    ad_storage: granted ? 'granted' : 'denied',
    ad_user_data: granted ? 'granted' : 'denied',
    ad_personalization: granted ? 'granted' : 'denied',
  });
}

// push a named event to the dataLayer. Harmless no-op visually when dormant (just grows an in-memory
// array); GTM consumes it once configured. NEVER pass PII (names, emails) — locations/ids/labels only.
export function track(event, params = {}) {
  if (!w) return;
  try { dataLayer().push({ event, ...params }); } catch (e) { /* ignore */ }
}

export function pageview(path, title) {
  track('page_view', { page_path: path, page_title: (title || '').slice(0, 120) });
}

// stitch sessions to a signed-in user. The id is the opaque Supabase user id, never PII.
export function setUser(userId) {
  if (userId) track('login_identity', { user_id: String(userId) });
}
