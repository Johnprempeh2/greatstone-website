// Pure model for the admin guided tours (onboarding walkthroughs). STORE-FREE + node-tested (imports nothing,
// no DOM, no localStorage, no store.js) so all the branch logic is verifiable without a browser, mirroring
// lib/onboarding-model.mjs. The React layer (cms/Tour.jsx + cms/useTour.mjs) owns the DOM spotlight, the
// localStorage IO and navigation; this module owns the decisions: which steps a user sees (role-gating +
// renumber), step progression + clamping, where to place the card, and the per-user seen-state.
//
// A GUIDE is an ordered list of STEPS. A STEP: { id, target?, selector?, title, body, placement?, route?, requires? }
//   target   = a stable data-tour token resolved in the UI via [data-tour="<target>"] (never a brittle nth-child)
//   selector = a raw CSS fallback resolved when there is no data-tour target (used for a third-party surface we
//              do not own the markup of, e.g. the Puck canvas frame). Prefer `target` whenever we own the element.
//   route    = { section, slug? } the host navigates to (goAdmin) before the step, so the element exists
//   requires = 'edit' | 'manage' capability; a step the user's role lacks is dropped and "n of m" renumbered
// Copy is British English, brand voice, NO em-dashes (a hard house rule; the tests lock it).

export const TOURS = {
  hub: {
    id: 'hub', title: 'Admin hub tour', autoStart: true,
    steps: [
      { id: 'welcome', target: 'logo', title: 'Welcome to your studio', body: 'Every page, product and check sits one click away in the rail on the left. Take the quick tour, or skip and explore. You can replay it any time from Help.' },
      { id: 'content', target: 'group-content', title: 'Content is what you make', body: 'Pages, navigation, media and SEO. Page editor opens the live editor; the rest open a quick panel right here.' },
      { id: 'publishing', target: 'group-publishing', title: 'Going live', body: 'When work is ready it comes through Publishing. Releases is your go-live queue, with the history beside it.' },
      { id: 'quality', target: 'group-quality', title: 'Quality checks', body: 'Copy, links, accessibility and SEO run continuously and read-only. A number means something wants a look; nothing here changes your site on its own.' },
      { id: 'commerce', target: 'group-commerce', title: 'Commerce', body: 'Your catalogue, pricing, orders and enquiries live here, on the same sign-in.' },
      { id: 'gettingstarted', target: 'rail-gettingstarted', title: 'You are set', requires: 'manage', body: 'Getting started keeps a setup checklist, and Help replays any guide. Welcome aboard.' },
    ],
  },
  editor: {
    id: 'editor', title: 'Page editor guide',
    steps: [
      { id: 'add', target: 'puck-add', title: 'Add a block', requires: 'edit', body: 'Build a page by dropping in blocks from this list. Pick one and it lands on the page ready to edit.' },
      // the rich-text bar only exists once a text block is selected, so we spotlight the canvas (always present)
      // and describe in-place editing plus the formatting bar, rather than point at a toolbar that may be absent.
      { id: 'edit', selector: '[class*="PuckCanvas"]', title: 'Edit and format text', requires: 'edit', body: 'Click any heading or paragraph on the page to type straight into it. Select a few words and a formatting bar appears for bold, italic, a brand colour or a highlight box. Colours stay on the brand set, so a page can never go off-palette or fail contrast.' },
      { id: 'studio', target: 'studio-btn', title: 'The Studio side desk', requires: 'edit', body: 'Pages, SEO, the 3D background, version history and releases, all without leaving the editor.' },
      { id: 'status', target: 'status-ctl', title: 'Status and autosave', requires: 'edit', body: 'Your draft autosaves as you work. The status control moves a page from draft to review to published.' },
      { id: 'publish', target: 'publish-btn', title: 'Publish or request review', requires: 'edit', body: 'Admins publish here; editors send for review. Either way a snapshot is saved, so you can always roll back.' },
    ],
  },
  catalogue: {
    id: 'catalogue', title: 'Catalogue guide',
    steps: [
      { id: 'signin', target: 'ca-tabbar', title: 'Your live catalogue', body: 'On the same sign-in as the studio. The Hub button takes you back any time.' },
      { id: 'offerings', target: 'catab-offerings', title: 'Offerings', body: 'Your product and service list. Edit one to change its name, summary, status or whether it is featured.' },
      { id: 'pricing', target: 'catab-pricing', title: 'Pricing, currency and orders', body: 'Set prices and discounts, choose how prices show in pounds, and track orders across these tabs.' },
      { id: 'inquiries', target: 'catab-inquiries', title: 'Quotes and enquiries', body: 'Requests from the site land here, so every enquiry has a home.' },
      { id: 'bulk', target: 'catab-bulk', title: 'Import and export', body: 'Bring a catalogue in or out in bulk, then use View store to see what a customer sees.' },
    ],
  },
  quality: {
    id: 'quality', title: 'Quality and releases guide',
    steps: [
      { id: 'why', target: 'group-publishing', title: 'A review before it ships', requires: 'edit', route: { section: 'releases' }, body: 'Nothing reaches visitors by accident. Changes flow through a review before they go live.' },
      { id: 'queue', target: 'rail-releases', title: 'The release queue', requires: 'edit', body: 'Releases lists every page with unpublished changes. Approve to publish, or discard to revert, one by one or in a batch.' },
      { id: 'checks', target: 'group-quality', title: 'The quality checks', requires: 'edit', body: 'Copy coach, Link health, Accessibility and SEO health run continuously and read-only. They advise; they never change your site.' },
      { id: 'badge', target: 'rail-badge', title: 'Reading a badge', requires: 'edit', body: 'A number means that many things want attention. Open it for a plain-language list and a one-click fix where we can offer one.' },
      { id: 'health', target: 'rail-sitehealth', title: 'The health roll-up', requires: 'edit', route: { section: 'sitehealth' }, body: 'Site health rolls every check into one score, so you see the whole picture at a glance.' },
    ],
  },
};

