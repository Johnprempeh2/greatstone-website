import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PRIMARY_CTA_LABEL, PRIMARY_CTA_HREF } from './brand.mjs';

// GRE-635: one primary call to action across every block. "Book a Diagnostic" is retired, so no block
// may ship it as a default label, and the blocks that offer a booking CTA take it from brand.mjs.
const BLOCKS = new URL('../blocks/', import.meta.url);
const read = (f) => readFileSync(new URL(f, BLOCKS), 'utf8');

test('the primary CTA is "Begin the Conversation" and opens the booking flow', () => {
  assert.equal(PRIMARY_CTA_LABEL, 'Begin the Conversation');
  assert.equal(PRIMARY_CTA_HREF, '#book');
});

test('no block defaults a CTA to the retired "Book a Diagnostic"', () => {
  for (const f of readdirSync(BLOCKS).filter((n) => n.endsWith('.jsx'))) {
    const src = read(f);
    assert.doesNotMatch(src, /(ctaLabel|bookLabel)\s*:\s*['"]Book a diagnostic['"]/i, f);
    assert.doesNotMatch(src, />\s*Book a diagnostic\s*</i, f);
  }
});

test('the CTA blocks take their label and link from the shared constant', () => {
  for (const f of ['Hero.jsx', 'Invite.jsx', 'IndustryPicker.jsx', 'MethodExplorer.jsx', 'AiBaselineSurvey.jsx', 'AiCostCalculator.jsx', 'TimeSavingsCalculator.jsx', 'ServiceCatalog.jsx']) {
    const src = read(f);
    assert.match(src, /PRIMARY_CTA_LABEL/, f);
    assert.match(src, /PRIMARY_CTA_HREF/, f);
  }
});
