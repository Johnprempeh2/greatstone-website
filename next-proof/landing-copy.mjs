// The Two Doors landing's words, editable from GSAM's Website module (8 Nov): its layout, images, motion and
// styling stay frozen. The island's data-copy holds only text fields and showCue; anything else is ignored.
import landing from './frozen/two-doors-landing.json' with { type: 'json' };

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

/** The frozen blocks with the overrides applied: each field only where that block already has it (showCue on the hero). */
export function landingData(copy) {
  const overrides = landingCopy(copy);
  if (!Object.keys(overrides).length) return landing.data;
  return { ...landing.data, content: landing.data.content.map((block) => {
    const own = Object.entries(overrides).filter(([key]) => Object.hasOwn(block.props, key) || (key === 'showCue' && block.type === 'TwoDoors'));
    return own.length ? { ...block, props: { ...block.props, ...Object.fromEntries(own) } } : block;
  }) };
}
