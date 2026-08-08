import { useState } from 'react';
import { useReveal } from './reveal.js';
import { MediaField } from '../cms/MediaField.jsx';
import { RichTextField } from '../cms/RichTextField.jsx';
import EditableText from './EditableText.jsx'; // inline-on-canvas edit while editing, static RichText on the public site

const initials = (name) => (name || '').trim().split(/\s+/).map((w) => w[0] || '').slice(0, 2).join('').toUpperCase();

// A headshot that falls back to the initials badge if the photo is missing OR fails to load (a 404'd
// or moved URL), so a broken editor image never shows the browser's broken-image glyph.
function TeamAvatar({ photo, name }) {
  const [broken, setBroken] = useState(false);
  if (!photo || broken) return <span className="avatar" aria-hidden="true">{initials(name)}</span>;
  return <img className="avatar avatar-img" src={photo} alt={name || ''} loading="lazy" decoding="async" width="52" height="52" onError={() => setBroken(true)} />;
}

// The people strip: senior hands, named. A real photo if one is set, otherwise an initials
// badge derived from the name (so it always reads, even before headshots are added).
//
// A SLOT IS NOT A PERSON. Entries marked kind:'role' are seats that get named at kickoff, not colleagues.
// They used to render in exactly the same card as Ben, John and Naa, initials monogram included, so
// "Principal Engineer" became a lime "PE" badge indistinguishable from a real face. Anyone scanning the
// grid counted six senior people where there are three. The copy was honest; the design was not. Role
// seats now get an outlined card, a neutral mark rather than initials, and a label saying what they are.
export function Team({ id, puck, kicker, heading, body, items = [] }) {
  const ref = useReveal([items.length]);
  const editing = puck && puck.isEditing;
  return (
    <section ref={ref} className="b-team">
      <div className="wrap">
        <EditableText editing={editing} id={id} field="kicker" value={kicker} as="span" className="kicker" singleLine placeholder="Kicker…" data-reveal />
        <EditableText editing={editing} id={id} field="heading" value={heading} as="h2" className="b-team-head" singleLine placeholder="Heading…" data-reveal />
        <EditableText editing={editing} id={id} field="body" value={body} as="p" className="b-team-body lead" placeholder="Intro (optional)…" data-reveal />
        <div className="team-grid">
          {items.map((m, i) => (
            m.kind === 'role' ? (
              <div className="card team-card is-slot" data-reveal style={{ transitionDelay: `${i * 55}ms` }} key={i}>
                <span className="avatar avatar-slot" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="8" r="3.4" /><path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" /></svg>
                </span>
                <div className="t-meta">
                  <div className="t-name">{m.name}<span className="t-slotpill">Named at kickoff</span></div>
                  <div className="t-role">{m.role}</div>
                </div>
              </div>
            ) : (
              <div className="card team-card" data-reveal style={{ transitionDelay: `${i * 55}ms` }} key={i}>
                <div className="t-portrait">
                  <TeamAvatar photo={m.photo} name={m.name} />
                </div>
                <div className="t-meta"><div className="t-name">{m.name}</div><div className="t-role">{m.role}</div></div>
              </div>
            )
          ))}
        </div>
      </div>
    </section>
  );
}

