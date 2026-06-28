import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeHealth } from './site-health.mjs';

const clean = {
  links: { broken: 0, recoverable: 0, orphans: [] },
  navcheck: { errors: 0, warnings: 0 }, access: { errors: 0, warnings: 0 },
  seohealth: { errors: 0, warnings: 0 }, copy: { hard: 0, flags: 0 },
  mediausage: { counts: { untracked: 0, missingAlt: 0 } },
};
const dim = (r, key) => r.dimensions.find((d) => d.key === key);
// warnings dock 1 point each → use media warnings to dial any exact score for grade-band tests.
const withWarn = (n) => ({ ...clean, mediausage: { counts: { untracked: n, missingAlt: 0 } } });

test('a clean site scores 100 / grade A with no top issues', () => {
  const r = computeHealth(clean);
  assert.equal(r.score, 100);
  assert.equal(r.grade, 'A');
  assert.equal(r.errors, 0);
  assert.equal(r.warnings, 0);
  assert.deepEqual(r.topIssues, []);
});

test('one broken link → score 97, links dimension is an error', () => {
  const r = computeHealth({ ...clean, links: { broken: 1, recoverable: 0, orphans: [] } });
  assert.equal(r.score, 97);
  assert.equal(dim(r, 'links').severity, 'error');
  assert.equal(dim(r, 'links').errors, 1);
});

test('links shape maps broken→errors, recoverable→warnings, and IGNORES orphans (owned by navcheck)', () => {
  const r = computeHealth({ ...clean, links: { broken: 2, recoverable: 1, orphans: ['a', 'b'] } });
  assert.equal(dim(r, 'links').errors, 2);
  assert.equal(dim(r, 'links').warnings, 1); // orphans NOT counted → would be 3 if folded in
  assert.equal(r.score, 100 - 3 * 2 - 1 * 1); // 93
});

test('media never contributes errors; untracked + missingAlt are warnings', () => {
  const r = computeHealth({ ...clean, mediausage: { counts: { untracked: 5, missingAlt: 5 } } });
  assert.equal(dim(r, 'mediausage').errors, 0);
  assert.equal(dim(r, 'mediausage').warnings, 10);
  assert.equal(dim(r, 'mediausage').severity, 'warn');
  assert.equal(r.score, 90); // 10 warnings, still grade A
  assert.equal(r.grade, 'A');
});

test('errors sort ahead of warnings in topIssues, regardless of raw count', () => {
  const r = computeHealth({ ...clean, seohealth: { errors: 1, warnings: 0 }, mediausage: { counts: { untracked: 10, missingAlt: 0 } } });
  assert.equal(r.topIssues[0].key, 'seohealth'); // 1 error outranks 10 warnings
  assert.equal(r.topIssues[1].key, 'mediausage');
});

test('voice maps hard→errors, flags→warnings', () => {
  const r = computeHealth({ ...clean, copy: { hard: 1, flags: 2 } });
  assert.equal(dim(r, 'copy').errors, 1);
  assert.equal(dim(r, 'copy').warnings, 2);
});

test('grade bands A/B/C/D/F at the exact boundaries (dialled with warnings, −1 each)', () => {
  assert.equal(computeHealth(withWarn(10)).grade, 'A'); // 90
  assert.equal(computeHealth(withWarn(11)).grade, 'B'); // 89
  assert.equal(computeHealth(withWarn(20)).grade, 'B'); // 80
  assert.equal(computeHealth(withWarn(21)).grade, 'C'); // 79
  assert.equal(computeHealth(withWarn(30)).grade, 'C'); // 70
  assert.equal(computeHealth(withWarn(31)).grade, 'D'); // 69
  assert.equal(computeHealth(withWarn(40)).grade, 'D'); // 60
  assert.equal(computeHealth(withWarn(41)).grade, 'F'); // 59
});

test('score clamps at 0 (never negative); grade F', () => {
  const r = computeHealth({ ...clean, seohealth: { errors: 40, warnings: 0 } });
  assert.equal(r.score, 0);
  assert.equal(r.grade, 'F');
});

test('missing / empty reports do not throw; all six dimensions present at count 0; score 100', () => {
  [computeHealth(), computeHealth({})].forEach((r) => {
    assert.equal(r.score, 100);
    assert.equal(r.dimensions.length, 6);
    assert.ok(r.dimensions.every((d) => d.count === 0));
  });
});

test('a partial report (only some dimensions present) scores the present ones', () => {
  const r = computeHealth({ access: { errors: 2, warnings: 1 } });
  assert.equal(r.score, 100 - 3 * 2 - 1 * 1); // 93
  assert.equal(dim(r, 'links').count, 0); // absent report → 0, no throw
});
