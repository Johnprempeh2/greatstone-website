import { useState, useMemo, useId } from 'react';
import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';
import { safeMailto } from '../lib/safe-url.js';
import { track } from '../lib/analytics.js';
import { categories as CATALOG_CATEGORIES, services as CATALOG_SERVICES, umbrella as UMBRELLA } from '../data/service-catalog.mjs';

// ServiceCatalog: the browsable, productized catalogue of everything Greatstone can build and run.
// A search box + category chips filter a responsive grid of service cards. Each card carries a format
// badge, the one-line promise, an expandable "what we build / outcome / ideal for" panel, and an
// "Inquire" CTA that composes a prefilled mailto naming the service (client-side, no backend — the same
// pattern BookDeepDive uses). Flagship services are accented. Built from the live brand tokens so it
// sits inside the existing site without a restyle.

// The catalogue's `format` field is a full engagement sentence (e.g. "Fixed-scope build, then an
// embedded build-and-run subscription"). The card badge wants a short tag, so we distil one engagement
// type from it; the full sentence still shows in the expanded "How we deliver it" line. Order matters —
// check the most specific signal first.
function shortFormat(f) {
  const s = (f || '').toLowerCase();
  if (/\b(assessment|audit|diagnostic|workshop|discovery)\b/.test(s) && !/\bbuild\b/.test(s)) return 'Assessment';
  const hasBuild = /\b(build|web app|platform|deployment|microsite|landing page|site)\b/.test(s);
  const optionalRun = /optional[^.,;]*\b(retainer|care plan|subscription|run-and|maintenance|support plan|hosting)/.test(s);
  const hasRun = /\b(retainer|subscription|managed|run-and|run rate|run cost|hosted and operated|operated by|per-seat|per-minute|per-cycle|per-event|monthly)\b/.test(s);
  if (hasBuild && hasRun && !optionalRun) return 'Build + Run';
  if (hasBuild) return 'Build';
  if (/\bintegration\b/.test(s)) return 'Integration';
  if (hasRun) return 'Subscription';
  return 'Engagement';
}

