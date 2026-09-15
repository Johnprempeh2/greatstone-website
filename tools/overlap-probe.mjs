// The overlap probe: the collisions no other check can see.
//
// Overflow measures the page, contrast measures colour, the render test measures throws. NONE of
// them compares drawn text to drawn text, which is how a chart once shipped with forty axis labels
// smeared together, and how a dashed border sat striking through the heading above it while every
// gate stayed green (John's screenshot, 10 Sep: the record-link add box on the session page).
//
// Needs real layout, so it runs in a BROWSER against mounted screens, never in happy-dom.
//
// Two failure classes:
//   text-on-text    two text nodes from UNRELATED elements whose rendered rects intersect
//   text-on-border  a text node crossing the drawn border line of an element it is OUTSIDE of
//
// What it deliberately ignores, each a real false positive from calibration:
//   - ancestor/descendant pairs (a chip inside a card is not a collision)
//   - elements hidden, zero-sized, or aria-hidden decorations
//   - line-through / underline drawn by the element's own text-decoration
//   - borders with transparent colour or zero width (the minimal pass keeps widths, colours off)
//   - intersections thinner than 2px in both axes (subpixel kisses)

const visible = (el) => {
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

const overlap = (a, b) => {
  const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return x > 2 && y > 2 ? x * y : 0;
};

/** Every rendered text node with its rect and owning element. */
function textRects(root) {
  const out = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || !visible(el)) continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    if (['SCRIPT', 'STYLE', 'OPTION'].includes(el.tagName)) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      if (r.width <= 1 || r.height <= 1) continue;
      /* ⚠ CLIPPED TEXT STILL REPORTS ITS RECTS. A line-clamped or overflow-hidden block hides
         its later lines visually, but Range.getClientRects() returns their full geometry, and
         the first run of this probe flagged a folded More block "overlapping" the link sitting
         where its hidden lines would have been. Text that is not drawn cannot collide: every
         rect is intersected with its overflow ancestors, and what survives is what is on screen. */
      let rect = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      let clipped = false;
      for (let a = el; a && a !== root.parentElement; a = a.parentElement) {
        const cs = getComputedStyle(a);
        /* ⚠ AND AN OVERFLOW ANCESTOR DOES NOT CLIP A FIXED DESCENDANT. Its containing block is the
           viewport, so everything above it in the tree is irrelevant to what is drawn. Walking
           past one and intersecting anyway is why probing <body> reported every drawer screen as
           EMPTY: the drawer portals to body, a modal locks body to overflow hidden, body's own box
           collapses to nothing with the page behind it gone, and every line of the drawer clipped
           to zero width. Twenty-eight screens measured as "no rendered text", which the sentinel
           called correctly and which read like the drawer had failed to mount.
           The element's own overflow still applies (a fixed panel can scroll its contents), so the
           clip is taken first and the walk stops after it. */
        const stop = cs.position === 'fixed';
        if (/(hidden|clip|auto|scroll)/.test(cs.overflow + cs.overflowX + cs.overflowY)) {
          const ar = a.getBoundingClientRect();
          rect = { left: Math.max(rect.left, ar.left), right: Math.min(rect.right, ar.right),
                   top: Math.max(rect.top, ar.top), bottom: Math.min(rect.bottom, ar.bottom) };
        }
        if (stop) break;
      }
      if (rect.right - rect.left <= 2 || rect.bottom - rect.top <= 2) clipped = true;
      if (!clipped) out.push({ el, rect, text: n.textContent.trim().slice(0, 60) });
    }
  }
  return out;
}

const related = (a, b) => a === b || a.contains(b) || b.contains(a);

/** ⚠ OUT OF FLOW MEANS MEANT TO COVER, IN BOTH HALVES OF THIS PROBE. A popover, a dropdown, a
 *  sticky bar: each is taken out of the flow precisely so it can paint over what it covers. The
 *  first fix for this taught only the text-on-text half, and the text-on-border half went on
 *  reporting the very same open popover painting across the field beneath it. One definition,
 *  used by both, so the two halves cannot drift apart again. */
