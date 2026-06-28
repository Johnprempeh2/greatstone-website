import { test } from 'node:test';
import assert from 'node:assert/strict';
import { remapIds, buildInsertBlock, addSection, removeSection, renameSection, listSections } from './sections-model.mjs';

// deterministic id factory — proves the model never needs rid (which uses Math.random)
const mintFactory = () => { let n = 0; return (t) => t + '-' + (n++); };
const allIds = (block) => { const out = []; const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.keys(v).forEach((k) => (k === 'id' ? out.push(v[k]) : walk(v[k]))); }; walk(block); return out; };

const hero = () => ({ type: 'Hero', props: { id: 'hero-OLD', headline: 'Hi', highlight: 'there', align: 'center' } });
const faq = () => ({ type: 'Faq', props: { id: 'faq-OLD', heading: 'Q', items: [{ q: 'a', a: 'b' }, { q: 'c', a: 'd' }] } });
const withItemIds = () => ({ type: 'X', props: { id: 'x-OLD', items: [{ id: 'i-OLD', t: '1' }, { id: 'j-OLD', t: '2' }] } });

test('remapIds re-mints the top-level id and preserves every other prop', () => {
  const out = remapIds(hero(), mintFactory());
  assert.notEqual(out.props.id, 'hero-OLD');
  assert.equal(out.props.headline, 'Hi');
  assert.equal(out.props.highlight, 'there');
  assert.equal(out.props.align, 'center');
  assert.equal(out.type, 'Hero');
});

test('remapIds re-mints nested-array item ids when present, preserves their other fields', () => {
  const out = remapIds(withItemIds(), mintFactory());
  assert.notEqual(out.props.items[0].id, 'i-OLD');
  assert.notEqual(out.props.items[1].id, 'j-OLD');
  assert.notEqual(out.props.items[0].id, out.props.items[1].id);
  assert.equal(out.props.items[0].t, '1');
  assert.equal(out.props.items[1].t, '2');
});

test('remapIds re-mints each id exactly once (no double-mint of the top-level id)', () => {
  let calls = 0;
  remapIds(withItemIds(), (t) => { calls++; return t + '-' + calls; });
  assert.equal(calls, 3); // props.id + two item ids
});

test('remapIds is a deep clone, not a shared reference', () => {
  const src = faq();
  const out = remapIds(src, mintFactory());
  out.props.items[0].q = 'MUTATED';
  assert.equal(src.props.items[0].q, 'a'); // source untouched
});

test('two consecutive remapIds of the same source produce disjoint id sets', () => {
  const mint = mintFactory();
  const a = remapIds(faq(), mint);
  const b = remapIds(faq(), mint);
  const setA = new Set(allIds(a));
  const inBoth = allIds(b).filter((id) => setA.has(id));
  assert.deepEqual(inBoth, []);
});

test('buildInsertBlock yields a fresh-id {type,props} with no label/section id', () => {
  const section = { id: 'sec-1', label: 'Home hero', type: 'Hero', props: { id: 'hero-OLD', headline: 'Hi' } };
  const out = buildInsertBlock(section, mintFactory());
  assert.equal(out.type, 'Hero');
  assert.notEqual(out.props.id, 'hero-OLD');
  assert.equal(out.label, undefined);
  assert.equal(out.props.headline, 'Hi');
});

test('addSection is pure, prepends, snapshots, and falls back to the type as label', () => {
  const block = hero();
  const state = { sections: [{ id: 'old', label: 'X', type: 'Quote', props: {} }] };
  const next = addSection(state, block, '  My hero ', mintFactory());
  assert.notEqual(next, state);
  assert.equal(state.sections.length, 1); // original untouched
  assert.equal(next.sections.length, 2);
  assert.equal(next.sections[0].label, 'My hero');
  assert.equal(next.sections[0].type, 'Hero');
  // snapshot independence: mutating the source block after save doesn't change the stored section
  block.props.headline = 'CHANGED';
  assert.equal(next.sections[0].props.headline, 'Hi');
  // blank label → falls back to the block type
  assert.equal(addSection({ sections: [] }, hero(), '   ', mintFactory()).sections[0].label, 'Hero');
});

test('addSection rejects a block with no type', () => {
  const state = { sections: [] };
  assert.equal(addSection(state, { props: {} }, 'x', mintFactory()), state);
});

test('removeSection removes only the matching id (pure)', () => {
  const state = { sections: [{ id: 'a' }, { id: 'b' }] };
  const next = removeSection(state, 'a');
  assert.deepEqual(next.sections.map((s) => s.id), ['b']);
  assert.equal(state.sections.length, 2);
  assert.deepEqual(removeSection(state, 'zzz').sections.map((s) => s.id), ['a', 'b']);
});

test('renameSection trims and rejects a blank rename', () => {
  const state = { sections: [{ id: 'a', label: 'Old' }] };
  assert.equal(renameSection(state, 'a', '  New ').sections[0].label, 'New');
  assert.equal(renameSection(state, 'a', '   ').sections[0].label, 'Old'); // blank kept
});

test('listSections returns newest-first by ts without mutating the input', () => {
  const state = { sections: [{ id: 'a', ts: 10 }, { id: 'b', ts: 30 }, { id: 'c', ts: 20 }] };
  assert.deepEqual(listSections(state).map((s) => s.id), ['b', 'c', 'a']);
  assert.deepEqual(state.sections.map((s) => s.id), ['a', 'b', 'c']);
});
