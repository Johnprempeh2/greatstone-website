// The sanitiser doing its job, not just declaring it.
//
// sanitize-html.test.mjs locks down the POLICY: which tags are in ALLOWED, which are in
// DROP_ENTIRELY, which hrefs isSafeHref accepts. All of that is constants. The code that WALKS the
// parsed document and applies them was never run by a test, and its own header says why: "the
// DOM-mutation behaviour (unwrap / demote / fixpoint) needs a DOMParser and is verified in-browser".
// Verified in-browser means somebody looked at a recap and it seemed fine.
//
// That premise is out of date. This repo has had happy-dom since the render tests, so the real
// function can be run against real attack strings in node. The policy being right and the walk
// applying it correctly are two different claims, and only one of them was being checked.
//
// It matters more than usual here: there is no Content-Security-Policy on the site yet
// (docs/CSP-PROPOSAL.md), so this sanitiser is the only thing between stored HTML and script
// execution on an origin that holds client records.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

// ⚠ BOTH GLOBALS, OR THE WHOLE FILE PASSES ON NOTHING. The sanitiser's first line is
// `if (!html || typeof window === 'undefined') return ''`, so installing only DOMParser made every
// call return an empty string and every "nothing executable survives" assertion below true for the
// worst possible reason. The first run of this file went green on the security tests and red only
// on "does legitimate formatting come through", which is the single reason the vacuum was noticed.
// A negative assertion needs a positive one beside it or it cannot tell clean from empty.
const KEYS = ['window', 'document', 'DOMParser', 'Node', 'Element', 'HTMLElement'];
let restore = null;
before(() => {
  const win = new Window({ url: 'http://localhost/' });
  const had = new Map();
  for (const k of KEYS) {
    had.set(k, Object.getOwnPropertyDescriptor(globalThis, k));
    const v = k === 'window' ? win : win[k];
    if (v !== undefined) Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  }
  restore = () => {
    for (const [k, d] of had) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; }
  };
});
after(() => restore && restore());

const load = async () => import('./sanitize-html.mjs');

/** Everything a browser would execute, gone. */
const EXECUTABLE = /<\s*(script|iframe|object|embed|svg|math|style|noscript|template)\b|\son[a-z]+\s*=|javascript:|vbscript:|data:text\/html/i;

test('nothing executable survives, whatever shape it arrives in', async () => {
  const { sanitizeHtml } = await load();
  const vectors = [
    '<script>alert(1)</script>',
    '<p>ok</p><script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<p onclick="alert(1)">click</p>',
    '<a href="javascript:alert(1)">go</a>',
    '<a href="JaVaScRiPt:alert(1)">go</a>',
    '<a href="  javascript:alert(1)">go</a>',
    '<a href="data:text/html,<script>alert(1)</script>">go</a>',
    '<iframe src="https://evil.example"></iframe>',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    '<object data="evil.swf"></object>',
    '<embed src="evil.swf">',
    '<style>body{background:url("javascript:alert(1)")}</style>',
    '<form action="javascript:alert(1)"><button>x</button></form>',
    '<body onload=alert(1)>',
    // ⚠ Mutation-XSS: these only become dangerous AFTER the browser re-parses them, which is what
    // the fixpoint loop in the sanitiser exists for. An unwrap-based sanitiser fails these.
    '<svg><script>alert(1)</script></svg>',
    '<math><mtext><script>alert(1)</script></mtext></math>',
    '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
    '<template><script>alert(1)</script></template>',
    '<xmp><script>alert(1)</script></xmp>',
    '<textarea><script>alert(1)</script></textarea>',
    // Malformed / nested, the kind a naive regex stripper reassembles into something live.
    '<scr<script>ipt>alert(1)</scr</script>ipt>',
    '<<script>script>alert(1)<</script>/script>',
    '<p>unclosed<script>alert(1)',
  ];
  for (const raw of vectors) {
    const out = sanitizeHtml(raw);
    assert.ok(!EXECUTABLE.test(out),
      `this survived sanitising:\n  in:  ${raw}\n  out: ${out}`);
  }
});