// derive the chip list from the services present, honouring an explicit category order when given
function useCategories(services, categoryOrder) {
  return useMemo(() => {
    const counts = new Map();
    for (const s of services) {
      const c = (s && s.category) || 'Other';
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    const ordered = [];
    (categoryOrder || []).forEach((c) => { if (counts.has(c)) { ordered.push(c); counts.delete(c); } });
    for (const c of counts.keys()) ordered.push(c); // any categories not in the order, appended
    return ordered;
  }, [services, categoryOrder]);
}

export function ServiceCatalog({
  kicker, heading, highlight, intro, inquiryEmail = 'dx@greatstonesoftware.co.uk',
  bookLabel, bookHref = '#book', categories = [], services = [], searchPlaceholder = 'Search services…',
}) {
  const ref = useReveal([services.length]);
  const uid = useId();
  const [active, setActive] = useState('All');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null); // index of the expanded card, or null

  const catNames = useCategories(services, categories.map((c) => c.name));
  const blurbFor = useMemo(() => {
    const m = new Map(); categories.forEach((c) => m.set(c.name, c.blurb)); return m;
  }, [categories]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return services
      .map((s, i) => ({ ...s, _i: i }))
      .filter((s) => active === 'All' || s.category === active)
      .filter((s) => {
        if (!q) return true;
        const hay = [s.name, s.oneLiner, s.category, s.outcome, s.idealClient, ...(s.bullets || []).map((b) => b.text)]
          .filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
  }, [services, active, query]);

  const inquire = (s) => {
    const subject = 'Service inquiry · ' + (s.name || 'Greatstone services');
    const body = [
      'I would like to inquire about: ' + (s.name || ''),
      s.oneLiner ? '(' + s.oneLiner + ')' : '',
      '',
      'A little about us / what we are trying to solve:',
      '',
      '',
      'Company:',
      'Where the time goes right now:',
    ].filter((l) => l !== undefined).join('\n');
    track('generate_lead', { form: 'service_inquiry', service: s.name || '' });
    const to = safeMailto(inquiryEmail);
    if (to !== '#') {
      const href = to + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      try { if (typeof window !== 'undefined') window.location.href = href; } catch (e) { /* ignore */ }
    }
  };

  return (
    <section ref={ref} className="b-cat">
      <div className="wrap">
        {(kicker || heading || highlight || intro) ? (
          <div className="b-cat-head" data-reveal>
            {kicker ? <span className="kicker">{kicker}</span> : null}
            {(heading || highlight) ? (
              <h2 className="b-cat-h2">{heading} {highlight ? <span className="accent">{highlight}</span> : null}</h2>
            ) : null}
            {intro ? <p className="b-cat-intro">{intro}</p> : null}
          </div>
        ) : null}

        <div className="b-cat-controls" data-reveal>
          <div className="b-cat-search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            <input
              type="search" className="b-cat-input" placeholder={searchPlaceholder}
              aria-label="Search services" value={query} onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="b-cat-chips" role="group" aria-label="Filter by category">
            <button type="button" className={'b-cat-chip' + (active === 'All' ? ' is-on' : '')}
              aria-pressed={active === 'All'} onClick={() => setActive('All')}>
              All <span className="b-cat-chip-n">{services.length}</span>
            </button>
            {catNames.map((c) => {
              const n = services.filter((s) => s.category === c).length;
              return (
                <button key={c} type="button" className={'b-cat-chip' + (active === c ? ' is-on' : '')}
                  aria-pressed={active === c} onClick={() => { setActive(c); setOpen(null); }}>
                  {c} <span className="b-cat-chip-n">{n}</span>
                </button>
              );
            })}
          </div>
        </div>

        {active !== 'All' && blurbFor.get(active) ? (
          <p className="b-cat-catblurb" data-reveal>{blurbFor.get(active)}</p>
        ) : null}

        <p className="b-cat-count" aria-live="polite">
          {filtered.length === services.length
            ? `${services.length} services`
            : `Showing ${filtered.length} of ${services.length}`}
        </p>

        {filtered.length === 0 ? (
          <div className="b-cat-empty" data-reveal>
            <p>No services match “{query}”. Tell us what you’re trying to solve and we’ll scope it.</p>
            <a className="b-cta" href={safeMailto(inquiryEmail)}>Email us<Arrow /></a>
          </div>
        ) : (
          <div className="b-cat-grid">
            {filtered.map((s) => {
              const isOpen = open === s._i;
              const panelId = uid + 'p' + s._i;
              return (
                <article key={s._i} className={'card b-cat-card' + (s.featured ? ' is-flag' : '') + (isOpen ? ' is-open' : '')} data-reveal>
                  <div className="b-cat-card-top">
                    {s.format ? <span className="b-cat-fmt">{shortFormat(s.format)}</span> : null}
                    {s.featured ? <span className="b-cat-flag">Flagship</span> : null}
                  </div>
                  <h3 className="b-cat-name">{s.name}</h3>
                  {s.oneLiner ? <p className="b-cat-one">{s.oneLiner}</p> : null}

                  {(Array.isArray(s.bullets) && s.bullets.length) || s.outcome || s.idealClient ? (
                    <>
                      <button type="button" className="b-cat-toggle" aria-expanded={isOpen} aria-controls={panelId}
                        onClick={() => setOpen(isOpen ? null : s._i)}>
                        {isOpen ? 'Hide details' : 'What we build'}
                        <span className={'b-cat-caret' + (isOpen ? ' up' : '')} aria-hidden="true">
                          <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
                        </span>
                      </button>
                      <div id={panelId} className="b-cat-panel" hidden={!isOpen}>
                        {Array.isArray(s.bullets) && s.bullets.length ? (
                          <ul className="b-cat-list">
                            {s.bullets.map((b, j) => <li key={j}>{b.text}</li>)}
                          </ul>
                        ) : null}
                        {s.outcome ? <p className="b-cat-out"><span>The payback</span>{s.outcome}</p> : null}
                        {s.idealClient ? <p className="b-cat-ideal"><span>Ideal for</span>{s.idealClient}</p> : null}
                        {s.format ? <p className="b-cat-deliver"><span>How we deliver it</span>{s.format}</p> : null}
                      </div>
                    </>
                  ) : null}

                  <div className="b-cat-card-foot">
                    <button type="button" className="b-cta b-cat-inq" onClick={() => inquire(s)}>
                      Inquire<Arrow />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {bookLabel ? (
          <div className="b-cat-foot" data-reveal>
            <p>Not sure which you need? Start with the read that prices the rest.</p>
            <a className="b-cta b-cat-book" href={bookHref}>{bookLabel}<Arrow /></a>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export const css = `
.b-cat{padding:clamp(40px,6vw,88px) 0;position:relative}
.b-cat-head{text-align:center;max-width:60ch;margin:0 auto clamp(28px,4vw,44px)}
.b-cat-h2{margin-top:.4em;font-size:clamp(1.9rem,4.2vw,3.2rem);font-weight:900;letter-spacing:-.025em;line-height:1.05}
.b-cat-intro{margin-top:1rem;color:var(--gs-text-muted);font-size:1.02rem;line-height:1.6}
/* controls: search + chips */
.b-cat-controls{display:flex;flex-direction:column;gap:16px;margin-bottom:14px}
.b-cat-search{position:relative;max-width:420px;margin:0 auto;width:100%}
.b-cat-search svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);width:17px;height:17px;
  stroke:var(--gs-faint);fill:none;stroke-width:1.9;stroke-linecap:round}
.b-cat-input{width:100%;font-family:inherit;font-size:.96rem;color:var(--gs-text);
  background:rgba(255,255,255,.03);border:1px solid var(--gs-border-soft);border-radius:999px;padding:.72em 1em .72em 2.6em;
  transition:border-color .25s var(--gs-ease),background .25s var(--gs-ease),box-shadow .25s var(--gs-ease)}
.b-cat-input::placeholder{color:var(--gs-faint)}
.b-cat-input:focus{outline:none;border-color:var(--gs-accent-mid,rgba(200,255,0,.4));background:rgba(200,255,0,.04);box-shadow:0 0 0 3px var(--gs-accent-soft)}
.b-cat-chips{display:flex;flex-wrap:wrap;gap:9px;justify-content:center}
.b-cat-chip{display:inline-flex;align-items:center;gap:.5em;font-family:inherit;font-size:.86rem;font-weight:600;
  color:var(--gs-text-muted);background:rgba(255,255,255,.02);border:1px solid var(--gs-border-soft);
  border-radius:999px;padding:.46em .9em;cursor:pointer;transition:all .2s var(--gs-ease)}
.b-cat-chip:hover{color:var(--gs-text);border-color:var(--gs-border)}
.b-cat-chip.is-on{color:var(--gs-bg,#0d100e);background:var(--gs-accent);border-color:var(--gs-accent);font-weight:700}
.b-cat-chip-n{font-size:.72rem;font-weight:700;opacity:.7}
.b-cat-chip.is-on .b-cat-chip-n{opacity:.6}
.b-cat-catblurb{text-align:center;max-width:62ch;margin:2px auto 0;color:var(--gs-text-muted);font-size:.96rem;line-height:1.55}
.b-cat-count{text-align:center;margin:18px 0 22px;font-size:.78rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--gs-faint)}
/* grid */
.b-cat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:clamp(14px,1.6vw,20px);align-items:start}
.b-cat-card{position:relative;display:flex;flex-direction:column;padding:clamp(20px,2.2vw,26px);height:100%}
.b-cat-card.is-flag{border-color:var(--gs-accent-mid,rgba(200,255,0,.4));background:linear-gradient(180deg,var(--gs-accent-soft),transparent 60%)}
.b-cat-card-top{display:flex;align-items:center;gap:8px;margin-bottom:14px;min-height:22px}
.b-cat-fmt{font-size:.68rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--gs-accent);
  background:var(--gs-accent-soft);border:1px solid var(--gs-border);border-radius:6px;padding:.3em .6em}
.b-cat-flag{margin-left:auto;font-size:.66rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--gs-accent)}
.b-cat-name{font-size:1.12rem;font-weight:800;line-height:1.2;letter-spacing:-.01em;margin-bottom:.45em}
.b-cat-one{color:var(--gs-text-muted);font-size:.92rem;line-height:1.55;margin-bottom:1em}
.b-cat-toggle{display:inline-flex;align-items:center;gap:.4em;margin-top:auto;font-family:inherit;font-size:.8rem;font-weight:700;
  letter-spacing:.04em;color:var(--gs-accent);background:none;border:0;padding:0;cursor:pointer;align-self:flex-start}
.b-cat-caret svg{width:15px;height:15px;stroke:var(--gs-accent);fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;transition:transform .25s var(--gs-ease)}
.b-cat-caret.up svg{transform:rotate(180deg)}
.b-cat-panel{margin-top:.9em;border-top:1px solid var(--gs-border-soft);padding-top:.9em}
.b-cat-list{list-style:none;display:grid;gap:.45em;padding:0;margin:0 0 .9em}
.b-cat-list li{position:relative;padding-left:1.3em;font-size:.86rem;line-height:1.5;color:var(--gs-text)}
.b-cat-list li::before{content:'';position:absolute;left:0;top:.55em;width:6px;height:6px;border-radius:50%;
  background:var(--gs-accent);box-shadow:0 0 9px var(--gs-accent-glow)}
.b-cat-out,.b-cat-ideal,.b-cat-deliver{font-size:.84rem;line-height:1.5;color:var(--gs-text-muted);margin:.5em 0 0}
.b-cat-out span,.b-cat-ideal span,.b-cat-deliver span{display:block;font-size:.66rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--gs-faint);margin-bottom:.2em}
.b-cat-card-foot{margin-top:1.1em;padding-top:.2em}
.b-cat-inq{width:100%;justify-content:center;font-size:.9rem;padding:.7em 1em}
.b-cat-empty{text-align:center;padding:40px 0;color:var(--gs-text-muted)}
.b-cat-empty .b-cta{margin-top:14px}
.b-cat-foot{text-align:center;margin-top:clamp(32px,5vw,56px);display:flex;flex-direction:column;align-items:center;gap:14px}
.b-cat-foot p{color:var(--gs-text-muted);font-size:.98rem}
@media(max-width:520px){.b-cat-grid{grid-template-columns:1fr}}
`;

export const puck = {
  label: 'Service catalogue',
  fields: {
    kicker: { type: 'text', label: 'Kicker', contentEditable: true },
    heading: { type: 'text', label: 'Heading', contentEditable: true },
    highlight: { type: 'text', label: 'Highlighted word', contentEditable: true },
    intro: { type: 'textarea', label: 'Intro', contentEditable: true },
    searchPlaceholder: { type: 'text', label: 'Search placeholder' },
    inquiryEmail: { type: 'text', label: 'Inquiry email' },
    bookLabel: { type: 'text', label: 'Footer CTA label (blank = hide)' },
    bookHref: { type: 'text', label: 'Footer CTA link' },
    categories: {
      type: 'array', label: 'Categories (order + blurbs)',
      arrayFields: {
        name: { type: 'text', label: 'Name' },
        blurb: { type: 'text', label: 'Blurb' },
      },
      defaultItemProps: { name: 'Category', blurb: '' },
      getItemSummary: (i) => i.name || 'Category',
    },
    services: {
      type: 'array', label: 'Services',
      arrayFields: {
        category: { type: 'text', label: 'Category' },
        name: { type: 'text', label: 'Name' },
        oneLiner: { type: 'textarea', label: 'One-liner' },
        format: { type: 'text', label: 'Format (Build / Build + Run / Subscription …)' },
        featured: { type: 'radio', label: 'Flagship', options: [{ label: 'No', value: false }, { label: 'Yes', value: true }] },
        outcome: { type: 'textarea', label: 'Outcome' },
        idealClient: { type: 'text', label: 'Ideal for' },
        bullets: {
          type: 'array', label: 'What we build',
          arrayFields: { text: { type: 'text', label: 'Item' } },
          defaultItemProps: { text: 'A deliverable.' },
          getItemSummary: (i) => i.text || 'Item',
        },
      },
      defaultItemProps: { category: 'AI Agents & Assistants', name: 'New service', oneLiner: 'What it does.', format: 'Build', featured: false, outcome: '', idealClient: '', bullets: [] },
      getItemSummary: (i) => i.name || 'Service',
    },
  },
  defaultProps: {
    kicker: UMBRELLA,
    heading: 'Everything we build,', highlight: 'and run for you.',
    intro: 'One catalogue of the systems we put to work for clients — the website, the storefront, the AI behind them, and the quiet automation that buys back the hours. Find what fits, inquire on it, and we’ll scope it against your numbers.',
    searchPlaceholder: 'Search services…',
    inquiryEmail: 'dx@greatstonesoftware.co.uk',
    bookLabel: 'Book a Diagnostic',
    bookHref: '#book',
    categories: CATALOG_CATEGORIES,
    services: CATALOG_SERVICES,
  },
  render: (props) => <ServiceCatalog {...props} />,
};

export default ServiceCatalog;
