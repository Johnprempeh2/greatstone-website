import { useState, useId, useEffect } from 'react';
import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';
import { resolveLink } from '../lib/link-resolver.mjs';
import { LinkField } from '../cms/LinkField.jsx';

// The time-savings calculator the rest of the site advertises ("45 seconds to see the hours your
// business is quietly losing"). Three honest inputs → the hours and money draining each year, live.
// Pure arithmetic, no backend. Every label + default + the working-weeks assumption is Puck-editable;
// the result is an aria-live region so screen readers hear it update. Caps inputs so the maths stays sane.
const clampNum = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo; };
const fmtInt = (n) => Math.round(n).toLocaleString('en-GB');

// Defined at MODULE scope (not inside the component) so its identity is stable across renders. A
// component declared inline would remount every keystroke and the number input would lose focus.
function Field({ id, label, value, set, suffix, min, max, step = 1 }) {
  return (
    <label className="b-tsc-field" htmlFor={id}>
      <span className="b-tsc-flabel">{label}</span>
      <span className="b-tsc-fwrap">
        {suffix && suffix.before ? <span className="b-tsc-affix" aria-hidden="true">{suffix.before}</span> : null}
        <input id={id} className="b-tsc-input" type="number" inputMode="numeric" min={min} max={max} step={step}
          value={value} onChange={(e) => set(e.target.value)}
          onBlur={() => set(String(clampNum(value, min, max)))} />
        {suffix && suffix.after ? <span className="b-tsc-affix" aria-hidden="true">{suffix.after}</span> : null}
      </span>
    </label>
  );
}

export function TimeSavingsCalculator({
  kicker, heading, intro, teamLabel, hoursLabel, costLabel,
  defaultTeam = 12, defaultHours = 5, defaultCost = 30, weeksPerYear = 46, currency = '£',
  resultLead, ctaLabel, ctaHref = '#book', footnote,
}) {
  const ref = useReveal();
  const uid = useId();
  const [team, setTeam] = useState(defaultTeam);
  const [hours, setHours] = useState(defaultHours);
  const [cost, setCost] = useState(defaultCost);
  // Keep the live inputs in step with the editable defaults: in the Puck editor, changing a "Default …"
  // field re-renders this block WITHOUT remounting (the iframe is disabled), so without this the preview
  // would keep the stale initial value. For a public visitor the props never change, so this is a no-op.
  useEffect(() => { setTeam(defaultTeam); }, [defaultTeam]);
  useEffect(() => { setHours(defaultHours); }, [defaultHours]);
  useEffect(() => { setCost(defaultCost); }, [defaultCost]);

  const t = clampNum(team, 1, 100000);
  const h = clampNum(hours, 0, 80);
  const c = clampNum(cost, 0, 100000);
  const w = clampNum(weeksPerYear, 1, 52);
  const hoursYr = t * h * w;
  const costYr = hoursYr * c;

  return (
    <section ref={ref} className="b-tsc">
      <div className="wrap b-tsc-wrap">
        <div className="b-tsc-head" data-reveal>
          {kicker ? <span className="kicker">{kicker}</span> : null}
          {heading ? <h2 className="h2 b-tsc-h">{heading}</h2> : null}
          {intro ? <p className="b-tsc-intro muted">{intro}</p> : null}
        </div>
        <div className="b-tsc-grid" data-reveal>
          <div className="b-tsc-inputs">
            <Field id={uid + 't'} label={teamLabel} value={team} set={setTeam} min={1} max={100000} suffix={{ after: 'people' }} />
            <Field id={uid + 'h'} label={hoursLabel} value={hours} set={setHours} min={0} max={80} suffix={{ after: 'hrs / wk' }} />
            <Field id={uid + 'c'} label={costLabel} value={cost} set={setCost} min={0} max={100000} suffix={{ before: currency, after: '/ hr' }} />
          </div>
          <div className="b-tsc-result">
            {/* the visual figures are aria-hidden; a single concise live region announces the result so a
                screen reader hears one tidy sentence on change, not the whole multi-line block per keystroke.
                The CTA sits OUTSIDE any live region so it is never re-announced as the numbers update. */}
            <div className="b-tsc-rlead" aria-hidden="true">{resultLead}</div>
            <div className="b-tsc-rbig" aria-hidden="true"><b>{fmtInt(hoursYr)}</b> <span>hours a year</span></div>
            <div className="b-tsc-rmoney" aria-hidden="true">about <b>{currency}{fmtInt(costYr)}</b> in time, every year</div>
            <p className="gs-sr-only" role="status" aria-live="polite">{resultLead} {fmtInt(hoursYr)} hours a year, about {currency}{fmtInt(costYr)} in time.</p>
            {ctaLabel ? <a className="b-cta b-tsc-cta" {...resolveLink(ctaHref)}>{ctaLabel}<Arrow /></a> : null}
          </div>
        </div>
        {footnote ? <p className="b-tsc-foot" data-reveal>{footnote}</p> : null}
      </div>
    </section>
  );
}

