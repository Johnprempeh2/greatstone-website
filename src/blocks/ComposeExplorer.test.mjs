import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createServer } from 'vite';

test('picking a problem lights its services, building your own toggles them, and the basket gets the selection', async () => {
  const dom = new Window({ url: 'http://localhost/' });
  const keys = ['window', 'document', 'HTMLElement', 'DOMParser', 'Node', 'localStorage', 'IntersectionObserver', 'matchMedia', 'innerHeight'];
  const previous = Object.fromEntries(keys.map((k) => [k, globalThis[k]]));
  const prevNav = globalThis.navigator, prevAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.window = dom;
  globalThis.document = dom.document;
  globalThis.HTMLElement = dom.HTMLElement;
  globalThis.DOMParser = dom.DOMParser; // RichText sanitises through DOMParser
  globalThis.Node = dom.Node;
  globalThis.localStorage = dom.localStorage;
  globalThis.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} }); // reduced motion
  globalThis.innerHeight = 800;
  Object.defineProperty(globalThis, 'navigator', { value: dom.navigator, configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { ComposeExplorer, puck } = await vite.ssrLoadModule('/src/blocks/ComposeExplorer.jsx');
    const cart = await vite.ssrLoadModule('/src/store/cart.mjs');
    const root = createRoot(document.body.appendChild(document.createElement('div')));
    const click = (node) => act(async () => node.dispatchEvent(new dom.MouseEvent('click', { bubbles: true })));
    const pressed = () => [...document.querySelectorAll('.b-compose-tile[aria-pressed="true"]')].map((b) => b.textContent);
    const status = () => document.querySelector('.b-compose-count').textContent;
    try {
      await act(async () => root.render(React.createElement(ComposeExplorer, puck.defaultProps)));
      const tiles = document.querySelectorAll('.b-compose-tile');
      assert.equal(tiles.length, 78, 'every catalogue service is a tile');
      assert.equal(document.querySelectorAll('.b-compose-group').length, 9, 'grouped by the 9 categories');
      assert.equal(status(), 'No services selected.');
      const basket = document.querySelector('.b-compose-cta.is-fill');
      assert.equal(basket.disabled, true, 'nothing to add yet');

      const all = [...document.querySelectorAll('.b-compose-problem')];
      const problem = all.find((b) => b.textContent.includes('Chasing payments'));
      assert.ok(problem, 'problems: ' + all.map((b) => JSON.stringify(b.textContent)).join(' | '));
      await click(problem);
      assert.equal(problem.getAttribute('aria-pressed'), 'true');
      assert.deepEqual(pressed().sort(), ['Automated Invoicing & Chasing', 'Automated Membership Renewals', 'Online Deposits & Patient Payments', 'Stripe Checkout Setup'],
        'names come from the catalogue, not the block');
      assert.equal(status(), '4 services selected, across 2 areas.');
      assert.ok(document.querySelector('.b-compose-layout').classList.contains('is-lit'), 'the rest dim');

      // toggling a tile directly becomes the visitor's own build
      const lit = document.querySelector('.b-compose-tile[aria-pressed="true"]');
      await click(lit);
      assert.equal(problem.getAttribute('aria-pressed'), 'false');
      assert.equal(document.querySelector('.b-compose-problem.is-own').getAttribute('aria-pressed'), 'true');
      assert.equal(status(), '3 services selected, across 2 areas.');

      await click(basket);
      assert.equal(cart.getCart().filter((l) => l.kind === 'service').length, 3, 'selection sent to the shared basket');

      // picking the same problem twice clears it
      await click(problem);
      await click(problem);
      assert.equal(status(), 'No services selected.');
    } finally {
      await act(async () => root.unmount());
    }
  } finally {
    await vite.close();
    for (const k of keys) globalThis[k] = previous[k];
    Object.defineProperty(globalThis, 'navigator', { value: prevNav, configurable: true });
    globalThis.IS_REACT_ACT_ENVIRONMENT = prevAct;
  }
});
