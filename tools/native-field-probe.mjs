// The native-chrome probe: controls the portal forgot to dress.
//
// The class sweep asks "does every dd- class have a rule?" and `.dd-links-q` PASSED it for weeks
// while rendering as a white box with a browser focus ring in the middle of a dark glass popover
// (John's screenshot, 12 Sep). The class existed. Its rule set width and margin, and nothing that
// makes a control look like ours, so the browser dressed it instead.
//
// A rule's EXISTENCE is not its SUFFICIENCY. This measures the rendered control against the
// portal's own field language and reports anything wearing the user agent's:
//   native-background   a fill that is not one of our surfaces (a white or near-white box)
//   native-font         a font family the control did not inherit (Arial / system UA default)
//   contrast            ink on that fill below AA, which is what a white box does to light text
//
// Runs in a BROWSER against mounted screens, never happy-dom: only real layout resolves a
// computed background through the cascade.

const NUM = (s) => (String(s).match(/[\d.]+/g) || []).map(Number);
const lum = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

/** What a control actually sits on, COMPOSITED.
 *
 *  ⚠ THE FIRST VERSION TOOK THE RAW COLOUR AND IGNORED THE ALPHA, and so reported a field inside
 *  a 5% lime wash (`--gs-accent-soft`, rgba(200,255,0,.05) on dark glass) as sitting on SOLID
 *  LIME, drift 0.83, a bug that is not on the screen. Every surface in this portal is a tint over
 *  something else, so a probe that cannot composite will invent findings in exactly the places
 *  the design is most careful. Walk up collecting translucent layers, then paint them back down
 *  over the page's own opaque ground. */
/** ⚠ AND THE SECOND VERSION READ ONLY `background-color`, so it walked straight past every
 *  GRADIENT in the portal. The primary button, the selected tab and the kind picker are all
 *  `linear-gradient(...)` in `background-image` with a transparent background-color, so the walk
 *  skipped the lime entirely and resolved their ground as the dark page behind: dark ink on a dark
 *  page, 1.02:1, forty-two times. The house primary button, reported unreadable by a probe that
 *  had never seen its actual fill. A gradient has no single colour, so every stop is a candidate
 *  ground and the audit takes the WORST of them, which is the only conservative reading. */
const STOPS = (img) => (String(img).match(/rgba?\([^)]*\)/g) || [])
  .map(NUM).filter((v) => v.length >= 3);

/** Every colour the text could be sitting on, composited. One entry for a solid, one per stop for
 *  a gradient. */
function grounds(el) {
  const layers = [];
  let stops = null;
  for (let a = el; a; a = a.parentElement) {
    const cs = getComputedStyle(a);
    if (stops === null && cs.backgroundImage && cs.backgroundImage !== 'none') {
      const s = STOPS(cs.backgroundImage);
      // A gradient paints over whatever is below it in this same element's box, so it ends the
      // walk exactly as an opaque colour does.
      if (s.length) { stops = s; break; }
    }
    const v = NUM(cs.backgroundColor);
    if (v.length < 3) continue;
    const alpha = v.length > 3 ? v[3] : 1;
    if (alpha === 0) continue;
    layers.push({ rgb: v.slice(0, 3), alpha });
    if (alpha >= 1) break;           // opaque: nothing below it can show through
  }
  // the page's own ground under everything, so a stack of tints still resolves
  const bodyBg = NUM(getComputedStyle(document.body).backgroundColor);
  const base = bodyBg.length >= 3 && (bodyBg.length < 4 || bodyBg[3] > 0) ? bodyBg.slice(0, 3) : [18, 18, 18];
  const paint = (start) => {
    let out = start;
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      const { rgb, alpha } = layers[i];
      out = out.map((c, j) => alpha * rgb[j] + (1 - alpha) * c);
    }
    return out.map(Math.round);
  };
  if (!stops) return [paint(base)];
  return stops.map((s) => {
    const sa = s.length > 3 ? s[3] : 1;
    return paint(s.slice(0, 3).map((c, j) => sa * c + (1 - sa) * base[j]));
  });
}

function ground(el) { return grounds(el)[0]; }

