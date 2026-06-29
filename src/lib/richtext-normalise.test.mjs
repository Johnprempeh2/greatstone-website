import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, applyLegacyBold, looksLikeHtml, plainToRichHtml, stripTags } from './richtext-normalise.mjs';

test('escapeHtml neutralises angle brackets, ampersands and quotes', () => {
  assert.equal(escapeHtml('<script>alert("x")&'), '&lt;script&gt;alert(&quot;x&quot;)&amp;');
  assert.equal(escapeHtml(''), '');
  assert.equal(escapeHtml(null), '');
});

test('applyLegacyBold upgrades **bold** to <strong>, single-line non-nested (matches old emphasize)', () => {
  assert.equal(applyLegacyBold('a **bold** b'), 'a <strong>bold</strong> b');
  assert.equal(applyLegacyBold('**one** and **two**'), '<strong>one</strong> and <strong>two</strong>');
  assert.equal(applyLegacyBold('no markers here'), 'no markers here');
  assert.equal(applyLegacyBold('lone ** marker'), 'lone ** marker'); // unpaired stays literal
});

test('plainToRichHtml escapes FIRST then bolds, so injected markup cannot survive', () => {
  // a hostile plain string is escaped; only our own <strong> tags appear
  const out = plainToRichHtml('**hi** <img src=x onerror=alert(1)>');
  assert.equal(out, '<strong>hi</strong> &lt;img src=x onerror=alert(1)&gt;');
  assert.doesNotMatch(out, /<img/);
});

test('looksLikeHtml distinguishes authored HTML from a legacy plain string', () => {
  assert.equal(looksLikeHtml('<strong>x</strong>'), true);
  assert.equal(looksLikeHtml('<span class="gs-rt-c-accent">x</span>'), true);
  assert.equal(looksLikeHtml('plain **bold** text'), false);
  assert.equal(looksLikeHtml(''), false);
  assert.equal(looksLikeHtml(null), false);
});

test('plainToRichHtml is stable on already-plain text (no markers)', () => {
  const s = 'For two decades our team has modernised how work happens.';
  assert.equal(plainToRichHtml(s), s);
});

test('stripTags yields clean plain text for JSON-LD / search (tags + entities + ** removed)', () => {
  assert.equal(stripTags('<strong>Yes</strong>, data &amp; security.'), 'Yes, data & security.');
  assert.equal(stripTags('<span class="gs-rt-c-accent">Lime</span> word'), 'Lime word');
  assert.equal(stripTags('legacy **bold** answer'), 'legacy bold answer');
  assert.equal(stripTags('plain answer'), 'plain answer');
  assert.equal(stripTags(''), '');
});
