import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBuiltLinks } from './check-built-links.mjs';

const pages = {
  '/': '<a href="#choose">Choose</a><div id="choose"></div><a href="#go/proof">Proof</a><a href="/missing">Broken</a>',
  '/proof': '<h1>Proof</h1>',
};
const fetchPage = async (url) => {
  const html = pages[url.pathname];
  return { status: html ? 200 : 404, ok: Boolean(html), text: async () => html };
};

test('built-page checker catches missing routes and anchors', async () => {
  const result = await checkBuiltLinks('https://test.invalid', ['/', '/proof'], fetchPage);
  assert.equal(result.pages, 2);
  assert.equal(result.mappedLegacy, 1);
  assert.match(result.failures.join('\n'), /\/missing returned 404/);
  pages['/'] = '<a href="#gone">Gone</a>';
  const anchorResult = await checkBuiltLinks('https://test.invalid', ['/', '/proof'], fetchPage);
  assert.match(anchorResult.failures.join('\n'), /no #gone anchor/);
});

test('built-page checker rejects legacy #go/ links even when they resolve', async () => {
  pages['/'] = '<a href="#go/proof">Proof</a>';
  const result = await checkBuiltLinks('https://test.invalid', ['/', '/proof'], fetchPage);
  assert.match(result.failures.join('\n'), /\/.*#go\/proof.*legacy/i);
});
