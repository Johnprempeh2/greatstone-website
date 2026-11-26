import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANDING_CLOSE, landingClose } from './shop-close.mjs';

const release = (props) => ({ pages: [{ path: '/', data: { content: [{ type: 'TwoDoors', props: {} }, { type: 'TwoDoorsClose', props }] } }] });

test('uses the landing close block words', () => {
  const close = landingClose(release({ closeHeading: 'Talk to us', closeLine: 'A line.', closeCta: 'Go →', contactHref: '/contact#form', _section: {} }));
  assert.deepEqual(close, { closeHeading: 'Talk to us', closeLine: 'A line.', closeCta: 'Go →', contactHref: '/contact#form' });
});

test('fills missing fields from the approved landing words', () => {
  assert.deepEqual(landingClose(release({ closeHeading: 'Talk to us' })), { ...LANDING_CLOSE, closeHeading: 'Talk to us' });
});

test('falls back when the landing has no close block or is an HTML release', () => {
  assert.deepEqual(landingClose(release({ closeHeading: ' ' })), LANDING_CLOSE);
  assert.deepEqual(landingClose({ releaseSchema: 2, pages: [{ path: '/', html: '<p></p>' }] }), LANDING_CLOSE);
  assert.deepEqual(landingClose(undefined), LANDING_CLOSE);
});

test('the checked-in release carries the same words as the fallback', async () => {
  const { readFile } = await import('node:fs/promises');
  const checked = JSON.parse(await readFile(new URL('../next-proof/data/release.json', import.meta.url), 'utf8'));
  assert.deepEqual(landingClose(checked), LANDING_CLOSE);
});
