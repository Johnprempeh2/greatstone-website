// The generative studio behind the Brand, Content & Media demo. Plain canvas 2D, no library, no network.
//
// Two modes:
//   studies  a numbered generative study. The number IS the seed, so study 014 draws identically every
//            time anyone opens it, which is what makes a daily catalogue reusable rather than disposable.
//   relief   one glyph rendered as a stack of offset faces, lit from a direction the visitor drags. The
//            depth control takes it back to flat so the before and after sit in the same frame.
//
// Lifecycle: rendering is gated on intersection AND document visibility, so a demo below the fold or in a
// background tab costs nothing. destroy() cancels the frame and disconnects both observers.
// Reduced motion: one frame is drawn and the loop never starts. The relief light still tracks the pointer,
// because that is a direct response to input rather than autonomous movement.

const LIME = '#c8ff00';
const TEAL = '#4ecdc4';
const PURPLE = '#b197fc';

// mulberry32: small, fast, and the same seed always gives the same sequence.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cheap smooth field. Not Perlin, but continuous in x, y and t, which is all the lattice needs.
const field = (x, y, t) =>
  Math.sin(x * 1.7 + t * 0.6) * 0.6 + Math.cos(y * 2.1 - t * 0.42) * 0.5 + Math.sin((x + y) * 1.1 + t * 0.25) * 0.4;

export const TECHNIQUES = ['Strata', 'Orbit', 'Lattice', 'Fracture'];

/* ── the four studies. Each is a pure draw of (ctx, w, h, t, r) where r is a seeded generator. ───────── */

