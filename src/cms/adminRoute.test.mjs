// Unit tests for the admin-route parser. Run: node --test src/cms/adminRoute.test.mjs
// Guards the regression where two divergent regexes let the URL, the rendered section and the active
// rail item disagree (a loose matcher rendered a mislabelled console for non-canonical hashes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminHash, PER_PAGE_SECTIONS } from './adminRoute.mjs';

test('canonical hashes parse to the right section + slug', () => {
  assert.deepEqual(parseAdminHash('#admin'), { section: 'overview', slug: null });
  assert.deepEqual(parseAdminHash('#admin/pages'), { section: 'pages', slug: null });
  assert.deepEqual(parseAdminHash('#admin/seo'), { section: 'seo', slug: null });
  assert.deepEqual(parseAdminHash('#admin/seo/method'), { section: 'seo', slug: 'method' });
  assert.deepEqual(parseAdminHash('#admin/editor/home'), { section: 'editor', slug: 'home' });
  assert.deepEqual(parseAdminHash('#admin/seo/case-study-1'), { section: 'seo', slug: 'case-study-1' });
});

test('leading-slash variant is tolerated', () => {
  assert.deepEqual(parseAdminHash('#/admin/team'), { section: 'team', slug: null });
});

test('section is normalised to lowercase (so the URL and rail never desync on case)', () => {
  assert.deepEqual(parseAdminHash('#admin/PAGES'), { section: 'pages', slug: null });
  assert.deepEqual(parseAdminHash('#admin/Seo/Method'), { section: 'seo', slug: 'method' });
});

test('non-admin and malformed hashes return null (fall through to the public site)', () => {
  assert.equal(parseAdminHash('#shop'), null);
  assert.equal(parseAdminHash('#account'), null);
  assert.equal(parseAdminHash(''), null);
  assert.equal(parseAdminHash('#admin/a/b/c'), null);      // too many segments
  assert.equal(parseAdminHash('#administrators'), null);   // not the admin route despite the prefix
  assert.equal(parseAdminHash('#admin/'), null);           // trailing slash, no section
});

test('PER_PAGE_SECTIONS marks exactly the page-scoped destinations', () => {
  ['seo', 'background', 'history', 'activity'].forEach((s) => assert.ok(PER_PAGE_SECTIONS.has(s)));
  ['overview', 'pages', 'releases', 'team', 'editor'].forEach((s) => assert.ok(!PER_PAGE_SECTIONS.has(s)));
});