export const css = `
.b-tsc{padding:clamp(56px,9vw,110px) 0;position:relative}
.b-tsc-wrap{max-width:960px}
.b-tsc-head{margin-bottom:clamp(22px,4vw,40px);max-width:640px}
.b-tsc-h{font-size:clamp(1.5rem,3.4vw,2.4rem);font-weight:800;letter-spacing:-.02em;line-height:1.06;margin-top:.5rem}
.b-tsc-intro{margin-top:.7rem;color:var(--gs-text-muted);line-height:1.7}
.b-tsc-grid{display:grid;grid-template-columns:1fr 1fr;gap:clamp(20px,3.4vw,44px);align-items:stretch}
@media(max-width:760px){.b-tsc-grid{grid-template-columns:1fr}}
.b-tsc-inputs{display:flex;flex-direction:column;gap:18px;justify-content:center}
.b-tsc-field{display:flex;flex-direction:column;gap:8px}
.b-tsc-flabel{font-size:.78rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--gs-text-muted)}
.b-tsc-fwrap{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.03);border:1px solid var(--gs-border-soft);border-radius:12px;padding:4px 14px;transition:border-color .2s var(--gs-ease)}
.b-tsc-fwrap:focus-within{border-color:var(--gs-accent-mid,rgba(200,255,0,.4));box-shadow:0 0 0 3px var(--gs-accent-dim,rgba(200,255,0,.12))}
.b-tsc-input{flex:1;min-width:0;background:none;border:0;outline:0;color:var(--gs-text);font-family:'Montserrat',sans-serif;font-size:1.3rem;font-weight:800;padding:12px 0;font-variant-numeric:tabular-nums}
.b-tsc-affix{flex:none;font-size:.84rem;font-weight:600;color:var(--gs-text-faint);white-space:nowrap}
.b-tsc-result{display:flex;flex-direction:column;justify-content:center;gap:8px;padding:clamp(24px,3vw,36px);border-radius:16px;
  background:linear-gradient(180deg,rgba(200,255,0,.07),rgba(255,255,255,.015));border:1px solid var(--gs-border);
  box-shadow:0 24px 70px -38px rgba(200,255,0,.22)}
.b-tsc-rlead{font-size:.78rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--gs-accent)}
.b-tsc-rbig{line-height:1}
.b-tsc-rbig b{font-size:clamp(2.6rem,7vw,4rem);font-weight:900;letter-spacing:-.03em;color:var(--gs-accent);font-variant-numeric:tabular-nums}
.b-tsc-rbig span{display:block;margin-top:6px;font-size:.92rem;font-weight:700;color:var(--gs-text)}
.b-tsc-rmoney{margin-top:6px;color:var(--gs-text-muted);font-size:.98rem}
.b-tsc-rmoney b{color:var(--gs-text);font-variant-numeric:tabular-nums}
.b-tsc-cta{margin-top:16px;align-self:flex-start}
.b-tsc-foot{margin-top:18px;font-size:.8rem;color:var(--gs-text-faint);max-width:70ch;line-height:1.6}
/* hide the native number spinners for a cleaner figure */
.b-tsc-input::-webkit-outer-spin-button,.b-tsc-input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.b-tsc-input[type=number]{-moz-appearance:textfield}
`;

export const puck = {
  label: 'Time-savings calculator',
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
    currency: { type: 'text', label: 'Currency symbol' },
    resultLead: { type: 'text', label: 'Result lead', contentEditable: true },
    ctaLabel: { type: 'text', label: 'CTA label' },
    ctaHref: { type: 'custom', label: 'CTA link', render: (props) => <LinkField {...props} /> },
    footnote: { type: 'textarea', label: 'Footnote', contentEditable: true },
  },
  defaultProps: {
    kicker: 'The cost of the status quo',
    heading: 'See the hours you are quietly losing.',
    intro: 'A rough, honest estimate in seconds. Move the numbers to match your team, and watch what the week is costing you across a year.',
    teamLabel: 'People affected',
    hoursLabel: 'Hours lost per person, per week',
    costLabel: 'Average hourly cost',
    defaultTeam: 12, defaultHours: 5, defaultCost: 30, weeksPerYear: 46, currency: '£',
    resultLead: 'That is roughly',
    ctaLabel: 'Book a Diagnostic',
    ctaHref: '#book',
    footnote: 'A guide, not a quote. The Diagnostic replaces these round numbers with your real ones, then shows exactly where the hours go and where we buy them back.',
  },
  render: (props) => <TimeSavingsCalculator {...props} />,
};

export default TimeSavingsCalculator;
