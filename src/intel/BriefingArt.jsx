// Generative cover art for a briefing — "the specimen plate". The image now SIGNALS the report's
// subject: the lead TOPIC chooses a recognisable instrument glyph (dial, flow-graph, shield, seal,
// chip die, rising bars, ...) struck dead-centre on a machined obsidian plate, the vendor named
// top-left and the topic labelled at the foot. Deterministic per briefing (the seed only jitters the
// glyph's internals, never its identity, so two same-topic stories are siblings, not twins). On-brand,
// instant (pure inline SVG, no network, no filters), truthful — no photos, no reproduced third-party logos.
import React, { useMemo } from 'react';
import { TOPIC_HUE, TOPIC_LABEL } from '../data/ai-intel.mjs';

function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const monogram = (s) => (s || '?').replace(/^(the|a|an)\s+/i, '').replace(/^www\./i, '').trim().charAt(0).toUpperCase() || '?';
export function briefingHue(b) { const t = (b.topics || [])[0]; return TOPIC_HUE[t] != null ? TOPIC_HUE[t] : 84; }
// a benchmark/percentage figure from the story → 0..1 for the truthful gauges; null when there is none
function leadFrac(b) { const m = (((b && b.headline) || '') + ' ' + ((b && b.summary) || '')).match(/\b(\d{2,3})\s?%/); if (!m) return null; const n = +m[1]; return n >= 10 && n <= 100 ? n / 100 : null; }

const W = 800, H = 450, LIME = '#c8ff00', TEAL = '#4ecdc4';
const CX = 400, CY = 205;
const f = (n) => Number((n || 0).toFixed(1));
const rad = (deg) => (deg * Math.PI) / 180;
const onC = (deg, r, cx = CX, cy = CY) => [f(cx + Math.cos(rad(deg)) * r), f(cy + Math.sin(rad(deg)) * r)];

// lime accent: a fatter low-opacity duplicate under a crisp lime element (faux-glow, no SVG filters)
function lime(key, Tag, base) {
  const sw = base.strokeWidth || 2;
  return [
    <Tag key={key + 'g'} {...base} stroke={LIME} strokeWidth={sw + 3} opacity={0.22} fill="none" />,
    <Tag key={key} {...base} stroke={LIME} fill={base.fill || 'none'} />,
  ];
}

