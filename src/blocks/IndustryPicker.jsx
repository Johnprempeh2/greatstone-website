import { useEffect, useRef, useState, useCallback, useId } from 'react';
import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';
import { resolveLink } from '../lib/link-resolver.mjs';
import { LinkField } from '../cms/LinkField.jsx';
import { RichTextField } from '../cms/RichTextField.jsx';
import EditableText from './EditableText.jsx'; // inline-on-canvas edit while editing, static RichText on the public site

// IndustryPicker: industries.html's signature interaction. A role=tablist of sector chips with a
// travelling lime underline; choosing a sector crossfades the right-hand "specific drains" card and
// swaps an aria-live headline, while the left "universal drains" card holds constant. Faithful port of
// .picker (.chip-row + .chip-underline + .ind-headline + .swap with .drain-card universal/specific).
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// the live accents the payoff sentence ("More time …"); generalise to "accent everything after the
// first sentence break" so it holds even when marketing rewrites the copy.
function Headline({ text }) {
  if (!text) return null;
  const i = text.indexOf('. ');
  if (i === -1) return text;
  return <>{text.slice(0, i + 2)}<span className="accent">{text.slice(i + 2)}</span></>;
}

export function IndustryPicker({
  universalHead = 'The universal drains',
  universalTitle = 'Everyone leaks here.',
  universal = [],
  universalFoot = '', universalFootAccent = '',
  specificHead = 'Specific to your world',
  specificFoot = '', specificFootAccent = '',
  ctaLabel = '', ctaHref = '#book',
  industries = [],
  id, puck,
}) {
  const ref = useReveal([industries.length]);
  const editing = puck && puck.isEditing;
  const n = industries.length;
  const [active, setActive] = useState(0);     // chip + underline track this immediately
  const uid = useId();                         // stable id base for the tab ↔ tabpanel wiring
  const tabId = (i) => uid + 'tab' + i;
  const panelId = uid + 'panel';
  const [display, setDisplay] = useState(0);   // the specific card lags by the crossfade
  const [swapping, setSwapping] = useState(false);
  const [bar, setBar] = useState({ left: 0, width: 0 });
  const chips = useRef([]);
  const timer = useRef(null);

  const measure = useCallback((i) => {
    const c = chips.current[i];
    if (c) setBar({ left: c.offsetLeft, width: c.offsetWidth });
  }, []);

  // keep active/display valid if the editor trims the industries array
  useEffect(() => {
    if (active > n - 1) { setActive(0); setDisplay(0); setSwapping(false); }
  }, [n, active]);

  // the underline needs layout + settled fonts: measure after a double rAF on mount / active change,
  // and again on resize (offsetLeft/Width shift when the chips reflow).
  useEffect(() => {
    let a, b;
    a = requestAnimationFrame(() => { b = requestAnimationFrame(() => measure(active)); });
    const onR = () => measure(active);
    addEventListener('resize', onR, { passive: true });
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b); removeEventListener('resize', onR); };
  }, [active, n, measure]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const select = (i) => {
    if (i === active || i < 0 || i >= n) return;
    setActive(i);
    if (reduced()) { setDisplay(i); setSwapping(false); return; }
    setSwapping(true);                       // fade out, swap the data, fade back in
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setDisplay(i); setSwapping(false); }, 220);
  };

  const onKey = (e) => {
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (active + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (active - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next != null) { e.preventDefault(); select(next); chips.current[next]?.focus(); }
  };

  const cur = industries[display] || {};
  const curDrains = Array.isArray(cur.drains) ? cur.drains : [];

  return (
    <section ref={ref} className="b-ind section--tight">
      <div className="wrap b-ind-picker" data-reveal>
        <div className="b-ind-chip-row" role="tablist" aria-label="Choose your industry">
          {industries.map((ind, i) => (
            <button
              key={i}
              ref={(el) => { chips.current[i] = el; }}
              className="b-ind-chip" type="button" role="tab"
              id={tabId(i)} aria-controls={panelId}
              aria-selected={i === active ? 'true' : 'false'}
              tabIndex={i === active ? 0 : -1}
              onClick={() => select(i)}
              onKeyDown={onKey}
            >{ind.label}</button>
          ))}
          <span className="b-ind-underline" aria-hidden="true"
            style={{ width: bar.width + 'px', transform: `translateX(${bar.left}px)` }} />
        </div>

        <h2 className="b-ind-headline" aria-live="polite"><Headline text={cur.headline} /></h2>

        <div className={'b-ind-swap' + (swapping ? ' is-swapping' : '')}
          id={panelId} role="tabpanel" aria-labelledby={tabId(active)} tabIndex={ctaLabel ? -1 : 0}>
          <div className="grid cols-2">

            <article className="card b-ind-card universal">
              <span className="b-ind-num" aria-hidden="true">⊘</span>
              <EditableText editing={editing} id={id} field="universalHead" value={universalHead} as="p" className="b-ind-head" singleLine placeholder="Eyebrow…" />
              <EditableText editing={editing} id={id} field="universalTitle" value={universalTitle} as="h3" singleLine placeholder="Title…" />
              <ul className="b-ind-drains">
                {universal.map((d, i) => <li key={i}><EditableText editing={editing} id={id} arrayField="universal" index={i} field="text" value={d.text} as="span" placeholder="Drain…" /></li>)}
              </ul>
              {(universalFoot || universalFootAccent || editing) ? (
                <p className="b-ind-foot"><EditableText editing={editing} id={id} field="universalFoot" value={universalFoot} as="span" singleLine placeholder="Footer lead…" /> <span className="accent">{universalFootAccent}</span></p>
              ) : null}
            </article>

            <article className="card b-ind-card specific">
              <span className="b-ind-num" aria-hidden="true">◆</span>
              <EditableText editing={editing} id={id} field="specificHead" value={specificHead} as="p" className="b-ind-head" singleLine placeholder="Eyebrow…" />
              {/* the specific card shows the ACTIVE industry (index=display); editing writes back to that
                  tab's own title/drains via the nested path */}
              <EditableText editing={editing} id={id} arrayField="industries" index={display} field="specificTitle" value={cur.specificTitle} as="h3" singleLine placeholder="Title…" />
              {/* re-key on the shown industry so the row-in stagger re-fires on each swap */}
              <ul className="b-ind-drains" key={display}>
                {curDrains.map((d, i) => <li key={i}><EditableText editing={editing} id={id} path={[{ key: 'industries', index: display }, { key: 'drains', index: i }]} field="text" value={d.text} as="span" placeholder="Drain…" /></li>)}
              </ul>
              {(specificFoot || specificFootAccent || editing) ? (
                <p className="b-ind-foot"><EditableText editing={editing} id={id} field="specificFoot" value={specificFoot} as="span" singleLine placeholder="Footer lead…" /> <span className="accent">{specificFootAccent}</span></p>
              ) : null}
              {/* capture intent at the peak moment: the visitor has just seen their sector's drains.
                  #book is routed to the booking flow by App's global interceptor. */}
              {ctaLabel ? <a className="b-cta b-ind-cta" {...resolveLink(ctaHref)}>{ctaLabel}<Arrow /></a> : null}
            </article>

          </div>
        </div>
      </div>
    </section>
  );
}

