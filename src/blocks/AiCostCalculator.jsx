import { useState, useId, useEffect, useMemo, useCallback } from 'react';
import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';
import { resolveLink } from '../lib/link-resolver.mjs';
import { track } from '../lib/analytics.js';

// The AI Cost Calculator lead magnet (Ben + John, 1 Jul marketing session — "how much money am I leaving
// on the table"). Three honest inputs show what the manual work costs each year (the hook, live and
// ungated); to see how much AI could recover and take an estimate away, the visitor gives name/company/email
// (the value exchange). Pure frontend: the arithmetic and the CSV are built client-side, the only side
// effect is a generate_lead analytics event (dormant until GTM is set). No backend. Dovetails with the
// AI Baseline Survey.

const clampNum = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo; };
const fmtInt = (n) => Math.round(n).toLocaleString('en-GB');

// Module scope so its identity is stable across renders (an inline component remounts each keystroke and
// the number input loses focus).
function Field({ id, label, value, set, suffix, min, max }) {
  return (
    <label className="b-acc-field" htmlFor={id}>
      <span className="b-acc-flabel">{label}</span>
      <span className="b-acc-fwrap">
        {suffix && suffix.before ? <span className="b-acc-affix" aria-hidden="true">{suffix.before}</span> : null}
        <input id={id} className="b-acc-input" type="number" inputMode="numeric" min={min} max={max}
          value={value} onChange={(e) => set(e.target.value)} onBlur={() => set(String(clampNum(value, min, max)))} />
        {suffix && suffix.after ? <span className="b-acc-affix" aria-hidden="true">{suffix.after}</span> : null}
      </span>
    </label>
  );
}