function strata(ctx, w, h, t, p) {
  const bands = p.bands;
  for (let i = 0; i < bands; i += 1) {
    const f = i / bands;
    const y = f * h;
    const bh = (h / bands) * (0.55 + p.jit[i] * 0.7);
    const shear = Math.sin(t * 0.5 + i * 0.5 + p.phase) * w * 0.06 * (0.4 + f);
    const lit = i === p.litA || i === p.litB;
    ctx.beginPath();
    ctx.moveTo(shear, y);
    ctx.lineTo(w + shear, y + bh * 0.18);
    ctx.lineTo(w + shear, y + bh);
    ctx.lineTo(shear, y + bh * 0.82);
    ctx.closePath();
    ctx.fillStyle = lit ? p.accent : 'rgba(255,255,255,' + (0.03 + p.jit[i] * 0.05).toFixed(3) + ')';
    ctx.globalAlpha = lit ? 0.9 : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function orbit(ctx, w, h, t, p) {
  const cx = w / 2, cy = h / 2;
  for (let i = 0; i < p.count; i += 1) {
    const f = i / p.count;
    const a = t * (0.22 + f * 0.5) + f * Math.PI * 2 + p.phase;
    const rx = w * (0.12 + f * 0.33), ry = h * (0.1 + f * 0.3);
    const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a * p.ratio) * ry;
    const rad = 1.2 + (1 - f) * 3.4;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fillStyle = i % 7 === 0 ? p.accent : 'rgba(255,255,255,.5)';
    ctx.fill();
    if (i % 7 === 0) {
      ctx.beginPath(); ctx.arc(x, y, rad * 3.6, 0, Math.PI * 2);
      ctx.fillStyle = p.accent; ctx.globalAlpha = 0.1; ctx.fill(); ctx.globalAlpha = 1;
    }
  }
}

function lattice(ctx, w, h, t, p) {
  const step = p.step;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  for (let x = step / 2; x < w; x += step) {
    for (let y = step / 2; y < h; y += step) {
      const a = field(x / w * 3, y / h * 3, t) * 1.4;
      const len = step * 0.42 * (0.5 + Math.abs(Math.sin(a)) * 0.9);
      const near = Math.abs(Math.sin(a * 1.3)) > 0.86;
      ctx.strokeStyle = near ? p.accent : 'rgba(255,255,255,.16)';
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(a) * len, y - Math.sin(a) * len);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
  }
}

// The brand metaphor, drawn: one body breaks into its parts and comes back together.
function fracture(ctx, w, h, t, p) {
  const cx = w / 2, cy = h / 2;
  const s = Math.min(w, h) * 0.3;
  const spread = (Math.sin(t * 0.42 + p.phase) * 0.5 + 0.5) ** 1.6;
  for (let i = 0; i < p.shards; i += 1) {
    const a0 = (i / p.shards) * Math.PI * 2;
    const a1 = ((i + 1) / p.shards) * Math.PI * 2;
    const push = spread * s * (0.5 + p.jit[i] * 1.1);
    const mid = (a0 + a1) / 2;
    const ox = Math.cos(mid) * push, oy = Math.sin(mid) * push;
    const r0 = s * (0.82 + p.jit[i] * 0.35);
    const r1 = s * (0.82 + p.jit[(i + 1) % p.shards] * 0.35);
    ctx.beginPath();
    ctx.moveTo(cx + ox, cy + oy);
    ctx.lineTo(cx + ox + Math.cos(a0) * r0, cy + oy + Math.sin(a0) * r0);
    ctx.lineTo(cx + ox + Math.cos(a1) * r1, cy + oy + Math.sin(a1) * r1);
    ctx.closePath();
    ctx.fillStyle = i === p.litA ? p.accent : 'rgba(255,255,255,.07)';
    ctx.fill();
    ctx.strokeStyle = i === p.litA ? p.accent : 'rgba(200,255,0,.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

const DRAW = [strata, orbit, lattice, fracture];

// Every parameter a study needs, derived from its number. Same number, same picture, forever.
function paramsFor(seed) {
  const r = rng(seed * 2654435761);
  const accent = [LIME, LIME, TEAL, PURPLE][Math.floor(r() * 4)];
  const jit = Array.from({ length: 24 }, () => r());
  return {
    technique: seed % DRAW.length,
    accent, jit,
    phase: r() * Math.PI * 2,
    bands: 7 + Math.floor(r() * 7),
    count: 40 + Math.floor(r() * 50),
    ratio: 1 + Math.floor(r() * 3),
    step: 20 + Math.floor(r() * 18),
    shards: 5 + Math.floor(r() * 4),
    litA: Math.floor(r() * 5),
    litB: Math.floor(r() * 9),
  };
}

/* ── relief: a glyph as a stack of lit faces ────────────────────────────────────────────────────────── */

// Four simple marks. Deliberately geometric: the point is the material, not the drawing.
export const GLYPHS = {
  Stone: [[0.5, 0.06], [0.93, 0.32], [0.82, 0.92], [0.18, 0.92], [0.07, 0.32]],
  Shield: [[0.5, 0.05], [0.9, 0.22], [0.83, 0.7], [0.5, 0.95], [0.17, 0.7], [0.1, 0.22]],
  Chevron: [[0.5, 0.1], [0.96, 0.48], [0.96, 0.78], [0.5, 0.4], [0.04, 0.78], [0.04, 0.48]],
  Hex: [[0.5, 0.05], [0.91, 0.28], [0.91, 0.72], [0.5, 0.95], [0.09, 0.72], [0.09, 0.28]],
};

function reliefGlyph(ctx, pts, x, y, size, depth, lx, ly) {
  const layers = Math.max(1, Math.round(depth * 16));
  const dx = lx * depth * size * 0.16;
  const dy = ly * depth * size * 0.16;
  const path = (ox, oy) => {
    ctx.beginPath();
    pts.forEach((pt, i) => {
      const px = x + pt[0] * size + ox, py = y + pt[1] * size + oy;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
  };
  // the extruded body, darkest at the back
  for (let i = layers; i >= 1; i -= 1) {
    const f = i / layers;
    path(-dx * f, -dy * f);
    const l = 0.06 + (1 - f) * 0.1;
    ctx.fillStyle = 'rgba(200,255,0,' + l.toFixed(3) + ')';
    ctx.fill();
  }
  // the face
  path(0, 0);
  const g = ctx.createLinearGradient(x - lx * size * 0.5, y - ly * size * 0.5, x + size + lx * size * 0.5, y + size + ly * size * 0.5);
  g.addColorStop(0, depth > 0.05 ? '#e8ff7a' : LIME);
  g.addColorStop(0.55, LIME);
  g.addColorStop(1, depth > 0.05 ? '#6d8c00' : LIME);
  ctx.fillStyle = g;
  ctx.fill();
  // the lit edge, only when there is depth to catch it
  if (depth > 0.05) {
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.16 + depth * 0.4).toFixed(3) + ')';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

/* ── mount ──────────────────────────────────────────────────────────────────────────────────────────── */

export function mountStudio(canvas, opts = {}) {
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = canvas.getContext('2d');
  let mode = opts.mode || 'studies';
  let seed = opts.seed || 1;
  let depth = opts.depth == null ? 0.85 : opts.depth;
  let light = { x: 0.5, y: 0.35 };
  let params = paramsFor(seed);
  let w = 0, h = 0, raf = 0, visible = true, t0 = 0;

  const size = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, Math.round(r.width));
    h = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    if (mode === 'relief') {
      const lx = (light.x - 0.5) * 2, ly = (light.y - 0.5) * 2;
      const names = Object.keys(GLYPHS);
      const gap = w / names.length;
      const s = Math.min(gap * 0.56, h * 0.56);
      names.forEach((n, i) => {
        reliefGlyph(ctx, GLYPHS[n], gap * i + (gap - s) / 2, (h - s) / 2, s, depth, lx, ly);
      });
      return;
    }
    DRAW[params.technique](ctx, w, h, t, params);
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (!visible || document.hidden) return;
    if (!t0) t0 = ts;
    draw((ts - t0) / 1000);
  }

  size();
  draw(0);

  const ro = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => { size(); if (reduce || mode === 'relief') draw(0); })
    : null;
  if (ro) ro.observe(canvas);

  const io = typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); })
    : null;
  if (io) io.observe(canvas);

  // Autonomous motion is what reduced motion asks us to stop. Relief has none: it only moves when dragged.
  if (!reduce && mode !== 'relief') raf = requestAnimationFrame(loop);

  return {
    technique: () => TECHNIQUES[params.technique],
    setSeed(n) { seed = n; params = paramsFor(seed); if (reduce) draw(0); },
    setDepth(d) { depth = d; if (mode === 'relief') draw(0); },
    setLight(x, y) { light = { x, y }; if (mode === 'relief') draw(0); },
    destroy() {
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      if (io) io.disconnect();
    },
  };
}
