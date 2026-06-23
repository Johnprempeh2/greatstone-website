import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthlySpend } from './monthly-spend.mjs';

const O = (placed_at, total_minor, extra = {}) => ({ placed_at, total_minor, currency: 'GBP', status: 'paid', ...extra });

test('monthlySpend: buckets by calendar month and sums totals', () => {
  const r = monthlySpend([O('2026-02-10', 1000), O('2026-02-20', 500), O('2026-04-01', 2000)]);
  assert.deepEqual(r.months, ['2026-02', '2026-04']);
  assert.equal(r.byMonth['2026-02'], 1500);
  assert.equal(r.byMonth['2026-04'], 2000);
  assert.equal(r.total, 3500);
  assert.equal(r.max, 2000);
  assert.equal(r.hasTrend, true);
});

test('monthlySpend: excludes cancelled and refunded orders', () => {
  const r = monthlySpend([O('2026-02-10', 1000), O('2026-03-10', 9999, { status: 'cancelled' }), O('2026-03-11', 8888, { status: 'refunded' })]);
  assert.deepEqual(r.months, ['2026-02']);
  assert.equal(r.total, 1000);
  assert.equal(r.hasTrend, false); // a single month is not a trend
});

test('monthlySpend: keeps only the last N months', () => {
  const orders = ['01','02','03','04','05','06','07','08'].map((m, i) => O('2026-' + m + '-05', (i + 1) * 100));
  const r = monthlySpend(orders, { maxMonths: 6 });
  assert.equal(r.months.length, 6);
  assert.deepEqual(r.months, ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']);
});

test('monthlySpend: skips undated orders, falls back to created_at, picks currency from first live order', () => {
  const r = monthlySpend([{ total_minor: 500, status: 'paid', currency: 'USD' }, O(null, 700, { created_at: '2026-05-02', currency: 'USD' })]);
  assert.deepEqual(r.months, ['2026-05']); // the undated one is skipped from buckets
  assert.equal(r.total, 1200); // but still counts toward the live total
  assert.equal(r.curr, 'USD');
});

test('monthlySpend: empty / null is safe and not a trend', () => {
  for (const v of [null, undefined, []]) {
    const r = monthlySpend(v);
    assert.deepEqual(r.months, []);
    assert.equal(r.total, 0);
    assert.equal(r.max, 1);
    assert.equal(r.hasTrend, false);
  }
});
