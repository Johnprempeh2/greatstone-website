// What leaves the building.
//
// ClientView is the only screen a client ever sees, and the rule the whole portal is built on is
// that INTERNAL IS THE DEFAULT: an item reaches a client only when somebody has deliberately
// marked it Shared. That makes this component the confidentiality boundary, and until now it was
// exported nowhere and tested nowhere: every other client-side check in this build tests the
// individual PAGES, not the screen that does the filtering.
//
// The method is the one that has caught real leaks here before: plant content that must never
// appear, render, and search the output for it. A test that only asserts the shared item IS shown
// would pass just as happily on a component that showed everything.
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderClientView } from './deepdive-clientview-harness.mjs';

test('nothing internal reaches the client, and what is shared does', async () => {
  const { text, html } = await renderClientView();
  // ── the half that matters: these were never marked Shared ──
  for (const secret of [
    'INTERNAL-PROCESS-NAME', 'INTERNAL-QUESTION-TEXT', 'INTERNAL-EVIDENCE-ITEM',
    'INTERNAL-SESSION-PERSON', 'INTERNAL-NOTE-BODY',
  ]) {
    assert.ok(!text.includes(secret), `${secret} reached the client view`);
    assert.ok(!html.includes(secret), `${secret} reached the client view's markup`);
  }
  // ── and the half that proves the screen is actually rendering something ──
  // Without this, a component that rendered NOTHING would pass every assertion above.
  assert.ok(text.includes('SHARED-PROCESS-NAME'), 'the shared process did not render, so the test above proves nothing');
  assert.ok(text.includes('SHARED-QUESTION-TEXT'), 'the shared question did not render');
});

// ── the screen has to be a document ────────────────────────────────────────────────────────────
// Every internal tab gets an h1 from TabHead, and the empty state renders one itself, but the
// client view opened straight onto the journey strip's h2. So the ONE SCREEN A CLIENT EVER SEES was
// the only screen in the portal with no top-level heading: nothing naming the document, and nothing
// for a reader navigating by headings to land on. A client is exactly the reader most likely to
// arrive on this page cold, with no idea what they are looking at.
test('the client view has exactly one top-level heading', async () => {
  const { html, text } = await renderClientView();
  const h1s = [...html.matchAll(/<h1[\s>]/g)].length;
  assert.equal(h1s, 1,
    `the client view renders ${h1s} h1 elements. One names the record; none leaves the screen `
    + `without a title; more than one is two competing titles.\n${text.slice(0, 160)}`);

  // ⚠ And it has to come FIRST. An h1 below the journey strip's h2 is a document that starts at
  // level two and then jumps backwards, which is the same problem wearing the right tag.
  const firstHeading = (html.match(/<h([1-6])[\s>]/) || [])[1];
  assert.equal(firstHeading, '1',
    `the first heading on the client view is an h${firstHeading}, so the page still opens below its own title`);
});
