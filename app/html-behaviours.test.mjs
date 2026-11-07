import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { attachBehaviour, attachBehaviours } from './html-behaviours.mjs';

// A page region holding `html`, in a window whose reduced-motion setting the test chooses.
function page(html, { reduced = false } = {}) {
  const window = new Window({ url: 'https://example.test/', width: 1440, height: 900 });
  window.matchMedia = (query) => ({ matches: reduced && query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} });
  window.document.body.innerHTML = `<main data-gs-scope="page">${html}</main>`;
  const root = window.document.querySelector('[data-gs-scope="page"]');
  return { window, document: window.document, root, detach: attachBehaviours(root, window) };
}
const key = (window, target, name) => target.dispatchEvent(new window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));

test('reveal: content in view settles in now, the rest when it scrolls in, all of it with reduced motion', () => {
  const html = '<section><h2 data-reveal>One</h2><p data-reveal>Two</p></section>';
  const { root } = page(html, { reduced: true });
  assert.equal(root.querySelectorAll('.is-in').length, 2);

  const moving = page(html);
  const [first, second] = moving.root.querySelectorAll('[data-reveal]');
  assert.ok(first.classList.contains('is-in'), 'above the fold reveals at once');
  assert.equal(second.style.getPropertyValue('--gs-reveal-delay'), '70ms', 'staggered within its section');
});

test('more: the button unclamps its panel body, says Less, and closes again', () => {
  const { root } = page(`<section data-behaviour="more"><p id="more-p-0" class="b-panel-body is-clamped">Long text</p>
    <button type="button" aria-expanded="false" aria-controls="more-p-0" data-label-closed="More" data-label-open="Less">More</button></section>`);
  const button = root.querySelector('button');
  const body = root.querySelector('#more-p-0');
  button.click();
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(button.textContent, 'Less');
  assert.equal(body.classList.contains('is-clamped'), false);
  button.click();
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(button.textContent, 'More');
  assert.ok(body.classList.contains('is-clamped'));
});

test('faq: a closed answer is inert; opening one leaves the others as they are', () => {
  const item = (n) => `<div class="b-faq-item"><h3><button type="button" class="b-faq-q" aria-expanded="false" aria-controls="a${n}" id="q${n}">Q${n}</button></h3>
    <div class="b-faq-a" id="a${n}" role="region" aria-labelledby="q${n}"><p>A${n}</p></div></div>`;
  const { root } = page(`<section data-behaviour="faq">${item(1)}${item(2)}</section>`);
  const [one, two] = root.querySelectorAll('.b-faq-q');
  assert.ok(root.querySelector('#a1').hasAttribute('inert'), 'closed on load, even when the HTML lost inert');
  one.click();
  assert.equal(one.getAttribute('aria-expanded'), 'true');
  assert.equal(root.querySelector('#a1').hasAttribute('inert'), false);
  assert.ok(one.closest('.b-faq-item').classList.contains('is-open'));
  assert.ok(root.querySelector('#a2').hasAttribute('inert'));
  assert.equal(two.closest('.b-faq-item').classList.contains('is-open'), false);
  one.click();
  assert.ok(root.querySelector('#a1').hasAttribute('inert'));
  assert.equal(one.closest('.b-faq-item').classList.contains('is-open'), false);
});

const TABS = `<section data-behaviour="tabs"><div role="tablist" aria-label="Choose">
  <button type="button" role="tab" id="t0" aria-controls="panel" aria-selected="true" tabindex="0">A</button>
  <button type="button" role="tab" id="t1" aria-controls="panel" aria-selected="false" tabindex="-1">B</button>
  <button type="button" role="tab" id="t2" aria-controls="panel" aria-selected="false" tabindex="-1">C</button>
  <span data-tab-indicator></span></div>
  <h2 aria-live="polite"><span data-tab="0">Head A</span><span data-tab="1" hidden>Head B</span><span data-tab="2" hidden>Head C</span></h2>
  <div id="panel" role="tabpanel" aria-labelledby="t0" data-tab-fade><h3 data-tab="0">A</h3><h3 data-tab="1" hidden>B</h3><h3 data-tab="2" hidden>C</h3></div></section>`;
const shown = (root) => [...root.querySelectorAll('h3')].filter((item) => !item.hidden).map((item) => item.textContent);

test('tabs: a click selects the tab and shows its parts only', () => {
  const { root } = page(TABS, { reduced: true });
  root.querySelector('#t1').click();
  assert.deepEqual([...root.querySelectorAll('[role=tab]')].map((tab) => [tab.getAttribute('aria-selected'), tab.tabIndex]),
    [['false', -1], ['true', 0], ['false', -1]]);
  assert.deepEqual(shown(root), ['B']);
  assert.deepEqual([...root.querySelectorAll('h2 span')].filter((item) => !item.hidden).map((item) => item.textContent), ['Head B']);
  assert.equal(root.querySelector('#panel').getAttribute('aria-labelledby'), 't1');
  assert.match(root.querySelector('[data-tab-indicator]').getAttribute('style'), /width: \d+px !important/);
});