export const css = `
.b-team{padding:clamp(48px,8vh,110px) 0;position:relative}
.b-team-head{font-size:clamp(1.7rem,3.4vw,2.6rem);font-weight:900;letter-spacing:-.025em;margin-top:12px}
.b-team-body{margin-top:1rem}
.team-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(16px,2.4vw,30px);margin-top:clamp(28px,4vh,48px)}
@media(max-width:820px){.team-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:680px){.team-grid{grid-template-columns:1fr}}
/* PORTRAIT FRAME. The people were a 52px initials disc beside a name, which reads as a photo that
   failed to load rather than as a considered state. It is now a real portrait-ratio frame at the size a
   headshot will occupy, with the initials set as deliberate typography on the brand surface. Nothing here
   pretends to be a face. When the photo field is set, the same frame fills with the image at
   object-fit:cover and the initials simply stop rendering, so no code changes when the photography lands. */
/* min-width:0 is load-bearing: grid items default to min-width:auto, so a child that will not shrink
   expands its own track. Without it these three tracks grew to 415px inside a 1052px container and
   pushed the page 61px wider than the viewport. */
.team-card{display:block;min-width:0}
.t-portrait{position:relative;width:100%;max-width:260px;aspect-ratio:4/5;border-radius:14px;overflow:hidden;
  border:1px solid var(--gs-border);background:
    radial-gradient(120% 90% at 28% 18%,rgba(27,80,57,.55),transparent 62%),
    linear-gradient(180deg,#161816,#101210);margin-bottom:16px}
.t-portrait::after{content:"";position:absolute;inset:auto 0 0 0;height:34%;pointer-events:none;
  background:linear-gradient(180deg,transparent,rgba(8,10,9,.55))}
.team-card .avatar{position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:0;background:none;
  display:grid;place-items:center;font-weight:900;letter-spacing:.06em;
  font-size:clamp(2.4rem,4.6vw,3.4rem);color:var(--gs-accent);opacity:.86}
.team-card .avatar-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:0;border:0}
.team-card.is-slot{border-style:dashed;background:transparent}
.team-card.is-slot .t-name{color:var(--gs-text-muted);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.team-card.is-slot .avatar-slot{position:relative;inset:auto;width:100%;max-width:260px;aspect-ratio:4/5;border-radius:14px;
  display:grid;place-items:center;background:none;border:1px dashed var(--gs-border-strong,rgba(200,255,0,.18));
  margin-bottom:16px}
.team-card .avatar-slot svg{width:34px;height:34px;stroke:var(--gs-text-faint)}
.t-slotpill{font-size:.56rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--gs-accent);
  border:1px solid var(--gs-accent);padding:2px 7px;border-radius:100px;white-space:nowrap}
.team-card .t-meta{min-width:0}
.team-card .t-name{font-weight:800;font-size:1.06rem;line-height:1.25;overflow-wrap:anywhere}
.team-card .t-role{font-size:.82rem;color:var(--gs-faint);margin-top:2px;overflow-wrap:anywhere}
`;

const T = (name, role) => ({ name, role, kind: 'person' });
const SLOT = (name, role) => ({ name, role, kind: 'role' });

export const puck = {
  label: 'Team',
  fields: {
    kicker: { type: 'custom', label: 'Kicker', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    heading: { type: 'custom', label: 'Heading', render: (props) => <RichTextField {...props} variant="heading" /> },
    body: { type: 'custom', label: 'Intro (optional)', render: (props) => <RichTextField {...props} /> },
    // array field stays LAST (see memory "puck-slot-misdetection-inline-editing")
    items: {
      type: 'array', label: 'People',
      arrayFields: {
        name: { type: 'text', label: 'Name' },
        role: { type: 'text', label: 'Role' },
        // an unfilled seat must never look like a colleague, so the distinction is explicit and editable
        kind: { type: 'radio', label: 'This entry is', options: [{ label: 'A person', value: 'person' }, { label: 'A role, named later', value: 'role' }] },
        photo: { type: 'custom', label: 'Photo', render: (props) => <MediaField {...props} /> },
      },
      defaultItemProps: { name: 'New person', role: 'Role', kind: 'person', photo: '' },
      getItemSummary: (item) => (item.kind === 'role' ? (item.name || 'Role') + ' (to be named)' : item.name || 'Person'),
    },
  },
  defaultProps: {
    kicker: 'The People', heading: 'Senior hands, on the floor with you.', body: '',
    items: [
      T('Ben Mensah', 'Founder & CEO'),
      T('John Prempeh', 'Senior DX Executive'),
      T('Naa Ayokor Harding', 'Product Manager'),
      SLOT('Principal Engineer', 'Named for your engagement'),
      SLOT('Delivery Lead', 'Named for your engagement'),
      SLOT('Design Director', 'Named for your engagement'),
    ],
  },
  render: (props) => <Team {...props} />,
};

export default Team;
