import { findBlock } from './frame-protocol.mjs';
import { INTENSITIES, MOTION_BY_BLOCK, MOTION_EFFECTS } from './motion-contract.mjs';

const failure = (code, message) => ({ ok: false, code, message });

export function motionHello(components) {
  return {
    blocks: Object.keys(components).map((type) => ({
      type, label: type,
      ...(MOTION_BY_BLOCK[type] && components[type].fields?.motion ? {
        motion: {
          effects: [...MOTION_BY_BLOCK[type].effects],
          default: {
            effect: MOTION_BY_BLOCK[type].default.effect,
            intensity: MOTION_BY_BLOCK[type].default.intensity,
          },
        },
      } : {}),
    })),
    motionEffects: MOTION_EFFECTS,
  };
}

export function setMotionResult(requestId, result) {
  return result.ok
    ? { requestId, ok: true }
    : { requestId, ok: false, code: result.code, message: result.message };
}

export function setMotion(draft, payload) {
  const { blockId, motion } = payload || {};
  if (typeof blockId !== 'string' || !blockId || !motion || typeof motion !== 'object' || Array.isArray(motion) ||
    typeof motion.effect !== 'string' || !INTENSITIES.includes(motion.intensity)) {
    return failure('invalid_payload', 'The motion choice is invalid.');
  }
  try {
    const data = structuredClone(draft);
    const block = findBlock(data?.content, blockId);
    if (!block) return failure('block_not_found', 'That block is no longer in the draft.');
    const allowed = MOTION_BY_BLOCK[block.type];
    if (!allowed) return failure('block_has_no_motion', 'That block does not support motion.');
    if (!allowed.effects.includes(motion.effect)) return failure('effect_not_allowed', 'That effect is not available for this block.');
    block.props.motion = { effect: motion.effect, intensity: motion.effect === 'none' ? 'off' : motion.intensity, quietAnchor: 'copy' };
    return { ok: true, data, dirty: true };
  } catch {
    return failure('error', 'The motion choice could not be applied.');
  }
}
