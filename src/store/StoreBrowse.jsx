// Live storefront listing — reads the Supabase data layer (RLS-gated, public catalogue).
// Faceted browse by vendor / category / platform + search + sort + load-more.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase.mjs';
import { listOfferings, listVendors, listCategories } from '../data/catalog.mjs';
import { fmtMoney } from '../lib/pricing.mjs';
import './store.css';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
// seeded image paths are 'assets/catalog/...'; assets live in public/catalog/ → resolve via BASE_URL
const img = (u) => !u ? '' : /^https?:|^data:/.test(u) ? u : BASE + String(u).replace(/^assets\//, '');
const PLATFORMS = ['.NET', 'Java', 'C++', 'Python', 'Android', 'JasperReports', 'Reporting Services', 'SharePoint'];
const PAGE = 24;

export default function StoreBrowse({ initialVendor = '' }) {
  const [vendors, setVendors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [page, setPage] = useState(1);
  const [vendor, setVendor] = useState(initialVendor);
  const [category, setCategory] = useState('');
  const [platform, setPlatform] = useState('');
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');           // debounced search term (avoids a query per keystroke)
  const [sort, setSort] = useState('featured');
  const [facetsOpen, setFacetsOpen] = useState(false);
  const reqSeq = useRef(0);                    // ignore out-of-order responses (rapid filter changes)

  useEffect(() => {
    if (!supabase) { setErr('Catalogue offline (Supabase env missing).'); setLoading(false); return; }
    listVendors(supabase).then(setVendors).catch(() => {});
    listCategories(supabase).then(setCategories).catch(() => {});
  }, []);

  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 250); return () => clearTimeout(t); }, [q]);

  const fetchPage = useCallback((p, reset) => {
    if (!supabase) return;
    const seq = ++reqSeq.current;
    setLoading(true);
    listOfferings(supabase, { vendor, category, platform, q: dq, sort, page: p, pageSize: PAGE })
      .then(r => { if (seq !== reqSeq.current) return; setTotal(r.total); setItems(prev => reset ? r.items : [...prev, ...r.items]); setErr(null); setLoading(false); })
      .catch(e => { if (seq !== reqSeq.current) return; console.error('listOfferings', e); setErr('Could not load the catalogue.'); setLoading(false); });
  }, [vendor, category, platform, dq, sort]);

  useEffect(() => { setPage(1); fetchPage(1, true); }, [fetchPage]);
  const loadMore = () => { const next = page + 1; setPage(next); fetchPage(next, false); };

  const active = !!(vendor || category || platform || q);
  const clearAll = () => { setVendor(''); setCategory(''); setPlatform(''); setQ(''); };

  return (
    <>
    <div className="st-scrim" aria-hidden="true" />
    <div className="st-wrap">
      <header className="st-head">
        <span className="st-kicker">Software Catalogue</span>
        <h1 className="st-h1">Developer software,<br /><span className="accent">licensed and supported.</span></h1>
        <p className="st-lead">The components we trust to build document, PDF, OCR, reporting and UI systems. Sourced from the vendors who make them, licensed and supported by us in the UK.</p>
        <div className="st-stats">
          <span className="st-stat"><b>{loading && !items.length ? '–' : total}</b> products</span>
          <span className="st-stat"><b>{vendors.length || '–'}</b> vendors</span>
          <span className="st-stat"><b>{categories.length || '–'}</b> categories</span>
        </div>
      </header>

      <div className="st-toolbar">
        <button className="st-filterbtn" onClick={() => setFacetsOpen(o => !o)} aria-expanded={facetsOpen}>Filters</button>
        <div className="st-search">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <input type="search" placeholder="Search products, e.g. PDF, OCR, Aspose…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search products" />
        </div>
        <select className="st-select" value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort products">
          <option value="featured">Featured</option>
          <option value="az">Name A–Z</option>
          <option value="price">Price: low to high</option>
        </select>
        <span className="st-count" aria-live="polite"><b>{total}</b> result{total === 1 ? '' : 's'}</span>
      </div>

      <div className="st-layout">
        <aside className={'st-facets' + (facetsOpen ? ' open' : '')} aria-label="Filters">
          <div className="st-facet">
            <h2>Vendor {active && <button className="st-clear" onClick={clearAll}>Clear all</button>}</h2>
            <div className="st-pills">
              {vendors.map(v => <button key={v.id} aria-pressed={vendor === v.slug} className={'st-pill' + (vendor === v.slug ? ' on' : '')} onClick={() => setVendor(vendor === v.slug ? '' : v.slug)}>{v.name}</button>)}
            </div>
          </div>
          <div className="st-facet">
            <h2>Platform</h2>
            <div className="st-pills">
              {PLATFORMS.map(p => <button key={p} aria-pressed={platform === p} className={'st-pill' + (platform === p ? ' on' : '')} onClick={() => setPlatform(platform === p ? '' : p)}>{p}</button>)}
            </div>
          </div>
          <div className="st-facet">
            <h2>Category</h2>
            <div className="st-pills">
              {categories.map(c => <button key={c.id} aria-pressed={category === c.slug} className={'st-pill' + (category === c.slug ? ' on' : '')} onClick={() => setCategory(category === c.slug ? '' : c.slug)}>{c.name}</button>)}
            </div>
          </div>
        </aside>

        <div className="st-grid">
          <h2 className="gs-sr-only">Products</h2>
          {err ? <div className="st-empty"><h3>{err}</h3></div>
            : loading && !items.length ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="st-card st-skel" aria-hidden="true" />)
              : !items.length ? <div className="st-empty"><h3>No products match those filters</h3><button className="st-clear" onClick={clearAll}>Clear all filters</button></div>
                : items.map(o => <Card key={o.id} o={o} />)}
          {items.length < total && !loading && <button className="st-more" onClick={loadMore}>Load more ({total - items.length} more)</button>}
        </div>
      </div>
    </div>
    </>
  );
}

function Card({ o }) {
  const icon = img(o.attributes?.icon) || img(o.vendor?.logo_url);
  const p = o.pricing || {};
  return (
    <a className="st-card" href={'#product/' + encodeURIComponent(o.slug)} aria-label={o.name + ' by ' + (o.vendor?.name || '')}>
      <span className="st-card-icon">{icon && <img src={icon} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = 'none'; }} />}</span>
      <h3>{o.name}</h3>
      <div className="vendor">{o.vendor?.logo_url && <img src={img(o.vendor.logo_url)} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = 'none'; }} />}<span>{o.vendor?.name}</span></div>
      {o.short_description && <p className="desc">{o.short_description}</p>}
      {!!(o.platforms && o.platforms.length) && <div className="st-badges">{o.platforms.slice(0, 4).map(pl => <span key={pl} className="st-badge">{pl}</span>)}</div>}
      <div className="st-foot">
        <span className="st-price">
          {(p.poa || p.final == null)
            ? <span className="poa">Price on application</span>
            : <><span className="lbl">from</span>{p.hasDiscount && <s>{fmtMoney(p.base)}</s>}<b>{fmtMoney(p.final)}</b></>}
        </span>
        <span className="st-go">View →</span>
      </div>
    </a>
  );
}
