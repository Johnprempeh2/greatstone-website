import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { indexingAllowed, releaseIndexHtml } from './index-html.mjs';
import { indexabilityReport } from './seo-report.mjs';

const INDEX = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const meta = (html, attr, key) => {
  const m = html.match(new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`));
  return m ? m[1] : null;
};

test('only an explicit true or 1 allows indexing', () => {
  for (const v of ['true', 'TRUE', ' 1 ', '1']) assert.equal(indexingAllowed(v), true, v);
  for (const v of [undefined, null, '', 'false', '0', 'yes', 'noindex']) assert.equal(indexingAllowed(v), false, String(v));
});

test('the default build keeps noindex', () => {
  const out = releaseIndexHtml(INDEX);
  assert.equal(out, INDEX);
  assert.equal(indexabilityReport({ pages: [{ file: 'index.html', html: out }] }).status, 'NOINDEX');
});

test('the release build drops noindex and nothing else', () => {
  const out = releaseIndexHtml(INDEX, { indexable: true });
  assert.doesNotMatch(out, /noindex/i);
  assert.equal(indexabilityReport({ pages: [{ file: 'index.html', html: out }] }).status, 'INDEXABLE');
  assert.equal(INDEX.split('\n').length - out.split('\n').length, 1, 'removes exactly one line');
  assert.match(out, /<meta property="og:title"/);
});

test('index.html carries a static link preview with an absolute image and the canonical domain', () => {
  // social crawlers (LinkedIn and most others) do not run JavaScript, so these must be in the static file
  assert.ok(meta(INDEX, 'property', 'og:title'), 'og:title');
  assert.ok(meta(INDEX, 'property', 'og:description'), 'og:description');
  assert.ok(meta(INDEX, 'name', 'description'), 'description');
  assert.match(meta(INDEX, 'property', 'og:image'), /^https:\/\/greatstoneint\.com\/og-default\.png$/);
  assert.match(meta(INDEX, 'name', 'twitter:image'), /^https:\/\//);
  assert.equal(meta(INDEX, 'property', 'og:url'), 'https://greatstoneint.com/');
  assert.match(INDEX, /<link rel="canonical" href="https:\/\/greatstoneint\.com\/" \/>/);
  // R1 must not carry the Release 2 front-door line (plan §3.10)
  assert.doesNotMatch(INDEX, /first three employees/i);
});
