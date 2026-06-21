// Shared article helpers for the Intelligence section. The briefing href is the per-item article route
// (#intel/<id>), and readTime is a friendly reading-time estimate from the briefing's prose.
export const briefHref = (id) => '#intel/' + id;

export function readTime(b) {
  const words = ((b.summary || '') + ' ' + (b.take || '') + ' ' + (b.headline || '')).trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180)); // ~180 wpm, floor of 1 min
}

// Topic-hue kicker chip: a vivid fill plus a text colour that always meets contrast. Blue/purple/magenta
// hues (~215-325) read dark even when "light", so near-black caps text fails AA on them; use white there.
// Everything else (red/orange/yellow/green/teal/cyan) is light enough at 56% for dark text.
export function kickerStyle(hue) {
  const h = (((hue || 0) % 360) + 360) % 360;
  return (h >= 215 && h <= 325)
    ? { background: `hsl(${hue} 62% 48%)`, color: '#fff' }
    : { background: `hsl(${hue} 68% 56%)`, color: '#0b1207' };
}
