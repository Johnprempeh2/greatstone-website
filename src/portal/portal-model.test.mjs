// Client portal logic (GRE-1256). Made-up data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePortalHash, journeyStage, docState, panelState, waitingForYou, validatePanel, canSubmit, acceptErrorMessage,
  emailOutcome, placeDemos, receiptJobLabel, cleanSections, cleanDemos, signatoryLabel, JOURNEY, FIELD_MAX,
} from './portal-model.mjs';
import { fillWording, confirmationTemplate, ACCEPT_CONFIRMATION, AGREE_CONFIRMATION } from './wording.mjs';

const ID = 'd0000000-0000-4000-8000-0000000000a1';
const ME = 'person.one@client-a.example.test';
const doc = (o = {}) => ({ id: ID, kind: 'engagement_pack', action: 'accept', signatory_email: null, published_at: '2026-10-10T10:00:00Z', ...o });
const acc = (o = {}) => ({ id: 'a1', document_id: ID, action: 'accept', accepted_at: '2026-10-10T19:30:00Z', ...o });

test('routes: home, reader, receipt; anything else under #portal is not found; other hashes are not ours', () => {
  assert.deepEqual(parsePortalHash('#portal'), { view: 'home' });
  assert.deepEqual(parsePortalHash('#portal/deep-dive'), { view: 'deep-dive' });
  assert.deepEqual(parsePortalHash('#portal/agreement'), { view: 'agreement' });
  assert.deepEqual(parsePortalHash('#/portal/'), { view: 'home' });
  assert.deepEqual(parsePortalHash('#portal/doc/' + ID.toUpperCase()), { view: 'doc', id: ID });
  assert.deepEqual(parsePortalHash('#portal/receipt/' + ID), { view: 'receipt', id: ID });
  assert.deepEqual(parsePortalHash('#portal/doc/not-an-id'), { view: 'notfound' });
  assert.deepEqual(parsePortalHash('#portal/discovery'), { view: 'notfound' });
  assert.equal(parsePortalHash('#portals'), null);
  assert.equal(parsePortalHash('#org'), null);
  assert.equal(parsePortalHash(''), null);
});

test('journey: six stages, no GITA-to-GDXP shortcut in the list, stage read from the documents', () => {
  assert.equal(JOURNEY.length, 6);
  assert.ok(JOURNEY.indexOf('Deep Dive') < JOURNEY.indexOf('GDXP') && JOURNEY.indexOf('GITA') < JOURNEY.indexOf('Deep Dive'));
  assert.equal(journeyStage([], []), 0);
  assert.equal(journeyStage([doc()], []), 1);
  const gita = doc({ id: 'g', kind: 'gita', action: 'agree_in_principle' });
  assert.equal(journeyStage([doc(), gita], []), 2);
  assert.equal(journeyStage([doc(), gita], [acc({ document_id: 'g' })]), 3);
  assert.equal(journeyStage([doc({ kind: 'gdxp' })], []), 5);
});

test('document state: to read, accepted on a date, agreed in principle on a date', () => {
  assert.equal(docState(doc(), []).label, 'To read');
  assert.equal(docState(doc(), [acc()]).label, 'Accepted on 10 Oct 2026');
  assert.equal(docState(doc(), [acc({ action: 'agree_in_principle' })]).label, 'Agreed in principle on 10 Oct 2026');
  assert.equal(docState(doc(), [acc({ document_id: 'other' })]).key, 'to_read');
});

test('panel state: eligible, waiting for the named signatory, done, none', () => {
  assert.equal(panelState(doc(), { email: ME }), 'eligible');
  assert.equal(panelState(doc({ signatory_email: 'PERSON.ONE@client-a.example.test' }), { email: ME }), 'eligible');
  assert.equal(panelState(doc({ signatory_email: 'person.two@client-a.example.test' }), { email: ME }), 'waiting_signatory');
  assert.equal(panelState(doc(), { email: ME, acceptances: [acc()] }), 'done');
  assert.equal(panelState(doc({ action: 'none' }), { email: ME }), 'none');
  const members = [{ email: 'person.two@client-a.example.test', full_name: 'Test A Two' }];
  assert.equal(signatoryLabel(doc({ signatory_email: 'person.two@client-a.example.test' }), members), 'Test A Two');
  assert.equal(signatoryLabel(doc({ signatory_email: 'x@client-a.example.test' }), members), 'x@client-a.example.test');
});

test('waiting for you: only what this person may act on, newest first', () => {
  const docs = [
    doc({ id: '1', published_at: '2026-10-01T00:00:00Z' }),
    doc({ id: '2', published_at: '2026-10-05T00:00:00Z' }),
    doc({ id: '3', signatory_email: 'someone.else@client-a.example.test' }),
    doc({ id: '4', action: 'none' }),
    doc({ id: '5' }),
  ];
  const out = waitingForYou(docs, { email: ME, acceptances: [acc({ document_id: '5' })] });
  assert.deepEqual(out.map((d) => d.id), ['2', '1']);
});

