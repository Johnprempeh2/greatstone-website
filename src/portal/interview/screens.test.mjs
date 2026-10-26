// GRE-2687: the interview welcome and sign-off screens, rendered as the browser gets them (Vite SSR), and the ops
// behind them. Proves the deletion date is on screen before "I agree to take part", and claim C5 of the interview
// privacy notice: a quote is shared only if the person agrees (no option pre-selected, no finish without a choice,
// and the choice reaches the consent log as made).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { OPS } from '../../../netlify/functions/lib/interview/portal-ops.mjs';
import { QUOTE_OPTIONS } from '../interview-notice.mjs';

let vite;
let WelcomeScreen;
let SignOffPanel;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  ({ WelcomeScreen } = await vite.ssrLoadModule('/src/portal/interview/InterviewHome.jsx'));
  ({ SignOffPanel } = await vite.ssrLoadModule('/src/portal/interview/SignOffPanel.jsx'));
});
after(async () => { await vite?.close(); });

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const welcome = (props = {}) => renderToStaticMarkup(React.createElement(WelcomeScreen,
  { isAdmin: false, seats: null, consent: null, clientName: 'Acme Ltd', retentionDays: 90, deletionDate: '2027-02-11', ...props }));

test('welcome: the v2 notice, the deletion date and the consent text come before "I agree to take part"', () => {
  const html = welcome();
  const t = text(html);
  const agree = t.indexOf('I agree to take part.');
  assert.ok(agree > 0);
  for (const before of ['Your answers, your data', 'Acme Ltd has asked Greatstone International',
    '90 days after we present the findings (by 11 February 2027)', 'Your answers are deleted by 11 February 2027',
    'Acme Ltd sees themes, not your answers', 'A short quote is shared only if you agree',
    'Read the full interview privacy notice']) {
    const at = t.indexOf(before);
    assert.ok(at >= 0 && at < agree, `"${before}" is on screen before the consent box`);
  }
  assert.match(t, /I agree to take part\. I understand my answers will be kept as text and analysed as described above/);
  assert.match(t, /If you stop, you can delete what you said from your account\./);
  // the claims GRE-2653 took out stay out
  assert.doesNotMatch(t, /Managers see themes and quotes|nothing you said is kept|recorded and stored/i);
  assert.match(html, /<input type="checkbox" name="dataConsent" required=""/);
});

test('welcome: before the readout is booked the notice names the rule, not a date', () => {
  const t = text(welcome({ deletionDate: null, retentionDays: 30 }));
  assert.match(t, /30 days after we present the findings\. After that/);
  assert.doesNotMatch(t, /deleted by/);
});

test('sign-off: three quote radio buttons from QUOTE_OPTIONS, none checked, no finish without a choice (C5)', () => {
  const html = renderToStaticMarkup(React.createElement(SignOffPanel, { sessionId: 's1', initialMemory: false }));
  const radios = html.match(/<input type="radio" name="quotes"[^>]*>/g) ?? [];
  assert.deepEqual(radios.map((r) => /value="([^"]+)"/.exec(r)[1]), QUOTE_OPTIONS.map((o) => o.value));
  assert.ok(radios.every((r) => !/checked/.test(r)), 'no quote option is pre-selected');
  const t = text(html);
  for (const o of QUOTE_OPTIONS) assert.ok(t.includes(o.label) && t.includes(o.help), o.value);
  assert.match(t, /If you leave without choosing, no quotes are used\./);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Confirm and finish<\/button>/, 'finish waits for a choice');

  // a choice this person already confirmed comes back, and only that one
  const again = renderToStaticMarkup(React.createElement(SignOffPanel, { sessionId: 's1', initialQuotes: 'anonymous', initialMemory: false }));
  assert.deepEqual((again.match(/<input type="radio" name="quotes"[^>]*checked[^>]*>/g) ?? []).map((r) => /value="([^"]+)"/.exec(r)[1]),
    ['anonymous']);
  assert.match(again, /Your choice: <strong>Anonymous quotes · no memory kept<\/strong>/);
  assert.doesNotMatch(again, /<button[^>]*disabled=""[^>]*>Confirm and finish/);
});

