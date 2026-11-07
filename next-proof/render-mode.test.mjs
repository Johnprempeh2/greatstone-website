import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(`../app/${path}`, import.meta.url), 'utf8');

// Next cutover gap 6: public pages are cached, so the root layout must not force per-request rendering or read
// request headers; the editor frame routes keep per-request rendering for the CSP nonce.
test('the root layout lets public pages be cached', () => {
  const layout = source('layout.jsx');
  assert.doesNotMatch(layout, /force-dynamic/);
  assert.doesNotMatch(layout, /next\/headers/);
  assert.match(layout, /export const revalidate = 300;/);
});

test('every editor frame route renders per request', () => {
  for (const path of ['editor/layout.jsx', 'preview/layout.jsx', 'live-design/layout.jsx'])
    assert.match(source(path), /export const dynamic = 'force-dynamic';/, path);
});

test('pages with a path parameter are rendered on demand and kept, not per request', () => {
  // shop/[vendor] reads the query (filters), so it stays per request.
  for (const path of ['[...slug]/page.jsx', 'product/[slug]/page.jsx', 'service/[slug]/page.jsx'])
    assert.match(source(path), /export async function generateStaticParams\(\)/, path);
});
