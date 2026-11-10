import assert from 'node:assert/strict';
import test from 'node:test';
import release from './data/release.json' with { type: 'json' };
import { RELEASE_1_HELD, applyPlan, describePlan, gsamSlugFor, planPage, planRelease1, publishedAlias, stableBlockIds } from './release-1-sync.mjs';

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
  assert.equal(gsamSlugFor('/services'), '/consultancy/services');
  const entry = planPage({ path: '/new', data: { root: {}, content: [] } }, undefined);
  assert.equal(entry.action, 'missing');
});

test('the checked-in release plans every page with unique ids per page', () => {
  const plan = planRelease1(release, []);
  assert.equal(plan.length, release.pages.length);
  assert.ok(plan.every((entry) => entry.action === 'missing'));
  assert.match(describePlan(plan), /\/case-studies -> \/proof: missing in GSAM/);
});

test('apply saves changed pages only and records the revision each one replaced', async () => {
  const plan = [
    { path: '/a', gsamSlug: '/a', pageId: 'p1', baseRevisionId: 'r1', action: 'unchanged' },
    { path: '/b', gsamSlug: '/b', pageId: 'p2', baseRevisionId: 'r2', action: 'update', content: {} },
  ];
  const saved = [];
  const { ok, record } = await applyPlan(plan, async (entry) => { saved.push(entry.pageId); return { state: 'saved', revisionId: 'r3', revisionNumber: 4 }; });
  assert.equal(ok, true);
  assert.deepEqual(saved, ['p2']);
  assert.deepEqual(record[1], { path: '/b', gsamSlug: '/b', pageId: 'p2', previousRevisionId: 'r2', action: 'saved', revisionId: 'r3', revisionNumber: 4 });
});

test('apply stops at the first conflict and never runs with a missing page', async () => {
  const update = (id) => ({ path: `/${id}`, gsamSlug: `/${id}`, pageId: id, baseRevisionId: 'r', action: 'update', content: {} });
  const calls = [];
  const { ok, record } = await applyPlan([update('a'), update('b')], async (entry) => { calls.push(entry.pageId); return { state: 'conflict', message: 'Changed' }; });
  assert.equal(ok, false);
  assert.deepEqual(calls, ['a']);
  assert.equal(record[0].action, 'conflict');
  await assert.rejects(applyPlan([{ path: '/x', gsamSlug: '/x', action: 'missing' }], async () => ({})), /no GSAM page/);
});

test('apply leaves a held page alone and records it as held', async () => {
  const plan = [{ path: '/dx-consultancy', gsamSlug: '/consultancy', pageId: 'p1', baseRevisionId: 'r16', action: 'update', content: {} }];
  const calls = [];
  const { ok, record } = await applyPlan(plan, async (entry) => { calls.push(entry.pageId); return { state: 'saved' }; }, { hold: RELEASE_1_HELD });
  assert.equal(ok, true);
  assert.deepEqual(calls, []);
  assert.deepEqual(record, [{ path: '/dx-consultancy', gsamSlug: '/consultancy', pageId: 'p1', action: 'held', revisionId: 'r16' }]);
});

test('a live path and its GSAM slug land on whichever one the release publishes', () => {
  const gsam = ['/', '/proof', '/consultancy/how-we-help'];
  assert.equal(publishedAlias('/how-we-help', gsam), '/consultancy/how-we-help');
  assert.equal(publishedAlias('/case-studies', gsam), '/proof');
  assert.equal(publishedAlias('/proof', ['/', '/case-studies']), '/case-studies');
  assert.equal(publishedAlias('/proof', gsam), null);
  assert.equal(publishedAlias('/method', gsam), null);
  assert.equal(publishedAlias('/nowhere', gsam), null);
});

test('the digital office address moves to GS Agentic Manager, else Transformation Services', () => {
  assert.equal(publishedAlias('/consultancy/digital-office', ['/', '/gs-agentic-manager', '/consultancy/transformation-services']), '/gs-agentic-manager');
  assert.equal(publishedAlias('/consultancy/digital-office', ['/', '/consultancy/transformation-services']), '/consultancy/transformation-services');
  assert.equal(publishedAlias('/consultancy/digital-office', ['/']), null);
  assert.equal(publishedAlias('/transformation-services', ['/', '/consultancy/transformation-services']), '/consultancy/transformation-services');
  assert.equal(publishedAlias('/transformation-services', ['/', '/consultancy/digital-office']), '/consultancy/digital-office');
});

test('a GSAM page already in the HTML format is skipped, never overwritten', async () => {
  const live = { path: '/', data: { root: { props: {} }, content: [block('TwoDoors', 'td')] } };
  const html = { id: 'page/', slug: '/', latestRevisionId: 'rev-20', status: 'approved', content: { format: 'gs-html', html: '<p>x</p>', css: '' } };
  const entry = planPage(live, html);
  assert.equal(entry.action, 'html');
  assert.equal(entry.content, undefined);
  let saves = 0;
  const { ok, record } = await applyPlan([entry], async () => { saves++; return { state: 'saved' }; });
  assert.equal(ok, true);
  assert.equal(saves, 0);
  assert.equal(record[0].action, 'html');
  assert.match(describePlan([entry]), /already HTML, skipped/);
});
