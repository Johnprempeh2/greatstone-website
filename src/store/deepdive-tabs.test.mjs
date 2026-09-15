// A button that jumps to a tab which no longer exists does nothing, silently.
//
// Merging five tabs into one left `go('validate')` and friends pointing at ids the TABS list no
// longer contains. React renders no panel for an unknown id, so the click just appears to fail:
// no error, no navigation, nothing in the console. This is the same silent-dead-end shape as a
// routable kind with no route.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, 'DeepDivePortal.jsx'), 'utf8');

/** The tab ids the portal actually renders. */
function tabIds() {
  const block = src.slice(src.indexOf('const TABS = ['), src.indexOf('];', src.indexOf('const TABS = [')));
  return [...block.matchAll(/id:\s*'([\w-]+)'/g)].map((m) => m[1]);
}

test('the tab list and the panel switch agree', () => {
  const ids = tabIds();
  assert.ok(ids.length >= 5, `expected a real tab list, found ${ids.length}`);
  // Every tab except the last (the fall-through) must have its own branch in the panel switch.
  for (const id of ids.slice(0, -1)) {
    assert.ok(new RegExp(`t\\.id === '${id}'`).test(src), `no panel renders the "${id}" tab`);
  }
});

// ⚠ THIS CHECK USED TO SCAN FOR TWO PATTERNS IN ONE FILE, AND SAID "nothing".
// It looked for go('x') and setTab('x') in DeepDivePortal.jsx only, so it could not see a tab id
// passed as a PROP (`tab="needs"` on the Still needed tile) or one held in ANOTHER FILE's lookup
// table (RecordSearch's TAB_FOR, which pointed at 'hypotheses' and 'sources'). All three were dead,
// all three blanked the entire record when clicked, and this test reported clean.
// A gate that scans a subset while reporting on the whole is worse than no gate, because it is
// believed. So: every known way a tab id is written, across every file that writes one.
const SOURCES = ['DeepDivePortal.jsx', 'RecordSearch.jsx'];

function jumpsInFile(name) {
  const text = fs.readFileSync(path.join(here, name), 'utf8');
  const out = new Map();
  const add = (id, how) => out.set(id, how);
  for (const m of text.matchAll(/\bgo\('([\w-]+)'\)/g)) add(m[1], `${name}: go('${m[1]}')`);
  for (const m of text.matchAll(/\bsetTab\('([\w-]+)'\)/g)) add(m[1], `${name}: setTab('${m[1]}')`);
  // a tab id handed down as a prop
  for (const m of text.matchAll(/\btab="([\w-]+)"/g)) add(m[1], `${name}: tab="${m[1]}"`);
  // a lookup table whose values are tab ids
  const tf = text.match(/const TAB_FOR = \{([^}]*)\}/);
  if (tf) for (const m of tf[1].matchAll(/:\s*'([\w-]+)'/g)) add(m[1], `${name}: TAB_FOR → '${m[1]}'`);
  return out;
}

test('nothing jumps to a tab that does not exist', () => {
  const ids = new Set(tabIds());
  const jumps = new Map();
  for (const f of SOURCES) for (const [id, how] of jumpsInFile(f)) jumps.set(id, how);
  assert.ok(jumps.size >= 4, `found only ${jumps.size} jumps — the scanner has stopped seeing them`);
  const stray = [...jumps.entries()].filter(([id]) => !ids.has(id)).map(([, how]) => how);
  assert.deepEqual(stray, [],
    'these jump to a tab id the portal no longer has, so the click blanks the record');
});

test('the panel switch has no branch for a tab that was removed', () => {
  const ids = new Set(tabIds());
  const branches = [...src.matchAll(/t\.id === '([\w-]+)'/g)].map((m) => m[1]);
  const dead = [...new Set(branches)].filter((id) => !ids.has(id));
  assert.deepEqual(dead, [], 'dead branches for tabs that no longer exist');
});
