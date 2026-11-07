// GRE-4303: the full interview privacy notice at #privacy/interviews (/privacy/interviews on the Next site), the page
// the short notice's "Read the full interview privacy notice" link opens. Proves the route renders, publicly, and that
// its words are the "Full version" section of the `privacy-notice` document on GRE-2639, revision 5.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { OPS } from '../../../netlify/functions/lib/interview/portal-ops.mjs';
import { FULL_NOTICE_HREF } from '../interview-notice.mjs';
import { C9_CONFIRMED, FULL_NOTICE_MARKDOWN, FULL_NOTICE_REVISION } from '../interview-notice-full.mjs';
import { interviewHashOf, interviewPathOf, parseInterviewHash } from './route.mjs';

// The section as copied from revision 5 (document revision 4df9059f, 7 Nov 2026), from "### Who is responsible" to the
// end of "Your rights". Its hash is pinned, so the copy cannot drift from the document unnoticed.
const REV5 = readFileSync(new URL('../interview-notice-full.rev5.md', import.meta.url), 'utf8');
const REV5_SHA256 = '4abd3c0695773b5c86ded252c9d447b830b1435e5e3aaa0efb511ac5b78c4553';

let vite;
let PrivacyNoticeScreen;
let InterviewApp;
let WelcomeScreen;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  ({ PrivacyNoticeScreen } = await vite.ssrLoadModule('/src/portal/interview/InterviewPrivacyNotice.jsx'));
  ({ default: InterviewApp } = await vite.ssrLoadModule('/src/portal/interview/InterviewApp.jsx'));
  ({ WelcomeScreen } = await vite.ssrLoadModule('/src/portal/interview/InterviewHome.jsx'));
});
after(async () => { await vite?.close(); });

// Inline tags (strong, a) join their words; any other tag is a break between words.
const text = (html) => html.replace(/<\/?(?:strong|a)\b[^>]*>/g, '').replace(/<[^>]+>/g, ' ')
  .replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
// The words of the markdown, without its marks: what a reader sees.
const words = (md) => md.replace(/^### /gm, '').replace(/^ *- /gm, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
const ROUND = { clientName: 'Acme Ltd', retentionDays: 90, readoutDate: '2026-11-20', deletionDate: '2027-02-18' };
const C9_LINE = ' [Client name] is not told who took part, who declined or who deleted their data.';

test('the notice text is revision 5 of the document, word for word', () => {
  assert.equal(FULL_NOTICE_REVISION, 5);
  assert.equal(createHash('sha256').update(REV5).digest('hex'), REV5_SHA256);
  assert.equal(FULL_NOTICE_MARKDOWN, REV5);
});

test('#privacy/interviews is the full notice route, in hash and path mode', () => {
  assert.equal(FULL_NOTICE_HREF, '#privacy/interviews');
  assert.deepEqual(parseInterviewHash(FULL_NOTICE_HREF), { view: 'privacy', query: {} });
  assert.equal(parseInterviewHash('#privacy'), null); // the site's own privacy policy stays a page
  assert.equal(interviewPathOf(FULL_NOTICE_HREF), '/privacy/interviews');
  assert.equal(interviewHashOf('/privacy/interviews', ''), FULL_NOTICE_HREF);
  assert.equal(interviewHashOf('/privacy', ''), null);
});

test('the route renders the full notice without a sign-in, and the rendered words match revision 5', () => {
  const html = renderToStaticMarkup(React.createElement(InterviewApp,
    { route: parseInterviewHash(FULL_NOTICE_HREF), hash: FULL_NOTICE_HREF }));
  assert.doesNotMatch(html, /Checking your account/); // not behind the signed-in gate
  const shown = text(html);
  assert.match(shown, /^Parallel Discovery Agent Interview privacy notice Who is responsible /);
  let expected = REV5;
  if (!C9_CONFIRMED) expected = expected.replace(C9_LINE, '');
  expected = words(expected
    .replace(' [Client data protection contact, if the client gives one.]', '')
    .replace(' (planned for [readout date], so by [deletion date])', '')
    .replaceAll('[90]', '90')
    .replace(/(^|\n|\. |\*\*)\[Client name\]/g, '$1Your organisation')
    .replaceAll('[Client name]', 'your organisation'));
  assert.ok(shown.includes(expected), 'the whole section is on the page, in order');
  assert.doesNotMatch(shown, /\[[^\]]+\]/, 'no [bracketed] word is left on the page');
});

test('a signed-in invitee sees their round: client name, retention days and both dates', () => {
  const shown = text(renderToStaticMarkup(React.createElement(PrivacyNoticeScreen, { round: ROUND })));
  let expected = REV5;
  if (!C9_CONFIRMED) expected = expected.replace(C9_LINE, '');
  expected = words(expected
    .replace(' [Client data protection contact, if the client gives one.]', '')
    .replace('[readout date]', '20 November 2026').replace('[deletion date]', '18 February 2027')
    .replaceAll('[90]', '90').replaceAll('[Client name]', 'Acme Ltd'));
  assert.ok(shown.includes(expected));
  assert.match(shown, /90 days after we present the findings to Acme Ltd \(planned for 20 November 2026, so by 18 February 2027\)/);
});

test('C9 is held back until confirmed, as the document says', () => {
  const shown = text(renderToStaticMarkup(React.createElement(PrivacyNoticeScreen, { round: ROUND })));
  assert.equal(/is not told who took part/.test(shown), C9_CONFIRMED);
});

test('the welcome screen link opens the full notice', () => {
  const html = renderToStaticMarkup(React.createElement(WelcomeScreen,
    { isAdmin: false, seats: null, consent: null, clientName: 'Acme Ltd', retentionDays: 90, deletionDate: null }));
  assert.match(html, /<a href="#privacy\/interviews">Read the full interview privacy notice<\/a>/);
});

test('notice-page op: the round values for an invitee, nothing without a round, and no redirect', async () => {
  const engagement = { client_name: 'Acme Ltd', retention_days: 60, readout_at: '2026-11-20T10:00:00.000Z', closed_at: null };
  assert.deepEqual(await OPS['notice-page']({ ctx: { employee: { status: 'started' }, engagement } }),
    { clientName: 'Acme Ltd', retentionDays: 60, readoutDate: '2026-11-20', deletionDate: '2027-01-19' });
  assert.deepEqual(await OPS['notice-page']({ ctx: null }), { clientName: null });
  const noReadout = await OPS['notice-page']({ ctx: { employee: {}, engagement: { client_name: 'Acme Ltd' } } });
  assert.equal(noReadout.readoutDate, null);
  assert.equal(noReadout.deletionDate, null);
  assert.equal(noReadout.retentionDays, 90);
});
