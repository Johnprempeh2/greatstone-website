// GRE-659 (GRE-656 legal doc, "Code findings" 1, 2 and 5): nothing optional is stored before Accept, Accept
// grants analytics only, and Decline removes what Accept stored. Runs analytics.js against a fake browser.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()].sort(),
    clear: () => m.clear(),
  };
}
const local = fakeStorage();
const session = fakeStorage();
const events = new EventTarget();
globalThis.localStorage = local;
globalThis.sessionStorage = session;
globalThis.window = {
  location: { search: '?utm_source=linkedin&utm_campaign=launch', pathname: '/', hash: '#services' },
  document: { referrer: 'https://www.linkedin.com/' },
  addEventListener: events.addEventListener.bind(events),
  removeEventListener: events.removeEventListener.bind(events),
  dispatchEvent: events.dispatchEvent.bind(events),
};

const a = await import('./analytics.js');
a.initAnalytics(); // captures this visit's touch
const storedOnLoad = local.keys();
const pop = await import('../store/popularity.mjs');
const interest = await import('../intel/interest.js');

beforeEach(() => { local.clear(); session.clear(); });

test('before any choice: nothing optional is stored, and the enquiry still carries this visit', () => {
  assert.deepEqual(storedOnLoad, [], 'page load wrote nothing');
  const at = a.getAttribution();
  assert.equal(at.first, null, 'no first touch without consent');
  assert.equal(at.last.utm_source, 'linkedin');
  assert.equal(at.last.utm_campaign, 'launch');
  assert.equal(at.last.landing, '/#services');
  assert.equal(at.last.referrer, 'https://www.linkedin.com/');
});

test('Accept stores the first and last touch', () => {
  a.setConsent(true);
  assert.deepEqual(local.keys(), ['gs-attr-first', 'gs-attr-last', 'gs-consent']);
  assert.equal(local.getItem('gs-consent'), 'granted');
  const at = a.getAttribution();
  assert.equal(at.first.utm_source, 'linkedin');
  assert.equal(at.last.utm_source, 'linkedin');
});

test('Accept never overwrites an existing first touch', () => {
  local.setItem('gs-consent', 'granted');
  local.setItem('gs-attr-first', JSON.stringify({ utm_source: 'newsletter' }));
  a.setConsent(true);
  assert.equal(a.getAttribution().first.utm_source, 'newsletter');
});

test('Decline stores only the choice and removes every optional key', () => {
  for (const k of a.OPTIONAL_LOCAL_KEYS) local.setItem(k, '{}');
  for (const k of a.OPTIONAL_SESSION_KEYS) session.setItem(k, '[]');
  a.setConsent(false);
  assert.deepEqual(local.keys(), ['gs-consent']);
  assert.equal(local.getItem('gs-consent'), 'denied');
  assert.deepEqual(session.keys(), []);
  assert.equal(a.getAttribution().first, null);
  assert.equal(a.getAttribution().last.utm_source, 'linkedin', 'this visit still goes with an enquiry');
});

test('the optional key list covers the popularity cache, its dedupe and the interest profile', () => {
  assert.deepEqual([...a.OPTIONAL_LOCAL_KEYS].sort(), ['gs-attr-first', 'gs-attr-last', 'gs-intel-profile', 'gs_service_pop_v1']);
  assert.deepEqual(a.OPTIONAL_SESSION_KEYS, ['gs_service_pop_seen_v1']);
  assert.equal(a.optionalStorageAllowed(), false);
  local.setItem('gs-consent', 'granted');
  assert.equal(a.optionalStorageAllowed(), true);
});

test('Accept grants analytics_storage only; the three ad signals are never granted', () => {
  assert.deepEqual(a.consentUpdate(true), { analytics_storage: 'granted' });
  assert.deepEqual(a.consentUpdate(false), { analytics_storage: 'denied' });
  for (const g of [true, false]) {
    const u = a.consentUpdate(g);
    for (const k of ['ad_storage', 'ad_user_data', 'ad_personalization']) assert.notEqual(u[k], 'granted', k);
  }
});

test('Cookie settings sends the event the banner listens for', () => {
  let opened = 0;
  const on = () => { opened += 1; };
  window.addEventListener(a.CONSENT_OPEN_EVENT, on);
  a.openConsentSettings();
  window.removeEventListener(a.CONSENT_OPEN_EVENT, on);
  assert.equal(opened, 1);
});

test('popularity and interest blocks write nothing before Accept, and work from memory', () => {
  pop.bumpService('workflow-audit', 'view');
  pop.bumpService('workflow-audit', 'view'); // deduped in memory on this page load
  assert.equal(pop.popularityOf('workflow-audit'), 1);
  interest.recordTopicFocus('ai-security');
  assert.ok(interest.getProfile().topics['ai-security'] > 0, 'profile kept in memory');
  assert.deepEqual(local.keys(), []);
  assert.deepEqual(session.keys(), []);
});

test('after Accept the same blocks may store their keys', () => {
  local.setItem('gs-consent', 'granted');
  pop.bumpService('data-review', 'view');
  interest.recordTopicFocus('ai-security');
  assert.deepEqual(local.keys(), ['gs-consent', 'gs-intel-profile', 'gs_service_pop_v1']);
  assert.deepEqual(session.keys(), ['gs_service_pop_seen_v1']);
});
