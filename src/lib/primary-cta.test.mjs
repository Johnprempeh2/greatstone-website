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

// The seed pages, page starters and signed-in dashboards are visitor-facing too, so no button label there
// may carry the retired wording either (body copy is out of scope here: it needs new words, not a swap).
const RETIRED = /^\s*book a diagnostic\s*$/i;
function labelsIn(node, out = []) {
  if (Array.isArray(node)) node.forEach((n) => labelsIn(n, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (/^(ctaLabel2?|bookLabel)$/.test(k) && typeof v === 'string') out.push(v);
      else labelsIn(v, out);
    }
  }
  return out;
}

test('seed pages and page starters carry no retired CTA label', async () => {
  const seed = JSON.parse(readFileSync(new URL('../seed-pages.json', import.meta.url), 'utf8'));
  const { STARTERS } = await import('./templates-model.mjs');
  for (const label of [...labelsIn(seed), ...labelsIn(STARTERS)]) assert.doesNotMatch(label, RETIRED);
});

test('store seeds and dashboards carry no retired CTA label', () => {
  for (const f of ['../store.js', '../store/OrgDashboard.jsx']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /(ctaLabel2?|bookLabel|label)\s*:\s*['"]Book a diagnostic['"]/i, f);
    assert.doesNotMatch(src, />\s*Book a diagnostic\s*</i, f);
  }
});
