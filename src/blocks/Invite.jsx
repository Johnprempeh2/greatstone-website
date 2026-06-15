import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';

// The close: a single, calm invitation. One primary action, one email, nothing else
// competing. The first step costs nothing — say so and stop.
export function Invite({ eyebrow, headline, highlight, body, ctaLabel, ctaHref = '#', email }) {
  const ref = useReveal();
  return (
    <section ref={ref} className="b-invite" id="invite">
      <div className="b-invite-aurora" aria-hidden="true" />
      <div className="wrap b-invite-inner">
        {eyebrow ? <span className="kicker" data-reveal>{eyebrow}</span> : null}
        <h2 data-reveal>{headline} {highlight ? <span className="accent">{highlight}</span> : null}</h2>
        {body ? <p className="b-invite-body" data-reveal>{body}</p> : null}
        <div className="b-invite-actions" data-reveal>
          {ctaLabel ? <a className="b-cta" href={ctaHref}>{ctaLabel}<Arrow /></a> : null}
          {email ? <a className="b-invite-email" href={`mailto:${email}`}>{email}</a> : null}
        </div>
      </div>
    </section>
  );
}

export const css = `
.b-invite{position:relative;overflow:hidden;text-align:center;padding:clamp(80px,14vw,180px) 0}
.b-invite-aurora{position:absolute;inset:-30%;z-index:0;pointer-events:none;
  background:radial-gradient(40% 50% at 50% 40%,rgba(27,80,57,.5),transparent 70%),radial-gradient(30% 40% at 50% 60%,rgba(200,255,0,.1),transparent 70%);
  filter:blur(10px);animation:gsDrift 26s var(--gs-ease) infinite alternate}
.b-invite-inner{position:relative;z-index:1;max-width:820px;margin-inline:auto}
.b-invite h2{margin-top:14px;font-size:clamp(2.2rem,6vw,4rem);font-weight:900;line-height:1.0;letter-spacing:-.035em;color:#fff}
.b-invite-body{margin:22px auto 0;max-width:54ch;color:var(--gs-muted);font-size:clamp(1.02rem,1.6vw,1.22rem);line-height:1.7}
.b-invite-actions{margin-top:clamp(30px,5vw,46px);display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:26px}
.b-invite-email{font-size:.94rem;font-weight:700;color:var(--gs-text);border-bottom:1px solid var(--gs-border);padding-bottom:3px;
  transition:color .25s var(--gs-ease),border-color .25s var(--gs-ease)}
.b-invite-email:hover{color:var(--gs-accent);border-color:var(--gs-accent)}
`;

export const puck = {
  label: 'Invite (closing CTA)',
  fields: {
    eyebrow: { type: 'text', label: 'Eyebrow', contentEditable: true },
    headline: { type: 'text', label: 'Headline', contentEditable: true },
    highlight: { type: 'text', label: 'Highlighted word', contentEditable: true },
    body: { type: 'textarea', label: 'Body', contentEditable: true },
    ctaLabel: { type: 'text', label: 'Button label' },
    ctaHref: { type: 'text', label: 'Button link' },
    email: { type: 'text', label: 'Contact email' },
  },
  defaultProps: {
    eyebrow: 'Start the Conversation',
    headline: 'The first step', highlight: 'costs nothing.',
    body: 'A Deep Dive: we learn your business and map what’s holding it back. If your organisation should work better than it does, talk to us.',
    ctaLabel: 'Book a Deep Dive', ctaHref: '#book', email: 'dx@greatstonesoftware.co.uk',
  },
  render: (props) => <Invite {...props} />,
};

export default Invite;
