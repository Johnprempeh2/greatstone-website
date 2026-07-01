import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalisePath, classifyLegacyPath, isCoveredByPattern, patternRules,
  redirectRulesFor, formatRules, renderBlock, VENDOR_PATH_MAP, BLOCK_BEGIN, BLOCK_END,
} from './legacy-redirects.mjs';

test('normalisePath: leading slash, no trailing slash, lowercase, strip query/hash', () => {
  assert.equal(normalisePath('aspose'), '/aspose');
  assert.equal(normalisePath('/aspose/'), '/aspose');
  assert.equal(normalisePath('/DevExpress/DevExpress-WinForms'), '/devexpress/devexpress-winforms');
  assert.equal(normalisePath('/search?q=pdf#top'), '/search');
  assert.equal(normalisePath(''), '/');
  assert.equal(normalisePath('/'), '/');
});

test('vendor pages → that vendor’s storefront; ironsoftware remaps to iron-software', () => {
  assert.deepEqual(classifyLegacyPath('/aspose'), { dest: '/#shop/aspose', kind: 'vendor' });
  assert.deepEqual(classifyLegacyPath('/ironsoftware'), { dest: '/#shop/iron-software', kind: 'vendor' });
  assert.deepEqual(classifyLegacyPath('/pdflib'), { dest: '/#shop/pdflib', kind: 'vendor' });
});

test('product pages fall back to the vendor catalogue', () => {
  assert.deepEqual(classifyLegacyPath('/aspose/aspose-pdf-for--net'), { dest: '/#shop/aspose', kind: 'product' });
  assert.deepEqual(classifyLegacyPath('/ironsoftware/ironpdf'), { dest: '/#shop/iron-software', kind: 'product' });
  // an unknown segment under a known vendor still lands on the vendor catalogue (support pages etc.)
  assert.equal(classifyLegacyPath('/aspose/aspose-enterprise-support').dest, '/#shop/aspose');
});

test('storefront + account/session URLs map to load-honoured routes', () => {
  assert.equal(classifyLegacyPath('/all-products').dest, '/#shop');
  assert.equal(classifyLegacyPath('/basket').dest, '/#shop');
  assert.equal(classifyLegacyPath('/checkout-login').dest, '/#account');
  assert.equal(classifyLegacyPath('/login').dest, '/#account');
  assert.equal(classifyLegacyPath('/order-confirmation').dest, '/#account');
});

test('blog/news and info/legal pages → home (not yet hash-addressable)', () => {
  assert.deepEqual(classifyLegacyPath('/blog'), { dest: '/', kind: 'blog' });
  assert.deepEqual(classifyLegacyPath('/blog/introducing-apryse'), { dest: '/', kind: 'blog' });
  assert.deepEqual(classifyLegacyPath('/news/seamless-api-integration-for-developers'), { dest: '/', kind: 'blog' });
  assert.deepEqual(classifyLegacyPath('/about'), { dest: '/', kind: 'content' });
  assert.deepEqual(classifyLegacyPath('/privacy-policy'), { dest: '/', kind: 'content' });
  assert.equal(classifyLegacyPath('/').kind, 'home');
});

test('isCoveredByPattern: vendors, structural exacts and blog/news are pattern-covered; info pages are not', () => {
  assert.equal(isCoveredByPattern('/aspose'), true);
  assert.equal(isCoveredByPattern('/aspose/aspose-pdf-for--net'), true);
  assert.equal(isCoveredByPattern('/basket'), true);
  assert.equal(isCoveredByPattern('/blog/anything'), true);
  assert.equal(isCoveredByPattern('/about'), false);
  assert.equal(isCoveredByPattern('/faqs'), false);
});

test('patternRules: two rules per vendor (exact + wildcard), all forced 301', () => {
  const rules = patternRules();
  const vendorCount = Object.keys(VENDOR_PATH_MAP).length;
  const vendorRules = rules.filter((r) => r.to.startsWith('/#shop/'));
  assert.equal(vendorRules.length, vendorCount * 2);
  assert.ok(rules.every((r) => r.code === 301 && r.force === true));
  assert.ok(rules.some((r) => r.from === '/ironsoftware/*' && r.to === '/#shop/iron-software'));
});

test('redirectRulesFor: adds an explicit 301→home per uncovered content path, de-duped, skips root', () => {
  const rules = redirectRulesFor(['/', '/about', '/about', '/aspose', '/faqs', '/blog/x']);
  const froms = rules.map((r) => r.from);
  assert.ok(froms.includes('/about'));
  assert.ok(froms.includes('/faqs'));
  assert.equal(froms.filter((f) => f === '/about').length, 1, 'de-duped');
  assert.ok(!froms.includes('/'), 'root is never a rule');
  // /aspose and /blog/x are already pattern-covered → no extra per-path rule for them
  assert.equal(froms.filter((f) => f === '/aspose').length, 1); // only the pattern rule, not a duplicate
});

test('formatRules: aligned columns with the forced 301! suffix', () => {
  const [line] = formatRules([{ from: '/aspose', to: '/#shop/aspose', code: 301, force: true }]);
  assert.match(line, /^\/aspose\s+\/#shop\/aspose\s+301!$/);
});

test('renderBlock: wrapped in markers and contains grouped rules', () => {
  const block = renderBlock(['/aspose', '/aspose/aspose-pdf-for--net', '/basket', '/blog/x', '/about']);
  assert.ok(block.startsWith(BLOCK_BEGIN));
  assert.ok(block.trimEnd().endsWith(BLOCK_END));
  assert.match(block, /\/aspose\s+\/#shop\/aspose\s+301!/);
  assert.match(block, /\/aspose\/\*\s+\/#shop\/aspose\s+301!/);
  assert.match(block, /\/about\s+\/\s+301!/);
});
