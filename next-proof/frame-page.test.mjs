import test from 'node:test';
import assert from 'node:assert/strict';
import { framePageFor } from './frame-page.mjs';

const id = '34cbe856-fb9c-48f9-adfe-9446541b6ed0';
const plannedId = 'b7b57279-feb7-45f3-996a-578a16bfa73e';
const release = {
  orgId: 'org',
  media: {},
  pages: [{ id, slug: 'about', title: 'About' }],
};

test('frame pages resolve release pages by GSAM id, then by legacy slug', () => {
  assert.deepEqual(framePageFor(id, release), { ...release.pages[0], orgId: 'org' });
  assert.deepEqual(framePageFor('about', release), { ...release.pages[0], orgId: 'org' });
});

test('unreleased UUID opens a waiting frame shell; unknown slugs stay missing', () => {
  assert.deepEqual(framePageFor(plannedId, release), { id: plannedId });
  assert.equal(framePageFor('not-a-page', release), undefined);
});
