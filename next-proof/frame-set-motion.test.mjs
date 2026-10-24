import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { MOTION_BY_BLOCK, MOTION_EFFECTS } from './motion-contract.mjs';
import { motionHello, setMotion, setMotionResult } from './frame-set-motion.mjs';
import { validMessage } from './frame-protocol.mjs';

const draft = { content: [
  { type: 'Hero', props: { id: 'hero-1', title: 'Keep this' } },
  { type: 'Prose', props: { id: 'prose-1', text: 'Legacy' } },
] };

test('hello-ack advertises motion only for blocks with a motion field, with rendered effect stills and study ids', () => {
  const components = {
    Hero: { fields: { motion: { type: 'object' } } },
    MotionBand: { fields: { motion: { type: 'object' } } },
    Prose: { fields: {} },
  };
  const { blocks, motionEffects } = motionHello(components);
  assert.deepEqual(blocks[0].motion, { effects: MOTION_BY_BLOCK.Hero.effects, default: { effect: 'none', intensity: 'off' } });
  assert.deepEqual(blocks[1].motion, { effects: MOTION_BY_BLOCK.MotionBand.effects, default: { effect: 'band.tide', intensity: 'subtle' } });
  assert.equal(Object.hasOwn(blocks[2], 'motion'), false);
  assert.deepEqual(motionEffects, MOTION_EFFECTS);
  for (const effect of motionEffects) {
    assert.equal(existsSync(`public${effect.still}`), true, effect.id);
    if (effect.id.startsWith('bg.')) assert.match(effect.study, /^0(1[5-9]|20)$/);
  }
});

test('set-motion changes only the chosen block in an unsaved draft', () => {
  const result = setMotion(draft, { blockId: 'hero-1', motion: { effect: 'bg.ascent', intensity: 'subtle' } });
  assert.equal(result.ok, true);
  assert.equal(result.dirty, true);
  assert.deepEqual(result.data.content[0].props.motion, { effect: 'bg.ascent', intensity: 'subtle', quietAnchor: 'copy' });
  assert.deepEqual(result.data.content[1], draft.content[1]);
  assert.equal(draft.content[0].props.motion, undefined);
  const off = setMotion(result.data, { blockId: 'hero-1', motion: { effect: 'none', intensity: 'full' } });
  assert.equal(off.data.content[0].props.motion.intensity, 'off');
});

test('set-motion returns every refusal code without touching legacy blocks', () => {
  const choice = { effect: 'bg.ascent', intensity: 'subtle' };
  assert.equal(setMotion(draft, { blockId: 'missing', motion: choice }).code, 'block_not_found');
  assert.equal(setMotion(draft, { blockId: 'prose-1', motion: choice }).code, 'block_has_no_motion');
  assert.equal(setMotion(draft, { blockId: 'hero-1', motion: { effect: 'band.tide', intensity: 'subtle' } }).code, 'effect_not_allowed');
  for (const invalid of [null, {}, { effect: 'bg.ascent', intensity: 'extreme' }, { effect: 1, intensity: 'full' }]) {
    assert.equal(setMotion(draft, { blockId: 'hero-1', motion: invalid }).code, 'invalid_payload');
  }
  assert.equal(setMotion({ content: [{ type: 'Hero', props: { id: 'hero-1', unsupported: () => {} } }] }, { blockId: 'hero-1', motion: choice }).code, 'error');
  assert.equal(draft.content[1].props.motion, undefined);
});

test('set-motion uses the bound frame protocol and replies with its request id', () => {
  const parent = {};
  globalThis.window = { parent };
  const bound = { origin: 'https://studio.example.test', nonce: 'ABCDEFGHIJKLMNOPQRSTUV' };
  const event = { origin: bound.origin, source: parent, data: { gs: 'website-frame', protocol: 1, session: bound.nonce, type: 'set-motion', payload: { blockId: 'hero-1', motion: { effect: 'none', intensity: 'off' } } } };
  assert.equal(validMessage(event, bound, ['set-motion']), true);
  assert.equal(validMessage({ ...event, origin: 'https://other.example.test' }, bound, ['set-motion']), false);
  assert.equal(validMessage({ ...event, data: { ...event.data, session: 'wrong' } }, bound, ['set-motion']), false);
  assert.deepEqual(setMotionResult('request-1', { ok: true, dirty: true }), { requestId: 'request-1', ok: true });
  assert.deepEqual(setMotionResult('request-2', { ok: false, code: 'block_not_found', message: 'Gone' }), { requestId: 'request-2', ok: false, code: 'block_not_found', message: 'Gone' });
});
