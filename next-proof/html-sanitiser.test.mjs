import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitiseHtml, toHtml, safeUrl, MAX_HTML_BYTES } from './html-sanitiser.mjs';
import { ISLANDS, islandProps } from './islands.mjs';

const clean = (html, options) => toHtml(sanitiseHtml(html, options).nodes);
const hash = 'a'.repeat(64);
const media = { hero: { key: `media/${hash}.webp` } };

test('script elements are removed with their content', () => {
  assert.equal(clean('<p>Hi</p><script>alert(1)</script>'), '<p>Hi</p>');
  assert.equal(clean('<div><SCRIPT src="https://evil.test/x.js"></SCRIPT>ok</div>'), '<div>ok</div>');
  assert.equal(clean('<p>a<script>document.cookie</script>b</p>'), '<p>ab</p>');
  assert.deepEqual(sanitiseHtml('<script>x</script>').removed, ['script']);
});

test('inline event handlers are removed from every element', () => {
  for (const handler of ['onclick', 'onerror', 'onload', 'onmouseover', 'onfocus', 'ONCLICK', 'onanimationstart']) {
    const out = clean(`<img src="/a.png" ${handler}="alert(1)" alt=""><a href="/x" ${handler}="alert(1)">x</a>`);
    assert.doesNotMatch(out, /\bon[a-z]+=/i, handler);
  }
  assert.equal(clean('<div onclick="alert(1)" class="card">x</div>'), '<div class="card">x</div>');
});

test('iframe, object, embed and other active elements are removed', () => {
  for (const tag of ['iframe', 'object', 'embed', 'frame', 'applet', 'portal', 'math', 'form', 'input', 'textarea',
    'link', 'meta', 'base', 'style', 'template', 'noscript', 'video', 'audio', 'canvas', 'dialog']) {
    const out = clean(`<div>before<${tag} src="https://evil.test" data="https://evil.test">inside</${tag}>after</div>`);
    assert.doesNotMatch(out, new RegExp(`<${tag}\\b`, 'i'), tag);
  }
  assert.equal(clean('<iframe src="https://evil.test"></iframe><p>x</p>'), '<p>x</p>');
  assert.equal(clean('<object data="x.swf"><embed src="x.swf"></object>'), '');
  assert.equal(clean('<svg><script>alert(1)</script></svg><math><mi>x</mi></math>'), '<svg></svg>');
});

// GRE-3778: icons and charts keep a drawing subset of SVG; nothing in it can run code or load a URL.
test('svg keeps shapes, gradients and a blur', () => {
  const icon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" class="i">'
    + '<path d="M4 12h16M12 4v16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>'
    + '<circle cx="12" cy="12" r="3" fill="#c8ff00"></circle><line x1="0" y1="0" x2="1" y2="1" stroke-dasharray="3 8"></line></svg>';
  assert.equal(clean(icon), icon);
  const chart = '<svg viewBox="0 0 100 50" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Chart"><defs>'
    + '<linearGradient id="ridge1" x1="0" y1="0" x2="0" y2="1"><stop offset="45%" stop-color="rgba(200,255,0,0.30)"></stop></linearGradient>'
    + '<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"></feGaussianBlur>'
    + '<feMerge><feMergeNode in="b"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge></filter></defs>'
    + '<g class="peaks"><polygon points="0,50 50,0 100,50" fill="url(#ridge1)" filter="url(#glow)"></polygon>'
    + '<text x="10" y="20" font-size="30" fill="#9aa09a">Summit</text></g></svg>';
  assert.equal(clean(chart), chart);
  assert.equal(clean('<svg><line x1="100" x2="172.74613391789285" y2="-1e-7"></line></svg>'), '<svg><line x1="100" x2="172.74613391789285" y2="-1e-7"></line></svg>');
  assert.equal(clean('<p>a <svg viewBox="0 0 1 1"></svg> b</p>'), '<p>a <svg viewBox="0 0 1 1"></svg> b</p>');
});

// GRE-3778: tabs and closed FAQ answers keep their focus order: tabindex -1 or 0 only, inert with no value.
test('tabindex and inert are kept only in their safe forms', () => {
  assert.equal(clean('<button tabindex="-1">a</button><div tabindex="0" inert="">b</div>'), '<button tabindex="-1" type="button">a</button><div tabindex="0" inert="">b</div>');
  assert.equal(clean('<a href="/a" tabindex="5">a</a><div inert="x">b</div>'), '<a href="/a">a</a><div>b</div>');
});

