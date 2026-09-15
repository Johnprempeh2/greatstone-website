// Preview mode must be a door, not a hatch.
//
// A staff member can tick "Preview as the client sees it" on the record screen. That strips every
// edit control from every screen below it. The checkbox that set it is rendered by exactly one of
// the eleven screens the portal can show, so before this test the practitioner who ticked it and
// then clicked into a question landed on a page with the controls gone, nothing saying why, and no
// way back other than guessing at the breadcrumb. Two things are asserted here:
//
//   1. the way out rides in the bar, which renders above every branch, and it actually works;
//   2. every item page is handed `staff && !asClient`, so an eleventh one cannot be added that
//      quietly keeps its edit controls while the practitioner believes they are seeing the client's
//      view. That second one is the bug that makes the preview LIE rather than merely trap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInDom, ROOT } from './deepdive-dom-harness.mjs';

const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { __panels } from '${join(ROOT, 'src/store/DeepDivePortal.jsx')}';

export function run() {
  const shot = (props) => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    let err = null, exits = 0;
    const p = { slug: 'probe', client: 'Probe', slotRef: () => {}, ...props,
      onExit: () => { exits += 1; } };
    try { flushSync(() => root.render(React.createElement(__panels.PortalBar, p))); }
    catch (e) { err = String(e && e.message); }
    const out = { text: el.textContent || '', html: el.innerHTML || '', err, exits: 0 };
    // Click whatever the bar offers as the way out, the way a person would.
    const btn = el.querySelector('.dd-prevbar-x');
    out.hasExit = !!btn;
    out.exitIsButton = !!btn && btn.tagName === 'BUTTON';
    if (btn) flushSync(() => btn.click());
    out.exits = exits;
    root.unmount();
    el.remove();
    return out;
  };
  return { off: shot({ asClient: false }), on: shot({ asClient: true }) };
}
`;

test('preview mode: the way out is in the bar, not in the screen that set it', async () => {
  const { off, on } = await runInDom(ENTRY, 'ddprev');
  assert.equal(off.err, null, `the bar threw with preview off: ${off.err}`);
  assert.equal(on.err, null, `the bar threw with preview on: ${on.err}`);

  // Off: nothing. A bar that always carries the chip would say the record is filtered when it is
  // not, which is the same lie in the other direction.
  assert.equal(off.hasExit, false, 'the bar offers an exit from preview when preview is off');
  assert.ok(!/Client.{0,8}s view/.test(off.text),
    'the bar says the client view is on when it is off');

  // On: a real control, and one that fires.
  assert.equal(on.hasExit, true,
    'preview is on and the bar offers no way out: every screen below it is now a trap');
  assert.equal(on.exitIsButton, true, 'the way out of preview is not a button');
  assert.equal(on.exits, 1, 'clicking the way out of preview did nothing');
  assert.ok(/Client.{0,8}s view/.test(on.text),
    'preview is on and the bar does not say so, so the missing controls read as a bug');
});

test('preview mode: every item page is gated on it', () => {
  const src = readFileSync(join(ROOT, 'src/store/DeepDivePortal.jsx'), 'utf8');
  const lines = src.split('\n');
  // The item pages live between the first one and the point where the record screen takes over.
  const from = lines.findIndex((l) => /if \(itemKind === '/.test(l));
  const to = lines.findIndex((l) => /const clientMode = /.test(l));
  assert.ok(from > 0 && to > from, 'could not find the item-page region: this test is now blind');

  const region = lines.slice(from, to);
  const passes = region
    .map((l, i) => [i + from + 1, l])
    .filter(([, l]) => /\bstaff=\{/.test(l));
  // ⚠ The floor is the point. Without it a refactor that renames the prop leaves this test
  // scanning nothing and reporting clean, which is the failure mode it exists to prevent.
  assert.ok(passes.length >= 10,
    `only ${passes.length} item pages take a staff prop; there are at least ten, so the scan missed some`);

  const bad = passes.filter(([, l]) => !/staff=\{staff && !asClient\}/.test(l));
  assert.deepEqual(bad.map(([n, l]) => `${n}: ${l.trim()}`), [],
    'an item page takes staff without the preview gate, so previewing as the client shows staff controls');
});