export function AiCostCalculator({
  kicker, heading, intro, teamLabel, hoursLabel, costLabel,
  defaultTeam = 12, defaultHours = 6, defaultCost = 32, weeksPerYear = 46, currency = '£',
  recoveryPct = 55, onTheTableLead, savingsLead, gateHeading, gateBody, ctaLabel, ctaHref = '#book', footnote,
}) {
  const ref = useReveal();
  const uid = useId();
  const [team, setTeam] = useState(defaultTeam);
  const [hours, setHours] = useState(defaultHours);
  const [cost, setCost] = useState(defaultCost);
  const [lead, setLead] = useState({ name: '', company: '', email: '' });
  const [unlocked, setUnlocked] = useState(false);
  const [err, setErr] = useState('');
  // keep live inputs in step with editable defaults in the Puck editor (no remount there); no-op for visitors
  useEffect(() => { setTeam(defaultTeam); }, [defaultTeam]);
  useEffect(() => { setHours(defaultHours); }, [defaultHours]);
  useEffect(() => { setCost(defaultCost); }, [defaultCost]);

  const { hoursYr, costYr, saving, pct } = useMemo(() => {
    const t = clampNum(team, 1, 100000), h = clampNum(hours, 0, 80), c = clampNum(cost, 0, 100000);
    const w = clampNum(weeksPerYear, 1, 52), p = clampNum(recoveryPct, 0, 90);
    const hy = t * h * w;
    const cy = hy * c;
    return { hoursYr: hy, costYr: cy, saving: cy * (p / 100), pct: p };
  }, [team, hours, cost, weeksPerYear, recoveryPct]);

  const submitGate = (e) => {
    e.preventDefault();
    const name = lead.name.trim(), company = lead.company.trim(), email = lead.email.trim();
    if (!name || !company || !/.+@.+\..+/.test(email)) { setErr('Please add your name, company and a valid email.'); return; }
    setErr('');
    track('generate_lead', { form: 'ai_cost_calc' });
    setUnlocked(true);
  };

  const downloadEstimate = useCallback(() => {
    const cell = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = [
      ['Greatstone AI Cost Estimate'],
      ['Name', lead.name], ['Company', lead.company],
      [],
      ['People affected', clampNum(team, 1, 100000)],
      ['Hours lost per person per week', clampNum(hours, 0, 80)],
      ['Average hourly cost', currency + fmtInt(clampNum(cost, 0, 100000))],
      ['Working weeks per year', clampNum(weeksPerYear, 1, 52)],
      [],
      ['Hours on manual work per year', fmtInt(hoursYr)],
      ['Cost of that work per year', currency + fmtInt(costYr)],
      ['Estimated AI recovery rate', pct + '%'],
      ['Estimated AI saving per year', currency + fmtInt(saving)],
      [],
      ['A guide, not a quote. The Diagnostic replaces these round numbers with your real ones.'],
    ];
    try {
      const blob = new Blob(['﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'greatstone-ai-cost-estimate.csv';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) { /* download unsupported — the on-screen figures still stand */ }
  }, [lead, team, hours, cost, weeksPerYear, hoursYr, costYr, saving, pct, currency]);

  return (
    <section ref={ref} className="b-acc">
      <div className="wrap b-acc-wrap">
        <div className="b-acc-head" data-reveal>
          {kicker ? <span className="kicker">{kicker}</span> : null}
          {heading ? <h2 className="h2 b-acc-h">{heading}</h2> : null}
          {intro ? <p className="b-acc-intro muted">{intro}</p> : null}
        </div>
        <div className="b-acc-grid" data-reveal>
          <div className="b-acc-inputs">
            <Field id={uid + 't'} label={teamLabel} value={team} set={setTeam} min={1} max={100000} suffix={{ after: 'people' }} />
            <Field id={uid + 'h'} label={hoursLabel} value={hours} set={setHours} min={0} max={80} suffix={{ after: 'hrs / wk' }} />
            <Field id={uid + 'c'} label={costLabel} value={cost} set={setCost} min={0} max={100000} suffix={{ before: currency, after: '/ hr' }} />
          </div>

          <div className="b-acc-result">
            {/* the hook — live + ungated: what the manual work costs each year */}
            <div className="b-acc-rlead" aria-hidden="true">{onTheTableLead}</div>
            <div className="b-acc-rbig" aria-hidden="true"><b>{currency}{fmtInt(costYr)}</b> <span>a year, on the table</span></div>
            <p className="gs-sr-only" role="status" aria-live="polite">{onTheTableLead} {currency}{fmtInt(costYr)} a year, about {fmtInt(hoursYr)} hours of manual work.</p>

            {unlocked ? (
              <div className="b-acc-reveal">
                <div className="b-acc-saving">
                  <span className="b-acc-slead">{savingsLead}</span>
                  <span className="b-acc-sbig">{currency}{fmtInt(saving)}<span> a year</span></span>
                  <span className="b-acc-snote">Based on recovering about {pct}% of that manual effort with AI.</span>
                </div>
                <div className="b-acc-actions">
                  {ctaLabel ? <a className="b-cta b-acc-cta" {...resolveLink(ctaHref)}>{ctaLabel}<Arrow /></a> : null}
                  <button type="button" className="b-acc-dl" onClick={downloadEstimate}>Download your estimate</button>
                </div>
              </div>
            ) : (
              <form className="b-acc-gate" onSubmit={submitGate} noValidate>
                <p className="b-acc-gate-h">{gateHeading}</p>
                <p className="b-acc-gate-b muted">{gateBody}</p>
                <div className="b-acc-gfield"><label htmlFor={uid + 'n'}>Your name</label><input id={uid + 'n'} value={lead.name} onChange={(e) => setLead((l) => ({ ...l, name: e.target.value }))} autoComplete="name" /></div>
                <div className="b-acc-gfield"><label htmlFor={uid + 'co'}>Company</label><input id={uid + 'co'} value={lead.company} onChange={(e) => setLead((l) => ({ ...l, company: e.target.value }))} autoComplete="organization" /></div>
                <div className="b-acc-gfield"><label htmlFor={uid + 'e'}>Work email</label><input id={uid + 'e'} type="email" value={lead.email} onChange={(e) => setLead((l) => ({ ...l, email: e.target.value }))} autoComplete="email" /></div>
                {err ? <div className="b-acc-err" role="alert">{err}</div> : null}
                <button type="submit" className="b-cta b-acc-unlock">Show what AI could save<Arrow /></button>
              </form>
            )}
          </div>
        </div>
        {footnote ? <p className="b-acc-foot" data-reveal>{footnote}</p> : null}
      </div>
    </section>
  );
}

export const css = `
.b-acc{padding:clamp(56px,9vw,110px) 0;position:relative}
.b-acc-wrap{max-width:960px}
.b-acc-head{margin-bottom:clamp(22px,4vw,40px);max-width:640px}
.b-acc-h{font-size:clamp(1.5rem,3.4vw,2.4rem);font-weight:800;letter-spacing:-.02em;line-height:1.06;margin-top:.5rem}
.b-acc-intro{margin-top:.7rem;color:var(--gs-text-muted);line-height:1.7}
.b-acc-grid{display:grid;grid-template-columns:1fr 1fr;gap:clamp(20px,3.4vw,44px);align-items:stretch}
@media(max-width:760px){.b-acc-grid{grid-template-columns:1fr}}
.b-acc-inputs{display:flex;flex-direction:column;gap:18px;justify-content:center}
.b-acc-field{display:flex;flex-direction:column;gap:8px}
.b-acc-flabel{font-size:.78rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--gs-text-muted)}
.b-acc-fwrap{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.03);border:1px solid var(--gs-border-soft);border-radius:12px;padding:4px 14px;transition:border-color .2s var(--gs-ease,ease)}
.b-acc-fwrap:focus-within{border-color:var(--gs-accent-mid,rgba(200,255,0,.4));box-shadow:0 0 0 3px var(--gs-accent-dim,rgba(200,255,0,.12))}
.b-acc-input{flex:1;min-width:0;background:none;border:0;outline:0;color:var(--gs-text);font-family:'Montserrat',sans-serif;font-size:1.3rem;font-weight:800;padding:12px 0;font-variant-numeric:tabular-nums}
.b-acc-input::-webkit-outer-spin-button,.b-acc-input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.b-acc-input[type=number]{-moz-appearance:textfield}
.b-acc-affix{flex:none;font-size:.84rem;font-weight:600;color:var(--gs-text-faint);white-space:nowrap}
.b-acc-result{display:flex;flex-direction:column;justify-content:center;gap:8px;padding:clamp(24px,3vw,36px);border-radius:16px;
  background:linear-gradient(180deg,rgba(200,255,0,.07),rgba(255,255,255,.015));border:1px solid var(--gs-border);box-shadow:0 24px 70px -38px rgba(200,255,0,.22)}
.b-acc-rlead{font-size:.78rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--gs-text-faint)}
.b-acc-rbig{line-height:1}
.b-acc-rbig b{font-size:clamp(2.2rem,6vw,3.4rem);font-weight:900;letter-spacing:-.03em;color:var(--gs-text);font-variant-numeric:tabular-nums}
.b-acc-rbig span{display:block;margin-top:6px;font-size:.9rem;font-weight:700;color:var(--gs-text-muted)}
/* gate */
.b-acc-gate{margin-top:18px;border-top:1px solid var(--gs-border-soft);padding-top:18px;display:flex;flex-direction:column;gap:10px}
.b-acc-gate-h{font-weight:800;font-size:1rem}
.b-acc-gate-b{font-size:.86rem;margin-top:-4px}
.b-acc-gfield{display:flex;flex-direction:column;gap:5px}
.b-acc-gfield label{font-size:.72rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--gs-text-muted)}
.b-acc-gfield input{width:100%;font-family:inherit;font-size:.95rem;color:var(--gs-text);background:rgba(255,255,255,.03);border:1px solid var(--gs-border-soft);border-radius:9px;padding:.65em .8em;transition:border-color .2s var(--gs-ease,ease),box-shadow .2s var(--gs-ease,ease)}
.b-acc-gfield input:focus{outline:none;border-color:var(--gs-accent-mid,rgba(200,255,0,.4));box-shadow:0 0 0 3px var(--gs-accent-dim,rgba(200,255,0,.12))}
.b-acc-err{background:rgba(255,107,107,.12);border:1px solid rgba(255,107,107,.4);color:#ffb3b3;padding:.6em .9em;border-radius:9px;font-size:.82rem}
.b-acc-unlock{margin-top:4px;width:100%;justify-content:center}
/* reveal */
.b-acc-saving{display:flex;flex-direction:column;gap:4px;margin-top:16px;padding-top:16px;border-top:1px solid var(--gs-border-soft)}
.b-acc-slead{font-size:.78rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--gs-accent)}
.b-acc-sbig{font-size:clamp(2.4rem,7vw,3.8rem);font-weight:900;letter-spacing:-.03em;color:var(--gs-accent);font-variant-numeric:tabular-nums;line-height:1}
.b-acc-sbig span{font-size:.9rem;font-weight:700;color:var(--gs-text);margin-left:6px}
.b-acc-snote{font-size:.82rem;color:var(--gs-text-muted)}
.b-acc-actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:18px}
.b-acc-dl{background:none;border:1px solid var(--gs-border-strong,rgba(200,255,0,.18));color:var(--gs-text);font:inherit;font-size:.88rem;font-weight:700;cursor:pointer;border-radius:100px;padding:.65em 1.1em;transition:border-color .2s var(--gs-ease,ease)}
.b-acc-dl:hover{border-color:var(--gs-accent)}
.b-acc-foot{margin-top:18px;font-size:.8rem;color:var(--gs-text-faint);max-width:70ch;line-height:1.6}
@media(prefers-reduced-motion:reduce){.b-acc-fwrap{transition:none}}
`;

export const puck = {
  label: 'AI Cost Calculator (lead magnet)',
  fields: {
    kicker: { type: 'text', label: 'Kicker', contentEditable: true },
    heading: { type: 'text', label: 'Heading', contentEditable: true },
    intro: { type: 'textarea', label: 'Intro', contentEditable: true },
    teamLabel: { type: 'text', label: 'Team-size field label' },
    hoursLabel: { type: 'text', label: 'Hours-lost field label' },
    costLabel: { type: 'text', label: 'Hourly-cost field label' },
    defaultTeam: { type: 'number', label: 'Default team size' },
    defaultHours: { type: 'number', label: 'Default hours lost / week' },
    defaultCost: { type: 'number', label: 'Default hourly cost' },
    weeksPerYear: { type: 'number', label: 'Working weeks / year' },
    recoveryPct: { type: 'number', label: 'AI recovery rate (%)' },
    currency: { type: 'text', label: 'Currency symbol' },
    onTheTableLead: { type: 'text', label: 'On-the-table lead', contentEditable: true },
    savingsLead: { type: 'text', label: 'Savings lead', contentEditable: true },
    gateHeading: { type: 'text', label: 'Gate heading', contentEditable: true },
    gateBody: { type: 'textarea', label: 'Gate body', contentEditable: true },
    ctaLabel: { type: 'text', label: 'CTA label' },
    ctaHref: { type: 'text', label: 'CTA link' },
    footnote: { type: 'textarea', label: 'Footnote', contentEditable: true },
  },
  defaultProps: {
    kicker: 'The money on the table',
    heading: 'How much could AI save you?',
    intro: 'A rough, honest estimate in seconds. Set the numbers to match your team, see what the manual work costs across a year, then how much of it AI could reasonably recover.',
    teamLabel: 'People affected',
    hoursLabel: 'Hours lost per person, per week',
    costLabel: 'Average hourly cost',
    defaultTeam: 12, defaultHours: 6, defaultCost: 32, weeksPerYear: 46, recoveryPct: 55, currency: '£',
    onTheTableLead: 'That work costs you',
    savingsLead: 'AI could recover about',
    gateHeading: 'See what AI could save you',
    gateBody: 'Tell us where to send your estimate and we will show the figure. No spam, no obligation.',
    ctaLabel: 'Book a diagnostic',
    ctaHref: '#book',
    footnote: 'A guide, not a quote. The Diagnostic replaces these round numbers with your real ones, then shows exactly which work AI should take first and what it gives back.',
  },
  render: (props) => <AiCostCalculator {...props} />,
};

export default AiCostCalculator;
