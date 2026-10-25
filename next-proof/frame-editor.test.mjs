import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COPY_PERMISSIONS, EDITOR_COMMANDS, EDITOR_CONTRACT, copyModeAllows, editModeOf, editorState, importLiveData, liveContentOf, mediaRequest, validEditorCommand, validEditorState, validEditorKey, validMediaRequest } from './frame-editor.mjs';
import { envelope, validMessage } from './frame-protocol.mjs';

const parent = {};
globalThis.window = { parent };
const bound = { origin: 'https://host.example', nonce: 'ABCDEFGHIJKLMNOPQRSTUV' };
const event = (type, payload) => ({ origin: bound.origin, source: parent, data: { gs: 'website-frame', protocol: 1, session: bound.nonce, type, payload } });

test('editor hello-ack advertises editor contract 2 and live content only in editor mode', () => {
  const editor = readFileSync(new URL('../app/editor/[slug]/Editor.jsx', import.meta.url), 'utf8');
  assert.equal(EDITOR_CONTRACT, 2);
  assert.match(editor, /envelope\('hello-ack',[^\n]*mode === 'editor' \? \{ editorCommands: EDITOR_COMMANDS, editorContract: EDITOR_CONTRACT, liveContent: liveContentOf\(liveData\) \} : \{\}/);
});

test('Edit copy (GSAM GRE-2394): mode from hello, refused commands and Puck permissions', () => {
  assert.deepEqual(EDITOR_COMMANDS, ['undo', 'redo', 'save', 'add-block', 'deselect', 'outline', 'layout', 'import-live']);
  assert.equal(editModeOf({ editMode: 'copy' }), 'copy');
  assert.equal(editModeOf({ editMode: 'layout' }), 'layout');
  // An older GSAM sends no edit mode: today's editor.
  assert.equal(editModeOf({}), 'layout');
  assert.equal(editModeOf({ editMode: 'anything' }), 'layout');
  for (const command of ['add-block', 'outline']) assert.equal(copyModeAllows(command), false);
  for (const command of ['undo', 'redo', 'save', 'deselect', 'layout', 'import-live']) assert.equal(copyModeAllows(command), true);
  assert.deepEqual({ ...COPY_PERMISSIONS }, { drag: false, duplicate: false, delete: false, insert: false });
  assert.equal(validEditorCommand({ command: 'layout', on: true }), true);
  assert.equal(validEditorCommand({ command: 'layout' }), false);
  assert.equal(validEditorCommand({ command: 'import-live' }), true);
  assert.equal(validEditorCommand({ command: 'import-live', on: true }), false);
  const editor = readFileSync(new URL('../app/editor/[slug]/Editor.jsx', import.meta.url), 'utf8');
  assert.match(editor, /copy \? \{ permissions: COPY_PERMISSIONS \} : \{\}/);
});

test('live content: counted for hello-ack, imported only into an empty draft with block ids unchanged', () => {
  const live = { root: { props: { title: 'About' } }, content: [{ type: 'Hero', props: { id: 'hero-1', heading: 'About us' } }, { type: 'Invite', props: { id: 'invite-1' } }] };
  assert.deepEqual(liveContentOf(live), { blocks: 2 });
  assert.equal(liveContentOf(null), null);
  assert.equal(liveContentOf({ root: {}, content: [] }), null);
  const imported = importLiveData(live, { root: { props: {} }, content: [] });
  assert.deepEqual(imported.content.map((block) => block.props.id), ['hero-1', 'invite-1']);
  assert.deepEqual(imported.root, live.root);
  assert.notEqual(imported.content, live.content); // a copy: editing the draft never changes the live page
  assert.equal(importLiveData(live, { root: {}, content: [{ type: 'Hero', props: { id: 'x' } }] }), null);
  assert.equal(importLiveData(null, { root: {}, content: [] }), null);
});

test('editor commands accept every advertised command and reject bad payloads or sessions', () => {
  for (const command of EDITOR_COMMANDS) {
    const payload = { command, ...(command === 'outline' || command === 'layout' ? { on: true } : {}) };
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
