// GRE-4786: the #admin console, its sign-in and the Team screen saved only to the visitor's browser, so they
// were retired; GSAM manages pages, media, redirects and people. These guards keep them from coming back.
// Run: node --test src/cms/admin-retired.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const here = (p) => new URL(p, import.meta.url);
const app = readFileSync(here('../App.jsx'), 'utf8');

test('the retired admin screens are gone from the source tree', () => {
  for (const f of ['AdminConsole.jsx', 'SignIn.jsx', 'TeamPanel.jsx']) {
    assert.equal(existsSync(here('./' + f)), false, f + ' should be deleted');
    assert.equal(app.includes(f), false, 'App.jsx still imports ' + f);
  }
});

test('an #admin URL no longer opens the console; it is sent to the homepage', () => {
  assert.equal(/setAdminNav\(\s*readAdminHash/.test(app), false, 'the hash must not drive adminNav');
  assert.match(app, /useState\(readRetiredAdminHash\)/);
  assert.match(app, /if \(!retiredAdmin\) return;\s*setRetiredAdmin\(false\);\s*navigate\(state\.order\[0\]\);/);
});

test('no admin sign-in or session check is rendered any more', () => {
  assert.equal(app.includes('<SignIn'), false);
  assert.equal(app.includes('Checking your session'), false);
  assert.equal(app.includes('<AdminConsole'), false);
});
