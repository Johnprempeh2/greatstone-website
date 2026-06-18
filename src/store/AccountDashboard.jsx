// Customer self-serve portal (#account). Sign in / create account / reset, then a four-section
// account: identity header + Profile / Security / Billing, and a collapsible, mobile-friendly order
// history (customer_self RLS → only their own). One-click re-order. Mirrors CatalogueAdmin's gate idiom.
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.mjs';
import { fmtMoney } from '../lib/pricing.mjs';
import { signIn, signUp, signOut, getSession, onAuth, resetPassword, updatePassword, getCustomerProfile, isCustomer } from './customerAuth.mjs';
import { addItem } from './cart.mjs';
import './store.css';
import './admin.css';

const isResetMode = () => typeof location !== 'undefined' && /reset=1/.test(location.hash);
const initialsOf = (s) => (String(s || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('') || '?').toUpperCase();
// Customer-facing quote status labels: the raw enum is the internal sales pipeline (new/contacted/quoted/
// won/lost/cancelled); customers should see plain-English states, not "Lost"/"Cancelled".
const QUOTE_LABEL = { new: 'In review', contacted: 'In review', quoted: 'Quote ready', won: 'Accepted', lost: 'Closed', cancelled: 'Closed' };
const quoteLabel = (s) => QUOTE_LABEL[s] || (String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1));

export default function AccountDashboard() {
  const [session, setSession] = useState(undefined); // undefined = checking
  const [profile, setProfile] = useState(null);
  useEffect(() => {
    getSession().then(s => setSession(s || null));
    const { data } = onAuth(s => setSession(s || null));
    return () => data?.subscription?.unsubscribe?.();
  }, []);
  useEffect(() => { if (session) getCustomerProfile().then(setProfile); else setProfile(null); }, [session]);

  if (session === undefined) return <div className="ca-wrap"><div className="ca-center">Checking…</div></div>;
  if (session && isResetMode()) return <SetNewPassword />;
  if (!session) return <AuthGate />;
  if (profile && !isCustomer(profile)) return (
    <div className="ca-wrap"><div className="ca-center">
      <h2>This is a staff account</h2>
      <p>{session.user?.email} manages the catalogue. Use the <a className="ca-link" href="#catalogue">catalogue admin</a> instead.</p>
      <button className="gs-btn ghost" onClick={() => signOut()}>Sign out</button>
    </div></div>
  );
  return <Dashboard session={session} profile={profile} onProfile={setProfile} />;
}

function AuthGate() {
  const [mode, setMode] = useState('signin'); // signin | signup | forgot
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [company, setCompany] = useState(''); const [name, setName] = useState('');
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null); const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null); setMsg(null);
    let res;
    if (mode === 'signin') res = await signIn(email, pw);
    else if (mode === 'signup') res = await signUp(email, pw, { companyName: company, fullName: name });
    else res = await resetPassword(email);
    setBusy(false);
    if (res?.error) { setErr(res.error.message || 'Something went wrong.'); return; }
    if (mode === 'signup') setMsg(res?.data?.session ? null : 'Account created. Check your email to confirm, then sign in.');
    if (mode === 'forgot') setMsg('If that email has an account, a reset link is on its way.');
  };

  return (
    <div className="ca-wrap"><div className="ca-signin">
      <span className="st-kicker">Your account</span>
      <h1>{mode === 'signup' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Sign in'}</h1>
      <p className="ca-sub">Order history, saved cards and faster checkout for the Greatstone software store.</p>
      {mode !== 'forgot' && (
        <div className="ca-tabs" role="tablist" style={{ marginBottom: 14 }}>
          <button role="tab" aria-selected={mode === 'signin'} className={mode === 'signin' ? 'on' : ''} onClick={() => { setMode('signin'); setErr(null); setMsg(null); }}>Sign in</button>
          <button role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'on' : ''} onClick={() => { setMode('signup'); setErr(null); setMsg(null); }}>Create account</button>
        </div>
      )}
      <form onSubmit={submit}>
        {mode === 'signup' && <>
          <label>Company (optional)<input value={company} onChange={e => setCompany(e.target.value)} autoComplete="organization" /></label>
          <label>Your name<input value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></label>
        </>}
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required /></label>
        {mode !== 'forgot' && <label>Password<input type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={8} /></label>}
        {err && <div className="ca-err" role="alert">{err}</div>}
        {msg && <div className="ca-ok" role="status">{msg}</div>}
        <button className="gs-btn primary" type="submit" disabled={busy}>{busy ? 'Working…' : mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Sign in'}</button>
      </form>
      <p className="ca-note" style={{ marginTop: 12 }}>
        {mode === 'forgot'
          ? <button className="ca-link" onClick={() => { setMode('signin'); setErr(null); setMsg(null); }}>Back to sign in</button>
          : <button className="ca-link" onClick={() => { setMode('forgot'); setErr(null); setMsg(null); }}>Forgot your password?</button>}
      </p>
    </div></div>
  );
}