test('tabs: arrows wrap and move focus, Home and End jump', () => {
  const { window, root } = page(TABS, { reduced: true });
  const tab = (id) => root.querySelector(`#${id}`);
  key(window, tab('t0'), 'ArrowLeft');
  assert.equal(window.document.activeElement, tab('t2'));
  assert.deepEqual(shown(root), ['C']);
  key(window, tab('t2'), 'ArrowRight');
  assert.deepEqual(shown(root), ['A']);
  key(window, tab('t0'), 'End');
  assert.deepEqual(shown(root), ['C']);
  key(window, tab('t2'), 'Home');
  assert.equal(window.document.activeElement, tab('t0'));
  assert.deepEqual(shown(root), ['A']);
  key(window, tab('t0'), 'Tab');
  assert.deepEqual(shown(root), ['A'], 'other keys do nothing');
});

test('tabs: with motion the content fades out, then swaps', async () => {
  const { window, root } = page(TABS);
  root.querySelector('#t2').click();
  assert.ok(root.querySelector('#panel').classList.contains('is-swapping'));
  assert.deepEqual(shown(root), ['A'], 'still the old content while it fades');
  await new Promise((resolve) => window.setTimeout(resolve, 260));
  assert.deepEqual(shown(root), ['C']);
  assert.equal(root.querySelector('#panel').classList.contains('is-swapping'), false);
});

const CLIMB = `<section class="b-map map-stage" data-behaviour="climb"><svg viewBox="0 0 1200 760">
  <path class="peak-cap" d="M0,0"/><circle class="summit-glow" r="1"/><path class="trail-draw" d="M0,0 L100,0"/><g class="climber"></g>
  <g class="tier-glow-lbl"></g><g class="tier-glow-lbl"></g><g class="tier-glow-lbl"></g></svg>
  <article class="tier-card"></article><article class="tier-card"></article><article class="tier-card"></article>
  <div class="track"><div class="fill climb-fill"></div></div><span class="climb-pct">0%</span></section>`;
function climbPage(options) {
  const window = new Window({ url: 'https://example.test/', width: 1440, height: 900 });
  // happy-dom has no SVG geometry: a straight 100-unit trail.
  for (const type of [window.SVGElement, window.SVGGeometryElement, window.SVGPathElement].filter(Boolean)) {
    type.prototype.getTotalLength = () => 100;
    type.prototype.getPointAtLength = (at) => ({ x: at, y: 0 });
  }
  window.matchMedia = (query) => ({ matches: Boolean(options.reduced) && query.includes('reduce') });
  window.document.body.innerHTML = `<main data-gs-scope="page">${CLIMB}</main>`;
  const stage = window.document.querySelector('.map-stage');
  Object.defineProperty(stage, 'offsetHeight', { value: 2900 });
  stage.getBoundingClientRect = () => ({ top: -options.scrolled });
  attachBehaviours(window.document.querySelector('main'), window);
  return { window, root: stage };
}

test('climb: with reduced motion the map settles at the summit, peak lit', () => {
  const { root } = climbPage({ reduced: true });
  assert.equal(root.querySelector('.climb-pct').textContent, '100%');
  assert.equal(root.querySelector('.climber').getAttribute('transform'), 'translate(100,0)');
  assert.deepEqual([...root.querySelectorAll('.tier-card')].map((card) => card.classList.contains('active')), [false, false, true]);
  assert.match(root.querySelector('.summit-glow').getAttribute('style'), /opacity: 0\.900 !important/);
});

test('climb: scrolling halfway draws half the trail and lights the middle tier', async () => {
  const { window, root } = climbPage({ scrolled: 1000 }); // 2900 - 900 = 2000 scrollable
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
  assert.equal(root.querySelector('.climb-pct').textContent, '50%');
  assert.equal(root.querySelector('.climber').getAttribute('transform'), 'translate(50,0)');
  assert.deepEqual([...root.querySelectorAll('.tier-card')].map((card) => card.classList.contains('active')), [false, true, false]);
  assert.deepEqual([...root.querySelectorAll('.tier-glow-lbl')].map((label) => /opacity: 1 /.test(label.getAttribute('style'))), [true, true, false]);
});

