import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInterviewHash, interviewHref, safeRedirect, INTERVIEW_BASE } from './route.mjs';
import { parsePortalHash } from '../portal-model.mjs';

test('#portal/interview and its sub-pages route to the interview', () => {
  assert.deepEqual(parseInterviewHash('#portal/interview'), { view: 'home', query: {} });
  assert.deepEqual(parseInterviewHash('#/portal/interview/'), { view: 'home', query: {} });
  for (const v of ['session', 'complete', 'goodbye', 'discarded']) {
    assert.deepEqual(parseInterviewHash(`#portal/interview/${v}`), { view: v, query: {} });
    assert.deepEqual(parseInterviewHash(`#portal/interview/${v}/`), { view: v, query: {} });
  }
  assert.equal(parseInterviewHash('#PORTAL/Interview/Session').view, 'session');
});

test('results takes an optional engagement id', () => {
  assert.deepEqual(parseInterviewHash('#portal/interview/results'), { view: 'results', query: {}, engagementId: null });
  const id = '3f2b8c1e-0d4a-4b7e-9c11-2a5e6f7a8b9c';
  assert.deepEqual(parseInterviewHash(`#portal/interview/results/${id}`), { view: 'results', query: {}, engagementId: id });
  assert.equal(parseInterviewHash(`#portal/interview/results/${id}/extra`).view, 'notfound');
});

test('the source searchParams ride on the hash', () => {
  assert.deepEqual(parseInterviewHash('#portal/interview?seats=exhausted'), { view: 'home', query: { seats: 'exhausted' } });
  assert.deepEqual(parseInterviewHash('#portal/interview?consent=required').query, { consent: 'required' });
});

test('#join/<token> with an optional ?team=', () => {
  assert.deepEqual(parseInterviewHash('#join/abc_DEF-123'), { view: 'join', token: 'abc_DEF-123', unitId: null, query: {} });
  assert.deepEqual(parseInterviewHash('#/join/tok?team=u-1'), { view: 'join', token: 'tok', unitId: 'u-1', query: { team: 'u-1' } });
  assert.equal(parseInterviewHash('#join/'), null);
  assert.equal(parseInterviewHash('#join/a/b'), null);
});

test('unknown pages under #portal/interview are not-found, never the portal', () => {
  assert.equal(parseInterviewHash('#portal/interview/nope').view, 'notfound');
  assert.equal(parseInterviewHash('#portal/interview/session/x').view, 'notfound');
});

test('other hashes are not interview routes', () => {
  for (const h of ['', '#', '#portal', '#portal/', '#portal/doc/x', '#portal/deep-dive', '#portal/interviews', '#account', '#interview', null, undefined]) {
    assert.equal(parseInterviewHash(h), null, String(h));
  }
});

test('App order: the interview claims #portal/interview before the portal does', () => {
  // parsePortalHash alone would treat it as a portal not-found; App checks parseInterviewHash first.
  assert.deepEqual(parsePortalHash('#portal/interview'), { view: 'notfound' });
  const readPortal = (h) => (parseInterviewHash(h) ? null : parsePortalHash(h));
  assert.equal(readPortal('#portal/interview/session'), null);
  assert.deepEqual(readPortal('#portal'), { view: 'home' });
  assert.deepEqual(readPortal('#portal/deep-dive'), { view: 'deep-dive' });
});

test('interviewHref builds the hashes the pages navigate to', () => {
  assert.equal(interviewHref(), INTERVIEW_BASE);
  assert.equal(interviewHref('complete'), '#portal/interview/complete');
  assert.equal(interviewHref('home', { seats: 'exhausted' }), '#portal/interview?seats=exhausted');
  for (const v of ['home', 'session', 'complete', 'goodbye', 'discarded']) {
    assert.equal(parseInterviewHash(interviewHref(v)).view, v);
  }
});

test('safeRedirect only follows interview and portal hashes', () => {
  assert.equal(safeRedirect('#portal/interview/session'), '#portal/interview/session');
  assert.equal(safeRedirect('#portal/interview?seats=exhausted'), '#portal/interview?seats=exhausted');
  assert.equal(safeRedirect('#portal'), '#portal');
  for (const bad of ['https://evil.example', '/interview/session', 'javascript:alert(1)', '#account', '', null, undefined]) {
    assert.equal(safeRedirect(bad), null, String(bad));
  }
});
