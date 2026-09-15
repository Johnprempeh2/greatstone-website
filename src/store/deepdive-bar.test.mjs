// The bar's contract with the screen that portals its tabs into it.
//
// The bar hands the record screen a slot to render the tabs into, and it now also watches that
// slot so it can fade the edge when the tabs do not fit. Those two jobs share one callback ref,
// and composing them is where it broke: a callback ref that changes identity is detached and
// reattached by React on every render, so a parent passing an inline function got a detach loop.
// The app passes a stable state setter and never saw it. The harness passes inline functions, spun
// until it timed out, and then reported one screen's tab strip as another's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runInDom, ROOT } from './deepdive-dom-harness.mjs';

const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { __panels } from '${join(ROOT, 'src/store/DeepDivePortal.jsx')}';

export function run() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  const calls = [];
  // A NEW function every render, which is what any parent that does not go out of its way to
  // memoise will pass, and what the overlap harness passes.
  const render = (client) => flushSync(() => root.render(
    React.createElement(__panels.PortalBar, {
      slug: 'probe', client,
      slotRef: (node) => calls.push(node === null ? 'detach' : 'attach'),
    })));

  let err = null;
  try {
    render('One');
    const first = calls.slice();
    // Three more renders with a changed prop, so React re-renders for a real reason each time.
    render('Two'); render('Three'); render('Four');
    var out = { first, all: calls.slice(), slots: el.querySelectorAll('.dd-top-slot').length };
  } catch (e) { err = String(e && e.message); out = { first: [], all: [], slots: 0 }; }
  out.err = err;
  root.unmount();
  el.remove();
  return out;
}
`;

test('the bar keeps one slot ref across re-renders', async () => {
  const out = await runInDom(ENTRY, 'ddbar');
  assert.equal(out.err, null, `the bar threw while rendering: ${out.err}`);

  // ⚠ The floor: without it, a render that produced no bar at all would pass every assertion
  // below by having nothing to count.
  assert.equal(out.slots, 1, 'the bar did not render exactly one tab slot');
  assert.deepEqual(out.first, ['attach'],
    'the first render did not hand the screen its slot exactly once');

  // Four renders, one attach. A detach here means the ref is being rebuilt, which in the app means
  // the tabs are torn out of the bar and put back on every render of the shell.
  const detaches = out.all.filter((c) => c === 'detach').length;
  const attaches = out.all.filter((c) => c === 'attach').length;
  assert.equal(detaches, 0,
    `the slot ref was detached ${detaches} times across four renders: it is changing identity`);
  assert.equal(attaches, 1,
    `the slot was handed over ${attaches} times across four renders, expected once`);
});
