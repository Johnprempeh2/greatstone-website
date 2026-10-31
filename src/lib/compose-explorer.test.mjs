import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { problems } from '../data/compose-problems.mjs';
import { services, categories } from '../data/service-catalog.mjs';
import { resolveProblems, groupServices, toggleSlug, summarise, countMessage } from './compose-explorer.mjs';
import { buildSeed, SEED_PATH } from '../../scripts/gen-compose-seed.mjs';

test('every seeded problem points only at services in the catalogue', () => {
  const slugs = new Set(services.map((s) => s.slug));
  for (const p of problems) {
    assert.ok(p.title && p.subline && p.source, `${p.id} needs a title, subline and source`);
    for (const slug of p.services) assert.ok(slugs.has(slug), `${p.id}: unknown service ${slug}`);
  }
  assert.equal(resolveProblems(problems, services).length, problems.length);
});

test('a service removed from the catalogue drops out, and an empty problem hides', () => {
  const only = services.filter((s) => s.slug === 'live-operations-dashboard');
  const resolved = resolveProblems(problems, only);
  assert.deepEqual(resolved.map((p) => p.id), ['no-visibility']);
  assert.deepEqual(resolved[0].services, ['live-operations-dashboard']);
});

test('groups follow the catalogue category order and cover all 78 services', () => {
  const groups = groupServices(services, categories);
  assert.deepEqual(groups.map((g) => g.name), categories.map((c) => c.name));
  assert.equal(groups.reduce((n, g) => n + g.services.length, 0), 78);
});

test('summary counts services and the areas they touch', () => {
  let sel = new Set(problems.find((p) => p.id === 'getting-paid').services);
  const sum = summarise(sel, services);
  assert.equal(sum.count, 4);
  assert.deepEqual(sum.areas, ['Commerce & Storefronts', 'Automation & Integration']);
  assert.equal(countMessage(sum), '4 services selected, across 2 areas.');
  sel = toggleSlug(sel, 'stripe-checkout-setup');
  assert.equal(summarise(sel, services).count, 3);
  assert.equal(countMessage(summarise(new Set(), services)), 'No services selected.');
  assert.equal(countMessage(sum, 'Chasing payments and renewals'), 'For chasing payments and renewals: 4 services across 2 areas.');
  assert.equal(countMessage(sum, 'CRM is a mess'), 'For CRM is a mess: 4 services across 2 areas.', 'acronyms keep their case');
});

test('the database seed is generated from the source', () => {
  assert.equal(readFileSync(SEED_PATH, 'utf8'), buildSeed(problems), 'run node scripts/gen-compose-seed.mjs');
});

test('the problem copy follows the house voice: no em or en dashes', () => {
  for (const p of problems) assert.doesNotMatch(p.title + p.subline, /[–—]/);
});

test('problems come from the database once it answers; the bundled copy covers a failure', async () => {
  const store = await import('../store/compose-problems.mjs');
  store.resetComposeProblems();
  assert.deepEqual(store.getProblems(), problems, 'first paint is the bundled source');
  await store.loadComposeProblems(async () => ({ ok: false }));
  assert.deepEqual(store.getProblems(), problems, 'a failed read keeps the bundled source');
  store.resetComposeProblems();
  await store.loadComposeProblems(async () => ({ ok: true, json: async () => [{ title: 'no id' }] }));
  assert.deepEqual(store.getProblems(), problems, 'malformed rows are ignored');
  store.resetComposeProblems();
  const rows = [{ id: 'db-only', title: 'From the database', subline: null, source: '', placeholder: false, services: ['live-operations-dashboard'] }];
  await store.loadComposeProblems(async (url) => { assert.equal(url, '/api/compose-problems'); return { ok: true, json: async () => rows }; });
  assert.deepEqual(store.getProblems(), [{ id: 'db-only', title: 'From the database', subline: '', source: '', placeholder: false, services: ['live-operations-dashboard'] }]);
  store.resetComposeProblems();
});
