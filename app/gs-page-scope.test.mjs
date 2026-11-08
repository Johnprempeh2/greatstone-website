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

// GSAM's Pick reads [data-gs-island] to say "this part is locked" before it offers a removal that could
// never save (the Two Doors landing on /, 8 Nov). Only the live-design render carries the marker.
test('the live-design render marks what each island renders; the public render does not', () => {
  const page = readFileSync(new URL('./HtmlPage.jsx', import.meta.url), 'utf8');
  assert.match(page, /context\.markIslands && !context\.placeholders[\s\S]{0,120}'data-gs-island': node\.name, 'data-gs-island-label': island\.label, style: \{ display: 'contents' \}/);
  assert.match(page, /markIslands = false/);
  assert.match(readFileSync(new URL('./live-design/LiveDraft.jsx', import.meta.url), 'utf8'), /<HtmlPage page=\{draft\.page\} release=\{release\} markIslands \/>/);
});
