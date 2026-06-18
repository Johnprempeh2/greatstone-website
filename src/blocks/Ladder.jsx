import { useReveal } from './reveal.js';

// The organisation-posture strip: lagger to pioneer, read as a posture rather than a verdict.
// The dim-to-lime colour progression is code-owned (by position); marketing edits the copy.
export function Ladder({ kicker, headline, highlight, body, items = [] }) {
  const ref = useReveal([items.length]);
  return (
    <section ref={ref} className="b-ladder">
      <div className="wrap">
        <div className="center" data-reveal>
          {kicker ? <span className="kicker">{kicker}</span> : null}
          <h2 className="h2 b-ladder-head">{headline} {highlight ? <span className="accent">{highlight}</span> : null}</h2>
          {body ? <p className="lead b-ladder-body">{body}</p> : null}
        </div>
        <div className="phases">
          {items.map((it, i) => (
            <article className="phase" data-p={i + 1} data-reveal style={{ transitionDelay: `${i * 70}ms` }} key={i}>
              <div className="rank">{it.rank}</div>
              <h3>{it.name}</h3>
              <div className="range">{it.range}</div>
              <p>{it.text}</p>
              <div className="bar" aria-hidden="true" />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export const css = `
.b-ladder{padding:clamp(48px,8vh,90px) 0;position:relative}
.b-ladder-head{margin-top:14px;font-weight:900;letter-spacing:-.025em}
.b-ladder-body{margin:14px auto 0}
.phases{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:clamp(34px,5vh,56px)}
@media(max-width:880px){.phases{grid-template-columns:1fr 1fr}}
@media(max-width:520px){.phases{grid-template-columns:1fr}}
.phase{position:relative;border:1px solid var(--gs-border-soft);border-radius:16px;padding:22px 20px 24px;overflow:hidden;background:var(--gs-card);
  transition:transform .3s var(--gs-ease),border-color .3s var(--gs-ease)}
.phase:hover{transform:translateY(-4px)}
.phase::before{content:"";position:absolute;inset:0;opacity:.5;pointer-events:none;background:linear-gradient(160deg,var(--p1,transparent),transparent 60%)}
.phase .rank{font-size:.68rem;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:var(--gs-faint);position:relative}
.phase h3{font-size:1.5rem;margin:6px 0 2px;font-weight:800;position:relative}
.phase .range{font-size:.78rem;font-weight:700;color:var(--gs-muted);position:relative}
.phase p{font-size:.84rem;color:var(--gs-muted);margin-top:10px;line-height:1.5;position:relative}
.phase .bar{height:5px;border-radius:5px;margin-top:16px;background:var(--bar,var(--gs-border-soft));position:relative}
.phase[data-p="1"]{--p1:rgba(122,128,122,.10);--bar:linear-gradient(90deg,#4a4f4a,#5a5f5a)}
.phase[data-p="2"]{--p1:rgba(78,205,196,.08);--bar:linear-gradient(90deg,#3a6f64,#4ecdc4)}
.phase[data-p="3"]{--p1:rgba(140,200,40,.10);--bar:linear-gradient(90deg,#6f9a2a,#a6d92a)}
.phase[data-p="4"]{--p1:rgba(200,255,0,.14);--bar:linear-gradient(90deg,#a6d92a,var(--gs-accent));border-color:var(--gs-border)}
.phase[data-p="4"]:hover{border-color:var(--gs-accent-mid)}
.phase[data-p="4"] h3{color:var(--gs-accent)}
`;

const P = (rank, name, range, text) => ({ rank, name, range, text });

export const puck = {
  label: 'Ladder (posture)',
  fields: {
    kicker: { type: 'text', label: 'Kicker', contentEditable: true },
    headline: { type: 'text', label: 'Headline', contentEditable: true },
    highlight: { type: 'text', label: 'Highlighted word', contentEditable: true },
    body: { type: 'textarea', label: 'Body', contentEditable: true },
    items: {
      type: 'array', label: 'Phases (dim → lime)',
      arrayFields: {
        rank: { type: 'text', label: 'Rank' },
        name: { type: 'text', label: 'Name' },
        range: { type: 'text', label: 'Score range' },
        text: { type: 'textarea', label: 'Description' },
      },
      defaultItemProps: { rank: 'Phase 0', name: 'Stage', range: 'Score', text: 'What it looks like here.' },
      getItemSummary: (item) => item.name || 'Phase',
    },
  },
  defaultProps: {
    kicker: 'Where your organisation sits',
    headline: 'Laggard to', highlight: 'Pioneer.',
    body: 'Altitude isn’t a verdict, it’s a starting line. The same climb, read as a posture, dim to lime.',
    items: [
      P('Phase 01', 'Laggard', 'Score under 3', 'Behind the field and feeling it. The basics aren’t in place, so every day leaks time to work that should run itself.'),
      P('Phase 02', 'Follower', 'Score 3–5', 'Keeping pace by watching others. Capable, but reactive: reacting to the market instead of shaping your own move.'),
      P('Phase 03', 'Leader', 'Score 6–8', 'Out in front in your category. Systems compound, decisions move fast, and the hours you bought back fund the next gain.'),
      P('Phase 04', 'Pioneer', 'Score 9–10', 'Setting the standard others chase. Intelligent by default: the foundation is so deep that growth feels inevitable.'),
    ],
  },
  render: (props) => <Ladder {...props} />,
};

export default Ladder;
