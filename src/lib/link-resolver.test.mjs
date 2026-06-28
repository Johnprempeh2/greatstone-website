import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLink, hasLink, describeLink } from './link-resolver.mjs';

const pages = { services: { title: 'Services' }, home: { title: 'Home' } };

test('legacy strings resolve through the safe-url guard', () => {
  assert.deepEqual(resolveLink('#book'), { href: '#book' });
  assert.deepEqual(resolveLink('#go/services'), { href: '#go/services' });
  assert.deepEqual(resolveLink('https://example.com'), { href: 'https://example.com' });
  assert.deepEqual(resolveLink('mailto:a@b.com'), { href: 'mailto:a@b.com' });
  assert.deepEqual(resolveLink(''), { href: '#' });
  assert.deepEqual(resolveLink('   '), { href: '#' });
});

test('legacy strings with a dangerous protocol are neutralised', () => {
  assert.equal(resolveLink('javascript:alert(1)').href, '#');
  assert.equal(resolveLink('JavaScript:alert(1)').href, '#');
});

test('structured page links become #go/<slug>', () => {
  assert.deepEqual(resolveLink({ kind: 'page', page: 'services' }), { href: '#go/services' });
  assert.deepEqual(resolveLink({ kind: 'page', page: '' }), { href: '#' });
});

test('structured booking link becomes #book', () => {
  assert.deepEqual(resolveLink({ kind: 'booking' }), { href: '#book' });
});

test('structured email link is sanitised to mailto:', () => {
  assert.deepEqual(resolveLink({ kind: 'email', email: 'hi@greatstone.dev' }), { href: 'mailto:hi@greatstone.dev' });
  assert.equal(resolveLink({ kind: 'email', email: 'not-an-email' }).href, '#');
});

test('structured anchor link strips leading hashes', () => {
  assert.deepEqual(resolveLink({ kind: 'anchor', anchor: 'pricing' }), { href: '#pricing' });
  assert.deepEqual(resolveLink({ kind: 'anchor', anchor: '##pricing' }), { href: '#pricing' });
  assert.deepEqual(resolveLink({ kind: 'anchor', anchor: '' }), { href: '#' });
});

test('structured url link honours new-tab and sanitises', () => {
  assert.deepEqual(resolveLink({ kind: 'url', url: 'https://x.com', newTab: true }), { href: 'https://x.com', target: '_blank', rel: 'noopener noreferrer' });
  assert.deepEqual(resolveLink({ kind: 'url', url: 'https://x.com' }), { href: 'https://x.com' });
  assert.equal(resolveLink({ kind: 'url', url: 'javascript:evil()' }).href, '#');
  assert.deepEqual(resolveLink({ kind: 'url', url: '' }), { href: '#' });
});

test('unknown / blank structured value falls back gracefully', () => {
  assert.deepEqual(resolveLink({}), { href: '#' });
  assert.deepEqual(resolveLink({ url: 'https://x.com' }), { href: 'https://x.com' });
  assert.deepEqual(resolveLink(null), { href: '#' });
  assert.deepEqual(resolveLink(undefined), { href: '#' });
});

test('hasLink reflects whether a target is set', () => {
  assert.equal(hasLink({ kind: 'page', page: 'services' }), true);
  assert.equal(hasLink({ kind: 'booking' }), true);
  assert.equal(hasLink(''), false);
  assert.equal(hasLink('#'), false);
  assert.equal(hasLink({ kind: 'page', page: '' }), false);
});

test('describeLink reads back a human label', () => {
  assert.equal(describeLink('#book'), 'Opens the booking flow');
  assert.equal(describeLink('#go/services', pages), 'Page: Services');
  assert.equal(describeLink({ kind: 'page', page: 'services' }, pages), 'Page: Services');
  assert.equal(describeLink({ kind: 'url', url: 'https://x.com', newTab: true }), 'Link: https://x.com (opens in a new tab)');
  assert.equal(describeLink(''), 'No link set');
  assert.equal(describeLink({ kind: 'email', email: '' }), 'Enter an email address');
});