test('grow: a chart in view grows now; one below the fold when it scrolls in', () => {
  const grown = (top) => {
    const window = new Window({ url: 'https://example.test/', width: 1440, height: 900 });
    window.matchMedia = () => ({ matches: false });
    let observed = null;
    window.IntersectionObserver = class { constructor(callback) { observed = callback; } observe() {} disconnect() {} };
    window.document.body.innerHTML = '<main><div class="b-tiein-chart" data-behaviour="grow"></div></main>';
    const chart = window.document.querySelector('.b-tiein-chart');
    chart.getBoundingClientRect = () => ({ top, bottom: top + 300 });
    attachBehaviours(window.document.querySelector('main'), window);
    return { chart, scrollIn: () => observed([{ isIntersecting: true, target: chart }]) };
  };
  assert.ok(grown(400).chart.classList.contains('is-grown'));
  const below = grown(2000);
  assert.equal(below.chart.classList.contains('is-grown'), false);
  below.scrollIn();
  assert.ok(below.chart.classList.contains('is-grown'));
});

const CAROUSEL = (extra = '') => `<section data-behaviour="carousel" aria-roledescription="carousel" aria-label="Clients"${extra}>
  <div data-carousel-track><div>A</div><div>B</div><div>C</div></div>
  <button type="button" data-carousel-prev aria-label="Previous">‹</button><button type="button" data-carousel-next aria-label="Next">›</button>
  <button type="button" data-carousel-dot="0">1</button><button type="button" data-carousel-dot="1">2</button><button type="button" data-carousel-dot="2">3</button>
  <button type="button" data-carousel-pause aria-pressed="false">Pause</button></section>`;
const slideShown = (root) => [...root.querySelectorAll('[data-carousel-track] > *')].findIndex((slide) => slide.classList.contains('is-active'));

test('carousel: next, previous and dots move the shown slide and wrap at the ends', () => {
  const { root, window } = page(CAROUSEL());
  assert.equal(slideShown(root), 0);
  assert.equal(root.querySelector('[data-carousel-dot="0"]').getAttribute('aria-current'), 'true');
  root.querySelector('[data-carousel-prev]').click();
  assert.equal(slideShown(root), 2, 'previous from the first wraps to the last');
  root.querySelector('[data-carousel-next]').click();
  assert.equal(slideShown(root), 0);
  root.querySelector('[data-carousel-dot="1"]').click();
  assert.equal(slideShown(root), 1);
  assert.equal(root.querySelector('[data-carousel-dot="0"]').hasAttribute('aria-current'), false);
  key(window, root.querySelector('[data-carousel-track]'), 'ArrowRight');
  assert.equal(slideShown(root), 2);
});

test('carousel: autoplay advances, and stops while paused or with reduced motion', () => {
  // Run the timer by hand: attach again with a setTimeout that keeps the callback.
  const manual = (reduced) => {
    const view = page(CAROUSEL(' data-autoplay="3000"'), { reduced });
    view.detach();
    let tick = null;
    view.window.setTimeout = (fn) => { tick = fn; return 1; };
    view.window.clearTimeout = () => {};
    view.root.querySelector('[data-carousel-track]').scrollTo = () => {}; // no layout here
    view.detach = attachBehaviours(view.root, view.window);
    return { ...view, tick: () => tick() };
  };
  const moving = manual(false);
  moving.tick();
  assert.equal(slideShown(moving.root), 1, 'autoplay moved on');
  moving.root.querySelector('[data-carousel-pause]').click();
  assert.equal(moving.root.querySelector('[data-carousel-pause]').getAttribute('aria-pressed'), 'true');
  moving.tick();
  assert.equal(slideShown(moving.root), 1, 'paused stays put');
  moving.detach();

  const still = manual(true);
  still.tick();
  assert.equal(slideShown(still.root), 0, 'reduced motion never rotates');
  still.detach();
});

test('carousel: an element the island attached is not attached again by the page scan', () => {
  const window = new Window({ url: 'https://example.test/' });
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.document.body.innerHTML = `<main data-gs-scope="page">${CAROUSEL()}</main>`;
  const root = window.document.querySelector('main');
  const own = attachBehaviour(root.querySelector('[data-behaviour]'), window);
  const scan = attachBehaviours(root, window);
  const pause = root.querySelector('[data-carousel-pause]');
  pause.click();
  assert.equal(pause.getAttribute('aria-pressed'), 'true', 'one click toggles once, not twice');
  scan();
  root.querySelector('[data-carousel-next]').click();
  assert.equal(slideShown(root), 1, 'the first caller still owns it');
  own();
  root.querySelector('[data-carousel-next]').click();
  assert.equal(slideShown(root), 1, 'detached');
});

test('detach removes the listeners; unknown behaviours are ignored', () => {
  const { root, detach } = page(`<section data-behaviour="carousel"></section>
    <section data-behaviour="more"><p id="b" class="is-clamped">x</p><button type="button" aria-expanded="false" aria-controls="b">More</button></section>`);
  detach();
  root.querySelector('button').click();
  assert.equal(root.querySelector('button').getAttribute('aria-expanded'), 'false');
});
