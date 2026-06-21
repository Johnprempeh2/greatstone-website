// Generative cover art for a briefing. Each item gets its own distinct, on-brand visual — a custom
// illustration keyed to the story (deterministic from its id, tinted by its lead topic), not a stock
// photo. (Editorial best practice: custom marks read as credible; stock imagery does not. And the
// content is a curated, simulated landscape, so a real or photoreal image would misrepresent it.)
// The same SVG scales from a small card thumbnail to a full-bleed article hero. No network, instant.
import React, { useMemo } from 'react';
import { TOPIC_HUE } from '../data/ai-intel.mjs';

// FNV-1a string hash → stable 32-bit seed per briefing id
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// mulberry32 PRNG — deterministic stream from the seed (so the art never shifts between renders/visits)
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const monogram = (s) => (s || '?').replace(/^(the|a|an)\s+/i, '').replace(/^www\./i, '').trim().charAt(0).toUpperCase() || '?';
export function briefingHue(b) { const t = (b.topics || [])[0]; return TOPIC_HUE[t] != null ? TOPIC_HUE[t] : 84; }

const W = 800, H = 450, LIME = '#c8ff00';

// Motif A — orbital: concentric rings around an off-centre core, with nodes riding the orbits.
function orbit(r, hue) {
  const cx = 540 + r() * 120, cy = 150 + r() * 120;
  const rings = [], nodes = [];
  const n = 4 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const rad = 70 + i * (52 + r() * 26);
    rings.push(<ellipse key={'r' + i} cx={cx} cy={cy} rx={rad} ry={rad * (0.62 + r() * 0.2)} fill="none"
      stroke={`hsl(${hue} 70% 60% / ${0.07 + (n - i) * 0.03})`} strokeWidth={i === 1 ? 1.4 : 0.9} />);
    const k = 1 + Math.floor(r() * 2);
    for (let j = 0; j < k; j++) {
      const a = r() * Math.PI * 2;
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad * (0.62 + r() * 0.2);
      const lime = r() > 0.6;
      nodes.push(<circle key={'n' + i + '_' + j} cx={x} cy={y} r={lime ? 4.2 : 2.6}
        fill={lime ? LIME : `hsl(${hue} 80% 68%)`} opacity={lime ? 0.95 : 0.6} />);
    }
  }
  return [...rings, ...nodes];
}
// Motif B — constellation: scattered nodes wired to their nearest neighbours.
function constellation(r, hue) {
  const pts = Array.from({ length: 13 }, () => ({ x: 60 + r() * 680, y: 50 + r() * 350 }));
  const lines = [];
  pts.forEach((p, i) => {
    const d = pts.map((q, j) => ({ j, dist: (q.x - p.x) ** 2 + (q.y - p.y) ** 2 })).filter((o) => o.j !== i).sort((a, b) => a.dist - b.dist).slice(0, 2);
    d.forEach((o) => { if (o.j > i) lines.push(<line key={i + '-' + o.j} x1={p.x} y1={p.y} x2={pts[o.j].x} y2={pts[o.j].y} stroke={`hsl(${hue} 60% 60% / .14)`} strokeWidth="1" />); });
  });
  const dots = pts.map((p, i) => { const lime = i % 5 === 0; return <circle key={'d' + i} cx={p.x} cy={p.y} r={lime ? 4 : 2.4} fill={lime ? LIME : `hsl(${hue} 75% 66%)`} opacity={lime ? 0.95 : 0.5} />; });
  return [...lines, ...dots];
}
// Motif C — signal: concentric arcs sweeping from a corner, like a radar pulse.
function signal(r, hue) {
  const ox = r() > 0.5 ? 60 : 740, oy = 380;
  const arcs = [];
  const n = 6 + Math.floor(r() * 3);
  for (let i = 1; i <= n; i++) {
    const rad = i * (58 + r() * 12);
    const dir = ox < 400 ? 1 : -1;
    arcs.push(<path key={'a' + i} d={`M ${ox} ${oy - rad} A ${rad} ${rad} 0 0 ${dir > 0 ? 1 : 0} ${ox + dir * rad} ${oy}`}
      fill="none" stroke={i === 2 ? LIME : `hsl(${hue} 68% 60% / ${0.05 + (n - i) * 0.035})`} strokeWidth={i === 2 ? 1.5 : 1} strokeLinecap="round" />);
  }
  for (let i = 0; i < 10; i++) {
    const x = 80 + r() * 640, y = 40 + r() * 360;
    arcs.push(<circle key={'t' + i} cx={x} cy={y} r={r() > 0.8 ? 3.4 : 1.8} fill={r() > 0.8 ? LIME : `hsl(${hue} 75% 64%)`} opacity={0.5} />);
  }
  return arcs;
}
// Motif D — strata: stacked topographic ridgelines.
function strata(r, hue) {
  const lines = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const base = 90 + i * 46;
    let d = `M -20 ${base}`;
    for (let x = 0; x <= 840; x += 120) d += ` Q ${x + 60} ${base - 30 - r() * 50} ${x + 120} ${base - r() * 14}`;
    const lime = i === Math.floor(n / 2);
    lines.push(<path key={'s' + i} d={d} fill="none" stroke={lime ? LIME : `hsl(${hue} 64% 58% / ${0.1 + i * 0.03})`} strokeWidth={lime ? 1.5 : 1} opacity={lime ? 0.8 : 1} />);
  }
  return lines;
}
const MOTIFS = [orbit, constellation, signal, strata];

export default function BriefingArt({ brief, className }) {
  const art = useMemo(() => {
    const seed = hashStr(brief.id || 'x');
    const r = mulberry32(seed);
    const hue = briefingHue(brief);
    const gid = 'ba' + (seed % 1000000);
    const body = MOTIFS[seed % MOTIFS.length](r, hue);
    return { hue, gid, body, mono: monogram(brief.vendor), glowX: 60 + (seed % 30), glowY: 8 + ((seed >> 4) % 24) };
  }, [brief.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const { hue, gid, body, mono, glowX, glowY } = art;
  return (
    <svg className={'ih-art' + (className ? ' ' + className : '')} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={gid + 'g'} cx={glowX + '%'} cy={glowY + '%'} r="75%">
          <stop offset="0%" stopColor={`hsl(${hue} 70% 22%)`} />
          <stop offset="55%" stopColor="#0b0f0a" />
          <stop offset="100%" stopColor="#070a07" />
        </radialGradient>
        <linearGradient id={gid + 'v'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="60%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${gid}g)`} />
      <text x={W - 28} y={H - 14} textAnchor="end" fontFamily="Montserrat, sans-serif" fontWeight="900"
        fontSize="240" fill={`hsl(${hue} 60% 70%)`} opacity="0.06">{mono}</text>
      {body}
      <rect width={W} height={H} fill={`url(#${gid}v)`} />
    </svg>
  );
}