// ---- the eleven topic glyphs: each (r, hue, brief) -> JSX[], authored around centre (400,205) ----
const GLYPH = {
  // capability dial — a 270deg benchmark gauge; needle = a real score when the story carries one
  'frontier-models': (r, hue, b) => {
    const S = `hsl(${hue} 75% 62%)`, D = `hsl(${hue} 70% 55%)`;
    const frac = leadFrac(b) != null ? leadFrac(b) : 0.32 + r() * 0.5;
    const N = 9 + Math.floor(r() * 5);
    const ticks = Array.from({ length: N }, (_, i) => { const a = 135 + (i / (N - 1)) * 270; const [x1, y1] = onC(a, 120); const [x2, y2] = onC(a, 108); return <line key={'tk' + i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={D} strokeWidth="1" />; });
    const [sx, sy] = onC(135, 120), [ex, ey] = onC(45, 120), [nx, ny] = onC(135 + frac * 270, 92);
    return [
      <path key="arc" d={`M ${sx} ${sy} A 120 120 0 1 1 ${ex} ${ey}`} fill="none" stroke={S} strokeWidth="2.5" strokeLinecap="round" />,
      ...ticks,
      ...lime('ndl', 'line', { x1: CX, y1: CY, x2: nx, y2: ny, strokeWidth: 2.5, strokeLinecap: 'round' }),
      ...lime('hub', 'circle', { cx: CX, cy: CY, r: 6, strokeWidth: 2, fill: '#0b0f0a' }),
      <text key="lbl" x={CX} y={CY + 36} textAnchor="middle" fontFamily="Montserrat, sans-serif" fontWeight="700" fontSize="11" letterSpacing="2" fill={D}>INDEX</text>,
    ];
  },
  // delegation flow-graph — wired nodes, one pulsing lime
  agents: (r, hue) => {
    const S = `hsl(${hue} 75% 62%)`, D = `hsl(${hue} 70% 55%)`, Fl = `hsl(${hue} 60% 30% / .4)`;
    const N = 3 + Math.floor(r() * 3), active = Math.floor(r() * N);
    const pts = Array.from({ length: N }, (_, i) => ({ x: 300 + (i * (200 / (N - 1))), y: CY + (r() * 60 - 30) }));
    const out = [];
    for (let i = 0; i < N - 1; i++) { const a = pts[i], b = pts[i + 1], mx = (a.x + b.x) / 2; out.push(<path key={'cn' + i} d={`M ${f(a.x + 23)} ${f(a.y)} H ${f(mx)} V ${f(b.y)} H ${f(b.x - 23)}`} fill="none" stroke={D} strokeWidth="1.5" />); }
    out.push(<path key="loop" d={`M ${f(pts[N - 1].x)} ${f(pts[N - 1].y + 15)} C ${f(pts[N - 1].x)} ${f(CY + 92)}, ${f(pts[0].x)} ${f(CY + 92)}, ${f(pts[0].x)} ${f(pts[0].y + 15)}`} fill="none" stroke={D} strokeWidth="1.1" strokeDasharray="4 3" />);
    pts.forEach((p, i) => { if (i === active) out.push(...lime('an' + i, 'rect', { x: f(p.x - 23), y: f(p.y - 14), width: 46, height: 28, rx: 5, strokeWidth: 2, fill: Fl })); else out.push(<rect key={'nd' + i} x={f(p.x - 23)} y={f(p.y - 14)} width="46" height="28" rx="5" fill="none" stroke={S} strokeWidth="2" />); });
    return out;
  },
  // diff terminal — a code window with +/- gutter and a lime caret
  coding: (r, hue) => {
    const S = `hsl(${hue} 75% 62%)`, D = `hsl(${hue} 70% 55% / .5)`;
    const x = CX - 150, y = CY - 92, rows = 3 + Math.floor(r() * 2), caret = Math.floor(r() * rows);
    const plus = Math.floor(r() * rows), minus = (plus + 1 + Math.floor(r() * (rows - 1))) % rows;
    const out = [
      <rect key="win" x={x} y={y} width="300" height="184" rx="8" fill="none" stroke={S} strokeWidth="2" />,
      <line key="bar" x1={x} y1={y + 28} x2={x + 300} y2={y + 28} stroke={D} strokeWidth="1" />,
      ...[0, 1, 2].map((i) => <circle key={'dot' + i} cx={x + 18 + i * 16} cy={y + 14} r="4" fill="none" stroke={D} strokeWidth="1.2" />),
    ];
    for (let i = 0; i < rows; i++) {
      const ry = y + 52 + i * 26, w = 120 + r() * 120;
      const gut = i === plus ? `hsl(132 60% 55%)` : i === minus ? `hsl(6 70% 60%)` : D;
      out.push(<text key={'g' + i} x={x + 16} y={ry + 5} fontFamily="monospace" fontSize="15" fill={gut}>{i === plus ? '+' : i === minus ? '−' : '·'}</text>);
      out.push(<rect key={'r' + i} x={x + 34} y={ry - 6} width={f(w)} height="9" rx="3" fill={`hsl(${hue} 70% 55% / .4)`} />);
      if (i === caret) out.push(...lime('car', 'rect', { x: f(x + 34 + w + 6), y: ry - 8, width: 3, height: 14, strokeWidth: 0, fill: LIME }));
    }
    return out;
  },
  // org ziggurat — narrowing platform tiers with a lime keystone
  enterprise: (r, hue) => {
    const S = `hsl(${hue} 75% 62%)`, F = `hsl(${hue} 65% 55% / .10)`;
    const tiers = 3 + Math.floor(r() * 2), lean = r() * 24 - 12, out = [];
    for (let i = 0; i < tiers; i++) { const w = 220 - i * (150 / tiers), h = 30, ty = CY + 70 - (i + 1) * (h + 8), tx = CX - w / 2 + lean * (i / tiers); out.push(<rect key={'tier' + i} x={f(tx)} y={f(ty)} width={f(w)} height={h} rx="4" fill={F} stroke={S} strokeWidth="2" />); }
    const kw = 220 - tiers * (150 / tiers), ky = CY + 70 - (tiers + 1) * 38, kx = CX - 30 + lean;
    out.push(...lime('key', 'rect', { x: f(kx), y: f(ky), width: 60, height: 26, rx: 4, strokeWidth: 2, fill: `hsl(${hue} 50% 35% / .4)` }));
    out.push(<line key="br1" x1={f(CX - 130)} y1={CY - 30} x2={f(CX - 130)} y2={CY + 70} stroke={`hsl(${hue} 70% 55% / .5)`} strokeWidth="1.5" strokeDasharray="4 3" />);
    out.push(<line key="br2" x1={f(CX + 130)} y1={CY - 30} x2={f(CX + 130)} y2={CY + 70} stroke={`hsl(${hue} 70% 55% / .5)`} strokeWidth="1.5" strokeDasharray="4 3" />);
    return out;
  },
  // shield + lime scan-line — defence under live monitoring
  'ai-security': (r, hue) => {
    const S = `hsl(${hue} 75% 62%)`, F = `hsl(${hue} 65% 55% / .10)`;
    const sw = 150, top = CY - 95, d = `M ${CX} ${top} L ${CX + sw / 2} ${top + 24} L ${CX + sw / 2} ${top + 110} Q ${CX + sw / 2} ${top + 175} ${CX} ${top + 200} Q ${CX - sw / 2} ${top + 175} ${CX - sw / 2} ${top + 110} L ${CX - sw / 2} ${top + 24} Z`;
    const scanY = top + 70 + r() * 80;
    return [
      <path key="sh" d={d} fill={F} stroke={S} strokeWidth="2.5" strokeLinejoin="round" />,
      <rect key="lk" x={CX - 12} y={CY - 8} width="24" height="20" rx="3" fill="none" stroke={`hsl(${hue} 70% 55%)`} strokeWidth="1.5" />,
      <path key="sk" d={`M ${CX - 7} ${CY - 8} v -8 a 7 7 0 0 1 14 0 v 8`} fill="none" stroke={`hsl(6 70% 60%)`} strokeWidth="1.5" />,
      ...lime('scan', 'line', { x1: CX - sw / 2 + 6, y1: f(scanY), x2: CX + sw / 2 - 6, y2: f(scanY), strokeWidth: 2, strokeLinecap: 'round' }),
    ];
  },
  // sealed statute — a ruled document clamped by a lime wax seal
  regulation: (r, hue) => {
    const S = `hsl(${hue} 75% 62%)`, D = `hsl(${hue} 70% 55% / .5)`;
    const px = CX - 95, py = CY - 120, rules = 3 + Math.floor(r() * 3), out = [
      <rect key="pg" x={px} y={py} width="200" height="250" rx="4" fill={`hsl(${hue} 65% 55% / .08)`} stroke={S} strokeWidth="2" />,
    ];
    for (let i = 0; i < rules; i++) out.push(<line key={'ru' + i} x1={px + 20} y1={py + 50 + i * 30} x2={px + 200 - 30 - r() * 40} y2={py + 50 + i * 30} stroke={D} strokeWidth="2" />);
    const seal = onC(0, 0, px + 200 - 14, py + 250 - 14);
    const ticks = Array.from({ length: 10 + Math.floor(r() * 4) }, (_, i) => { const a = (i / 12) * 360, [x1, y1] = onC(a, 30, seal[0], seal[1]), [x2, y2] = onC(a, 36, seal[0], seal[1]); return <line key={'st' + i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={LIME} strokeWidth="1.5" opacity="0.7" />; });
    out.push(...ticks, ...lime('s1', 'circle', { cx: seal[0], cy: seal[1], r: 30, strokeWidth: 2, fill: `hsl(${hue} 45% 25% / .5)` }), <circle key="s2" cx={seal[0]} cy={seal[1]} r="20" fill="none" stroke={LIME} strokeWidth="1.5" opacity="0.8" />);
    return out;
  },
  // rising bars + a lime breakout arrow
  funding: (r, hue) => {
    const S = `hsl(${hue} 75% 62%)`, F = `hsl(${hue} 65% 55% / .12)`;
    const N = 4 + Math.floor(r() * 3), base = CY + 95, bw = 26, gap = 14, totalW = N * bw + (N - 1) * gap, x0 = CX - totalW / 2, out = [];
    let h = 30;
    const tips = [];
    for (let i = 0; i < N; i++) { h = Math.min(180, h + 18 + r() * 28); const bx = x0 + i * (bw + gap); out.push(<rect key={'bar' + i} x={f(bx)} y={f(base - h)} width={bw} height={f(h)} rx="3" fill={F} stroke={S} strokeWidth="2" />); tips.push({ x: bx + bw / 2, y: base - h }); }
    out.push(<line key="axis" x1={f(x0 - 10)} y1={base} x2={f(x0 + totalW + 10)} y2={base} stroke={`hsl(${hue} 70% 55% / .5)`} strokeWidth="1.5" />);
    const last = tips[N - 1];
    out.push(...lime('br', 'path', { d: `M ${f(tips[0].x)} ${f(tips[0].y)} L ${f(last.x)} ${f(last.y - 24)}`, strokeWidth: 2.5, strokeLinecap: 'round' }));
    out.push(<polygon key="ah" points={`${f(last.x)},${f(last.y - 30)} ${f(last.x - 11)},${f(last.y - 20)} ${f(last.x - 2)},${f(last.y - 16)}`} fill={LIME} />);
    return out;
  },
  // server rack grid — compute as physical estate, 1-2 units lit lime
  infrastructure: (r, hue) => {
    const S = `hsl(${hue} 75% 62%)`, D = `hsl(${hue} 70% 55%)`;
    const cols = 2, rowsN = 4, uw = 92, uh = 26, gx = 12, gy = 10, totalW = cols * uw + (cols - 1) * gx, totalH = rowsN * uh + (rowsN - 1) * gy;
    const x0 = CX - totalW / 2, y0 = CY - totalH / 2, out = [];
    const lit = new Set([Math.floor(r() * cols * rowsN), Math.floor(r() * cols * rowsN)]);
    let k = 0;
    for (let ry = 0; ry < rowsN; ry++) for (let cx = 0; cx < cols; cx++) {
      const ux = x0 + cx * (uw + gx), uy = y0 + ry * (uh + gy), isLit = lit.has(k);
      if (isLit) out.push(...lime('u' + k, 'rect', { x: f(ux), y: f(uy), width: uw, height: uh, rx: 3, strokeWidth: 2, fill: `hsl(${hue} 50% 30% / .35)` }));
      else out.push(<rect key={'u' + k} x={f(ux)} y={f(uy)} width={uw} height={uh} rx="3" fill="none" stroke={S} strokeWidth="1.8" />);
      [0, 1, 2].forEach((p) => out.push(<circle key={'led' + k + p} cx={f(ux + 14 + p * 9)} cy={f(uy + uh / 2)} r="2" fill={isLit && p === 0 ? LIME : D} opacity={isLit && p === 0 ? 1 : 0.5} />));
      k++;
    }
    return out;
  },
  // media venn — overlapping lenses fused at a lime core
  multimodal: (r, hue) => {
    const S = `hsl(${hue} 75% 62%)`, o = 0.5, jx = r() * 16 - 8, jy = r() * 16 - 8;
    return [
      <polygon key="play" points={`${CX - 40 + jx},${CY - 50} ${CX - 40 + jx},${CY + 10} ${CX + 10 + jx},${CY - 20}`} fill="none" stroke={S} strokeWidth="2" opacity={o} />,
      <rect key="img" x={CX - 10} y={CY - 30 + jy} width="70" height="54" rx="6" fill="none" stroke={S} strokeWidth="2" opacity={o} />,
      <path key="wave" d={`M ${CX - 55} ${CY + 50} q 14 -34 28 0 t 28 0 t 28 0`} fill="none" stroke={S} strokeWidth="2" opacity={o} />,
      ...lime('core', 'circle', { cx: CX + 6, cy: CY + 2, r: 13, strokeWidth: 2, fill: `hsl(${hue} 50% 30% / .4)` }),
    ];
  },
  // chip die — package with pin teeth, routed traces, lime centre pad
  hardware: (r, hue) => {
    const S = `hsl(${hue} 75% 62%)`, D = `hsl(${hue} 70% 55% / .7)`, sz = 180, x = CX - sz / 2, y = CY - sz / 2, out = [
      <rect key="pkg" x={x} y={y} width={sz} height={sz} rx="6" fill={`hsl(${hue} 65% 55% / .08)`} stroke={S} strokeWidth="2.5" />,
      <rect key="die" x={x + 34} y={y + 34} width={sz - 68} height={sz - 68} rx="3" fill="none" stroke={D} strokeWidth="1.3" />,
    ];
    const pins = 5 + Math.floor(r() * 3);
    for (let i = 0; i < pins; i++) { const t = (i + 0.5) / pins, p = t * sz; out.push(<line key={'pt' + i} x1={f(x + p)} y1={y - 8} x2={f(x + p)} y2={y} stroke={D} strokeWidth="2" />, <line key={'pb' + i} x1={f(x + p)} y1={y + sz} x2={f(x + p)} y2={y + sz + 8} stroke={D} strokeWidth="2" />, <line key={'pl' + i} x1={x - 8} y1={f(y + p)} x2={x} y2={f(y + p)} stroke={D} strokeWidth="2" />, <line key={'pr' + i} x1={x + sz} y1={f(y + p)} x2={x + sz + 8} y2={f(y + p)} stroke={D} strokeWidth="2" />); }
    [[x + 44, y + 44], [x + sz - 44, y + 44], [x + 44, y + sz - 44], [x + sz - 44, y + sz - 44]].forEach((c, i) => out.push(<circle key={'fd' + i} cx={c[0]} cy={c[1]} r="3" fill="none" stroke={D} strokeWidth="1.2" />));
    out.push(...lime('pad', 'rect', { x: CX - 14, y: CY - 14, width: 28, height: 28, rx: 3, strokeWidth: 2, fill: `hsl(${hue} 50% 30% / .5)` }));
    return out;
  },
  // fork / branch tree — a commit spine with a lime release node
  'open-source': (r, hue) => {
    const S = `hsl(${hue} 75% 62%)`, D = `hsl(${hue} 70% 55%)`, sx = CX - 40, out = [
      <line key="spine" x1={sx} y1={CY - 90} x2={sx} y2={CY + 90} stroke={S} strokeWidth="2" />,
    ];
    const commits = [CY - 70, CY - 20, CY + 30, CY + 80];
    commits.forEach((cy, i) => out.push(<circle key={'cm' + i} cx={sx} cy={cy} r="5" fill="#0b0f0a" stroke={S} strokeWidth="2" />));
    const branches = 2 + Math.floor(r() * 2), bx = sx + 80, release = Math.floor(r() * branches);
    for (let i = 0; i < branches; i++) {
      const fromY = commits[i] || CY, toY = fromY - 30 - r() * 20;
      out.push(<path key={'bp' + i} d={`M ${sx} ${f(fromY)} C ${f(sx + 40)} ${f(fromY)}, ${f(bx - 40)} ${f(toY)}, ${bx} ${f(toY)}`} fill="none" stroke={D} strokeWidth="1.5" />);
      if (i === release) out.push(...lime('rel' + i, 'circle', { cx: bx, cy: f(toY), r: 6, strokeWidth: 2, fill: `hsl(${hue} 50% 30% / .5)` }));
      else out.push(<circle key={'bc' + i} cx={bx} cy={f(toY)} r="5" fill="#0b0f0a" stroke={S} strokeWidth="2" />);
    }
    return out;
  },
};
const FALLBACK = 'frontier-models';

export default function BriefingArt({ brief, className }) {
  const art = useMemo(() => {
    const seed = hashStr((brief && brief.id) || 'x');
    const r = mulberry32(seed);
    const hue = briefingHue(brief);
    const gid = 'ba' + (seed % 1000000);
    const topics = (brief && brief.topics) || [];
    const t0 = topics[0] && GLYPH[topics[0]] ? topics[0] : FALLBACK;
    const t1 = topics[1] && GLYPH[topics[1]] && topics[1] !== t0 ? topics[1] : null;
    const hue2 = t1 != null && TOPIC_HUE[t1] != null ? TOPIC_HUE[t1] : hue;
    // fixed r() consumption order keeps every cover pixel-stable per id: grid -> stipple -> wrapper -> glyph(s)
    const gx = r() * 50 - 25, gy = r() * 50 - 25;
    const stipple = Array.from({ length: 10 }, (_, i) => ({ x: f(20 + r() * 760), y: f(20 + r() * 410), k: 'sp' + i }));
    const rot = (r() * 12 - 6).toFixed(2), scl = (0.92 + r() * 0.16).toFixed(3);
    const glyph = GLYPH[t0](r, hue, brief);
    const glowX = 50 + (seed % 8), glowY = 38 + ((seed >> 4) % 10);
    return { seed, hue, gid, t0, t1, gx, gy, stipple, rot, scl, glyph, glowX, glowY,
      mono: monogram(brief && brief.vendor), vendor: (brief && brief.vendor) || '', importance: (brief && brief.importance) || 'medium' };
  }, [brief.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { hue, gid, t0, gx, gy, stipple, rot, scl, glyph, glowX, glowY, mono, vendor, importance, seed } = art;
  const grid = [];
  for (let x = 50; x <= 750; x += 50) grid.push(<line key={'gv' + x} x1={f(x + gx)} y1="0" x2={f(x + gx)} y2={H} stroke={`hsl(${hue} 45% 55% / .05)`} strokeWidth="1" />);
  for (let y = 50; y <= 400; y += 50) grid.push(<line key={'gh' + y} x1="0" y1={f(y + gy)} x2={W} y2={f(y + gy)} stroke={`hsl(${hue} 45% 55% / .05)`} strokeWidth="1" />);
  const corners = [[24, 24, 1, 1], [776, 24, -1, 1], [24, 426, 1, -1], [776, 426, -1, -1]].map(([cx, cy, sx, sy], i) => (
    <path key={'cr' + i} d={`M ${cx} ${cy + sy * 12} V ${cy} H ${cx + sx * 12}`} fill="none" stroke={LIME} strokeWidth="1.5" opacity="0.5" />));
  const lit = importance === 'high' ? 12 : importance === 'low' ? 4 : 8;
  const segs = Array.from({ length: 12 }, (_, i) => <rect key={'sg' + i} x={f(40 + i * 10)} y={H - 20} width="6" height="3" rx="1" fill={i < lit ? LIME : `hsl(${hue} 50% 40% / .3)`} />);
  const station = 'STN·' + (seed >>> 8).toString(16).slice(0, 4).toUpperCase();

  return (
    <svg className={'ih-art' + (className ? ' ' + className : '')} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={gid + 'g'} cx={glowX + '%'} cy={glowY + '%'} r="72%">
          <stop offset="0%" stopColor={`hsl(${hue} 70% 22%)`} />
          <stop offset="55%" stopColor="#0b0f0a" />
          <stop offset="100%" stopColor="#070a07" />
        </radialGradient>
        <linearGradient id={gid + 'v'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="50%" stopColor="#040603" stopOpacity="0" />
          <stop offset="100%" stopColor="#040603" stopOpacity="0.62" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${gid}g)`} />
      <g>{grid}</g>
      {stipple.map((s) => <circle key={s.k} cx={s.x} cy={s.y} r="1" fill={`hsl(${hue} 70% 60% / .10)`} />)}
      <g transform={`translate(${CX} ${CY}) rotate(${rot}) scale(${scl}) translate(${-CX} ${-CY})`}>{glyph}</g>
      <rect x="22" y="22" width="756" height="406" rx="6" fill="none" stroke={`hsl(${hue} 60% 60% / .22)`} strokeWidth="1" />
      {corners}
      {/* vendor call-sign (typeset name, never a reproduced logo) */}
      <g>
        <rect x="40" y="38" width="30" height="30" rx="6" fill={`hsl(${hue} 60% 30% / .25)`} stroke={LIME} strokeWidth="1.4" opacity="0.85" />
        <text x="55" y="59" textAnchor="middle" fontFamily="Montserrat, sans-serif" fontWeight="800" fontSize="16" fill={LIME}>{mono}</text>
        <text x="80" y="55" fontFamily="Montserrat, sans-serif" fontWeight="700" fontSize="13" letterSpacing="1.4" fill={`hsl(${hue} 30% 88%)`}>{vendor.toUpperCase().slice(0, 22)}</text>
        <text x="80" y="68" fontFamily="Montserrat, sans-serif" fontWeight="600" fontSize="9" letterSpacing="1" fill={`hsl(${hue} 30% 70% / .5)`}>{station}</text>
      </g>
      {/* foot stamp: figure no. + topic label (the caption that makes the meaning unmissable) + signal bar */}
      <g>
        <text x="40" y="402" fontFamily="Montserrat, sans-serif" fontWeight="700" fontSize="10" letterSpacing="1" fill={`hsl(${hue} 30% 75% / .7)`}>{'FIG·' + (seed % 90 + 1)}</text>
        <text x="40" y="420" fontFamily="Montserrat, sans-serif" fontWeight="800" fontSize="14" letterSpacing="2" fill={`hsl(${hue} 65% 65%)`}>{(TOPIC_LABEL[t0] || t0).toUpperCase()}</text>
      </g>
      {segs}
      <rect width={W} height={H} fill={`url(#${gid}v)`} />
    </svg>
  );
}