export function probeNativeFields(root = document.body) {
  const out = [];
  // The page's own body font is the inheritance target: a control that did not say `font: inherit`
  // reports the UA default instead, and that difference is the tell.
  const houseFont = getComputedStyle(document.body).fontFamily;
  const controls = [...root.querySelectorAll('input, select, textarea')];
  for (const el of controls) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    // Checkboxes and radios are drawn by the browser ON PURPOSE here (the portal paints its own
    // box beside them and hides the native one where it wants to), and a range/colour input has
    // no text at all. Only fields that hold TYPED or SELECTED text are in scope.
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    if (['checkbox', 'radio', 'range', 'color', 'file', 'hidden', 'submit', 'button'].includes(type)) continue;

    const where = `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}`;
    const ownV = NUM(cs.backgroundColor);
    const alpha = ownV.length > 3 ? ownV[3] : 1;
    const bare = !cs.backgroundColor || cs.backgroundColor === 'rgba(0, 0, 0, 0)' || alpha === 0;
    // Composited against what is behind it, for the same reason `ground` does: our own fields are
    // often a tint (--dd-recess and friends), and comparing a tint's raw colour to a solid one
    // measures two things that were never on the screen together.
    const behind = ground(el.parentElement || el);
    const fill = bare ? behind
      : ownV.slice(0, 3).map((c, j) => Math.round(alpha * c + (1 - alpha) * behind[j]));

    // ⚠ THE TEST IS AGAINST THE GROUND, NOT A FIXED COLOUR. The portal has a light theme where a
    // near-white field is CORRECT, so "is it white" cannot be the question. The question is
    // whether the control's fill matches the surface it sits on, within the tint range our own
    // tokens use: a control that is dramatically lighter than its own popover is wearing the UA's
    // white, whichever theme is on.
    const site = behind;
    const drift = Math.abs(lum(fill) - lum(site));
    if (!bare && drift > 0.35) {
      // ⚠ NAME WHICH SIDE IS THE OUTLIER. The drift is symmetric, so the first version of this
      // reported a control wearing OUR recessed fill inside a lime parent with the same words it
      // used for a control wearing the UA's white: two opposite bugs, one indistinguishable
      // message. A finding that cannot be read is a finding that gets guessed at.
      const controlIsLighter = lum(fill) > lum(site);
      out.push({
        kind: controlIsLighter ? 'native-background' : 'control-darker-than-ground',
        where, fill: cs.backgroundColor, sitsOn: `rgb(${site.join(', ')})`, drift: +drift.toFixed(2),
        reads: controlIsLighter
          ? 'the control is much lighter than its surface: the likely user agent default'
          : 'the control is much darker than its surface: our field on a loud ground, check by eye',
      });
    }
    if (cs.fontFamily !== houseFont) {
      out.push({ kind: 'native-font', where, font: cs.fontFamily.slice(0, 40) });
    }
    const ink = NUM(cs.color).slice(0, 3);
    const k = ratio(ink, fill);
    if (k < 4.5) out.push({ kind: 'contrast', where, ratio: +k.toFixed(2), ink: cs.color, on: cs.backgroundColor });
  }
  return { checked: controls.length, findings: out };
}

/** Boxes that fragment because they are inline.
 *
 *  ⚠ `.dd-nogap` painted padding, a dashed border and a wash, and two call sites put it on a
 *  <span>. An inline element does not have one box: it has one per line it occupies, so the
 *  border drew in ragged pieces, the padding overlapped its neighbours, and the text sat outside
 *  its own outline. Nothing could see it: the class existed, the rule was complete, the markup
 *  was valid, and every gate was green.
 *
 *  The measurable tell is geometry, not CSS: an inline element that PAINTS (border or background)
 *  and occupies more than one client rect is drawing a broken box, whatever produced it. */
