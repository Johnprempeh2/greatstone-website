import test from 'node:test';
import assert from 'node:assert/strict';
import { saveDecision, saveRequest } from './frame-save.mjs';

const draft = { root: { props: {} }, content: [{ type: 'Hero', props: { id: 'block-1', headline: 'One' } }] };
const pending = { requestId: 'request-1', pageId: 'page-1', baseRevisionId: 'revision-1', data: draft };

test('retry keeps the request id and base revision', () => {
  assert.equal(saveRequest({ pending, retry: true, createId: () => 'new' }), pending);
  assert.deepEqual(saveRequest({ pending, retry: false, pageId: 'page-1', baseRevisionId: 'revision-2', data: draft, createId: () => 'request-2' }),
    { requestId: 'request-2', pageId: 'page-1', baseRevisionId: 'revision-2', data: draft });
});

test('saved answer keeps new edits dirty and advances the base', () => {
  assert.deepEqual(saveDecision(pending, draft, { requestId: 'request-1', outcome: 'saved', revisionId: 'revision-2' }),
    { kind: 'saved', revisionId: 'revision-2', dirty: false });
  assert.deepEqual(saveDecision(pending, { ...draft, content: [] }, { requestId: 'request-1', outcome: 'saved', revisionId: 'revision-2' }),
    { kind: 'saved', revisionId: 'revision-2', dirty: true });
});

test('conflict carries their draft and media for take theirs', () => {
  const currentData = { ...draft, content: [] };
  assert.deepEqual(saveDecision(pending, draft, { requestId: 'request-1', outcome: 'conflict', currentRevisionId: 'revision-2', currentData, currentMedia: { cover: { blob: 'test' } } }),
    { kind: 'conflict', revisionId: 'revision-2', data: currentData, media: { cover: { blob: 'test' } } });
});

test('failed answer retains retryability; stale and invalid answers are ignored', () => {
  assert.deepEqual(saveDecision(pending, draft, { requestId: 'request-1', outcome: 'failed', retryable: true, message: 'Network unavailable' }),
    { kind: 'failed', retryable: true, message: 'Network unavailable' });
  assert.equal(saveDecision(pending, draft, { requestId: 'other', outcome: 'saved', revisionId: 'revision-2' }), null);
  assert.equal(saveDecision(pending, draft, { requestId: 'request-1', outcome: 'conflict', currentRevisionId: 'revision-2', currentData: {} }), null);
});
