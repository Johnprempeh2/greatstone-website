import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createServer } from 'vite';
import { nextProfile } from './customerAuth.mjs';

const CODES = ['aaaaa-bbbbb', 'ccccc-ddddd'];

// GRE-6351: confirming the first code used to fire the auth-changed event, the account page reloaded while
// Better Auth swapped the session, and the recovery codes screen was unmounted before anyone saw it.
test('turning on two-factor keeps the recovery codes on screen until Done', async () => {
  const dom = new Window({ url: 'http://localhost/' });
  const previous = { window: globalThis.window, document: globalThis.document, navigator: globalThis.navigator, HTMLElement: globalThis.HTMLElement, Event: globalThis.Event, fetch: globalThis.fetch, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom;
  globalThis.document = dom.document;
  Object.defineProperty(globalThis, 'navigator', { value: dom.navigator, configurable: true });
  globalThis.HTMLElement = dom.HTMLElement;
  globalThis.Event = dom.Event; // notifyAuthChange() builds the event from the global
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // The auth client keeps the fetch it finds when it is created, so stub it before the import.
  const sent = [];
  globalThis.fetch = async (input) => {
    const path = String(input?.url ?? input);
    sent.push(path);
    const body = path.endsWith('/two-factor/enable') ? { totpURI: 'otpauth://totp/Greatstone:a%40b.c?secret=ABCDEFGHIJKLMNOP&issuer=Greatstone', backupCodes: CODES }
      : { token: 'new-session', user: { id: 'u1', twoFactorEnabled: true } };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  let authChanges = 0;
  dom.addEventListener('greatstone-auth-changed', () => { authChanges += 1; });
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { default: TwoFactorCard } = await vite.ssrLoadModule('/src/store/TwoFactorCard.jsx');
    const root = createRoot(document.body.appendChild(document.createElement('div')));
    const flashes = [];
    const button = (label) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
    const click = (node) => act(async () => node.dispatchEvent(new dom.MouseEvent('click', { bubbles: true })));
    const submit = (label) => act(async () => button(label).closest('form').dispatchEvent(new dom.Event('submit', { bubbles: true, cancelable: true })));
    const type = (input, value) => act(async () => {
      Object.getOwnPropertyDescriptor(dom.HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new dom.Event('input', { bubbles: true }));
    });
    try {
      await act(async () => root.render(React.createElement(TwoFactorCard, { enabled: false, flash: (m) => flashes.push(m) })));
      await click(button('Turn on two-factor sign-in'));
      await type(document.querySelector('input[type="password"]'), 'pw');
      await submit('Continue');
      assert.ok(document.querySelector('.tf-qr'), 'QR code step shows');
      await type(document.querySelector('.tf-code'), '123 456');
      await submit('Turn on');
      assert.ok(sent.some((p) => p.endsWith('/two-factor/verify-totp')), 'first code is sent');

      const shown = [...document.querySelectorAll('.tf-codes code')].map((c) => c.textContent);
      assert.deepEqual(shown, CODES, 'recovery codes are on screen after confirm');
      assert.equal(authChanges, 0, 'confirm does not reload the account under the codes');

      await click(document.querySelector('.tf-check input'));
      await click(button('Done'));
      assert.equal(document.querySelector('.tf-codes'), null, 'Done closes the codes');
      assert.equal(authChanges, 1, 'Done reloads the account so the card reads On');
      assert.deepEqual(flashes, ['Two-factor sign-in is on.']);
    } finally {
      await act(async () => root.unmount());
    }
  } finally {
    await vite.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    Object.defineProperty(globalThis, 'navigator', { value: previous.navigator, configurable: true });
    globalThis.HTMLElement = previous.HTMLElement;
    globalThis.Event = previous.Event;
    globalThis.fetch = previous.fetch;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});

test('an empty profile reload for the same user keeps the customer profile', () => {
  const customer = { customer: { id: 'c1' } };
  assert.equal(nextProfile(customer, null, true), customer, 'same user, short null session: keep it');
  assert.equal(nextProfile(customer, null, false), null, 'different user: drop it');
  assert.equal(nextProfile(undefined, null, false), null, 'first load with no customer row: not a customer');
  assert.equal(nextProfile(null, null, true), null, 'staff stay on the not-a-customer screen');
  const fresh = { customer: { id: 'c1' }, name: 'new' };
  assert.equal(nextProfile(customer, fresh, true), fresh, 'a real reload replaces it');
});
