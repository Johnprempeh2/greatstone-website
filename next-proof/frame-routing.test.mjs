import test from 'node:test';
import assert from 'node:assert/strict';
import { frameRouteDecision } from './frame-routing.mjs';

const base = { hostname: 'editor.example.test', editorHost: 'editor.example.test', method: 'GET', origin: null, fetchSite: null, publicOrigin: 'https://www.example.test' };
const decide = (overrides) => frameRouteDecision({ ...base, ...overrides }).status;

test('editor host serves public pages and frame routes, but not stateful endpoints', () => {
  assert.equal(decide({ pathname: '/editor/home' }), 200);
  assert.equal(decide({ pathname: '/preview/home' }), 200);
  assert.equal(decide({ pathname: '/_next/static/chunk.js' }), 200);
  for (const pathname of ['/', '/about', '/contact', '/shop', '/_release']) assert.equal(decide({ pathname }), 200);
  for (const pathname of ['/studio', '/api/save']) assert.equal(decide({ pathname }), 404);
  assert.equal(decide({ pathname: '/', method: 'POST' }), 404);
});

test('public host refuses frame routes and framing public pages', () => {
  assert.equal(decide({ hostname: 'www.example.test', pathname: '/editor/home' }), 404);
  assert.equal(decide({ hostname: 'www.example.test', pathname: '/preview/home' }), 404);
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
