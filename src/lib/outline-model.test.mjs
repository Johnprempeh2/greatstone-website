import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOutline, buildSiteOutline } from './outline-model.mjs';
import { headingsOf } from './headings-of.mjs';

const page = (content) => ({ data: { root: { props: { title: 'P' } }, content } });
const fake = (b) => [{ level: b.props.l, text: 't' }]; // a tiny injected headingsOf for pure-logic tests

test('clean page (h1 -> h2 -> h3) -> no issues', () => {
  const out = buildOutline(page([{ type: 'X', props: { l: 1 } }, { type: 'X', props: { l: 2 } }, { type: 'X', props: { l: 3 } }]), fake);
  assert.equal(out.issues.length, 0);
  assert.deepEqual(out.items.map((i) => i.level), [1, 2, 3]);
});

test('h3 -> h2 is VALID (closing a subsection) — no false positive on going up', () => {
  const out = buildOutline(page([{ type: 'X', props: { l: 1 } }, { type: 'X', props: { l: 2 } }, { type: 'X', props: { l: 3 } }, { type: 'X', props: { l: 2 } }]), fake);
  assert.equal(out.issues.filter((i) => i.ruleId === 'skipped-level').length, 0);
});

test('h1 -> h3 skip is FLAGGED (1.3.1)', () => {
  const out = buildOutline(page([{ type: 'X', props: { l: 1 } }, { type: 'X', props: { l: 3 } }]), fake);
  const sk = out.issues.find((i) => i.ruleId === 'skipped-level');
  assert.ok(sk); assert.equal(sk.from, 1); assert.equal(sk.to, 3); assert.equal(sk.wcag, '1.3.1');
});

test('not-h1-first flagged when the first heading is an h2', () => {
  const out = buildOutline(page([{ type: 'X', props: { l: 2 } }, { type: 'X', props: { l: 3 } }]), fake);
  assert.ok(out.issues.find((i) => i.ruleId === 'not-h1-first'));
});

test('empty / malformed content -> no items, no issues, no crash', () => {
  assert.deepEqual(buildOutline(page([]), () => []), { items: [], issues: [] });
  assert.deepEqual(buildOutline({}, () => []), { items: [], issues: [] });
});

test('decorative-only blocks (Quote / Figure / LogoWall) contribute nothing — real headingsOf', () => {
  const out = buildOutline(page([{ type: 'Hero', props: { headline: 'Hi' } }, { type: 'Quote', props: { text: 'q' } }, { type: 'LogoWall', props: {} }]), headingsOf);
  assert.deepEqual(out.items.map((i) => i.level), [1]);
  assert.equal(out.issues.length, 0);
});

test('conditional-empty heading is SKIPPED, not emitted-empty (FeatureGrid with no heading) — real headingsOf', () => {
  const out = buildOutline(page([{ type: 'Hero', props: { headline: 'Hi' } }, { type: 'FeatureGrid', props: { items: [{ title: 'A' }, { title: 'B' }] } }]), headingsOf);
  assert.deepEqual(out.items.map((i) => i.level), [1, 3, 3]); // no phantom empty h2
  assert.ok(out.issues.find((i) => i.ruleId === 'skipped-level' && i.from === 1 && i.to === 3)); // truthful: this really skips
});

test('InsightsGrid emits a per-post h3 with no own h2 — real headingsOf', () => {
  const out = buildOutline(page([{ type: 'InsightsGrid', props: { posts: [{ title: 'X' }, { title: 'Y' }, { noTitle: 1 }] } }]), headingsOf);
  assert.deepEqual(out.items.map((i) => i.text), ['X', 'Y']); // empty-title post skipped
});

test('className="h3" on an <h2> ELEMENT (RoiBar) is read as level 2, not 3 — real headingsOf', () => {
  const out = buildOutline(page([{ type: 'RoiBar', props: { headline: 'R' } }]), headingsOf);
  assert.equal(out.items[0].level, 2);
});

test('MaturityModel folds tiers then phases into h3s under its h2 — real headingsOf', () => {
  const out = buildOutline(page([{ type: 'MaturityModel', props: { heading: 'M', tiers: [{ label: 't1' }], phases: [{ label: 'p1' }, { label: 'p2' }] } }]), headingsOf);
  assert.deepEqual(out.items.map((i) => i.level), [2, 3, 3, 3]);
  assert.deepEqual(out.items.map((i) => i.text), ['M', 't1', 'p1', 'p2']);
});

test('buildSiteOutline marks a dynamic page (opts.dynamic) without claiming a static outline', () => {
  const st = { order: ['a', 'insights'], pages: {
    a: page([{ type: 'X', props: { l: 1 } }, { type: 'X', props: { l: 4 } }]), // 1 skip
    insights: page([{ type: 'Hero', props: { headline: 'fictional' } }]),       // would outline, but is dynamic
  } };
  const r = buildSiteOutline(st, fake, { dynamic: ['insights'] });
  const ins = r.groups.find((g) => g.pageSlug === 'insights');
  assert.equal(ins.dynamic, true);
  assert.deepEqual(ins.items, []);   // no fictional headings
  assert.equal(ins.count, 0);
  assert.equal(r.total, 1);          // only page 'a' contributes issues; dynamic page never does
});

test('buildSiteOutline sorts worst-first + totals across pages', () => {
  const st = { order: ['a', 'b'], pages: {
    a: page([{ type: 'X', props: { l: 1 } }, { type: 'X', props: { l: 2 } }]),   // clean
    b: page([{ type: 'X', props: { l: 1 } }, { type: 'X', props: { l: 4 } }]),   // 1 skip
  } };
  const r = buildSiteOutline(st, fake);
  assert.equal(r.total, 1);
  assert.equal(r.groups[0].pageSlug, 'b'); // worst-first
});
