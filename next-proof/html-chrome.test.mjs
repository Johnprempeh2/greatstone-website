import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { exportFooter, exportHeader, svgPaintToClasses } from './html-chrome.mjs';
import { sanitiseHtml } from './html-sanitiser.mjs';
import { sanitiseCss } from './css-sanitiser.mjs';

const parse = (html) => new new Window().DOMParser().parseFromString(html, 'text/html');
const chevron = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor"></path></svg>';
const site = {
  order: ['home', 'about', 'dev-tools', 'services', 'contact', 'privacy'],
  pages: { home: { title: 'Home', status: 'published' }, about: { title: 'About', status: 'published' }, 'dev-tools': { title: 'DX Dev Tools', status: 'published' },
    services: { title: 'Services', status: 'published' }, contact: { title: 'Contact', status: 'published' }, privacy: { title: 'Privacy', status: 'published', footerOnly: true } },
  paths: { home: '/', about: '/about', 'dev-tools': '/dev-tools', services: '/services', contact: '/contact', privacy: '/privacy' },
  navigation: [
    { type: 'page', pageSlug: 'about' },
    { type: 'page', pageSlug: 'dev-tools' },
    { type: 'group', label: 'Services', children: [{ type: 'page', pageSlug: 'services' }, { type: 'link', label: 'Websites', href: '/services#websites' }] },
    { type: 'page', pageSlug: 'contact' },
  ],
};
// The server render of src/Header.jsx on /about: the page marked, the menus closed.
const header = '<header class="gs-header"><a class="gs-logo" href="/" aria-label="Greatstone"><img src="/logo.png" alt="Greatstone" width="800" height="160"></a>'
  + `<div class="gs-navwrap"><div class="gs-nav gs-nav-measure" aria-hidden="true"><span class="gs-navlink">About</span><span class="gs-navlink gs-navgroup-btn">DX Dev Tools${chevron}</span><span class="gs-navlink gs-navgroup-btn">Services${chevron}</span><span class="gs-navlink gs-navgroup-btn">More${chevron}</span></div>`
  + '<nav class="gs-nav" aria-label="Primary"><a aria-current="page" class="gs-navlink is-active" href="/about"><span>About</span></a>'
  + `<div class="gs-navgroup"><button class="gs-navlink gs-navgroup-btn" aria-haspopup="menu" aria-expanded="false">DX Dev Tools${chevron}</button></div>`
  + `<div class="gs-navgroup"><button class="gs-navlink gs-navgroup-btn" aria-haspopup="menu" aria-expanded="false">Services${chevron}</button></div></nav></div>`
  + '<div class="gs-tools"><button class="gs-btn primary gs-book">Begin the Conversation</button><button class="gs-accountbtn" aria-label="Sign in"><span class="gs-accountlabel">Sign in</span></button>'
  + '<button class="gs-cmdbtn" aria-label="Search and commands"><kbd>⌘K</kbd></button></div></header>';
const footer = '<footer class="site-footer"><style>@media(pointer:coarse){.site-footer .foot-links a{min-height:44px}}</style>'
  // A plain rule stands in for any drawing whose paint is a var(): the old footer ornament is retired and must not come back.
  + '<svg viewBox="0 0 10 1" fill="none" aria-hidden="true"><g stroke="var(--gs-accent)" stroke-width="0.8" fill="none"><path d="M0 0 H10"></path></g></svg>'
  + '<nav class="foot-links" aria-label="Footer"><a href="/">Home</a></nav><nav class="foot-legal" aria-label="Legal"><a href="/privacy">Privacy</a></nav>'
  + '<div class="legal">© <!-- -->2026<!-- --> Greatstone. All rights reserved.</div></footer>';

