// Live product detail — reads one offering (variants/specs/gallery/related) from Supabase.
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.mjs';
import { getOffering, relatedOfferings } from '../data/catalog.mjs';
import { fmtMoney } from '../lib/pricing.mjs';
import { addItem, useCart, openCart } from './cart.mjs';
import './store.css';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
const img = (u) => !u ? '' : /^https?:|^data:/.test(u) ? u : BASE + String(u).replace(/^assets\//, '');

const QUOTE_EMAIL = 'dx@greatstonesoftware.co.uk';
// "Request a quote" should actually request a quote. The Deep Dive Calendly (#book) is a transformation
// diagnostic, not a software-licensing quote desk; and POA products can't enter the basket (no price), so
// the structured cart quote form is unreachable for them. A prefilled enquiry email matches this page's
// stated "browse-and-enquire, no account needed to ask" model and carries the product context. Subject +
// body are encodeURIComponent'd (newlines → %0A) so a catalogue-sourced name can't inject mail headers.
const quoteMailto = (o, variant) => {
  const what = variant ? (o.name + ' — ' + variant.name) : o.name;
  const vendor = o.vendor && o.vendor.name ? ' (' + o.vendor.name + ')' : '';
  const subject = 'Quote request — ' + what;
  const body = 'Hi Greatstone,\n\nPlease send a quote for ' + what + vendor + '.\n\nTeam size / seats:\nLicence term:\nTimeline:\nAnything specific:\n\nThanks,';
  return 'mailto:' + QUOTE_EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
};

export default function StoreProduct({ slug, onBack }) {
  const [o, setO] = useState(undefined); // undefined = loading, null = not found
  const [related, setRelated] = useState([]);
  const [gi, setGi] = useState(0);

  useEffect(() => {
    if (!supabase || !slug) { setO(null); return; }
    let alive = true; setO(undefined); setGi(0); setRelated([]);
    getOffering(supabase, slug)
      .then(d => { if (!alive) return; setO(d); if (d) relatedOfferings(supabase, d).then(r => alive && setRelated(r)).catch(e => { console.warn('relatedOfferings', e); }); })
      .catch(e => { console.error('getOffering', e); if (alive) setO(null); });
    return () => { alive = false; };
  }, [slug]);

  useEffect(() => { if (o) document.title = (o.seo && o.seo.metaTitle) || (o.name + ' · Greatstone International'); }, [o]);

  if (o === undefined) return <><div className="st-scrim" aria-hidden="true" /><div className="sp-wrap"><div className="st-loading" role="status">Loading…</div></div></>;
  if (o === null) return <><div className="st-scrim" aria-hidden="true" /><div className="sp-wrap"><div className="st-empty"><h3>Product not found</h3><p>It may have moved or the link is out of date.</p><button className="st-more" onClick={onBack}>Back to the catalogue</button></div></div></>;

  const gallery = [...new Set([o.attributes && o.attributes.icon, o.attributes && o.attributes.mainImage, ...((o.attributes && o.attributes.gallery) || [])].filter(Boolean))].map(img);
  const cur = gallery[gi] || img(o.vendor && o.vendor.logo_url);
  const fromP = o.from;

  return (
    <>
    <div className="st-scrim" aria-hidden="true" />
    <div className="sp-wrap">
      <nav className="sp-crumb" aria-label="Breadcrumb">
        <a href="#shop">Catalogue</a><span className="sep" aria-hidden="true">›</span>
        <a href={'#shop/' + (o.vendor ? o.vendor.slug : '')}>{o.vendor && o.vendor.name}</a><span className="sep" aria-hidden="true">›</span>
        <span className="here">{o.name}</span>
      </nav>

      <div className="sp-top">
        <div className="sp-gallery">
          <div className="sp-stage">
            {cur && <img src={cur} alt={o.name} onError={e => { e.currentTarget.style.visibility = 'hidden'; }} />}
            {gallery.length > 1 && <>
              <button className="sp-nav prev" onClick={() => setGi(g => (g - 1 + gallery.length) % gallery.length)} aria-label="Previous image">‹</button>
              <button className="sp-nav next" onClick={() => setGi(g => (g + 1) % gallery.length)} aria-label="Next image">›</button>
            </>}
            {gallery.length > 1 && <span className="gs-sr-only" aria-live="polite">{'Image ' + (gi + 1) + ' of ' + gallery.length}</span>}
          </div>
          {gallery.length > 1 && <div className="sp-thumbs" role="group" aria-label="Product images">{gallery.map((src, i) => <button key={i} className={'sp-thumb' + (i === gi ? ' on' : '')} onClick={() => setGi(i)} aria-label={'Image ' + (i + 1) + ' of ' + gallery.length} aria-current={i === gi ? 'true' : undefined}><img src={src} alt="" onError={e => { const b = e.currentTarget.closest('.sp-thumb'); if (b) b.style.display = 'none'; }} /></button>)}</div>}
        </div>

        <div className="sp-info">
          <div className="sp-vendor">{o.vendor && o.vendor.logo_url && <img src={img(o.vendor.logo_url)} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />}<span>{o.vendor && o.vendor.name}</span></div>
          <h1 className="sp-title">{o.name}</h1>
          {!!(o.platforms && o.platforms.length) && <div className="st-badges">{o.platforms.map(p => <span key={p} className="st-badge">{p}</span>)}</div>}
          {o.short_description && <p className="sp-lead">{o.short_description}</p>}
          <div className="sp-pricebox">
            {fromP && fromP.final != null
              ? <><div className="lbl">From</div><div className="amt">{fmtMoney(fromP.final)} <small>+ VAT</small></div><div className="sub">{o.variants.length} licence option{o.variants.length === 1 ? '' : 's'} below. Final price depends on team size and support term.</div></>
              : <><div className="lbl">Pricing</div><div className="poa">Price on application</div><div className="sub">We'll prepare a quote tailored to your team and use case.</div></>}
          </div>
          <div className="sp-cta">
            {fromP && fromP.final != null
              ? <><button className="gs-btn primary" onClick={() => { const el = document.getElementById('sp-editions'); if (el) el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }}>See editions &amp; pricing</button>
                  <a className="gs-btn ghost" href={quoteMailto(o)}>Request a quote</a></>
              : <a className="gs-btn primary" href={quoteMailto(o)}>Request a quote</a>}
          </div>
          <p className="sp-note">Browse-and-enquire: we license and support every product directly. No account or card needed to ask.</p>
        </div>
      </div>

      {o.description && o.description !== o.short_description && <section className="sp-section"><h2>Overview</h2><p className="sp-prose">{o.description}</p></section>}

      {!!(o.specs && o.specs.length) && <section className="sp-section"><h2>Key features</h2>
        <div className="sp-specs">{o.specs.map((s, i) => <div key={i} className="sp-spec"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>{s.label}</div>)}</div></section>}

      {!!(o.variants && o.variants.length) && <section className="sp-section" id="sp-editions"><h2>Editions &amp; licensing</h2>
        <div className="sp-table-wrap"><table className="sp-table"><thead><tr><th scope="col">Edition</th><th scope="col">Licence</th><th scope="col">Price</th><th scope="col"><span className="gs-sr-only">Add to basket</span></th></tr></thead>
          <tbody>{o.variants.map(v => <tr key={v.id}><td className="ed">{v.name}</td><td>{v.license_type || 'See quote'}</td><td className="pr">{v.pricing && v.pricing.final != null ? fmtMoney(v.pricing.final) : 'POA'}</td><td>{v.pricing && v.pricing.final != null ? <AddToBasket offering={o} variant={v} /> : <a className="sp-q" href={quoteMailto(o, v)}>Request quote ›</a>}</td></tr>)}</tbody></table></div>
        <p className="sp-note">Prices exclude VAT (added at checkout) and are indicative of the vendor's UK list. Buy a licence directly, or request a quote for volume discounts and bespoke support terms.</p><BasketBar /></section>}

      {!!related.length && <section className="sp-section"><h2>Related products</h2>
        <div className="sp-related">{related.map(r => <a key={r.id} className="sp-rel" href={'#product/' + encodeURIComponent(r.slug)}><div className="rn">{r.name}</div><div className="rv">{r.vendor && r.vendor.name}</div><div className="rp">{r.pricing && r.pricing.final != null ? 'from ' + fmtMoney(r.pricing.final) : 'Request a quote'} ›</div></a>)}</div></section>}

      <div className="sp-back"><button className="st-more" onClick={onBack}>← Back to the catalogue</button></div>
    </div>
    </>
  );
}

// A single "what next" affordance under the editions table: once anything is in the basket it gives a
// clear path to review + check out (the floating basket button alone is easy to miss, especially on
// mobile). Subscribes to the same cart singleton, so it appears the moment an edition is added.
function BasketBar() {
  const items = useCart();
  const count = items.reduce((n, x) => n + x.qty, 0);
  if (!count) return null;
  return (
    <div className="sp-basketbar">
      <span className="sp-basketbar-txt">{count} item{count === 1 ? '' : 's'} in your basket</span>
      <button type="button" className="sp-basketbar-btn" onClick={openCart} aria-label={'View basket, ' + count + ' item' + (count === 1 ? '' : 's')}>View basket →</button>
    </div>
  );
}

// Adds a specific edition to the live basket. Brief "Added ✓" confirmation; the basket FAB badge
// (StoreCart) also updates immediately since both read the same cart singleton.
function AddToBasket({ offering, variant }) {
  const [done, setDone] = useState(false);
  const add = () => {
    addItem({ variantId: variant.id, offeringSlug: offering.slug, name: offering.name, edition: variant.name, vendor: offering.vendor && offering.vendor.name, unitMinor: variant.pricing.final, currency: variant.pricing.currency || 'GBP' });
    setDone(true); setTimeout(() => setDone(false), 1600);
  };
  return <button className={'sp-add' + (done ? ' done' : '')} onClick={add} aria-label={'Add ' + offering.name + ' ' + variant.name + ' to basket'}>{done ? 'Added ✓' : 'Add to basket'}</button>;
}