// --- step visibility (role-gating) ---
// caps = { edit, manage }. Drop steps whose `requires` capability the user lacks, so "step n of m" counts only
// what THIS user actually sees (a viewer never gets edit-only steps; a non-manager never gets manage-only ones).
export function filterSteps(steps, caps = {}) {
  return (steps || []).filter((s) => !s.requires || caps[s.requires]);
}

// --- step progression (all clamp to [0, total-1]; a bad/NaN index snaps to 0; empty guide stays at 0) ---
export function clampIndex(i, total) {
  if (!Number.isFinite(i) || i < 0) return 0;
  return Math.min(Math.max(0, Math.floor(i)), Math.max(0, (total || 0) - 1));
}
export function nextIndex(i, total) { return clampIndex(i + 1, total); }
export function prevIndex(i, total) { return clampIndex(i - 1, total); }
export function isFirst(i) { return clampIndex(i, Infinity) === 0; }
export function isLast(i, total) { return total > 0 && clampIndex(i, total) >= total - 1; }
export function progressLabel(i, total) { return total > 0 ? (clampIndex(i, total) + 1) + ' of ' + total : ''; }

// --- card placement (pure geometry; the UI passes real getBoundingClientRect + viewport, gets back where to
// put the tooltip card). Prefer below the target; flip above when it would clip; clamp horizontally to a gutter.
export function placeCard(target, card, vp, gap = 12, gutter = 10) {
  const belowSpace = vp.height - target.bottom;
  const aboveSpace = target.top;
  const placeBelow = belowSpace >= card.height + gap || belowSpace >= aboveSpace;
  let top = placeBelow ? target.bottom + gap : target.top - card.height - gap;
  top = Math.max(gutter, Math.min(top, vp.height - card.height - gutter));
  let left = target.left + target.width / 2 - card.width / 2;
  left = Math.max(gutter, Math.min(left, vp.width - card.width - gutter));
  const arrowOffset = Math.max(14, Math.min(card.width - 14, (target.left + target.width / 2) - left));
  return { placement: placeBelow ? 'below' : 'above', top, left, arrowOffset };
}

// --- per-user seen-state (the UI persists the map in localStorage under one namespaced key). Email-keyed so a
// shared machine never hides a colleague's first run. ---
export function seenKey(email, tourId) { return (email || 'anon') + '::' + tourId; }
export function hasSeen(seenMap, email, tourId) { return !!(seenMap && seenMap[seenKey(email, tourId)]); }
export function markSeen(seenMap, email, tourId) { return { ...(seenMap || {}), [seenKey(email, tourId)]: true }; }
export function resetGuide(seenMap, email, tourId) { const next = { ...(seenMap || {}) }; delete next[seenKey(email, tourId)]; return next; }

// which guide (if any) to auto-start when a user enters a surface: the surface's tour, but ONLY the first time
// (never seen). Returns the tourId or null.
export function autoStartTour(seenMap, email, tourId) {
  const t = TOURS[tourId];
  return t && !hasSeen(seenMap, email, tourId) ? tourId : null;
}