test('svg cannot run code, load anything or hide markup', () => {
  const attacks = [
    '<svg onload="alert(1)"></svg>',
    '<svg><use href="https://evil.test/x.svg#a"></use></svg>',
    '<svg><use xlink:href="data:image/svg+xml,x"></use></svg>',
    '<svg><image href="https://evil.test/x.png"></image></svg>',
    '<svg><a href="javascript:alert(1)"><text>x</text></a></svg>',
    '<svg><foreignObject><img src="x" onerror="alert(1)"></foreignObject></svg>',
    '<svg><style>@import "https://evil.test/x.css";</style></svg>',
    '<svg><animate attributeName="href" to="javascript:alert(1)"></animate></svg>',
    '<svg><set attributeName="onclick" to="alert(1)"></set></svg>',
    '<svg><script href="https://evil.test/x.js"></script></svg>',
    '<svg><path d="M0 0" style="background:url(https://evil.test)"></path></svg>',
    '<svg><path fill="url(https://evil.test/x.svg#a)" stroke="url(&quot;//evil.test&quot;)"></path></svg>',
    '<svg><rect filter="url(https://evil.test/f.svg#f)" mask="url(#m)" clip-path="url(#c)"></rect></svg>',
    '<svg><p>x</p><div><img src=x onerror=alert(1)></div></svg>',
    '<svg><gs-island name="cookie-settings"></gs-island></svg>',
    '<svg id="dataLayer"><g id="gs-scope" data-gs-scope="page"></g></svg>',
    '<svg><path d="M0 0 url(x)" transform="translate(1) expression(alert(1))"></path></svg>',
  ];
  for (const attack of attacks) {
    const out = clean(attack);
    assert.doesNotMatch(out, /on[a-z]+=|href|url\((?!#)|style|script|foreignObject|<use|<image|<a\b|<animate|<set|<p>|<div|<img|gs-island|dataLayer|gs-scope|expression/i, attack);
  }
  assert.equal(clean('<svg><foreignObject><p>x</p></foreignObject><path d="M0 0"></path></svg>'), '<svg><path d="M0 0"></path></svg>');
  assert.deepEqual(sanitiseHtml('<svg onload="x"><use href="#a"></use></svg>').removed, ['svg @onload', 'use']);
});

test('javascript: and other unsafe URLs are removed', () => {
  const bad = ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)', 'java\nscript:alert(1)',
    'vbscript:x', 'data:text/html,<script>alert(1)</script>', '//evil.test/x', '/\\evil.test', '\\\\evil.test', 'file:///etc/passwd',
    'javascript&colon;alert(1)', 'media:unknown'];
  for (const url of bad) {
    assert.equal(safeUrl(url, { media }), null, url);
    assert.doesNotMatch(clean(`<a href="${url.replace(/"/g, '&quot;')}">x</a>`), /href=/, url);
  }
  assert.equal(clean('<a href="&#106;avascript:alert(1)">x</a>'), '<a>x</a>');
  assert.equal(clean('<img src="javascript:alert(1)" alt="x">'), '<img alt="x">');
  assert.equal(clean('<img src="http://plain.test/a.png" alt="">'), '<img alt="">');
  assert.equal(clean('<img srcset="/a.png 1x, javascript:alert(1) 2x" alt="">'), '<img alt="">');
  assert.equal(clean('<blockquote cite="javascript:alert(1)">q</blockquote>'), '<blockquote>q</blockquote>');
});

test('safe URLs are kept and media references resolve', () => {
  assert.equal(clean('<a href="/services">s</a><a href="#top">t</a><a href="https://example.com/a?b=1">e</a><a href="mailto:hello@example.com">m</a>'),
    '<a href="/services">s</a><a href="#top">t</a><a href="https://example.com/a?b=1">e</a><a href="mailto:hello@example.com">m</a>');
  assert.equal(clean('<img src="media:hero" srcset="media:hero 1x, /b.png 2x" alt="Hero" width="1200" height="600">', { media }),
    `<img src="/media/${hash}.webp" srcset="/media/${hash}.webp 1x, /b.png 2x" alt="Hero" width="1200" height="600">`);
  assert.equal(clean('<a href="https://example.com" target="_blank" rel="opener">x</a>'),
    '<a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a>');
});

test('attributes outside the allow-list are removed', () => {
  assert.equal(clean('<div style="position:fixed;inset:0" class="a" foo="bar" name="x" formaction="/x">x</div>'), '<div class="a">x</div>');
  assert.equal(clean('<p id="gs-ld-org">x</p><p id="__next">y</p><p id="intro">z</p>'), '<p>x</p><p>y</p><p id="intro">z</p>');
  assert.equal(clean('<button type="submit" formaction="/x">b</button>'), '<button type="button">b</button>');
  assert.equal(clean('<img src="/a.png" width="100%" height="9e9" alt="">'), '<img src="/a.png" alt="">');
  assert.equal(clean('<a href="/x" target="_top" ping="https://evil.test">x</a>'), '<a href="/x">x</a>');
  assert.equal(clean('<div data-reveal="up" aria-label="Card" role="region" data-a_b="no">x</div>'),
    '<div data-reveal="up" aria-label="Card" role="region">x</div>');
  assert.equal(clean('<p title="&quot;><script>alert(1)</script>">x</p>'), '<p title="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;">x</p>');
});

test('only allow-listed islands render, with only their listed attributes', () => {
  const { nodes, removed } = sanitiseHtml('<section><gs-island name="enquiry-form" data-form="contact" data-endpoint="https://evil.test" onclick="x"></gs-island></section>' +
    '<gs-island name="evil-widget" data-x="1"></gs-island><gs-island name="__proto__"></gs-island><gs-island name="constructor"></gs-island>' +
    '<gs-island name="enquiry-form" data-form="Bad Key!"></gs-island>');
  assert.deepEqual(nodes[0].children, [{ type: 'island', name: 'enquiry-form', props: { formKey: 'contact' }, attributes: { 'data-form': 'contact' } }]);
  assert.deepEqual(nodes[1], { type: 'island', name: 'enquiry-form', props: {}, attributes: {} });
  assert.equal(nodes.length, 2);
  assert.deepEqual(removed, ['gs-island[enquiry-form] @data-endpoint', 'gs-island[enquiry-form] @onclick', 'gs-island[evil-widget]',
    'gs-island[__proto__]', 'gs-island[constructor]', 'gs-island[enquiry-form] @data-form']);
  assert.equal(islandProps('toString', []), null);
  assert.ok(Object.values(ISLANDS).every((island) => island.block || island.component));
});

test('islands cannot sit in a paragraph, heading, link or button', () => {
  for (const parent of ['p', 'h2', 'a', 'button']) {
    assert.doesNotMatch(clean(`<${parent}><gs-island name="cookie-settings"></gs-island></${parent}>`), /gs-island/, parent);
  }
});

test('the tree matches what a browser would parse back', () => {
  assert.equal(clean('<table><tr><td>1</td></tr></table>'), '<table><tbody><tr><td>1</td></tr></tbody></table>');
  assert.equal(clean('<p>a<span><ul><li>x</li></ul></span></p>'), '<p>a<span>x</span></p>');
  assert.equal(clean('<a href="/a">1<a href="/b">2</a></a>'), '<a href="/a">1</a><a href="/b">2</a>');
  assert.equal(clean('<h1>A<h2>B</h2></h1>'), '<h1>AB</h1>');
  assert.equal(clean('<td>x</td>'), 'x');
  assert.equal(clean('<custom-card><p>x</p></custom-card>'), '<p>x</p>');
  assert.equal(clean('<html><head><title>t</title></head><body><main><p>x</p></main></body></html>'), '');
});

test('comments, oversized and deeply nested input are dropped', () => {
  assert.equal(clean('<p>a<!-- <script>alert(1)</script> -->b</p>'), '<p>ab</p>');
  assert.deepEqual(sanitiseHtml('x'.repeat(MAX_HTML_BYTES + 1)), { nodes: [], removed: ['html (too large)'] });
  const deep = '<div>'.repeat(60) + 'x' + '</div>'.repeat(60);
  assert.ok(sanitiseHtml(deep).removed.includes('div (too deep)'));
  assert.deepEqual(sanitiseHtml(null), { nodes: [], removed: [] });
});

// GRE-3782: ids that name a global the site sets lazily would replace it (`window.dataLayer ||= []`).
test('ids cannot clobber the window globals the site reads', () => {
  for (const id of ['dataLayer', 'gtag', 'google_tag_manager', 'google_tag_data', 'turnstile', 'Calendly', 'mountGreatstoneTide', 'datalayer']) {
    assert.equal(clean(`<div id="${id}">x</div>`), '<div>x</div>', id);
  }
  assert.equal(clean('<div id="dataLayers">x</div><div id="gtag-note">y</div>'), '<div id="dataLayers">x</div><div id="gtag-note">y</div>');
});

// GRE-3782: `data-gs-scope` picks which region's CSS applies, so page and chrome HTML cannot set it.
test('data-gs-* attributes are removed', () => {
  const { nodes, removed } = sanitiseHtml('<div data-gs-scope="header" data-gs-x="1" data-gsx="ok" data-reveal="up">x</div>');
  assert.equal(toHtml(nodes), '<div data-gsx="ok" data-reveal="up">x</div>');
  assert.deepEqual(removed, ['div @data-gs-scope', 'div @data-gs-x']);
});
