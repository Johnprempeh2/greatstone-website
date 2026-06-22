import { useEffect, useRef, useState, useId } from 'react';
import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';
import { safeHref } from '../lib/safe-url.js';
// three.js is imported DYNAMICALLY inside the effect (not statically) so this editor-registered but
// heavy 3D block never drags three.js onto the public critical path.

// The methodology, in three dimensions: the eight pillars as emerald gems you can hover and
// click, with a synced detail panel and accessible tabs. The 3D is code-owned; marketing
// edits the intro and each pillar's copy. The gem order follows the eight pillar icons.
export function PillarExplorer({ index, eyebrow, headline, highlight, body, items = [] }) {
  const reveal = useReveal();
  const hostRef = useRef(null);
  const handleRef = useRef(null);
  const tabRefs = useRef([]);
  const [selected, setSelected] = useState(0);
  const uid = useId();                 // stable id base for the tab ↔ tabpanel wiring
  const tabId = (i) => uid + 'tab' + i;
  const panelId = uid + 'panel';

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
  // roving-tabindex keyboard nav across the tablist; routes through choose() so the 3D gem stays in sync
  const onKey = (e) => {
    const n = items.length; if (!n) return;
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (selected + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (selected - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next != null) { e.preventDefault(); choose(next); tabRefs.current[next] && tabRefs.current[next].focus(); }
  };
  const active = items[selected] || items[0] || {};

  return (
    <section ref={reveal} className="b-pillarx">
      <div className="wrap">
        <div className="b-chapter-eyebrow" data-reveal>
          {index ? <span className="b-chapter-num">{index}</span> : null}
          {eyebrow ? <span className="b-chapter-name">{eyebrow}</span> : null}
        </div>
        {(headline || highlight) ? (<h2 className="b-pillarx-head" data-reveal>{headline}{highlight ? <> <span className="accent">{highlight}</span></> : null}</h2>) : null}
        {body ? <p className="b-pillarx-body" data-reveal>{body}</p> : null}

        <div className="b-pillarx-stage" data-reveal>
          <div className="b-pillarx-canvas" ref={hostRef} aria-hidden="true" />
          <aside className="b-pillarx-detail" id={panelId} role="tabpanel" aria-labelledby={tabId(selected)} tabIndex={0}>
            <span className="b-pillarx-n">{String(selected + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}</span>
            <h3>{active.title}</h3>
            <p>{active.text}</p>
            {active.href ? <a className="b-pillarx-cta" href={safeHref(active.href)}>{active.linkLabel || 'Inspect this pillar'}<Arrow /></a> : null}
          </aside>
        </div>

        <div className="b-pillarx-tabs" role="tablist" aria-label="Choose a pillar">
          {items.map((it, i) => (
            <button key={i} ref={(el) => { tabRefs.current[i] = el; }} role="tab"
              id={tabId(i)} aria-controls={panelId} aria-selected={i === selected} tabIndex={i === selected ? 0 : -1}
              className={'b-pillarx-tab' + (i === selected ? ' is-active' : '')} onClick={() => choose(i)} onKeyDown={onKey}>
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
.b-pillarx-head{font-size:clamp(2rem,4.5vw,3.6rem);font-weight:900;line-height:1.05;letter-spacing:-.025em;max-width:18ch}
.b-pillarx-body{margin-top:20px;color:var(--gs-muted);font-size:clamp(1.02rem,1.5vw,1.18rem);max-width:62ch;line-height:1.7}
.b-pillarx-stage{display:grid;grid-template-columns:1.5fr 1fr;gap:clamp(18px,3vw,40px);align-items:center;margin-top:clamp(28px,4vw,44px)}
@media(max-width:860px){.b-pillarx-stage{grid-template-columns:1fr}}
.b-pillarx-canvas{height:clamp(340px,46vh,520px);min-width:0}
.b-pillarx-canvas canvas{width:100%;height:100%;display:block}
.b-pillarx-detail{background:var(--gs-card);border:1px solid var(--gs-border-soft);border-radius:18px;padding:clamp(22px,2.6vw,32px);backdrop-filter:blur(6px);min-width:0}
.b-pillarx-n{font-size:.72rem;font-weight:900;letter-spacing:.12em;color:var(--gs-accent);font-variant-numeric:tabular-nums}
.b-pillarx-detail h3{margin-top:12px;font-size:clamp(1.3rem,2.2vw,1.7rem);font-weight:800;letter-spacing:-.01em;overflow-wrap:anywhere}
.b-pillarx-detail p{margin-top:12px;color:var(--gs-muted);font-size:1rem;line-height:1.65}
.b-pillarx-cta{margin-top:18px;display:inline-flex;align-items:center;gap:7px;font-size:.82rem;font-weight:800;
  letter-spacing:.04em;color:var(--gs-accent);text-decoration:none}
.b-pillarx-cta svg{transition:transform .25s var(--gs-ease)}
.b-pillarx-cta:hover svg{transform:translateX(4px)}
.b-pillarx-tabs{display:flex;flex-wrap:wrap;gap:8px;margin-top:clamp(20px,3vw,30px)}
.b-pillarx-tab{background:var(--gs-card);border:1px solid var(--gs-border-soft);border-radius:100px;
  padding:8px 16px;font-family:'Montserrat',sans-serif;font-size:.8rem;font-weight:700;color:var(--gs-muted);cursor:pointer;
  transition:color .25s var(--gs-ease),border-color .25s var(--gs-ease),background .25s var(--gs-ease)}
.b-pillarx-tab:hover{color:var(--gs-text);border-color:var(--gs-border)}
.b-pillarx-tab.is-active{color:#0e1611;background:var(--gs-accent);border-color:var(--gs-accent)}
@media(pointer:coarse){.b-pillarx-tab{min-height:44px;display:inline-flex;align-items:center}}
`;

const P = (title, text, href = '', linkLabel = '') => ({ title, text, href, linkLabel });

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
      arrayFields: {
        title: { type: 'text', label: 'Title' },
        text: { type: 'textarea', label: 'Description' },
        href: { type: 'text', label: 'Link (optional)' },        // a per-pillar link the panel shows as a CTA
        linkLabel: { type: 'text', label: 'Link label' },
      },
      defaultItemProps: { title: 'Pillar', text: 'A short, honest read.', href: '', linkLabel: 'Inspect this pillar' },
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
