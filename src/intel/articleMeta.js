// Shared article helpers for the Intelligence section. The briefing href is the per-item article route
// (#intel/<id>), and readTime is a friendly reading-time estimate from the briefing's prose.
export const briefHref = (id) => '#intel/' + id;

export function readTime(b) {
  const words = ((b.summary || '') + ' ' + (b.take || '') + ' ' + (b.headline || '')).trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180)); // ~180 wpm, floor of 1 min
}