test('the pass is a fixpoint: sanitising its own output changes nothing', async () => {
  const { sanitizeHtml } = await load();
  // The header claims a fixpoint, which is the property that stops a string that RE-PARSES
  // differently from smuggling a live node through on the second read.
  for (const raw of [
    '<svg><script>alert(1)</script></svg>',
    '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
    '<p>fine <strong>and bold</strong></p>',
    '<scr<script>ipt>alert(1)</scr</script>ipt>',
  ]) {
    const once = sanitizeHtml(raw);
    assert.equal(sanitizeHtml(once), once, `not a fixpoint for: ${raw}`);
  }
});

test('the formatting a recap is actually for still comes through', async () => {
  const { sanitizeHtml } = await load();
  // ⚠ A sanitiser that strips everything passes every security assertion above and is useless. This
  // is the half that stops the fix for a leak being "return empty string".
  const out = sanitizeHtml(
    '<p>A <strong>recap</strong> with <em>marks</em>, a <a href="https://example.com">link</a>,'
    + '<ul><li>one</li><li>two</li></ul><blockquote>quoted</blockquote><code>x = 1</code></p>');
  for (const kept of ['<p', '<strong', '<em', '<a ', 'href="https://example.com"', '<ul', '<li', '<blockquote', '<code']) {
    assert.ok(out.includes(kept), `sanitising removed ${kept}, which a recap is made of:\n${out}`);
  }
  assert.ok(out.includes('recap') && out.includes('quoted'), 'the words themselves must survive');
});

test('a heading is demoted rather than dropped, so a recap cannot break the page outline', async () => {
  const { sanitizeHtml } = await load();
  const out = sanitizeHtml('<h1>Big</h1><h2>Less big</h2>');
  assert.ok(!/<h[1-4]\b/i.test(out), `a real heading survived: ${out}`);
  assert.ok(/<h[56]\b/i.test(out), `the heading was dropped instead of demoted, losing the text: ${out}`);
  assert.ok(out.includes('Big') && out.includes('Less big'), 'demotion must keep the words');
});

test('the inline sanitiser refuses block content as well as script', async () => {
  const { sanitizeInline } = await load();
  const out = sanitizeInline('<p>para</p><h2>head</h2><script>alert(1)</script><strong>keep</strong>');
  assert.ok(!EXECUTABLE.test(out), `script survived the inline pass: ${out}`);
  assert.ok(!/<(p|h[1-6]|ul|ol|li)\b/i.test(out), `a block tag survived the INLINE pass: ${out}`);
  assert.ok(out.includes('keep'), 'inline marks must still come through');
  assert.ok(out.includes('para') && out.includes('head'), 'unwrapped blocks must keep their text');
});

test('inline copy and safe links render with a server DOM parser and no window', async () => {
  const { sanitizeInline } = await load();
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window');
  delete globalThis.window;
  try {
    const out = sanitizeInline('Read <strong>this</strong> <a href="#go/privacy">policy</a><script>alert(1)</script>');
    assert.match(out, /<strong>this<\/strong>/);
    assert.match(out, /href="#go\/privacy"/);
    assert.ok(!EXECUTABLE.test(out));
  } finally {
    if (had) Object.defineProperty(globalThis, 'window', had);
  }
});

test('without a DOM it returns nothing rather than the raw string', async () => {
  const { sanitizeHtml } = await load();
  // `window`, because that is the guard the function actually reads.
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window');
  delete globalThis.window;
  try {
    // ⚠ The dangerous failure is returning the INPUT when it cannot parse: that would hand raw
    // stored HTML straight to dangerouslySetInnerHTML on the one path with no sanitiser behind it.
    const out = sanitizeHtml('<script>alert(1)</script>');
    assert.equal(out, '', `with no DOMParser it returned: ${out}`);
  } finally {
    if (had) Object.defineProperty(globalThis, 'window', had);
  }
});
