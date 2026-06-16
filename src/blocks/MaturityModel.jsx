import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';
import { safeHref } from '../lib/safe-url.js';

// MaturityModel: method.html's "We meet you where you are." section — a row of three graduated tier
// cards (Surviving / Organised / Compounding, lime tint deepening) over a four-up band of score
// phases (Lagger..Pioneer), closing on a ghost link to the climb. Faithful port of .tier-row + .phases.
const clampN = (i, n) => Math.min(i + 1, n);

export function MaturityModel({ kicker, heading, body, tiers = [], phases = [], ctaLabel, ctaHref = '#' }) {
  const ref = useReveal([tiers.length, phases.length]);
  return (
    <section ref={ref} className="b-mat">
      <div className="wrap">
        {kicker ? <span className="kicker b-mat-kicker" data-reveal>{kicker}</span> : null}
        {heading ? <h2 className="b-mat-head" data-reveal>{heading}</h2> : null}
        {body ? <p className="b-mat-lead" data-reveal>{body}</p> : null}

        <div className="b-mat-tiers">
          {tiers.map((t, i) => (
            <div className={'b-mat-tier t' + clampN(i, 3)} data-reveal style={{ transitionDelay: `${i * 80}ms` }} key={i}>
              <h3>{t.label}</h3>
              <p>{t.body}</p>
            </div>
          ))}
        </div>

        <div className="b-mat-phases">
          {phases.map((p, i) => (
            <div className={'b-mat-phase p' + clampN(i, 4)} data-reveal style={{ transitionDelay: `${i * 70}ms` }} key={i}>
              <span className="b-mat-pscore">{p.score}</span>
              <h4>{p.label}</h4>
              <p>{p.body}</p>
            </div>
          ))}
        </div>

        {ctaLabel ? (
          <div className="b-mat-cta" data-reveal>
            <a className="b-cta ghost" href={safeHref(ctaHref)}>{ctaLabel}<Arrow /></a>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export const css = `
.b-mat{padding:clamp(48px,7vh,90px) 0;position:relative;text-align:center}
.b-mat-head{margin-top:12px;font-size:clamp(1.7rem,3.6vw,2.7rem);font-weight:900;letter-spacing:-.025em}
.b-mat-lead{margin:16px auto 0;max-width:60ch;color:var(--gs-text-muted);font-size:clamp(1rem,1.4vw,1.16rem);line-height:1.7}
.b-mat-tiers{margin-top:clamp(30px,5vw,48px);display:grid;grid-template-columns:repeat(3,1fr);gap:16px;text-align:left}
.b-mat-tier{padding:28px;border-radius:18px;border:1px solid var(--gs-border-soft)}
.b-mat-tier.t1{background:rgba(255,255,255,.025)}
.b-mat-tier.t2{background:rgba(200,255,0,.045)}
.b-mat-tier.t3{background:rgba(200,255,0,.09);border-color:var(--gs-border)}
.b-mat-tier h3{font-size:clamp(1.2rem,1.9vw,1.5rem);font-weight:800;margin:.3em 0}
.b-mat-tier p{color:var(--gs-text-muted);font-size:.96rem;line-height:1.6}
.b-mat-phases{margin-top:18px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.b-mat-phase{padding:18px;border-radius:14px;border:1px solid var(--gs-border-soft);text-align:center}
.b-mat-phase.p1{background:rgba(255,255,255,.02)}
.b-mat-phase.p2{background:rgba(200,255,0,.03)}
.b-mat-phase.p3{background:rgba(200,255,0,.06)}
.b-mat-phase.p4{background:rgba(200,255,0,.10);border-color:var(--gs-border)}
.b-mat-pscore{display:block;font-size:.7rem;font-weight:800;letter-spacing:.12em;color:var(--gs-text-faint);text-transform:uppercase}
.b-mat-phase h4{margin:.45em 0 .35em;font-size:1.08rem;font-weight:800}
.b-mat-phase p{color:var(--gs-text-faint);font-size:.82rem;line-height:1.5}
.b-mat-cta{margin-top:clamp(28px,4vw,40px)}
@media(max-width:760px){.b-mat-tiers{grid-template-columns:1fr}.b-mat-phases{grid-template-columns:repeat(2,1fr)}}
`;

export const puck = {
  label: 'Maturity model',
  fields: {
    kicker: { type: 'text', label: 'Kicker', contentEditable: true },
    heading: { type: 'text', label: 'Heading', contentEditable: true },
    body: { type: 'textarea', label: 'Intro', contentEditable: true },
    tiers: {
      type: 'array', label: 'Tiers (3)',
      arrayFields: { label: { type: 'text', label: 'Label' }, body: { type: 'textarea', label: 'Description' } },
      defaultItemProps: { label: 'Tier', body: 'What this tier looks like.' },
      getItemSummary: (i) => i.label || 'Tier',
    },
    phases: {
      type: 'array', label: 'Phases (4)',
      arrayFields: { score: { type: 'text', label: 'Score range' }, label: { type: 'text', label: 'Label' }, body: { type: 'textarea', label: 'Description' } },
      defaultItemProps: { score: '0 – 0', label: 'Phase', body: 'A short line.' },
      getItemSummary: (i) => i.label || 'Phase',
    },
    ctaLabel: { type: 'text', label: 'Ghost button label (optional)' },
    ctaHref: { type: 'text', label: 'Ghost button link' },
  },
  defaultProps: {
    kicker: 'Pebble · Plateau · Peak',
    heading: 'We meet you where you are.',
    body: 'Your eight scores place you on the mountain. We start the climb from there: no vanity scores, no theatre.',
    tiers: [
      { label: 'Surviving', body: 'Manual, reactive, held together by your best people doing work that isn’t theirs.' },
      { label: 'Organised', body: 'Systems in place, some automation, improving, but the gains have stopped compounding.' },
      { label: 'Compounding', body: 'Intelligent, ahead of the market, where every improvement makes the next one easier.' },
    ],
    phases: [
      { score: 'Under 3', label: 'Lagger', body: 'Falling behind the pace of the field.' },
      { score: '3 – 5', label: 'Follower', body: 'Keeping up, but rarely setting the terms.' },
      { score: '6 – 8', label: 'Leader', body: 'Out in front, with room still to press.' },
      { score: '9 – 10', label: 'Pioneer', body: 'Defining what the rest of the field chases.' },
    ],
    ctaLabel: 'See the full climb', ctaHref: '#go/climb',
  },
  render: (props) => <MaturityModel {...props} />,
};

export default MaturityModel;
