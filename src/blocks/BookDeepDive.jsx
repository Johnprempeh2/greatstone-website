import { useState } from 'react';
import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';

const SECTORS = ['Professional Services', 'Financial Services', 'Healthcare & Life Sciences', 'Retail & E-commerce', 'Manufacturing & Industrial', 'Logistics & Supply Chain', 'Property & Construction', 'Other'];

// The "Book a Deep Dive" page: the booking form beside a short framing aside. PROTOTYPE — the
// form never transmits anything; submit shows a confirmation and points to email. The real
// build POSTs to Laravel (validated + stored server-side); this is the page design + UX only.
export function BookDeepDive({ eyebrow, headline, highlight, body, submitLabel, asideHeading, asidePoints = [], email = 'dx@greatstonesoftware.co.uk' }) {
  const ref = useReveal([asidePoints.length]);
  const [sent, setSent] = useState(false);
  return (
    <section ref={ref} className="b-book">
      <div className="wrap">
        <div className="b-chapter-eyebrow" data-reveal>
          {eyebrow ? <span className="b-chapter-name">{eyebrow}</span> : null}
        </div>
        <h2 className="b-book-head" data-reveal>{headline} {highlight ? <span className="accent">{highlight}</span> : null}</h2>
        {body ? <p className="b-book-body" data-reveal>{body}</p> : null}

        <div className="grid b-book-grid" data-reveal>
          <div className="card book-card">
            <span className="form-template-note">Template form</span>
            {sent ? (
              <div className="book-sent">
                <h3>Thanks. One more step.</h3>
                <p>This prototype doesn’t send anything yet. To book your Deep Dive now, email us and we’ll reply with times.</p>
                <a className="b-cta" href={`mailto:${email}`}>{email}</a>
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); setSent(true); }} noValidate>
                <div className="field-row">
                  <div className="field"><label htmlFor="f-name">Your name</label><input className="fld" id="f-name" type="text" placeholder="Jane Stonewell" autoComplete="name" /></div>
                  <div className="field"><label htmlFor="f-company">Company</label><input className="fld" id="f-company" type="text" placeholder="Stonewell & Co." autoComplete="organization" /></div>
                </div>
                <div className="field"><label htmlFor="f-email">Work email</label><input className="fld" id="f-email" type="email" placeholder="jane@stonewell.co" autoComplete="email" /></div>
                <div className="field"><label htmlFor="f-industry">Industry</label>
                  <select className="fld" id="f-industry" defaultValue=""><option value="" disabled>Choose your sector…</option>{SECTORS.map((s) => <option key={s}>{s}</option>)}</select>
                </div>
                <div className="field"><label htmlFor="f-week">Where does your week go?</label>
                  <textarea className="fld" id="f-week" placeholder="The reports nobody reads. The handoffs that get re-keyed. Tell us what quietly eats the hours." />
                </div>
                <button className="b-cta book-submit" type="submit">{submitLabel}<Arrow /></button>
                <p className="book-fine">A template form, submissions aren’t wired up yet. For now, email us direct below.</p>
              </form>
            )}
          </div>

          <aside className="book-aside">
            <h3 className="h3">{asideHeading}</h3>
            <ul className="b-book-points">
              {asidePoints.map((p, i) => <li key={i}><b>{p.title}</b>{p.text ? <> {p.text}</> : null}</li>)}
            </ul>
            <a className="b-book-mail" href={`mailto:${email}`}>{email}</a>
          </aside>
        </div>
      </div>
    </section>
  );
}

