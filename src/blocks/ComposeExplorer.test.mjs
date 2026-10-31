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
    const store = await vite.ssrLoadModule('/src/store/compose-problems.mjs');
    const { problems: bundled } = await vite.ssrLoadModule('/src/data/compose-problems.mjs');
    // the site database answers with its own copy: one extra problem the bundled source does not have
    const dbRows = [...bundled, { id: 'db-only', title: 'Only in the database', subline: 'Proves the block reads the site data.', source: '', placeholder: false, services: ['live-operations-dashboard'] }];
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async (url) => (String(url) === '/api/compose-problems' ? { ok: true, json: async () => dbRows } : { ok: false });
    const root = createRoot(document.body.appendChild(document.createElement('div')));
    const click = (node) => act(async () => node.dispatchEvent(new dom.MouseEvent('click', { bubbles: true })));
    const pressed = () => [...document.querySelectorAll('.b-compose-tile[aria-pressed="true"]')].map((b) => b.textContent);
    const status = () => document.querySelector('.b-compose-count').textContent;
    try {
      assert.equal('problems' in puck.defaultProps, false, 'problems are site data, never copied into the page');
      await act(async () => root.render(React.createElement(ComposeExplorer, puck.defaultProps)));
      await act(async () => { await store.loadComposeProblems(); });
      assert.ok([...document.querySelectorAll('.b-compose-ptitle')].some((t) => t.textContent === 'Only in the database'), 'problems come from the database');
      const tiles = document.querySelectorAll('.b-compose-tile');
      assert.equal(tiles.length, 78, 'every catalogue service is a tile');
      assert.equal(document.querySelectorAll('.b-compose-group').length, 9, 'grouped by the 9 categories');
      assert.equal(status(), 'No services selected.');
      const board = document.querySelector('.b-compose-board');
      assert.equal(board.hidden, true, 'the full catalogue is folded until asked for');
      assert.equal(document.querySelector('.b-compose-cta.is-fill'), null, 'nothing to add yet');
      assert.equal(document.querySelectorAll('.b-compose-problem').length, 7, 'build your own is not a problem card');

      const all = [...document.querySelectorAll('.b-compose-problem')];
      const problem = all.find((b) => b.textContent.includes('Chasing payments'));
      assert.ok(problem, 'problems: ' + all.map((b) => JSON.stringify(b.textContent)).join(' | '));
      await click(problem);
      assert.equal(problem.getAttribute('aria-pressed'), 'true');
      const expected = ['Automated Invoicing & Chasing', 'Automated Membership Renewals', 'Online Deposits & Patient Payments', 'Stripe Checkout Setup'];
      assert.deepEqual([...document.querySelectorAll('.b-compose-picked li')].map((li) => li.textContent).sort(), expected,
        'the answer lists the lit services right under the problems');
      assert.deepEqual(pressed().sort(), expected, 'names come from the catalogue, not the block');
      assert.equal(status(), 'For chasing payments and renewals: 4 services across 2 areas.', 'the answer names its problem');
      assert.ok(document.querySelector('.b-compose-layout').classList.contains('is-lit'), 'the rest dim');
      assert.equal(board.hidden, true, 'picking a problem does not unfold the catalogue');

      const edit = document.querySelector('.b-compose-toggle');
      assert.equal(edit.textContent, 'Edit this list');
      assert.equal(edit.getAttribute('aria-expanded'), 'false');
      await click(edit);
      assert.equal(board.hidden, false);
      assert.equal(edit.getAttribute('aria-expanded'), 'true');
      assert.ok(document.querySelector('.b-compose-bar'), 'the one-line bar rides along the open board');

      // toggling a tile directly becomes the visitor's own build
      const lit = document.querySelector('.b-compose-tile[aria-pressed="true"]');
      await click(lit);
      assert.equal(problem.getAttribute('aria-pressed'), 'false');
      assert.equal(document.querySelector('.b-compose-own').getAttribute('aria-pressed'), 'true');
      assert.equal(status(), '3 services selected, across 2 areas.');

      await click(document.querySelector('.b-compose-answer .b-compose-cta.is-fill'));
      assert.equal(cart.getCart().filter((l) => l.kind === 'service').length, 3, 'selection sent to the shared basket');

      // building your own from scratch clears the answer and keeps the catalogue open; again folds it
      const own = document.querySelector('.b-compose-own');
      await click(own); // already custom: clears and folds
      assert.equal(board.hidden, true);
      await click(own);
      assert.equal(own.getAttribute('aria-pressed'), 'true');
      assert.equal(board.hidden, false, 'build your own unfolds the catalogue');
      assert.equal(status(), 'No services selected.');

      // picking the same problem twice clears it
      await click(problem);
      await click(problem);
      assert.equal(status(), 'No services selected.');
    } finally {
      await act(async () => root.unmount());
      globalThis.fetch = prevFetch;
      store.resetComposeProblems();
    }
  } finally {
    await vite.close();
    for (const k of keys) globalThis[k] = previous[k];
    Object.defineProperty(globalThis, 'navigator', { value: prevNav, configurable: true });
    globalThis.IS_REACT_ACT_ENVIRONMENT = prevAct;
  }
});
