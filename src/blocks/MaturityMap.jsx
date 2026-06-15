import { useEffect, useRef } from 'react';

// The climb page's signature: a pinned mountain whose trail draws as you scroll, a climber that
// walks base → summit, and the three tier cards (pebble/plateau/peak) that light as you reach
// them. The terrain + trail are code-owned; marketing edits the three tier explainers. Inside
// the editor (and under reduced-motion) it settles at the summit, unpinned, so it stays editable.
const SUBS = ['base', 'shelf', 'summit'];

export function MaturityMap({ tiers = [] }) {
  const rootRef = useRef(null);
  useEffect(() => {
    const root = rootRef.current; if (!root) return;
    const stage = root;
    const trail = root.querySelector('.trail-draw');
    const climber = root.querySelector('.climber');
    const fill = root.querySelector('.climb-fill');
    const pct = root.querySelector('.climb-pct');
    const summit = root.querySelector('.summit-glow');
    const capGlow = root.querySelector('.peak-cap');
    if (!trail || !climber) return;
    const labels = [...root.querySelectorAll('.tier-glow-lbl')];
    const cards = [...root.querySelectorAll('.tier-card')];
    const trig = [0, 0.42, 0.78];

    const len = trail.getTotalLength();
    trail.style.strokeDasharray = len;
    trail.style.strokeDashoffset = len;

    let raf = 0, target = 0;
    const settleEditor = root.closest('.is-edit') || matchMedia('(prefers-reduced-motion: reduce)').matches;

    function apply() {
      raf = 0;
      const t = target;
      trail.style.strokeDashoffset = len * (1 - t);
      const pt = trail.getPointAtLength(len * t);
      climber.setAttribute('transform', `translate(${pt.x},${pt.y})`);
      const p = Math.round(t * 100);
      if (fill) fill.style.width = p + '%';
      if (pct) pct.textContent = p + '%';
      trig.forEach((tp, i) => {
        const nextP = i < trig.length - 1 ? trig[i + 1] : 1.01;
        if (labels[i]) labels[i].style.opacity = t >= tp - 0.001 ? '1' : '0.45';
        if (cards[i]) cards[i].classList.toggle('active', t >= tp - 0.04 && t < nextP);
      });
      const peakT = Math.max(0, (t - 0.78) / 0.22);
      if (summit) summit.style.opacity = (peakT * 0.9).toFixed(3);
      if (capGlow) capGlow.style.opacity = (0.25 + peakT * 0.75).toFixed(3);
    }
    function schedule() { if (!raf) raf = requestAnimationFrame(apply); }
    function compute() {
      const rect = stage.getBoundingClientRect();
      const scrollable = stage.offsetHeight - innerHeight;
      const passed = Math.min(Math.max(-rect.top, 0), scrollable);
      target = scrollable > 0 ? passed / scrollable : 0;
      schedule();
    }

    if (settleEditor) { target = 1; apply(); return; }
    addEventListener('scroll', compute, { passive: true });
    addEventListener('resize', compute);
    compute();
    return () => { removeEventListener('scroll', compute); removeEventListener('resize', compute); if (raf) cancelAnimationFrame(raf); };
  }, [tiers.length]);

  return (
    <section className="b-map map-stage" ref={rootRef} aria-label="The digital maturity map">
      <div className="map-sticky">
        <div className="map-sky" aria-hidden="true" />
        <svg className="map-svg" viewBox="0 0 1200 760" preserveAspectRatio="xMidYMid slice" role="img"
          aria-label="A mountain with three altitude tiers: Pebble at the base, Plateau in the middle, Peak at the summit, with a trail climbing from base to peak.">
          <defs>
            <linearGradient id="trailGrad" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#7a807a" /><stop offset="45%" stopColor="#4ecdc4" /><stop offset="100%" stopColor="#c8ff00" />
            </linearGradient>
            <linearGradient id="ridge1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#16241c" /><stop offset="100%" stopColor="#0e1813" /></linearGradient>
            <linearGradient id="ridge2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1c3127" /><stop offset="100%" stopColor="#12231b" /></linearGradient>
            <linearGradient id="ridge3" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#234234" /><stop offset="100%" stopColor="#16261d" /></linearGradient>
            <linearGradient id="peakCap" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(200,255,0,0.30)" /><stop offset="100%" stopColor="rgba(200,255,0,0)" /></linearGradient>
            <radialGradient id="summitGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="rgba(200,255,0,0.55)" /><stop offset="100%" stopColor="rgba(200,255,0,0)" /></radialGradient>
            <filter id="trailGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          <path d="M0,560 L150,470 L320,540 L470,430 L640,520 L820,400 L980,500 L1130,380 L1200,440 L1200,760 L0,760 Z" fill="url(#ridge1)" opacity="0.85" />
          <path d="M0,640 L220,560 L420,610 L600,500 L780,560 L940,470 L1120,520 L1200,490 L1200,760 L0,760 Z" fill="url(#ridge2)" />
          <path d="M0,760 L60,710 L180,690 L300,650 L430,600 L560,520 L690,430 L800,330 L900,230 L980,150 L1040,96 L1075,150 L1140,300 L1200,460 L1200,760 Z" fill="url(#ridge3)" />
          <path d="M980,150 L1040,96 L1075,150 L1052,165 L1024,150 L1004,168 Z" fill="url(#peakCap)" className="tier-glow peak-cap" style={{ opacity: 0.25 }} />
          <circle cx="1040" cy="100" r="120" fill="url(#summitGlow)" className="tier-glow summit-glow" style={{ opacity: 0 }} />
          <line x1="0" y1="600" x2="1200" y2="600" className="map-divider" strokeWidth="1" strokeDasharray="3 8" />
          <line x1="0" y1="380" x2="1200" y2="380" className="map-divider" strokeWidth="1" strokeDasharray="3 8" />
          <path className="trail-base" d="M80,720 C220,690 300,672 380,628 C470,580 500,540 560,512 C640,476 660,470 706,420 C770,352 768,360 812,316 C880,250 902,236 952,184 C1000,134 1018,128 1040,104" />
          <path className="trail-draw" d="M80,720 C220,690 300,672 380,628 C470,580 500,540 560,512 C640,476 660,470 706,420 C770,352 768,360 812,316 C880,250 902,236 952,184 C1000,134 1018,128 1040,104" />
          <g className="climber">
            <circle className="pulse" cx="0" cy="0" r="18" fill="#c8ff00" />
            <circle cx="0" cy="0" r="8.5" fill="#0e1611" stroke="#c8ff00" strokeWidth="2.5" />
            <circle cx="0" cy="0" r="3" fill="#c8ff00" />
          </g>
          {[{ x: 120, y: 688, fs: 30, c: '#9aa09a', sc: '#7a807a' }, { x: 470, y: 520, fs: 32, c: '#7fd8d0', sc: '#8fb8b2' }, { x: 828, y: 210, fs: 36, c: '#c8ff00', sc: '#aebf6e' }].map((g, i) => {
            const tr = tiers[i] || {};
            return (
              <g className="tier-glow-lbl" key={i} style={{ opacity: 0.45 }}>
                <text className="tier-tag" x={g.x} y={g.y} fontSize={g.fs} fill={g.c}>{(tr.tag || '').toUpperCase()}</text>
                <text className="tier-sub" x={g.x} y={g.y + 24} fill={g.sc}>Score {tr.range} · the {SUBS[i]}</text>
              </g>
            );
          })}
        </svg>

        <div className="tier-rail">
          {tiers.map((tr, i) => (
            <article className="tier-card" data-tier={['pebble', 'plateau', 'peak'][i]} key={i}>
              <div className="score">{tr.tag} · {tr.range}</div>
              <h3>{tr.title}</h3>
              <p>{tr.desc}</p>
              <div className="traits">{(tr.traits || '').split(',').map((s, j) => s.trim()).filter(Boolean).map((s, j) => <span key={j}>{s}</span>)}</div>
            </article>
          ))}
        </div>

        <div className="map-progress" aria-hidden="true">
          <span className="pct climb-pct">0%</span>
          <div className="track"><div className="fill climb-fill" /></div>
        </div>
      </div>
    </section>
  );
}

export const css = `
.b-map.map-stage{position:relative;height:320vh}
.map-sticky{position:sticky;top:0;height:100vh;display:flex;align-items:center;overflow:hidden}
.map-sky{position:absolute;inset:0;background:radial-gradient(120% 90% at 80% 6%,rgba(200,255,0,.06),transparent 55%),radial-gradient(90% 80% at 12% 100%,rgba(27,80,57,.4),transparent 60%)}
.map-svg{width:100%;height:100%;display:block}
.map-divider{stroke:var(--gs-border-soft)}
.tier-glow,.tier-glow-lbl{transition:opacity .6s var(--gs-ease)}
.trail-base{stroke:var(--gs-border-soft);stroke-width:2;fill:none;stroke-dasharray:2 9;opacity:.5}
.trail-draw{stroke:url(#trailGrad);stroke-width:4;fill:none;stroke-linecap:round;filter:url(#trailGlow)}
.tier-tag{font-weight:900;letter-spacing:.04em}
.tier-sub{font-size:13px;font-weight:600}
.climber .pulse{opacity:.35;transform-origin:center;animation:gsClimbPulse 2.4s var(--gs-ease) infinite}
@keyframes gsClimbPulse{0%{transform:scale(.6);opacity:.5}70%{transform:scale(2.2);opacity:0}100%{opacity:0}}
.tier-rail{position:absolute;top:50%;right:var(--gs-gutter);transform:translateY(-50%);width:min(330px,32vw);display:flex;flex-direction:column;gap:12px;z-index:2}
.tier-card{background:var(--gs-glass);border:1px solid var(--gs-border-soft);border-radius:16px;padding:16px 18px;backdrop-filter:blur(10px);opacity:.28;transform:translateX(14px);transition:opacity .5s var(--gs-ease),transform .5s var(--gs-ease),border-color .5s var(--gs-ease),box-shadow .5s var(--gs-ease)}
.tier-card.active{opacity:1;transform:none;border-color:var(--gs-border);box-shadow:0 18px 60px -28px rgba(0,0,0,.7)}
.tier-card .score{font-size:.7rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase}
.tier-card h3{font-size:1.35rem;margin:4px 0 7px;font-weight:800}
.tier-card p{font-size:.86rem;color:var(--gs-muted);line-height:1.5}
.tier-card .traits{display:flex;flex-wrap:wrap;gap:6px;margin-top:11px}
.tier-card .traits span{font-size:.66rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:.32em .7em;border-radius:100px;border:1px solid var(--gs-border-soft);color:var(--gs-faint)}
.tier-card[data-tier="pebble"] .score{color:var(--gs-faint)}
.tier-card[data-tier="plateau"] .score{color:var(--gs-teal)}
.tier-card[data-tier="peak"] .score{color:var(--gs-accent)}
.tier-card[data-tier="peak"].active{border-color:var(--gs-accent-mid);box-shadow:0 18px 60px -26px var(--gs-accent-glow)}
.tier-card[data-tier="peak"].active .traits span{border-color:var(--gs-border);color:var(--gs-accent)}
.map-progress{position:absolute;left:var(--gs-gutter);bottom:34px;z-index:3;display:flex;align-items:center;gap:14px}
.map-progress .track{width:min(220px,40vw);height:4px;border-radius:4px;background:var(--gs-border-soft);overflow:hidden}
.map-progress .fill{height:100%;width:0;background:linear-gradient(90deg,var(--gs-faint),var(--gs-teal),var(--gs-accent));border-radius:4px}
.map-progress .pct{font-size:.72rem;font-weight:800;letter-spacing:.14em;color:var(--gs-muted);font-variant-numeric:tabular-nums}
@media(max-width:860px){
  .b-map.map-stage{height:auto}
  .map-sticky{height:auto;position:static;display:block;padding:8px 0 32px}
  .map-svg{height:auto;aspect-ratio:16/12}
  .tier-rail{position:static;transform:none;width:auto;margin:18px var(--gs-gutter) 0}
  .tier-card{opacity:1;transform:none}
  .map-progress{display:none}
}
/* editor: unpin and settle so the block is editable without the giant scroll runway */
.is-edit .b-map.map-stage{height:auto}
.is-edit .map-sticky{height:auto;position:static;display:block;padding:8px 0 32px}
.is-edit .map-svg{height:auto;aspect-ratio:16/10}
.is-edit .tier-rail{position:static;transform:none;width:auto;margin:18px var(--gs-gutter) 0}
.is-edit .tier-card{opacity:1;transform:none}
.is-edit .map-progress{display:none}
@media(prefers-reduced-motion:reduce){.climber .pulse{animation:none}}
`;

const TIER = (tag, range, title, desc, traits) => ({ tag, range, title, desc, traits });

export const puck = {
  label: 'Maturity map (3D climb)',
  fields: {
    tiers: {
      type: 'array', label: 'Tiers (three: pebble, plateau, peak)',
      arrayFields: {
        tag: { type: 'text', label: 'Name' },
        range: { type: 'text', label: 'Score range' },
        title: { type: 'text', label: 'One-word posture' },
        desc: { type: 'textarea', label: 'Description' },
        traits: { type: 'text', label: 'Traits (comma-separated)' },
      },
      defaultItemProps: { tag: 'Tier', range: '1–4', title: 'State.', desc: 'What it feels like here.', traits: 'One, Two, Three' },
      getItemSummary: (item) => item.tag || 'Tier',
    },
  },
  defaultProps: {
    tiers: [
      TIER('Pebble', '1–4', 'Surviving.', 'Manual, reactive, held together by heroics. The work gets done, but it costs hours nobody is counting.', 'Manual, Reactive, Siloed'),
      TIER('Plateau', '5–7', 'Organised.', 'Process exists, some automation has landed, things are improving. But momentum stalls without a clear next move.', 'Structured, Automating, Improving'),
      TIER('Peak', '8–10', 'Compounding.', 'Intelligent, integrated, ahead of the curve. Every system feeds the next and the gains stack on themselves.', 'Intelligent, Compounding, Ahead'),
    ],
  },
  render: (props) => <MaturityMap {...props} />,
};

export default MaturityMap;
