// Catalogue admin — Supabase-authenticated. Sign-in gate → offerings manager (list + edit).
// Writes go through the signed-in user's session; the staff_all RLS (0004) enforces admin-only.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase.mjs';
import { useModal } from './useModal.mjs';
import { signIn, signOut, getSession, onAuth, getStaffUser, isStaff } from './adminAuth.mjs';
import { fmtMoney, usdToGbpMinor } from '../lib/pricing.mjs';
import PricingRules from './PricingRules.jsx';
import BulkImport from './BulkImport.jsx';
import OrdersManager from './OrdersManager.jsx';
import QuotesManager from './QuotesManager.jsx';
import FxRateEditor from './FxRateEditor.jsx';
import './store.css';
import './admin.css';

export default function CatalogueAdmin({ initialTab = 'offerings', onHub }) {
  const [session, setSession] = useState(undefined); // undefined = checking
  const [staff, setStaff] = useState(null);
  const [tab, setTab] = useState(initialTab);
  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]); // hub deep-links (#catalogue/<tab>)
  useEffect(() => {
    getSession().then(s => setSession(s || null));
    const { data } = onAuth(s => setSession(s || null));
    return () => data?.subscription?.unsubscribe?.();
  }, []);
  useEffect(() => { if (session) getStaffUser().then(setStaff); else setStaff(null); }, [session]);

  if (session === undefined) return <div className="ca-wrap"><div className="ca-center">Checking session…</div></div>;
  if (!session) return <SignInGate />;
  if (!isStaff(staff)) return (
    <div className="ca-wrap"><div className="ca-center">
      <h2>Not authorised</h2>
      <p>{session.user?.email} isn't a catalogue editor on this organisation.</p>
      <button className="gs-btn ghost" onClick={() => signOut()}>Sign out</button>
    </div></div>
  );
  return (
    <>
      <div className="ca-tabbar">
        <div className="ca-tabs">
          <button className={tab === 'offerings' ? 'on' : ''} onClick={() => setTab('offerings')}>Offerings</button>
          <button className={tab === 'pricing' ? 'on' : ''} onClick={() => setTab('pricing')}>Pricing &amp; discounts</button>
          <button className={tab === 'fx' ? 'on' : ''} onClick={() => setTab('fx')}>Currency (FX)</button>
          <button className={tab === 'orders' ? 'on' : ''} onClick={() => setTab('orders')}>Orders</button>
          <button className={tab === 'quotes' ? 'on' : ''} onClick={() => setTab('quotes')}>Quotes</button>
          <button className={tab === 'bulk' ? 'on' : ''} onClick={() => setTab('bulk')}>Import / export</button>
        </div>
        <div className="ca-tabtools">
          <span className="ca-who">{staff.full_name || staff.email} · {staff.role}</span>
          {onHub && <button className="gs-btn ghost sm" onClick={onHub}>◇ Hub</button>}
          <a className="gs-btn ghost sm" href="#shop">View store</a>
          <button className="gs-btn ghost sm" onClick={() => signOut()}>Sign out</button>
        </div>
      </div>
      {tab === 'pricing' ? <PricingRules staff={staff} /> : tab === 'fx' ? <FxRateEditor staff={staff} /> : tab === 'orders' ? <OrdersManager staff={staff} /> : tab === 'quotes' ? <QuotesManager staff={staff} /> : tab === 'bulk' ? <BulkImport staff={staff} /> : <OfferingsManager staff={staff} />}
    </>
  );
}

function SignInGate() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const { error } = await signIn(email, pw);
    setBusy(false);
    if (error) setErr(error.message || 'Sign-in failed.');
  };
  return (
    <div className="ca-wrap"><div className="ca-signin">
      <button type="button" className="ca-link" style={{ alignSelf: 'flex-start', marginBottom: 4 }} onClick={() => { if (typeof history !== 'undefined' && history.length > 1) history.back(); else location.hash = 'admin'; }}>← Back</button>
      <span className="st-kicker">Catalogue admin</span>
      <h1>Sign in</h1>
      <p className="ca-sub">Manage the Greatstone software catalogue, pricing and quotes.</p>
      <form onSubmit={submit}>
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required /></label>
        <label>Password<input type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="current-password" required /></label>
        {err && <div className="ca-err" role="alert">{err}</div>}
        <button className="gs-btn primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div></div>
  );
}

