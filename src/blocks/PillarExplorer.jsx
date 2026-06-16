import { useEffect, useRef, useState } from 'react';
import { useReveal } from './reveal.js';
// three.js is imported DYNAMICALLY inside the effect (not statically) so this editor-registered but
// heavy 3D block never drags three.js onto the public critical path.

// The methodology, in three dimensions: the eight pillars as emerald gems you can hover and
// click, with a synced detail panel and accessible tabs. The 3D is code-owned; marketing
// edits the intro and each pillar's copy. The gem order follows the eight pillar icons.
export function PillarExplorer({ index, eyebrow, headline, highlight, body, items = [] }) {
  const reveal = useReveal();
  const hostRef = useRef(null);
  const handleRef = useRef(null);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    const host = hostRef.current; if (!host) return undefined;
    let handle; let alive = true;
    // dynamic import: three.js loads only when this block actually mounts, never on the public critical path
    import('../lib/pillar-explorer.mjs').then(({ mountPillarExplorer }) => {
      if (!alive || !hostRef.current) return;
      try {
        handle = mountPillarExplorer(host, {
          envUrl: import.meta.env.BASE_URL + 'env-emerald.jpg',
          initial: 0, onSelect: (i) => setSelected(i),
        });
        handleRef.current = handle;
      } catch (e) { /* if WebGL is unavailable, the tabs + detail panel still work */ }
    }).catch(() => { /* chunk failed to load: tabs + detail panel still work */ });
    return () => { alive = false; if (handle && handle.destroy) handle.destroy(); };
  }, []);

  const choose = (i) => { setSelected(i); if (handleRef.current) handleRef.current.setSelected(i); };
  const active = items[selected] || items[0] || {};

  return (
    <section ref={reveal} className="b-pillarx">
      <div className="wrap">
        <div className="b-chapter-eyebrow" data-reveal>
          {index ? <span className="b-chapter-num">{index}</span> : null}
          {eyebrow ? <span className="b-chapter-name">{eyebrow}</span> : null}
        </div>
        <h2 className="b-pillarx-head" data-reveal>{headline} {highlight ? <span className="accent">{highlight}</span> : null}</h2>
        {body ? <p className="b-pillarx-body" data-reveal>{body}</p> : null}

        <div className="b-pillarx-stage" data-reveal>
          <div className="b-pillarx-canvas" ref={hostRef} aria-hidden="true" />
          <aside className="b-pillarx-detail">
            <span className="b-pillarx-n">{String(selected + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}</span>
            <h3>{active.title}</h3>
            <p>{active.text}</p>
          </aside>
        </div>

        <div className="b-pillarx-tabs" role="tablist">
          {items.map((it, i) => (
            <button key={i} role="tab" aria-selected={i === selected}
              className={'b-pillarx-tab' + (i === selected ? ' is-active' : '')} onClick={() => choose(i)}>
              {it.title}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export const css = `
.b-pillarx{padding:clamp(64px,11vw,140px) 0;position:relative}
.b-pillarx-head{font-size:clamp(1.9rem,4.6vw,3.2rem);font-weight:900;line-height:1.03;letter-spacing:-.03em;max-width:18ch}
.b-pillarx-body{margin-top:20px;color:var(--gs-muted);font-size:clamp(1.02rem,1.5vw,1.18rem);max-width:62ch;line-height:1.7}
.b-pillarx-stage{display:grid;grid-template-columns:1.5fr 1fr;gap:clamp(18px,3vw,40px);align-items:center;margin-top:clamp(28px,4vw,44px)}
@media(max-width:860px){.b-pillarx-stage{grid-template-columns:1fr}}
.b-pillarx-canvas{height:clamp(340px,46vh,520px);min-width:0}
.b-pillarx-canvas canvas{width:100%;height:100%;display:block}
.b-pillarx-detail{background:var(--gs-card);border:1px solid var(--gs-border-soft);border-radius:18px;padding:clamp(22px,2.6vw,32px);backdrop-filter:blur(6px)}
.b-pillarx-n{font-size:.72rem;font-weight:900;letter-spacing:.12em;color:var(--gs-accent);font-variant-numeric:tabular-nums}
.b-pillarx-detail h3{margin-top:12px;font-size:clamp(1.3rem,2.2vw,1.7rem);font-weight:800;letter-spacing:-.01em}
.b-pillarx-detail p{margin-top:12px;color:var(--gs-muted);font-size:1rem;line-height:1.65}
.b-pillarx-tabs{display:flex;flex-wrap:wrap;gap:8px;margin-top:clamp(20px,3vw,30px)}
.b-pillarx-tab{background:rgba(255,255,255,.04);border:1px solid var(--gs-border-soft);border-radius:100px;
  padding:8px 16px;font-family:'Montserrat',sans-serif;font-size:.8rem;font-weight:700;color:var(--gs-muted);cursor:pointer;
  transition:color .25s var(--gs-ease),border-color .25s var(--gs-ease),background .25s var(--gs-ease)}
.b-pillarx-tab:hover{color:var(--gs-text);border-color:var(--gs-border)}
.b-pillarx-tab.is-active{color:#0e1611;background:var(--gs-accent);border-color:var(--gs-accent)}
`;

const P = (title, text) => ({ title, text });

export const puck = {
  label: 'Pillar explorer (3D)',
  fields: {
    index: { type: 'text', label: 'Number', contentEditable: true },
    eyebrow: { type: 'text', label: 'Eyebrow', contentEditable: true },
    headline: { type: 'text', label: 'Headline', contentEditable: true },
    highlight: { type: 'text', label: 'Highlighted word', contentEditable: true },
    body: { type: 'textarea', label: 'Body', contentEditable: true },
    items: {
      type: 'array', label: 'Pillars (eight, in order)',
      arrayFields: { title: { type: 'text', label: 'Title' }, text: { type: 'textarea', label: 'Description' } },
      defaultItemProps: { title: 'Pillar', text: 'A short, honest read.' },
      getItemSummary: (item) => item.title || 'Pillar',
    },
  },
  defaultProps: {
    index: '03', eyebrow: 'The Methodology',
    headline: 'Explore the eight', highlight: 'pillars.',
    body: 'Every engagement begins with the Digital Transformation Playbook: a rigorous diagnostic across eight pillars. Hover a gem, or pick a pillar, to see what we read.',
    items: [
      P('People', 'Know who moves what, and set them up to move it well.'),
      P('Communication', 'Make the value land, inside the business and out.'),
      P('Innovation', 'A repeatable way to find the next worthwhile change.'),
      P('Data', 'Map the lifecycle so the right decision is the easy one.'),
      P('Customer', 'See the whole relationship, not just the last ticket.'),
      P('Competition', 'Know the field, and where your edge actually is.'),
      P('Technology', 'A stack that earns its keep and bends when you need it to.'),
      P('Value', 'Tie every move back to money, time or risk.'),
    ],
  },
  render: (props) => <PillarExplorer {...props} />,
};

export default PillarExplorer;
