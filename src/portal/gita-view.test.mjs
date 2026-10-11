// The GITA in the portal reader (GRE-1257): evidence markers, reading order, demos, PDF button and the Agree in
// principle panel, rendered for real under happy-dom. Made-up data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { Window } from 'happy-dom';
import { runInDom, ROOT } from '../store/deepdive-dom-harness.mjs';
import { markEvidence } from './gita-view.mjs';

function withDom(fn) {
  const win = new Window();
  const had = Object.getOwnPropertyDescriptor(globalThis, 'DOMParser');
  globalThis.DOMParser = win.DOMParser;
  try { return fn(); } finally { if (had) Object.defineProperty(globalThis, 'DOMParser', had); else delete globalThis.DOMParser; win.close(); }
}

test('markers: the reader tags Known, Indicated and To validate and drops the typed marker', () => withDom(() => {
  const out = markEvidence('<p>Known: six sites.</p><ul><li>Indicated – orders by email</li><li>Plain item</li></ul><p><strong>To validate:</strong> volumes</p>');
  assert.match(out, /<p class="pt-ev pt-ev-known"><span class="pt-ev-tag">Known<span class="gs-sr-only">: <\/span><\/span>six sites\.<\/p>/);
  assert.match(out, /<li class="pt-ev pt-ev-indicated"><span class="pt-ev-tag">Indicated<span class="gs-sr-only">: <\/span><\/span>orders by email<\/li>/);
  assert.match(out, /<li>Plain item<\/li>/);
  // the bold wrapper the author put round the marker is gone, not left empty
  assert.match(out, /<p class="pt-ev pt-ev-to-validate"><span class="pt-ev-tag">To validate<span class="gs-sr-only">: <\/span><\/span> ?volumes<\/p>/);
  assert.doesNotMatch(out, /<strong><\/strong>/);
}));

test('markers: the author cannot style the content; their classes are dropped, the text stays', () => withDom(() => {
  const out = markEvidence('<p class="pt-ev-known gs-btn">Known risks are listed.</p><p><span class="x">Indicated</span>: partly <em>bold</em></p>');
  assert.match(out, /<p>Known risks are listed\.<\/p>/);
  assert.match(out, /<p class="pt-ev pt-ev-indicated"><span class="pt-ev-tag">Indicated.*<\/span>partly <em>bold<\/em><\/p>/);
  assert.doesNotMatch(out, /gs-btn|class="x"/);
}));

test('markers: no DOM, the html comes back unchanged', () => {
  assert.equal(markEvidence('<p>Known: x</p>'), '<p>Known: x</p>');
  assert.equal(markEvidence(''), '');
});

const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import DocumentView from '${join(ROOT, 'src/portal/DocumentView.jsx')}';
import ActionPanel from '${join(ROOT, 'src/portal/ActionPanel.jsx')}';

const GITA = {
  id: 'd0000000-0000-4000-8000-0000000000a1', kind: 'gita', version: 1, title: 'Test GITA for Client A', summary: 'Made up.',
  action: 'agree_in_principle', confirmation_text: 'Made-up agree sentence.', content_sha256: 'ab'.repeat(32),
  pdf_path: 'c/d/x.pdf',
  body: { sections: [
    { id: 'cp', title: 'Commercial Perspective', html: '<p>Made-up options.</p>' },
    { id: 's1', title: 'Where you are', html: '<p>Known: three made-up sites.</p><p>To validate: made-up volumes.</p>' },
    { id: 's2', title: 'What we propose', html: '<p>Indicated: a made-up change.</p>' },
  ] },
  demos: [
    { label: 'Demo A', url: 'https://demo.example.test/a', afterSection: 's1', note: 'made up' },
    { label: 'Not https', url: 'http://demo.example.test/b', afterSection: 's1' },
    { label: 'Demo C', url: 'https://demo.example.test/c' },
  ],
};

function mount(node) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  flushSync(() => root.render(node));
  return { el, done: () => { root.unmount(); el.remove(); } };
}

