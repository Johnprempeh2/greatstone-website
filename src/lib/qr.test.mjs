import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qrMatrix, qrSvgPath } from './qr.mjs';

// The three finder patterns: a 7x7 dark ring, light ring, 3x3 dark centre.
function hasFinder(grid, x0, y0) {
  for (let dy = 0; dy < 7; dy += 1) for (let dx = 0; dx < 7; dx += 1) {
    const d = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
    if (grid[y0 + dy][x0 + dx] !== (d !== 2)) return false;
  }
  return true;
}

test('a typical otpauth link makes a square code with finders, timing and the dark module', () => {
  const uri = 'otpauth://totp/Greatstone:someone%40example.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA&issuer=Greatstone&digits=6&period=30';
  const grid = qrMatrix(uri);
  const size = grid.length;
  assert.ok(grid.every((row) => row.length === size));
  assert.equal((size - 17) % 4, 0);
  assert.ok(size <= 20 * 4 + 17);
  const last = size - 7;
  assert.ok(hasFinder(grid, 0, 0) && hasFinder(grid, last, 0) && hasFinder(grid, 0, last));
  for (let i = 8; i < size - 8; i += 1) { assert.equal(grid[6][i], i % 2 === 0); assert.equal(grid[i][6], i % 2 === 0); }
  assert.equal(grid[size - 8][8], true);
  assert.deepEqual(qrMatrix(uri), grid, 'same text, same code');
});

test('version grows with length; too long is refused', () => {
  assert.equal(qrMatrix('a').length, 21);
  assert.ok(qrMatrix('x'.repeat(200)).length > qrMatrix('x'.repeat(40)).length);
  assert.throws(() => qrMatrix('x'.repeat(2000)), /too long/);
});

test('svg path has a quiet zone of four modules', () => {
  const { size, path } = qrSvgPath('hello');
  assert.equal(size, 21 + 8);
  assert.match(path, /^M4 4h1v1h-1z/);
});
