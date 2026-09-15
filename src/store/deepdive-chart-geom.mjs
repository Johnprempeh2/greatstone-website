// The effort and impact chart's geometry, as numbers rather than as taste.
//
// ⚠ IN ITS OWN MODULE SO A TEST CAN READ IT. It lived in the component, which is JSX, which node
// cannot parse, so the arithmetic below could only ever be checked by looking at a screenshot. The
// bug it guards against is invisible to every other check we have: a chart can be unreadable and
// still pass overflow, contrast and render tests, because none of them compares text to text.
//
// ⚠ THE MARGINS ARE CLEARANCE, NOT STYLE. A dot is DOT across, so a proposal scored 10 for impact
// reaches `T - DOT/2` and one scored 0 reaches `T + PH + DOT/2`. The quadrant labels sit in bands
// beyond that. The first version put them in the plot's corners and a proposal at effort 9,
// impact 9.9 landed on "Worth planning".
export const W = 560, H = 470;
export const DOT = 26;
export const L = 40, R = 16, T = 46, B = 78;
export const PW = W - L - R, PH = H - T - B;
export const CLEAR = DOT / 2 + 4;              // half a dot, plus a little air

export const QUADRANTS = [
  { key: 'first', x: L, y: T - CLEAR - 4, say: 'Do first' },
  { key: 'plan', x: L + PW, y: T - CLEAR - 4, say: 'Worth planning', end: true },
  { key: 'cheap', x: L, y: T + PH + CLEAR + 12, say: 'Cheap either way' },
  { key: 'hard', x: L + PW, y: T + PH + CLEAR + 12, say: 'Hard to justify', end: true },
];

export const GEOM = { W, H, L, R, T, B, PW, PH, DOT, CLEAR, QUADRANTS };

/** Where a dot goes. Effort runs left to right, impact bottom to top, which is the way round every
 *  reader already expects: the thing you want is up and to the left. */
export function place(b) {
  return { x: L + (b.effort / 10) * PW, y: (T + PH) - (b.impact / 10) * PH };
}

/** Two proposals scored the same sit on top of each other, and the one underneath cannot be
 *  clicked. Nudged apart on a fixed spiral, so the same record always draws the same picture: a
 *  random jitter would move the dots every render and make the chart look like it meant something
 *  different each time. */
export function spread(rows) {
  const out = [];
  const taken = [];
  for (const r of rows) {
    const home = place(r);
    let { x, y } = home;
    for (let i = 0; i < 24 && taken.some((t) => Math.hypot(t.x - x, t.y - y) < DOT - 4); i++) {
      const a = i * 2.39996;                   // the golden angle, so early points do not line up
      x = home.x + Math.cos(a) * (11 + i * 1.6);
      y = home.y + Math.sin(a) * (11 + i * 1.6);
    }
    taken.push({ x, y });
    out.push({ ...r, x, y });
  }
  return out;
}
