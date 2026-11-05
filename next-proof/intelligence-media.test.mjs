import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractOgImage, fetchPreviewImage, withNewsImages } from './intelligence-media.mjs';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const html = (head) => new Response(`<html><head>${head}</head><body></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
const png = (body = PNG) => new Response(body, { headers: { 'content-type': 'image/png' } });

// A fake web: URL -> Response (or a function returning one). Records every URL asked for.
function web(pages) {
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(url.toString());
    const page = pages[url.toString()];
    return typeof page === 'function' ? page() : page ?? new Response('missing', { status: 404 });
  };
  return { fetchImpl, asked };
}

test('extractOgImage follows GSAM order: og:image:secure_url, og:image, og:image:url, then twitter:image', () => {
  const page = 'https://news.example/story/1';
  assert.equal(extractOgImage('<meta name="twitter:image" content="/t.png"><meta property="og:image" content="/og.png">', page), 'https://news.example/og.png');
  assert.equal(extractOgImage('<meta property="og:image" content="/og.png"><meta property="og:image:secure_url" content="https://cdn.example/s.png">', page), 'https://cdn.example/s.png');
  assert.equal(extractOgImage("<meta content='a.jpg?x=1&amp;y=2' name='twitter:image'>", page), 'https://news.example/story/a.jpg?x=1&y=2');
  assert.equal(extractOgImage('<meta property="og:image" content="javascript:alert(1)">', page), null);
  assert.equal(extractOgImage('<title>No preview</title>', page), null);
});

test('fetchPreviewImage reads the page, then the preview image it names', async () => {
  const { fetchImpl, asked } = web({
    'https://news.example/a': html('<meta property="og:image" content="/img/a.png">'),
    'https://news.example/img/a.png': png(),
  });
  const media = await fetchPreviewImage('https://news.example/a', fetchImpl);
  assert.deepEqual(media, { contentType: 'image/png', body: PNG });
  assert.deepEqual(asked, ['https://news.example/a', 'https://news.example/img/a.png']);
});

test('fetchPreviewImage follows redirects and gives up on non-images, errors and private hosts', async () => {
  const { fetchImpl } = web({
    'https://news.example/moved': new Response(null, { status: 301, headers: { location: '/b' } }),
    'https://news.example/b': html('<meta property="og:image" content="https://cdn.example/b.png">'),
    'https://cdn.example/b.png': png(),
    'https://news.example/svg': html('<meta property="og:image" content="https://cdn.example/x.svg">'),
    'https://cdn.example/x.svg': new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }),
    'https://news.example/inside': html('<meta property="og:image" content="http://127.0.0.1/secret.png">'),
    'https://news.example/huge': html('<meta property="og:image" content="https://cdn.example/huge.png">'),
    'https://cdn.example/huge.png': () => png(Buffer.alloc(3 * 1024 * 1024)),
    'https://news.example/down': () => { throw new Error('offline'); },
  });
  assert.deepEqual(await fetchPreviewImage('https://news.example/moved', fetchImpl), { contentType: 'image/png', body: PNG });
  assert.equal(await fetchPreviewImage('https://news.example/svg', fetchImpl), null);
  assert.equal(await fetchPreviewImage('https://news.example/inside', fetchImpl), null);
  assert.equal(await fetchPreviewImage('https://news.example/huge', fetchImpl), null);
  assert.equal(await fetchPreviewImage('https://news.example/down', fetchImpl), null);
  assert.equal(await fetchPreviewImage('https://news.example/404', fetchImpl), null);
  assert.equal(await fetchPreviewImage('http://localhost/admin', fetchImpl), null);
});

test('withNewsImages saves each preview on the site, alt = headline, and leaves items without one unpictured', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'intel-news-'));
  try {
    const { fetchImpl } = web({
      'https://news.example/a': html('<meta property="og:image" content="/a.png">'),
      'https://news.example/a.png': png(),
      'https://news.example/b': html('<title>No preview</title>'),
    });
    const snapshot = { date: '2026-11-05', news: [
      { headline: 'Story A', url: 'https://news.example/a', image: { src: '/old.webp', alt: 'old' } },
      { headline: 'Story B', url: 'https://news.example/b', image: { src: '/old.webp', alt: 'old' } },
    ] };
    const out = await withNewsImages(snapshot, { dir, fetchImpl, shrink: async (media) => media });
    const [a, b] = out.news;
    assert.match(a.image.src, /^\/assets\/intel\/news\/[a-f0-9]{16}\.png$/);
    assert.equal(a.image.alt, 'Story A');
    assert.deepEqual(readFileSync(join(dir, a.image.src.split('/').pop())), PNG);
    assert.equal('image' in b, false);
    assert.deepEqual(readdirSync(dir).length, 1);
    assert.equal(out.date, '2026-11-05');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