export const css = `
.b-book{padding:clamp(56px,9vw,120px) 0;position:relative}
.b-book-head{font-size:clamp(1.9rem,4.6vw,3.2rem);font-weight:900;line-height:1.03;letter-spacing:-.03em;max-width:18ch}
.b-book-body{margin-top:18px;color:var(--gs-muted);font-size:clamp(1.02rem,1.5vw,1.18rem);max-width:60ch;line-height:1.7}
.b-book-grid{grid-template-columns:1.15fr .85fr;gap:clamp(24px,4vw,56px);align-items:start;margin-top:clamp(28px,4vw,44px)}
@media(max-width:860px){.b-book-grid{grid-template-columns:1fr}}
.book-card{padding:clamp(26px,3.4vw,44px)}
.form-template-note{display:inline-flex;align-items:center;gap:.5em;margin-bottom:1.6rem;font-size:.72rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--gs-faint)}
.form-template-note::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--gs-accent);opacity:.7}
.field{margin-bottom:1.2rem}.field:last-of-type{margin-bottom:0}
.field label{display:block;font-size:.74rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--gs-muted);margin-bottom:.5rem}
.field-row{display:grid;grid-template-columns:1fr 1fr;gap:1.2rem}
@media(max-width:520px){.field-row{grid-template-columns:1fr}}
.fld{width:100%;font-family:inherit;font-size:.98rem;color:var(--gs-text);background:rgba(255,255,255,.03);border:1px solid var(--gs-border-soft);border-radius:10px;padding:.8em .9em;transition:border-color .25s var(--gs-ease),background .25s var(--gs-ease),box-shadow .25s var(--gs-ease)}
.fld::placeholder{color:var(--gs-faint)}
textarea.fld{resize:vertical;min-height:120px;line-height:1.55}
select.fld{appearance:none;-webkit-appearance:none;cursor:pointer}
select.fld option{background:#1b1f1d;color:var(--gs-text)}
.fld:focus{outline:none;border-color:var(--gs-accent-mid,rgba(200,255,0,.4));background:rgba(200,255,0,.04);box-shadow:0 0 0 3px var(--gs-accent-dim)}
.book-submit{margin-top:1.8rem;width:100%;justify-content:center}
.book-fine{margin-top:1rem;font-size:.74rem;color:var(--gs-faint);text-align:center}
.book-sent{text-align:center;padding:18px 0}
.book-sent h3{font-size:1.4rem;font-weight:800}
.book-sent p{margin:12px auto 22px;color:var(--gs-muted);max-width:42ch;line-height:1.6}
.book-aside .h3{margin-bottom:1rem}
.b-book-points{list-style:none;display:grid;gap:14px}
.b-book-points li{position:relative;padding-left:22px;color:var(--gs-muted);font-size:.96rem;line-height:1.6}
.b-book-points li::before{content:"";position:absolute;left:0;top:.6em;width:9px;height:9px;border-radius:2px;background:var(--gs-accent)}
.b-book-points li b{color:var(--gs-text);font-weight:700}
.b-book-mail{display:inline-block;margin-top:22px;color:var(--gs-accent);font-weight:700;border-bottom:1px solid var(--gs-border);padding-bottom:3px}
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
    asideHeading: { type: 'text', label: 'Aside heading', contentEditable: true },
    asidePoints: {
      type: 'array', label: 'What you get',
      arrayFields: { title: { type: 'text', label: 'Lead' }, text: { type: 'text', label: 'Note' } },
      defaultItemProps: { title: 'A point', text: 'detail.' },
      getItemSummary: (item) => item.title || 'Point',
    },
    email: { type: 'text', label: 'Contact email' },
  },
  defaultProps: {
    eyebrow: 'Tell us where the week goes',
    headline: 'Book a', highlight: 'Deep Dive.',
    body: 'Two hours of our time and a sharper picture of yours. No deck to sit through, no obligation after.',
    submitLabel: 'Book a Deep Dive',
    asideHeading: 'What you walk away with',
    asidePoints: [
      PT('A scored read', 'across all eight pillars of the method.'),
      PT('The Periscope Report', 'where you stand and the fastest gains.'),
      PT('A phased roadmap', 'the route up, embedded in how you work.'),
    ],
    email: 'dx@greatstonesoftware.co.uk',
  },
  render: (props) => <BookDeepDive {...props} />,
};

export default BookDeepDive;
