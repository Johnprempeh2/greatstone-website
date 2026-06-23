// Per-client digital-maturity radar (#org). Plots the company's eight-pillar scores against an
// anonymised industry benchmark and the target tier the engagement is climbing to. Reads the latest
// row from Supabase `maturity_assessments`; while migration 0019 stays dormant that table does not
// exist, so the read resolves to nothing and we fall back to a seeded prototype for the demo company
// only (Ethical Quest) — every other company sees a tasteful empty state, never a blank/broken panel
// and never another company's numbers. The SVG is paired with a visually-hidden data table and a
// text legend so nothing is conveyed by colour or shape alone; entrance motion honours reduced-motion.
import React, { useState, useEffect, useMemo } from 'react';
import { PILLARS, SCALE_MAX, tierOf, tierLabel, overallOf } from '../data/maturity-seed.mjs';
import { useMaturity } from './useMaturity.mjs';
import './maturity-radar.css';

// ── geometry ──────────────────────────────────────────────────────────────────
const CX = 240, CY = 182, R = 120;
const ang = (i) => (-90 + i * 45) * Math.PI / 180;          // axis i, starting at top, clockwise
const clamp = (v) => Math.max(0, Math.min(SCALE_MAX, Number(v) || 0));
const ptFor = (i, v) => {
  const r = (clamp(v) / SCALE_MAX) * R, a = ang(i);
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
};
const polyFor = (scores) => PILLARS.map((p, i) => ptFor(i, scores ? scores[p.key] : 0).map(n => n.toFixed(1)).join(',')).join(' ');
// label position just outside the ring, anchored so text grows away from the chart
const labelPos = (i) => {
  const a = ang(i), cos = Math.cos(a), sin = Math.sin(a);
  const x = CX + (R + 16) * cos, y = CY + (R + 16) * sin;
  const anchor = cos > 0.25 ? 'start' : cos < -0.25 ? 'end' : 'middle';
  const dy = sin > 0.25 ? 12 : sin < -0.25 ? -4 : 4;
  return { x, y: y + dy, anchor };
};
const prefersReduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function MaturityRadar({ company }) {
  const state = useMaturity(company); // shared with the "Your next move" card

  if (state.status === 'loading') return (
    <section className="org-mat" aria-busy="true" aria-labelledby="org-mat-h">
      <div className="org-mat-head"><span className="st-kicker">Digital maturity</span><h2 id="org-mat-h">Your eight-pillar maturity</h2></div>
      <div className="st-skel" style={{ height: 300, borderRadius: 16 }} />
    </section>
  );

  // a row that exists but carries no usable scores (all 0/missing) reads as not-yet-assessed, not "0/10 Pebble"
  const noScores = state.status === 'ready' && overallOf(state.data && state.data.scores) === 0;
  if (state.status === 'empty' || noScores) return (
    <section className="org-mat" aria-labelledby="org-mat-h">
      <div className="org-mat-head"><span className="st-kicker">Digital maturity</span><h2 id="org-mat-h">Your eight-pillar maturity</h2></div>
      <div className="org-mat-empty">
        <div className="org-mat-empty-mark" aria-hidden="true">◬</div>
        <h3>Your maturity baseline is on the way</h3>
        <p>We score every client across the eight pillars, People to Value, then plot you against your industry and the climb ahead. Yours appears here after your first Periscope assessment.</p>
        <a className="gs-btn primary sm" href="#go/contact">Book your assessment</a>
      </div>
    </section>
  );

  return <Radar data={state.data} source={state.source} />;
}

