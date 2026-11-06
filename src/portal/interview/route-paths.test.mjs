// GRE-4245: route.mjs path mode, as the Next pages use it. Its own file, because path mode is module state and
// route.test.mjs covers the Vite app's hash mode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  enablePathRoutes, interviewPathOf, interviewHashOf, currentHash, hrefFor, goToHash, parseInterviewHash,
  interviewHref, PORTAL_HOME_HASH,
} from './route.mjs';
import { navigate } from './api.mjs';
import { verifyCallbackURL } from './auth-model.mjs';

test('interview and portal hashes map to their Next paths, query kept', () => {
  assert.equal(interviewPathOf('#portal/interview'), '/portal/interview');
  assert.equal(interviewPathOf('#portal/interview/session'), '/portal/interview/session');
  assert.equal(interviewPathOf('#portal/interview?seats=exhausted'), '/portal/interview?seats=exhausted');
  assert.equal(interviewPathOf('#portal/interview/results/abc-1'), '/portal/interview/results/abc-1');
  assert.equal(interviewPathOf('#join/tok?team=u-1'), '/join/tok?team=u-1');
  assert.equal(interviewPathOf('#/join/tok'), '/join/tok');
  assert.equal(interviewPathOf('#portal'), '/portal');
  assert.equal(interviewPathOf('#account'), null);
  assert.equal(interviewPathOf('https://evil.example/#portal'), null);
});

test('a Next path reads back as the hash the Vite app routes on', () => {
  assert.equal(interviewHashOf('/portal/interview', ''), '#portal/interview');
  assert.equal(interviewHashOf('/portal/interview/', '?consent=required'), '#portal/interview?consent=required');
  assert.equal(interviewHashOf('/join/tok', 'team=u-1'), '#join/tok?team=u-1');
  assert.equal(interviewHashOf('/portal', ''), null);
  assert.equal(interviewHashOf('/portal/interviews', ''), null);
  for (const view of ['session', 'complete', 'goodbye', 'discarded', 'results']) {
    assert.equal(parseInterviewHash(interviewHashOf(`/portal/interview/${view}`, '')).view, view);
  }
  assert.deepEqual(parseInterviewHash(interviewHashOf('/join/tok', '?team=u-1')),
    { view: 'join', token: 'tok', unitId: 'u-1', query: { team: 'u-1' } });
});

test('before path mode, hrefs and navigation stay on hashes (the Vite app)', () => {
  globalThis.location = { pathname: '/', search: '', hash: '#portal/interview' };
  assert.equal(hrefFor(PORTAL_HOME_HASH), '#portal');
  assert.equal(currentHash(), '#portal/interview');
  assert.equal(verifyCallbackURL('#join/abc?team=u1'), '/#join/abc?team=u1');
  goToHash(interviewHref('complete'));
  assert.equal(location.hash, '#portal/interview/complete');
});

test('in path mode, hrefs, redirects and "where am I" use Next paths', () => {
  const pushed = [];
  globalThis.location = { pathname: '/portal/interview/session', search: '', hash: '' };
  enablePathRoutes((path) => pushed.push(path));
  assert.equal(hrefFor(PORTAL_HOME_HASH), '/portal');
  assert.equal(hrefFor(interviewHref('home')), '/portal/interview');
  assert.equal(hrefFor('mailto:dx@example.com'), 'mailto:dx@example.com');
  assert.equal(currentHash(), '#portal/interview/session');
  assert.equal(verifyCallbackURL('#join/abc?team=u1'), '/join/abc?team=u1');
  assert.equal(verifyCallbackURL('#portal/interview'), '/portal/interview');

  navigate(interviewHref('complete'));
  assert.deepEqual(pushed, ['/portal/interview/complete']);
  assert.equal(location.hash, '', 'no hash is set under Next');

  let reloaded = 0;
  navigate('#portal/interview/session', () => reloaded++);
  assert.equal(reloaded, 1, 'the page it is already on reloads instead');
  assert.equal(pushed.length, 1);
});
