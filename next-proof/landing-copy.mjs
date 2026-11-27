// The Two Doors landing's words, editable from GSAM's Website module (8 Nov): its layout, images, motion and
// styling stay frozen. The island's data-copy holds only text fields and toggles; anything else is ignored.
import landing from './frozen/two-doors-landing.json' with { type: 'json' };
import { isHidden } from './hidden-routes.mjs';
import { isVerifiedCase } from './case-studies.mjs';

const NOT_COPY = /^(id|_note|_section)$|(Href|Image)$/;
// The story section's two route cards sit in a list; their lines are editable by name (narrative sweep, 27 Nov).
const RANGE_LINES = { consultancyRangeLine: 0, toolsRangeLine: 1 };
/** The landing's editable text fields: every string prop of its frozen blocks that is not a link or an image. */
export const LANDING_TEXT_FIELDS = new Set([...landing.data.content.flatMap((block) =>
  Object.entries(block.props).filter(([key, value]) => typeof value === 'string' && !NOT_COPY.test(key)).map(([key]) => key)), ...Object.keys(RANGE_LINES)]);
// showCue: the hero's scroll cue. showPlaceholders: the case-study section's marked placeholders (GRE-6331).
export const LANDING_TOGGLES = new Set(['showCue', 'showPlaceholders']);
const TOGGLE_BLOCK = { showCue: 'TwoDoors', showPlaceholders: 'TwoDoorsProof' };

/** The overrides an island's data-copy may carry: known text fields (strings) and known toggles (booleans). */
export function landingCopy(raw) {
  let parsed;
  try { parsed = JSON.parse(raw || '{}'); } catch { return {}; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return Object.fromEntries(Object.entries(parsed).filter(([key, value]) =>
    (LANDING_TEXT_FIELDS.has(key) && typeof value === 'string' && value.length <= 600) || (LANDING_TOGGLES.has(key) && typeof value === 'boolean')));
}

// 8 Nov (John): no placeholders in front of visitors, so the case-study section left the landing. 26 Nov (John, "fix
// everything" on Ben's reviews, GRE-6327 part 2): it is back with marked placeholders until Ben's case studies arrive.
// It still leaves the landing when it would stand empty: no verified case and no placeholder to show. 27 Nov (John):
// while the Case Studies page is hidden, placeholders are not shown either, so only verified cases bring it back.
const showsCases = (block) => block.type !== 'TwoDoorsProof'
  || (block.props.cases || []).some(isVerifiedCase)
  || (!isHidden('/case-studies') && block.props.showPlaceholders !== false && (block.props.draftItems || []).length > 0);
// A link to a hidden page (none today; the door's proof link, 8 Nov to 26 Nov) goes to How we work instead.
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
const prepared = { ...landing.data, content: landing.data.content.filter((block) => block.type !== 'TwoDoorsBottom').map(unhideLinks).map(reword) };
const shown = { ...prepared, content: prepared.content.filter(showsCases) };

/**
 * The frozen blocks with the overrides applied: each field only where that block already has it (showCue on the hero,
 * showPlaceholders on the case-study section). `markFields` (GSAM live design only) has each block name its text
 * fields on the page. `cases` are the release's verified case studies (next-proof/case-studies.mjs): when there are
 * any, the case-study section shows them instead of its placeholders.
 */
export function landingData(copy, markFields = false, cases = []) {
  const overrides = { ...landingCopy(copy), ...(markFields ? { gsMarkFields: true } : {}) };
  const verified = cases.filter(isVerifiedCase);
  if (!Object.keys(overrides).length && !verified.length) return shown;
  return { ...prepared, content: prepared.content.map((block) => {
    const own = Object.entries(overrides).filter(([key]) => Object.hasOwn(block.props, key) || key === 'gsMarkFields' || TOGGLE_BLOCK[key] === block.type);
    if (block.type === 'TwoDoorsProof' && verified.length) own.push(['cases', verified]);
    const lines = Object.entries(RANGE_LINES).filter(([key]) => typeof overrides[key] === 'string');
    if (block.type === 'TwoDoorsStory' && lines.length) {
      const range = (block.props.range || []).map((item, index) => {
        const line = lines.find(([, at]) => at === index);
        return line ? { ...item, line: overrides[line[0]] } : item;
      });
      own.push(['range', range]);
    }
    return own.length ? { ...block, props: { ...block.props, ...Object.fromEntries(own) } } : block;
  }).filter(showsCases) };
}
