// Answering a question in a live sitting, when one of the writes fails.
//
// This is the screen a practitioner works from while somebody is talking, and the single most
// valuable thing the record collects is what that person just said. Saving one answer is THREE
// writes: the line appended to the question's note, a finding minted with this sitting's id, and
// the question marked done. The first one is the one that holds the words.
//
// The failure worth testing is the partial one. If the note saves and a later write does not, the
// answer IS on the record, the box still holds the text, and the practitioner presses save again,
// which is the right instinct. By then the plan has refreshed, so the question's note already
// contains that line, and appending it a second time writes the same words twice into the record.
// The old code did exactly that, and told them "It could not be saved" for a failure that happened
// after their words were safe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runInDom, ROOT } from './deepdive-dom-harness.mjs';

const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import * as S from '${join(ROOT, 'src/data/deepdive-schema.mjs')}';
import SessionRun from '${join(ROOT, 'src/store/SessionRun.jsx')}';

export async function run() {
  let plan = S.normalisePlan({ engagement: { slug: 'probe', client: 'Probe', title: 'T',
    stage: 'Greatstone Deep Dive', access: 'Commitment in principle' } });
  const add = (kind, fields, id) => { plan = S.applyOp(plan, { type: 'add', kind, fields }, id); };
  add('question', { pillar: 'Data', q: 'Who checks the returns?' }, 'q:aaaaaaa1');
  add('session', { name: 'The sitting', ref: 'S1', person: 'Ama', covers: ['q:aaaaaaa1'] }, 's:aaaaaaa1');

  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);

  const calls = { saves: [], records: 0, statuses: 0 };
  // The record as the portal would keep it: a save updates the stored question, so a re-render
  // hands the component the NEW note, exactly as the real plan state does.
  const store = { note: '' };
  let failAfterNote = true;

  const props = () => ({
    slug: 'probe',
    session: S.findItem(plan, 's:aaaaaaa1').item,
    plan: {
      ...plan,
      QUESTIONS: plan.QUESTIONS.map((g) => ({ ...g,
        items: g.items.map((q) => (q.id === 'q:aaaaaaa1' ? { ...q, note: store.note } : q)) })),
    },
    map: {}, busy: false, canAuthor: { can: true },
    onSaveRecord: async (item, kind, fields) => {
      if (fields.note !== undefined) { calls.saves.push(fields.note); store.note = fields.note; }
      return true;
    },
    onSaveField: async () => true,
    onRecord: async () => {
      calls.records += 1;
      if (failAfterNote) throw new Error('the network dropped');
      return true;
    },
    onStatus: async () => { calls.statuses += 1; return true; },
    onAddQuestion: async () => 'q:new00001',
    onDone: () => {},
  });

  // ⚠ flushSync, not act(). This repo's render test already mounts SessionRun this way and exits;
  // going through React's act scheduler left the process alive after the assertions passed, which
  // is the zombie-test shape this suite has been bitten by before (a mounted session clock pinning
  // node forever). A drained microtask queue is enough to see a two-await handler through.
  // ⚠ A MACROTASK, not just drained microtasks. A setState from inside an async catch lands in a
  // later task, so twelve awaited promises saw the handler finish and the DOM not yet updated: the
  // error was set and the assertion read the screen before React painted it.
  const settle = async () => {
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
  };
  const render = async () => { flushSync(() => { root.render(React.createElement(SessionRun, props())); }); await settle(); };
  await render();

  const type = async (text) => {
    const ta = el.querySelector('textarea');
    if (!ta) throw new Error('no capture box on screen');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    flushSync(() => {
      setter.call(ta, text);
      ta.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    await settle();
  };
  const save = async () => {
    const btn = [...el.querySelectorAll('button')].find((b) => /save|record|answer/i.test(b.textContent || ''));
    if (!btn) throw new Error('no save control on screen');
    btn.click();
    await settle();
  };

  // 1. type an answer and save it: the note write lands, the finding write fails
  await type('She checks them every Friday.');
  await save();
  const afterFirst = { note: store.note, err: (el.textContent || '').includes('saved on the question'),
    textStillThere: (el.querySelector('textarea') || {}).value };

  // 2. the practitioner presses save again, as anybody would
  await render();
  await save();

  const out = {
    saves: calls.saves,
    noteAfterRetry: store.note,
    occurrences: (store.note.match(/She checks them every Friday\\./g) || []).length,
    afterFirst,
    records: calls.records,
  };
  root.unmount();
  el.remove();
  return out;
}
`;

test('a retry after a partial failure does not write the answer twice', async () => {
  const out = await runInDom(ENTRY, 'ddrun');

  // The harness has to have actually reached the capture box, or everything below is vacuous.
  assert.ok(out.saves.length >= 1,
    'no note was ever written, so this test never reached the thing it is about');
  assert.ok(out.records >= 2, `the finding write was attempted ${out.records} times, expected a retry`);

  assert.equal(out.occurrences, 1,
    `the answer appears ${out.occurrences} times in the question's note after one retry:\n${out.noteAfterRetry}`);
});

test('a failure after the words are safe says so', async () => {
  const out = await runInDom(ENTRY, 'ddrun2');
  assert.ok(out.afterFirst.note.includes('She checks them every Friday.'),
    'the answer never reached the note at all');
  assert.ok(out.afterFirst.err,
    'the practitioner was told the answer could not be saved, when it had been: the message must distinguish a write that failed after the words were on the record');
  assert.ok(out.afterFirst.textStillThere,
    'the typed answer was cleared from the box on a failure, which is how words said in a room get lost');
});