function SetNewPassword() {
  const [pw, setPw] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null); const [done, setDone] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const { error } = await updatePassword(pw); setBusy(false);
    if (error) { setErr(error.message); return; }
    setDone(true); if (typeof location !== 'undefined') location.hash = 'account';
  };
  return (
    <div className="ca-wrap"><div className="ca-signin">
      <span className="st-kicker">Your account</span><h1>Set a new password</h1>
      {done ? <p className="ca-ok">Password updated. You're signed in.</p> : (
        <form onSubmit={submit}>
          <label>New password<input type="password" value={pw} onChange={e => setPw(e.target.value)} required minLength={8} autoComplete="new-password" /></label>
          {err && <div className="ca-err" role="alert">{err}</div>}
          <button className="gs-btn primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
        </form>
      )}
    </div></div>
  );
}

function Dashboard({ session, profile, onProfile }) {
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [ordersErr, setOrdersErr] = useState(null);
  const [open, setOpen] = useState(null);      // expanded order id
  const [toast, setToast] = useState(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  const loadOrders = useCallback(() => {
    setLoadingOrders(true); setOrdersErr(null);
    supabase.from('orders')
      .select('id, reference, status, currency, subtotal_minor, total_minor, refunded_minor, invoice_number, placed_at, created_at, order_items(id, offering_name, variant_name, qty, unit_price_minor, line_total_minor, variant_id)')
      .is('deleted_at', null).order('created_at', { ascending: false }).limit(100)
      .then(({ data, error }) => { setOrdersErr(error || null); setOrders(data || []); setLoadingOrders(false); });
  }, []);
  useEffect(() => { loadOrders(); }, [loadOrders]);
  const [quotes, setQuotes] = useState([]);
  const [quotesErr, setQuotesErr] = useState(null);
  const loadQuotes = useCallback(() => {
    setQuotesErr(null);
    supabase.from('quotes').select('id, reference, status, currency, indicative_total_minor, quoted_total_minor, valid_until, created_at, orders(id, invoice_number)')
      .is('deleted_at', null).order('created_at', { ascending: false }).limit(50)
      .then(({ data, error }) => { setQuotesErr(error || null); setQuotes(data || []); });
  }, []);
  useEffect(() => { loadQuotes(); }, [loadQuotes]);

  const openPortal = async () => {
    setPortalBusy(true);
    const { data, error } = await supabase.functions.invoke('stripe-portal', { body: { returnUrl: location.origin + location.pathname + '#account' } });
    setPortalBusy(false);
    if (error || !data?.url) { flash('Billing portal unavailable. ' + (error?.message || 'Ask us to enable it.')); return; }
    location.href = data.url;
  };

  const reorder = (o) => {
    let n = 0;
    for (const it of o.order_items || []) {
      if (!it.variant_id) continue;
      addItem({ variantId: it.variant_id, name: it.offering_name, edition: it.variant_name, unitMinor: it.unit_price_minor, currency: o.currency }, it.qty || 1);
      n += 1;
    }
    // The line carries last order's price; the server reprices from the live USD + FX at checkout, so
    // flag it as indicative rather than letting a stale figure look final.
    flash(n ? `${n} item${n === 1 ? '' : 's'} added at your last order's price. We'll confirm the current price at checkout.` : 'Nothing to re-order.');
    if (n && typeof location !== 'undefined') location.hash = 'shop';
  };

  const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s; } };
  const company = profile?.customer?.name || '';
  const tier = profile?.customer?.tier?.name;
  const ref = (s) => (s || '').replace(/^cs_(test|live)_/, '').slice(0, 12) + '…';

  return (
    <div className="ca-wrap">
      <header className="acct-id">
        <div className="acct-avatar" aria-hidden="true">{initialsOf(company || profile?.full_name || profile?.email)}</div>
        <div className="acct-id-text">
          <span className="st-kicker">Your account</span>
          <h1 className="acct-id-name">{company || 'Welcome back'}</h1>
          <div className="acct-id-sub">{profile?.full_name ? profile.full_name + ' · ' : ''}{profile?.email || session.user?.email}{tier && <span className="acct-tier">{tier}</span>}</div>
        </div>
        <div className="acct-id-actions">
          <a className="gs-btn ghost sm" href="#shop">Continue shopping</a>
          <button className="gs-btn ghost sm" onClick={() => signOut()}>Sign out</button>
        </div>
      </header>

      <div className="acct-grid">
        <ProfileCard profile={profile} onProfile={onProfile} flash={flash} />
        <SecurityCard email={profile?.email} flash={flash} />
        <div className="pr-form">
          <h2>Billing &amp; cards</h2>
          <p className="ca-note">Manage saved cards, download invoices and receipts in the secure Stripe portal.</p>
          <button className="gs-btn ghost" onClick={openPortal} disabled={portalBusy}>{portalBusy ? 'Opening…' : 'Manage billing & cards →'}</button>
        </div>
      </div>

      {(quotes.length > 0 || quotesErr) && <>
        <div className="acct-ordhead"><h2>Quotes</h2></div>
        <div className="ca-table-wrap">
          <table className="ca-table acct-orders">
            <thead><tr><th scope="col">Date</th><th scope="col">Reference</th><th scope="col">Total</th><th scope="col">Status</th><th scope="col"><span className="gs-sr-only">Invoice</span></th></tr></thead>
            <tbody>
              {quotesErr
                ? <tr><td colSpan="5" className="ca-muted" data-label=""><span role="alert">Couldn't load your quotes. <button className="ca-link" onClick={loadQuotes}>Try again</button></span></td></tr>
                : quotes.map(qt => {
                  const ord = (qt.orders || [])[0];
                  return (
                <tr key={qt.id}>
                  <td data-label="Date">{fmtDate(qt.created_at)}</td>
                  <td data-label="Reference" className="ca-name"><code className="ca-ref">{qt.reference}</code></td>
                  <td data-label="Total" className="ca-amt">
                    {qt.quoted_total_minor != null
                      ? <>{fmtMoney(qt.quoted_total_minor, qt.currency)} <span className="ca-muted">(quoted, inc VAT)</span>{qt.valid_until ? <span className="ca-muted"> · valid until {fmtDate(qt.valid_until)}</span> : ''}</>
                      : qt.indicative_total_minor != null
                        ? <>{fmtMoney(qt.indicative_total_minor, qt.currency)} <span className="ca-muted">(indicative, ex VAT)</span></>
                        : '–'}
                  </td>
                  <td data-label="Status"><span className={'ca-status ca-q-' + qt.status}>{quoteLabel(qt.status)}</span></td>
                  <td data-label="Invoice">{ord ? <a className="ca-link" href={'#invoice/' + ord.id}>View invoice{ord.invoice_number ? ' ' + ord.invoice_number : ''}</a> : '–'}</td>
                </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </>}

      <div className="acct-ordhead">
        <h2>Order history</h2>
        {!!orders.length && <button className="gs-btn ghost sm" onClick={loadOrders}>Refresh</button>}
      </div>
      <div className="ca-table-wrap">
        <table className="ca-table acct-orders">
          <thead><tr><th scope="col">Date</th><th scope="col">Reference</th><th scope="col">Items</th><th scope="col">Total</th><th scope="col">Status</th><th scope="col"><span className="gs-sr-only">Actions</span></th></tr></thead>
          <tbody>
            {loadingOrders ? <tr><td colSpan="6" className="ca-muted" data-label=""><span role="status">Loading your orders…</span></td></tr>
              : ordersErr ? <tr><td colSpan="6" className="ca-muted" data-label=""><span role="alert">Couldn't load your orders. <button className="ca-link" onClick={loadOrders}>Try again</button></span></td></tr>
                : !orders.length ? <tr><td colSpan="6" className="ca-muted" data-label=""><span role="status">No orders yet. <a className="ca-link" href="#shop">Browse the store →</a></span></td></tr>
                  : orders.map(o => {
                    const expanded = open === o.id;
                    return (
                      <React.Fragment key={o.id}>
                        <tr className="acct-ordrow" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : o.id)}>
                          <td data-label="Date">{fmtDate(o.placed_at || o.created_at)}</td>
                          <td data-label="Reference" className="ca-name"><code className="ca-ref">{ref(o.reference)}</code></td>
                          <td data-label="Items">{(o.order_items || []).length}</td>
                          <td data-label="Total" className="ca-amt">{fmtMoney(o.total_minor, o.currency)}</td>
                          <td data-label="Status"><span className={'ca-status ca-ord-' + o.status}>{o.status}</span>{o.refunded_minor > 0 && o.status !== 'refunded' && <span className="ca-ord-refund">−{fmtMoney(o.refunded_minor, o.currency)}</span>}</td>
                          <td className="ca-ord-actions acct-ord-cell-actions">
                            <button className="acct-toggle" aria-expanded={expanded} aria-controls={'ord-' + o.id} onClick={(e) => { e.stopPropagation(); setOpen(expanded ? null : o.id); }} title={expanded ? 'Hide items' : 'Show items'}>{expanded ? '▾' : '▸'}</button>
                            {o.invoice_number && <a className="gs-btn ghost sm" href={'#invoice/' + o.id} onClick={(e) => e.stopPropagation()}>Invoice</a>}
                            <button className="gs-btn ghost sm" onClick={(e) => { e.stopPropagation(); reorder(o); }}>Buy again</button>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="ca-ord-detailrow" id={'ord-' + o.id}><td colSpan="6">
                            <div className="ca-ord-items">
                              {(o.order_items || []).map(it => (
                                <div key={it.id} className="ca-ord-item">
                                  <span className="oi-name">{it.offering_name}{it.variant_name ? ' · ' + it.variant_name : ''}</span>
                                  <span className="oi-qty">×{it.qty}</span>
                                  <span className="oi-amt">{fmtMoney(it.line_total_minor, o.currency)}</span>
                                </div>
                              ))}
                              <div className="ca-ord-tot"><span>Subtotal (ex VAT)</span><span>{fmtMoney(o.subtotal_minor, o.currency)}</span></div>
                              <div className="ca-ord-tot total"><span>Total (inc VAT)</span><span>{fmtMoney(o.total_minor, o.currency)}</span></div>
                              {o.refunded_minor > 0 && <div className="ca-ord-tot"><span>Refunded</span><span>−{fmtMoney(o.refunded_minor, o.currency)}</span></div>}
                              <div className="acct-keys">Licence keys are issued by our team and appear here once delivered.</div>
                            </div>
                          </td></tr>
                        )}
                      </React.Fragment>
                    );
                  })}
          </tbody>
        </table>
      </div>
      {toast && <div className="ca-toast" role="status">{toast}</div>}
    </div>
  );
}

