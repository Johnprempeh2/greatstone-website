import test from 'node:test';
import assert from 'node:assert/strict';
import { insertMedia, insertMediaResult } from './frame-insert-media.mjs';
import { validMessage } from './frame-protocol.mjs';

const mediaField = { type: 'custom', render: () => ({ type: 'MediaField' }) };
const textField = { type: 'text' };
const components = {
  Figure: { fields: { image: mediaField, alt: textField, caption: textField } },
  Gallery: { fields: { slides: { type: 'array', arrayFields: { image: mediaField, imageAlt: textField } } } },
};
const isMediaField = (field) => field.type === 'image' || field.type === 'video' || field.render?.({})?.type === 'MediaField';
const payload = { blockId: 'block-1', field: 'image', mediaEntryId: 'entry-1', assetUrl: 'https://media.example.test/entry-1.webp', alt: 'Stone arch' };

test('insert-media updates the draft media reference and alt, and reports dirty without saving', () => {
  const draft = { content: [{ type: 'Figure', props: { id: 'block-1', image: '', alt: '', caption: 'Keep this' } }] };
  const result = insertMedia(draft, components, payload, isMediaField);
  assert.equal(result.ok, true);
  assert.equal(result.dirty, true);
  assert.equal(result.mediaRef, 'media:entry-1');
  assert.equal(result.assetUrl, payload.assetUrl);
  assert.deepEqual(result.data.content[0].props, { id: 'block-1', image: 'media:entry-1', alt: 'Stone arch', caption: 'Keep this' });
  assert.equal(draft.content[0].props.image, '');
});

test('insert-media rejects missing blocks and fields, and fields that do not take media', () => {
  const draft = { content: [{ type: 'Figure', props: { id: 'block-1', image: '', alt: '', caption: '' } }] };
  assert.equal(insertMedia(draft, components, { ...payload, blockId: 'missing' }, isMediaField).code, 'block_not_found');
  assert.equal(insertMedia(draft, components, { ...payload, field: 'missing' }, isMediaField).code, 'field_not_found');
  assert.equal(insertMedia(draft, components, { ...payload, field: 'caption' }, isMediaField).code, 'field_not_media');
  assert.equal(draft.content[0].props.image, '');
});

test('insert-media can target a media field inside a Puck array', () => {
  const draft = { content: [{ type: 'Gallery', props: { id: 'block-1', slides: [{ image: '', imageAlt: '' }] } }] };
  const result = insertMedia(draft, components, { ...payload, field: 'slides.0.image' }, isMediaField);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.content[0].props.slides[0], { image: 'media:entry-1', imageAlt: 'Stone arch' });
  assert.equal(insertMedia(draft, components, { ...payload, field: 'slides.1.image' }, isMediaField).code, 'field_not_found');
});

test('insert-media uses the same bound origin, parent, session and protocol checks', () => {
  const parent = {};
  globalThis.window = { parent };
  const bound = { origin: 'https://studio.example.test', nonce: 'ABCDEFGHIJKLMNOPQRSTUV' };
  const event = { origin: bound.origin, source: parent, data: { gs: 'website-frame', protocol: 1, session: bound.nonce, type: 'insert-media', payload } };
  assert.equal(validMessage(event, bound, ['insert-media']), true);
  assert.equal(validMessage({ ...event, origin: 'https://other.example.test' }, bound, ['insert-media']), false);
  assert.equal(validMessage({ ...event, source: {} }, bound, ['insert-media']), false);
  assert.equal(validMessage({ ...event, data: { ...event.data, session: 'wrong' } }, bound, ['insert-media']), false);
  assert.equal(validMessage({ ...event, data: { ...event.data, protocol: 2 } }, bound, ['insert-media']), false);
});

test('insert-media replies with the matching request id and only contract fields', () => {
  assert.deepEqual(insertMediaResult('request-1', { ok: true, dirty: true }), { requestId: 'request-1', ok: true });
  assert.deepEqual(insertMediaResult('request-2', { ok: false, code: 'field_not_media', message: 'Wrong field', data: {} }),
    { requestId: 'request-2', ok: false, code: 'field_not_media', message: 'Wrong field' });
});

test('insert-media rejects invalid payloads and unsafe asset URLs', () => {
  const draft = { content: [{ type: 'Figure', props: { id: 'block-1', image: '', alt: '' } }] };
  for (const assetUrl of ['http://media.example.test/a.png', '//media.example.test/a.png', '/\\media.example.test/a.png', 'javascript:alert(1)', 'https://user:pass@media.example.test/a.png', 'a.png']) {
    assert.equal(insertMedia(draft, components, { ...payload, assetUrl }, isMediaField).code, 'invalid_payload');
  }
  assert.equal(insertMedia(draft, components, { ...payload, assetUrl: '/media/a.png' }, isMediaField).ok, true);
  assert.equal(insertMedia(draft, components, { ...payload, mediaEntryId: '' }, isMediaField).code, 'invalid_payload');
  assert.equal(insertMedia(draft, components, { ...payload, alt: null }, isMediaField).code, 'invalid_payload');
  assert.equal(draft.content[0].props.image, '');
});
