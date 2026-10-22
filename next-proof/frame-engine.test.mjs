import test from 'node:test';
import assert from 'node:assert/strict';
import { frameEngine } from './frame-engine.mjs';

test('frame reference uses the running commit, not an older release commit', () => {
  const release = { version: 'old', commit: 'a'.repeat(40) };
  assert.equal(frameEngine(release, { COMMIT_REF: 'b'.repeat(40) }, () => 'c'.repeat(40)).commit, 'b'.repeat(40));
  assert.equal(frameEngine(release, {}, () => 'c'.repeat(40)).commit, 'c'.repeat(40));
  assert.equal(frameEngine(release, {}, () => { throw new Error('no git'); }).commit, release.commit);
});