function ProfileCard({ profile, onProfile, flash }) {
  const [company, setCompany] = useState(profile?.customer?.name || '');
  const [name, setName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setCompany(profile?.customer?.name || ''); setName(profile?.full_name || ''); setPhone(profile?.phone || ''); }, [profile]);

  const save = async () => {
    setBusy(true);
    const tasks = [];
    if (profile?.customer?.id) tasks.push(supabase.from('customers').update({ name: company.trim() }).eq('id', profile.customer.id));
    if (profile?.id) tasks.push(supabase.from('customer_users').update({ full_name: name.trim() || null, phone: phone.trim() || null }).eq('id', profile.id));
    const results = await Promise.all(tasks);
    setBusy(false);
    if (results.some(r => r.error)) { flash('Could not save profile.'); return; }
    flash('Profile saved.');
    getCustomerProfile().then(onProfile);
  };

  return (
    <div className="pr-form">
      <h2>Profile</h2>
      <label>Company<input value={company} onChange={e => setCompany(e.target.value)} autoComplete="organization" /></label>
      <label>Your name<input value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></label>
      <label>Phone<input value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" /></label>
      <button className="gs-btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
    </div>
  );
}

function SecurityCard({ email, flash }) {
  const [pw, setPw] = useState(''); const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const save = async (e) => {
    e.preventDefault(); setErr(null);
    if (pw.length < 8) { setErr('Use at least 8 characters.'); return; }
    if (pw !== confirm) { setErr('Passwords do not match.'); return; }
    setBusy(true);
    const { error } = await updatePassword(pw); setBusy(false);
    if (error) { setErr(error.message); return; }
    setPw(''); setConfirm(''); flash('Password updated.');
  };
  return (
    <form className="pr-form" onSubmit={save}>
      <h2>Security</h2>
      <label>New password<input type="password" value={pw} onChange={e => setPw(e.target.value)} minLength={8} autoComplete="new-password" /></label>
      <label>Confirm new password<input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} minLength={8} autoComplete="new-password" /></label>
      {err && <div className="ca-err" role="alert">{err}</div>}
      <button className="gs-btn primary" type="submit" disabled={busy || !pw}>{busy ? 'Updating…' : 'Update password'}</button>
      <p className="ca-note">Signed in as <b>{email}</b>. To change your account email, contact us. We'll never ask for your password by email.</p>
    </form>
  );
}
