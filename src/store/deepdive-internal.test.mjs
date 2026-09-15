// What a client must never be shown, checked rather than remembered.
//
// ⚠ THIS EXISTS BECAUSE I GOT IT WRONG. OpportunityRail gated its Add and Edit buttons on `staff`
// and rendered the records themselves regardless, which is the wrong half of the problem: hiding
// the ability to CHANGE something while leaving it on screen. A client viewing the Innovation tab
// would have read Greatstone's full delivery complexity assessment, including which dimensions we
// judge significant, what we are uncertain about, and what we would want established before
// committing to anything.
//
// The portal is admin-first: internal is the default and nothing reaches a client by omission. A
// comment saying so is not a check, and "the buttons are gated" reads like one until you look.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, f), 'utf8');

// Screens whose whole content is internal, with the reason. A screen listed here must refuse to
// render at all without staff, not merely hide its controls.
const INTERNAL_SCREENS = {
  'OpportunityRail.jsx':
    'the Delivery Complexity Assessment is an internal deliverable and the opportunity is a working '
    + 'step toward the GDXP, which is the client-facing output',
};

test('a screen whose content is internal refuses to render for a client', () => {
  const bad = [];
  for (const [file, why] of Object.entries(INTERNAL_SCREENS)) {
    const src = read(file);
    // The whole-component guard, before any JSX is returned.
    if (!/if \(!staff\)\s*return null;/.test(src)) bad.push(`${file}: no whole-screen staff guard — ${why}`);
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('gating only the buttons is not gating the screen', () => {
  // The failure mode in one assertion: a file that mentions staff ONLY beside AddButton or EditLink
  // has hidden the ability to change a record and left the record on display.
  for (const file of Object.keys(INTERNAL_SCREENS)) {
    const src = read(file);
    const guards = (src.match(/if \(!staff\)\s*return null;/g) || []).length;
    assert.ok(guards >= 1,
      `${file} gates controls but never the screen, which leaves the content readable by a client`);
  }
});

test('the scanner can still see what it checks', () => {
  // If the guard is ever rewritten in another form this test must fail loudly rather than pass by
  // finding nothing to object to.
  const src = read('OpportunityRail.jsx');
  assert.ok(/const staff = ctx\?\.staff;/.test(src), 'the staff flag is no longer read the way this test expects');
  assert.ok(/COMPLEXITY/.test(src) || /assessments/.test(src),
    'this screen no longer carries the complexity assessment — re-point or retire this test');
});
