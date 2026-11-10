import test from 'node:test';
import assert from 'node:assert/strict';
import { PUBLIC_CDN_CACHE, publicHeaders } from './public-headers.mjs';

const get = (pathname, search = '') => publicHeaders({ method: 'GET', pathname, search });

test('public pages may be cached by the CDN with revalidation, and carry the Vite security headers (cutover gaps 4, 6)', () => {
  for (const path of ['/', '/about', '/shop/aspose', '/product/x']) {
    const h = get(path);
    assert.equal(h['Netlify-CDN-Cache-Control'], PUBLIC_CDN_CACHE, path);
    assert.equal(h['Referrer-Policy'], 'strict-origin-when-cross-origin');
    assert.equal(h['Permissions-Policy'], 'camera=(), microphone=(self), geolocation=()');
    assert.equal(h['Strict-Transport-Security'], 'max-age=63072000; includeSubDomains');
  }
});

test('signed-in, client, API, query and non-GET requests are never CDN cached', () => {
  for (const path of ['/account', '/org', '/portal/x', '/join/t', '/invoice/1', '/api/catalogue', '/privacy/interviews'])
    assert.equal(get(path)['Netlify-CDN-Cache-Control'], undefined, path);
  assert.equal(get('/shop', '?q=pdf')['Netlify-CDN-Cache-Control'], undefined);
  assert.equal(publicHeaders({ method: 'POST', pathname: '/', search: '' })['Netlify-CDN-Cache-Control'], undefined);
});
