import { useReveal } from './reveal.js';
import { safeMailto } from '../lib/safe-url.js';

// The direct-contact close: a big mailto on one side, a "before you book" prompt card on the
// other. No gatekeeping.
export function ContactBand({ kicker, heading, body, email = 'dx@greatstonesoftware.co.uk', cardKicker, cardStat, cardStatUnit, cardHeading, cardBody }) {
  const ref = useReveal();
  return (
    <section ref={ref} className="b-contactband">
      <div className="wrap">
        <div className="contact-band">
          <div data-reveal>
            {kicker ? <p className="kicker">{kicker}</p> : null}
            <h2 className="h2 b-cb-head">{heading}</h2>
            {body ? <p className="muted b-cb-body">{body}</p> : null}
            <a className="big-mail" href={safeMailto(email)}>{email}</a>
          </div>
          <div className="card calc-card" data-reveal>
            {cardKicker ? <p className="kicker">{cardKicker}</p> : null}
            {cardStat ? <div className="calc-time"><b>{cardStat}</b><span>{cardStatUnit}</span></div> : null}
            <h3 className="h3 b-cb-cardhead">{cardHeading}</h3>
            {cardBody ? <p className="muted">{cardBody}</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

export const css = `
.b-contactband{padding:clamp(48px,8vh,110px) 0;position:relative}
.contact-band{display:grid;grid-template-columns:1.2fr 1fr;gap:clamp(24px,4vw,56px);align-items:center}
@media(max-width:760px){.contact-band{grid-template-columns:1fr}}
.b-cb-head{margin:.5rem 0 1rem;font-weight:900;letter-spacing:-.025em}
.b-cb-body{margin-bottom:1.4rem;line-height:1.7}
.big-mail{font-size:clamp(1.05rem,2vw,1.5rem);font-weight:800;color:var(--gs-accent);letter-spacing:-.01em;border-bottom:1px solid var(--gs-border);padding-bottom:4px;transition:border-color .25s var(--gs-ease)}
.big-mail:hover{border-color:var(--gs-accent)}
.calc-card{padding:clamp(24px,3vw,34px)}
.calc-time{display:flex;align-items:baseline;gap:.4em;margin:.7rem 0 .3rem}
.calc-time b{font-weight:900;font-size:clamp(2.2rem,4vw,3rem);color:var(--gs-accent);line-height:1;letter-spacing:-.03em}
.calc-time span{font-size:.9rem;font-weight:600;color:var(--gs-muted)}
.b-cb-cardhead{margin-bottom:.5rem}
`;

export const puck = {
  label: 'Contact band',
  fields: {
    kicker: { type: 'text', label: 'Kicker', contentEditable: true },
    heading: { type: 'text', label: 'Heading', contentEditable: true },
    body: { type: 'textarea', label: 'Body', contentEditable: true },
    email: { type: 'text', label: 'Email' },
    cardKicker: { type: 'text', label: 'Card kicker', contentEditable: true },
    cardStat: { type: 'text', label: 'Card figure' },
    cardStatUnit: { type: 'text', label: 'Card figure unit' },
    cardHeading: { type: 'text', label: 'Card heading', contentEditable: true },
    cardBody: { type: 'textarea', label: 'Card body', contentEditable: true },
  },
  defaultProps: {
    kicker: 'Rather just talk?', heading: 'Reach us direct.',
    body: 'No forms, no gatekeeping. Write a line about where your week goes and we’ll write back with where it could go instead.',
    email: 'dx@greatstonesoftware.co.uk',
    cardKicker: 'Before you book', cardStat: '45', cardStatUnit: 'seconds',
    cardHeading: 'Run the time-savings calculator',
    cardBody: 'Forty-five seconds to see, in your own numbers, the hours your business is quietly losing.',
  },
  render: (props) => <ContactBand {...props} />,
};

export default ContactBand;
