import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitiseCss, MAX_CSS_BYTES } from './css-sanitiser.mjs';

const page = (css, options) => sanitiseCss(css, { scope: 'page', ...options });
const scope = '[data-gs-scope="page"]';

test('every page rule is scoped to the page region', () => {
  assert.equal(page('.hero{color:red} h1 , .a > b{margin:0}').css,
    `${scope} .hero{color:red}\n${scope} h1,${scope} .a > b{margin:0}`);
  assert.equal(page(':root{--accent:#c00} html .x{padding:1px} body>header{gap:0}').css,
    `${scope}{--accent:#c00}\n${scope} .x{padding:1px}\n${scope}>header{gap:0}`);
  assert.equal(page('*{box-sizing:border-box}').css, `${scope} *{box-sizing:border-box}`);
  assert.equal(page('@media (min-width: 900px){.a,.b:is(.c, .d){padding:1rem}}').css,
    `@media (min-width: 900px){${scope} .a,${scope} .b:is(.c, .d){padding:1rem}}`);
  assert.equal(sanitiseCss('.brand{gap:1rem}', { scope: 'header' }).css, '[data-gs-scope="header"] .brand{gap:1rem}');
});

test('CSS that would escape the page scope is refused', () => {
  // Closing the scope early and opening a global rule.
  assert.equal(page('.a{color:red}} body{display:none}').css, '');
  assert.equal(page('.a{color:red;} } * {display:none} .b{').css, '');
  // Sibling combinators reach the header and footer next to the page region.
  assert.equal(page('~ footer{display:none} + .x{display:none}').css, '');
  assert.equal(page('body ~ footer{display:none} :root + nav{display:none}').css, '');
  // Nesting would put rules outside the prefix.
  assert.equal(page('.a{& ~ footer{display:none}}').css, '');
  assert.equal(page('& .x{color:red}').css, '');
  // Global at-rules.
  for (const rule of ['@import url(/x.css);', '@import "x.css";', '@font-face{font-family:x;src:url(/x.woff2)}', '@layer base{.a{color:red}}',
    '@page{margin:0}', '@namespace svg url(http://www.w3.org/2000/svg);', '@property --x{syntax:"*"}', '@scope (body){.a{color:red}}',
    '@charset "utf-8";']) {
    assert.equal(page(rule).css, '', rule);
  }
});

test('escapes, markup and unparseable CSS are refused as a whole', () => {
  assert.deepEqual(page('.a{color:red}</style><script>alert(1)</script>'), { css: '', removed: ['css (contains < or a backslash escape)'] });
  assert.equal(page('@\\69mport url(/x.css); .a{color:red}').css, '');
  assert.equal(page('.a{background:u\\72l(https://evil.test)}').css, '');
  assert.equal(page('.a{content:"unterminated}').css, '');
  assert.equal(page('/* unterminated .a{color:red}').css, '');
  assert.equal(page('.a{color:red').css, '');
  assert.equal(page('.a{width:calc(1px}').css, '');
  assert.deepEqual(page('x'.repeat(MAX_CSS_BYTES + 1)), { css: '', removed: ['css (too large)'] });
});

test('unsafe declarations are removed and safe ones kept', () => {
  const out = page('.a{color:blue;background:url(https://evil.test/x.png);width:expression(alert(1));behavior:url(/x.htc);' +
    '-moz-binding:url(/x.xml);background-image:image-set("/a.png" 1x);1x:y;--ok:1;content:attr(data-label);width:attr(data-w px)}');
  assert.equal(out.css, `${scope} .a{color:blue;--ok:1;content:attr(data-label)}`);
  assert.deepEqual(out.removed, ['declaration background', 'declaration width', 'declaration behavior', 'declaration -moz-binding',
    'declaration background-image', 'declaration 1x', 'declaration width']);
  assert.equal(page('.a{background:url("javascript:alert(1)")}').css, `${scope} .a{}`);
  assert.equal(page('.a{background:url(//evil.test/x.png)}').css, `${scope} .a{}`);
  assert.equal(page('.a{--x:{color:red}}').css, '');
});

test('site paths and media references are kept in url()', () => {
  const media = { hero: { key: `media/${'b'.repeat(64)}.png` } };
  assert.equal(page('.a{background:#000 url(media:hero) no-repeat;mask:url("/mask.svg")}', { media }).css,
    `${scope} .a{background:#000 url("/media/${'b'.repeat(64)}.png") no-repeat;mask:url("/mask.svg")}`);
  assert.equal(page('.a{background:url(media:missing)}', { media }).css, `${scope} .a{}`);
});

test('keyframes keep their frames; comments are stripped', () => {
  assert.equal(page('/* fade */ @keyframes fade{from{opacity:0}50%,75%{opacity:.5}to{opacity:1}} .a{animation:fade 1s}').css,
    `@keyframes fade{from{opacity:0}50%,75%{opacity:.5}to{opacity:1}}\n${scope} .a{animation:fade 1s}`);
  assert.equal(page('@keyframes fade{body{opacity:0}}').css, '');
  assert.equal(page('.a{content:"/* not a comment */"}').css, `${scope} .a{content:"/* not a comment */"}`);
});

test('the site stylesheet is not scoped and may declare fonts', () => {
  const site = sanitiseCss(':root{--ink:#111}@font-face{font-family:Mont;src:url(/fonts/m.woff2) format("woff2")}body{color:var(--ink)}', { fontFace: true });
  assert.equal(site.css, ':root{--ink:#111}\n@font-face{font-family:Mont;src:url("/fonts/m.woff2") format("woff2")}\nbody{color:var(--ink)}');
  assert.equal(sanitiseCss('@font-face{src:url(https://evil.test/f.woff2)}', { fontFace: true }).css, '@font-face{}');
  assert.equal(sanitiseCss('@import url(/x.css); .a{color:red}').css, '.a{color:red}');
});
