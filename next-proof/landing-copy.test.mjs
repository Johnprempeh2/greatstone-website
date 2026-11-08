import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import landing from './frozen/two-doors-landing.json' with { type: 'json' };
import { LANDING_TEXT_FIELDS, landingCopy, landingData } from './landing-copy.mjs';
import { islandProps } from './islands.mjs';

test('with no copy the landing renders the frozen blocks exactly (pixel parity)', () => {
  assert.equal(landingData(undefined), landing.data);
  assert.equal(landingData('{}'), landing.data);
  assert.equal(landingData('not json'), landing.data);
  assert.match(readFileSync(new URL('../src/blocks/TwoDoors.jsx', import.meta.url), 'utf8'), /showCue: true/);
});

test('text fields and showCue apply; links, images, layout and unknown keys never do', () => {
  assert.ok(LANDING_TEXT_FIELDS.has('cueText') && LANDING_TEXT_FIELDS.has('closeHeading'));
  assert.ok(!LANDING_TEXT_FIELDS.has('chooseHref') && !LANDING_TEXT_FIELDS.has('toolsImage'));
  assert.deepEqual(landingCopy(JSON.stringify({ cueText: 'Pick one', showCue: false, chooseHref: '/x', toolsImage: 'y', tide: false, cueSubtext: 3 })), { cueText: 'Pick one', showCue: false });
  const data = landingData(JSON.stringify({ showCue: false, closeHeading: 'Talk to us' }));
  assert.equal(data.content.find((b) => b.type === 'TwoDoors').props.showCue, false);
  assert.equal(data.content.find((b) => b.type === 'TwoDoorsClose').props.closeHeading, 'Talk to us');
  assert.equal(data.content.find((b) => b.type === 'TwoDoorsStory').props.showCue, undefined);
});

test('the island accepts data-copy as its copy prop', () => {
  assert.deepEqual(islandProps('two-doors-landing', [['data-copy', '{"showCue":false}']]).props, { copy: '{"showCue":false}' });
  const removed = [];
  assert.deepEqual(islandProps('two-doors-landing', [['data-style', 'x']], removed).props, {});
  assert.equal(removed.length, 1);
});
