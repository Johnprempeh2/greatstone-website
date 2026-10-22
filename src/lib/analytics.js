// Analytics foundation (Phase 1 + 2 of docs/ANALYTICS-CRM-PLAN.md).
//
// DORMANT until a GTM container id is provided via the VITE_GTM_ID build env var: with no id, no tag
// loads and no cookies are set. Set VITE_GTM_ID (the GTM-XXXXXXX container) at build time to go live;
// GA4 is then configured inside GTM, no further code change needed.
//
// Privacy: nothing identifying is ever sent. Events carry locations / form names / opaque ids only.
// Consent: Google Consent Mode v2, advanced (John, GRE-656, 5 Oct 2026). The tag loads before the choice
// with every signal denied; "Accept analytics" grants analytics_storage ONLY. The three ad signals stay
// denied whatever the visitor chooses: the button says analytics, and we run no advertising.
//
// Attribution (GRE-659, legal doc "Code findings" 1): this visit's referrer, landing page and campaign
// tags are always kept IN MEMORY so an enquiry sent on this visit can say where it came from. They are
// written to localStorage (gs-attr-first / gs-attr-last) only after Accept, and removed on Decline.

const GTM_ID = (import.meta.env && import.meta.env.VITE_GTM_ID) || '';
const CONSENT_KEY = 'gs-consent';     // 'granted' | 'denied'
const FIRST_KEY = 'gs-attr-first';    // first-touch attribution, never overwritten
const LAST_KEY = 'gs-attr-last';      // last-touch, refreshed when a new campaign lands

const w = typeof window !== 'undefined' ? window : null;

export const analyticsConfigured = !!GTM_ID;

function dataLayer() { w.dataLayer = w.dataLayer || []; return w.dataLayer; }
// the standard gtag shim: pushes the raw arguments object so GTM's Consent API can read the commands
function gtag() { dataLayer().push(arguments); } // eslint-disable-line prefer-rest-params

// ---- first/last-touch attribution ----
// thisVisit: this page load's touch, held in memory whatever the consent. Persisted only with consent.
let thisVisit = null;

function readTouch() {
  if (!w) return null;
  try {
    const p = new URLSearchParams(w.location.search);
    const utm = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((k) => { const v = p.get(k); if (v) utm[k] = v.slice(0, 120); });
    return { ...utm, landing: w.location.pathname + w.location.hash, referrer: (w.document.referrer || '').slice(0, 200), at: new Date().toISOString() };
  } catch (e) { return null; }
}

const hasUtm = (t) => !!t && Object.keys(t).some((k) => k.startsWith('utm_'));

// write this visit's touch to storage. Only ever called with consent granted.
function persistAttribution() {
  if (!thisVisit) return;
  try {
    // last-touch refreshes when a campaign is present (or there's nothing stored yet)
    if (hasUtm(thisVisit) || !localStorage.getItem(LAST_KEY)) localStorage.setItem(LAST_KEY, JSON.stringify(thisVisit));
    // first-touch is written once and never overwritten: "what originally brought them"
    if (!localStorage.getItem(FIRST_KEY)) localStorage.setItem(FIRST_KEY, JSON.stringify(thisVisit));
  } catch (e) { /* storage blocked (private mode): the in-memory touch still goes with an enquiry */ }
}

// Every browser-storage key that is not strictly necessary, so it may only be written after Accept
// (legal doc "Code findings" 1 and 5). Decline (or a later withdrawal from Cookie settings) removes them.
export const OPTIONAL_LOCAL_KEYS = [FIRST_KEY, LAST_KEY, 'gs_service_pop_v1', 'gs-intel-profile'];
export const OPTIONAL_SESSION_KEYS = ['gs_service_pop_seen_v1'];

// true only after the visitor chose "Accept analytics"
export function optionalStorageAllowed() { return getConsent() === 'granted'; }

function clearOptionalStorage() {
  try { OPTIONAL_LOCAL_KEYS.forEach((k) => localStorage.removeItem(k)); } catch (e) { /* ignore */ }
  try { OPTIONAL_SESSION_KEYS.forEach((k) => sessionStorage.removeItem(k)); } catch (e) { /* ignore */ }
}

export function captureAttribution() {
  if (!w) return;
  thisVisit = readTouch();
  if (getConsent() === 'granted') persistAttribution();
}

// What an enquiry carries. With consent: the stored first and last touch. Without: no first touch (we
// did not keep one) and this visit's touch as the last, from memory.
export function getAttribution() {
  if (getConsent() === 'granted') {
    try {
      return {
        first: JSON.parse(localStorage.getItem(FIRST_KEY) || 'null'),
        last: JSON.parse(localStorage.getItem(LAST_KEY) || 'null') || thisVisit,
      };
    } catch (e) { /* fall through to memory */ }
  }
  return { first: null, last: thisVisit };
}

export function getConsent() { try { return localStorage.getItem(CONSENT_KEY); } catch (e) { return null; } }

// The Consent Mode update for a choice. Only analytics_storage moves; ad signals are never granted.
export function consentUpdate(granted) {
  return { analytics_storage: granted ? 'granted' : 'denied' };
}

// "Cookie settings" (footer) asks the banner to show again, whatever was chosen before.
export const CONSENT_OPEN_EVENT = 'gs-consent-open';
export function openConsentSettings() {
  if (!w) return;
  try { w.dispatchEvent(new Event(CONSENT_OPEN_EVENT)); } catch (e) { /* ignore */ }
}

let started = false;
export function initAnalytics() {
  if (!w || started) return;
  started = true;
  captureAttribution();          // always into memory; into storage only with consent
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
  if (granted) persistAttribution(); else clearOptionalStorage();
  if (!GTM_ID || !w) return;
  gtag('consent', 'update', consentUpdate(granted));
}

// push a named event to the dataLayer. Harmless no-op visually when dormant (just grows an in-memory
// array); GTM consumes it once configured. NEVER pass PII (names, emails) — locations/ids/labels only.
export function track(event, params = {}) {
  if (!w) return;
  // The Next site uses basic consent: its container does not load until Accept.
  // The Vite site keeps its existing advanced Consent Mode behaviour until cutover.
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_GTM_ID && getConsent() !== 'granted') return;
  try { dataLayer().push({ event, ...params }); } catch (e) { /* ignore */ }
}

export function pageview(path, title) {
  track('page_view', { page_path: path, page_title: (title || '').slice(0, 120) });
}

// stitch sessions to a signed-in user. The id is the opaque Supabase user id, never PII.
export function setUser(userId) {
  if (userId) track('login_identity', { user_id: String(userId) });
}
