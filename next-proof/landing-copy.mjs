// The Two Doors landing's words, editable from GSAM's Website module (8 Nov): its layout, images, motion and
// styling stay frozen. The island's data-copy holds only text fields and showCue; anything else is ignored.
import landing from './frozen/two-doors-landing.json' with { type: 'json' };
import { isHidden } from './hidden-routes.mjs';

const NOT_COPY = /^(id|_note|_section)$|(Href|Image)$/;
/** The landing's editable text fields: every string prop of its frozen blocks that is not a link or an image. */
export const LANDING_TEXT_FIELDS = new Set(landing.data.content.flatMap((block) =>
  Object.entries(block.props).filter(([key, value]) => typeof value === 'string' && !NOT_COPY.test(key)).map(([key]) => key)));
export const LANDING_TOGGLES = new Set(['showCue']);

/** The overrides an island's data-copy may carry: known text fields (strings) and known toggles (booleans). */
export function landingCopy(raw) {
  let parsed;
  try { parsed = JSON.parse(raw || '{}'); } catch { return {}; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return Object.fromEntries(Object.entries(parsed).filter(([key, value]) =>
    (LANDING_TEXT_FIELDS.has(key) && typeof value === 'string' && value.length <= 600) || (LANDING_TOGGLES.has(key) && typeof value === 'boolean')));
}

/**
 * The frozen blocks with the overrides applied: each field only where that block already has it (showCue on the hero).
 * `markFields` (GSAM live design only) has each block name its text fields on the page.
 */
// 8 Nov (John): no placeholders in front of visitors. The case-study section shows only when it holds a verified case
// (GRE-1852: none approved yet), so the landing drops it rather than saying "Work we will show here".
const hasVerifiedCase = (block) => block.type !== 'TwoDoorsProof'
  || (block.props.cases || []).some((study) => study?.headline && study?.result && study?.verified);
// A link to a hidden page (the door's proof link to /case-studies, 8 Nov) goes to How we work instead.
const HIDDEN_LINK_TARGET = '/consultancy/how-we-work';
const unhideLinks = (block) => {
  const moved = Object.entries(block.props).filter(([key, value]) => key.endsWith('Href') && typeof value === 'string' && isHidden(value));
  return moved.length ? { ...block, props: { ...block.props, ...Object.fromEntries(moved.map(([key]) => [key, HIDDEN_LINK_TARGET])) } } : block;
};
// 10 Nov (John): "Choose your side" comes out, and so does the closing section that repeated the two doors under
// that heading. The frozen file stays as published; the words used instead are ones the landing already says, and
// an edit from GSAM still wins. The hero and the doors keep their design.
export const RETIRED_WORDING = /choose your side/i;
const REWORDED = { cueText: 'Two ways to work with Greatstone', chooserHeading: 'DX Consultancy or DX Dev Tools' };
const reword = (block) => {
  const changed = Object.entries(REWORDED).filter(([key]) => RETIRED_WORDING.test(block.props[key] || ''));
  return changed.length ? { ...block, props: { ...block.props, ...Object.fromEntries(changed) } } : block;
};
const shown = { ...landing.data, content: landing.data.content.filter((block) => hasVerifiedCase(block) && block.type !== 'TwoDoorsBottom').map(unhideLinks).map(reword) };

export function landingData(copy, markFields = false) {
  const overrides = { ...landingCopy(copy), ...(markFields ? { gsMarkFields: true } : {}) };
  if (!Object.keys(overrides).length) return shown;
  return { ...shown, content: shown.content.map((block) => {
    const own = Object.entries(overrides).filter(([key]) => Object.hasOwn(block.props, key) || key === 'gsMarkFields' || (key === 'showCue' && block.type === 'TwoDoors'));
    return own.length ? { ...block, props: { ...block.props, ...Object.fromEntries(own) } } : block;
  }) };
}
