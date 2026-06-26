import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveOrigin, originToDomain } from './site-origin.mjs';

test('resolveOrigin: an explicit env origin wins, trailing slashes trimmed', () => {
  assert.equal(resolveOrigin('https://greatstonesoftware.co.uk/', 'https://x.netlify.app'), 'https://greatstonesoftware.co.uk');
  assert.equal(resolveOrigin('https://a.co///', ''), 'https://a.co');
});

test('resolveOrigin: falls back to the live host when env is unset (domain-portable)', () => {
  assert.equal(resolveOrigin('', 'https://greatstone-home.netlify.app'), 'https://greatstone-home.netlify.app');
  assert.equal(resolveOrigin('   ', 'https://host'), 'https://host');
});

test('resolveOrigin: empty string when neither is set', () => {
  assert.equal(resolveOrigin('', ''), '');
  assert.equal(resolveOrigin(undefined, undefined), '');
});

test('originToDomain: strips scheme and trailing slash', () => {
  assert.equal(originToDomain('https://greatstonesoftware.co.uk'), 'greatstonesoftware.co.uk');
  assert.equal(originToDomain('http://localhost:5180/'), 'localhost:5180');
  assert.equal(originToDomain(''), '');
});
