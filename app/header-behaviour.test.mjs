import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { fitBar, siteHeader } from './header-behaviour.mjs';
import { attachBehaviours } from './html-behaviours.mjs';

// The exported header (next-proof/html-chrome.mjs) in short: About, a Services dropdown, "More" and the phone menu.
const HEADER = '<div data-gs-scope="header"><header class="gs-header" data-behaviour="site-header" data-td-paths="/ /dev-tools"><div class="gs-navwrap">'
  + '<div class="gs-nav gs-nav-measure" aria-hidden="true"><span>About</span><span>Services</span><span>More</span></div>'
  + '<nav class="gs-nav" aria-label="Primary"><a class="gs-navlink" href="/about" data-leaf="0"><span>About</span></a>'
  + '<div class="gs-navgroup" data-leaf="1"><button type="button" class="gs-navlink gs-navgroup-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="navgroup-1">Services</button>'
  + '<div class="gs-navmenu-pop gs-navgroup-pop" role="menu" id="navgroup-1" hidden><a role="menuitem" class="gs-navmenu-item" href="/services">Services</a><a role="menuitem" class="gs-navmenu-item" href="/services#web">Web</a></div></div>'
  + '<div class="gs-navgroup" data-more hidden><button type="button" class="gs-navlink gs-navgroup-btn" aria-expanded="false" aria-controls="navgroup-more">More</button>'
  + '<div class="gs-navmenu-pop gs-navgroup-pop" role="menu" id="navgroup-more" hidden><a role="menuitem" class="gs-navmenu-item" href="/about" data-leaf="0" hidden>About</a>'
  + '<a role="menuitem" class="gs-navmenu-item" href="/services" data-leaf="1" hidden>Services</a></div></div></nav>'
  + '<nav class="gs-navmenu" aria-label="Primary" hidden><button type="button" id="navmenu-btn" class="gs-navmenu-btn" aria-expanded="false" aria-controls="navmenu-pop"><span data-menu-label>Menu</span></button>'
  + '<div class="gs-navmenu-pop" role="menu" id="navmenu-pop" hidden><a role="menuitem" class="gs-navmenu-item" href="/about">About</a><a role="menuitem" class="gs-navmenu-item gs-navmenu-book" href="/contact" data-cta="menu">Book</a></div></nav></div>'
  + '<a class="gs-btn primary gs-book" href="/contact" data-cta="header">Book</a></header></div>';

function setup(path, { narrow = false } = {}) {
  const window = new Window({ url: `https://example.test${path}` });
  window.matchMedia = (query) => ({ matches: narrow && query === '(max-width:760px)' });
  window.document.body.innerHTML = HEADER;
  return { window, document: window.document, header: window.document.querySelector('header') };
}

test('the bar fits what the row allows; "More" takes the rest; narrow or too few collapse it', () => {
  const base = { widths: [100, 100, 100, 100], moreWidth: 60, gap: 10, pinned: false, narrow: false };
  assert.deepEqual(fitBar({ ...base, available: 430 }), { fit: 4, collapsed: false });
  assert.deepEqual(fitBar({ ...base, available: 400 }), { fit: 3, collapsed: false });
  assert.deepEqual(fitBar({ ...base, available: 250 }), { fit: 1, collapsed: true });
  assert.deepEqual(fitBar({ ...base, available: 430, pinned: true }), { fit: 3, collapsed: false });
  assert.deepEqual(fitBar({ ...base, available: 2000, narrow: true }), { fit: 4, collapsed: true });
});

test('the header marks its page, its dropdown and the Two Doors look', () => {
  const { header } = setup('/services');
  const stop = attachBehaviours(header.parentElement, undefined, { path: '/services', title: 'Services' });
  const current = [...header.querySelectorAll('[aria-current="page"]')].map((link) => link.closest('[id]')?.id || 'bar');
  assert.deepEqual(current, ['navgroup-1', 'navgroup-more']);
  // "More" holds the page too, but shows none of its links while the bar fits.
  assert.equal(header.querySelector('[aria-controls="navgroup-more"]').classList.contains('is-active'), false);
  assert.equal(header.querySelector('[aria-controls="navgroup-1"]').classList.contains('is-active'), true);
  assert.equal(header.querySelector('a[href="/services#web"]').hasAttribute('aria-current'), false);
  assert.equal(header.classList.contains('td-header'), false);
  assert.equal(header.querySelector('[data-menu-label]').textContent, 'Services');
  stop();
  const home = setup('/');
  siteHeader(home.header, home.window, { path: '/', title: 'Home' });
  assert.equal(home.header.classList.contains('td-header'), true);
  assert.equal(home.header.querySelector('[data-menu-label]').textContent, 'Menu');
});

test('a narrow screen shows the phone menu instead of the bar', () => {
  const { header, window } = setup('/about', { narrow: true });
  siteHeader(header, window, { path: '/about', title: 'About' });
  assert.equal(header.querySelector('nav.gs-nav').hidden, true);
  assert.equal(header.querySelector('nav.gs-navmenu').hidden, false);
  assert.equal(header.querySelector('.gs-navwrap').classList.contains('is-collapsed'), true);
  const wide = setup('/about');
  siteHeader(wide.header, wide.window, { path: '/about' });
  assert.equal(wide.header.querySelector('nav.gs-nav').hidden, false);
  assert.equal(wide.header.querySelector('nav.gs-navmenu').hidden, true);
  assert.equal(wide.header.querySelector('[data-more]').hidden, true);
});

test('a dropdown opens on click and ArrowDown, and closes on Escape and an outside click', async () => {
  const { header, window, document } = setup('/about');
  const stop = siteHeader(header, window, { path: '/about' });
  const button = header.querySelector('[aria-controls="navgroup-1"]');
  const menu = document.getElementById('navgroup-1');
  button.click();
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(menu.hidden, false);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(document.activeElement, menu.querySelector('a'));
  menu.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  assert.equal(document.activeElement, menu.querySelectorAll('a')[1]);
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(menu.hidden, true);
  assert.equal(document.activeElement, button);
  button.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  assert.equal(menu.hidden, false);
  document.body.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
  assert.equal(menu.hidden, true);
  stop();
  button.click();
  assert.equal(menu.hidden, true, 'detached');
});

test('the phone menu button toggles, and a CTA click is counted with where it was', () => {
  const { header, window, document } = setup('/about', { narrow: true });
  const events = [];
  siteHeader(header, window, { path: '/about', track: (name, params) => events.push([name, params]) });
  const button = header.querySelector('.gs-navmenu-btn');
  button.click();
  assert.equal(document.getElementById('navmenu-pop').hidden, false);
  button.click();
  assert.equal(document.getElementById('navmenu-pop').hidden, true);
  header.querySelector('.gs-book').addEventListener('click', (event) => event.preventDefault());
  header.querySelector('.gs-book').click();
  assert.deepEqual(events, [['cta_click', { cta: 'book_deep_dive', cta_location: 'header' }]]);
});
