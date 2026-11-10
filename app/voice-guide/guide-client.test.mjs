import test from 'node:test';
import assert from 'node:assert/strict';
import { addMessage, attachAction, cleanAction, displayText, historyFor, isPublicPath, micMessage, safePath, statusFromVoice, voiceSupported } from './guide-client.mjs';

test('the guide shows on public pages and not in signed-in areas, the editor or internal tools', () => {
  for (const path of ['/', '/about', '/services', '/service/ai-readiness', '/product/acrobat', '/shop', '/shop/adobe', '/privacy', '/contact', '/dev-tools', '/portalsomething']) assert.equal(isPublicPath(path), true, path);
  for (const path of ['/account', '/account/orders', '/org', '/portal/x', '/catalogue', '/invoice/1', '/join', '/order-confirmed', '/privacy/interviews', '/editor', '/editor/home',
    '/preview/x', '/live-design', '/effect-preview', '/html-export', '/html-sample', '/api/guide/start', '/media/x', null, undefined, '']) assert.equal(isPublicPath(path), false, String(path));
});

test('only a plain path on this site is ever followed', () => {
  for (const path of ['/', '/contact', '/service/ai-readiness', '/shop/adobe%20inc', '/a_b/c.d~e']) assert.equal(safePath(path), path);
  for (const path of ['//evil.example', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)', 'contact', '/a?next=//evil.example', '/a#b', '/a b', '', null, 42, { path: '/' }])
    assert.equal(safePath(path), null, String(path));
});

test('an action is checked again in the browser', () => {
  assert.deepEqual(cleanAction({ type: 'go', path: '/contact', title: 'Contact', extra: 1 }), { type: 'go', path: '/contact', title: 'Contact' });
  assert.equal(cleanAction({ type: 'go', path: '//evil.example', title: 'Contact' }), null);
  assert.equal(cleanAction({ type: 'go', path: '/contact' }), null);
  assert.deepEqual(cleanAction({ type: 'options', options: [{ path: '/a', title: 'A' }, { path: 'https://evil.example', title: 'B' }, { path: '/c' }, null, { path: '/d', title: 'D' }] }),
    { type: 'options', options: [{ path: '/a', title: 'A' }, { path: '/d', title: 'D' }] });
  assert.equal(cleanAction({ type: 'options', options: Array.from({ length: 9 }, (_, i) => ({ path: `/p${i}`, title: `P${i}` })) }).options.length, 4);
  assert.equal(cleanAction({ type: 'options', options: [{ path: '//x', title: 'X' }] }), null);
  for (const odd of [null, undefined, 'go', { type: 'open', path: '/a', title: 'A' }, { type: 'options', options: 'x' }]) assert.equal(cleanAction(odd), null);
});

test('the spoken name is written as one word on screen', () => {
  assert.equal(displayText('Hello, I am Great Stone’s AI guide. Great Stone International.'), 'Hello, I am Greatstone’s AI guide. Greatstone International.');
  assert.equal(displayText('A great stone wall'), 'A great stone wall');
  assert.equal(displayText(null), '');
});

test('messages are added, speech pieces join up, and the list stays bounded', () => {
  let list = addMessage([], 'you', '  What do you do?  ');
  assert.deepEqual(list, [{ id: 1, role: 'you', text: 'What do you do?' }]);
  assert.equal(addMessage(list, 'guide', '   '), list);
  list = addMessage(list, 'guide', 'We help', { spoken: true });
  list = addMessage(list, 'guide', 'with technology.', { spoken: true });
  assert.deepEqual(list.at(-1), { id: 2, role: 'guide', text: 'We help with technology.', spoken: true });
  // A typed reply never joins the line before it, speech never joins a typed line, and a line with an action is left whole.
  list = addMessage(list, 'guide', 'Taking you to Contact.', { action: { type: 'go', path: '/contact', title: 'Contact' } });
  list = addMessage(list, 'guide', 'Anything else?', { spoken: true });
  list = addMessage(list, 'guide', 'A typed reply.');
  list = addMessage(list, 'guide', 'Hello again.', { spoken: true });
  assert.equal(list.length, 6);
  assert.deepEqual(list.map((message) => message.id), [1, 2, 3, 4, 5, 6]);
  for (let i = 0; i < 100; i += 1) list = addMessage(list, 'you', `message ${i}`);
  assert.equal(list.length, 60);
  assert.equal(new Set(list.map((message) => message.id)).size, 60);
});

test('a spoken reply’s action lands on the guide’s latest line', () => {
  const action = { type: 'go', path: '/contact', title: 'Contact' };
  const list = [{ id: 1, role: 'guide', text: 'Hello' }, { id: 2, role: 'you', text: 'Contact please' }, { id: 3, role: 'guide', text: 'Taking you there.' }, { id: 4, role: 'note', text: 'x' }];
  assert.deepEqual(attachAction(list, action)[2], { id: 3, role: 'guide', text: 'Taking you there.', action });
  assert.equal(attachAction(list, null), list);
  assert.deepEqual(attachAction([{ id: 1, role: 'you', text: 'Hi' }], action), [{ id: 1, role: 'you', text: 'Hi' }]);
});

test('the server is sent the two speakers only, the most recent twelve', () => {
  const list = [{ id: 1, role: 'guide', text: 'Hello' }, { id: 2, role: 'note', text: 'The call has ended.' }, { id: 3, role: 'you', text: 'Hi' }];
  assert.deepEqual(historyFor(list), [{ role: 'assistant', content: 'Hello' }, { role: 'user', content: 'Hi' }]);
  assert.equal(historyFor(Array.from({ length: 30 }, (_, i) => ({ id: i, role: 'you', text: `m${i}` }))).length, 12);
});

test('voice states, support and microphone problems are put plainly', () => {
  assert.deepEqual(['connecting', 'listening', 'thinking', 'speaking', 'ended', 'idle', 'odd'].map(statusFromVoice), ['asking', 'listening', 'thinking', 'speaking', 'idle', 'idle', 'idle']);
  const full = { navigator: { mediaDevices: { getUserMedia() {} } }, AudioContext() {}, AudioWorkletNode() {}, WebSocket() {} };
  assert.equal(voiceSupported(full), true);
  assert.equal(voiceSupported({ ...full, AudioWorkletNode: undefined }), false);
  assert.equal(voiceSupported({ ...full, navigator: {} }), false);
  assert.equal(voiceSupported(undefined), false);
  assert.match(micMessage({ name: 'NotAllowedError', message: 'Permission denied' }), /blocked/);
  assert.match(micMessage(new Error('Permission dismissed')), /blocked/);
  assert.match(micMessage({ name: 'NotFoundError' }), /No working microphone/);
  assert.match(micMessage(new Error('socket closed')), /could not start/);
  assert.match(micMessage(undefined), /could not start/);
});

test('every page the guide can open is one the guide shows on, and a path the browser will follow', async () => {
  const { readFileSync } = await import('node:fs');
  const { buildSiteKnowledge } = await import('../../next-proof/voice-guide/site-knowledge.mjs');
  const { catalogueFromRelease, priceCatalogue } = await import('../../next-proof/catalogue-data.mjs');
  const read = (file) => JSON.parse(readFileSync(new URL(`../../next-proof/${file}`, import.meta.url), 'utf8'));
  const baked = read('data/release.json');
  const { routes } = buildSiteKnowledge(baked, { frozenBlocks: read('frozen/form-blocks.json'), catalogue: priceCatalogue(catalogueFromRelease(baked), null) });
  assert.ok(routes.length > 50);
  for (const { path } of routes) {
    assert.equal(safePath(path), path, path);
    assert.equal(isPublicPath(path), true, path);
  }
});
