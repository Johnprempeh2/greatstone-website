import { useReveal } from './reveal.js';
import { safeMailto } from '../lib/safe-url.js';
import { resolveLink } from '../lib/link-resolver.mjs';
import { LinkField } from '../cms/LinkField.jsx';
import { RichTextField } from '../cms/RichTextField.jsx';
import EditableText from './EditableText.jsx'; // inline-on-canvas edit while editing, static RichText on the public site
import { Arrow } from './icons.jsx';

// The direct-contact close: a big mailto on one side, a "before you book" prompt card on the
// other. No gatekeeping. The card echoes the live .calc-card (radial glow + a ghost link out
// to the time-savings calculator).
export function ContactBand({ id, puck, kicker, heading, body, email = 'dx@greatstonesoftware.co.uk', cardKicker, cardStat, cardStatUnit, cardHeading, cardBody, cardCtaLabel, cardCtaHref = '#' }) {
  const ref = useReveal();
  const editing = puck && puck.isEditing;
  return (
    <section ref={ref} className="b-contactband">
      <div className="wrap">
        <div className="contact-band">
          <div data-reveal>
            <EditableText editing={editing} id={id} field="kicker" value={kicker} as="p" className="kicker" singleLine placeholder="Kicker…" />
            <EditableText editing={editing} id={id} field="heading" value={heading} as="h2" className="h2 b-cb-head" singleLine placeholder="Heading…" />
            <EditableText editing={editing} id={id} field="body" value={body} as="p" className="muted b-cb-body" placeholder="Body…" />
            <a className="big-mail" href={safeMailto(email)}>{email}</a>
          </div>
          <div className="card calc-card" data-reveal>
            <EditableText editing={editing} id={id} field="cardKicker" value={cardKicker} as="p" className="kicker" singleLine placeholder="Card kicker…" />
            {cardStat ? <div className="calc-time"><b>{cardStat}</b><span>{cardStatUnit}</span></div> : null}
            <EditableText editing={editing} id={id} field="cardHeading" value={cardHeading} as="h3" className="h3 b-cb-cardhead" singleLine placeholder="Card heading…" />
            <EditableText editing={editing} id={id} field="cardBody" value={cardBody} as="p" className="muted" placeholder="Card body…" />
            {cardCtaLabel ? <a className="b-cta ghost b-cb-cardcta" {...resolveLink(cardCtaHref)}>{cardCtaLabel}<Arrow /></a> : null}
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
.big-mail{font-weight:900;font-size:clamp(1.4rem,3.4vw,2.4rem);letter-spacing:-.02em;color:var(--gs-text);transition:color .25s var(--gs-ease);word-break:break-word}
.big-mail:hover{color:var(--gs-accent)}
.calc-card{padding:clamp(24px,3vw,34px);position:relative;overflow:hidden}
.calc-card::before{content:"";position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(420px 200px at 110% -20%,var(--gs-accent-dim),transparent 60%)}
.calc-card>*{position:relative;z-index:1}
.b-cb-cardcta{margin-top:1.3rem;display:inline-flex}
.calc-time{display:flex;align-items:baseline;gap:.4em;margin:.7rem 0 .3rem}
.calc-time b{font-weight:900;font-size:clamp(2.2rem,4vw,3rem);color:var(--gs-accent);line-height:1;letter-spacing:-.03em}
.calc-time span{font-size:.9rem;font-weight:600;color:var(--gs-muted)}
.b-cb-cardhead{margin-bottom:.5rem}
`;

export const puck = {
  label: 'Contact band',
  fields: {
    kicker: { type: 'custom', label: 'Kicker', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    heading: { type: 'custom', label: 'Heading', render: (props) => <RichTextField {...props} variant="heading" /> },
    body: { type: 'custom', label: 'Body', render: (props) => <RichTextField {...props} /> },
    email: { type: 'text', label: 'Email' },
    cardKicker: { type: 'custom', label: 'Card kicker', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    cardStat: { type: 'text', label: 'Card figure' },
    cardStatUnit: { type: 'text', label: 'Card figure unit' },
    cardHeading: { type: 'custom', label: 'Card heading', render: (props) => <RichTextField {...props} variant="heading" /> },
    cardBody: { type: 'custom', label: 'Card body', render: (props) => <RichTextField {...props} /> },
    cardCtaLabel: { type: 'text', label: 'Card button label (optional)' },
    cardCtaHref: { type: 'custom', label: 'Card button link', render: (props) => <LinkField {...props} /> },
  },
  defaultProps: {
    kicker: 'Rather just talk?', heading: 'Reach us direct.',
    body: 'No forms, no gatekeeping. Write a line about where your week goes and we’ll write back with where it could go instead.',
    email: 'dx@greatstonesoftware.co.uk',
    cardKicker: 'Before you book', cardStat: '45', cardStatUnit: 'seconds',
    cardHeading: 'Run the time-savings calculator',
    cardBody: 'Forty-five seconds to see, in your own numbers, the hours your business is quietly losing each year. The Diagnostic picks up exactly where it leaves off.',
    cardCtaLabel: 'Open the calculator', cardCtaHref: '#go/services',
  },
  render: (props) => <ContactBand {...props} />,
};

export default ContactBand;
