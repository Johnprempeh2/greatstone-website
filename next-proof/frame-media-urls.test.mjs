import test from 'node:test';
import assert from 'node:assert/strict';
import { useInsertedMediaUrl } from './frame-media-urls.mjs';
import { mapMediaRefs } from './frame-protocol.mjs';

test('inserted media blob displays immediately under its saved media reference', () => {
  const urls = {};
  const media = { blob: new Blob(['image'], { type: 'image/png' }), alt: 'Stone arch', width: 640, height: 480 };
  const url = useInsertedMediaUrl(urls, 'media:entry-1', media, 'https://media.example.test/entry-1.png');
  assert.match(url, /^blob:/);
  assert.equal(urls['media:entry-1'], url);
  const draft = { content: [{ props: { image: 'media:entry-1', alt: media.alt } }] };
  const shown = mapMediaRefs(draft, urls);
  assert.equal(shown.content[0].props.image, url);
  assert.deepEqual(mapMediaRefs(shown, { [url]: 'media:entry-1' }), draft);
  URL.revokeObjectURL(url);
});

test('inserted media without a blob keeps a URL loaded with the draft', () => {
  const existing = URL.createObjectURL(new Blob(['loaded']));
  const urls = { 'media:entry-1': existing };
  assert.equal(useInsertedMediaUrl(urls, 'media:entry-1', undefined, 'https://media.example.test/entry-1.png'), existing);
  assert.equal(urls['media:entry-1'], existing);
  URL.revokeObjectURL(existing);
});

test('inserted media without a blob or loaded URL uses the asset URL', () => {
  const urls = {};
  const assetUrl = 'https://media.example.test/entry-1.png';
  assert.equal(useInsertedMediaUrl(urls, 'media:entry-1', undefined, assetUrl), assetUrl);
  assert.equal(urls['media:entry-1'], assetUrl);
});
