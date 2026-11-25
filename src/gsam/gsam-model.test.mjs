import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectGsamPlatform, gsamTotal, gsamStatusLabel } from './gsam-model.mjs';

const catalogue = [
  { id: 'a', prices: { month: { amount: 1000, currency: 'gbp' }, year: { amount: 10000, currency: 'gbp' } } },
  { id: 'b', prices: { month: { amount: 500, currency: 'gbp' } } },
  { id: 'c', prices: { month: { amount: 700, currency: 'usd' } } },
];

test('totals the picked prices on one interval', () => {
  assert.deepEqual(gsamTotal(catalogue, ['a', 'b'], 'month'), { amount: 1500, currency: 'GBP' });
  assert.equal(gsamTotal(catalogue, ['a', 'b'], 'year'), null, 'b is not sold annually');
  assert.equal(gsamTotal(catalogue, ['a', 'c'], 'month'), null, 'mixed currencies');
  assert.equal(gsamTotal(catalogue, [], 'month'), null);
});

test('status reads in plain English', () => {
  assert.equal(gsamStatusLabel({ status: 'active' }), 'Active');
  assert.equal(gsamStatusLabel({ status: 'active', cancelAtPeriodEnd: true }), 'Active, ends at the end of the paid period');
  assert.match(gsamStatusLabel({ status: 'past_due' }), /update your card/);
  assert.equal(gsamStatusLabel(null), 'Not known yet');
});

test('My GSAM copy has no em or en dashes and fades no text with opacity', () => {
  for (const file of ['./MyGsam.jsx', './my-gsam.css', './gsam-model.mjs']) {
    const text = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /[\u2013\u2014]/, file);
    assert.doesNotMatch(text, /opacity\s*:\s*0?\.\d/, file);
  }
});

test('offers the download for the visitor\'s computer first', () => {
  assert.equal(detectGsamPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36'), 'windows');
  assert.equal(detectGsamPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15'), 'mac');
  assert.equal(detectGsamPlatform('anything', 'Windows'), 'windows');
  assert.equal(detectGsamPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)'), null);
  assert.equal(detectGsamPlatform('Mozilla/5.0 (X11; Linux x86_64)'), null);
  assert.equal(detectGsamPlatform(), null);
});
