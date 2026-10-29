import test from 'node:test';
import assert from 'node:assert/strict';
import { editorHostPolicy } from './editor-host-policy.mjs';
import { frameCsp, validHello, validMessage } from './frame-protocol.mjs';
import { frameRouteDecision } from './frame-routing.mjs';
import { EDITOR_PREVIEW_HOST, EDITOR_PREVIEW_ORIGIN, EDITOR_PREVIEW_SITE_ID } from './editor-preview-target.mjs';

const live = 'https://gsam.tail83d26c.ts.net:3100';
const production = { NODE_ENV: 'production', GSAM_EDITOR_HOST: 'gsam-editor--greatstone-home.netlify.app',
  GSAM_EDITOR_ORIGINS: `${live},http://localhost:3200,*,https://other.test/path` };
const preview = { host: EDITOR_PREVIEW_HOST, origin: EDITOR_PREVIEW_ORIGIN, siteId: EDITOR_PREVIEW_SITE_ID };

test('production filter rejects localhost, wildcard, and path origins', () => {
  assert.deepEqual(editorHostPolicy(production, null), { host: production.GSAM_EDITOR_HOST, origins: [live] });
});

test('isolated preview accepts only localhost:3200 on editor and preview frames', () => {
  const policy = editorHostPolicy(production, preview);
  assert.deepEqual(policy, { host: EDITOR_PREVIEW_HOST, origins: [EDITOR_PREVIEW_ORIGIN], siteId: EDITOR_PREVIEW_SITE_ID });
  for (const pathname of ['/editor/home', '/preview/home']) {
    const decision = frameRouteDecision({ pathname, hostname: policy.host, editorHost: policy.host, method: 'GET' });
    assert.deepEqual(decision, { status: 200, frame: true });
    assert.equal(frameRouteDecision({ pathname, hostname: production.GSAM_EDITOR_HOST, editorHost: policy.host, method: 'GET' }).status, 404);
  }
  const csp = frameCsp(policy.origins, 'nonce123', false);
  assert.match(csp, /frame-ancestors http:\/\/localhost:3200$/);
  assert.doesNotMatch(csp, /unsafe-eval|\*|:3100/);
});

test('preview handshake retains exact parent, site, nonce, origin, session and source checks', () => {
  const policy = editorHostPolicy(production, preview);
  const parent = {};
  globalThis.window = { parent };
  const nonce = 'ABCDEFGHIJKLMNOPQRSTUV';
  const hello = { gs: 'website-frame', type: 'hello', payload: { nonce, protocols: [1], siteId: policy.siteId } };
  const event = { origin: EDITOR_PREVIEW_ORIGIN, source: parent, data: hello };
  assert.deepEqual(validHello(event, policy.origins, policy.siteId, null), { payload: hello.payload });
  for (const variant of [{ origin: 'http://localhost:3201' }, { origin: 'https://foreign.test' }, { source: {} },
    { data: { ...hello, payload: { ...hello.payload, siteId: 'other' } } }]) {
    assert.notDeepEqual(validHello({ ...event, ...variant }, policy.origins, policy.siteId, null), { payload: hello.payload });
  }
  const bound = { origin: EDITOR_PREVIEW_ORIGIN, nonce };
  const message = { gs: 'website-frame', protocol: 1, session: nonce, type: 'save', payload: {} };
  assert.equal(validMessage({ ...event, data: message }, bound, ['save']), true);
  assert.equal(validMessage({ ...event, origin: 'http://localhost:3201', data: message }, bound, ['save']), false);
  assert.equal(validMessage({ ...event, data: { ...message, session: 'wrong' } }, bound, ['save']), false);
});

test('preview host keeps public and stateful route guard', () => {
  const policy = editorHostPolicy(production, preview);
  const decision = (pathname, method = 'GET') => frameRouteDecision({ pathname, hostname: policy.host, editorHost: policy.host, method });
  assert.deepEqual(decision('/about'), { status: 200, frame: false });
  for (const pathname of ['/api/save', '/studio']) assert.equal(decision(pathname).status, 404);
  assert.equal(decision('/', 'POST').status, 404);
  assert.equal(frameRouteDecision({ pathname: '/editor/home', hostname: 'greatstoneint.com', editorHost: policy.host, method: 'GET' }).status, 404);
});