function Radar({ data, source }) {
  const { scores, benchmark, target, baseline } = data;
  const [drawn, setDrawn] = useState(() => prefersReduced());
  useEffect(() => {
    if (drawn) return undefined;
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, [drawn]);

  const overall = overallOf(scores);
  const tier = data.tier || tierOf(overall);
  const baseOverall = baseline ? overallOf(baseline) : null;
  // movement since the discovery baseline (shown only when baseline data is present; degrades silently otherwise)
  const overallDelta = (baseOverall != null && baseOverall > 0 && overall > 0) ? Math.round((overall - baseOverall) * 10) / 10 : null;
  const deltaOf = (key) => (baseline && Number(baseline[key]) > 0) ? clamp(scores[key]) - clamp(baseline[key]) : null;
  const rings = [2, 4, 6, 8, 10];

  // standout pillars: strongest, and the priority climb (lowest), with names
  const { strongest, weakest } = useMemo(() => {
    let hi = null, lo = null;
    for (const p of PILLARS) {
      const v = clamp(scores[p.key]);
      if (!v) continue;
      if (!hi || v > hi.v) hi = { ...p, v };
      if (!lo || v < lo.v) lo = { ...p, v };
    }
    return { strongest: hi, weakest: lo };
  }, [scores]);

  const aLabel = `Eight-pillar digital maturity. Overall ${overall} out of 10, ${tierLabel(tier)}.`
    + (overallDelta > 0 ? ` Up ${overallDelta} since discovery.` : '')
    + (strongest ? ` Strongest: ${strongest.name} at ${strongest.v}.` : '')
    + (weakest ? ` Priority climb: ${weakest.name} at ${weakest.v}.` : '')
    + (benchmark ? ' Shown against the industry benchmark' : '') + (target ? ' and the target tier.' : '.');

  return (
    <section className="org-mat" aria-labelledby="org-mat-h">
      <div className="org-mat-head">
        <div>
          <span className="st-kicker">Digital maturity</span>
          <h2 id="org-mat-h">Your eight-pillar maturity</h2>
          <p className="org-mat-sub">Where you stand today across the Greatstone pillars, against your industry and the climb ahead.</p>
        </div>
        {source === 'sample' && <span className="org-mat-sample" title="Illustrative baseline shown for the demo account">Sample baseline</span>}
      </div>

      <div className="org-mat-grid">
        <div className="org-mat-chartwrap">
          <svg className="org-mat-svg" viewBox="0 0 480 372" role="img" aria-label={aLabel} focusable="false">
            <defs>
              <radialGradient id="orgMatGlow" cx="50%" cy="46%" r="60%">
                <stop offset="0%" stopColor="var(--gs-accent, #c8ff00)" stopOpacity="0.10" />
                <stop offset="100%" stopColor="var(--gs-accent, #c8ff00)" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx={CX} cy={CY} r={R + 2} fill="url(#orgMatGlow)" />
            {/* grid rings */}
            <g className="org-mat-grid-lines">
              {rings.map((lv) => (
                <polygon key={lv} points={PILLARS.map((p, i) => ptFor(i, lv).map(n => n.toFixed(1)).join(',')).join(' ')}
                  fill="none" stroke="rgba(255,255,255,.10)" strokeWidth="1" />
              ))}
              {PILLARS.map((p, i) => { const [x, y] = ptFor(i, SCALE_MAX); return <line key={p.key} x1={CX} y1={CY} x2={x.toFixed(1)} y2={y.toFixed(1)} stroke="rgba(255,255,255,.08)" strokeWidth="1" />; })}
            </g>

            {/* data layer (fades in; reduced-motion renders it final immediately) */}
            <g className={'org-mat-data' + (drawn ? ' is-drawn' : '')}>
              {target && <polygon points={polyFor(target)} fill="none" stroke="var(--gs-purple, #b197fc)" strokeWidth="1.5" strokeDasharray="5 4" strokeLinejoin="round" opacity="0.85" />}
              {benchmark && <polygon points={polyFor(benchmark)} fill="none" stroke="var(--gs-teal, #4ecdc4)" strokeWidth="1.5" strokeLinejoin="round" opacity="0.9" />}
              <polygon points={polyFor(scores)} fill="var(--gs-accent, #c8ff00)" fillOpacity="0.16" stroke="var(--gs-accent, #c8ff00)" strokeWidth="2" strokeLinejoin="round" />
              {PILLARS.map((p, i) => { const [x, y] = ptFor(i, scores[p.key]); return <circle key={p.key} cx={x.toFixed(1)} cy={y.toFixed(1)} r="3.1" fill="var(--gs-accent, #c8ff00)" />; })}
            </g>

            {/* axis labels */}
            <g className="org-mat-axislabels">
              {PILLARS.map((p, i) => { const { x, y, anchor } = labelPos(i); return (
                <text key={p.key} x={x.toFixed(1)} y={y.toFixed(1)} textAnchor={anchor} className="org-mat-axislabel">{p.name}</text>
              ); })}
            </g>
          </svg>
        </div>

        <div className="org-mat-side">
          <div className={'org-mat-badge t-' + tier}>
            <span className="org-mat-badge-tier">{tierLabel(tier)}</span>
            <span className="org-mat-badge-score"><b>{overall}</b><span>/10</span></span>
          </div>
          {overallDelta > 0 && <p className="org-mat-delta">▲ {overallDelta.toFixed(1)} since discovery</p>}
          <p className="org-mat-read">
            You're at <b>{tierLabel(tier)}</b> overall{baseOverall && baseOverall < overall ? <>, up from {tierLabel(tierOf(baseOverall))} ({baseOverall}) at discovery</> : ''}.
            {weakest ? <> The priority climb is <b>{weakest.name}</b>.</> : ''}
          </p>
          <ul className="org-mat-legend">
            <li><span className="org-mat-sw sw-current" aria-hidden="true" />Your maturity</li>
            {benchmark && <li><span className="org-mat-sw sw-bench" aria-hidden="true" />Industry benchmark</li>}
            {target && <li><span className="org-mat-sw sw-target" aria-hidden="true" />Target</li>}
          </ul>
          {strongest && weakest && (
            <div className="org-mat-standouts">
              <div className="org-mat-stand"><span className="org-mat-stand-l">Strongest</span><span className="org-mat-stand-v">{strongest.name} · {strongest.v}{deltaOf(strongest.key) > 0 && <span className="org-mat-up"> ▲{deltaOf(strongest.key)}</span>}</span></div>
              <div className="org-mat-stand"><span className="org-mat-stand-l">Priority climb</span><span className="org-mat-stand-v">{weakest.name} · {weakest.v}{deltaOf(weakest.key) > 0 && <span className="org-mat-up"> ▲{deltaOf(weakest.key)}</span>}</span></div>
            </div>
          )}
          <a className="gs-btn ghost sm org-mat-cta" href="#go/contact">Discuss your roadmap</a>
        </div>
      </div>

      {/* accessible equivalent — the same numbers as the chart, for screen readers */}
      <div className="org-mat-srwrap">
      <table className="org-mat-table">
        <caption>Digital maturity by pillar, scored 1 to 10. Overall {overall}, {tierLabel(tier)}.</caption>
        <thead><tr><th scope="col">Pillar</th><th scope="col">Your score</th>{baseline && <th scope="col">Since discovery</th>}{benchmark && <th scope="col">Industry benchmark</th>}{target && <th scope="col">Target</th>}</tr></thead>
        <tbody>
          {PILLARS.map((p) => (
            <tr key={p.key}>
              <th scope="row">{p.name}</th>
              <td>{clamp(scores[p.key])} ({tierLabel(tierOf(scores[p.key]))})</td>
              {baseline && <td>{deltaOf(p.key) != null ? (deltaOf(p.key) >= 0 ? '+' : '') + deltaOf(p.key) : '—'}</td>}
              {benchmark && <td>{clamp(benchmark[p.key])}</td>}
              {target && <td>{clamp(target[p.key])}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}
