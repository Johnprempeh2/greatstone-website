// Who is allowed to see the sample assessment.
//
// This decides whether a real company is shown an illustrative set of scores that are not theirs.
// It used to be a pair of regexes naming one client, compiled into the public JavaScript bundle;
// the identifier now comes from the environment and is unset in anything shipped, so the default
// is that nobody matches. Both halves are worth pinning: the default, because it is what protects
// a client's identity, and the matching rule, because an over-broad one would hand somebody else's
// numbers to a company that merely has a similar domain.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDemoCompany, matchesDemoDomain } from './maturity-seed.mjs';

test('with nothing configured, no company is the demo', () => {
  // This is the shipped state: no VITE_DEMO_COMPANY_DOMAIN, so every company gets the empty state.
  for (const company of [
    { domain: 'anything.com', name: 'Anything' },
    { domain: '', name: '' },
    {}, null, undefined,
  ]) {
    assert.equal(isDemoCompany(company), false,
      `${JSON.stringify(company)} matched the demo with nothing configured`);
  }
});

test('the demo domain matches itself and its subdomains, and nothing that merely ends in it', () => {
  assert.equal(matchesDemoDomain('example.com', 'example.com'), true);
  assert.equal(matchesDemoDomain('app.example.com', 'example.com'), true, 'a subdomain is the same company');
  assert.equal(matchesDemoDomain('EXAMPLE.COM', 'example.com'), true, 'a domain is not case sensitive');
  assert.equal(matchesDemoDomain('  example.com  ', 'example.com'), true, 'stored values carry whitespace');

  assert.equal(matchesDemoDomain('notexample.com', 'example.com'), false,
    'a look-alike ending in the same characters would have been shown another company\'s scores');
  assert.equal(matchesDemoDomain('example.com.evil.net', 'example.com'), false,
    'the demo domain as a prefix of somebody else is not a match');
  assert.equal(matchesDemoDomain('', 'example.com'), false);
  assert.equal(matchesDemoDomain('example.com', ''), false, 'nothing configured can never match');
});

test('no client is named in this module', () => {
  // ⚠ The leak this file's history is about. The check is on the SOURCE, because a name here
  // reaches the bundle, and it scans for the record store's clients the same way the gate does.
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'maturity-seed.mjs'), 'utf8');
  const RECORDS = process.env.DEEPDIVE_DIR
    || join(process.env.HOME || '', 'Desktop', 'Code', '.greatstone-records');
  let names = [];
  try {
    names = readdirSync(RECORDS)
      .filter((f) => f.endsWith('.json') && !f.endsWith('.state.json') && f !== 'index.json')
      .flatMap((f) => {
        const p = JSON.parse(readFileSync(join(RECORDS, f), 'utf8'));
        return [p?.engagement?.client, p?.engagement?.slug].filter(Boolean);
      });
  } catch { names = []; }
  if (!names.length) return;                      // no record store here: nothing to check against
  for (const name of names) {
    const pattern = new RegExp(String(name).replace(/[^a-z0-9]+/gi, '[^a-z0-9]*'), 'i');
    assert.ok(!pattern.test(src), `this module names the client "${name}", which ships in the bundle`);
  }
});
