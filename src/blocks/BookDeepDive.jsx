import { useState, useRef, useEffect, useId } from 'react';
import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';
import { safeMailto } from '../lib/safe-url.js';
import { track } from '../lib/analytics.js';

const DEFAULT_SECTORS = ['Professional Services', 'Financial Services', 'Healthcare & Life Sciences', 'Retail & E-commerce', 'Manufacturing & Industrial', 'Logistics & Supply Chain', 'Property & Construction', 'Other'];

// small inline icon set for the "Why a deep dive" assure rows (lime stroke, set in CSS)
const ico = (children) => <svg viewBox="0 0 24 24">{children}</svg>;
const ICONS = {
  check: ico(<><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></>),
  clock: ico(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  scan: ico(<><path d="M4 7V5a2 2 0 0 1 2-2h2" /><path d="M16 3h2a2 2 0 0 1 2 2v2" /><path d="M20 17v2a2 2 0 0 1-2 2h-2" /><path d="M8 21H6a2 2 0 0 1-2-2v-2" /><circle cx="12" cy="12" r="3" /></>),
};

// The "Book a Deep Dive" page: the booking form beside a short framing aside. On submit it composes a
// prefilled mailto to the contact address from the entered fields (client-side, no backend) and shows a
// confirmation with the address as a fallback. A future build may POST to a backend; that decision is open.
export function BookDeepDive({ eyebrow, headline, highlight, body, submitLabel, asideKicker, asideHeading, asideBody, asidePoints = [], sectors, email = 'dx@greatstonesoftware.co.uk' }) {
  // the industry dropdown is now an editable list (mirrors every other string in this block); fall back
  // to the default sectors if an editor empties it. Tolerates both {label} items and legacy bare strings.
  const sectorList = (Array.isArray(sectors) && sectors.length ? sectors : DEFAULT_SECTORS)
    .map((s) => (typeof s === 'string' ? s : (s && s.label) || '')).filter(Boolean);
  const ref = useReveal([asidePoints.length]);
  const [sent, setSent] = useState(false);
  const uid = useId(); // per-instance id prefix so two BookDeepDive blocks on one page never collide
  // on submit the form is replaced by the confirmation, so the control the user just activated is
  // unmounted; move focus to the confirmation heading (which is a live region) so keyboard + screen-reader
  // users are carried to it and the success is announced, instead of focus falling back to <body>.
  const sentRef = useRef(null);
  useEffect(() => { if (sent && sentRef.current) sentRef.current.focus(); }, [sent]);
  // Submit composes a prefilled email to the team from the entered fields. No backend needed: this is the
  // same email path the form always pointed to, now filled in for the visitor. encodeURIComponent on the
  // subject/body keeps it injection-safe. The sent panel still shows the address as a fallback.
  const onSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const g = (k) => (fd.get(k) || '').toString().trim();
    const nm = g('name'), company = g('company');
    const subject = 'Deep Dive request' + (company ? ' · ' + company : nm ? ' · ' + nm : '');
    const parts = [];
    if (nm) parts.push('Name: ' + nm);
    if (company) parts.push('Company: ' + company);
    if (g('email')) parts.push('Work email: ' + g('email'));
    if (g('industry')) parts.push('Industry: ' + g('industry'));
    parts.push('', 'Where the week goes:', g('week') || '(not specified)');
    track('generate_lead', { form: 'deep_dive' });
    // guard the editor-controlled address through safeMailto (same as every other mailto in the codebase),
    // so a stray ?/&/whitespace in the email prop can't merge params / inject headers. Subject + body are
    // already encodeURIComponent'd. If the address is implausible, still show the panel (it carries a fallback).
    const to = safeMailto(email);
    if (to !== '#') {
      const href = to + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(parts.join('\n'));
      try { if (typeof window !== 'undefined') window.location.href = href; } catch (err) { /* ignore */ }
    }
    setSent(true);
  };
  return (
    <section ref={ref} className="b-book">
      <div className="wrap">
        <div className="grid b-book-grid" data-reveal>
          <div className="card book-card">
            {eyebrow && eyebrow !== headline ? <span className="kicker b-book-eyebrow">{eyebrow}</span> : null}
            <h2 className="h3 b-book-card-head">{headline}{highlight ? <> <span className="accent">{highlight}</span></> : null}</h2>
            {body ? <p className="b-book-card-intro muted">{body}</p> : null}
            {sent ? (
              <div className="book-sent" role="status">
                <h3 ref={sentRef} tabIndex={-1}>Thanks. Your email is ready.</h3>
                <p>We’ve opened your email with these details filled in. Send it and we’ll reply with times. If nothing opened, write to us directly:</p>
                <a className="b-cta" href={safeMailto(email)}>{email}</a>
              </div>
            ) : (
              <>
                {/* the one-click path the rest of the site uses: #book opens the Calendly popup (App's
                    global handler), so the booking page itself books instantly; the form stays as "tell us first" */}
                <a className="b-cta b-book-instant" href="#book">Pick a time now<Arrow /></a>
                <div className="b-book-or">or tell us first</div>
                <form onSubmit={onSubmit} noValidate>
                <div className="field-row">
                  <div className="field"><label htmlFor={uid + 'name'}>Your name</label><input className="fld" id={uid + 'name'} name="name" type="text" placeholder="Jane Stonewell" autoComplete="name" /></div>
                  <div className="field"><label htmlFor={uid + 'company'}>Company</label><input className="fld" id={uid + 'company'} name="company" type="text" placeholder="Stonewell & Co." autoComplete="organization" /></div>
                </div>
                <div className="field"><label htmlFor={uid + 'email'}>Work email</label><input className="fld" id={uid + 'email'} name="email" type="email" placeholder="jane@stonewell.co" autoComplete="email" /></div>
                <div className="field"><label htmlFor={uid + 'industry'}>Industry</label>
                  <select className="fld" id={uid + 'industry'} name="industry" defaultValue=""><option value="" disabled>Choose your sector…</option>{sectorList.map((s) => <option key={s}>{s}</option>)}</select>
                </div>
                <div className="field"><label htmlFor={uid + 'week'}>Where does your week go?</label>
                  <textarea className="fld" id={uid + 'week'} name="week" placeholder="The reports nobody reads. The handoffs that get re-keyed. Tell us what quietly eats the hours." />
                </div>
                <button className="b-cta book-submit" type="submit">{submitLabel}<Arrow /></button>
                <p className="book-fine">Submitting opens your email with these details filled in, ready to send.</p>
              </form>
              </>
            )}
          </div>

          <aside className="book-aside">
            {asideKicker ? <span className="kicker">{asideKicker}</span> : null}
            <h3 className="h3">{asideHeading}</h3>
            {asideBody ? <p className="b-book-aside-body">{asideBody}</p> : null}
            <div className="b-book-assure-list">
              {asidePoints.map((p, i) => (
                <div className="b-book-assure" key={i}>
                  <span className="b-book-ai" aria-hidden="true">{ICONS[p.icon] || ICONS.check}</span>
                  <div>
                    <div className="b-book-at">{p.title}</div>
                    {p.text ? <div className="b-book-ad">{p.text}</div> : null}
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
.book-fine{margin-top:1rem;font-size:.74rem;color:var(--gs-faint);text-align:center}
.book-sent{text-align:center;padding:18px 0}
.book-sent h3{font-size:1.4rem;font-weight:800}
.book-sent p{margin:12px auto 22px;color:var(--gs-muted);max-width:42ch;line-height:1.6}
.book-aside .h3{margin:.5rem 0 .6rem}
.b-book-aside-body{margin-bottom:1.4rem;color:var(--gs-muted);font-size:.96rem;line-height:1.6}
/* iconed "Why a deep dive" assure rows (faithful to the live .assure: 34px lime icon tile + title + desc) */
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
  label: 'Book a Deep Dive (form)',
  fields: {
    eyebrow: { type: 'text', label: 'Eyebrow', contentEditable: true },
    headline: { type: 'text', label: 'Headline', contentEditable: true },
    highlight: { type: 'text', label: 'Highlighted word', contentEditable: true },
    body: { type: 'textarea', label: 'Body', contentEditable: true },
    submitLabel: { type: 'text', label: 'Submit button' },
    asideKicker: { type: 'text', label: 'Aside kicker', contentEditable: true },
    asideHeading: { type: 'text', label: 'Aside heading', contentEditable: true },
    asideBody: { type: 'textarea', label: 'Aside intro', contentEditable: true },
    asidePoints: {
      type: 'array', label: 'Assurance rows',
      arrayFields: {
        icon: { type: 'select', label: 'Icon', options: [{ label: 'Check', value: 'check' }, { label: 'Clock', value: 'clock' }, { label: 'Scan', value: 'scan' }] },
        title: { type: 'text', label: 'Title' },
        text: { type: 'text', label: 'Description' },
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
    email: { type: 'text', label: 'Contact email' },
  },
  defaultProps: {
    eyebrow: 'Tell us where the week goes',
    headline: 'Book a', highlight: 'Deep Dive.',
    body: 'Thirty focused minutes of our time and a sharper picture of yours. No deck to sit through, no obligation after.',
    submitLabel: 'Book a Deep Dive',
    asideKicker: 'Why a deep dive',
    asideHeading: 'We don’t advise. We become your foundation.',
    asideBody: 'A deep dive isn’t a sales call dressed up. It’s the first hour of the work: us assessing how you actually run, against the eight pillars of our method, so the time we hand back is real and measured.',
    asidePoints: [
      { icon: 'check', title: 'Eight pillars, one honest score', text: 'We assess your whole operation, not the symptom you walked in with.' },
      { icon: 'clock', title: 'Hours quantified, not promised', text: 'You leave knowing exactly where the time goes, and where it comes back.' },
      { icon: 'scan', title: 'No stone unturned', text: 'We look everywhere the hours hide, even the places you’ve stopped checking.' },
    ],
    sectors: DEFAULT_SECTORS.map((label) => ({ label })),
    email: 'dx@greatstonesoftware.co.uk',
  },
  render: (props) => <BookDeepDive {...props} />,
};

export default BookDeepDive;
