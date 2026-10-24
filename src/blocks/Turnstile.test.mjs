import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

// The Turnstile widget is optional (John, GRE-1794, 24 Oct): with no VITE_TURNSTILE_SITE_KEY the enquiry form
// has no widget and asks for no token; with a key it renders the widget host as before.
async function withSiteKey(key, fn) {
  const vite = await createServer({
    server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent',
    define: { 'import.meta.env.VITE_TURNSTILE_SITE_KEY': JSON.stringify(key) },
  });
  try {
    const { Turnstile, TURNSTILE_KEY } = await vite.ssrLoadModule('/src/blocks/Turnstile.jsx');
    const { BookDeepDive } = await vite.ssrLoadModule('/src/blocks/BookDeepDive.jsx');
    await fn({ Turnstile, TURNSTILE_KEY, BookDeepDive });
  } finally {
    await vite.close();
  }
}

test('no site key: no widget, in the component or in the enquiry form', async () => {
  await withSiteKey('', async ({ Turnstile, TURNSTILE_KEY, BookDeepDive }) => {
    assert.equal(TURNSTILE_KEY, '');
    assert.equal(renderToStaticMarkup(React.createElement(Turnstile, { onToken() {} })), '');
    const form = renderToStaticMarkup(React.createElement(BookDeepDive, { id: 'book-test' }));
    assert.match(form, /<form/);
    assert.doesNotMatch(form, /b-book-turnstile/);
  });
});

test('site key set: the widget host renders in the enquiry form', async () => {
  await withSiteKey('1x00000000000000000000AA', async ({ Turnstile, TURNSTILE_KEY, BookDeepDive }) => {
    assert.equal(TURNSTILE_KEY, '1x00000000000000000000AA');
    assert.match(renderToStaticMarkup(React.createElement(Turnstile, { onToken() {} })), /class="b-fd-turnstile"/);
    const form = renderToStaticMarkup(React.createElement(BookDeepDive, { id: 'book-test' }));
    assert.match(form, /class="b-book-turnstile"/);
  });
});