export function probeFragmentedBoxes(root = document.body) {
  const out = [];
  let painted = 0;
  for (const el of root.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (!cs.display.startsWith('inline') || cs.display === 'inline-block' || cs.display === 'inline-flex'
      || cs.display === 'inline-grid') continue;
    const bg = cs.backgroundColor;
    const hasFill = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && !/, 0\)$/.test(bg);
    const hasEdge = ['Top', 'Right', 'Bottom', 'Left'].some((side) =>
      parseFloat(cs[`border${side}Width`]) > 0 && cs[`border${side}Style`] !== 'none'
      && !String(cs[`border${side}Color`]).includes(', 0)'));
    const pads = ['Top', 'Bottom'].some((side) => parseFloat(cs[`padding${side}`]) > 0);
    if (!hasFill && !hasEdge && !pads) continue;
    painted += 1;
    // More than one rect means more than one line: the box is in pieces on the screen.
    if (el.getClientRects().length > 1) {
      out.push({ kind: 'fragmented-box',
        where: `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}`,
        pieces: el.getClientRects().length, display: cs.display,
        reads: 'an inline element painting a border, fill or vertical padding across several lines: give it a block display',
        text: (el.textContent || '').trim().slice(0, 48) });
    }
  }
  return { painted, findings: out };
}

/** Content pushed out of the viewport with no way to reach it.
 *
 *  ⚠ `documentElement.scrollWidth > clientWidth` IS NOT THE TEST. `body` carries
 *  `overflow-x: hidden` here, so a too-wide page does not scroll: it CLIPS. The coverage matrix
 *  reported 658px against a 390px viewport and looked like a horizontal-scroll bug, while the
 *  page could not be scrolled sideways at all and the table scrolled correctly inside its own
 *  wrapper. Meanwhile the real bug, a popover running 53px past the right edge, was unreachable
 *  rather than scrollable, which is worse and which that same crude check would have scored the
 *  same way.
 *
 *  The honest question is REACHABILITY: does this element extend past the viewport, and is there
 *  no scrollable ancestor between it and the body that could bring it back? */
export function probeOffscreen(root = document.body) {
  const vw = document.documentElement.clientWidth;
  const out = [];
  // ⚠ IT REPORTED NO COUNT OF ITS OWN. Every other probe here hands back how much it looked at, so
  // "no findings" can be read against "out of how many". This one returned only the viewport
  // width, which meant a run that examined nothing at all was indistinguishable from a clean one.
  let checked = 0;
  const scrollableX = (el) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (/(auto|scroll)/.test(cs.overflowX) && a.scrollWidth > a.clientWidth + 1) return true;
    }
    return false;
  };
  for (const el of root.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    checked += 1;
    if (r.right <= vw + 1 && r.left >= -1) continue;
    if (scrollableX(el)) continue;                 // reachable: something can scroll to it
    // only leaves: a wide parent whose children all fit is not itself unreachable content
    if ([...el.children].some((c) => { const cr = c.getBoundingClientRect();
      return cr.width && (cr.right > vw + 1 || cr.left < -1); })) continue;
    out.push({ kind: 'unreachable', where: `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}`,
      left: Math.round(r.left), right: Math.round(r.right), viewport: vw,
      text: (el.textContent || '').trim().slice(0, 40) });
  }
  return { viewport: vw, checked, findings: out };
}

/** Text that paints outside its own box.
 *
 *  ⚠ NEITHER OTHER PROBE COULD SEE THIS. A question title holding an unbroken 86-character token
 *  painted 982px of text inside a 306px box and ran 634px past a phone's edge. The overlap probe
 *  clips text rects to their overflow ancestors, so it saw nothing; the reachability probe reads
 *  getBoundingClientRect, which returns the BOX, and the box was correctly 306px. Only the
 *  painted glyphs escaped. The measurement has to be the Range's rects against the element's own
 *  box, which is the one comparison that distinguishes "wrapped" from "spilled".
 *
 *  Exempt: screen-reader-only text (a 1px clipped box is the whole technique) and anything whose
 *  own rule clips deliberately, where spilling is the intended, invisible behaviour. */
