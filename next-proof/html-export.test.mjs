import test from 'node:test';
import assert from 'node:assert/strict';
import { exportRenderedPage, stripCssComments } from './html-export.mjs';
import { sanitiseHtml } from './html-sanitiser.mjs';
import { sanitiseCss } from './css-sanitiser.mjs';

const render = (content) => `<!doctype html><html><body><header class="proof-header"><a href="/">Home</a></header><main><style>.b{color:red}</style><div class="gs-proof-content">${content}</div></main><footer class="proof-footer"><nav aria-label="Legal pages"><a href="/privacy">Privacy</a></nav></footer></body></html>`;

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
});

test('CSS comments go, strings stay', () => {
  assert.equal(stripCssComments('/* <h2> */a{content:"/* no */"}'), 'a{content:"/* no */"}');
});