test('panel checks: both fields and the tick; the button waits for all three', () => {
  assert.deepEqual(Object.keys(validatePanel({})).sort(), ['confirmed', 'name', 'title']);
  assert.deepEqual(validatePanel({ name: ' Test Person ', title: 'Test Title', confirmed: true }), {});
  assert.match(validatePanel({ name: 'x'.repeat(FIELD_MAX + 1), title: 't', confirmed: true }).name, /200 characters/);
  assert.equal(canSubmit({ name: 'Test Person', title: 'Test Title', confirmed: false }), false);
  assert.equal(canSubmit({ name: '  ', title: 'Test Title', confirmed: true }), false);
  assert.equal(canSubmit({ name: 'Test Person', title: 'Test Title', confirmed: true }), true);
});

test('a refusal or a network failure gives a next step, and says nothing was saved when that is true', () => {
  assert.match(acceptErrorMessage({ message: 'already accepted' }), /already been accepted/);
  assert.match(acceptErrorMessage({ message: 'this document is for its named signatory to accept' }), /named signatory/);
  assert.match(acceptErrorMessage({ message: 'document not found' }), /no longer available/);
  const net = acceptErrorMessage({ message: 'Failed to fetch' }, 'd0000000');
  assert.match(net, /Nothing has been saved/);
  assert.match(net, /Try again/);
  assert.match(net, /dx@greatstonesoftware\.co\.uk with the reference d0000000/);
});

test('email outcome after accepting: sent, on its way, or not sent yet', () => {
  assert.equal(emailOutcome({ status: 'sent', attempts: 1 }), 'sent');
  assert.equal(emailOutcome({ status: 'queued', attempts: 0 }), 'pending');
  assert.equal(emailOutcome(null), 'pending');
  assert.equal(emailOutcome({ status: 'queued', attempts: 1 }), 'failed');
  assert.equal(emailOutcome({ status: 'failed', attempts: 8 }), 'failed');
});

test('demos sit after their section; https only; unknown sections go to the end', () => {
  const sections = [{ id: 's1' }, { id: 's2' }];
  const { after, end } = placeDemos(sections, [
    { label: 'A', url: 'https://demo.example.test/a', afterSection: 's1' },
    { label: 'B', url: 'http://demo.example.test/b', afterSection: 's1' },
    { label: 'C', url: 'javascript:alert(1)' },
    { label: 'D', url: 'https://demo.example.test/d', afterSection: 'gone' },
  ]);
  assert.deepEqual(after.s1.map((d) => d.label), ['A']);
  assert.deepEqual(end.map((d) => d.label), ['D']);
});

test('staff: receipt job labels, section and demo rows', () => {
  assert.equal(receiptJobLabel({ status: 'queued', attempts: 0 }), 'Queued');
  assert.equal(receiptJobLabel({ status: 'queued', attempts: 2 }), 'Retrying (attempt 3 of 8)');
  assert.equal(receiptJobLabel({ status: 'failed', attempts: 8 }), 'Failed after 8 attempts');
  assert.equal(receiptJobLabel({ status: 'sent', attempts: 1 }), 'Sent');
  assert.deepEqual(cleanSections([{ title: 'Scope', html: '<p>x</p>' }, { title: '', html: '' }, { id: 'keep', title: 'B', html: '' }]),
    [{ id: 's1', title: 'Scope', html: '<p>x</p>' }, { id: 'keep', title: 'B', html: '' }]);
  assert.deepEqual(cleanDemos([{ label: 'A', url: 'https://demo.example.test', note: ' n ' }, { label: '', url: '' }]),
    { demos: [{ label: 'A', url: 'https://demo.example.test', note: 'n' }], error: null });
  assert.match(cleanDemos([{ label: 'A', url: 'http://x' }]).error, /https:\/\//);
  assert.match(cleanDemos([{ label: '', url: 'https://x' }]).error, /label/);
});

test('wording: Harbor\'s sentences filled from the document and the account, nothing else changed', () => {
  const s = fillWording(ACCEPT_CONFIRMATION, { title: 'Test pack A', version: 2, company: 'Test Client A' });
  assert.equal(s, 'I have read Test pack A (version 2) and accept it on behalf of Test Client A. I confirm I am authorised to do this, and that the name I typed above is my signature.');
  assert.equal(confirmationTemplate('accept'), ACCEPT_CONFIRMATION);
  assert.equal(confirmationTemplate('agree_in_principle'), AGREE_CONFIRMATION);
  assert.equal(confirmationTemplate('none'), '');
  assert.match(fillWording(AGREE_CONFIRMATION, { title: 'T', version: 1, company: 'C' }), /^On behalf of C, I agree in principle with T \(version 1\)\. .*not a contract/);
  assert.equal(fillWording('{privacy_link}', {}), '{privacy_link}');
});
