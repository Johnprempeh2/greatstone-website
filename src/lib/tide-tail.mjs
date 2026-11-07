// How strong the home page's calm tide is at the current scroll: full where the tail starts, easing
// down to TAIL_FLOOR at the footer. Measured at the middle of the viewport. All values in pixels.
export const TAIL_FLOOR = 0.25;
export function tailStrength(scrollY, viewHeight, start, end) {
  const p = Math.min(Math.max((scrollY + viewHeight / 2 - start) / Math.max(end - start, 1), 0), 1);
  return 1 - (1 - TAIL_FLOOR) * p;
}
