import test from 'node:test';
import assert from 'node:assert/strict';
import { scorePassword } from './passwordStrength.mjs';

test('empty password scores 0 with no label', () => {
  const r = scorePassword('');
  assert.equal(r.score, 0);
  assert.equal(r.label, '');
});

test('short password reads Weak and asks for length', () => {
  const r = scorePassword('ab1');
  assert.equal(r.score, 1);
  assert.equal(r.label, 'Weak');
  assert.match(r.hint, /8 characters/);
});

test('a single character class nudges toward mixing', () => {
  const r = scorePassword('abcdefghij'); // 10 lowercase only
  assert.match(r.hint, /numbers or symbols/i);
  assert.ok(r.score <= 2);
});

test('two classes at 8+ chars is Fair', () => {
  const r = scorePassword('abcd1234');
  assert.equal(r.label, 'Fair');
});

test('three classes at 10+ chars is Good', () => {
  const r = scorePassword('Abcd1234!@');
  assert.equal(r.score, 3);
  assert.equal(r.label, 'Good');
});

test('long, mixed password is Strong', () => {
  const r = scorePassword('Abcdef123456!@');
  assert.equal(r.score, 4);
  assert.equal(r.label, 'Strong');
});

test('obvious-weak passwords never read above Weak', () => {
  assert.equal(scorePassword('password123!@#').label, 'Weak');
  assert.equal(scorePassword('12345678').label, 'Weak');
});
