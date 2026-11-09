import test from 'node:test';
import assert from 'node:assert/strict';
import { frameRouteDecision } from './frame-routing.mjs';

const base = { hostname: 'editor.example.test', editorHost: 'editor.example.test', method: 'GET', origin: null, fetchSite: null, publicOrigin: 'https://www.example.test' };
const decide = (overrides) => frameRouteDecision({ ...base, ...overrides }).status;

test('editor host serves public pages and frame routes, but not stateful endpoints', () => {
  assert.equal(decide({ pathname: '/editor/home' }), 200);
  assert.equal(decide({ pathname: '/preview/home' }), 200);
  assert.equal(decide({ pathname: '/live-design' }), 200);
  assert.equal(decide({ pathname: '/_next/static/chunk.js' }), 200);
  for (const pathname of ['/', '/about', '/contact', '/shop', '/_release']) assert.equal(decide({ pathname }), 200);
  for (const pathname of ['/studio', '/api/save']) assert.equal(decide({ pathname }), 404);
  assert.equal(decide({ pathname: '/', method: 'POST' }), 404);
});

test('public host refuses frame routes and framing public pages', () => {
  assert.equal(decide({ hostname: 'www.example.test', pathname: '/editor/home' }), 404);
  assert.equal(decide({ hostname: 'www.example.test', pathname: '/preview/home' }), 404);
  assert.equal(decide({ hostname: 'www.example.test', pathname: '/live-design' }), 404);
  assert.equal(decide({ hostname: 'www.example.test', pathname: '/' }), 200);
});

test('state-changing public requests need exact Origin or same-origin fetch metadata', () => {
  const pathname = '/api/save', hostname = 'www.example.test', method = 'POST';
  assert.equal(decide({ pathname, hostname, method, origin: 'https://www.example.test' }), 200);
  assert.equal(decide({ pathname, hostname, method, origin: 'https://editor.example.test' }), 403);
  assert.equal(decide({ pathname, hostname, method, fetchSite: 'same-site' }), 403);
  assert.equal(decide({ pathname, hostname, method, fetchSite: 'same-origin' }), 200);
  assert.equal(decide({ pathname: '/studio/save', hostname, method, fetchSite: null }), 403);
});

test('signed machine endpoints skip the cross-site check; cookie routes keep it', () => {
  const hostname = 'www.example.test', method = 'POST';
  assert.equal(decide({ pathname: '/api/admin/v1/portal-documents', hostname, method }), 200);
  assert.equal(decide({ pathname: '/api/admin/v1/portal-documents', hostname, method, origin: 'https://evil.example' }), 200);
  assert.equal(decide({ pathname: '/api/stripe-webhook', hostname, method }), 200);
  assert.equal(decide({ pathname: '/api/interview/voice/think', hostname, method }), 200);
  assert.equal(decide({ pathname: '/api/admin/v1/portal-documents', method }), 404);
  for (const pathname of ['/api/admin', '/api/admin/v1', '/api/admin/v2/x', '/api/stripe-webhook/x', '/api/stripe-webhooks', '/api/stripe-checkout', '/api/auth/login', '/studio/admin/v1/x',
    '/api/interview/voice/start', '/api/interview/voice/think/x', '/api/interview/voice/thinker', '/api/interview/chat']) {
    assert.equal(decide({ pathname, hostname, method }), 403, pathname);
    assert.equal(decide({ pathname, hostname, method, origin: 'https://evil.example' }), 403, pathname);
  }
});
