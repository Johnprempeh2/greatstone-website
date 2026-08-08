import { useState } from 'react';
import { useReveal } from './reveal.js';
import { MediaField } from '../cms/MediaField.jsx';
import { RichTextField } from '../cms/RichTextField.jsx';
import EditableText from './EditableText.jsx'; // inline-on-canvas edit while editing, static RichText on the public site
import { APPEARANCE_FIELD, APPEARANCE_DEFAULT } from '../cms/style-field.jsx';
import { appearanceClass } from '../lib/block-style.mjs';

// initials fallback for the avatar when no photo is set (first letters of up to two words)
const initials = (name) => String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

// Avatar that prefers the photo but falls back to initials, or a neutral person glyph when there are no
// initials either. Crucially it degrades to that fallback if the photo URL FAILS to load (mirrors
// Team.jsx's TeamAvatar), so a dead URL never leaves an empty circle. Decorative: the name carries meaning.
function QuoteAvatar({ photo, name }) {
  const [broken, setBroken] = useState(false);
  const ini = initials(name);
  return (
    <span className="quote-avatar" aria-hidden="true">
      {photo && !broken
        ? <img src={photo} alt="" loading="lazy" decoding="async" width="52" height="52" onError={() => setBroken(true)} />
        : ini
          ? <span className="quote-initials">{ini}</span>
          : <svg className="quote-initials-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="3.4" /><path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" strokeLinecap="round" /></svg>}
    </span>
  );
}

// A pull-quote: a single human line, lime quote marks, attribution. The optional "card" variant adds a
// face (photo or initials), a structured name/role/company, and an optional company logo, so a page can
// close on a real, credible, attributed voice instead of an anonymous line or another CTA. The plain
// variant (text + attr) is unchanged and fully backward-compatible.
export function Quote({ id, puck, text, attr, align = 'center', variant = 'plain', photo, name, role, company, companyLogo, appearance }) {
  const ref = useReveal();
  const editing = puck && puck.isEditing;
  // require an identity anchor (name or photo) so role/company alone never render a faceless empty card
  const hasCard = variant === 'card' && (name || photo);
  const roleLine = [role, company].filter(Boolean).join(', ');
  // The default is now empty (see defaultProps), so a freshly added block would otherwise render an
  // empty blockquote with an attribution dash and nothing in it. Render nothing publicly until there
  // is a quote to show; the editor still sees the block so it can be filled in.
  if (!text && !editing) return null;
  return (
    <section ref={ref} className={`b-quote align-${align}${hasCard ? ' has-card' : ''}`}>
      <div className={('wrap quote-wrap ' + appearanceClass(appearance)).trim()}>
        <blockquote className="quote" data-reveal><span className="mark" aria-hidden="true">“</span><EditableText editing={editing} id={id} field="text" value={text} as="span" placeholder="Quote…" /><span className="mark" aria-hidden="true">”</span></blockquote>
        {hasCard ? (
          <div className="quote-card" data-reveal>
            <QuoteAvatar photo={photo} name={name} />
            <span className="quote-who">
              {name ? <span className="quote-name">{name}</span> : null}
              {roleLine ? <span className="quote-role">{roleLine}</span> : null}
            </span>
            {companyLogo ? <img className="quote-clogo" src={companyLogo} alt={company ? company + ' logo' : ''} loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : null}
          </div>
        ) : (attr ? <cite className="quote-attr" data-reveal>{attr}</cite> : null)}
      </div>
    </section>
  );
}

export const css = `
.b-quote{padding:clamp(56px,9vw,120px) 0;position:relative}
.b-quote.align-center{text-align:center}
.b-quote .quote{font-weight:800;font-size:clamp(1.6rem,3.6vw,3rem);line-height:1.18;letter-spacing:-.02em;max-width:22ch}
.b-quote.align-center .quote{margin-inline:auto}
.b-quote .quote .mark{color:var(--gs-accent);font-size:1.1em;line-height:0}
.b-quote .quote-attr{display:block;margin-top:28px;font-size:.86rem;font-weight:700;font-style:normal;letter-spacing:.08em;text-transform:uppercase;color:var(--gs-muted)}
/* card variant: face + structured attribution */
.b-quote .quote-card{display:inline-flex;flex-wrap:wrap;align-items:center;gap:14px;margin-top:32px;text-align:left}
.b-quote.align-center .quote-card{justify-content:center}
.quote-avatar{flex:none;width:52px;height:52px;border-radius:50%;overflow:hidden;display:grid;place-items:center;
  background:var(--gs-accent-soft);border:1px solid var(--gs-border)}
.quote-avatar img{width:100%;height:100%;object-fit:cover}
.quote-initials{font-weight:800;font-size:1.05rem;color:var(--gs-accent);letter-spacing:.02em}
.quote-initials-icon{width:22px;height:22px;color:var(--gs-accent)}
.quote-who{display:flex;flex-direction:column;line-height:1.3;min-width:0}
.quote-name{font-weight:800;font-size:1rem;color:var(--gs-text)}
.quote-role{font-size:.84rem;color:var(--gs-text-muted)}
.quote-clogo{height:26px;width:auto;margin-left:6px;opacity:.85}
`;

export const puck = {
  label: 'Quote',
  fields: {
    text: { type: 'custom', label: 'Quote', render: (props) => <RichTextField {...props} /> },
    variant: { type: 'radio', label: 'Style', options: [{ label: 'Plain (attribution line)', value: 'plain' }, { label: 'Card (face + name)', value: 'card' }] },
    attr: { type: 'text', label: 'Attribution (plain style)', contentEditable: true },
    name: { type: 'text', label: 'Name (card style)' },
    role: { type: 'text', label: 'Role (card style)' },
    company: { type: 'text', label: 'Company (card style)' },
    photo: { type: 'custom', label: 'Photo (card, optional)', render: (props) => <MediaField {...props} /> },
    companyLogo: { type: 'custom', label: 'Company logo (card, optional)', render: (props) => <MediaField {...props} /> },
    align: { type: 'radio', label: 'Alignment', options: [{ label: 'Centre', value: 'center' }, { label: 'Left', value: 'left' }] },
    appearance: APPEARANCE_FIELD,
  },
  // Deliberately EMPTY, like LogoWall's logos and StatStrip's clients. This block used to ship a
  // complete, attributed customer testimonial as its default ("They didn't hand us a deck and
  // leave...", attributed to an Operations Director at a named-by-sector organisation). Anyone adding
  // a Quote block got a fabricated endorsement pre-filled and ready to publish, which is the single
  // easiest way for an untrue claim to reach the site. An editor must now type a real one.
  defaultProps: {
    text: '',
    attr: '',
    variant: 'plain', name: '', role: '', company: '', photo: '', companyLogo: '',
    align: 'center', appearance: APPEARANCE_DEFAULT,
  },
  render: (props) => <Quote {...props} />,
};

export default Quote;
