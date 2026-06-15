import { useReveal } from './reveal.js';

const initials = (name) => (name || '').trim().split(/\s+/).map((w) => w[0] || '').slice(0, 2).join('').toUpperCase();

// The people strip: senior hands, named. Avatar initials are derived from the name, so editing
// a name updates the badge automatically.
export function Team({ kicker, heading, items = [] }) {
  const ref = useReveal([items.length]);
  return (
    <section ref={ref} className="b-team">
      <div className="wrap">
        {kicker ? <span className="kicker" data-reveal>{kicker}</span> : null}
        {heading ? <h2 className="b-team-head" data-reveal>{heading}</h2> : null}
        <div className="team-grid">
          {items.map((m, i) => (
            <div className="card team-card" data-reveal style={{ transitionDelay: `${i * 55}ms` }} key={i}>
              <span className="avatar" aria-hidden="true">{initials(m.name)}</span>
              <div><div className="t-name">{m.name}</div><div className="t-role">{m.role}</div></div>
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
.team-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(16px,2.4vw,30px);margin-top:clamp(28px,4vh,48px)}
@media(max-width:820px){.team-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:520px){.team-grid{grid-template-columns:1fr}}
.team-card{display:flex;align-items:center;gap:16px}
.team-card .avatar{flex:none;width:52px;height:52px;border-radius:50%;display:grid;place-items:center;font-weight:900;font-size:.95rem;
  color:var(--gs-accent);background:radial-gradient(circle at 32% 28%,rgba(27,80,57,.9),rgba(14,49,34,.9));border:1px solid var(--gs-border);letter-spacing:.02em}
.team-card .t-name{font-weight:700;font-size:1rem;line-height:1.2}
.team-card .t-role{font-size:.82rem;color:var(--gs-faint);margin-top:2px}
`;

const T = (name, role) => ({ name, role });

export const puck = {
  label: 'Team',
  fields: {
    kicker: { type: 'text', label: 'Kicker', contentEditable: true },
    heading: { type: 'text', label: 'Heading', contentEditable: true },
    items: {
      type: 'array', label: 'People',
      arrayFields: { name: { type: 'text', label: 'Name' }, role: { type: 'text', label: 'Role' } },
      defaultItemProps: { name: 'New person', role: 'Role' },
      getItemSummary: (item) => item.name || 'Person',
    },
  },
  defaultProps: {
    kicker: 'The People', heading: 'Senior hands, on the floor with you.',
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