export async function run() {
  const out = {};
  let pdfCalls = 0;
  const a = mount(React.createElement(DocumentView, { doc: GITA, onDownloadPdf: async () => { pdfCalls += 1; } },
    React.createElement(ActionPanel, { doc: GITA, company: 'Client A (made up)', email: 'p@client-a.example.test', state: 'eligible', onSubmit: async () => null })));
  out.secs = [...a.el.querySelectorAll('.pt-sec h2')].map((h) => h.textContent);
  out.toc = [...a.el.querySelectorAll('.pt-toc a')].map((x) => x.textContent);
  const s1 = a.el.querySelectorAll('.pt-sec')[0];
  out.s1Demos = [...s1.querySelectorAll('.pt-demos a')].map((x) => [x.textContent, x.getAttribute('target'), x.getAttribute('rel')]);
  out.endDemos = [...a.el.querySelectorAll('.pt-doc-body > .pt-demos a')].map((x) => x.textContent);
  out.marks = [...a.el.querySelectorAll('.pt-ev')].map((p) => p.className);
  out.lastSecBeforePanel = !!a.el.querySelector('.pt-sec:last-of-type + .pt-demos + form.pt-panel, .pt-sec:last-of-type ~ form.pt-panel');
  out.button = a.el.querySelector('form.pt-panel button[type=submit]').textContent;
  out.next = (a.el.querySelector('.pt-next') || {}).textContent || '';
  const pdf = [...a.el.querySelectorAll('.pt-pdf button')];
  out.pdfButtons = pdf.length;
  if (pdf[0]) { flushSync(() => pdf[0].click()); await new Promise((r) => setTimeout(r, 0)); }
  out.pdfCalls = pdfCalls;
  a.done();

  const b = mount(React.createElement(DocumentView, { doc: { ...GITA, pdf_path: null }, onDownloadPdf: async () => {} }));
  out.pdfWithoutFile = b.el.querySelectorAll('.pt-pdf').length;
  b.done();

  const c = mount(React.createElement(ActionPanel, { doc: GITA, company: 'Client A (made up)', email: 'p@client-a.example.test', state: 'done',
    acceptance: { id: 'a0000000-0000-4000-8000-000000000001', signer_name: 'Test Person', accepted_at: '2026-10-11T09:00:00Z' }, job: { status: 'sent' } }));
  out.doneHead = c.el.querySelector('.pt-panel-done h2').textContent;
  out.doneNext = (c.el.querySelector('.pt-next') || {}).textContent || '';
  out.doneReceipt = c.el.querySelector('a[href^="#portal/receipt/"]') ? 'yes' : 'no';
  c.done();
  return out;
}
`;

test('GITA reader: pack order with the Commercial Perspective last, demos placed, markers styled, panel at the end', async () => {
  const out = await runInDom(ENTRY, 'gitaprobe');
  assert.deepEqual(out.secs, ['Where you are', 'What we propose', 'Commercial Perspective']);
  assert.deepEqual(out.toc, out.secs);
  assert.deepEqual(out.s1Demos, [['Demo A (opens in a new tab) ↗', '_blank', 'noopener noreferrer']]);
  assert.deepEqual(out.endDemos, ['Demo C (opens in a new tab) ↗']);
  assert.deepEqual(out.marks, ['pt-ev pt-ev-known', 'pt-ev pt-ev-to-validate', 'pt-ev pt-ev-indicated']);
  assert.ok(out.lastSecBeforePanel, 'the action panel comes after the last section');
  assert.equal(out.button, 'Agree in principle');
  assert.match(out.next, /We will contact you about next steps/);
  assert.equal(out.pdfButtons, 1);
  assert.equal(out.pdfCalls, 1);
  assert.equal(out.pdfWithoutFile, 0);
});

test('after agreeing: the receipt summary, the receipt link and what happens next', async () => {
  const out = await runInDom(ENTRY, 'gitaprobe');
  assert.match(out.doneHead, /Agreed in principle by Test Person on 11 Oct 2026/);
  assert.equal(out.doneReceipt, 'yes');
  assert.match(out.doneNext, /We will contact you about next steps/);
});