export const css = `
.b-ind-picker{position:relative}
.b-ind-chip-row{position:relative;display:flex;flex-wrap:wrap;gap:10px;padding-bottom:16px;margin-bottom:6px}
.b-ind-chip{position:relative;z-index:1;font-family:inherit;cursor:pointer;font-size:.86rem;font-weight:700;
  letter-spacing:.01em;padding:.72em 1.25em;border-radius:100px;color:var(--gs-text-muted);background:var(--gs-card);
  border:1px solid var(--gs-border-soft);
  transition:color var(--gs-dur) var(--gs-ease),background var(--gs-dur) var(--gs-ease),
    border-color var(--gs-dur) var(--gs-ease),box-shadow var(--gs-dur) var(--gs-ease),transform var(--gs-dur) var(--gs-ease)}
.b-ind-chip:hover{color:var(--gs-text);border-color:var(--gs-accent-mid);transform:translateY(-1px)}
.b-ind-chip[aria-selected="true"]{color:#0e1611;background:var(--gs-accent);border-color:var(--gs-accent);
  box-shadow:0 8px 30px -10px var(--gs-accent-glow)}
.b-ind-chip:focus-visible{outline:2px solid var(--gs-accent);outline-offset:3px}
@media(pointer:coarse){.b-ind-chip{min-height:44px;display:inline-flex;align-items:center}}
.b-ind-underline{position:absolute;left:0;bottom:0;height:2px;width:0;background:var(--gs-accent);border-radius:2px;
  box-shadow:0 0 12px var(--gs-accent-glow);pointer-events:none;
  transition:transform .55s var(--gs-ease),width .55s var(--gs-ease)}
.b-ind-headline{margin:30px 0 8px;min-height:1.2em;font-size:clamp(1.4rem,2.8vw,2.2rem);font-weight:800;
  letter-spacing:-.02em;line-height:1.2;transition:opacity .35s var(--gs-ease),transform .45s var(--gs-ease)}
.b-ind-swap{margin-top:26px;transition:opacity .35s var(--gs-ease),transform .45s var(--gs-ease)}
.b-ind-swap.is-swapping{opacity:0;transform:translateY(14px)}
.b-ind-card{height:100%}
.b-ind-card.specific{display:flex;flex-direction:column}
.b-ind-cta{margin-top:auto;align-self:flex-start;padding-top:20px}
.b-ind-num{display:inline-flex;align-items:center;gap:.55em;margin-bottom:14px;font-size:.78rem;font-weight:700;
  letter-spacing:.2em;color:var(--gs-accent)}
.b-ind-head{font-size:.72rem;font-weight:700;letter-spacing:.26em;text-transform:uppercase}
.b-ind-card.universal .b-ind-head{color:var(--gs-text-faint)}
.b-ind-card.specific .b-ind-head{color:var(--gs-accent)}
.b-ind-card h3{margin:4px 0 18px;font-size:clamp(1.15rem,2vw,1.55rem);font-weight:800}
.b-ind-drains{list-style:none;display:flex;flex-direction:column;gap:0;padding:0;margin:0}
.b-ind-drains li{position:relative;padding:13px 0 13px 30px;font-size:.96rem;color:var(--gs-text-muted);
  line-height:1.45;border-top:1px solid var(--gs-border-soft)}
.b-ind-drains li:first-child{border-top:0}
.b-ind-drains li::before{content:'';position:absolute;left:2px;top:1.05em;width:9px;height:9px;border-radius:2px;
  transform:rotate(45deg)}
.b-ind-card.universal .b-ind-drains li::before{background:var(--gs-text-faint);opacity:.55}
.b-ind-card.specific .b-ind-drains li::before{background:var(--gs-accent);box-shadow:0 0 10px var(--gs-accent-glow)}
.b-ind-swap .b-ind-card.specific .b-ind-drains li{animation:gsIndRowIn .5s var(--gs-ease) both}
.b-ind-swap .b-ind-card.specific .b-ind-drains li:nth-child(1){animation-delay:.04s}
.b-ind-swap .b-ind-card.specific .b-ind-drains li:nth-child(2){animation-delay:.10s}
.b-ind-swap .b-ind-card.specific .b-ind-drains li:nth-child(3){animation-delay:.16s}
.b-ind-swap .b-ind-card.specific .b-ind-drains li:nth-child(4){animation-delay:.22s}
.b-ind-swap .b-ind-card.specific .b-ind-drains li:nth-child(5){animation-delay:.28s}
@keyframes gsIndRowIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}
.b-ind-foot{margin-top:20px;padding-top:18px;border-top:1px solid var(--gs-border-soft);font-size:.92rem;color:var(--gs-text-faint)}
.b-ind-foot .accent{color:var(--gs-accent);font-weight:700}
@media(prefers-reduced-motion:reduce){
  .b-ind-swap,.b-ind-headline,.b-ind-underline{transition:none !important}
  .b-ind-swap.is-swapping{opacity:1;transform:none}
  .b-ind-swap .b-ind-card.specific .b-ind-drains li{animation:none !important}
  .b-ind-chip:hover{transform:none}
}
`;

