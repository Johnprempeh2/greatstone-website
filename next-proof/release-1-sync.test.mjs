import assert from 'node:assert/strict';
import test from 'node:test';
import release from './data/release.json' with { type: 'json' };
import { describePlan, gsamSlugFor, planPage, planRelease1, stableBlockIds } from './release-1-sync.mjs';

const block = (type, id, extra = {}) => ({ type, props: { id, ...extra } });
const gsamPage = (slug, content, root = { props: { title: 'T' } }) => ({
  id: `page${slug}`, slug, latestRevisionId: 'rev-1', status: 'planned', content: { root, content },
});

test('live blocks keep the GSAM id of the same type in the same order', () => {
  const live = [block('Hero', 'hero-new'), block('Steps', 'steps-a'), block('Steps', 'steps-b'), block('Faq', 'faq-new')];
  const gsam = [block('Hero', 'hero-old'), block('Steps', 'steps-1'), block('Steps', 'steps-2')];
  assert.deepEqual(stableBlockIds(live, gsam).map((b) => b.props.id), ['hero-old', 'steps-1', 'steps-2', 'faq-new']);
});

test('a block id is never used twice on one page', () => {
  assert.throws(() => stableBlockIds([block('Hero', 'same'), block('Prose', 'same')], []), /Duplicate block id/);
});

test('an identical GSAM page is unchanged and keeps its ids', () => {
  const live = { path: '/about', data: { root: { props: { title: 'T' } }, content: [block('Hero', 'x', { heading: 'A' })] } };
  const entry = planPage(live, gsamPage('/about', [block('Hero', 'hero-gsam', { heading: 'A' })]));
  assert.equal(entry.action, 'unchanged');
  assert.equal(entry.content.content[0].props.id, 'hero-gsam');
});

test('drift is an update that uses the live root and reports GSAM-only blocks', () => {
  const live = { path: '/', data: { root: { props: { title: 'Home' } }, content: [block('TwoDoors', 'new', { a: 2 })] } };
  const gsam = gsamPage('/', [block('TwoDoors', 'td', { a: 1 }), block('Invite', 'inv')], { props: { title: 'Home', pageScene: {} } });
  const entry = planPage(live, gsam);
  assert.equal(entry.action, 'update');
  assert.equal(entry.rootChanged, true);
  assert.deepEqual(entry.content.root, { props: { title: 'Home' } });
  assert.deepEqual(entry.gsamOnlyBlocks, ['Invite']);
  assert.equal(entry.baseRevisionId, 'rev-1');
});

test('renamed live paths map to the GRE-2389 GSAM pages', () => {
  assert.equal(gsamSlugFor('/case-studies'), '/proof');
  assert.equal(gsamSlugFor('/privacy'), '/privacy');
  const entry = planPage({ path: '/services', data: { root: {}, content: [] } }, undefined);
  assert.equal(entry.action, 'missing');
});

test('the checked-in release plans every page with unique ids per page', () => {
  const plan = planRelease1(release, []);
  assert.equal(plan.length, release.pages.length);
  assert.ok(plan.every((entry) => entry.action === 'missing'));
  assert.match(describePlan(plan), /\/case-studies -> \/proof: missing in GSAM/);
});
