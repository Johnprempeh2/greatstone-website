import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runInDom, ROOT } from '../store/deepdive-dom-harness.mjs';

const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import DeepDiveClient from '${join(ROOT, 'src/portal/DeepDiveClient.jsx')}';

export async function run() {
  const el = document.body.appendChild(document.createElement('div'));
  const root = createRoot(el);
  const released = 'd0000000-0000-4000-8000-000000000322';
  flushSync(() => root.render(React.createElement(DeepDiveClient, {
    company: { name: 'Synthetic client' },
    api: async () => ({ items: [], findings: [], opportunities: [], kpis: [], documentRequests: [],
      deliverables: [{ id: 'snapshot-only', title: 'Not approved in portal', status: 'published' }] }),
    documentApi: async () => [{ id: 'raw-file', kind: 'deliverable', source_id: 'snapshot-only', file_name: 'raw.pdf' }],
    portalApi: async () => ({ data: { documents: [
      { id: released, kind: 'deep_dive', status: 'published', title: 'Synthetic approved report', version: 1, action: 'accept' },
      { id: 'draft', kind: 'deep_dive', status: 'draft', title: 'Unapproved draft' },
    ], acceptances: [] }, error: null }),
  })));
  await new Promise((resolve) => setTimeout(resolve, 30));
  const section = el.querySelector('#dd-deliverables')?.parentElement;
  const out = { text: section?.textContent, links: [...section.querySelectorAll('a')].map((a) => a.getAttribute('href')),
    buttons: section.querySelectorAll('button').length };
  flushSync(() => root.unmount());
  return out;
}`;

test('Deep Dive links only approved portal versions to the shared reader', async () => {
  const view = await runInDom(ENTRY, 'dd-deliverables');
  assert.match(view.text, /Synthetic approved report/);
  assert.doesNotMatch(view.text, /Not approved in portal|Unapproved draft|raw\.pdf/);
  assert.deepEqual(view.links, ['#portal/doc/d0000000-0000-4000-8000-000000000322']);
  assert.equal(view.buttons, 0);
});
