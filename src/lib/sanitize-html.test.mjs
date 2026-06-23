// Pure-node regression tests for the engagement-recap sanitiser POLICY. The DOM-mutation behaviour
// (unwrap / demote / fixpoint) needs a DOMParser and is verified in-browser (the #org recap render +
// the staff "preview as the client sees it" pane); these tests lock down the security-critical policy
// — which tags are dropped, which headings demote, which hrefs survive — so a careless edit can't
// silently widen the allowlist. Runs under plain `node --test` (no DOM dependency).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALLOWED, DROP_ENTIRELY, DEMOTE, isSafeHref, sanitizeHtml } from './sanitize-html.mjs';

test('foreign-content / rawtext tags are dropped entirely and never allowed (mutation-XSS vectors)', () => {
  for (const tag of ['SCRIPT', 'STYLE', 'SVG', 'MATH', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'TEXTAREA', 'XMP']) {
    assert.ok(DROP_ENTIRELY.has(tag), tag + ' must be dropped entirely');
    assert.ok(!ALLOWED.has(tag), tag + ' must never be in the allowlist');
  }
});

test('all real headings are demoted, never allowed (cannot break page heading order)', () => {
  for (const h of ['H1', 'H2', 'H3', 'H4']) {
    assert.ok(DEMOTE.has(h), h + ' must demote');
    assert.ok(!ALLOWED.has(h), h + ' must not be allowed as-is');
  }
});

test('only http(s) and mailto hrefs are safe; script/data/leading-space tricks are neutralised', () => {
  assert.ok(isSafeHref('https://example.com'));
  assert.ok(isSafeHref('http://example.com'));
  assert.ok(isSafeHref('mailto:hi@greatstone.dev'));
  assert.ok(isSafeHref('   https://example.com   '), 'surrounding whitespace is trimmed');
  assert.ok(!isSafeHref('javascript:alert(1)'));
  assert.ok(!isSafeHref('  javascript:alert(1)'), 'leading-space bypass is rejected');
  assert.ok(!isSafeHref('JaVaScRiPt:alert(1)'));
  assert.ok(!isSafeHref('data:text/html,<script>alert(1)</script>'));
  assert.ok(!isSafeHref('vbscript:msgbox(1)'));
  assert.ok(!isSafeHref(''));
  assert.ok(!isSafeHref(null));
  assert.ok(!isSafeHref(undefined));
});

test('the allowlist holds only safe formatting tags (no allow/drop overlap)', () => {
  for (const t of ALLOWED) assert.ok(!DROP_ENTIRELY.has(t), t + ' cannot be both allowed and dropped');
  for (const t of ['P', 'A', 'STRONG', 'EM', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'CODE']) assert.ok(ALLOWED.has(t), t + ' should be allowed');
});

test('sanitizeHtml returns empty string without a DOM (SSR / node guard)', () => {
  assert.equal(sanitizeHtml('<p>hi<script>alert(1)</script></p>'), ''); // no window in node → guarded
  assert.equal(sanitizeHtml(''), '');
  assert.equal(sanitizeHtml(null), '');
});
