import test from 'node:test';
import assert from 'node:assert/strict';
import { sharedStreams } from './deep-dive-progress.mjs';

test('shared stream progress uses only the synced stream status', () => {
  assert.deepEqual(sharedStreams([
    { id: 'one', type: 'deep_dive_stream', title: 'Operations', summary: 'Shared summary', fields: { status: 'under_way' } },
    { id: 'two', type: 'deep_dive', title: 'Record', fields: {} },
    { id: 'three', type: 'deep_dive_stream', title: 'Data', fields: { status: 'unexpected' } },
  ]), [
    { id: 'one', title: 'Operations', summary: 'Shared summary', status: 'Under way' },
    { id: 'three', title: 'Data', summary: undefined, status: 'Status unavailable' },
  ]);
});
