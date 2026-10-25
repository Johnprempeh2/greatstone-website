import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createServer } from 'vite';

test('desktop door pins independently of hover and focus', async () => {
  const dom = new Window({ url: 'http://localhost/' });
  const previous = { window: globalThis.window, document: globalThis.document, navigator: globalThis.navigator, HTMLElement: globalThis.HTMLElement, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom;
  globalThis.document = dom.document;
  Object.defineProperty(globalThis, 'navigator', { value: dom.navigator, configurable: true });
  globalThis.HTMLElement = dom.HTMLElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.matchMedia = (query) => ({ matches: query.includes('min-width') || query.includes('hover:hover'), addEventListener() {}, removeEventListener() {} });
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { TwoDoors } = await vite.ssrLoadModule('/src/blocks/TwoDoors.jsx');
    const root = createRoot(document.body.appendChild(document.createElement('div')));
    try {
      await act(async () => root.render(React.createElement(TwoDoors, { tide: false, moreOpen: 'Less', moreClosed: 'More' })));
      const dx = document.querySelector('#door-dx .td-more');
      const tools = document.querySelector('#door-tools .td-more');
      const doors = document.querySelector('.td-doors');
      const mouse = async (node, type) => act(async () => node.dispatchEvent(new dom.MouseEvent(type, { bubbles: true })));

      await mouse(dx, 'mouseover');
      assert.equal(dx.getAttribute('aria-expanded'), 'true', 'hover opens the door');
      await mouse(dx, 'click');
      assert.equal(dx.getAttribute('aria-expanded'), 'true', 'click pins a hovered door');
      await mouse(doors, 'mouseout');
      assert.equal(dx.getAttribute('aria-expanded'), 'true', 'pin survives mouse leave');
      await mouse(dx, 'click');
      assert.equal(dx.getAttribute('aria-expanded'), 'false', 'second click unpins');

      await act(async () => tools.focus());
      assert.equal(tools.getAttribute('aria-expanded'), 'true', 'focus opens the door');
      await mouse(tools, 'click');
      assert.equal(tools.getAttribute('aria-expanded'), 'true', 'click pins a focused door');
      await act(async () => tools.blur());
      assert.equal(tools.getAttribute('aria-expanded'), 'true', 'pin survives focus leave');
      await act(async () => doors.dispatchEvent(new dom.KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })));
      assert.equal(tools.getAttribute('aria-expanded'), 'false', 'Escape closes the door');
    } finally {
      await act(async () => root.unmount());
    }
  } finally {
    await vite.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    Object.defineProperty(globalThis, 'navigator', { value: previous.navigator, configurable: true });
    globalThis.HTMLElement = previous.HTMLElement;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});

test('tablet doors use tap to open rather than hover or focus', async () => {
  const dom = new Window({ url: 'http://localhost/' });
  const previous = { window: globalThis.window, document: globalThis.document, navigator: globalThis.navigator, HTMLElement: globalThis.HTMLElement, ResizeObserver: globalThis.ResizeObserver, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom;
  globalThis.document = dom.document;
  Object.defineProperty(globalThis, 'navigator', { value: dom.navigator, configurable: true });
  globalThis.HTMLElement = dom.HTMLElement;
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.matchMedia = (query) => ({ matches: query.includes('max-width:1023px'), addEventListener() {}, removeEventListener() {} });
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { TwoDoors } = await vite.ssrLoadModule('/src/blocks/TwoDoors.jsx');
    const root = createRoot(document.body.appendChild(document.createElement('div')));
    try {
      await act(async () => root.render(React.createElement(TwoDoors, { tide: false, moreOpen: 'Less', moreClosed: 'More' })));
      const door = document.querySelector('#door-dx');
      const more = door.querySelector('.td-more');
      await act(async () => door.dispatchEvent(new dom.MouseEvent('mouseover', { bubbles: true })));
      assert.equal(more.getAttribute('aria-expanded'), 'false', 'hover does not open a tablet door');
      await act(async () => more.focus());
      assert.equal(more.getAttribute('aria-expanded'), 'false', 'focus does not open a tablet door');
      await act(async () => more.dispatchEvent(new dom.MouseEvent('click', { bubbles: true })));
      assert.equal(more.getAttribute('aria-expanded'), 'true', 'tap opens a tablet door');
      await act(async () => more.dispatchEvent(new dom.MouseEvent('click', { bubbles: true })));
      assert.equal(more.getAttribute('aria-expanded'), 'false', 'second tap closes it');
    } finally {
      await act(async () => root.unmount());
    }
  } finally {
    await vite.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    Object.defineProperty(globalThis, 'navigator', { value: previous.navigator, configurable: true });
    globalThis.HTMLElement = previous.HTMLElement;
    globalThis.ResizeObserver = previous.ResizeObserver;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});