test('the header is shared: no page marks, every menu written out hidden, islands for sign-in and search', () => {
  const out = exportHeader(parse(`<body>${header}<main></main></body>`), site);
  const html = out.html;
  assert.doesNotMatch(html, /aria-current|is-active|td-header/);
  assert.match(html, /<header class="gs-header" data-behaviour="site-header" data-td-paths="\/ \/dev-tools">/);
  // Each bar item is numbered; each dropdown holds its members, hidden. DX Dev Tools holds the storefront.
  assert.match(html, /<a class="gs-navlink" href="\/about" data-leaf="0">/);
  assert.match(html, /aria-controls="navgroup-1">DX Dev Tools.*?<div class="gs-navmenu-pop gs-navgroup-pop" role="menu" id="navgroup-1" aria-label="DX Dev Tools" hidden=""><a role="menuitem" class="gs-navmenu-item" href="\/dev-tools"><span>DX Dev Tools<\/span><\/a><a role="menuitem" class="gs-navmenu-item" href="\/shop">Products<\/a><\/div>/);
  assert.match(html, /id="navgroup-2" aria-label="Services" hidden=""><a role="menuitem" class="gs-navmenu-item" href="\/services"><span>Services<\/span><\/a><a role="menuitem" class="gs-navmenu-item" href="\/services#websites"><span>Websites<\/span><\/a><\/div>/);
  // "More": every bar link (a group gives its members) hidden until it overflows; the booking page pinned there.
  const more = /<div class="gs-navgroup" data-more="" hidden="">(.*?)<\/div><\/div>/.exec(html)[1];
  assert.deepEqual([...more.matchAll(/data-leaf="(\w+)"( hidden="")?/g)].map((match) => `${match[1]}${match[2] ? '' : '!'}`), ['0', '1', '1', '2', '2', 'pin!']);
  assert.match(more, /href="\/contact" data-leaf="pin"><span>Contact<\/span>/);
  // The phone menu: the whole tree, grouped, and the booking link.
  assert.match(html, /<nav class="gs-navmenu" aria-label="Primary" hidden=""><button type="button" id="navmenu-btn" class="gs-navmenu-btn" aria-expanded="false" aria-haspopup="menu" aria-controls="navmenu-pop" aria-label="Open navigation"><span data-menu-label="">Menu<\/span>/);
  assert.match(html, /<span class="gs-navmenu-grouplabel" aria-hidden="true">Services<\/span><a role="menuitem" class="gs-navmenu-item is-sub" href="\/services">/);
  assert.match(html, /<a role="menuitem" class="gs-navmenu-item gs-navmenu-book" href="\/contact" data-cta="menu">Begin the Conversation<\/a><\/div><\/nav>/);
  assert.match(html, /<a class="gs-btn primary gs-book" href="\/contact" data-cta="header">Begin the Conversation<\/a><gs-island name="account-entry" data-style="header"><\/gs-island><gs-island name="site-search"><\/gs-island><\/div>/);
  const { nodes, removed } = sanitiseHtml(html);
  assert.deepEqual(removed, []);
  assert.ok(JSON.stringify(nodes).includes('"name":"site-search"'));
  assert.deepEqual(sanitiseCss(out.css, { scope: 'header' }).removed, []);
  assert.match(sanitiseCss(out.css, { scope: 'header' }).css, /\[data-gs-scope="header"\] \.gs-header \[hidden\]\{display:none !important\}/);
});

test('a header whose bar does not match the navigation stops the export', () => {
  assert.throws(() => exportHeader(parse(header.replace('<a aria-current="page" class="gs-navlink is-active" href="/about"><span>About</span></a>', '')), site), /the bar holds 2 items, the navigation 3/);
  assert.equal(exportHeader(parse('<header class="proof-header"></header>'), site), null);
});

test('the footer keeps its look without inline style or var() paint, and gets cookie settings', () => {
  const out = exportFooter(parse(`<body>${footer}</body>`));
  assert.doesNotMatch(out.html, /<style|var\(|<!--/);
  assert.match(out.html, /<g stroke-width="0.8" fill="none" class="p-[0-9a-f]{10}">/);
  assert.match(out.css, /^@media\(pointer:coarse\)\{\.site-footer \.foot-links a\{min-height:44px\}\}\n\.p-[0-9a-f]{10}\{stroke:var\(--gs-accent\)\}$/);
  assert.match(out.html, /<a href="\/privacy">Privacy<\/a><gs-island name="cookie-settings"><\/gs-island><\/nav><div class="legal">© 2026 Greatstone/);
  assert.deepEqual(sanitiseHtml(out.html).removed, []);
  assert.deepEqual(sanitiseCss(out.css, { scope: 'footer' }).removed, []);
  // A rendered cookie button becomes the island; a footer with no legal row gets one.
  assert.match(exportFooter(parse(footer.replace('</nav><div', '<button class="foot-cookie-settings">Cookie settings</button></nav><div'))).html, /Privacy<\/a><gs-island name="cookie-settings"><\/gs-island><\/nav>/);
  assert.match(exportFooter(parse(footer.replace(/<nav class="foot-legal".*?<\/nav>/, ''))).html, /<nav class="foot-legal" aria-label="Legal"><gs-island name="cookie-settings"><\/gs-island><\/nav><div class="legal">/);
});

test('only a var() paint moves to a class; colours the sanitiser accepts stay', () => {
  const document = parse('<svg><path fill="#fff" stroke="var(--a)"></path><stop stop-color="var(--b)"></stop><path stroke="var(--a)"></path></svg>');
  const rules = svgPaintToClasses(document.body);
  assert.equal(rules.length, 2);
  assert.match(document.body.innerHTML, /<path fill="#fff" class="(p-\w+)"><\/path><stop class="p-\w+"><\/stop><path class="\1"><\/path>/);
});