export function probeTextOverflow(root = document.body) {
  const out = [];
  let measured = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  let n;
  while ((n = walker.nextNode())) {
    const txt = n.textContent.trim();
    if (!txt) continue;
    const el = n.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const box = el.getBoundingClientRect();
    if (box.width <= 1) continue;                       // sr-only and friends
    if (/(hidden|clip)/.test(cs.overflowX)) continue;   // clipping is this element's own decision
    const range = document.createRange();
    range.selectNodeContents(n);
    const rects = [...range.getClientRects()];
    if (!rects.length) continue;
    measured += 1;
    const paintedRight = Math.max(...rects.map((r) => r.right));
    // ⚠ ONE SPACE, NOT TWO PIXELS. A trailing space at a soft wrap HANGS past the content edge by
    // design (CSS says so, and `pre-wrap` keeps the space), so a wrapped paragraph ending a line on
    // a space paints a 3-4px fragment outside its box and always will. A fixed 2px tolerance
    // reported that forever: a finding that is right every time and actionable never, which is how
    // a sweep stops being read. The tolerance is now one space wide for the element's own type
    // size, which is still nothing next to a real spill (an unbreakable token overruns by hundreds
    // of pixels, which is the case this exists for).
    const oneSpace = Math.max(3, parseFloat(cs.fontSize) * 0.4);
    if (paintedRight > box.right + oneSpace) {
      out.push({ kind: 'text-outside-its-box',
        where: `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}`,
        boxRight: Math.round(box.right), paintedRight: Math.round(paintedRight),
        spill: Math.round(paintedRight - box.right),
        reads: 'an unbreakable run of text is painting outside its container: allow overflow-wrap',
        text: txt.slice(0, 40) });
    }
  }
  return { measured, findings: out };
}

/** Text nobody can read.
 *
 *  ⚠ NOTHING IN THIS REPO MEASURED THE CONTRAST OF ORDINARY TEXT. The field probe above checks
 *  `input, select, textarea` and stops there, so every heading, every muted label, every chip and
 *  every line of body copy in a portal that gained a light theme after it was designed had never
 *  been measured at all. Contrast is invisible to the other probes by construction: overlap
 *  compares geometry, reachability compares boxes, spill compares painted glyphs to their
 *  container, and a perfectly laid out screen can be unreadable.
 *
 *  Four things, because a contrast audit that skips any of them reports numbers that are not on
 *  the screen (learned the hard way on the decks, 12 Aug):
 *    1. THE COMPUTED COLOUR, NOT THE TOKEN. Reasoning from tokens missed a 3.0:1 failure that
 *       measurement caught at once.
 *    2. REAL COMPOSITING. Every surface in this portal is a tint over something else, so the
 *       effective background is not any single declared colour. `ground` walks and composites.
 *    3. INHERITED OPACITY, MULTIPLIED THROUGH EVERY ANCESTOR. Opacity fades a colour toward what
 *       is behind it, so it destroys contrast by construction and worst in light mode. An element
 *       carrying a 5.6:1 token inside an `opacity: .45` parent is nowhere near 5.6:1 on screen.
 *    4. THE RIGHT MOMENT. Measuring mid-transition reports phantoms. The caller settles the screen
 *       first; this also skips anything still animating its colour or opacity.
 *
 *  Exempt: screen-reader-only text (a 1px clipped box is the technique), aria-hidden decoration,
 *  and placeholder-empty elements. Large text is held to AA's 3:1 rather than 4.5:1, using the
 *  same definition the standard uses: 24px, or 18.66px when bold.
 */
