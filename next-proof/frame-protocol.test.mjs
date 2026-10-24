import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { allowedHostOrigins, blockRef, envelope, findBlock, frameCsp, mapMediaRefs, publicFrameAncestors, validHello, validMessage } from './frame-protocol.mjs';

const origin = 'https://studio.example.test';
const nonce = 'ABCDEFGHIJKLMNOPQRSTUV';
const parent = {};
globalThis.window = { parent };
const hello = { gs: 'website-frame', id: 'hello-1', type: 'hello', payload: { nonce, protocols: [1], siteId: 'site-1', mode: 'editor', pageId: 'page-1' } };

test('handshake accepts only configured exact origin and parent window', () => {
  const event = { origin, source: parent, data: hello };
  assert.deepEqual(validHello(event, [origin], 'site-1', null), { payload: hello.payload });
  assert.equal(validHello({ ...event, origin: 'https://other.example.test' }, [origin], 'site-1', null), null);
  assert.equal(validHello({ ...event, source: {} }, [origin], 'site-1', null), null);
  assert.equal(validHello({ ...event, data: { ...hello, payload: { ...hello.payload, nonce: 'bad' } } }, [origin], 'site-1', null), null);
  assert.equal(validHello(event, [origin], 'site-2', null).refused, 'site');
  assert.equal(validHello({ ...event, data: { ...hello, payload: { ...hello.payload, protocols: [2] } } }, [origin], 'site-1', null).refused, 'protocol');
  assert.equal(validHello(event, [origin], 'site-1', { origin, nonce: 'different' }), null);
});

test('draft messages need bound origin, source, version and nonce', () => {
  const bound = { origin, nonce };
  const event = { origin, source: parent, data: { gs: 'website-frame', protocol: 1, session: nonce, type: 'load-draft', payload: {} } };
  assert.equal(validMessage(event, bound, ['load-draft']), true);
  for (const variant of [{ origin: 'https://other.example.test' }, { source: {} }, { data: { ...event.data, session: 'stale' } }, { data: { ...event.data, protocol: 2 } }, { data: { ...event.data, type: 'unknown' } }]) {
    assert.equal(validMessage({ ...event, ...variant }, bound, ['load-draft']), false);
  }
  assert.equal(validMessage(event, null, ['load-draft']), false);
});

test('origin allowlist and route CSP exclude wildcard and third party scripts', () => {
  assert.deepEqual(allowedHostOrigins(`${origin},*,https://studio.example.test/path,http://localhost:5180`), [origin]);
  assert.deepEqual(allowedHostOrigins('http://localhost:5180', true), ['http://localhost:5180']);
  const csp = frameCsp([origin], 'nonce123');
  assert.match(csp, /script-src 'self' 'nonce-nonce123' 'strict-dynamic'/);
  assert.match(csp, /frame-ancestors https:\/\/studio.example.test/);
  assert.match(csp, /img-src 'self' https: blob: data:/);
  assert.match(csp, /media-src 'self' https: blob:/);
  assert.match(csp, /form-action 'none'/);
  assert.doesNotMatch(csp, /https:\/\/fonts|unsafe-eval/);
});

test('public pages allow only self and the configured GSAM origins', () => {
  assert.equal(publicFrameAncestors(), "frame-ancestors 'self' https://gsam.tail83d26c.ts.net:3100");
  assert.equal(publicFrameAncestors('https://gsam.example.test,*,https://other.test/path'), "frame-ancestors 'self' https://gsam.example.test");
});

test('static public headers permit GSAM framing without conflicting X-Frame-Options', () => {
  const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  const publicRule = headers.split('\n\n')[0];
  assert.match(publicRule, /^\/\*\n/m);
  assert.match(publicRule, /^  Content-Security-Policy: frame-ancestors 'self' https:\/\/gsam\.tail83d26c\.ts\.net:3100$/m);
  assert.doesNotMatch(headers, /^  X-Frame-Options:/m);
});

test('block reference carries stable identity and treats source as a hint', () => {
  const ref = blockRef({ type: 'Hero', props: { id: 'block-1' } }, { id: 'page-1', revisionId: 'revision-1' }, 'site-1', { version: '1', commit: 'a'.repeat(40) });
  assert.deepEqual([ref.siteId, ref.pageId, ref.pageRevisionId, ref.blockId, ref.blockType], ['site-1', 'page-1', 'revision-1', 'block-1', 'Hero']);
  assert.deepEqual(ref.source, { file: 'src/blocks/Hero.jsx', line: 290 });
  assert.match(readFileSync(new URL('../src/blocks/Hero.jsx', import.meta.url), 'utf8').split('\n')[ref.source.line - 1], /export const puck/);
  const alias = blockRef({ type: 'TwoDoorsStory', props: { id: 'story' } }, { id: 'page-1', revisionId: 'revision-1' }, 'site-1', ref.engine);
  assert.deepEqual(alias.source, { file: 'src/blocks/TwoDoors.jsx', line: 198 });
  assert.equal(blockRef({ type: 'Unknown', props: { id: 'other' } }, { id: 'page-1', revisionId: 'revision-1' }, 'site-1', ref.engine).source, null);
});

test('every preview block points to a current source definition', () => {
  const registry = readFileSync(new URL('../app/ProofBlocks.jsx', import.meta.url), 'utf8');
  const types = [...registry.matchAll(/^import \* as (\w+) from '\.\.\/src\/blocks\//gm)].map((match) => match[1]);
  assert.ok(types.length > 0);
  for (const type of types) {
    const source = blockRef({ type, props: { id: 'example' } }, { id: 'page', revisionId: 'revision' }, 'site', {}).source;
    assert.ok(source, `${type} needs a source hint`);
    assert.match(readFileSync(new URL(`../${source.file}`, import.meta.url), 'utf8').split('\n')[source.line - 1], /^export const \w+Puck =|^export const puck =/, `${type} hint points to its Puck definition`);
  }
});

test('nested blocks resolve by id and type', () => {
  const nested = { type: 'Prose', props: { id: 'child' } };
  const data = [{ type: 'Panels', props: { id: 'parent', slot: [nested] } }];
  assert.equal(findBlock(data, 'child', 'Prose'), nested);
  assert.equal(findBlock(data, 'child', 'Hero'), null);
});

test('handshake envelope has no protocol or session before agreement', () => {
  const message = envelope('hello-ack', { nonce });
  assert.equal(message.protocol, undefined);
  assert.equal(message.session, undefined);
  const after = envelope('dirty', { dirty: true }, { origin, nonce });
  assert.equal(after.protocol, 1);
  assert.equal(after.session, nonce);
});

test('media references display from blobs and save back as references', () => {
  const raw = { content: [{ props: { image: 'media:cover', caption: 'cover' } }] };
  const shown = mapMediaRefs(raw, { 'media:cover': 'blob:local-cover' });
  assert.equal(shown.content[0].props.image, 'blob:local-cover');
  assert.deepEqual(mapMediaRefs(shown, { 'blob:local-cover': 'media:cover' }), raw);
  assert.equal(raw.content[0].props.image, 'media:cover');
});
