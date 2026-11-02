import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { readAuthLanding, consumeVerifiedLanding } from './auth-landing.mjs';

test('verified email link opens the account gate and clears its marker after use', () => {
  const landing = readAuthLanding('?verified=1');
  assert.equal(landing.openAccount, true);
  assert.equal(landing.verified, true);
  assert.equal(landing.error, null);

  const location = { href: 'https://example.test/?verified=1&source=email' };
  let replaced;
  const history = { replaceState: (_state, _title, url) => { replaced = url; } };
  assert.equal(consumeVerifiedLanding(location, history), true);
  assert.equal(replaced, '/?source=email#account');
});

test('invalid verification link remains an account error', () => {
  const landing = readAuthLanding('?error=INVALID_TOKEN');
  assert.equal(landing.openAccount, true);
  assert.equal(landing.verified, false);
  assert.match(landing.error, /invalid or has expired/);
});

test('verified account landing shows confirmation and sign-in action', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { AuthGate } = await vite.ssrLoadModule('/src/store/AccountDashboard.jsx');
    const html = renderToStaticMarkup(React.createElement(AuthGate, { verified: true }));
    assert.match(html, /role="status">Email confirmed\. You can now sign in\./);
    assert.match(html, /class="gs-btn primary" type="submit">Sign in<\/button>/);
  } finally {
    await vite.close();
  }
});
