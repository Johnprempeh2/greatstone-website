import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';
import { safeHref, safeMailto } from '../lib/safe-url.js';

// The close: a single, calm invitation. One primary action, one email, nothing else
// competing. The first step costs nothing — say so and stop.
export function Invite({ eyebrow, headline, highlight, body, ctaLabel, ctaHref = '#', ctaLabel2, ctaHref2 = '#', email, variant = 'aurora' }) {
  const ref = useReveal();
  const framed = variant === 'framed';
  const inner = (
    <>
      {eyebrow ? <span className="kicker" data-reveal>{eyebrow}</span> : null}
      <h2 data-reveal>{headline} {highlight ? <span className="accent">{highlight}</span> : null}</h2>
      {body ? <p className="b-invite-body" data-reveal>{body}</p> : null}
      <div className="b-invite-actions" data-reveal>
        {ctaLabel ? <a className="b-cta" href={safeHref(ctaHref)}>{ctaLabel}<Arrow /></a> : null}
        {ctaLabel2 ? <a className="b-cta ghost" href={safeHref(ctaHref2)}>{ctaLabel2}</a> : null}
        {email ? <a className="b-invite-email" href={safeMailto(email)}>{email}</a> : null}
      </div>
    </>
  );
  return (
    <section ref={ref} className={'b-invite' + (framed ? ' b-invite-framed' : '')} id="invite">
      {framed ? null : <div className="b-invite-aurora" aria-hidden="true" />}
      {framed
        ? <div className="wrap"><div className="b-invite-card">{inner}</div></div>
        : <div className="wrap b-invite-inner">{inner}</div>}
    </section>
  );
}

export const css = `
.b-invite{position:relative;overflow:hidden;text-align:center;padding:clamp(80px,14vw,180px) 0}
.b-invite-aurora{position:absolute;inset:-30%;z-index:0;pointer-events:none;
  background:radial-gradient(40% 50% at 50% 40%,rgba(27,80,57,.5),transparent 70%),radial-gradient(30% 40% at 50% 60%,rgba(200,255,0,.1),transparent 70%);
  filter:blur(10px);animation:gsDrift 26s var(--gs-ease) infinite alternate}
@media(prefers-reduced-motion:reduce){.b-invite-aurora{animation:none}}
.b-invite-inner{position:relative;z-index:1;max-width:820px;margin-inline:auto}
.b-invite h2{margin-top:14px;font-size:clamp(2.2rem,6vw,4rem);font-weight:900;line-height:1.0;letter-spacing:-.035em;color:#fff}
.b-invite-body{margin:22px auto 0;max-width:54ch;color:var(--gs-muted);font-size:clamp(1.02rem,1.6vw,1.22rem);line-height:1.7}
.b-invite-actions{margin-top:clamp(30px,5vw,46px);display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:16px}
.b-invite-email{font-size:.94rem;font-weight:700;color:var(--gs-text);border-bottom:1px solid var(--gs-border);padding-bottom:3px;
  transition:color .25s var(--gs-ease),border-color .25s var(--gs-ease)}
.b-invite-email:hover{color:var(--gs-accent);border-color:var(--gs-accent)}
/* framed variant: a contained bordered card (the live method .cta-band), no full-bleed aurora */
.b-invite-framed{padding:clamp(48px,9vw,110px) 0}
.b-invite-card{position:relative;max-width:880px;margin-inline:auto;text-align:center;overflow:hidden;
  border:1px solid var(--gs-border);border-radius:26px;background:var(--gs-accent-soft);
  padding:clamp(40px,6vw,72px);backdrop-filter:blur(10px)}
.b-invite-card::before{content:"";position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(600px 320px at 50% -20%,var(--gs-accent-dim),transparent 70%)}
.b-invite-card>*{position:relative;z-index:1}
.b-invite-card h2{font-size:clamp(1.8rem,4.4vw,3.1rem)}
.b-invite-card .b-invite-body{max-width:46ch}
`;

export const puck = {
  label: 'Invite (closing CTA)',
  fields: {
    eyebrow: { type: 'text', label: 'Eyebrow', contentEditable: true },
    headline: { type: 'text', label: 'Headline', contentEditable: true },
    highlight: { type: 'text', label: 'Highlighted word', contentEditable: true },
    body: { type: 'textarea', label: 'Body', contentEditable: true },
    ctaLabel: { type: 'text', label: 'Primary button label' },
    ctaHref: { type: 'text', label: 'Primary button link' },
    ctaLabel2: { type: 'text', label: 'Ghost button label (optional)' },
    ctaHref2: { type: 'text', label: 'Ghost button link' },
    email: { type: 'text', label: 'Contact email (optional)' },
    variant: { type: 'radio', label: 'Style', options: [
      { label: 'Full-bleed (aurora)', value: 'aurora' }, { label: 'Framed card', value: 'framed' },
    ]},
  },
  defaultProps: {
    eyebrow: 'Start the Conversation',
    headline: 'The first step', highlight: 'costs nothing.',
    body: 'A Deep Dive: we learn your business and map what’s holding it back. If your organisation should work better than it does, talk to us.',
    ctaLabel: 'Book a Deep Dive', ctaHref: '#book', ctaLabel2: '', ctaHref2: '#', email: '', variant: 'aurora',
  },
  render: (props) => <Invite {...props} />,
};

export default Invite;
