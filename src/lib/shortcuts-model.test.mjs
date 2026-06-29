import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHORTCUT_GROUPS, formatChord, chordLabel, matchShortcuts } from './shortcuts-model.mjs';

test('catalogue is frozen + every item has keys + a label', () => {
  assert.ok(Object.isFrozen(SHORTCUT_GROUPS));
  for (const g of SHORTCUT_GROUPS) {
    assert.ok(g.id && g.title && Array.isArray(g.items) && g.items.length);
    for (const it of g.items) {
      assert.ok(Array.isArray(it.keys) && it.keys.length, 'keys present');
      assert.equal(typeof it.label, 'string');
      assert.ok(it.label.length);
    }
  }
});

test('formatChord is platform-aware (⌘/⇧ on mac, Ctrl/Shift elsewhere)', () => {
  assert.deepEqual(formatChord(['mod', 'shift', 'Z'], true), ['⌘', '⇧', 'Z']);
  assert.deepEqual(formatChord(['mod', 'shift', 'Z'], false), ['Ctrl', 'Shift', 'Z']);
  assert.deepEqual(formatChord(['mod', 'K'], true), ['⌘', 'K']);
  assert.deepEqual(formatChord(['Esc'], true), ['Esc']); // literal keys pass through
  assert.deepEqual(formatChord(undefined, true), []);    // null-safe
});

test('chordLabel produces a spoken, glyph-free form', () => {
  assert.equal(chordLabel(['mod', 'K'], true), 'Cmd K');
  assert.equal(chordLabel(['mod', 'K'], false), 'Ctrl K');
  assert.equal(chordLabel(['?'], true), 'question mark');
  assert.equal(chordLabel(['↑'], true), 'Up arrow');
});

test('matchShortcuts: empty query returns every group + a correct total', () => {
  const r = matchShortcuts(SHORTCUT_GROUPS, '', true);
  assert.equal(r.groups.length, SHORTCUT_GROUPS.length);
  assert.equal(r.total, SHORTCUT_GROUPS.reduce((n, g) => n + g.items.length, 0));
});

test('matchShortcuts matches a label substring + drops empty groups', () => {
  const r = matchShortcuts(SHORTCUT_GROUPS, 'undo', true);
  assert.equal(r.total, 1);
  assert.equal(r.groups.length, 1);
  assert.equal(r.groups[0].id, 'editor');
  assert.match(r.groups[0].items[0].label, /Undo/);
});

test('matchShortcuts matches by rendered glyph (esc) and by spoken chord (cmd)', () => {
  assert.equal(matchShortcuts(SHORTCUT_GROUPS, 'esc', true).total >= 1, true);   // Esc row
  const cmd = matchShortcuts(SHORTCUT_GROUPS, 'cmd', true);
  assert.ok(cmd.total >= 2); // every 'mod' chord's spoken label contains Cmd
});

test('matchShortcuts: no match returns empty groups + total 0', () => {
  const r = matchShortcuts(SHORTCUT_GROUPS, 'zzzznope', true);
  assert.deepEqual(r.groups, []);
  assert.equal(r.total, 0);
});

test('matchShortcuts is null-safe', () => {
  assert.doesNotThrow(() => matchShortcuts(null, 'x', true));
  assert.deepEqual(matchShortcuts(null, '', true), { groups: [], total: 0 });
});
