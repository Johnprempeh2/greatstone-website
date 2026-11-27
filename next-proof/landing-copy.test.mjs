import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import landing from './frozen/two-doors-landing.json' with { type: 'json' };
import { LANDING_TEXT_FIELDS, RETIRED_WORDING, landingCopy, landingData } from './landing-copy.mjs';
import { islandProps } from './islands.mjs';

test('with no copy the landing renders the frozen blocks exactly (pixel parity), less the closing repeat of the doors', () => {
  const frozen = landing.data.content.filter((block) => block.type !== 'TwoDoorsBottom');
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

test('the route card lines are editable by name; the rest of each card stays as frozen', () => {
  const frozen = landing.data.content.find((b) => b.type === 'TwoDoorsStory').props.range;
  const range = landingData(JSON.stringify({ consultancyRangeLine: 'For leaders with goals to reach.' })).content.find((b) => b.type === 'TwoDoorsStory').props.range;
  assert.deepEqual(range, [{ ...frozen[0], line: 'For leaders with goals to reach.' }, frozen[1]]);
  assert.deepEqual(landingCopy(JSON.stringify({ toolsRangeLine: 'x', range: [] })), { toolsRangeLine: 'x' });
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

test('GRE-6331: the case-study section shows its marked placeholders until verified cases exist; GSAM can turn them off', () => {
  const proof = (data) => data.content.find((block) => block.type === 'TwoDoorsProof');
  assert.equal(proof(landingData()).props.draftItems.length, 3);
  assert.equal(proof(landingData()).props.draftBadge, 'PLACEHOLDER');
  assert.equal(proof(landingData()).props.cases.length, 0);
  assert.equal(proof(landingData('{"cueText":"x"}')).props.showPlaceholders, undefined);
  assert.deepEqual(landingCopy('{"showPlaceholders":false,"showCue":"no"}'), { showPlaceholders: false });
  assert.equal(proof(landingData('{"showPlaceholders":false}')), undefined, 'no placeholders and no verified case: the section leaves the landing');
  assert.equal(landingData('{"showPlaceholders":false}').content.find((block) => block.type === 'TwoDoors').props.showPlaceholders, undefined);
  const verified = { headline: 'Four hours a week back', problem: 'P', work: 'W', result: 'R', verified: true };
  const unverified = { headline: 'Draft', result: 'R', verified: false };
  assert.deepEqual(proof(landingData(undefined, false, [unverified, verified])).props.cases, [verified]);
  assert.deepEqual(proof(landingData('{"showPlaceholders":false}', false, [verified])).props.cases, [verified], 'verified cases show even with placeholders off');
  assert.equal(landingData(undefined, false, [unverified]), landingData(), 'unverified cases change nothing');
});

test('the door proof link and the case-study section point at /case-studies, which is public again', () => {
  assert.equal(landingData().content[0].props.proofHref, '/case-studies');
  assert.equal(landingData().content.find((block) => block.type === 'TwoDoorsProof').props.proofHref, '/case-studies');
  assert.ok(!JSON.stringify(landingData().content).includes('/consultancy/how-we-work'));
});

test('"Choose your side" and the closing repeat of the doors are gone; an edit from GSAM still wins', () => {
  assert.match(JSON.stringify(landing.data), RETIRED_WORDING); // the frozen file still says it, so this test can fail
  assert.doesNotMatch(JSON.stringify(landingData()), RETIRED_WORDING);
  assert.equal(landingData().content.some((block) => block.type === 'TwoDoorsBottom'), false);
  assert.equal(landingData('{"cueText":"Pick a door"}').content[0].props.cueText, 'Pick a door');
});
