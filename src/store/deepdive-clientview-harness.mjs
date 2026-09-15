// Mounts ClientView in a DOM stand-in and hands back what it rendered.
//
// Kept beside the leak test rather than inside it so the test reads as the question it asks. The
// DOM machinery is shared with the portal-bar probe: see deepdive-dom-harness.mjs.
import { runInDom, ROOT } from './deepdive-dom-harness.mjs';
import { join } from 'node:path';

const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import * as S from '${join(ROOT, 'src/data/deepdive-schema.mjs')}';
import { __panels } from '${join(ROOT, 'src/store/DeepDivePortal.jsx')}';

export function run() {
  let plan = S.normalisePlan({ engagement: { slug: 'probe', client: 'Probe', title: 'T',
    stage: 'Greatstone Deep Dive', access: 'Commitment in principle' } });
  const add = (kind, fields, id) => { plan = S.applyOp(plan, { type: 'add', kind, fields }, id); };

  // One of each kind the client view filters, in both states. The internal ones carry text that
  // exists nowhere else, so finding it in the output can only mean it leaked.
  add('process', { num: '01', name: 'SHARED-PROCESS-NAME', howToday: 'By hand' }, 'p:shared001');
  add('process', { num: '02', name: 'INTERNAL-PROCESS-NAME', howToday: 'INTERNAL-NOTE-BODY' }, 'p:intern001');
  add('question', { pillar: 'Data', q: 'SHARED-QUESTION-TEXT' }, 'q:shared001');
  add('question', { pillar: 'Data', q: 'INTERNAL-QUESTION-TEXT' }, 'q:intern001');
  add('evidence', { item: 'INTERNAL-EVIDENCE-ITEM', state: 'missing' }, 'e:intern001');
  add('session', { person: 'INTERNAL-SESSION-PERSON', only: 'INTERNAL-NOTE-BODY' }, 's:intern001');

  // Only the two SHARED ids are marked shared. Everything else is Internal by default, which is
  // the rule this whole portal is built on.
  const map = {
    'p:shared001': { status: 'done', visibility: 'shared' },
    'q:shared001': { status: 'done', visibility: 'shared' },
  };

  const el = document.createElement('div');
  document.body.appendChild(el);
  let err = null;
  const root = createRoot(el);
  try {
    flushSync(() => root.render(React.createElement(__panels.ClientView,
      { eng: plan.engagement, plan, map })));
  } catch (e) { err = String(e && e.message); }
  const out = { text: el.textContent || '', html: el.innerHTML || '', err };
  root.unmount();
  return out;
}
`;

export async function renderClientView() {
  const out = await runInDom(ENTRY, 'ddclient');
  if (out.err) throw new Error(`ClientView threw while rendering: ${out.err}`);
  return out;
}
