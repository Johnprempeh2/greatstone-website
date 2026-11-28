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

test('tools carousel is the looping site carousel', async () => {
  const dom = new Window({ url: 'http://localhost/' });
  const previous = { window: globalThis.window, document: globalThis.document, navigator: globalThis.navigator, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom;
  globalThis.document = dom.document;
  Object.defineProperty(globalThis, 'navigator', { value: dom.navigator, configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.matchMedia = () => ({ matches: false });
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { TwoDoorsTools, TwoDoorsClose, TwoDoorsBottom } = await vite.ssrLoadModule('/src/blocks/TwoDoors.jsx');
    const root = createRoot(document.body.appendChild(document.createElement('div')));
    try {
      await act(async () => root.render(React.createElement(React.Fragment, null,
        React.createElement(TwoDoorsTools, { toolsKicker: 'Tools', tools: [{ name: 'One' }, { name: 'Two' }, { name: 'Three' }] }),
        React.createElement(TwoDoorsClose, { closeHeading: 'Talk' }),
        React.createElement(TwoDoorsBottom, { bottomHeading: 'Choose' }))));
      // The cards are the site carousel (app/html-behaviours.test.mjs proves the loop): three real slides,
      // with inert copies either side of them so it never meets an end.
      const slide = document.querySelector('.td-slide');
      assert.equal(slide.closest('[data-behaviour="carousel"]').getAttribute('aria-label'), 'Tools');
      assert.equal(slide.querySelectorAll('[role="group"]:not([data-carousel-clone])').length, 3);
      const copies = [...slide.querySelectorAll('[data-carousel-clone]')];
      assert.equal(copies.length, 4);
      assert.ok(copies.every((copy) => copy.hasAttribute('inert') && copy.getAttribute('aria-hidden') === 'true'));
      assert.equal(document.querySelector('[aria-label="Show Tools 1"]').getAttribute('aria-current'), 'true');
      await act(async () => document.querySelector('[aria-label="Next Tools"]').click());
      assert.equal(document.querySelector('[aria-label="Show Tools 2"]').getAttribute('aria-current'), 'true');
      await act(async () => { document.querySelector('[aria-label="Previous Tools"]').click(); document.querySelector('[aria-label="Previous Tools"]').click(); });
      assert.equal(document.querySelector('[aria-label="Show Tools 3"]').getAttribute('aria-current'), 'true', 'previous from the first wraps to the last');
      assert.equal(document.querySelectorAll('.td-segment').length, 3);
    } finally {
      await act(async () => root.unmount());
    }
  } finally {
    await vite.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    Object.defineProperty(globalThis, 'navigator', { value: previous.navigator, configurable: true });
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});

// GRE-6331 (John, 26 Nov): placeholders show to visitors, badged, until verified cases exist; showPlaceholders turns them off.
test('placeholder case studies show, marked, until verified cases exist; showPlaceholders false hides them', async () => {
  const dom = new Window({ url: 'http://localhost/' });
  const previous = { window: globalThis.window, document: globalThis.document, navigator: globalThis.navigator, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom;
  globalThis.document = dom.document;
  Object.defineProperty(globalThis, 'navigator', { value: dom.navigator, configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.matchMedia = () => ({ matches: false });
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
  try {
    const { TwoDoorsProof } = await vite.ssrLoadModule('/src/blocks/TwoDoors.jsx');
    const root = createRoot(document.body.appendChild(document.createElement('div')));
    try {
      const props = {
        proofKicker: 'Case studies', proofHeading: 'Work we will show here', draftBadge: 'PLACEHOLDER',
        draftCaseLine: 'No result is claimed here.', draftItems: [{ headline: 'Case study placeholder 01' }, { headline: 'Case study placeholder 02' }],
      };
      await act(async () => root.render(React.createElement(TwoDoorsProof, props)));
      assert.equal(document.querySelectorAll(':not([data-carousel-clone]) > .td-case-draft').length, 2, 'two placeholders, besides the loop\'s inert copies');
      assert.equal(document.querySelectorAll('.td-draft-badge')[0].textContent, 'PLACEHOLDER');
      assert.equal(document.querySelectorAll('.td-proof-pending').length, 0);
      assert.equal(document.querySelectorAll('.td-carousel [aria-roledescription="slide"]:not([data-carousel-clone])').length, 2);
      await act(async () => root.render(React.createElement(TwoDoorsProof, { ...props, showPlaceholders: false })));
      assert.equal(document.querySelectorAll('.td-case-draft').length, 0);
      assert.equal(document.querySelectorAll('.td-proof-pending').length, 1);
      assert.equal(document.querySelectorAll('.td-carousel').length, 0);
    } finally { await act(async () => root.unmount()); }
  } finally {
    await vite.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    Object.defineProperty(globalThis, 'navigator', { value: previous.navigator, configurable: true });
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});

test('story: client logos are one row of dark tiles that flows without end (GRE-5823)', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { TwoDoorsStory, publicClientMarks } = await vite.ssrLoadModule('/src/blocks/TwoDoors.jsx');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const dom = new Window();
    dom.document.body.innerHTML = renderToStaticMarkup(React.createElement(TwoDoorsStory, { tide: false }));
    const marquee = dom.document.querySelector('[data-behaviour="marquee"]');
    assert.equal(marquee.getAttribute('aria-label'), 'Clients');
    assert.equal(dom.document.querySelector('.td-public-clients [data-behaviour="carousel"], .td-public-clients[data-behaviour="carousel"]'), null, 'no slides of four any more');
    const rows = [...marquee.querySelectorAll('[data-marquee-track] > .td-clients-row')];
    assert.equal(rows.length, 2, 'the marks once, then one copy so the loop has no seam');
    assert.deepEqual(rows.map((row) => row.querySelectorAll('img').length), [publicClientMarks.length, publicClientMarks.length]);
    assert.equal(rows[0].hasAttribute('aria-hidden'), false);
    assert.equal(rows[1].getAttribute('aria-hidden'), 'true', 'a screen reader meets each client once');
    assert.ok([...rows[0].querySelectorAll('img')].every((img) => img.getAttribute('src').startsWith('/assets/two-doors/clients/light/') && img.getAttribute('alt')));
    assert.ok([...rows[1].querySelectorAll('img')].every((img) => img.getAttribute('alt') === ''), 'the copy is decorative');
    assert.equal(marquee.querySelectorAll('li').length, 0, 'no orphan list items (axe listitem)');
    assert.equal(marquee.querySelectorAll('[data-carousel-dot],[data-carousel-prev],[data-carousel-next]').length, 0, 'no stepping controls: the row flows');
    assert.equal(marquee.querySelector('[data-carousel-pause]').getAttribute('aria-pressed'), 'false');
    assert.equal(marquee.querySelector('.td-clients-viewport').getAttribute('tabindex'), '0', 'focus holds the row for keyboard visitors');
    assert.equal(dom.document.querySelector('.td-clients-slide'), null, 'the old slides are gone');
  } finally {
    await vite.close();
  }
});
