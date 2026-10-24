import assert from 'node:assert/strict';
import test from 'node:test';
import Ajv from 'ajv/dist/2020.js';
import manifest from './release-schema/manifest.v1.json' with { type: 'json' };
import schema from './release-schema/blocks-motion.v1.schema.json' with { type: 'json' };
import baked from './data/release.json' with { type: 'json' };
import { BACKGROUND_EFFECTS, MOTION_BY_BLOCK, motionField, resolveMotion, resolveMotionFields } from './motion-contract.mjs';
import { validateRelease } from './release-validator.mjs';

test('GSAM field manifest and Puck defaults agree for every motion-capable block', () => {
  const ajv = new Ajv({ strict: false });
  ajv.addSchema(schema);
  assert.deepEqual(Object.keys(manifest.blockMotionFields).sort(), Object.keys(MOTION_BY_BLOCK).sort());
  assert.equal(motionField('TwoDoors').motion, undefined);
  assert.equal(motionField('TwoDoorsStory').motion, undefined);
  for (const [type, definition] of Object.entries(MOTION_BY_BLOCK)) {
    const validate = ajv.getSchema(`${schema.$id}${manifest.blockMotionFields[type]}`);
    assert.equal(validate(definition.default), true, `${type}: ${ajv.errorsText(validate.errors)}`);
    assert.deepEqual(motionField(type).motion.objectFields.effect.options.map((option) => option.value), definition.effects);
    for (const invalid of [{ ...definition.default, effect: 'custom.gradient' }, { ...definition.default, intensity: 'extreme' }, { ...definition.default, quietAnchor: 'anywhere' }]) {
      assert.equal(validate(invalid), false, `${type} accepted an unapproved field value`);
    }
  }
});

test('the retired home placements cannot enter a release', () => {
  const release = structuredClone(baked);
  release.pages.find((page) => page.slug === 'home').data.content[0].props.motion = { effect: 'hero.stone', intensity: 'full' };
  assert.equal(validateRelease(release, { siteId: release.siteId, orgId: release.orgId })?.rule, 'R6');
});

test('old saved release remains valid and absent motion does not create a new effect', () => {
  assert.equal(validateRelease(baked, { siteId: baked.siteId, orgId: baked.orgId }), null);
  for (const page of baked.pages) for (const block of page.data.content) {
    if (MOTION_BY_BLOCK[block.type] && !block.props.motion) assert.equal(resolveMotion(block.type, block.props), null);
  }
});

test('release rejects invalid motion without changing the stored block', () => {
  const release = structuredClone(baked);
  const block = release.pages.flatMap((page) => page.data.content).find((item) => item.type === 'Hero');
  block.props.motion = { effect: 'hero.stone', intensity: 'subtle', quietAnchor: 'copy' };
  assert.equal(validateRelease(release, { siteId: release.siteId, orgId: release.orgId }), null);
  block.props.motion.effect = 'script.effect';
  assert.equal(validateRelease(release, { siteId: release.siteId, orgId: release.orgId })?.rule, 'R6');
  assert.equal(resolveMotion('Hero', block.props).effect, 'none');
});

test('editor offers rendered effects with plain labels and hides intensity for None', () => {
  assert.deepEqual(motionField('Hero').motion.objectFields.effect.options, [
    { label: 'None', value: 'none' }, { label: 'Hero stone', value: 'hero.stone' },
    { label: 'Bedrock', value: 'bg.bedrock' }, { label: 'Ascent', value: 'bg.ascent' },
    { label: 'Datum', value: 'bg.datum' }, { label: 'Meridian', value: 'bg.meridian' },
    { label: 'Veil', value: 'bg.veil' }, { label: 'Orbit', value: 'bg.orbit' },
  ]);
  assert.deepEqual(motionField('MotionBand').motion.objectFields.effect.options[1], { label: 'Tide band', value: 'band.tide' });
  for (const type of ['DevTools', 'AiBaselineSurvey']) {
    assert.deepEqual(MOTION_BY_BLOCK[type].default, { effect: 'none', intensity: 'off', quietAnchor: 'copy' });
    assert.deepEqual(motionField(type).motion.objectFields.effect.options.map((item) => item.value), ['none', ...BACKGROUND_EFFECTS]);
  }
  const fields = motionField('Hero');
  assert.equal(resolveMotionFields('Hero', { props: { motion: { effect: 'none' } } }, fields).motion.objectFields.intensity, undefined);
  assert.equal(resolveMotionFields('Hero', { props: {} }, fields).motion.objectFields.intensity, undefined);
  assert.ok(resolveMotionFields('Hero', { props: { motion: { effect: 'hero.stone' } } }, fields).motion.objectFields.intensity);
});