const DRAIN = (arr) => arr.map((text) => ({ text }));

export const puck = {
  label: 'Industry picker',
  fields: {
    universalHead: { type: 'custom', label: 'Universal card · eyebrow', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    universalTitle: { type: 'custom', label: 'Universal card · title', render: (props) => <RichTextField {...props} variant="heading" /> },
    universalFoot: { type: 'custom', label: 'Universal footer · lead', render: (props) => <RichTextField {...props} /> },
    universalFootAccent: { type: 'text', label: 'Universal footer · accent' },
    specificHead: { type: 'custom', label: 'Specific card · eyebrow', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    specificFoot: { type: 'custom', label: 'Specific footer · lead', render: (props) => <RichTextField {...props} /> },
    specificFootAccent: { type: 'text', label: 'Specific footer · accent' },
    ctaLabel: { type: 'text', label: 'Specific card · CTA label (blank to hide)' },
    ctaHref: { type: 'custom', label: 'Specific card · CTA link', render: (props) => <LinkField {...props} /> },
    // array fields LAST — Puck mis-slots custom fields placed before an array when other fields follow
    // it (see memory "puck-slot-misdetection-inline-editing")
    universal: {
      type: 'array', label: 'Universal drains',
      arrayFields: { text: { type: 'custom', label: 'Drain', render: (props) => <RichTextField {...props} /> } },
      defaultItemProps: { text: 'A drain every business pays.' },
      getItemSummary: (i) => i.text || 'Drain',
    },
    industries: {
      type: 'array', label: 'Industries (tabs)',
      arrayFields: {
        label: { type: 'text', label: 'Tab label' },
        headline: { type: 'text', label: 'Headline (sentences after the first are accented)' },
        specificTitle: { type: 'custom', label: 'Specific card title', render: (props) => <RichTextField {...props} variant="heading" /> },
        drains: {
          type: 'array', label: 'Sector drains',
          arrayFields: { text: { type: 'custom', label: 'Drain', render: (props) => <RichTextField {...props} /> } },
          defaultItemProps: { text: 'A sector-specific drain.' },
          getItemSummary: (i) => i.text || 'Drain',
        },
      },
      defaultItemProps: {
        label: 'Industry', headline: 'Less time on admin. More time on the work.',
        specificTitle: 'What this sector quietly loses.', drains: [],
      },
      getItemSummary: (i) => i.label || 'Industry',
    },
  },
  defaultProps: {
    universalHead: 'The universal drains',
    universalTitle: 'Everyone leaks here.',
    universal: DRAIN([
      'Meeting triage and scheduling ping-pong',
      "Re-keying data between systems that don't talk",
      'Rebuilding the same weekly reports',
      'Chasing approvals and signatures',
      'Hunting for documents',
      'Reconciling numbers by hand',
    ]),
    universalFoot: 'The same quiet tax every business pays:',
    universalFootAccent: 'we close these for all of them.',
    specificHead: 'Specific to your world',
    specificFoot: 'Where your sector quietly bleeds hours:',
    specificFootAccent: 'we leave no stone unturned.',
    ctaLabel: 'Book a Diagnostic',
    ctaHref: '#book',
    industries: [
      { label: 'Real estate', headline: 'Less time on portals. More time closing.', specificTitle: 'What real estate quietly loses.', drains: DRAIN(['Pulling comps and area research by hand', 'Re-listing the same property across every portal', 'Drafting near-identical property descriptions', 'Chasing solicitors, surveyors and brokers', 'Matching new stock to buyers manually']) },
      { label: 'Healthcare', headline: 'Less time on admin. More time on patients.', specificTitle: 'What healthcare quietly loses.', drains: DRAIN(['Re-typing patient details across disconnected systems', 'Manual appointment reminders and no-show chasing', 'Coding and submitting claims by hand', 'Compiling compliance and audit reports from scratch', 'Routing referrals and results between teams']) },
      { label: 'Education', headline: 'Less time on paperwork. More time teaching.', specificTitle: 'What education quietly loses.', drains: DRAIN(['Re-keying enrolment data across SIS, LMS and finance', 'Building timetables and cover schedules by hand', 'Chasing parental consent and permission forms', 'Collating attendance and progress reports', 'Drafting near-identical letters home']) },
      { label: 'Financial services', headline: 'Less time reconciling. More time advising.', specificTitle: 'What financial services quietly loses.', drains: DRAIN(['Manual KYC and onboarding document checks', 'Re-keying figures between spreadsheets and core systems', 'Assembling client reports and statements by hand', 'Chasing signatures on agreements and disclosures', 'Pulling together regulatory and audit packs']) },
      { label: 'Manufacturing', headline: 'Less time on the clipboard. More time on the line.', specificTitle: 'What manufacturing quietly loses.', drains: DRAIN(['Re-entering orders between ERP, shop floor and accounts', 'Tracking inventory and stock levels on spreadsheets', 'Chasing purchase-order approvals with suppliers', 'Logging quality checks and compliance by hand', 'Rebuilding production and downtime reports each week']) },
      { label: 'Professional services', headline: 'Less time on the timesheet. More time on the work.', specificTitle: 'What professional services quietly loses.', drains: DRAIN(['Reconstructing billable hours from memory', 'Drafting near-identical proposals and SOWs', 'Chasing invoice approvals and late payments', 'Hunting for the latest version of a document', 'Copying client data between CRM and delivery tools']) },
      { label: 'Retail & hospitality', headline: 'Less time behind the scenes. More time with guests.', specificTitle: 'What retail & hospitality quietly loses.', drains: DRAIN(['Reconciling sales across POS, online and marketplaces', 'Re-keying stock counts and supplier orders', 'Building rotas and shift cover by hand', 'Chasing supplier invoices and approvals', 'Stitching together weekly sales and footfall reports']) },
    ],
  },
  render: (props) => <IndustryPicker {...props} />,
};

export default IndustryPicker;
