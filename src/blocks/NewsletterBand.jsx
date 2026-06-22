import { useState, useRef, useEffect } from 'react';
import { useReveal } from './reveal.js';
import { track } from '../lib/analytics.js';

// NewsletterBand: insights.html's closing ".signup" — a contained glass card (lime radial glow, blur)
// with a kicker, headline, lead, an email pill + Subscribe, and a legal note. Honest prototype: the
// submit transmits nothing; it swaps to an inline confirmation and the legal note says so.
export function NewsletterBand({ kicker, heading, highlight, body, placeholder, ctaLabel, legal, confirm }) {
  const ref = useReveal();
  const [done, setDone] = useState(false);
  const [email, setEmail] = useState('');
  // on submit the form (incl. the button just pressed) is replaced by the confirmation, so move focus to
  // it rather than letting focus fall to <body> — and it's a live region, so the success is announced.
  const confirmRef = useRef(null);
  useEffect(() => { if (done && confirmRef.current) confirmRef.current.focus(); }, [done]);

  const onSubmit = (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    track('generate_lead', { form: 'newsletter' });
    setDone(true); // prototype only — nothing leaves the browser
  };

  return (
    <section ref={ref} className="b-news section">
      <div className="wrap">
        <div className="b-news-card" data-reveal>
          {kicker ? <span className="kicker">{kicker}</span> : null}
          {(heading || highlight) ? (
            <h2 className="b-news-h2">{heading} {highlight ? <span className="accent">{highlight}</span> : null}</h2>
          ) : null}
          {body ? <p className="lead b-news-lead">{body}</p> : null}

          {done ? (
            <p className="b-news-confirm" role="status" ref={confirmRef} tabIndex={-1}>{confirm}</p>
          ) : (
            <form className="b-news-form" onSubmit={onSubmit} aria-label="Newsletter sign-up (prototype)">
              <input
                type="email" name="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder={placeholder} aria-label="Email address" autoComplete="email" required
              />
              <button className="btn btn--primary" type="submit">{ctaLabel}</button>
            </form>
          )}

          {legal ? <p className="b-news-legal">{legal}</p> : null}
        </div>
      </div>
    </section>
  );
}

export const css = `
.b-news-card{position:relative;overflow:hidden;border:1px solid var(--gs-border);border-radius:24px;
  padding:clamp(34px,5vw,64px);text-align:center;backdrop-filter:blur(10px);
  background:radial-gradient(120% 160% at 50% -40%,rgba(200,255,0,.10),transparent 60%),var(--gs-glass,rgba(30,38,32,.55))}
.b-news-h2{max-width:18ch;margin:.3em auto 0;font-size:clamp(2rem,4.5vw,3.6rem);font-weight:900;letter-spacing:-.02em;line-height:1.08}
.b-news-lead{margin:16px auto 0;max-width:60ch}
.b-news-form{display:flex;gap:10px;max-width:520px;margin:26px auto 0}
.b-news-form input{flex:1;font-family:inherit;font-size:16px;color:var(--gs-text);padding:.9em 1.2em;border-radius:100px;
  border:1px solid var(--gs-border-soft);background:rgba(0,0,0,.25);transition:border-color var(--gs-dur),box-shadow var(--gs-dur)}
.b-news-form input::placeholder{color:var(--gs-text-faint)}
.b-news-form input:focus{outline:none;border-color:var(--gs-accent-mid);box-shadow:0 0 0 3px var(--gs-accent-mid)}
.b-news-confirm{margin:26px auto 0;max-width:46ch;color:var(--gs-accent);font-weight:700}
.b-news-legal{font-size:.8rem;color:var(--gs-text-faint);margin-top:14px}
@media(max-width:820px){.b-news-form{flex-direction:column}.b-news-form .btn{justify-content:center}}
`;

export const puck = {
  label: 'Newsletter band',
  fields: {
    kicker: { type: 'text', label: 'Kicker', contentEditable: true },
    heading: { type: 'text', label: 'Heading', contentEditable: true },
    highlight: { type: 'text', label: 'Highlighted word', contentEditable: true },
    body: { type: 'textarea', label: 'Body', contentEditable: true },
    placeholder: { type: 'text', label: 'Input placeholder' },
    ctaLabel: { type: 'text', label: 'Button label' },
    legal: { type: 'text', label: 'Legal note' },
    confirm: { type: 'text', label: 'Confirmation message' },
  },
  defaultProps: {
    kicker: 'The Foundation Brief',
    heading: 'Field notes, in your inbox.', highlight: 'No noise.',
    body: 'One considered read a month on time, maturity and adoption, written from inside the work, not the sidelines.',
    placeholder: 'you@company.com',
    ctaLabel: 'Subscribe',
    legal: 'Template form, not yet wired up. We’ll never share your address.',
    confirm: 'You’re on the list. (Prototype: nothing was sent.)',
  },
  render: (props) => <NewsletterBand {...props} />,
};

export default NewsletterBand;
