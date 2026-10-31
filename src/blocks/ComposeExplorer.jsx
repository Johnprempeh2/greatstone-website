import { useMemo, useState } from 'react';
import { RichTextField } from '../cms/RichTextField.jsx';
import EditableText from './EditableText.jsx';
import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';
import { useServices, serviceSlug } from '../store/services.mjs';
import { addService, openCart } from '../store/cart.mjs';
import { track } from '../lib/analytics.js';
import { PRIMARY_CTA_HREF } from '../lib/brand.mjs';
import { resolveProblems, groupServices, toggleSlug, summarise, countMessage } from '../lib/compose-explorer.mjs';
import { problems as DEFAULT_PROBLEMS } from '../data/compose-problems.mjs';
import { services as CATALOG_SERVICES } from '../data/service-catalog.mjs';

// ComposeExplorer (GRE-3407): pick a business problem and the catalogue services that compose the answer light up
// (emerald with a lime edge, the rest dim); or build your own by toggling services directly. A summary counts the
// services and the areas they touch, and sends the selection to the shared basket. Services, names and categories
// come from the live catalogue (ServicesContext); problems come from this block's `problems` field, seeded from
// src/data/compose-problems.mjs. Nothing about a service is typed here.

export function ComposeExplorer({ id, puck, eyebrow, heading, body, customLabel, basketLabel, quoteLabel, quoteHref, problems }) {
  const editing = !!puck?.isEditing;
  const ref = useReveal();
  const { services, categories } = useServices();
  const list = useMemo(() => resolveProblems(problems, services), [problems, services]);
  const groups = useMemo(() => groupServices(services, categories), [services, categories]);
  const [active, setActive] = useState(null); // a problem id, 'custom', or null
  const [selected, setSelected] = useState(() => new Set());
  const sum = useMemo(() => summarise(selected, services), [selected, services]);
  const litOrder = useMemo(() => new Map(sum.chosen.map((s, i) => [serviceSlug(s), i])), [sum.chosen]);

  const pickProblem = (p) => {
    if (active === p.id) { setActive(null); setSelected(new Set()); return; }
    setActive(p.id); setSelected(new Set(p.services));
    track('compose_problem', { problem: p.id });
  };
  const buildOwn = () => {
    if (active === 'custom') { setActive(null); setSelected(new Set()); return; }
    setActive('custom'); setSelected(new Set());
  };
  // toggling a service directly turns the current answer into the visitor's own build
  const toggle = (slug) => { setActive('custom'); setSelected((cur) => toggleSlug(cur, slug)); };
  const addAll = () => {
    sum.chosen.forEach((s) => addService({ slug: serviceSlug(s), name: s.name, category: s.category }));
    track('compose_add_to_basket', { problem: active || 'none', count: sum.count });
    openCart();
  };

  return (
    <section ref={ref} className="b-compose">
      <div className="wrap">
        <div className="b-compose-head" data-reveal>
          <EditableText editing={editing} id={id} field="eyebrow" value={eyebrow} as="p" className="kicker" singleLine />
          <EditableText editing={editing} id={id} field="heading" value={heading} as="h2" className="b-compose-h2" singleLine />
          <EditableText editing={editing} id={id} field="body" value={body} as="p" className="b-compose-body" />
        </div>

        <div className={'b-compose-layout' + (selected.size ? ' is-lit' : '')}>
          <div className="b-compose-problems" role="group" aria-label="Business problems" data-reveal>
            {list.map((p, i) => (
              <button key={p.id} type="button" className={'b-compose-problem' + (active === p.id ? ' is-on' : '')}
                aria-pressed={active === p.id} onClick={() => pickProblem(p)}>
                <EditableText editing={editing} id={id} arrayField="problems" index={i} field="title" value={p.title} as="span" className="b-compose-ptitle" singleLine />
                {p.subline ? <EditableText editing={editing} id={id} arrayField="problems" index={i} field="subline" value={p.subline} as="span" className="b-compose-psub" singleLine /> : null}
                {editing && p.placeholder ? <span className="b-compose-flag">Placeholder: John to confirm</span> : null}
              </button>
            ))}
            <button type="button" className={'b-compose-problem is-own' + (active === 'custom' ? ' is-on' : '')}
              aria-pressed={active === 'custom'} onClick={buildOwn}>
              <span className="b-compose-ptitle">{customLabel}</span>
              <span className="b-compose-psub">Pick services yourself from all {services.length}.</span>
            </button>
          </div>

          <aside className="b-compose-summary" aria-label="Your selection">
            <p className="b-compose-count" role="status" aria-live="polite">{countMessage(sum)}</p>
            {sum.areas.length ? (
              <ul className="b-compose-areas" aria-label="Areas this touches">
                {sum.areas.map((a) => <li key={a}>{a}</li>)}
              </ul>
            ) : <p className="b-compose-hint">Pick a problem above, or choose services from the catalogue.</p>}
            <div className="b-compose-ctas">
              <button type="button" className="b-compose-cta is-fill" disabled={!sum.count} onClick={addAll}>
                {basketLabel}{sum.count ? ` (${sum.count})` : ''}
              </button>
              <a className="b-compose-cta" href={quoteHref || PRIMARY_CTA_HREF}>{quoteLabel}<Arrow /></a>
            </div>
          </aside>

          <div className="b-compose-board">
            {groups.map((g) => (
              <div key={g.name} className="b-compose-group">
                <h3 className="b-compose-gname">{g.name}</h3>
                <div className="b-compose-tiles" role="group" aria-label={g.name}>
                  {g.services.map((s) => {
                    const slug = serviceSlug(s);
                    const on = selected.has(slug);
                    return (
                      <button key={slug} type="button" className={'b-compose-tile' + (on ? ' is-on' : '')}
                        aria-pressed={on} onClick={() => toggle(slug)}
                        style={on ? { '--i': Math.min(litOrder.get(slug) || 0, 10) } : undefined}>
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export const css = `
.b-compose{padding:clamp(80px,10vw,144px) 0;position:relative}
.b-compose-head{max-width:62ch;margin-bottom:clamp(28px,4vw,48px)}
.b-compose-h2{margin-top:.5em;font-size:clamp(2rem,4vw,2.75rem);font-weight:800;line-height:1.08;letter-spacing:-.025em}
.b-compose-body{margin-top:1rem;color:var(--gs-text-muted);font-size:clamp(1rem,1.4vw,1.12rem);line-height:1.7}
.b-compose-layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;grid-template-areas:"problems problems" "board summary";gap:clamp(20px,3vw,36px)}
.b-compose-problems{grid-area:problems;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px}
.b-compose-problem{display:flex;flex-direction:column;gap:6px;min-height:44px;text-align:left;padding:18px 20px;font-family:inherit;
  color:var(--gs-text);background:var(--gs-card);border:1px solid var(--gs-border-soft);border-radius:24px;cursor:pointer;
  transition:border-color .25s var(--gs-ease),background-color .25s var(--gs-ease),transform .25s var(--gs-ease)}
.b-compose-problem:hover{border-color:var(--gs-border-strong);transform:translateY(-2px)}
.b-compose-problem:focus-visible,.b-compose-tile:focus-visible,.b-compose-cta:focus-visible{outline:2px solid var(--gs-accent);outline-offset:3px}
.b-compose-problem.is-on{background:var(--gs-emerald);border-color:var(--gs-accent)}
.b-compose-problem.is-own{border-style:dashed}
.b-compose-problem.is-own.is-on{border-style:solid}
.b-compose-ptitle{font-size:1rem;font-weight:800;line-height:1.3;letter-spacing:-.01em}
.b-compose-psub{font-size:.88rem;line-height:1.5;color:var(--gs-text-muted)}
.b-compose-problem.is-on .b-compose-psub{color:var(--gs-text)}
.b-compose-flag{align-self:flex-start;margin-top:4px;font-size:.66rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;
  color:var(--gs-bg);background:var(--gs-warning);border-radius:6px;padding:3px 7px}
.b-compose-board{grid-area:board;display:flex;flex-direction:column;gap:22px;min-width:0}
.b-compose-gname{font-size:.75rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--gs-text-faint);margin-bottom:10px}
.b-compose-tiles{display:flex;flex-wrap:wrap;gap:8px}
.b-compose-tile{--i:0;min-height:44px;max-width:100%;padding:10px 16px;font-family:inherit;font-size:.86rem;font-weight:600;line-height:1.3;text-align:left;
  color:var(--gs-text-muted);background:var(--gs-card);border:1px solid var(--gs-border-soft);border-radius:999px;cursor:pointer;
  transition:color .25s var(--gs-ease),background-color .25s var(--gs-ease),border-color .25s var(--gs-ease),box-shadow .25s var(--gs-ease),transform .25s var(--gs-ease);
  transition-delay:calc(var(--i) * 24ms)}
.b-compose-tile:hover{color:var(--gs-text);border-color:var(--gs-border-strong)}
.b-compose-layout.is-lit .b-compose-tile:not(.is-on){color:var(--gs-text-faint);background:transparent;border-color:rgba(255,255,255,.04)}
.b-compose-layout.is-lit .b-compose-tile:not(.is-on):hover{color:var(--gs-text-muted);border-color:var(--gs-border-soft)}
.b-compose-tile.is-on{color:var(--gs-text);background:var(--gs-emerald);border-color:var(--gs-accent);
  box-shadow:0 0 0 1px var(--gs-accent-mid),0 0 22px var(--gs-accent-glow);transform:translateY(-1px)}
.b-compose-summary{grid-area:summary;align-self:start;position:sticky;top:96px;display:flex;flex-direction:column;gap:14px;
  padding:24px;background:var(--gs-card);border:1px solid var(--gs-border-soft);border-radius:24px}
.b-compose-count{font-size:1.15rem;font-weight:800;line-height:1.3}
.b-compose-hint{color:var(--gs-text-muted);font-size:.9rem;line-height:1.55}
.b-compose-areas{list-style:none;display:flex;flex-wrap:wrap;gap:6px}
.b-compose-areas li{font-size:.75rem;font-weight:700;color:var(--gs-accent);background:var(--gs-accent-soft);border:1px solid var(--gs-border);border-radius:999px;padding:4px 10px}
.b-compose-ctas{display:flex;flex-direction:column;gap:10px;margin-top:4px}
.b-compose-cta{display:inline-flex;align-items:center;justify-content:center;gap:.5em;min-height:44px;padding:0 20px;font-family:inherit;
  font-size:.8rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;color:var(--gs-text);
  background:transparent;border:1px solid var(--gs-text);border-radius:999px;cursor:pointer;transition:background-color .2s var(--gs-ease),color .2s var(--gs-ease)}
.b-compose-cta:hover{background:var(--gs-text);color:var(--gs-bg)}
.b-compose-cta svg{width:14px;height:14px}
.b-compose-cta.is-fill{color:var(--gs-bg);background:var(--gs-accent);border-color:var(--gs-accent)}
.b-compose-cta.is-fill:hover{background:var(--gs-text);border-color:var(--gs-text)}
.b-compose-cta:disabled{cursor:not-allowed;color:var(--gs-text-faint);background:transparent;border-color:var(--gs-border-soft)}
@media(max-width:900px){
  .b-compose-layout{grid-template-columns:minmax(0,1fr);grid-template-areas:"problems" "board" "summary"}
  .b-compose-summary{position:static;background:var(--gs-bg-deep);padding:16px 18px}
  /* once something is lit, the summary rides along the bottom while the visitor browses the board */
  .b-compose-layout.is-lit .b-compose-summary{position:sticky;bottom:12px;z-index:2}
  /* and keyboard focus scrolls clear of it, never hidden behind the bar */
  html:has(.b-compose-layout.is-lit){scroll-padding-bottom:240px}
  .b-compose-ctas{flex-direction:row;flex-wrap:wrap}
  .b-compose-ctas .b-compose-cta{flex:1 1 140px}
}
@media(max-width:600px){
  .b-compose-summary{gap:10px;padding:14px 16px}
  .b-compose-count{font-size:1rem}
  .b-compose-areas{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
  .b-compose-areas li{flex:none}
  .b-compose-ctas .b-compose-cta{flex:1 1 auto;padding:0 12px;font-size:.72rem;letter-spacing:.04em;white-space:nowrap}
}
@media(prefers-reduced-motion:reduce){
  .b-compose-problem,.b-compose-tile,.b-compose-cta{transition:none}
  .b-compose-problem:hover,.b-compose-tile.is-on{transform:none}
}
@media print{.b-compose-summary{position:static}.b-compose-tile{box-shadow:none}}
`;

const SERVICE_OPTIONS = CATALOG_SERVICES.map((s) => ({ label: `${s.category}: ${s.name}`, value: s.slug }));

export const puck = {
  label: 'Compose explorer',
  fields: {
    eyebrow: { type: 'custom', label: 'Eyebrow', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    heading: { type: 'custom', label: 'Heading', render: (props) => <RichTextField {...props} variant="heading" /> },
    body: { type: 'custom', label: 'Introduction', render: (props) => <RichTextField {...props} /> },
    customLabel: { type: 'text', label: '"Build your own" label' },
    basketLabel: { type: 'text', label: 'Basket button label' },
    quoteLabel: { type: 'text', label: 'Quote link label' },
    quoteHref: { type: 'text', label: 'Quote link' },
    problems: {
      type: 'array', label: 'Business problems',
      arrayFields: {
        id: { type: 'text', label: 'Id (lowercase, for analytics)' },
        title: { type: 'text', label: 'Problem' },
        subline: { type: 'text', label: 'Subline' },
        source: { type: 'text', label: 'Source (where a client said this)' },
        placeholder: { type: 'radio', label: 'Placeholder', options: [{ label: 'Yes, John to confirm', value: true }, { label: 'No, confirmed', value: false }] },
        services: {
          type: 'array', label: 'Services that compose the answer',
          arrayFields: { slug: { type: 'select', label: 'Service', options: SERVICE_OPTIONS } },
          defaultItemProps: { slug: SERVICE_OPTIONS[0]?.value || '' },
          getItemSummary: (i) => i.slug || 'Service',
        },
      },
      defaultItemProps: { id: 'new-problem', title: 'A problem clients describe', subline: '', source: '', placeholder: true, services: [] },
      getItemSummary: (i) => i.title || 'Problem',
    },
  },
  defaultProps: {
    eyebrow: 'Compose the answer',
    heading: 'Start with the problem, not the product.',
    body: 'Pick what is getting in the way. The services that solve it light up, drawn from the full catalogue. Or build your own and take the list to a conversation with us.',
    customLabel: 'Or build your own',
    basketLabel: 'Add to basket',
    quoteLabel: 'Request a quote',
    quoteHref: PRIMARY_CTA_HREF,
    problems: DEFAULT_PROBLEMS.map((p) => ({ ...p, services: p.services.map((slug) => ({ slug })) })),
  },
  render: (props) => <ComposeExplorer {...props} />,
};

export default ComposeExplorer;
