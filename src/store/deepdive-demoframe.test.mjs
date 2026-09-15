// The one iframe in the portal, and who is allowed inside it.
//
// A build can carry a demo link, and the page frames it so somebody can press the thing rather than
// read about it. The frame is sandboxed `allow-scripts allow-same-origin`, and that PAIR is only a
// sandbox while the framed document is a different origin. Pointed at our own origin it is not a
// sandbox at all: the framed page runs scripts with our origin's storage, our session, and a live
// handle on the parent document.
//
// ⚠ THE GUARD THAT WAS SUPPOSED TO PREVENT THIS CHECKED THE WRONG THING. `safeLink` enforces http
// or https and never looks at the host, and the note beside the frame claimed that was what "keeps
// it a stranger". It is not: https://<this very host>/ is https and is not a stranger. It does not
// take an attacker either, only somebody pasting a link to the record itself as the demo.
//
// So the test is about the origin, and it needs BOTH halves: that a same-origin link is refused the
// frame, and that an ordinary external demo is still framed. Without the second half, a component
// that framed nothing at all would pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runInDom, ROOT } from './deepdive-dom-harness.mjs';

const ENTRY = (demoLink) => `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import BuildPage from '${join(ROOT, 'src/store/BuildPage.jsx')}';

export async function run() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  const item = { id: 'b:aaaaaaa1', name: 'A thing', demoLink: ${JSON.stringify(demoLink)},
    demoKind: 'prototype', state: 'considering', processes: [], unknowns: [], pillars: [] };
  const plan = { BUILDS: [item], PROCESSES: [], QUESTIONS: [], OUTCOMES: [] };
  flushSync(() => {
    root.render(React.createElement(BuildPage, {
      slug: 'probe', item, plan, log: [], files: [], staff: true,
      canAuthor: { can: true }, busy: false,
      onEdit: () => {}, onSaveField: async () => true, onAttach: async () => {}, onDetach: async () => {},
    }));
  });
  const frame = el.querySelector('iframe');
  const links = [...el.querySelectorAll('a')].map((a) => a.getAttribute('href'));
  const out = {
    framed: !!frame,
    frameSrc: frame ? frame.getAttribute('src') : null,
    sandbox: frame ? frame.getAttribute('sandbox') : null,
    linkedAnywhere: links.includes(${JSON.stringify(demoLink)}),
    text: (el.textContent || '').replace(/\\s+/g, ' ').trim(),
  };
  root.unmount();
  el.remove();
  return out;
}
`;

// happy-dom serves the page from http://localhost/, so this is our own origin.
const SAME_ORIGIN = 'http://localhost/deepdive/probe/build/b:aaaaaaa1';
const STRANGER = 'https://example.com/demo';

test('an ordinary demo is framed, sandboxed', async () => {
  // ⚠ The positive half, and it is load-bearing: it is what stops "nothing is ever framed" from
  // counting as a pass on the test below.
  const out = await runInDom(ENTRY(STRANGER), 'ddframe-ok');
  assert.ok(out.framed, `an external demo was not framed at all, so the negative test proves nothing:\n${out.text}`);
  assert.equal(out.frameSrc, STRANGER, 'the frame is pointed somewhere other than the demo link');
  assert.match(out.sandbox || '', /allow-scripts/,
    'the demo frame is no longer sandboxed, which changes what the origin check below is protecting');
});

test('a demo pointing at the portal itself is never framed', async () => {
  const out = await runInDom(ENTRY(SAME_ORIGIN), 'ddframe-same');
  assert.equal(out.framed, false,
    'a same-origin demo was framed under `allow-scripts allow-same-origin`, which hands the framed '
    + 'page this origin\'s storage and session: the sandbox is not a sandbox against ourselves');
  // And it must not silently vanish: a link the record holds is still shown, just not embedded.
  assert.ok(out.linkedAnywhere,
    `the demo link was dropped from the page entirely rather than offered as a link:\n${out.text}`);
  assert.ok(!/no link to it/i.test(out.text),
    `the page claims it holds no link while holding one:\n${out.text}`);
});
