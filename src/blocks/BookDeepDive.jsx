import { useState, useRef, useEffect, useId } from 'react';
import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';
import { safeMailto } from '../lib/safe-url.js';
import { track, getConsent, getAttribution } from '../lib/analytics.js';
import { makeEnquiryClient, enquiryPayload, fireLead, isEmail } from '../lib/enquiry.mjs';
import { RichTextField } from '../cms/RichTextField.jsx';
import EditableText from './EditableText.jsx'; // inline-on-canvas edit while editing, static RichText on the public site

const ime = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
const client = makeEnquiryClient({ url: ime.VITE_SUPABASE_URL || '', anonKey: ime.VITE_SUPABASE_ANON_KEY || '' });

// The site's contact address (the footer's default too). The panels after submit always show an address,
// even on a page whose `email` is left empty, so a visitor whose enquiry failed still has a next step.
const FALLBACK_EMAIL = 'dx@greatstonesoftware.co.uk';

const DEFAULT_SECTORS = ['Professional Services', 'Financial Services', 'Healthcare & Life Sciences', 'Retail & E-commerce', 'Manufacturing & Industrial', 'Logistics & Supply Chain', 'Property & Construction', 'Other'];

// small inline icon set for the "Why a diagnostic" assure rows (lime stroke, set in CSS)
const ico = (children) => <svg viewBox="0 0 24 24">{children}</svg>;
const ICONS = {
  check: ico(<><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></>),
  clock: ico(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  scan: ico(<><path d="M4 7V5a2 2 0 0 1 2-2h2" /><path d="M16 3h2a2 2 0 0 1 2 2v2" /><path d="M20 17v2a2 2 0 0 1-2 2h-2" /><path d="M8 21H6a2 2 0 0 1-2-2v-2" /><circle cx="12" cy="12" r="3" /></>),
};

// The booking page: the booking form beside a short framing aside. On submit it sends the enquiry to the
// `enquiry` edge function (GRE-654), which saves it in the studio Inquiries tab and alerts the owner, then
// shows a confirmation. On any failure (offline, no backend, server error) it shows the contact address
// with an email already filled in from the form, so the visitor always has a next step.
export function BookDeepDive({
  id, puck, eyebrow, headline, highlight, body, submitLabel, asideKicker, asideHeading, asideBody,
  asidePoints = [], sectors, email = FALLBACK_EMAIL,
  // The form's own wording used to be hardcoded, which meant the enquiry route could not be reworded
  // without a code change, and the sector question could not be made optional at all. These carry the
  // previous strings as defaults, so any stored page that predates them renders exactly as before.
  sectorLabel = 'Industry', sectorPlaceholder = 'Choose your sector…', sectorRequired = true,
  messageLabel = 'Where does your week go?',
  messagePlaceholder = 'The reports nobody reads. The handoffs that get re-keyed. Tell us what quietly eats the hours.',
  subjectPrefix = 'Diagnostic request', anchorId = '',
}) {
  const editing = puck && puck.isEditing;
  // the industry dropdown is now an editable list (mirrors every other string in this block); fall back
  // to the default sectors if an editor empties it. Tolerates both {label} items and legacy bare strings.
  const sectorList = (Array.isArray(sectors) && sectors.length ? sectors : DEFAULT_SECTORS)
    .map((s) => (typeof s === 'string' ? s : (s && s.label) || '')).filter(Boolean);
  const ref = useReveal([asidePoints.length]);
  const [status, setStatus] = useState('idle'); // 'idle' | 'sending' | 'sent' | 'failed'
  const [emailError, setEmailError] = useState('');
  const [fallbackHref, setFallbackHref] = useState('');
  const sent = status === 'sent' || status === 'failed';
  const uid = useId(); // per-instance id prefix so two BookDeepDive blocks on one page never collide
  // on submit the form is replaced by the confirmation, so the control the user just activated is
  // unmounted; move focus to the confirmation heading (which is a live region) so keyboard + screen-reader
  // users are carried to it and the success is announced, instead of focus falling back to <body>.
  const sentRef = useRef(null);
  useEffect(() => { if (sent && sentRef.current) sentRef.current.focus(); }, [sent]);
  // The email the visitor can send themselves if the save fails: the same prefilled mailto the form used
  // to open. safeMailto guards the editor-set address; subject and body are encodeURIComponent'd.
  const replyTo = safeMailto(email) !== '#' ? email : FALLBACK_EMAIL;
  const composeMailto = (g) => {
    const to = safeMailto(replyTo);
    if (to === '#') return to;
    const nm = g('name'), company = g('company');
    const subject = subjectPrefix + (company ? ' · ' + company : nm ? ' · ' + nm : '');
    const parts = [];
    if (nm) parts.push('Name: ' + nm);
    if (company) parts.push('Company: ' + company);
    if (g('email')) parts.push('Work email: ' + g('email'));
    if (g('industry')) parts.push(sectorLabel + ': ' + g('industry'));
    parts.push('', messageLabel, g('week') || '(not specified)');
    return to + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(parts.join('\n'));
  };
  const onSubmit = async (e) => {
    e.preventDefault();
    if (status === 'sending' || editing) return;
    const fd = new FormData(e.currentTarget);
    const g = (k) => (fd.get(k) || '').toString().trim();
    if (!isEmail(g('email'))) { setEmailError('Enter a work email we can reply to.'); return; }
    setEmailError('');
    setFallbackHref(composeMailto(g));
    setStatus('sending');
    const attribution = getAttribution();
    const page = typeof window !== 'undefined' ? window.location.pathname + window.location.hash : '';
    const out = await client.send(enquiryPayload({
      name: g('name'), company: g('company'), email: g('email'), industry: g('industry'), message: g('week'), website: g('website'),
    }, attribution, page));
    if (out.ok) fireLead({ track, getConsent, attribution });
    setStatus(out.ok ? 'sent' : 'failed');
  };
  return (
    <section ref={ref} className="b-book" id={anchorId || undefined}>
      <div className="wrap">
        <div className="grid b-book-grid" data-reveal>
          <div className="card book-card">
            {(editing || (eyebrow && eyebrow !== headline)) ? <span className="kicker b-book-eyebrow"><EditableText editing={editing} id={id} field="eyebrow" value={eyebrow} as="span" singleLine placeholder="Eyebrow…" /></span> : null}
            <h2 className="h3 b-book-card-head"><EditableText editing={editing} id={id} field="headline" value={headline} as="span" singleLine placeholder="Headline…" />{highlight ? <> <span className="accent">{highlight}</span></> : null}</h2>
            <EditableText editing={editing} id={id} field="body" value={body} as="p" className="b-book-card-intro muted" placeholder="Body…" />
            {status === 'sent' ? (
              <div className="book-sent" role="status" aria-live="polite">
                <h3 ref={sentRef} tabIndex={-1}>Thank you. We have your enquiry.</h3>
                <p>The team reads every enquiry and will reply to you by email. If you need us sooner, write to us directly:</p>
                <a className="b-cta" href={safeMailto(replyTo)}>{replyTo}</a>
              </div>
            ) : status === 'failed' ? (
              <div className="book-sent" role="alert">
                <h3 ref={sentRef} tabIndex={-1}>We could not send your enquiry.</h3>
                <p>Please email us instead. The link below opens an email with your details filled in, ready to send.</p>
                <a className="b-cta" href={fallbackHref || safeMailto(replyTo)}>{replyTo}</a>
              </div>
            ) : (
              <>
                {/* the one-click path the rest of the site uses: #book opens the Calendly popup (App's
                    global handler), so the booking page itself books instantly; the form stays as "tell us first" */}
                <a className="b-cta b-book-instant" href="#book">Pick a time now<Arrow /></a>
                <div className="b-book-or">or tell us first</div>
                <form onSubmit={onSubmit} noValidate aria-busy={status === 'sending' ? 'true' : undefined}>
                {/* honeypot: hidden from people and screen readers; a bot that fills it is dropped by the function */}
                <div className="b-book-hp" aria-hidden="true"><label htmlFor={uid + 'website'}>Website</label><input id={uid + 'website'} name="website" type="text" tabIndex={-1} autoComplete="off" /></div>
                <div className="field-row">
                  <div className="field"><label htmlFor={uid + 'name'}>Your name</label><input className="fld" id={uid + 'name'} name="name" type="text" placeholder="Jane Stonewell" autoComplete="name" /></div>
                  <div className="field"><label htmlFor={uid + 'company'}>Company</label><input className="fld" id={uid + 'company'} name="company" type="text" placeholder="Stonewell & Co." autoComplete="organization" /></div>
                </div>
                <div className="field"><label htmlFor={uid + 'email'}>Work email</label><input className="fld" id={uid + 'email'} name="email" type="email" required aria-required="true" placeholder="jane@stonewell.co" autoComplete="email"
                  onChange={() => { if (emailError) setEmailError(''); }} aria-invalid={emailError ? 'true' : undefined} aria-describedby={emailError ? uid + 'email-err' : undefined} />
                  {emailError ? <p className="b-book-err" id={uid + 'email-err'} role="alert">{emailError}</p> : null}</div>
                {/* Optional by default now. Forcing a visitor to classify their own sector before they may
                    say hello is a qualification barrier, and the placeholder stays selectable so choosing
                    nothing is a real answer rather than a dead first option. */}
                <div className="field"><label htmlFor={uid + 'industry'}>{sectorLabel}</label>
                  <select className="fld" id={uid + 'industry'} name="industry" {...(sectorRequired ? { required: true, 'aria-required': 'true' } : null)} defaultValue=""><option value="" disabled={!!sectorRequired}>{sectorPlaceholder}</option>{sectorList.map((s) => <option key={s}>{s}</option>)}</select>
                </div>
                <div className="field"><label htmlFor={uid + 'week'}>{messageLabel}</label>
                  <textarea className="fld" id={uid + 'week'} name="week" placeholder={messagePlaceholder} />
                </div>
                <button className="b-cta book-submit" type="submit" disabled={status === 'sending'}>{status === 'sending' ? 'Sending…' : submitLabel}<Arrow /></button>
              </form>
              </>
            )}
          </div>

          <aside className="book-aside">
            <EditableText editing={editing} id={id} field="asideKicker" value={asideKicker} as="span" className="kicker" singleLine placeholder="Aside kicker…" />
            <EditableText editing={editing} id={id} field="asideHeading" value={asideHeading} as="h3" className="h3" singleLine placeholder="Aside heading…" />
            <EditableText editing={editing} id={id} field="asideBody" value={asideBody} as="p" className="b-book-aside-body" placeholder="Aside intro…" />
            <div className="b-book-assure-list">
              {asidePoints.map((p, i) => (
                <div className="b-book-assure" key={i}>
                  <span className="b-book-ai" aria-hidden="true">{ICONS[p.icon] || ICONS.check}</span>
                  <div>
                    <EditableText editing={editing} id={id} arrayField="asidePoints" index={i} field="title" value={p.title} as="div" className="b-book-at" singleLine placeholder="Title…" />
                    <EditableText editing={editing} id={id} arrayField="asidePoints" index={i} field="text" value={p.text} as="div" className="b-book-ad" placeholder="Description…" />
                  </div>
                </div>
              ))}
            </div>
            <a className="b-book-mail" href={safeMailto(email)}>{email}</a>
          </aside>
        </div>
      </div>
    </section>
  );
}

export const css = `
.b-book{padding:clamp(56px,9vw,120px) 0;position:relative}
.b-book-grid{grid-template-columns:1.15fr .85fr;gap:clamp(24px,4vw,56px);align-items:start}
/* heading + intro now live inside the card (faithful to live: h2.h3 + .muted intro right after the template note) */
.b-book-eyebrow{display:block;margin:.9rem 0 .35rem}
.b-book-card-head{font-size:clamp(1.3rem,2.4vw,2rem);font-weight:800;line-height:1.04;letter-spacing:-.02em}
.b-book-card-intro{margin:.6rem 0 1.8rem;color:var(--gs-text-muted)}
@media(max-width:860px){.b-book-grid{grid-template-columns:1fr}}
.book-card{padding:clamp(26px,3.4vw,44px)}
.field{margin-bottom:1.2rem}.field:last-of-type{margin-bottom:0}
.field label{display:block;font-size:.74rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--gs-muted);margin-bottom:.5rem}
.field-row{display:grid;grid-template-columns:1fr 1fr;gap:1.2rem}
@media(max-width:520px){.field-row{grid-template-columns:1fr}}
.fld{width:100%;font-family:inherit;font-size:.98rem;color:var(--gs-text);background:rgba(255,255,255,.03);border:1px solid var(--gs-border-soft);border-radius:10px;padding:.8em .9em;transition:border-color .25s var(--gs-ease),background .25s var(--gs-ease),box-shadow .25s var(--gs-ease)}
.fld::placeholder{color:var(--gs-faint)}
textarea.fld{resize:vertical;min-height:120px;line-height:1.55}
select.fld{appearance:none;-webkit-appearance:none;cursor:pointer;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23c8ff00' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 1em center;padding-right:2.6em}
select.fld option{background:#1b1f1d;color:var(--gs-text)}
.fld:focus{outline:none;border-color:var(--gs-accent-mid,rgba(200,255,0,.4));background:rgba(200,255,0,.04);box-shadow:0 0 0 3px var(--gs-accent-mid,rgba(200,255,0,.4))}
.book-submit{margin-top:1.8rem;width:100%;justify-content:center}
.b-book-instant{width:100%;justify-content:center;margin-bottom:18px}
.b-book-or{display:flex;align-items:center;gap:12px;margin:0 0 18px;color:var(--gs-faint);font-size:.74rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase}
.b-book-or::before,.b-book-or::after{content:"";flex:1;height:1px;background:var(--gs-border-soft)}
.book-submit[disabled]{opacity:.7;cursor:progress}
.b-book-err{margin:.45rem 0 0;font-size:.86rem;color:#ffb4a8}
.b-book-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.book-sent{text-align:center;padding:18px 0}
.book-sent h3{font-size:1.4rem;font-weight:800}
.book-sent p{margin:12px auto 22px;color:var(--gs-muted);max-width:42ch;line-height:1.6}
.book-aside .h3{margin:.5rem 0 .6rem}
.b-book-aside-body{margin-bottom:1.4rem;color:var(--gs-muted);font-size:.96rem;line-height:1.6}
/* iconed "Why a diagnostic" assure rows (faithful to the live .assure: 34px lime icon tile + title + desc) */
.b-book-assure{display:flex;gap:.9rem;align-items:flex-start;padding:1rem 0;border-bottom:1px solid var(--gs-border-soft)}
.b-book-assure:last-of-type{border-bottom:0}
.b-book-ai{flex:0 0 auto;width:34px;height:34px;border-radius:9px;display:grid;place-items:center;
  background:var(--gs-accent-soft);border:1px solid var(--gs-border)}
.b-book-ai svg{width:17px;height:17px;stroke:var(--gs-accent);fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.b-book-at{font-weight:700;font-size:.96rem}
.b-book-ad{margin-top:2px;font-size:.86rem;color:var(--gs-text-muted);line-height:1.5}
.b-book-mail{display:inline-block;overflow-wrap:anywhere;margin-top:22px;color:var(--gs-accent);font-weight:700;border-bottom:1px solid var(--gs-border);padding-bottom:3px}
`;

const PT = (title, text) => ({ title, text });

export const puck = {
  label: 'Booking form',
  fields: {
    eyebrow: { type: 'custom', label: 'Eyebrow', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    headline: { type: 'custom', label: 'Headline', render: (props) => <RichTextField {...props} variant="heading" /> },
    highlight: { type: 'text', label: 'Highlighted word', contentEditable: true },
    body: { type: 'custom', label: 'Body', render: (props) => <RichTextField {...props} /> },
    submitLabel: { type: 'text', label: 'Submit button' },
    sectorLabel: { type: 'text', label: 'Sector question label' },
    sectorPlaceholder: { type: 'text', label: 'Sector question placeholder' },
    sectorRequired: { type: 'radio', label: 'Sector answer is', options: [
      { label: 'Optional', value: false }, { label: 'Required', value: true },
    ]},
    messageLabel: { type: 'text', label: 'Message question label' },
    messagePlaceholder: { type: 'text', label: 'Message placeholder' },
    subjectPrefix: { type: 'text', label: 'Email subject prefix' },
    anchorId: { type: 'text', label: 'Anchor id (lets a link jump here, e.g. enquiry)' },
    asideKicker: { type: 'custom', label: 'Aside kicker', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    asideHeading: { type: 'custom', label: 'Aside heading', render: (props) => <RichTextField {...props} variant="heading" /> },
    asideBody: { type: 'custom', label: 'Aside intro', render: (props) => <RichTextField {...props} /> },
    email: { type: 'text', label: 'Contact email' },
    // array fields LAST — Puck mis-slots custom fields placed before an array when other fields
    // follow it (see memory "puck-slot-misdetection-inline-editing")
    asidePoints: {
      type: 'array', label: 'Assurance rows',
      arrayFields: {
        icon: { type: 'select', label: 'Icon', options: [{ label: 'Check', value: 'check' }, { label: 'Clock', value: 'clock' }, { label: 'Scan', value: 'scan' }] },
        title: { type: 'custom', label: 'Title', render: (props) => <RichTextField {...props} variant="heading" /> },
        text: { type: 'custom', label: 'Description', render: (props) => <RichTextField {...props} /> },
      },
      defaultItemProps: { icon: 'check', title: 'A point', text: 'detail.' },
      getItemSummary: (item) => item.title || 'Point',
    },
    sectors: {
      type: 'array', label: 'Industry options (dropdown)',
      arrayFields: { label: { type: 'text', label: 'Sector' } },
      defaultItemProps: { label: 'Sector' },
      getItemSummary: (item) => item.label || 'Sector',
    },
  },
  defaultProps: {
    // BookDeepDive is in the rebuilt site's working set, so its defaults are what an editor gets when
    // they add an enquiry form to a NEW page. They used to sell the retired Diagnostic proposition,
    // which would have reintroduced it silently. The contact page overrides all of these anyway.
    eyebrow: '',
    headline: 'Send an Enquiry', highlight: '',
    body: 'Tell us as much or as little as you would like. There are no required details beyond a way to reply to you.',
    submitLabel: 'Send Enquiry',
    sectorLabel: 'Industry', sectorPlaceholder: 'Choose your sector…', sectorRequired: false,
    messageLabel: 'What would you like to discuss?',
    messagePlaceholder: 'A challenge you are weighing up, an ambition you are planning around, or simply a question you would like a considered answer to.',
    subjectPrefix: 'Enquiry', anchorId: '',
    asideKicker: 'What happens next',
    asideHeading: 'A considered reply, not a sales sequence.',
    asideBody: 'Every enquiry is read by the team. We reply with a view on whether we can genuinely help, and say so plainly when we cannot.',
    asidePoints: [
      { icon: 'check', title: 'Read by the team', text: 'Not routed into an automated nurture sequence.' },
      { icon: 'clock', title: 'A considered response', text: 'We would rather reply well than reply instantly.' },
      { icon: 'scan', title: 'No obligation', text: 'A conversation is a conversation. Nothing follows it unless you want it to.' },
    ],
    sectors: DEFAULT_SECTORS.map((label) => ({ label })),
    email: 'dx@greatstonesoftware.co.uk',
  },
  render: (props) => <BookDeepDive {...props} />,
};

export default BookDeepDive;
