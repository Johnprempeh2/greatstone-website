import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import landing from './frozen/two-doors-landing.json' with { type: 'json' };
import { LANDING_TEXT_FIELDS, RETIRED_WORDING, landingCopy, landingData } from './landing-copy.mjs';
import { islandProps } from './islands.mjs';

test('with no copy the landing renders the frozen blocks exactly (pixel parity), less the unverified case studies', () => {
  const frozen = landing.data.content.filter((block) => !['TwoDoorsProof', 'TwoDoorsBottom'].includes(block.type));
  for (const copy of [undefined, '{}', 'not json']) {
    assert.equal(landingData(copy), landingData(undefined));
    assert.deepEqual(landingData(copy).content.slice(1), frozen.slice(1));
    assert.deepEqual({ ...landingData(copy).content[0].props, ...Object.fromEntries(['proofHref', 'cueText', 'chooserHeading'].map((key) => [key, frozen[0].props[key]])) }, frozen[0].props);
    assert.ok(landingData(copy).content.slice(1).every((block, i) => block === frozen[i + 1]));
  }
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

test('only the live-design render names the fields', () => {
  assert.ok(landingData(undefined, true).content.every((block) => block.props.gsMarkFields === true));
  assert.ok(landingData('{"cueText":"x"}').content.every((block) => block.props.gsMarkFields === undefined));
});

test('the landing leaves out the case-study section until a verified case exists', () => {
  assert.equal(landingData().content.some((block) => block.type === 'TwoDoorsProof'), false);
  assert.equal(landingData('{"cueText":"x"}').content.some((block) => block.type === 'TwoDoorsProof'), false);
});

test('no landing link points at a hidden page; the door proof link goes to How we work', () => {
  assert.ok(!JSON.stringify(landingData().content).match(/"[a-zA-Z]*Href":"\/(case-studies|proof)/));
  assert.equal(landingData().content[0].props.proofHref, '/consultancy/how-we-work');
});

test('"Choose your side" and the closing repeat of the doors are gone; an edit from GSAM still wins', () => {
  assert.match(JSON.stringify(landing.data), RETIRED_WORDING); // the frozen file still says it, so this test can fail
  assert.doesNotMatch(JSON.stringify(landingData()), RETIRED_WORDING);
  assert.equal(landingData().content.some((block) => block.type === 'TwoDoorsBottom'), false);
  assert.equal(landingData('{"cueText":"Pick a door"}').content[0].props.cueText, 'Pick a door');
});
