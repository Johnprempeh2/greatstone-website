import test from 'node:test';
import assert from 'node:assert/strict';
import { exportRenderedPage, releasePage, stageDraftPages, stripCssComments, withoutDraftLinks } from './html-export.mjs';
import { sanitiseHtml } from './html-sanitiser.mjs';
import { sanitiseCss } from './css-sanitiser.mjs';

// GRE-3862: the studio shell. The header and footer exports have their own tests (html-chrome.test.mjs).
const render = (content) => `<!doctype html><html><body><main><style>.b{color:red}</style><div class="gs-proof-content">${content}</div></main><footer class="site-footer"><nav class="foot-legal" aria-label="Legal"><a href="/privacy">Privacy</a></nav></footer></body></html>`;

test('inline styles become page classes the sanitisers keep', () => {
  const out = exportRenderedPage(render('<div data-gs-block-type="Hero" data-gs-block-id="h1" id="gs-blk-h1"><p style="width:40%;--accent:#c8ff00">Hi</p></div>'), { path: '/x', data: { content: [] } });
  assert.doesNotMatch(out.html, /style=|data-gs-|gs-blk-/);
  assert.match(out.html, /class="s-[0-9a-f]{10}"/);
  assert.match(out.css, /width:40% !important;--accent:#c8ff00 !important/);
  assert.deepEqual(sanitiseHtml(out.html).removed, []);
  assert.deepEqual(sanitiseCss(out.css, { scope: 'page' }).removed, []);
  assert.deepEqual(out.blockCss, ['.b{color:red}']);
});

test('React ids are renamed with their aria references', () => {
  const out = exportRenderedPage(render('<button aria-controls=":r1:">Q</button><div id=":r1:">A</div>'), { path: '/x', data: { content: [] } });
  const id = /id="(x-[0-9a-f]{10})"/.exec(out.html)[1];
  assert.match(out.html, new RegExp(`aria-controls="${id}"`));
  assert.deepEqual(sanitiseHtml(out.html).removed, []);
});

test('form blocks become islands configured from their published props', () => {
  const out = exportRenderedPage(render('<div><div data-gs-block-type="BookDeepDive" data-gs-block-id="b1"><form></form></div></div>'),
    { path: '/contact', data: { content: [{ type: 'BookDeepDive', props: { id: 'b1', formKey: 'contact' } }] } });
  // The block wrapper stays for its section surface; the island names the frozen props by block id.
  assert.equal(out.html, '<div><div><gs-island name="enquiry-form" data-form="contact" data-block="b1"></gs-island></div></div>');
  assert.deepEqual(out.formBlocks, { b1: { id: 'b1', formKey: 'contact' } });
  const [island] = sanitiseHtml(out.html).nodes[0].children[0].children;
  assert.deepEqual([island.type, island.props], ['island', { formKey: 'contact', blockId: 'b1' }]);
});

test('the frozen landing is one island, and the footer gets cookie settings', () => {
  const out = exportRenderedPage(render('<div data-gs-block-type="TwoDoors">doors</div>'), { path: '/', data: { content: [{ type: 'TwoDoors', props: { id: 'd' } }] } });
  assert.equal(out.html, '<gs-island name="two-doors-landing"></gs-island>');
  assert.equal(sanitiseHtml(out.html).nodes[0].type, 'island');
  assert.match(out.chrome.footer.html, /<gs-island name="cookie-settings"><\/gs-island><\/nav>/);
  // A render without the studio header exports none; the export script stops on that.
  assert.deepEqual(out.chrome.header, { html: '', css: '' });
});

test('CSS comments go, strings stay', () => {
  assert.equal(stripCssComments('/* <h2> */a{content:"/* no */"}'), 'a{content:"/* no */"}');
});

// GRE-3789: interactive blocks keep their render and name their page behaviour.
const block = (type, id, inner) => `<div><div data-gs-block-type="${type}" data-gs-block-id="${id}"><div class="gs-blk">${inner}</div></div></div>`;

test('Panels "More" names its behaviour, the body it controls and both labels', () => {
  const out = exportRenderedPage(render(block('Panels', 'panels-1', '<section class="b-panels"><div class="b-panel"><p class="b-panel-body is-clamped clamp-three">Long</p><button type="button" class="b-panel-more" aria-expanded="false">More</button></div></section>')),
    { path: '/about', data: { content: [{ type: 'Panels', props: { id: 'panels-1' } }] } });
  assert.match(out.html, /<section class="b-panels" data-behaviour="more">/);
  assert.match(out.html, /<p class="b-panel-body is-clamped clamp-three" id="more-panels-1-0">/);
  assert.match(out.html, /aria-controls="more-panels-1-0" data-label-closed="More" data-label-open="Less">More</);
  assert.deepEqual(sanitiseHtml(out.html).removed, []);
  // Panels with nothing to open need no behaviour.
  const plain = exportRenderedPage(render(block('Panels', 'panels-2', '<section class="b-panels"><p class="b-panel-body">Short</p></section>')),
    { path: '/x', data: { content: [{ type: 'Panels', props: { id: 'panels-2' } }] } });
  assert.doesNotMatch(plain.html, /data-behaviour/);
});

test('the FAQ keeps its accordion and its structured data moves to page SEO', () => {
  const items = [{ q: 'Where does data go?', a: '<p>Your <strong>own</strong> instance.</p>' }, { q: 'Empty?', a: '' }];
  const page = { id: 'p1', path: '/services', title: 'Services', data: { content: [{ type: 'Faq', props: { id: 'faq-1', showSchema: true, items } }] } };
  const out = exportRenderedPage(render(block('Faq', 'faq-1', '<section class="b-faq"><button type="button" aria-expanded="false" aria-controls=":r1:">Q</button><div id=":r1:" inert="">A</div></section>')), page);
  assert.match(out.html, /<section class="b-faq" data-behaviour="faq">/);
  assert.deepEqual(out.faq, [{ q: 'Where does data go?', a: 'Your own instance.' }]);
  assert.deepEqual(releasePage(page, out, []).seo.faq, out.faq);
  const hidden = exportRenderedPage(render(block('Faq', 'faq-1', '<section class="b-faq"></section>')),
    { ...page, data: { content: [{ type: 'Faq', props: { id: 'faq-1', showSchema: false, items } }] } });
  assert.equal(releasePage(page, hidden, []).seo.faq, undefined);
});

test('IndustryPicker writes out every industry as tab parts, the first shown', () => {
  const industries = [
    { label: 'Real estate', headline: 'Less time on portals. More time closing.', specificTitle: 'What real estate loses.', drains: [{ text: 'Comps' }, { text: 'Listings' }] },
    { label: 'Health', headline: 'No split here', specificTitle: 'What health loses.', drains: [{ text: 'Claims <b>by hand</b>' }] },
  ];
  const render1 = '<section class="b-ind"><div role="tablist"><button role="tab" id=":r0:" aria-controls=":r2:" aria-selected="true" tabindex="0">Real estate</button>'
    + '<button role="tab" id=":r1:" aria-controls=":r2:" aria-selected="false" tabindex="-1">Health</button><span class="b-ind-underline" style="width:0px;transform:translateX(0px)" aria-hidden="true"></span></div>'
    + '<h2 class="b-ind-headline" aria-live="polite">Less time on portals. <span class="accent">More time closing.</span></h2>'
    + '<div class="b-ind-swap" id=":r2:" role="tabpanel" aria-labelledby=":r0:"><article class="card b-ind-card specific"><h3>What real estate loses.</h3><ul class="b-ind-drains"><li><span>Comps</span></li><li><span>Listings</span></li></ul></article></div></section>';
  const out = exportRenderedPage(render(block('IndustryPicker', 'ind-1', render1)),
    { path: '/industries', data: { content: [{ type: 'IndustryPicker', props: { id: 'ind-1', industries } }] } });
  assert.match(out.html, /<section class="b-ind" data-behaviour="tabs">/);
  assert.match(out.css, /\[data-tab\]\[hidden\]\{display:none !important\}/);
  assert.deepEqual(sanitiseCss(out.css, { scope: 'page' }).removed, []);
  assert.match(out.html, /<span class="b-ind-underline s-[0-9a-f]{10}" aria-hidden="true" data-tab-indicator="">/);
  assert.match(out.html, /class="b-ind-swap" id="x-[0-9a-f]{10}" role="tabpanel" aria-labelledby="x-[0-9a-f]{10}" data-tab-fade="">/);
  assert.match(out.html, /<h2 class="b-ind-headline" aria-live="polite"><span data-tab="0">Less time on portals. <span class="accent">More time closing.<\/span><\/span><span data-tab="1" hidden="">No split here<\/span><\/h2>/);
  assert.match(out.html, /<h3 data-tab="0">What real estate loses.<\/h3><h3 data-tab="1" hidden="">What health loses.<\/h3>/);
  assert.match(out.html, /<ul class="b-ind-drains" data-tab="0"><li><span>Comps<\/span><\/li><li><span>Listings<\/span><\/li><\/ul><ul class="b-ind-drains" data-tab="1" hidden=""><li><span>Claims &lt;b&gt;by hand&lt;\/b&gt;<\/span><\/li><\/ul>/);
  assert.deepEqual(sanitiseHtml(out.html).removed, []);
});

test('the maturity map and the catalogue become islands with their props', () => {
  const page = { path: '/how-we-help', data: { content: [{ type: 'MaturityMap', props: { id: 'map-1' } }, { type: 'ServiceCatalog', props: { id: 'servicecatalog-1', services: [] } }] } };
  const out = exportRenderedPage(render(block('MaturityMap', 'map-1', '<section class="b-map map-stage"></section>') + block('ServiceCatalog', 'servicecatalog-1', '<section class="b-cat"><input type="search"></section>')), page);
  // The Climb chart keeps its React render (its trail glow is an SVG filter the sanitiser refuses).
  assert.match(out.html, /<gs-island name="maturity-map" data-block="map-1"><\/gs-island>/);
  const tiein = exportRenderedPage(render(block('MethodTieIn', 't1', '<section class="b-tiein-section"><div class="b-tiein-chart" aria-hidden="true"></div></section>')),
    { path: '/climb', data: { content: [{ type: 'MethodTieIn', props: { id: 't1' } }] } });
  assert.match(tiein.html, /<div class="b-tiein-chart" aria-hidden="true" data-behaviour="grow">/);
  assert.match(out.html, /<gs-island name="service-catalog" data-block="servicecatalog-1"><\/gs-island>/);
  assert.deepEqual(out.formBlocks, { 'map-1': { id: 'map-1' }, 'servicecatalog-1': { id: 'servicecatalog-1', services: [] } });
  assert.deepEqual(sanitiseHtml(out.html).removed, []);
});

test('GSAM draft pages join the baked release once, never over a published page', () => {
  const baked = { pages: [{ id: 'a', path: '/about', data: { content: [] } }] };
  const draft = { id: 'd', revisionId: 'r', path: '/support', slug: 'support', title: 'Support', seo: { noindex: false }, data: { content: [], root: { props: {} } } };
  const staged = stageDraftPages(baked, [draft]);
  assert.deepEqual(staged.pages.map((page) => page.path), ['/about', '/support']);
  assert.equal(staged.pages[1].id, 'd');
  // Staging twice changes nothing.
  assert.deepEqual(stageDraftPages(staged, [draft]).pages, staged.pages);
  assert.throws(() => stageDraftPages(baked, [{ ...draft, path: '/about' }]), /already has a page/);
  assert.throws(() => stageDraftPages(baked, [{ ...draft, data: {} }]), /no block content/);
});

test('the shared chrome drops the footer links staged drafts add, and nothing else', () => {
  const draft = { path: '/support', title: 'Support' };
  const chrome = { header: { html: '<nav><a href="/about">About</a></nav>', css: '' }, nav: { html: '', css: '' },
    footer: { html: '<nav class="foot-links"><a href="/about">About</a><a href="/support">Support</a></nav>', css: '.x{}' } };
  assert.deepEqual(withoutDraftLinks(chrome, [draft]).footer, { html: '<nav class="foot-links"><a href="/about">About</a></nav>', css: '.x{}' });
  assert.throws(() => withoutDraftLinks({ ...chrome, footer: { html: '', css: '' } }, [draft]), /one footer link/);
  assert.throws(() => withoutDraftLinks({ ...chrome, header: { html: '<a href="/support">Help</a>', css: '' } }, [draft]), /outside the footer/);
});
