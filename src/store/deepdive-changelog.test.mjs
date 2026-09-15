// The History is the one surface that has to say the same thing about the same event on every
// screen, and it had no test at all.
//
// ⚠ FIFTY-SIX FIELDS RENDERED AS THEIR OWN VARIABLE NAMES. `sayChange` falls back to splitting
// camelCase, so `stateWhy` printed as "state why changed" and `impactIfUnresolved` as "impact if
// unresolved changed". Whole kinds were missing — every change to a proposed build, a person or a
// unit was logged in developer vocabulary. The file's own header describes exactly this fault as
// the reason it exists, which is what makes it worth a check rather than a comment: the fallback is
// silent, and a label is only ever missed by forgetting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { KINDS, FIELDS, DESCRIPTOR } from '../data/deepdive-schema.mjs';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, 'ChangeLog.jsx'), 'utf8');

const block = (() => {
  const m = src.match(/export const FIELD_WORD = \{([\s\S]*?)\n\};/);
  assert.ok(m, 'FIELD_WORD is gone — this test needs re-pointing');
  return m[1];
})();
const labelled = new Set([...block.matchAll(/(?:^|[\s{,])([A-Za-z_$][\w$]*)\s*:/gm)].map((x) => x[1]));

test('every field a kind owns has English behind it in the History', () => {
  const missing = [];
  for (const kind of KINDS) {
    for (const field of FIELDS[kind]) if (!labelled.has(field)) missing.push(`${kind}.${field}`);
  }
  assert.deepEqual(missing, [],
    'these fields fall through to the camelCase fallback, so the History logs a variable name '
    + `wearing a space instead of something a person would say: ${missing.join(', ')}`);
});

test('the engagement descriptor is covered too', () => {
  // A change to the client, sponsor or stage is logged through the same path.
  const missing = DESCRIPTOR.filter((f) => !labelled.has(f));
  assert.deepEqual(missing, [], `descriptor fields with no label: ${missing.join(', ')}`);
});

// ⚠ THERE WAS A FOURTH CHECK HERE AND IT WAS WRONG, so this is the note rather than the test.
// It flagged any label equal to the camelCase key split on capitals, meaning to catch developer
// vocabulary dressed up as English. It fired on `certainty` and `whyItMatters` -> "why it matters",
// both of which are precisely what a person would say. A check that cannot tell a good label from a
// lazy one produces false positives, and a check people learn to ignore is worse than no check:
// the real guard is the one above, which catches the actual failure of a field having no label at
// all. Whether a label READS well is a judgement, and it stays with the person writing it.

test('the scanner can still see what it checks', () => {
  // Guards against the map being renamed or reformatted into invisibility, which would turn this
  // whole file green while the History went back to printing keys.
  assert.ok(labelled.has('howToday'), 'a known label is missing — the scanner has gone blind');
  assert.ok(labelled.has('fate'), 'fate lost its label');
  assert.ok(labelled.has('vstate'), 'the evidence validation axis lost its label');
});