// ── the ops behind the screens ──────────────────────────────────────────────────────────────────────
// A query-builder stand-in: records every call; reads answer from `rows` by table.
function fakeDb(rows = {}) {
  const calls = [];
  const from = (table) => {
    const q = { table, op: 'select', payload: null };
    calls.push(q);
    const chain = new Proxy({}, {
      get(_, key) {
        if (key === 'then') {
          const data = q.op === 'select' ? (rows[table] ?? []) : null;
          return (resolve) => resolve({ data, error: null });
        }
        return (...args) => {
          if (['insert', 'update', 'delete', 'upsert'].includes(key)) { q.op = key; q.payload = args[0]; }
          return chain;
        };
      },
    });
    return chain;
  };
  return { from, calls };
}
const SID = '00000000-0000-4000-8000-000000000001';
const ctx = (employee = {}, engagement = {}) => ({
  employee: { id: 'emp1', person_id: null, user_id: 'ba-user', customer_id: 'c1', name: 'Pat', email: 'pat@a.test',
    role_title: 'Clerk', portal_role: 'employee', status: 'invited', quote_choice: null, ...employee },
  engagement: { id: 'eng1', client_name: 'Acme Ltd', target_minutes: 25, readout_at: '2026-11-13T10:00:00Z', closed_at: null,
    retention_days: 90, retention_delete_after: null, branding_config: {}, ...engagement },
  orgUnit: null,
});

test('interview-page gives the welcome screen the retention rule and the deletion date', async () => {
  const d = await OPS['interview-page']({ db: fakeDb(), ctx: ctx(), caller: { id: 'ba-user', email: 'pat@a.test' }, args: {}, env: {} });
  assert.deepEqual([d.screen, d.clientName, d.retentionDays, d.deletionDate], ['welcome', 'Acme Ltd', 90, '2027-02-11']);
  const none = await OPS['interview-page']({ db: fakeDb(), ctx: ctx({}, { readout_at: null }), caller: {}, args: {}, env: {} });
  assert.equal(none.deletionDate, null);
});

test('signoff-page never pre-selects a quote option; confirm-signoff refuses without one and logs the one made (C5)', async () => {
  const page = await OPS['signoff-page']({ db: fakeDb({ session: [{ id: SID }] }), ctx: ctx() });
  assert.deepEqual([page.initialQuotes, page.initialMemory], [null, false]);
  const back = await OPS['signoff-page']({ db: fakeDb({ session: [{ id: SID }] }), ctx: ctx({ quote_choice: 'named' }) });
  assert.equal(back.initialQuotes, 'named');

  const log = { error: () => {} };
  for (const quotes of [undefined, null, '', 'anonymised', 'yes']) {
    const db = fakeDb({ session: [{ id: SID, ended_at: 'x' }] });
    const r = await OPS['confirm-signoff']({ db, ctx: ctx(), args: { sessionId: SID, quotes, memory: false }, log });
    assert.equal(r.ok, false, String(quotes));
    assert.equal(db.calls.length, 0, 'nothing is written without a choice');
  }
  const db = fakeDb({ session: [{ id: SID, ended_at: 'x' }] });
  const r = await OPS['confirm-signoff']({ db, ctx: ctx(), args: { sessionId: SID, quotes: 'none', memory: false }, log });
  assert.equal(r.ok, true);
  const consent = db.calls.find((c) => c.table === 'consent_event' && c.op === 'insert').payload;
  assert.deepEqual(consent[0], { employee_id: 'emp1', kind: 'quotes', value: false, choice: 'none' });
  assert.deepEqual(db.calls.find((c) => c.table === 'employee' && c.op === 'update').payload, { quote_choice: 'none' });
  assert.deepEqual(db.calls.find((c) => c.table === 'insight' && c.op === 'update').payload, { attribution_redacted: true });
});
