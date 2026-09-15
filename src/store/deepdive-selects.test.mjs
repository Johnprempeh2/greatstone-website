// ⚠ A SELECT CANNOT SHOW A VALUE THAT IS NOT IN ITS LIST.
// The browser falls back to the FIRST option, so a stored value the list does not contain reads as
// whatever that first option says — "Not assigned", "Nothing, this was asked on its own" — while the
// form state still holds it and submits it straight back. Nothing errors. The screen simply says
// something untrue about the record.
//
// It has now happened five times in this build: legacy free text blanked by a closed vocabulary
// (three times, which is why `cadence` and friends keep "in their words"), `question.from` pointing
// at a reworded question, and `unitId` / `reportsTo` pointing at a removed unit or person. Removal
// does not cascade — verified — so dangling references are the normal case, not the exotic one.
//
// So: every select bound to a REFERENCE (an id) must render the stored value even when it is gone.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('./RecordDrawer.jsx', import.meta.url), 'utf8');

/** Selects whose value is an id pointing at another item, and can therefore dangle. A vocabulary
 *  select cannot: `oneOf` refuses an unknown value on write, so the stored one is always in the
 *  list. */
const REFERENCE_SELECTS = ['unitId', 'leadId', 'parent', 'personId', 'reportsTo', 'from'];

test('every reference select can still show a value that has been removed', () => {
  // the pickers render the guard once and are reused; a bare <select value={f.x}> must carry it
  const guarded = [];
  for (const m of src.matchAll(/<Dangling\b/g)) guarded.push(m.index);
  assert.ok(guarded.length >= 3, `only ${guarded.length} dangling guards — the scanner has gone blind`);

  const bare = [];
  for (const m of src.matchAll(/<select value=\{f\.([A-Za-z]+)[^>]*>([\s\S]{0,600}?)<\/select>/g)) {
    const [, field, body] = m;
    if (!REFERENCE_SELECTS.includes(field)) continue;
    if (!/<Dangling\b/.test(body)) bare.push(field);
  }
  assert.deepEqual(bare, [],
    'these selects hold an id and would show the FIRST option when it has been removed, while '
    + 'silently resubmitting the dead value — add <Dangling value=… known=… />');
});

test('the pickers that take a value as a prop carry the guard', () => {
  // UnitPicker and PersonPicker are used for most references, so the guard lives in them once.
  for (const picker of ['UnitPicker', 'PersonPicker']) {
    const at = src.indexOf(`const ${picker} =`);
    assert.ok(at > 0, `${picker} is gone — this test needs re-pointing`);
    const end = src.indexOf('\n};', at);
    assert.match(src.slice(at, end), /<Dangling\b/,
      `${picker} would show its first option for a value that has been removed`);
  }
});
