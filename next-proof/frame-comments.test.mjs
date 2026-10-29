import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { askAgent, captureOptions, captureTarget, EDITOR_MESSAGES, encodeCapture, renderPins, validPins } from './frame-comments.mjs';
import { envelope, validMessage } from './frame-protocol.mjs';

const parent = {};
globalThis.window = { parent };
const bound = { origin: 'https://host.example', nonce: 'ABCDEFGHIJKLMNOPQRSTUV' };
const draft = { content: [{ type: 'Hero', props: { id: 'hero-1' } }, { type: 'Prose', props: { id: 'prose-2' } }] };
const source = readFileSync(new URL('../app/editor/[slug]/Editor.jsx', import.meta.url), 'utf8');
const incoming = (type, payload) => ({ origin: bound.origin, source: parent, data: { gs: 'website-frame', id: 'request-1', protocol: 1, session: bound.nonce, type, payload } });

test('hello advertises only implemented editor messages', () => {
  assert.deepEqual(EDITOR_MESSAGES, ['comment-pins', 'pin-clicked', 'ask-agent', 'capture']);
  assert.match(source, /editorMessages: EDITOR_MESSAGES/);
  assert.match(source, /'comment-pins', 'capture', 'teardown'/);
});

test('comment-pins validates the host envelope and replaces visible pins without changing draft', () => {
  const pins = [{ blockId: 'hero-1', number: 1 }, { blockId: 'prose-2', number: 2 }];
  assert.equal(validMessage(incoming('comment-pins', { pins }), bound, ['comment-pins']), true);
  assert.deepEqual(validPins({ pins }, draft), pins);
  assert.deepEqual(validPins({ pins: [{ blockId: 'missing', number: 1 }] }, draft), []);
  assert.deepEqual(validPins({ pins: [pins[0], { blockId: 'missing', number: 3 }, pins[1]] }, draft), pins);
  assert.equal(validPins({ pins: [{ blockId: 'hero-1', number: 0 }] }, draft), null);
  assert.equal(validPins({ pins: Array.from({ length: 201 }, () => pins[0]) }, draft), null);
  const win = new Window();
  win.document.body.innerHTML = '<section data-gs-block-id="hero-1"></section><section data-gs-block-id="prose-2"></section>';
  let clicked;
  renderPins(win.document, pins, (pin) => { clicked = pin; });
  win.document.querySelector('.gs-comment-pin').click();
  assert.deepEqual(clicked, pins[0]);
  assert.equal(win.document.querySelectorAll('.gs-comment-pin').length, 2);
  renderPins(win.document, [pins[1]], () => {});
  assert.equal(win.document.querySelectorAll('.gs-comment-pin').length, 1);
  assert.equal(win.document.querySelector('.gs-comment-pin')?.textContent, '2');
  renderPins(win.document, validPins({ pins: [{ blockId: 'missing', number: 3 }, pins[0]] }, draft), () => {});
  assert.equal(win.document.querySelectorAll('.gs-comment-pin').length, 1);
  assert.equal(win.document.querySelector('.gs-comment-pin')?.textContent, '1');
  assert.deepEqual(draft.content[0].props, { id: 'hero-1' });
  renderPins(win.document, [{ blockId: 'hero-1', number: 3 }, { blockId: 'hero-1', number: 4 }], () => {});
  assert.equal(win.document.querySelectorAll('.gs-comment-pin').length, 2);
  assert.equal(envelope('pin-clicked', clicked, bound).session, bound.nonce);
  win.happyDOM.abort();
});

test('Ask an agent sends a bounded selected-block reference in both editing modes', () => {
  const item = { type: 'Hero', props: { id: 'hero-1', heading: 'A'.repeat(250) } };
  const payload = askAgent(item);
  assert.deepEqual(payload, { blockId: 'hero-1', blockType: 'Hero', label: 'A'.repeat(200) });
  assert.equal(envelope('ask-agent', payload, bound).session, bound.nonce);
  assert.match(source, /<button className="gs-frame-primary" type="button" onClick=\{\(\) => \{ const payload = askAgent\(selected\)/);
  assert.match(source, /\{!copy && <>/);
});

test('capture accepts a page or known block and answers with request id', () => {
  assert.equal(validMessage(incoming('capture', { blockId: null }), bound, ['capture']), true);
  assert.equal(captureTarget({ blockId: null }, draft), true);
  assert.equal(captureTarget({ blockId: 'hero-1' }, draft), true);
  assert.equal(captureTarget({ blockId: 'missing' }, draft), false);
  assert.equal(captureTarget({}, draft), false);
  assert.match(source, /send\('capture-result', \{ requestId, ok: true, \.\.\.result \}\)/);
  assert.match(source, /send\('capture-result', \{ requestId, ok: false/);
  let attempts = 0;
  const result = encodeCapture({}, 1000, 500, () => ({
    getContext: () => ({ drawImage: () => {} }),
    toDataURL: () => 'data:image/png;base64,' + 'A'.repeat(++attempts === 1 ? 3_000_000 : 40),
  }));
  assert.equal(attempts, 2);
  assert.equal(result.width, 700);
  const scrolled = { defaultView: { scrollX: 17, scrollY: 640 }, documentElement: { clientWidth: 390, clientHeight: 900 } };
  assert.deepEqual(captureOptions(scrolled, null, { width: 1000, height: 2000 }), { width: 390, height: 900, x: 17, y: 640 });
  assert.deepEqual(captureOptions(scrolled, 'hero-1', { width: 320, height: 400 }), { width: 320, height: 400 });
});
