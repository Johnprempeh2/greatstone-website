// Pure-node regression tests for the engagement-recap sanitiser POLICY. The DOM-mutation behaviour
// (unwrap / demote / fixpoint) needs a DOMParser and is verified in-browser (the #org recap render +
// the staff "preview as the client sees it" pane); these tests lock down the security-critical policy
// — which tags are dropped, which headings demote, which hrefs survive — so a careless edit can't
// silently widen the allowlist. Runs under plain `node --test` (no DOM dependency).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALLOWED, DROP_ENTIRELY, DEMOTE, isSafeHref, sanitizeHtml, ALLOWED_INLINE, sanitizeInline } from './sanitize-html.mjs';
import { RT_SPAN_CLASSES } from './richtext-marks.mjs';

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

// ── inline rich-text profile ──
test('the inline allowlist holds ONLY inline marks (no block/heading/list/foreign tags)', () => {
  for (const t of ALLOWED_INLINE) assert.ok(!DROP_ENTIRELY.has(t), t + ' cannot be both inline-allowed and dropped');
  for (const t of ['STRONG', 'EM', 'U', 'SPAN', 'A', 'BR']) assert.ok(ALLOWED_INLINE.has(t), t + ' should be inline-allowed');
  // block/heading/list tags must NOT be inline-allowed (they unwrap to their text)
  for (const t of ['P', 'DIV', 'H1', 'H2', 'H5', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'HR', 'IMG', 'B', 'I']) {
    assert.ok(!ALLOWED_INLINE.has(t), t + ' must not be inline-allowed (b/i are aliased, blocks unwrap)');
  }
});

test('the inline span-class allowlist is exactly the shared brand enum (single source of truth, no drift)', () => {
  // sanitize-html.mjs imports RT_SPAN_CLASSES from richtext-marks.mjs, so this asserts they cannot diverge
  assert.ok(RT_SPAN_CLASSES.size >= 5);
  assert.ok(RT_SPAN_CLASSES.has('gs-rt-c-accent') && RT_SPAN_CLASSES.has('gs-rt-bg-teal'));
});

test('sanitizeInline returns empty string without a DOM (SSR / node guard)', () => {
  assert.equal(sanitizeInline('<strong>hi</strong><script>alert(1)</script>'), ''); // no window in node → guarded
  assert.equal(sanitizeInline(''), '');
  assert.equal(sanitizeInline(null), '');
});
