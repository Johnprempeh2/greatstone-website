import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConsentAnalytics } from './consent-analytics.mjs';

function browser() {
  const values = new Map();
  const session = new Map();
  const scripts = [];
  const storage = (map) => ({ getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: (key) => map.delete(key) });
  const window = { localStorage: storage(values), sessionStorage: storage(session), document: { createElement: () => ({}), head: { appendChild: (script) => scripts.push(script) } } };
  return { window, values, session, scripts };
}

test('GTM and page events wait for analytics consent; ad consent remains denied', () => {
  const b = browser();
  const analytics = createConsentAnalytics({ window: b.window, id: 'GTM-TEST' });
  analytics.load();
  analytics.track('page_view', { page_path: '/' });
  assert.equal(b.scripts.length, 0);
  assert.equal(b.window.dataLayer, undefined);
  analytics.choose(true);
  assert.equal(b.scripts.length, 1);
  assert.equal(b.scripts[0].src, 'https://www.googletagmanager.com/gtm.js?id=GTM-TEST');
  assert.deepEqual(b.window.dataLayer[0], ['consent', 'default', {
    ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted',
  }]);
  analytics.track('page_view', { page_path: '/' });
  assert.deepEqual(b.window.dataLayer.at(-1), { event: 'page_view', page_path: '/' });
  analytics.load();
  assert.equal(b.scripts.length, 1);
});

test('returning consent loads once; withdrawal clears optional storage and suppresses events', () => {
  const b = browser();
  b.values.set('gs-consent', 'granted');
  b.values.set('gs-attr-first', '{}');
  b.session.set('gs_service_pop_seen_v1', '1');
  const analytics = createConsentAnalytics({ window: b.window, id: 'GTM-TEST' });
  analytics.load();
  analytics.choose(false);
  assert.equal(b.values.has('gs-attr-first'), false);
  assert.equal(b.session.size, 0);
  assert.deepEqual(b.window.dataLayer.at(-1), ['consent', 'update', { analytics_storage: 'denied' }]);
  const count = b.window.dataLayer.length;
  analytics.track('page_view');
  assert.equal(b.window.dataLayer.length, count);
  assert.equal(analytics.consent(), 'denied');
});

test('without a container id, consent never loads a script', () => {
  const b = browser();
  const analytics = createConsentAnalytics({ window: b.window, id: '' });
  analytics.choose(true);
  assert.equal(b.scripts.length, 0);
});
