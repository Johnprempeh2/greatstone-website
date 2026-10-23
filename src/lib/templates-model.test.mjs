import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STARTERS, listStarters, getStarter, buildStarterContent } from './templates-model.mjs';

// Hardcoded copy of puck.config.jsx:42 MODULES keys (37 of them) — the test stays STORE-FREE (puck.config
// is JSX, unloadable under bare node). The size assertion below trips if this copy drifts from the real set.
const KNOWN_TYPES = new Set(['Hero', 'Chapter', 'Pillars', 'PillarCards', 'PillarExplorer', 'IndustryPicker', 'MaturityMap', 'MaturityModel', 'Steps', 'ServiceCards', 'ServiceCatalog', 'Terrace', 'Spectrum', 'Timeline', 'Ladder', 'MethodTieIn', 'StatStrip', 'CaseStudy', 'RoiBar', 'Quote', 'Team', 'Values', 'FeaturedArticle', 'InsightsGrid', 'IntelBand', 'Figure', 'Storefront', 'TimeCounter', 'BookDeepDive', 'ContactBand', 'Invite', 'FeatureGrid', 'NewsletterBand', 'Faq', 'TimeSavingsCalculator', 'LogoWall', 'ComparisonMatrix']);

test('KNOWN_TYPES is the full 37-block registry (drift guard vs puck.config.jsx:42)', () => {
  assert.equal(KNOWN_TYPES.size, 37);
});

test('every STARTER is well-formed and references only REAL registered block types', () => {
  const ids = new Set();
  for (const s of STARTERS) {
    assert.equal(typeof s.id, 'string'); assert.ok(s.id.length);
    assert.equal(typeof s.label, 'string'); assert.ok(s.label.length);
    assert.equal(typeof s.blurb, 'string'); assert.ok(s.blurb.length);
    assert.ok(Array.isArray(s.blocks) && s.blocks.length >= 1);
    assert.ok(!ids.has(s.id), 'duplicate starter id ' + s.id); ids.add(s.id);
    for (const b of s.blocks) assert.ok(KNOWN_TYPES.has(b.type), s.id + ' references unknown block type ' + b.type);
    assert.ok(Object.isFrozen(s) && Object.isFrozen(s.blocks));
  }
  assert.ok(Object.isFrozen(STARTERS));
});

test('buildStarterContent mints unique ids, preserves block order, and never mutates the source', () => {
  let i = 0;
  const mint = (t) => t + '-' + (i++);
  const before = JSON.parse(JSON.stringify(STARTERS));
  for (const s of STARTERS) {
    const content = buildStarterContent(s, mint);
    assert.equal(content.length, s.blocks.length);
    assert.deepEqual(content.map((b) => b.type), s.blocks.map((b) => b.type)); // order preserved
    // collect every id at any depth → no duplicates within the built content
    const ids = [];
    const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.keys(v).forEach((k) => { if (k === 'id') ids.push(v[k]); walk(v[k]); }); };
    content.forEach(walk);
    assert.equal(new Set(ids).size, ids.length, 'duplicate id minted in ' + s.id);
    content.forEach((b) => assert.ok(b.props.id, 'block missing props.id'));
  }
  assert.deepEqual(STARTERS, before); // frozen source untouched
});

test('getStarter / listStarters contract', () => {
  assert.equal(getStarter('nope'), null);
  assert.equal(getStarter(''), null);
  assert.equal(getStarter('landing'), STARTERS.find((s) => s.id === 'landing'));
  assert.equal(listStarters(), STARTERS);
  assert.equal(listStarters().length, 5);
});

test('blank starter is a single Hero; pre-filled props survive buildStarterContent', () => {
  const blank = getStarter('blank');
  assert.equal(blank.blocks.length, 1);
  assert.equal(blank.blocks[0].type, 'Hero');
  // the injected mint must re-mint id but NOT clobber other pre-filled props
  const built = buildStarterContent(blank, (t) => t + '-x');
  assert.equal(built[0].props.kicker, 'New page');
  const landing = buildStarterContent(getStarter('landing'), (t) => t + '-y');
  assert.equal(landing[0].props.kicker, 'Landing');
  assert.equal(landing[0].props.ctaHref, '#go/contact');
});