export function probeTextContrast(root = document.body, { min = 4.5, minLarge = 3 } = {}) {
  const out = [];
  let measured = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  let n;
  while ((n = walker.nextNode())) {
    const txt = n.textContent.trim();
    if (!txt) continue;
    const el = n.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    if (['SCRIPT', 'STYLE', 'OPTION', 'TITLE'].includes(el.tagName)) continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    // ⚠ A DISABLED CONTROL IS EXEMPT, in the standard and here. WCAG puts disabled controls outside
    // the contrast requirement precisely because being hard to read is the message, and this portal
    // fades eight of them on purpose. Counting those would give the probe a permanent backlog of
    // findings nobody should act on, which is how a sweep stops being read.
    if (el.closest(':disabled, [aria-disabled="true"], [data-disabled]')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const box = el.getBoundingClientRect();
    if (box.width <= 1 || box.height <= 1) continue;          // sr-only and friends
    // ⚠ Still moving: a colour or opacity mid-transition is not the colour anybody reads.
    if (/(opacity|color|all)/.test(cs.transitionProperty) && parseFloat(cs.transitionDuration) > 0
      && el.getAnimations && el.getAnimations().some((a) => a.playState === 'running')) continue;

    // (3) every ancestor's opacity multiplies.
    let fade = 1;
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      const o = Number(getComputedStyle(a).opacity);
      if (!Number.isNaN(o)) fade *= o;
    }
    if (fade <= 0.01) continue;                               // deliberately invisible

    const ink = NUM(cs.color);
    if (ink.length < 3) continue;
    const inkAlpha = (ink.length > 3 ? ink[3] : 1) * fade;
    if (inkAlpha <= 0.01) continue;
    // (2) every candidate ground, so a gradient is judged on its worst stop rather than a colour
    // that is only true at one end of the button.
    const cands = grounds(el);
    measured += 1;

    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? minLarge : min;
    let k = Infinity; let behind = cands[0];
    for (const c of cands) {
      const painted = ink.slice(0, 3).map((v, i) => Math.round(inkAlpha * v + (1 - inkAlpha) * c[i]));
      const r = ratio(painted, c);
      if (r < k) { k = r; behind = c; }
    }
    const where = `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}`;
    if (k < need) {
      out.push({ kind: 'text-contrast', where, ratio: +k.toFixed(2), need,
        colour: cs.color, on: `rgb(${behind.join(', ')})`, size: Math.round(size),
        fade: fade < 1 ? +fade.toFixed(2) : undefined,
        reads: fade < 1
          ? 'faded by an ancestor opacity: de-emphasise with a colour token, never with opacity'
          : 'ink too close to the surface it sits on',
        text: txt.slice(0, 40) });
    } else if (fade < 0.999) {
      // Passing, and still wrong: opacity on text is the rule, not the ratio.
      out.push({ kind: 'faded-text', where, fade: +fade.toFixed(2), ratio: +k.toFixed(2),
        reads: 'text de-emphasised with opacity: use a colour token, it survives both themes',
        text: txt.slice(0, 40) });
    }
  }
  return { measured, findings: out };
}

/** The focus ring: the state a keyboard has to navigate by.
 *
 *  ⚠ THIS PROBE CANNOT RUN IN A PAGE THAT DOES NOT HAVE FOCUS, and the first attempt did exactly
 *  that. `el.focus()` sets `document.activeElement` whether or not the browser window is focused,
 *  but `:focus` and `:focus-visible` DO NOT MATCH unless the document itself has focus, so every
 *  computed outline came back `none` and every control in the portal looked like it had no focus
 *  indicator at all. That is the shape of a probe that reported twenty-two failures on perfectly
 *  good UI once before. The caller must put real keyboard focus in the page first (press Tab), and
 *  if it has not, this returns a finding SAYING SO rather than a clean sheet or a wall of noise.
 *
 *  Two questions, both from WCAG 2.2:
 *    no-focus-indicator   focusing changes nothing that is drawn, so a keyboard cannot be followed
 *    focus-contrast       the indicator is under 3:1 against what it is drawn on
 */
const RING = (cs) => {
  // ⚠ AN OUTLINE THAT PAINTS NOTHING IS NOTHING, WHATEVER ELSE IT SAYS. The first version compared
  // `outline-offset` as its own field, and a global `:focus-visible` rule moves the offset from 0
  // to 2px on every control in the portal. So a control with its outline suppressed still looked
  // like something changed on focus, and the probe passed it: an invisible property change masking
  // a missing indicator, which is the one thing this must never do. A suppressed outline (no width,
  // `none` style, or a transparent colour) collapses to the string 'none' and the offset only
  // counts when there is something for it to offset.
  // ⚠ PARSE THE ALPHA, NEVER PATTERN-MATCH FOR IT. The first form of this test asked whether the
  // colour string ended in ", 0)" to catch a zero alpha, and the brand's own lime is
  // `rgb(200, 255, 0)`: fully opaque, zero BLUE, and matched every time. So every lime focus ring
  // in the portal read as invisible and twenty-one perfectly good controls were reported as having
  // no focus indicator at all, which is precisely the false-failure wall this probe exists to
  // avoid producing.
  const w = parseFloat(cs.outlineWidth);
  const oc = NUM(cs.outlineColor);
  const oa = oc.length > 3 ? oc[3] : (oc.length >= 3 ? 1 : 0);
  const drawn = w > 0 && cs.outlineStyle !== 'none' && oa > 0;
  return {
    outline: drawn ? `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor} ${cs.outlineOffset}` : 'none',
    shadow: cs.boxShadow,
    border: `${cs.borderTopWidth} ${cs.borderTopColor} ${cs.borderBottomColor}`,
    bg: cs.backgroundColor,
    color: cs.color,
  };
};

