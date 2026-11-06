import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { sanitiseCss } from '../next-proof/css-sanitiser.mjs';

// GSAM's page agent writes CSS as `#gs-page …` (its editing document is <main id="gs-page">). The site scopes
// page CSS to [data-gs-scope="page"], so those selectors only match when #gs-page sits inside that region.
test('agent CSS written for #gs-page matches the rendered page', () => {
  assert.match(readFileSync(new URL('./HtmlPage.jsx', import.meta.url), 'utf8'), /<Region scope="page"[^\n]*><div id="gs-page"/);
  const { document } = new Window();
  document.body.innerHTML = '<main data-gs-scope="page"><div id="gs-page"><div class="track"></div></div></main>';
  const selector = sanitiseCss('#gs-page .track{display:flex}', { scope: 'page' }).css.split('{')[0];
  assert.ok(document.querySelector(selector), selector);
});
