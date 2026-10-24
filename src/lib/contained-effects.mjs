// Canvas 2D ports of Animation Lab 015 to 020. All coordinates are local to a block.
// The CSS quiet mask keeps the drawing away from copy; the canvas never sets page colour.
export const BACKGROUNDS = Object.freeze({
  'bg.bedrock': { title: 'Bedrock', ceil: .13, quiet: .92 },
  'bg.ascent': { title: 'Ascent', ceil: .42, quiet: .90 },
  'bg.datum': { title: 'Datum', ceil: .55, quiet: .90 },
  'bg.meridian': { title: 'Meridian', ceil: .48, quiet: .90 },
  'bg.veil': { title: 'Veil', ceil: .06, quiet: .90 },
  'bg.orbit': { title: 'Orbit', ceil: .42, quiet: .94 },
});

const emerald = [60, 150, 110];
const teal = [78, 205, 196];
const deepTeal = [14, 110, 104];
const lime = [200, 255, 0];
const ink = [14, 49, 34];
const rgba = (rgb, alpha) => `rgba(${rgb.join(',')},${Math.max(0, alpha).toFixed(4)})`;
const seeded = (i, salt = 1) => (Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453) % 1;
const unit = (i, salt) => Math.abs(seeded(i, salt));

export function effectPalette(light = false) {
  return { field: light ? [27, 80, 57] : emerald, teal: light ? deepTeal : teal, accent: light ? ink : lime };
}

export function effectFrame(ctx, effect, width, height, seconds = 0, { intensity = 'subtle', light = false } = {}) {
  const definition = BACKGROUNDS[effect];
  if (!definition || intensity === 'off' || width <= 0 || height <= 0) return false;
  const { field, teal: water, accent } = effectPalette(light);
  const alpha = definition.ceil * (intensity === 'full' ? 1 : .7) * (light ? .85 : 1);
  const w = width, h = height, t = seconds;
  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = 1;
  if (effect === 'bg.bedrock') {
    for (let i = 0; i < 9; i++) {
      const y = (i + .5) * h / 9 + Math.sin(t * (.01 + unit(i, 3) * .02) + i) * 12;
      ctx.beginPath();
      for (let x = 0; x <= w + 24; x += 24) {
        const yy = y + Math.sin(x / w * 8 + t * .012 + i) * (5 + unit(i, 5) * 14);
        x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
      }
      ctx.strokeStyle = rgba(field, alpha * (.32 + unit(i, 8) * .68)); ctx.lineWidth = 3 + unit(i, 2) * 12; ctx.stroke();
    }
  } else if (effect === 'bg.ascent') {
    for (let i = 0; i < 5; i++) {
      const y = (i + .5) * h / 5;
      ctx.strokeStyle = rgba(i === 2 ? water : field, alpha * .8); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(w * .06, y); ctx.lineTo(w * .94, y); ctx.stroke();
    }
    for (let i = 0; i < 70; i++) {
      const x = unit(i, 1) * w, y = ((unit(i, 2) * h - t * (1 + unit(i, 3) * 2)) % h + h) % h;
      ctx.fillStyle = rgba(field, alpha * (.25 + unit(i, 4) * .65));
      ctx.beginPath(); ctx.arc(x, y, 1.5 + unit(i, 5) * 2.5, 0, Math.PI * 2); ctx.fill();
    }
  } else if (effect === 'bg.datum') {
    const gap = 30;
    for (let y = gap / 2; y < h; y += gap) for (let x = gap / 2; x < w; x += gap) {
      const diagonal = (x * .82 - y * .57) / Math.max(w, h);
      const crest = Math.exp(-Math.pow((diagonal - ((t * .012) % 1.6) + .3) / .17, 2) / 2);
      ctx.fillStyle = rgba(field, alpha * (.25 + .75 * crest));
      ctx.beginPath(); ctx.arc(x, y, 1.5 + crest * 1.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = rgba(accent, alpha * .8); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w * .68, h * .63); ctx.lineTo(w, h * .63); ctx.stroke();
  } else if (effect === 'bg.meridian') {
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      const y = (i + .5) * h / 9;
      for (let x = 0; x <= w + 12; x += 12) {
        const yy = y + Math.sin(x / w * 9 + i * .65 + t * .01) * (12 + 5 * Math.sin(i));
        x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
      }
      ctx.strokeStyle = rgba(i === 4 && w > 760 ? water : field, alpha * (i === 4 ? 1 : .85)); ctx.lineWidth = i === 4 ? 2 : 1.5; ctx.stroke();
    }
  } else if (effect === 'bg.veil') {
    for (let i = 0; i < 8; i++) {
      const x = w * (.1 + unit(i, 1) * .8) + Math.sin(t * .006 + i) * 20;
      const y = h * (.1 + unit(i, 2) * .8) + Math.cos(t * .005 + i) * 20;
      const radius = Math.max(w, h) * (.18 + unit(i, 3) * .2);
      const colour = i % 3 ? field : water;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, rgba(colour, alpha * .8)); gradient.addColorStop(1, rgba(colour, 0));
      ctx.fillStyle = gradient; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  } else if (effect === 'bg.orbit') {
    for (let i = 0; i < 4; i++) {
      const cx = w * (.55 + i * .035), cy = h * .5, rx = w * (.22 + i * .08), ry = h * (.14 + i * .065);
      const angle = -.4 + i * .18, head = t / (95 + i * 30) * Math.PI * 2 + i;
      ctx.strokeStyle = rgba(i === 2 ? water : field, alpha * .8); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, angle, 0, Math.PI * 2); ctx.stroke();
      for (let j = 0; j < 18; j++) {
        const a = head - j * .055, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
        const px = cx + x * Math.cos(angle) - y * Math.sin(angle);
        const py = cy + x * Math.sin(angle) + y * Math.cos(angle);
        ctx.fillStyle = rgba(i === 2 ? water : field, alpha * Math.pow(1 - j / 18, 2));
        ctx.beginPath(); ctx.arc(px, py, 1.5, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  return true;
}
