import test from 'node:test';
import assert from 'node:assert/strict';
import { insightBriefings } from './insight-briefings.mjs';
import { siteChrome, studioNavigation } from './site-chrome.mjs';

test('Insights lists only released article pages with working article paths', () => {
  const release = { pages: [
    { id: 'index', path: '/insights', seo: { description: 'Index' } },
    { id: 'first', path: '/insights/first-briefing', title: 'First briefing', seo: { description: 'First summary' }, data: { content: ['large article body'] } },
    { id: 'second', path: '/insights/second-briefing', title: 'Second briefing', seo: { description: 'Second summary' } },
    { id: 'nested', path: '/insights/archive/older', seo: { description: 'Older' } },
    { id: 'other', path: '/about', seo: { description: 'About' } },
  ] };
  assert.deepEqual(insightBriefings(release), [
    { id: 'first', path: '/insights/first-briefing', title: 'First briefing', description: 'First summary' },
    { id: 'second', path: '/insights/second-briefing', title: 'Second briefing', description: 'Second summary' },
  ]);
});

test('site chrome gives the studio header and footer the release navigation, pages and settings', () => {
  const release = {
    pages: [
      { id: 'p-home', slug: 'home', path: '/', title: 'Home' },
      { id: 'p-method', slug: 'method', path: '/method', title: 'How We Work' },
      { id: 'p-privacy', slug: 'privacy', path: '/privacy', title: 'Privacy policy' },
      { id: 'p-proof', slug: 'proof', path: '/proof', title: 'Proof' },
    ],
    site: { settings: { logo: '/logo.png', headerCtaLabel: 'Talk' }, navigation: [
      { id: 'n1', label: 'How We Work', visible: true, target: { kind: 'page', pageId: 'p-method' } },
      { id: 'n2', label: 'Services', visible: true, target: { kind: 'page', pageId: 'p-method' }, children: [
        { id: 'n3', label: 'Full', subtext: 'Every step', visible: true, target: { kind: 'page', pageId: 'p-method' } },
        { id: 'n4', label: 'Web', visible: true, target: { kind: 'link', href: '/method#web' } },
      ] },
    ] },
    media: {},
  };
  assert.deepEqual(studioNavigation(release), [
    { id: 'n1', label: 'How We Work', visible: true, type: 'page', pageSlug: 'method' },
    { id: 'n2', label: 'Services', visible: true, type: 'group', children: [
      { id: 'n3', label: 'Full', visible: true, subtext: 'Every step', type: 'page', pageSlug: 'method' },
      { id: 'n4', label: 'Web', visible: true, type: 'link', href: '/method#web' },
    ] },
  ]);
  const chrome = siteChrome(release);
  assert.deepEqual(chrome.order, ['home', 'method', 'privacy']);
  assert.deepEqual(chrome.paths, { home: '/', method: '/method', privacy: '/privacy' });
  assert.equal(chrome.pages.privacy.footerOnly, true);
  assert.equal(chrome.pages.method.footerOnly, undefined);
  assert.equal(chrome.pages.proof, undefined, 'a hidden page is not offered in the header, footer or search');
  assert.equal(chrome.settings.headerCtaLabel, 'Talk');
});
