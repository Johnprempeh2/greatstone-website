// The uppercase lead-in splitter. Both directions matter equally: what it must LIFT, and what it
// must LEAVE ALONE. A splitter that eats prose is worse than the blended headings it fixes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitLead, groupByLead } from './deepdive-lead.mjs';

test('the real leads from the record are lifted', () => {
  for (const [s, lead] of [
    ["THE WORK ITSELF. Collect easily, analyse easily, present easily.", 'THE WORK ITSELF'],
    ['THE ECONOMICS. Field output that holds above the margin line.', 'THE ECONOMICS'],
    ['WHAT CLIENTS GET. Each client working their own data.', 'WHAT CLIENTS GET'],
    ['ADDED 8 SEPTEMBER. Growth rather than saving.', 'ADDED 8 SEPTEMBER'],
  ]) {
    const r = splitLead(s);
    assert.equal(r.lead, lead);
    assert.ok(!r.rest.startsWith(lead), 'the lead was left in the body as well');
    assert.ok(r.rest.length > 10, 'the body went missing');
  }
});

test('prose that merely starts loud passes through untouched', () => {
  for (const s of [
    'GCB does not buy ten thousand interviews to see a bank level score.', // acronym, no stop
    'ABSA ASKED AND THE ANSWER WAS NO. One driver among these.',           // 33 chars: a sentence, not a tag
    'OK. Fine.',                                                           // too short to be a category
    'THE WHOLE ITEM IS ONE SHOUTED SENTENCE.',                             // nothing after the stop
    'Reach the market that has never been reached.',                       // ordinary prose
    '',                                                                    // nothing at all
  ]) {
    const r = splitLead(s);
    assert.equal(r.lead, null, `ate prose: ${JSON.stringify(s)} -> ${r.lead}`);
    assert.equal(r.rest, String(s), 'a pass-through must be byte-identical');
  }
});

test('contiguous runs group once; a lead returning later starts a new group, and numbering is global', () => {
  const groups = groupByLead([
    'THE WORK ITSELF. One.', 'THE WORK ITSELF. Two.',
    'THE ECONOMICS. Three.',
    'THE WORK ITSELF. Four.',   // returns later: its own group, never merged backwards
    'No lead at all, just an outcome.',
  ]);
  assert.deepEqual(groups.map((g) => [g.lead, g.items.map((x) => x.n)]), [
    ['THE WORK ITSELF', [1, 2]],
    ['THE ECONOMICS', [3]],
    ['THE WORK ITSELF', [4]],
    [null, [5]],
  ]);
  assert.equal(groups[2].start, 4, 'the returning group lost its global number');
});
