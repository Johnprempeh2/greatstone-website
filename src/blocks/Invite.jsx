import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';
import { safeMailto } from '../lib/safe-url.js';
import { resolveLink, hasLink } from '../lib/link-resolver.mjs';
import { LinkField } from '../cms/LinkField.jsx';
import { CTA_STYLE_FIELD, CTA_STYLE_DEFAULT } from '../cms/style-field.jsx';
import { ctaStyleClass } from '../lib/cta-style.mjs';
import { RichTextField } from '../cms/RichTextField.jsx';
import EditableText from './EditableText.jsx'; // inline-on-canvas edit while editing, static RichText on the public site

// The close: a single, calm invitation. One primary action, an optional secondary, and the contact
// routes beneath, with nothing else competing. The primary action keeps the greatest visual emphasis.
export function Invite({ id, puck, eyebrow, headline, highlight, body, ctaLabel, ctaHref = '#', ctaStyle, ctaLabel2, ctaHref2 = '#', email, variant = 'aurora', pill = false, contactOptions = [] }) {
  const ref = useReveal();
  const editing = puck && puck.isEditing;
  // "Visitors should never feel constrained to a single communication method", so the close can offer
  // several routes alongside the primary action. Each one renders ONLY when its link actually resolves:
  // the approved wording for a route that has no destination yet (no published number, no agreed address)
  // stays stored and editable in the studio, and the visitor never meets a contact route that goes nowhere.
  const routes = contactOptions.filter((o) => o && o.label && hasLink(o.href));
  const framed = variant === 'framed';
  const band = variant === 'band';
  const inner = (
    <>
      <EditableText editing={editing} id={id} field="eyebrow" value={eyebrow} as="span" className={pill ? 'pill' : 'kicker'} singleLine placeholder="Eyebrow…" data-reveal />
      <h2 data-reveal><EditableText editing={editing} id={id} field="headline" value={headline} as="span" singleLine placeholder="Headline…" /> {highlight ? <span className="accent">{highlight}</span> : null}</h2>
      <EditableText editing={editing} id={id} field="body" value={body} as="p" className="b-invite-body" placeholder="Body…" data-reveal />
      <div className="b-invite-actions" data-reveal>
        {ctaLabel ? <a className={('b-cta ' + ctaStyleClass(ctaStyle)).trim()} {...resolveLink(ctaHref)}>{ctaLabel}<Arrow /></a> : null}
        {ctaLabel2 ? <a className="b-cta ghost" {...resolveLink(ctaHref2)}>{ctaLabel2}</a> : null}
        {email ? <a className="b-invite-email" href={safeMailto(email)}>{email}</a> : null}
      </div>
      {routes.length ? (
        <ul className="b-invite-routes" data-reveal>
          {routes.map((o, i) => (
            <li key={i}><a {...resolveLink(o.href)}>{o.label}</a></li>
          ))}
        </ul>
      ) : null}
    </>
  );
  const cls = 'b-invite'
    + (framed ? ' b-invite-framed' : '')
    + (band ? ' b-invite-band' : '')
    + (band && pill ? ' b-invite-pillband' : '');
  return (
    <section ref={ref} className={cls} id="invite">
      {(framed || band) ? null : <div className="b-invite-aurora" aria-hidden="true" />}
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
  transition:color .25s var(--gs-ease),border-color .25s var(--gs-ease);overflow-wrap:anywhere}
.b-invite-email:hover{color:var(--gs-accent);border-color:var(--gs-accent)}
/* Contact routes. The primary action must keep "the greatest visual emphasis", so these sit quieter than
   both buttons: muted small text, separated by whitespace rather than rules or chips, since anything
   boxed would read as a second row of buttons competing with the one above it. */
.b-invite-routes{margin:clamp(24px,3.5vw,34px) 0 0;padding:0;list-style:none;
  display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px clamp(16px,2.6vw,28px)}
.b-invite-routes a{display:inline-block;font-size:.9rem;font-weight:600;color:var(--gs-muted);
  border-bottom:1px solid transparent;padding-bottom:2px;
  transition:color .25s var(--gs-ease),border-color .25s var(--gs-ease)}
.b-invite-routes a:hover,.b-invite-routes a:focus-visible{color:var(--gs-accent);border-color:var(--gs-accent)}
@media(prefers-reduced-motion:reduce){.b-invite-routes a{transition:none}}
/* framed variant: a contained bordered card (the live method .cta-band), no full-bleed aurora */
.b-invite-framed{padding:clamp(48px,9vw,110px) 0}
.b-invite-card{position:relative;max-width:880px;margin-inline:auto;text-align:center;overflow:hidden;
  border:1px solid var(--gs-border);border-radius:22px;background:var(--gs-accent-soft);
  padding:clamp(40px,6vw,72px);backdrop-filter:blur(10px)}
.b-invite-card::before{content:"";position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(600px 320px at 50% -20%,var(--gs-accent-dim),transparent 70%)}
.b-invite-card>*{position:relative;z-index:1}
.b-invite-card h2{font-size:clamp(1.8rem,4.4vw,3.1rem)}
.b-invite-card .b-invite-body{max-width:46ch}
/* band variant: a calm centered close (the live industries/about/home/climb closings), no aurora, no card,
   headline at the shared .h2 scale rather than the oversized aurora display size */
.b-invite-band{padding:clamp(56px,9vw,120px) 0}
.b-invite-band h2{font-size:clamp(2rem,4.5vw,3.6rem)}
.b-invite-pillband{border-top:1px solid var(--gs-border-soft)}
`;

export const puck = {
  label: 'Invite (closing CTA)',
  fields: {
    eyebrow: { type: 'custom', label: 'Eyebrow', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    headline: { type: 'custom', label: 'Headline', render: (props) => <RichTextField {...props} variant="heading" /> },
    highlight: { type: 'text', label: 'Highlighted word', contentEditable: true },
    body: { type: 'custom', label: 'Body', render: (props) => <RichTextField {...props} /> },
    ctaLabel: { type: 'text', label: 'Primary button label' },
    ctaHref: { type: 'custom', label: 'Primary button link', render: (props) => <LinkField {...props} /> },
    ctaStyle: CTA_STYLE_FIELD,
    ctaLabel2: { type: 'text', label: 'Ghost button label (optional)' },
    ctaHref2: { type: 'custom', label: 'Ghost button link', render: (props) => <LinkField {...props} /> },
    email: { type: 'text', label: 'Contact email (optional)' },
    variant: { type: 'radio', label: 'Style', options: [
      { label: 'Full-bleed (aurora)', value: 'aurora' }, { label: 'Framed card', value: 'framed' }, { label: 'Plain band', value: 'band' },
    ]},
    pill: { type: 'radio', label: 'Pill eyebrow + top border (band only)', options: [
      { label: 'No', value: false }, { label: 'Yes', value: true },
    ]},
    // array field stays LAST (see memory "puck-slot-misdetection-inline-editing")
    contactOptions: {
      type: 'array', label: 'Contact routes (each appears only once its link is set)',
      arrayFields: {
        label: { type: 'text', label: 'Route label' },
        href: { type: 'custom', label: 'Route link', render: (props) => <LinkField {...props} /> },
      },
      defaultItemProps: { label: 'Telephone', href: '#' },
      getItemSummary: (item) => item.label || 'Route',
      max: 6,
    },
  },
  defaultProps: {
    // Ben's Architecture v2.0 fixes the primary call to action as "Begin the Conversation" and says the
    // wording should remain unchanged, so that is what an editor gets when they add this block. The old
    // default sold the retired Diagnostic proposition and would have quietly reintroduced it on any new page.
    eyebrow: '',
    headline: 'Let’s Build a Stronger Organisation', highlight: '',
    body: 'The journey towards a stronger organisation begins with a conversation.',
    ctaLabel: 'Begin the Conversation', ctaHref: '#book', ctaStyle: CTA_STYLE_DEFAULT, ctaLabel2: '', ctaHref2: '#', email: '', variant: 'aurora', pill: false,
    contactOptions: [],
  },
  render: (props) => <Invite {...props} />,
};

export default Invite;
