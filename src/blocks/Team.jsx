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
            <div className="card team-card" data-reveal style={{ transitionDelay: `${i * 55}ms` }} key={i}>
              <TeamAvatar photo={m.photo} name={m.name} />
              <div className="t-meta"><div className="t-name">{m.name}</div><div className="t-role">{m.role}</div></div>
            </div>
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
.team-card{display:flex;align-items:center;gap:16px}
.team-card .avatar{flex:none;width:52px;height:52px;border-radius:50%;display:grid;place-items:center;font-weight:900;font-size:.95rem;
  color:var(--gs-accent);background:radial-gradient(circle at 32% 28%,rgba(27,80,57,.9),rgba(14,49,34,.9));border:1px solid var(--gs-border);letter-spacing:.02em}
.team-card .avatar-img{object-fit:cover}
.team-card .t-meta{min-width:0}
.team-card .t-name{font-weight:700;font-size:1rem;line-height:1.2;overflow-wrap:anywhere}
.team-card .t-role{font-size:.82rem;color:var(--gs-faint);margin-top:2px;overflow-wrap:anywhere}
`;

const T = (name, role) => ({ name, role });

export const puck = {
  label: 'Team',
  fields: {
    kicker: { type: 'custom', label: 'Kicker', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    heading: { type: 'custom', label: 'Heading', render: (props) => <RichTextField {...props} variant="heading" /> },
    body: { type: 'custom', label: 'Intro (optional)', render: (props) => <RichTextField {...props} /> },
    // array field stays LAST (see memory "puck-slot-misdetection-inline-editing")
    items: {
      type: 'array', label: 'People',
      arrayFields: { name: { type: 'text', label: 'Name' }, role: { type: 'text', label: 'Role' }, photo: { type: 'custom', label: 'Photo', render: (props) => <MediaField {...props} /> } },
      defaultItemProps: { name: 'New person', role: 'Role', photo: '' },
      getItemSummary: (item) => item.name || 'Person',
    },
  },
  defaultProps: {
    kicker: 'The People', heading: 'Senior hands, on the floor with you.', body: '',
    items: [
      T('Ben Mensah', 'Founder & CEO'),
      T('John Prempeh', 'Senior DX Executive'),
      T('Naa Ayokor Harding', 'Product Manager'),
      T('Principal Engineer', 'Named for your engagement'),
      T('Delivery Lead', 'Named for your engagement'),
      T('Design Director', 'Named for your engagement'),
    ],
  },
  render: (props) => <Team {...props} />,
};

export default Team;
