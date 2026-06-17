// Customer self-serve portal (#account). Sign in / create account / reset, then: profile, order
// history (customer_self RLS → only their own), saved cards & invoices via the Stripe Billing Portal,
// and one-click re-order. Mirrors CatalogueAdmin's gate idiom but with customerAuth + a customer lens.
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.mjs';
import { fmtMoney } from '../lib/pricing.mjs';
import { signIn, signUp, signOut, getSession, onAuth, resetPassword, updatePassword, getCustomerProfile, isCustomer } from './customerAuth.mjs';
import { addItem } from './cart.mjs';
import './store.css';
import './admin.css';

const isResetMode = () => typeof location !== 'undefined' && /reset=1/.test(location.hash);

export default function AccountDashboard() {
  const [session, setSession] = useState(undefined); // undefined = checking
  const [profile, setProfile] = useState(null);
  useEffect(() => {
    getSession().then(s => setSession(s || null));
    const { data } = onAuth(s => setSession(s || null));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => { if (session) getCustomerProfile().then(setProfile); else setProfile(null); }, [session]);

  if (session === undefined) return <div className="ca-wrap"><div className="ca-center">Checking…</div></div>;
  if (session && isResetMode()) return <SetNewPassword />;
  if (!session) return <AuthGate />;
  if (profile && !isCustomer(profile)) return (
    <div className="ca-wrap"><div className="ca-center">
      <h2>This is a staff account</h2>
      <p>{session.user?.email} manages the catalogue. Use the <a href="#catalogue">catalogue admin</a> instead.</p>
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
      <div className="ca-tabs" style={{ marginBottom: 14 }}>
        <button className={mode === 'signin' ? 'on' : ''} onClick={() => setMode('signin')}>Sign in</button>
        <button className={mode === 'signup' ? 'on' : ''} onClick={() => setMode('signup')}>Create account</button>
      </div>
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
          ? <button className="ca-link" onClick={() => setMode('signin')}>Back to sign in</button>
          : <button className="ca-link" onClick={() => setMode('forgot')}>Forgot your password?</button>}
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
  const [toast, setToast] = useState(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  const loadOrders = useCallback(() => {
    setLoadingOrders(true);
    supabase.from('orders')
      .select('id, reference, status, currency, subtotal_minor, total_minor, placed_at, created_at, order_items(id, offering_name, variant_name, qty, unit_price_minor, line_total_minor, variant_id)')
      .is('deleted_at', null).order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => { setOrders(data || []); setLoadingOrders(false); });
  }, []);
  useEffect(() => { loadOrders(); }, [loadOrders]);

  const openPortal = async () => {
    setPortalBusy(true);
    const { data, error } = await supabase.functions.invoke('stripe-portal', { body: { returnUrl: location.origin + location.pathname + '#account' } });
    setPortalBusy(false);
    if (error || !data?.url) { flash('Billing portal unavailable. ' + (error?.message || '')); return; }
    location.href = data.url;
  };

  const reorder = (o) => {
    let n = 0;
    for (const it of o.order_items || []) {
      if (!it.variant_id) continue;
      addItem({ variantId: it.variant_id, name: it.offering_name, edition: it.variant_name, unitMinor: it.unit_price_minor, currency: o.currency }, it.qty || 1);
      n += 1;
    }
    flash(n ? `${n} item${n === 1 ? '' : 's'} added to your basket.` : 'Nothing to re-order.');
    if (n && typeof location !== 'undefined') location.hash = 'shop';
  };

  const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s; } };
  const company = profile?.customer?.name || '';
  const tier = profile?.customer?.tier?.name;

  return (
    <div className="ca-wrap">
      <header className="ca-head">
        <div><span className="st-kicker">Your account</span><h1>{company || 'Welcome back'}</h1></div>
        <div className="ca-tabtools">
          <a className="gs-btn ghost sm" href="#shop">Continue shopping</a>
          <button className="gs-btn ghost sm" onClick={() => signOut()}>Sign out</button>
        </div>
      </header>

      <div className="acct-grid">
        <ProfileCard profile={profile} onProfile={onProfile} flash={flash} />
        <div className="pr-form">
          <h2>Billing &amp; cards</h2>
          <p className="ca-note">Manage saved cards, download invoices and receipts in the secure Stripe portal. {tier && <>Your pricing tier: <b>{tier}</b>.</>}</p>
          <button className="gs-btn ghost" onClick={openPortal} disabled={portalBusy}>{portalBusy ? 'Opening…' : 'Manage billing & cards →'}</button>
        </div>
      </div>

      <h2 className="pr-listh">Order history</h2>
      <div className="ca-table-wrap">
        <table className="ca-table">
          <thead><tr><th>Date</th><th>Reference</th><th>Items</th><th>Total</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {loadingOrders ? <tr><td colSpan="6" className="ca-muted">Loading…</td></tr>
              : !orders.length ? <tr><td colSpan="6" className="ca-muted">No orders yet. <a href="#shop">Browse the store →</a></td></tr>
                : orders.map(o => (
                  <React.Fragment key={o.id}>
                    <tr>
                      <td>{fmtDate(o.placed_at || o.created_at)}</td>
                      <td className="ca-name"><code className="ca-ref">{(o.reference || '').replace(/^cs_(test|live)_/, '').slice(0, 12)}…</code></td>
                      <td>{(o.order_items || []).length}</td>
                      <td className="ca-amt">{fmtMoney(o.total_minor, o.currency)}</td>
                      <td><span className={'ca-status ca-ord-' + o.status}>{o.status}</span></td>
                      <td className="ca-ord-actions"><button className="gs-btn ghost sm" onClick={() => reorder(o)}>Buy again</button></td>
                    </tr>
                    <tr className="ca-ord-detailrow"><td colSpan="6">
                      <div className="ca-ord-items">
                        {(o.order_items || []).map(it => (
                          <div key={it.id} className="ca-ord-item">
                            <span className="oi-name">{it.offering_name}{it.variant_name ? ' · ' + it.variant_name : ''}</span>
                            <span className="oi-qty">×{it.qty}</span>
                            <span className="oi-amt">{fmtMoney(it.line_total_minor, o.currency)}</span>
                          </div>
                        ))}
                        <div className="acct-keys">Licence keys are issued by our team and appear here once delivered.</div>
                      </div>
                    </td></tr>
                  </React.Fragment>
                ))}
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
      <label>Company<input value={company} onChange={e => setCompany(e.target.value)} /></label>
      <label>Your name<input value={name} onChange={e => setName(e.target.value)} /></label>
      <label>Phone<input value={phone} onChange={e => setPhone(e.target.value)} /></label>
      <label>Email<input value={profile?.email || ''} readOnly disabled /></label>
      <button className="gs-btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
    </div>
  );
}
