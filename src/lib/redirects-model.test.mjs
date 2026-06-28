import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRedirect, addRedirect, removeRedirect, setRedirect,
  normalizeRedirects, classifyRedirect, listRedirects,
} from './redirects-model.mjs';

const S = (pages, redirects) => ({ pages: pages || {}, redirects: redirects || [] });
const R = (from, to) => ({ from, to, ts: 1 });
const has = (rs, from, to) => rs.some((r) => r.from === from && r.to === to);

// ---- validateRedirect ----
test('validateRedirect rejects empty, same, reserved, live-from, and existing-from', () => {
  assert.equal(validateRedirect(S(), '', 'about'), 'empty');
  assert.equal(validateRedirect(S(), 'x', 'x'), 'same');
  assert.equal(validateRedirect(S(), 'home', 'about'), 'from-reserved');
  assert.equal(validateRedirect(S({ about: {} }), 'about', 'svc'), 'from-live');
  assert.equal(validateRedirect(S({ about: {} }, [R('old', 'about')]), 'old', 'svc'), 'exists');
  assert.equal(validateRedirect(S({ about: {} }), 'old-about', 'about'), null); // valid
});

test('validateRedirect detects a cycle on the PROPOSED collapsed table', () => {
  // a->b, b->c ; adding c->a closes the loop after collapse (b->c becomes b->a, so a->b->a)
  assert.equal(validateRedirect(S({}, [R('a', 'b'), R('b', 'c')]), 'c', 'a'), 'cycle');
});

// ---- addRedirect ----
test('addRedirect appends a {from,to,ts} row with a numeric ts', () => {
  const r = addRedirect(S({ about: {} }), 'old', 'about');
  assert.ok(has(r.redirects, 'old', 'about'));
  assert.equal(typeof r.redirects[r.redirects.length - 1].ts, 'number');
  assert.equal(r._redirectError, null);
});

test('addRedirect on a validation failure leaves redirects untouched + stamps _redirectError', () => {
  const before = S({ about: {} }, [R('old', 'about')]);
  const r = addRedirect(before, 'old', 'svc'); // exists
  assert.equal(r._redirectError, 'exists');
  assert.deepEqual(r.redirects, before.redirects);
});

test('addRedirect chain-collapses like setSlug (a->b, add b->c ⇒ a->c, b->c — no stale a->b)', () => {
  const r = addRedirect(S({}, [R('a', 'b')]), 'b', 'c');
  assert.ok(has(r.redirects, 'a', 'c'));
  assert.ok(has(r.redirects, 'b', 'c'));
  assert.ok(!has(r.redirects, 'a', 'b'));
  assert.equal(r.redirects.length, 2);
});

test('addRedirect never leaves a self-redirect (M1: c->b, add b->c must NOT yield c->c)', () => {
  const r = addRedirect(S({}, [R('c', 'b')]), 'b', 'c');
  assert.ok(!r.redirects.some((x) => x.from === x.to), 'no self-redirect');
  assert.ok(has(r.redirects, 'b', 'c'));
  assert.equal(r.redirects.length, 1);
});

// ---- removeRedirect ----
test('removeRedirect drops only the matching from; absent key is a no-op', () => {
  const before = S({}, [R('a', 'x'), R('b', 'y')]);
  assert.deepEqual(removeRedirect(before, 'a').redirects.map((r) => r.from), ['b']);
  assert.deepEqual(removeRedirect(before, 'zzz').redirects.map((r) => r.from), ['a', 'b']);
});

// ---- setRedirect (repoint) ----
test('setRedirect repoints the target, keeps from, refreshes ts', () => {
  const r = setRedirect(S({ about: {}, svc: {} }, [R('old', 'about')]), 'old', 'svc');
  assert.ok(has(r.redirects, 'old', 'svc'));
  assert.ok(!has(r.redirects, 'old', 'about'));
});

test('setRedirect rejects same/empty/cycle', () => {
  assert.equal(setRedirect(S({}, [R('old', 'about')]), 'old', 'old')._redirectError, 'same');
  assert.equal(setRedirect(S({}, [R('old', 'about')]), 'old', '')._redirectError, 'empty');
  // repoint c (was c->d) to a, with a->b, b->c present, closes a->b->a after collapse
  assert.equal(setRedirect(S({}, [R('a', 'b'), R('b', 'c'), R('c', 'd')]), 'c', 'a')._redirectError, 'cycle');
});

// ---- normalizeRedirects ----
test('normalizeRedirects dedupes by from (last wins), drops self-redirects, collapses chains, no mutation', () => {
  const input = [R('a', 'b'), R('b', 'c'), R('x', 'x'), R('a', 'z')];
  const frozen = JSON.parse(JSON.stringify(input));
  const out = normalizeRedirects(input, {});
  assert.ok(!out.some((r) => r.from === r.to)); // x->x dropped
  assert.ok(has(out, 'a', 'z')); // last a wins (a->z, not a->b)
  assert.ok(has(out, 'b', 'c'));
  assert.deepEqual(input, frozen); // input not mutated
});

test('normalizeRedirects collapses a chain so every to is final', () => {
  const out = normalizeRedirects([R('a', 'b'), R('b', 'about')], { about: {} });
  assert.ok(has(out, 'a', 'about')); // a->b->about collapses to a->about
});

// ---- classifyRedirect ----
test('classifyRedirect: ok / target-missing / shadowed', () => {
  const live = S({ about: {} }, []);
  assert.equal(classifyRedirect(live, R('old', 'about')), 'ok');
  assert.equal(classifyRedirect(live, R('old', 'gone')), 'target-missing');
  assert.equal(classifyRedirect(S({ old: {}, about: {} }), R('old', 'about')), 'shadowed');
});

test('classifyRedirect resolves a chain to a live page as ok', () => {
  const s = S({ about: {} }, [R('old', 'mid'), R('mid', 'about')]);
  assert.equal(classifyRedirect(s, R('old', 'mid')), 'ok'); // old->mid->about (live)
});

// ---- listRedirects ----
test('listRedirects decorates + sorts problems first (target-missing, then shadowed, then ok)', () => {
  const s = S({ about: {}, shad: {} }, [R('okrow', 'about'), R('dead', 'gone'), R('shad', 'about')]);
  const list = listRedirects(s);
  assert.deepEqual(list.map((r) => r.status), ['target-missing', 'shadowed', 'ok']);
  assert.equal(list.find((r) => r.from === 'okrow').resolved, 'about');
});