function OfferingsManager({ staff }) {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);
  const [rate, setRate] = useState(1.30); // from_price is stored USD; show GBP at the live rate

  useEffect(() => { supabase.from('org_settings').select('usd_to_gbp_display_rate').limit(1).maybeSingle().then(({ data }) => { const r = Number(data?.usd_to_gbp_display_rate); if (r > 0) setRate(r); }); }, []);

  const load = useCallback(() => {
    setLoading(true);
    let query = supabase.from('offerings')
      .select('id, slug, name, status, featured, short_description, from_price_minor, type, vendor:vendors(name)')
      .order('name').limit(500);
    if (q.trim()) query = query.ilike('name', '%' + q.trim() + '%');
    query.then(({ data, error }) => { if (error) console.error(error); setItems(data || []); setLoading(false); });
  }, [q]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  return (
    <div className="ca-wrap">
      <header className="ca-head">
        <div><span className="st-kicker">Catalogue admin</span><h1>Offerings</h1></div>
      </header>
      <div className="ca-toolbar">
        <input className="ca-search" placeholder="Search offerings…" value={q} onChange={e => setQ(e.target.value)} />
        <span className="ca-count">{items.length} shown</span>
      </div>
      <div className="ca-table-wrap">
        <table className="ca-table ca-cards">
          <thead><tr><th scope="col">Name</th><th scope="col">Vendor</th><th scope="col">Type</th><th scope="col">From</th><th scope="col">Status</th><th scope="col"><span className="gs-sr-only">Actions</span></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="6" className="ca-muted">Loading…</td></tr>
              : !items.length ? <tr><td colSpan="6" className="ca-muted">No offerings match.</td></tr>
                : items.map(o => (
                  <tr key={o.id}>
                    <td data-label="Name" className="ca-name">{o.name}{o.featured && <span className="ca-star" title="Featured">★</span>}</td>
                    <td data-label="Vendor">{o.vendor?.name}</td>
                    <td data-label="Type">{o.type}</td>
                    <td data-label="From">{o.from_price_minor != null ? fmtMoney(usdToGbpMinor(o.from_price_minor, rate)) : 'POA'}</td>
                    <td data-label="Status"><span className={'ca-status ca-' + o.status}>{o.status}</span></td>
                    <td data-label=""><button className="gs-btn ghost sm" onClick={() => setEditing(o)}>Edit</button></td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {editing && <EditDrawer offering={editing} onClose={() => setEditing(null)} onSaved={(msg) => { setEditing(null); flash(msg); load(); }} />}
      {toast && <div className="ca-toast" role="status">{toast}</div>}
    </div>
  );
}

function EditDrawer({ offering, onClose, onSaved }) {
  const [name, setName] = useState(offering.name || '');
  const [shortDesc, setShortDesc] = useState(offering.short_description || '');
  const [status, setStatus] = useState(offering.status || 'draft');
  const [featured, setFeatured] = useState(!!offering.featured);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const drawerRef = useRef(null);
  useModal(drawerRef, true, onClose); // focus-in, Tab-trap, scroll-lock, Escape, focus-restore

  const save = async () => {
    setBusy(true); setErr(null);
    const { error } = await supabase.from('offerings')
      .update({ name: name.trim(), short_description: shortDesc, status, featured })
      .eq('id', offering.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onSaved('Saved “' + name.trim() + '”.');
  };

  return (
    <div className="ca-drawer-scrim" onClick={onClose}>
      <div ref={drawerRef} tabIndex={-1} className="ca-drawer" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={'Edit ' + offering.name}>
        <h2>Edit offering</h2>
        <label>Name<input value={name} onChange={e => setName(e.target.value)} /></label>
        <label>Short description<textarea rows="3" value={shortDesc} onChange={e => setShortDesc(e.target.value)} /></label>
        <label>Status
          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
          </select>
        </label>
        <label className="ca-check"><input type="checkbox" checked={featured} onChange={e => setFeatured(e.target.checked)} /> Featured</label>
        {err && <div className="ca-err" role="alert">{err}</div>}
        <div className="ca-drawer-foot">
          <button className="gs-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="gs-btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
        <p className="ca-note">Editions/pricing, specs, media and bulk import come next. Saves write straight to the live catalogue (admin-only).</p>
      </div>
    </div>
  );
}
