import test from 'node:test';
import assert from 'node:assert/strict';
import { gsamNavigation } from './gsam-release.mjs';

const page = (id, slug, title, parentPageId, menu = 'header', menuOrder = 0) => ({ id, slug, title, parentPageId, menu, menuOrder });

test('GSAM header pages nest under their tab; Transformation Services is its own dropdown', () => {
  const nav = gsamNavigation([
    page('home', '/', 'Home', null, 'none', null),
    page('dx', '/consultancy', 'DX Consultancy', 'home', 'header', 0),
    page('help', '/consultancy/how-we-help', 'How we help', 'dx', 'header', 0),
    page('ts', '/consultancy/transformation-services', 'Transformation Services', 'dx', 'header', 1),
    page('ind', '/consultancy/industries', 'Industries', 'dx', 'header', 2),
    page('tools', '/dev-tools', 'DX Dev Tools', 'home', 'header', 1),
    page('gsam', '/gs-agentic-manager', 'GS Agentic Manager', 'home', 'header', 2),
    page('about', '/about', 'About', 'home', 'header', 4),
    page('contact', '/contact', 'Begin the Conversation', 'home', 'footer', 0),
  ]);
  assert.deepEqual(nav.map((item) => item.label), ['DX Consultancy', 'Transformation Services', 'DX Dev Tools', 'GS Agentic Manager', 'About']);
  assert.deepEqual(nav[0].children.map((item) => item.label), ['DX Consultancy', 'How we help', 'Industries']);
  const ts = nav[1];
  assert.equal(ts.children.length, 9);
  assert.deepEqual(ts.children[0], { id: 'ts-overview', label: 'The full transformation', visible: true, subtext: 'Every step, planned together', target: { kind: 'page', pageId: 'ts' } });
  assert.equal(ts.children[1].target.href, '/consultancy/transformation-services#websites');
  assert.equal(nav[3].children, undefined);
});
