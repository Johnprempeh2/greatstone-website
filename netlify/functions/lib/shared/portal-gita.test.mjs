// GITA reading order and evidence markers (GRE-1257). Made-up data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readingOrder, isCommercialPerspective, evidenceMarker, EVIDENCE } from './portal-gita.mjs';
import { documentCopyHtml } from './portal-receipt.mjs';

const S = (id, title) => ({ id, title, html: `<p>${title} text.</p>` });
const PACK = [S('cp', 'Commercial Perspective'), S('s1', 'Where you are'), S('s2', 'What we found'), S('s3', 'What we propose')];

test('a GITA reads in pack order with the Commercial Perspective last', () => {
  assert.deepEqual(readingOrder('gita', PACK).map((s) => s.id), ['s1', 's2', 's3', 'cp']);
});

test('already last, it stays where it is; nothing else moves', () => {
  const ok = [S('s1', 'One'), S('s2', 'Two'), S('cp', 'Commercial Perspective')];
  assert.deepEqual(readingOrder('gita', ok).map((s) => s.id), ['s1', 's2', 'cp']);
});

test('the Commercial Perspective is found by title or id, not by a passing mention', () => {
  assert.ok(isCommercialPerspective(S('x', 'The commercial perspective')));
  assert.ok(isCommercialPerspective(S('x', 'Commercial Perspective: options')));
  assert.ok(isCommercialPerspective(S('commercial-perspective', 'Options and fees')));
  assert.ok(isCommercialPerspective(S('commercial_perspective', 'Options')));
  assert.ok(!isCommercialPerspective(S('s9', 'Our view of the commercial perspective of risk')));
  assert.ok(!isCommercialPerspective(S('s9', 'Commercials')));
  assert.ok(!isCommercialPerspective(null));
});

test('other kinds keep their order exactly; bad input gives an empty list', () => {
  assert.deepEqual(readingOrder('engagement_pack', PACK).map((s) => s.id), ['cp', 's1', 's2', 's3']);
  assert.deepEqual(readingOrder('gita', null), []);
  assert.deepEqual(readingOrder('gita', [null, S('s1', 'One')]).map((s) => s.id), ['s1']);
});

test('evidence markers: Known, Indicated, To validate, with a colon, a dash or brackets', () => {
  assert.deepEqual(evidenceMarker('Known: three sites run the same process.'), { key: 'known', length: 7 });
  assert.equal(evidenceMarker('  indicated – most orders arrive by email').key, 'indicated');
  assert.equal(evidenceMarker('To validate: the month-end backlog').key, 'to_validate');
  assert.equal(evidenceMarker('TO  VALIDATE - x').key, 'to_validate');
  assert.equal(evidenceMarker('[Known] the team is six people').key, 'known');
  assert.equal(evidenceMarker('[To validate]: the volumes').key, 'to_validate');
  assert.equal(evidenceMarker('Known — x').key, 'known');
  const m = evidenceMarker('Indicated: rest');
  assert.equal('Indicated: rest'.slice(m.length), 'rest');
  assert.deepEqual(Object.values(EVIDENCE), ['Known', 'Indicated', 'To validate']);
});

test('ordinary text that starts with the same word is not a marker', () => {
  assert.equal(evidenceMarker('Known risks are listed below.'), null);
  assert.equal(evidenceMarker('Indicatedly'), null);
  assert.equal(evidenceMarker('We have Known: in the middle'), null);
  assert.equal(evidenceMarker(''), null);
  assert.equal(evidenceMarker(null), null);
});

test('the email copy of a GITA uses the same order as the reader', () => {
  const html = documentCopyHtml({ kind: 'gita', title: 'Test GITA', version: 1, body: { sections: PACK } }, {});
  const at = (t) => html.indexOf(`<h2>${t}</h2>`);
  assert.ok(at('Where you are') > 0 && at('What we propose') > at('Where you are'));
  assert.ok(at('Commercial Perspective') > at('What we propose'));
});