export function probeFocus(root = document.body) {
  if (!document.hasFocus()) {
    return { checked: 0, findings: [{ kind: 'probe-not-run',
      reads: 'the document does not have focus, so :focus-visible matches nothing and every result would be a false failure: press Tab in the page first' }] };
  }
  const out = [];
  // ⚠ FREEZE THE TRANSITIONS FIRST. The search box animates its border colour, so a synchronous
  // read after `focus()` catches the border PART WAY THERE, and reading it again a moment later
  // gives a different answer: the same rest and lit values, both wrong, and the control reported as
  // having no indicator. Measuring a state that is still on its way to somewhere else is how a
  // contrast pass once produced seventy phantom failures. Nothing here is allowed to move.
  const freeze = document.createElement('style');
  freeze.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
  document.head.appendChild(freeze);
  const was = document.activeElement;
  const scroll = [window.scrollX, window.scrollY];
  const els = [...root.querySelectorAll(
    'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => {
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    });
  let checked = 0;
  // ⚠ THE INDICATOR IS NOT ALWAYS ON THE CONTROL. The record search suppresses the input's own
  // ring on purpose and lights the BOX AROUND IT with `:focus-within`, which is a normal and good
  // pattern: the thing that looks like the field is the wrapper, so that is what should light up.
  // A probe that only inspects the focused element calls every control built that way broken.
  const chain = (el) => {
    const out = [RING(getComputedStyle(el))];
    let a = el.parentElement;
    for (let i = 0; i < 3 && a && a !== root.parentElement; i += 1, a = a.parentElement) {
      out.push(RING(getComputedStyle(a)));
    }
    return JSON.stringify(out);
  };
  for (const el of els) {
    // ⚠ READ REST FROM AN ELEMENT THAT IS NOT ALREADY FOCUSED. The caller has to press Tab to give
    // the document focus, which focuses the first control in the page: its "rest" reading was
    // therefore its LIT reading, the two matched, and the probe reported the breadcrumb link as
    // having no focus indicator when it has a perfectly good one.
    if (document.activeElement === el) el.blur();
    const rest = chain(el);
    el.focus({ preventScroll: true });
    if (document.activeElement !== el) continue;      // refused focus: not ours to judge
    checked += 1;
    const cs = getComputedStyle(el);
    const where = `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}`;
    const changed = chain(el) !== rest;
    if (!changed) {
      out.push({ kind: 'no-focus-indicator', where,
        reads: 'nothing drawn changes when this takes focus: a keyboard cannot be followed through it',
        text: (el.textContent || el.value || '').trim().slice(0, 40) });
      continue;
    }
    // The ring is drawn just outside the element, over whatever its parent paints.
    const behind = grounds(el.parentElement || el);
    const w = parseFloat(cs.outlineWidth);
    if (w > 0 && cs.outlineStyle !== 'none') {
      const ring = NUM(cs.outlineColor);
      if (ring.length >= 3) {
        const a = ring.length > 3 ? ring[3] : 1;
        let worst = Infinity; let on = behind[0];
        for (const g of behind) {
          const painted = ring.slice(0, 3).map((c, i) => Math.round(a * c + (1 - a) * g[i]));
          const k = ratio(painted, g);
          if (k < worst) { worst = k; on = g; }
        }
        if (worst < 3) {
          out.push({ kind: 'focus-contrast', where, ratio: +worst.toFixed(2), need: 3,
            ring: cs.outlineColor, on: `rgb(${on.join(', ')})`,
            reads: 'the focus ring is too close to the surface it is drawn on to be seen' });
        }
      }
    }
  }
  if (was && was.focus) was.focus({ preventScroll: true }); else if (document.activeElement) document.activeElement.blur();
  window.scrollTo(scroll[0], scroll[1]);
  freeze.remove();
  return { checked, findings: out };
}

