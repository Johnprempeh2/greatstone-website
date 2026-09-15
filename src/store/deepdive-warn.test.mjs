// Every item page is rendered from its own branch in DeepDivePortal, and each branch repeats the
// same three lines: the page, the toast, the warning. The SESSION branch was missing the warning —
// one line, in one of six otherwise identical blocks.
//
// It mattered more than a missing line usually does, because the writers on that page do not throw:
// recordFinding and dropFinding catch into `warn`. With nothing rendering `warn`, a failed write is
// completely invisible AND the panel clears the practitioner's text on the way out.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, 'DeepDivePortal.jsx'), 'utf8');

const PAGES = ['ProcessPage', 'QuestionPage', 'EvidencePage', 'SessionPage', 'SourcePage', 'PersonPage'];

// ⚠ A FIXED 1400-CHARACTER WINDOW WAS READING INTO THE NEXT BRANCH.
// The branches sit 28-60 lines apart, so a short one would have found its NEIGHBOUR's `{warn &&}`
// and passed on somebody else's line. The branch ends where the next mount begins.
// ⚠ AND "THE NEXT MOUNT" IS NOT THE END EITHER. SessionPage is the LAST mount in the file, so its
// branch ran to the end and found a `{warn &&}` belonging to the main record view — the test passed
// with the session warning deleted, which is the exact bug it was written for.
// Every branch ends the same way: the item page, the toast, the warning, then the drawer. So the
// drawer is the boundary, and it is a structural marker rather than a guessed distance.
function branchOf(page) {
  const at = src.indexOf(`<${page} `);
  assert.ok(at > 0, `${page} is not mounted — this test needs re-pointing`);
  const drawer = src.indexOf('<RecordDrawer', at);
  assert.ok(drawer > at, `${page}'s branch has no drawer after it — this test needs re-pointing`);
  return src.slice(at, drawer);
}

test('every item page branch renders the failure warning', () => {
  const missing = PAGES.filter((p) => !/\{warn && /.test(branchOf(p)));
  assert.deepEqual(missing, [],
    'these pages render no warning, so a write that fails there fails silently');
});

test('every item page branch renders the toast', () => {
  // No `at > 0 &&` short circuit: an unmounted page used to pass this vacuously.
  const missing = PAGES.filter((p) => !/\{toast && /.test(branchOf(p)));
  assert.deepEqual(missing, [], 'these pages confirm nothing when a write succeeds');
});
