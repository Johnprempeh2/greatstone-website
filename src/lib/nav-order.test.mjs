import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicNavOrder, footerLegalOrder } from './nav-order.js';

// A minimal page map: home + a published + a draft content page + two footer-only legal pages.
const pages = {
  home: { title: 'Home', status: 'published' },
  about: { title: 'About', status: 'published' },
  secret: { title: 'Secret', status: 'draft' },              // unpublished content page
  terms: { title: 'Terms', status: 'draft', footerOnly: true },
  privacy: { title: 'Privacy', status: 'published', footerOnly: true },
};
const order = ['home', 'about', 'secret', 'terms', 'privacy'];

test('publicNavOrder: public sees published content pages, never footerOnly or drafts', () => {
  assert.deepEqual(publicNavOrder(order, pages, false), ['home', 'about']);
});

test('publicNavOrder: editors see every page EXCEPT footerOnly (those live only in the footer legal row)', () => {
  // draft "secret" stays (editors reach drafts); terms/privacy are pulled out despite privacy being published
  assert.deepEqual(publicNavOrder(order, pages, true), ['home', 'about', 'secret']);
});

test('publicNavOrder: home is kept even if it were somehow flagged (order[0] is never footerOnly in practice)', () => {
  assert.equal(publicNavOrder(order, pages, false)[0], 'home');
});

test('footerLegalOrder: public sees only PUBLISHED legal pages', () => {
  assert.deepEqual(footerLegalOrder(order, pages, false), ['privacy']);
});

test('footerLegalOrder: editors see every legal page including drafts (so they are reachable to edit)', () => {
  assert.deepEqual(footerLegalOrder(order, pages, true), ['terms', 'privacy']);
});

test('footerLegalOrder: preserves declared order and excludes non-legal pages', () => {
  const withMore = { ...pages, cookies: { title: 'Cookies', status: 'published', footerOnly: true } };
  const ord = ['home', 'terms', 'about', 'cookies', 'privacy'];
  assert.deepEqual(footerLegalOrder(ord, withMore, true), ['terms', 'cookies', 'privacy']);
});

test('empty / missing inputs never throw', () => {
  assert.deepEqual(publicNavOrder(undefined, pages, false), []);
  assert.deepEqual(footerLegalOrder(undefined, pages, true), []);
});