/** A control nobody can name.
 *
 *  ⚠ NOTHING RENDERED HAS EVER BEEN CHECKED FOR THIS. deepdive-a11y.test.mjs reads source for two
 *  specific faults (a tablist that announces a pattern it does not implement, a div made a control
 *  by onClick alone) and the browser sweep measures geometry, colour and focus. None of them asks
 *  the first question assistive technology asks of a control: what is it called?
 *
 *  This portal is full of icon-only buttons — the theme toggle, the user menu, remove and add
 *  controls on every link row — and an icon with no label is announced as "button", which is the
 *  whole of what a screen-reader user gets to go on. It is invisible to everyone else, including
 *  every probe written so far.
 *
 *  The name is computed the way a browser computes it, in the order that matters: aria-labelledby,
 *  then aria-label, then a real <label>, then the element's own visible text (with aria-hidden
 *  decoration removed, which is exactly where an icon lives), then title, then an image's alt, then
 *  a value or placeholder for a field. Anything still empty is unnamed.
 */
const NAMEABLE = 'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="switch"], [tabindex]:not([tabindex="-1"])';

function accessibleName(el, root) {
  const id = (s) => (s || '').split(/\s+/).map((x) => {
    const t = root.ownerDocument?.getElementById?.(x) || document.getElementById(x);
    return t ? (t.textContent || '').trim() : '';
  }).join(' ').trim();

  const byIds = id(el.getAttribute('aria-labelledby'));
  if (byIds) return byIds;
  const label = (el.getAttribute('aria-label') || '').trim();
  if (label) return label;

  // a real <label>, wrapping or `for`
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l && (l.textContent || '').trim()) return (l.textContent || '').trim();
    }
    const wrap = el.closest('label');
    if (wrap && (wrap.textContent || '').trim()) return (wrap.textContent || '').trim();
  }

  // own visible text, with decoration removed: an icon is normally aria-hidden, and counting it
  // would name every icon-only button after nothing at all.
  const clone = el.cloneNode(true);
  for (const dead of clone.querySelectorAll('[aria-hidden="true"]')) dead.remove();
  const own = (clone.textContent || '').trim();
  if (own) return own;

  const title = (el.getAttribute('title') || '').trim();
  if (title) return title;
  const img = el.querySelector('img[alt]');
  if (img && img.getAttribute('alt').trim()) return img.getAttribute('alt').trim();
  const val = (el.value || el.getAttribute('value') || '').trim();
  if (val && el.tagName !== 'TEXTAREA') return val;
  const ph = (el.getAttribute('placeholder') || '').trim();
  if (ph) return ph;
  return '';
}

export function probeNames(root = document.body) {
  const out = [];
  let checked = 0;
  for (const el of root.querySelectorAll(NAMEABLE)) {
    // Hidden from everyone, or hidden from assistive technology on purpose: not a control anybody
    // is being asked to use.
    if (el.closest('[aria-hidden="true"]')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    // A screen-reader-only control is real and MUST be named; a zero-box one is not on the page.
    if ((!r.width || !r.height) && !el.closest('.gs-sr-only')) continue;
    // A checkbox or radio the portal hides behind its own painted box is named by its wrapping
    // label, which the walk above already found; anything still nameless here is genuinely bare.
    checked += 1;
    if (accessibleName(el, root)) continue;
    out.push({ kind: 'unnamed-control',
      where: `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}`,
      type: el.getAttribute('type') || el.getAttribute('role') || '',
      reads: 'announced as its role and nothing else: a screen reader has no way to say what this does' });
  }
  return { checked, findings: out };
}
