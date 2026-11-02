import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Region } from './html-regions.mjs';
import { sanitiseCss } from '../next-proof/css-sanitiser.mjs';

// GRE-3782: a full-screen fixed overlay in page CSS must stay inside the page region.
test('each region sits in a contained box that scoped CSS cannot select', () => {
  const html = renderToStaticMarkup(createElement(Region, { scope: 'page', as: 'main', attributes: { 'data-release': '7' } }, 'x'));
  assert.equal(html, '<div style="contain:layout;overflow:clip"><main data-gs-scope="page" data-release="7">x</main></div>');
  assert.equal(renderToStaticMarkup(createElement(Region, { scope: 'footer' }, 'x')), '<div style="contain:layout;overflow:clip"><div data-gs-scope="footer">x</div></div>');
  // GRE-3778: the header menu opens over the page, so the header box holds fixed elements but does not clip.
  assert.equal(renderToStaticMarkup(createElement(Region, { scope: 'header' }, 'x')),
    '<div style="contain:layout;position:relative;z-index:2"><div data-gs-scope="header">x</div></div>');
  // The overlay and an attempt to undo the containment only reach the region and what is inside it.
  const { css } = sanitiseCss('*{position:fixed;inset:0;z-index:99999} :root{contain:none;display:contents}', { scope: 'page' });
  assert.equal(css, '[data-gs-scope="page"] *{position:fixed;inset:0;z-index:99999}\n[data-gs-scope="page"]{contain:none;display:contents}');
});
