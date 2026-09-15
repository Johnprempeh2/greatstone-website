// A kind that is routable must actually be routed.
//
// ITEM_KINDS is what the URL regex will match. Listing a kind there that nothing renders does not
// produce an error: the hash parses, the portal finds no branch for it, and the reader lands on the
// Overview wondering why the link did nothing. It happened the moment `unit` was added to the list
// with no page behind it, and it is the same silent-dead-end shape as a gate that scans the wrong
// directory: everything reports success and the thing you asked for is not there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { ITEM_KINDS, DEEPDIVE_ITEM_RE, itemHref, deepDiveHref } from './deepdive-route.mjs';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const portal = fs.readFileSync(path.join(here, '..', 'store', 'DeepDivePortal.jsx'), 'utf8');

test('every routable kind is rendered by something', () => {
  const missing = ITEM_KINDS.filter((k) => {
    if (new RegExp(`itemKind === '${k}'`).test(portal)) return false;
    // sessions came first and are routed through a named variable rather than the comparison
    if (k === 'session' && /itemKind === 'session' \? itemId/.test(portal)) return false;
    return true;
  });
  // ⚠ An empty ITEM_KINDS would make `missing` empty too, and this would pass having checked
  // nothing. The list is the subject of the test, so its size is part of the assertion.
  assert.ok(ITEM_KINDS.length >= 8,
    `only ${ITEM_KINDS.length} routable kinds: this test is checking almost nothing`);
  assert.deepEqual(missing, [], 'these kinds parse from a URL but nothing renders them');
});

test('every kind linked to from a page is routable', () => {
  const store = path.join(here, '..', 'store');
  const linked = new Set();
  for (const f of fs.readdirSync(store).filter((x) => x.endsWith('.jsx'))) {
    const src = fs.readFileSync(path.join(store, f), 'utf8');
    for (const m of src.matchAll(/itemHref\([^,]+,\s*'([a-z]+)'/g)) linked.add(m[1]);
  }
  const stray = [...linked].filter((k) => !ITEM_KINDS.includes(k));
  // ⚠ Same shape, one level further out: if the directory read returns nothing, or `itemHref(` is
  // renamed and the pattern stops matching, `linked` is empty and no link is checked at all.
  assert.ok(linked.size >= 6,
    `only ${linked.size} kinds are linked to from any page, which cannot be right: the itemHref pattern has stopped matching`);
  assert.deepEqual(stray, [], 'a page links to a kind the router does not know, so the link dead-ends');
});

test('a minted link parses back to the same kind and id', () => {
  for (const k of ITEM_KINDS) {
    const href = itemHref('indago', k, `${k[0]}:1908dcbf`);
    const m = DEEPDIVE_ITEM_RE.exec(href);
    assert.ok(m, `${k}: ${href} does not match the item route`);
    assert.equal(m[1], 'indago');
    assert.equal(m[2], k);
    assert.equal(m[3], `${k[0]}:1908dcbf`);
  }
  assert.equal(deepDiveHref('indago'), '#deepdive/indago');
});
