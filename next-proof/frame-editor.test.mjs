import test from 'node:test';
import assert from 'node:assert/strict';
import { EDITOR_COMMANDS, editorState, mediaRequest, validEditorCommand, validEditorState, validEditorKey, validMediaRequest } from './frame-editor.mjs';
import { envelope, validMessage } from './frame-protocol.mjs';

const parent = {};
globalThis.window = { parent };
const bound = { origin: 'https://host.example', nonce: 'ABCDEFGHIJKLMNOPQRSTUV' };
const event = (type, payload) => ({ origin: bound.origin, source: parent, data: { gs: 'website-frame', protocol: 1, session: bound.nonce, type, payload } });

test('editor commands accept every advertised command and reject bad payloads or sessions', () => {
  for (const command of EDITOR_COMMANDS) {
    const payload = { command, ...(command === 'outline' ? { on: true } : {}) };
    assert.equal(validMessage(event('editor-command', payload), bound, ['editor-command']) && validEditorCommand(payload), true);
  }
  for (const payload of [null, [], {}, { command: 'publish' }, { command: 'outline' }, { command: 'save', on: true }]) assert.equal(validEditorCommand(payload), false);
  assert.equal(validMessage({ ...event('editor-command', { command: 'save' }), source: {} }, bound, ['editor-command']), false);
  assert.equal(validMessage(event('editor-command', { command: 'save' }), bound, []), false); // older engine ignores it
});

test('state and editor key use the existing additive envelope', () => {
  const state = editorState({ type: 'Hero', props: { id: 'hero' } }, { hasPast: true, hasFuture: false }, true);
  assert.deepEqual(state, { selection: { blockId: 'hero', blockType: 'Hero', label: 'Hero' }, canUndo: true, canRedo: false, outline: true });
  assert.deepEqual(editorState(null, null), { selection: null, canUndo: false, canRedo: false, outline: false });
  assert.equal(validEditorState(state), true);
  assert.equal(validEditorState({ ...state, canRedo: 'no' }), false);
  assert.equal(validEditorState({ ...state, selection: { blockId: 'hero' } }), false);
  assert.equal(validEditorKey({ key: 'escape' }), true);
  assert.equal(validEditorKey({ key: 'publish' }), false);
  for (const [type, payload] of [['editor-state', state], ['editor-key', { key: 'escape' }]]) {
    assert.equal(envelope(type, payload, bound).session, bound.nonce);
    assert.equal(validMessage(event(type, payload), bound, []), false); // older host ignores it
  }
});

test('image request resolves a real block field; unknown media and bad sources are refused', () => {
  const item = { type: 'Hero', props: { id: 'hero', image: '/cover.png' } };
  const components = { Hero: { fields: { image: { type: 'image', label: 'Cover' } } } };
  const request = mediaRequest(item, { tagName: 'IMG', src: '/cover.png' }, components);
  assert.deepEqual(request, { blockId: 'hero', field: 'image', kind: 'image', label: 'Cover' });
  assert.equal(validMediaRequest(request), true);
  assert.equal(validMediaRequest({ ...request, kind: 'file' }), false);
  assert.equal(mediaRequest(item, { tagName: 'IMG', src: '/other.png' }, components), null);
  assert.equal(mediaRequest(null, { tagName: 'IMG' }, components), null);
  assert.deepEqual(mediaRequest({ type: 'Gallery', props: { id: 'gallery', items: [{ photo: '/nested.png' }] } }, { tagName: 'IMG', src: '/nested.png' }, { Gallery: { fields: { items: { type: 'array', arrayFields: { photo: { type: 'image' } } } } } }), { blockId: 'gallery', field: 'items.0.photo', label: 'photo', kind: 'image' });
  assert.equal(validMessage(event('media-requested', request), bound, []), false); // older host ignores it
});
