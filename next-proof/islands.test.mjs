import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { sanitiseHtml } from './html-sanitiser.mjs';
import { sanitiseCss } from './css-sanitiser.mjs';
import { ISLANDS, islandManifest, islandPlaceholderCss } from './islands.mjs';
import { browseOfferings, catalogueFromRelease } from './catalogue-data.mjs';

const island = (html) => sanitiseHtml(html);

test('GRE-3777: each new island renders from its tag with only allow-listed attributes', () => {
  const cases = [
    ['<gs-island name="quote" data-service="business-website-build" data-service-name="Business Website Build"></gs-island>',
      { service: 'business-website-build', serviceName: 'Business Website Build' }],
    ['<gs-island name="account-entry" data-style="link"></gs-island>', { look: 'link' }],
    ['<gs-island name="product-list" data-vendor="aspose" data-category="pdf" data-limit="12" data-sort="price-desc"></gs-island>',
      { vendor: 'aspose', category: 'pdf', limit: '12', sort: 'price-desc' }],
    ['<gs-island name="stone-3d" data-size="accent"></gs-island>', { size: 'accent' }],
    ['<gs-island name="animation" data-effect="meridian" data-intensity="full" data-speed="normal" data-colour="teal"></gs-island>',
      { effect: 'meridian', intensity: 'full', speed: 'normal', colour: 'teal' }],
  ];
  for (const [html, props] of cases) {
    const { nodes, removed } = island(html);
    assert.deepEqual(nodes[0].props, props, html);
    assert.deepEqual(removed, [], html);
  }
});

test('GRE-3777: island attributes outside their allow-list or pattern are dropped', () => {
  const { nodes, removed } = island('<gs-island name="quote" data-service="Bad Slug" data-service-name="<b>x</b>" data-endpoint="/api/x"></gs-island>' +
    '<gs-island name="product-list" data-limit="25" data-sort="random" data-vendor="../x"></gs-island>' +
    '<gs-island name="animation" data-effect="waves.evil" data-intensity="off" data-colour="red"></gs-island>' +
    '<gs-island name="stone-3d" data-size="huge" style="position:fixed"></gs-island>' +
    '<gs-island name="account-entry" data-href="https://evil.test"></gs-island>');
  assert.deepEqual(nodes.map((node) => node.props), [{}, {}, {}, {}, {}]);
  assert.deepEqual(removed, [
    'gs-island[quote] @data-service', 'gs-island[quote] @data-service-name', 'gs-island[quote] @data-endpoint',
    'gs-island[product-list] @data-limit', 'gs-island[product-list] @data-sort', 'gs-island[product-list] @data-vendor',
    'gs-island[animation] @data-effect', 'gs-island[animation] @data-intensity', 'gs-island[animation] @data-colour',
    'gs-island[stone-3d] @data-size', 'gs-island[stone-3d] @style', 'gs-island[account-entry] @data-href']);
});

test('GRE-3777: every animation effect value names a background effect with a renderer', async () => {
  const { BACKGROUND_EFFECTS } = await import('./motion-contract.mjs');
  for (const value of ISLANDS.animation.attributes['data-effect'].values) assert.ok(BACKGROUND_EFFECTS.includes(`bg.${value}`), value);
});

test('GRE-3777: the enquiry form island still uses the BookDeepDive block and its form binding', () => {
  assert.equal(ISLANDS['enquiry-form'].block, 'BookDeepDive');
  const source = readFileSync(new URL('../src/blocks/BookDeepDive.jsx', import.meta.url), 'utf8');
  assert.match(source, /from '..\/lib\/enquiry.mjs'/);
});

test('GRE-3777: the quote island sends through the basket and its existing service-inquiry path', () => {
  const islands = readFileSync(new URL('../app/islands.jsx', import.meta.url), 'utf8');
  assert.match(islands, /import StoreCart from '..\/src\/store\/StoreCart.jsx'/);
  assert.doesNotMatch(islands, /fetch\(/, 'islands post only through existing components');
  const cart = readFileSync(new URL('../src/store/cart.mjs', import.meta.url), 'utf8');
  assert.match(cart, /fetch\('\/api\/service-inquiry'/);
});

test('GRE-3777: every island has a label, a placeholder and a reserved height', () => {
  for (const [name, item] of Object.entries(ISLANDS)) {
    assert.ok(item.label && item.placeholder && item.height > 0, name);
    assert.ok(item.block || item.component, name);
  }
});

test('GRE-3777: placeholder CSS labels each island tag and passes the site CSS sanitiser', () => {
  const css = islandPlaceholderCss();
  for (const [name, item] of Object.entries(ISLANDS)) {
    assert.ok(css.includes(`gs-island[name="${name}"]::before{content:"Island: ${item.label}"}`), name);
    assert.ok(css.includes(`gs-island[name="${name}"]{min-height:${item.height}px`), name);
  }
  assert.doesNotMatch(css, /url\(|@import|<|\\/);
  assert.deepEqual(sanitiseCss(css, { scope: 'page' }).removed, []);
});

test('GRE-3777: the /_islands manifest lists names, attributes and placeholder CSS, and is plain JSON', () => {
  const manifest = JSON.parse(JSON.stringify(islandManifest()));
  assert.equal(manifest.islandContract, 1);
  assert.deepEqual(manifest.islands.map((item) => item.name), Object.keys(ISLANDS));
  const animation = manifest.islands.find((item) => item.name === 'animation');
  assert.deepEqual(animation.attributes['data-intensity'], { values: ['subtle', 'full'] });
  assert.equal(manifest.islands.find((item) => item.name === 'enquiry-form').attributes['data-form'].pattern, '^[a-z0-9][a-z0-9-]{0,63}$');
  assert.equal(manifest.placeholderCss, islandPlaceholderCss());
});

test('GRE-3777: the product list reads the offerings collection with the island filters', () => {
  const catalogue = JSON.parse(readFileSync(new URL('./fixtures/public-catalogue-2026-10-22.json', import.meta.url), 'utf8'));
  const entries = (rows) => rows.map((row) => ({ id: row.id, fields: { data: row } }));
  const release = { gsamSnapshot: true, media: {}, collections: {
    vendors: { entries: entries(catalogue.vendors) }, categories: { entries: entries(catalogue.categories) }, offerings: { entries: entries(catalogue.offerings) } } };
  const all = browseOfferings(catalogueFromRelease(release), { sort: 'az' });
  assert.equal(all.length, catalogue.offerings.length);
  const vendor = catalogue.offerings[0].vendor.slug;
  const byVendor = browseOfferings(catalogueFromRelease(release), { vendor });
  assert.ok(byVendor.length > 0 && byVendor.every((item) => item.vendor.slug === vendor));
});

test('GRE-1861: the intelligence dashboard island takes only a known starting tab', () => {
  const { nodes, removed } = island('<gs-island name="intel-dashboard" data-tab="compare"></gs-island>');
  assert.deepEqual(nodes[0].props, { tab: 'compare' });
  assert.deepEqual(removed, []);
  const bad = island('<gs-island name="intel-dashboard" data-tab="admin" data-feed="https://x.example"></gs-island>');
  assert.deepEqual(bad.nodes[0].props, {});
  assert.deepEqual(bad.removed, ['gs-island[intel-dashboard] @data-tab', 'gs-island[intel-dashboard] @data-feed']);
});
