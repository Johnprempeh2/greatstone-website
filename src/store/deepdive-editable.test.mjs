// A kind you can CREATE and can never CHANGE is a trap that only springs later: the item goes in, a
// field is wrong, and there is no way to correct it and no way to delete it. It is invisible at
// review time because the Add path works perfectly.
//
// It had happened to two kinds. `offering` and `task` each had an AddButton and no edit control
// anywhere in the portal — and `task.fate` is the field the entire target-state panel is computed
// from, so a task filed under the wrong fate was permanent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { KINDS } from '../data/deepdive-schema.mjs';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const src = fs.readdirSync(here).filter((f) => f.endsWith('.jsx'))
  .map((f) => fs.readFileSync(path.join(here, f), 'utf8')).join('\n');

// Every way the portal opens the drawer for a kind.
const has = (kind, mode) => {
  const q = `['"]${kind}['"]`;
  const viaComponent = mode === 'add'
    ? new RegExp(`<AddButton[^>]*kind=\\{?${q}`)
    : new RegExp(`<EditLink[^>]*kind=\\{?${q}`);
  const viaDrawer = new RegExp(`mode:\\s*'${mode}',\\s*kind:\\s*${q}`);
  return viaComponent.test(src) || viaDrawer.test(src);
};

test('every kind can be added', () => {
  const missing = KINDS.filter((k) => !has(k, 'add'));
  assert.deepEqual(missing, [], 'these kinds exist in the schema with no way to create one');
});

test('every kind can be edited, and therefore removed', () => {
  // Remove rides on the edit drawer (`!isNew` in the footer), so an edit path is also the only way
  // to delete. A kind with no edit control cannot be corrected OR taken out.
  const missing = KINDS.filter((k) => !has(k, 'edit'));
  assert.deepEqual(missing, [],
    'these kinds can be created and then never changed or removed — add an EditLink or an edit drawer');
});

test('the scanner can still see the patterns it checks', () => {
  assert.ok(/<AddButton/.test(src), 'no AddButton found at all — the scanner has gone blind');
  assert.ok(/<EditLink/.test(src), 'no EditLink found at all — the scanner has gone blind');
});

// An inline editor with no save handler renders perfectly and throws the moment you press Save:
// `onSaveField is not a function`. The failure is at the END of the interaction — after the user has
// typed a paragraph — which is the worst place for it.
//
// ⚠ THE FIRST VERSION OF THIS TEST LOOKED FOR ONE PROP NAME (`onSaveField`) and immediately failed a
// page that was correct: the question page saves item STATE rather than a plan field, so it uses a
// different handler. A check that only knows one spelling of "right" reports good code as broken,
// which is how a check gets switched off. It now reads the handler each editor ACTUALLY calls and
// asks whether the page is given it.
test('every inline editor calls a handler its page is actually given', () => {
  const files = fs.readdirSync(here).filter((f) => f.endsWith('Page.jsx'));
  const portal = fs.readFileSync(path.join(here, 'DeepDivePortal.jsx'), 'utf8');
  const missing = [];
  let checked = 0;
  for (const f of files) {
    const text = fs.readFileSync(path.join(here, f), 'utf8');
    if (!/from '\.\/InlineText\.jsx'/.test(text)) continue;
    const component = f.replace('.jsx', '');
    const mount = portal.match(new RegExp(`<${component}[\\s\\S]{0,1200}?/>`));
    if (!mount) { missing.push(`${component}: no mount found in DeepDivePortal`); continue; }
    // the function each onSave calls: onSave={(v) => HANDLER(...)}
    const handlers = new Set([...text.matchAll(/onSave=\{\([^)]*\)\s*=>\s*(\w+)\(/g)].map((m) => m[1]));
    assert.ok(handlers.size, `${component} renders InlineText but no onSave={...} was found`);
    for (const h of handlers) {
      checked++;
      const givenByPortal = new RegExp(`${h}=`).test(mount[0]);
      const definedLocally = new RegExp(`(function|const)\\s+${h}\\b`).test(text);
      if (!givenByPortal && !definedLocally) {
        missing.push(`${component}: onSave calls ${h}(), which the portal does not pass and the page does not define`);
      }
    }
  }
  assert.ok(checked >= 4, `only checked ${checked} inline editors — the scanner has gone blind`);
  assert.deepEqual(missing, [], 'an inline editor here would throw on Save');
});