const OUT_OF_FLOW = ['fixed', 'sticky', 'absolute'];
/** The nearest out-of-flow ancestor, or null for the ordinary page flow.
 *
 *  ⚠ "OUT OF FLOW" IS A RELATIONSHIP, NOT A PROPERTY. The old form of this answered yes or no for
 *  ONE element and the callers skipped anything that said yes, which is right for a popover
 *  painting over the field beneath it and wrong for everything INSIDE that popover. Pointing the
 *  sweep at <body> to reach the portalled drawer made it obvious: the drawer lives in a fixed
 *  scrim, so every pair of elements in it answered yes and every screen came back clean. A
 *  drawer cannot collide with the page it covers, and it absolutely can collide with itself.
 *  Two things are exempt from each other only when they sit in DIFFERENT contexts. */
const flowCtx = (el, root) => {
  for (let a = el; a && a !== root && a !== document.body; a = a.parentElement) {
    if (OUT_OF_FLOW.includes(getComputedStyle(a).position)) return a;
  }
  return null;
};

export function probeOverlaps(root = document.body) {
  const texts = textRects(root);
  const bad = [];
  /* ⚠ AN EMPTY SCREEN IS NOT A CLEAN SCREEN. InnovationBoard once crashed to zero bytes and this
     probe blessed it: no text, no collisions, green. A sweep result must first prove the screen
     EXISTS, so a root with no rendered text at all is itself the finding. */
  if (!texts.length) return [{ kind: 'empty-screen', text: 'no rendered text under the probed root' }];

  // ── text on text ──
  for (let i = 0; i < texts.length; i += 1) {
    for (let j = i + 1; j < texts.length; j += 1) {
      const A = texts[i]; const B = texts[j];
      if (related(A.el, B.el)) continue;
      const area = overlap(A.rect, B.rect);
      if (!area) continue;
      // Only elements sharing a flow can genuinely collide: same context, or both in the page.
      if (flowCtx(A.el, root) !== flowCtx(B.el, root)) continue;
      bad.push({ kind: 'text-on-text', a: A.text, b: B.text, area: Math.round(area) });
    }
  }

  // ── text on a drawn border ──
  const bordered = [...root.querySelectorAll('*')].filter((el) => {
    if (!visible(el)) return false;
    const cs = getComputedStyle(el);
    return ['Top', 'Right', 'Bottom', 'Left'].some((side) => {
      const w = parseFloat(cs[`border${side}Width`]);
      const col = cs[`border${side}Color`];
      return w > 0 && col && !col.includes('0, 0, 0, 0') && cs[`border${side}Style`] !== 'none';
    });
  });
  for (const el of bordered) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const bands = [];
    if (parseFloat(cs.borderTopWidth) > 0) bands.push({ side: 'top', left: r.left, right: r.right, top: r.top - 1, bottom: r.top + parseFloat(cs.borderTopWidth) + 1 });
    if (parseFloat(cs.borderBottomWidth) > 0) bands.push({ side: 'bottom', left: r.left, right: r.right, top: r.bottom - parseFloat(cs.borderBottomWidth) - 1, bottom: r.bottom + 1 });
    const boxCtx = flowCtx(el, root);
    for (const t of texts) {
      if (related(el, t.el)) continue;
      // Text painted over a box from a different context is an overlay doing its job.
      if (flowCtx(t.el, root) !== boxCtx) continue;
      for (const band of bands) {
        // the text must genuinely CROSS the line, not merely sit beside it
        const x = Math.min(t.rect.right, band.right) - Math.max(t.rect.left, band.left);
        const above = band.top - t.rect.top; const below = t.rect.bottom - band.bottom;
        if (x > 4 && above > 3 && below > 3) {
          bad.push({ kind: 'text-on-border', text: t.text, side: band.side,
            box: (el.className && String(el.className).split(' ')[0]) || el.tagName });
        }
      }
    }
  }
  return bad;
}
