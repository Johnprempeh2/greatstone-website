// Customer self-serve portal (#account). Sign in / create account / reset, then a four-section
// account: identity header + Profile / Security / Billing, and a collapsible, mobile-friendly order
// history (customer_self RLS → only their own). One-click re-order. Mirrors CatalogueAdmin's gate idiom.
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.mjs';
import { fmtMoney } from '../lib/pricing.mjs';
import { signIn, signUp, signOut, signOutAll, getSession, onAuth, resetPassword, resendConfirmation, updatePassword, getCustomerProfile, isCustomer, isCompanyAdmin } from './customerAuth.mjs';
import { addItem } from './cart.mjs';
import LicenceKeys from './LicenceKeys.jsx';
import PasswordInput from './PasswordInput.jsx';
import { isExpiringSoon, daysUntil } from './licence-expiry.mjs';
import { sinceLastVisit, firstNameOf } from './welcome-back.mjs';
import { pickAdmin, askAdminMailto } from './ask-admin.mjs';
import './store.css';
import './admin.css';

const isResetMode = () => typeof location !== 'undefined' && /reset=1/.test(location.hash);
const initialsOf = (s) => (String(s || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('') || '?').toUpperCase();
// Customer-facing quote status labels: the raw enum is the internal sales pipeline (new/contacted/quoted/
// won/lost/cancelled); customers should see plain-English states, not "Lost"/"Cancelled".
const QUOTE_LABEL = { new: 'In review', contacted: 'In review', quoted: 'Quote ready', won: 'Accepted', lost: 'Closed', cancelled: 'Closed' };
const quoteLabel = (s) => QUOTE_LABEL[s] || (String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1));
// One tab per account area — each panel shows ONLY its own content (purchases, keys, then settings).
const ACCOUNT_TABS = [{ id: 'orders', label: 'Purchases' }, { id: 'keys', label: 'Licence keys' }, { id: 'profile', label: 'Profile' }, { id: 'security', label: 'Security' }, { id: 'billing', label: 'Billing' }];

export default function AccountDashboard({ recovery = false, authError = null, onRecoveryDone, onLanded } = {}) {
  const [session, setSession] = useState(undefined); // undefined = checking
  const [profile, setProfile] = useState(undefined); // undefined = not yet fetched (vs null = fetched, no customer row)
  useEffect(() => {
    // The first resolution settles a Supabase auth-email landing: supabase-js has now read the session
    // from (and scrubbed) the URL, so tell App to normalise the bare landing URL back to #account.
    getSession().then(s => { setSession(s || null); onLanded?.(); });
    const { data } = onAuth(s => setSession(s || null));
    return () => data?.subscription?.unsubscribe?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (session) getCustomerProfile().then(setProfile); else setProfile(null); }, [session]);

  if (session === undefined) return <div className="ca-wrap"><div className="ca-center">Checking…</div></div>;
  // A reset link (recovery prop, set by App from the landing URL) — or a legacy ?reset=1 hash — drops the
  // buyer here with a live recovery session; show the new-password form, not their dashboard.
  if (session && (recovery || isResetMode())) return <SetNewPassword onDone={onRecoveryDone} />;
  if (!session) return <AuthGate initialError={authError} />;
  if (profile === undefined) return <div className="ca-wrap"><div className="ca-center">Loading your account…</div></div>;
  // resolved to no customer row → a staff member, or someone not yet set up as a customer. Either way
  // the buyer dashboard is wrong; show a real explanation instead of an empty "Welcome back" with £0.
  if (!isCustomer(profile)) return (
    <div className="ca-wrap"><div className="ca-center">
      <h2>No customer account here</h2>
      <p>{session.user?.email} isn't set up as a customer. If you manage the Greatstone catalogue, use the <a className="ca-link" href="#catalogue">catalogue admin</a>. Otherwise <a className="ca-link" href="#go/contact">contact us</a> and we'll get you set up.</p>
      <button className="gs-btn ghost" onClick={() => signOut()}>Sign out</button>
    </div></div>
  );
  return <Dashboard session={session} profile={profile} onProfile={setProfile} />;
}

export function AuthGate({ initialError = null } = {}) {
  const [mode, setMode] = useState('signin'); // signin | signup | forgot
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [company, setCompany] = useState(''); const [name, setName] = useState('');
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null); const [err, setErr] = useState(initialError);
  // A bad email-link landing (expired / already-used / scanner-consumed confirm or reset link) drops the
  // visitor here. Keep an offer to send a fresh confirmation link visible so it's a recoverable dead-end.
  const [linkFailed] = useState(!!initialError);

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

  const resend = async () => {
    if (!email.trim()) { setErr('Enter your email above first, then resend.'); return; }
    setBusy(true); setErr(null); setMsg(null);
    const { error } = await resendConfirmation(email);
    setBusy(false);
    if (error) { setErr(error.message || 'Could not resend just now.'); return; }
    setMsg('A fresh confirmation link is on its way — check your email (and spam).');
  };

  return (
    <div className="ca-wrap"><div className="ca-signin">
      <span className="st-kicker">Your account</span>
      <h1>{mode === 'signup' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Sign in'}</h1>
      <p className="ca-sub">Order history, saved cards and faster checkout for the Greatstone software store.</p>
      {mode !== 'forgot' && (
        // A segmented toggle, not an ARIA tablist: role="tab" without aria-controls, a tabpanel and
        // arrow-key navigation sets up a broken expectation (a screen reader announces "tab, 1 of 2"
        // and arrow keys do nothing). aria-pressed toggle buttons are the honest, conformant pattern
        // for a two-option mode switch — operated with Enter/Space, no false affordance.
        <div className="ca-tabs" role="group" aria-label="Sign in or create an account" style={{ marginBottom: 14 }}>
          <button type="button" aria-pressed={mode === 'signin'} className={mode === 'signin' ? 'on' : ''} onClick={() => { setMode('signin'); setErr(null); setMsg(null); }}>Sign in</button>
          <button type="button" aria-pressed={mode === 'signup'} className={mode === 'signup' ? 'on' : ''} onClick={() => { setMode('signup'); setErr(null); setMsg(null); }}>Create account</button>
        </div>
      )}
      <form onSubmit={submit}>
        {mode === 'signup' && <>
          <label>Company (optional)<input value={company} onChange={e => setCompany(e.target.value)} autoComplete="organization" /></label>
          <label>Your name<input value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></label>
        </>}
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required /></label>
        {mode !== 'forgot' && <label>Password<PasswordInput value={pw} onChange={e => setPw(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={8} showStrength={mode === 'signup'} /></label>}
        {err && <div className="ca-err" role="alert">{err}</div>}
        {msg && <div className="ca-ok" role="status">{msg}</div>}
        <button className="gs-btn primary" type="submit" disabled={busy}>{busy ? 'Working…' : mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Sign in'}</button>
      </form>
      {linkFailed && mode === 'signin' && (
        <p className="ca-note" style={{ marginTop: 12 }}>
          Confirmation links are single-use and expire. Enter your email above and we'll send a fresh one.{' '}
          <button className="ca-link" type="button" onClick={resend} disabled={busy}>Resend confirmation email</button>
        </p>
      )}
      <p className="ca-note" style={{ marginTop: 12 }}>
        {mode === 'forgot'
          ? <button className="ca-link" onClick={() => { setMode('signin'); setErr(null); setMsg(null); }}>Back to sign in</button>
          : <button className="ca-link" onClick={() => { setMode('forgot'); setErr(null); setMsg(null); }}>Forgot your password?</button>}
      </p>
    </div></div>
  );
}

function SetNewPassword({ onDone }) {
  const [pw, setPw] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null); const [done, setDone] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const { error } = await updatePassword(pw); setBusy(false);
    if (error) { setErr(error.message); return; }
    setDone(true); onDone?.(); if (typeof location !== 'undefined') location.hash = 'account';
  };
  return (
    <div className="ca-wrap"><div className="ca-signin">
      <span className="st-kicker">Your account</span><h1>Set a new password</h1>
      {done ? <p className="ca-ok">Password updated. You're signed in.</p> : (
        <form onSubmit={submit}>
          <label>New password<PasswordInput value={pw} onChange={e => setPw(e.target.value)} required minLength={8} autoComplete="new-password" showStrength /></label>
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
  const [tab, setTab] = useState('orders');
  const [pendingDismissed, setPendingDismissed] = useState(false);
  const [orderQ, setOrderQ] = useState('');
  // the #account h1 already greets by name, so only surface the "since last visit" line on a return visit
  const [lastVisit] = useState(() => sinceLastVisit('gs:lastvisit:account'));
  // for a non-admin member: who to ask for access (their company's primary contact / admin). RLS customer_self
  // already scopes customer_users to the member's own company; this read is a no-op for admins.
  const [companyAdmin, setCompanyAdmin] = useState(null);
  useEffect(() => {
    if (!profile?.customer?.id || isCompanyAdmin(profile)) return;
    let live = true;
    supabase.from('customer_users').select('email, full_name, is_primary, role').eq('customer_id', profile.customer.id)
      .then(({ data }) => {
        if (!live) return;
        setCompanyAdmin(pickAdmin(data));
      });
    return () => { live = false; };
  }, [profile]);
  const [copiedKey, setCopiedKey] = useState(null);
  const onTabKey = (e, i) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const last = ACCOUNT_TABS.length - 1;
    const n = e.key === 'ArrowRight' ? (i === last ? 0 : i + 1)
      : e.key === 'ArrowLeft' ? (i === 0 ? last : i - 1)
        : e.key === 'Home' ? 0 : last;
    setTab(ACCOUNT_TABS[n].id);
    const el = document.getElementById('acct-tab-' + ACCOUNT_TABS[n].id);
    if (el) el.focus();
  };

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

  // Licence keys grouped by the order they fulfil, so a buyer sees their keys in the context of the
  // purchase. RLS (customer_self, 0017) already scopes this to the buyer's own company.
  const [keysByOrder, setKeysByOrder] = useState({});
  const loadKeyLinks = useCallback(() => {
    supabase.from('licence_keys').select('id, offering_name, variant_name, status, order_id, licence_key, expires_at')
      .is('deleted_at', null).not('order_id', 'is', null)
      .then(({ data, error }) => {
        if (error) return; // non-critical enrichment — leave the order detail as-is on a read error
        const m = {};
        for (const k of data || []) (m[k.order_id] ??= []).push(k);
        setKeysByOrder(m);
      });
  }, []);
  useEffect(() => { loadKeyLinks(); }, [loadKeyLinks]);
  // copy a licence key straight from the order detail. Clipboard API is the happy path; if it's blocked
  // (insecure origin / permission), fall back to the Keys tab where the code is visible + select-to-copy works.
  const copyKey = async (k) => {
    if (!k.licence_key) { setTab('keys'); return; }
    try {
      await navigator.clipboard.writeText(k.licence_key);
      setCopiedKey(k.id);
      setTimeout(() => setCopiedKey(c => (c === k.id ? null : c)), 1800);
    } catch { setTab('keys'); }
  };

  const openPortal = async () => {
    setPortalBusy(true);
    const { data, error } = await supabase.functions.invoke('stripe-portal', { body: { returnUrl: location.origin + location.pathname + '#account' } });
    setPortalBusy(false);
    if (error || !data?.url) { flash('Billing portal unavailable. ' + (error?.message || 'Ask us to enable it.')); return; }
    location.href = data.url;
  };

  const reorder = (o) => {
    let n = 0, skipped = 0;
    for (const it of o.order_items || []) {
      if (!it.variant_id) { skipped += 1; continue; } // no live variant to add (e.g. a retired product) — count it, don't silently drop
      addItem({ variantId: it.variant_id, name: it.offering_name, edition: it.variant_name, unitMinor: it.unit_price_minor, currency: o.currency }, it.qty || 1);
      n += 1;
    }
    // The line carries last order's price; the server reprices from the live USD + FX at checkout, so
    // flag it as indicative rather than letting a stale figure look final. Surface any skipped lines so
    // the buyer never silently loses an item or sees "Nothing to re-order" on an order that has products.
    if (n && skipped) flash(`${n} item${n === 1 ? '' : 's'} added (your last price; we'll confirm at checkout). ${skipped} item${skipped === 1 ? " couldn't" : "s couldn't"} be re-ordered online — get in touch and we'll sort it.`);
    else if (n) flash(`${n} item${n === 1 ? '' : 's'} added at your last order's price. We'll confirm the current price at checkout.`);
    else flash("These items can't be re-ordered online — get in touch and we'll sort it for you.");
    if (n && typeof location !== 'undefined') location.hash = 'shop';
  };

  const fmtDate = (s) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); };
  const company = profile?.customer?.name || '';
  const tier = profile?.customer?.tier?.name;
  const admin = isCompanyAdmin(profile);
  const ref = (s) => (s || '').replace(/^cs_(test|live)_/, '').slice(0, 12) + '…';
  // at-a-glance, from data already fetched
  const liveOrders = orders.filter(o => o.status !== 'cancelled' && o.status !== 'refunded');
  // sum only orders in the display currency — a cross-currency minor-units sum is meaningless and would
  // mislabel a mixed total under one symbol. Single-currency (the prototype) is unaffected.
  const curr = liveOrders[0]?.currency || orders[0]?.currency || 'GBP';
  const totalSpent = liveOrders.filter(o => (o.currency || curr) === curr).reduce((s, o) => s + (o.total_minor || 0), 0);
  const openQuotes = quotes.filter(q => !['won', 'lost', 'cancelled'].includes(q.status)).length;
  // state-adaptive "your next step" band — the most relevant unmet action, from data already fetched
  const keyCount = Object.values(keysByOrder).reduce((n, arr) => n + (arr?.length || 0), 0);
  // issued licence keys whose expiry falls within 30 days (date-guarded per c13) — a renewal nudge
  const KEY_SOON_DAYS = 30;
  const expiringKeys = Object.values(keysByOrder).flat().filter(k => isExpiringSoon(k, KEY_SOON_DAYS)).length;
  const nextStep = (() => {
    if (expiringKeys > 0) return { title: 'Renew your licences', body: `${expiringKeys} of your licence key${expiringKeys === 1 ? '' : 's'} expire${expiringKeys === 1 ? 's' : ''} within ${KEY_SOON_DAYS} days. Renew to keep your seats active.`, ctas: [{ label: 'Review your keys', onClick: () => setTab('keys'), primary: true }, { label: 'Talk to us', href: '#go/contact' }] };
    if (!loadingOrders && orders.length === 0) return { title: 'Start your Greatstone toolkit', body: 'Explore the software catalogue, or book a deep dive to kick off your transformation.', ctas: [{ label: 'Explore the catalogue', href: '#shop', primary: true }, { label: 'Book a deep dive', href: '#go/contact' }] };
    if (keyCount > 0) return { title: 'Activate your licences', body: 'Your licence keys are ready. Copy each one into the product to unlock your seats.', ctas: [{ label: 'View your keys', onClick: () => setTab('keys'), primary: true }] };
    if (profile?.customer && admin) return { title: 'Set up your organization', body: 'Invite teammates and complete your company profile in your organization dashboard.', ctas: [{ label: 'Go to your organization', href: '#org', primary: true }] };
    if (profile?.customer) return { title: 'Follow your transformation', body: 'See your maturity, your engagement timeline and what your Greatstone team has delivered.', ctas: [{ label: 'Open your organization', href: '#org', primary: true }] };
    return null;
  })();
  // pending-actions banner — decision/time-sensitive open loops, each a deep-link to its tab. Distinct from the
  // onboarding "next step" above; hides entirely when nothing is pending. Dates guarded (Invalid Date → ignored).
  const SOON_DAYS = 7;
  const openQuoteRows = quotes.filter(q => !['won', 'lost', 'cancelled'].includes(q.status));
  const expiringQuotes = openQuoteRows.filter(q => {
    if (!q.valid_until) return false;
    const d = new Date(q.valid_until); if (Number.isNaN(d.getTime())) return false;
    const days = (d.getTime() - Date.now()) / 86400000;
    return days >= 0 && days <= SOON_DAYS;
  }).length;
  const pending = [];
  if (expiringQuotes > 0) pending.push({ key: 'expiring', urgent: true, label: `${expiringQuotes} quote${expiringQuotes === 1 ? '' : 's'} expiring within ${SOON_DAYS} days`, action: () => setTab('orders') });
  if (expiringKeys > 0) pending.push({ key: 'expkeys', urgent: true, label: `${expiringKeys} licence key${expiringKeys === 1 ? '' : 's'} expiring within ${KEY_SOON_DAYS} days`, action: () => setTab('keys') });
  if (openQuotes > 0) pending.push({ key: 'quotes', label: `${openQuotes} open quote${openQuotes === 1 ? '' : 's'} to review`, action: () => setTab('orders') });
  if (profile && !profile.full_name) pending.push({ key: 'profile', label: 'Add your name to complete your profile', action: () => setTab('profile') });
  // Purchases search — filter the rendered orders by reference / invoice / item name / status
  const orderQuery = orderQ.trim().toLowerCase();
  const filteredOrders = orderQuery
    ? orders.filter(o => [o.reference, o.invoice_number, o.status, ...(o.order_items || []).flatMap(it => [it.offering_name, it.variant_name])]
        .filter(Boolean).join(' ').toLowerCase().includes(orderQuery))
    : orders;

  return (
    <div className="ca-wrap">
      <header className="acct-id">
        <div className="acct-avatar" aria-hidden="true">{initialsOf(profile?.full_name || profile?.email || company)}</div>
        <div className="acct-id-text">
          <span className="st-kicker">Your account</span>
          {lastVisit && <p className="acct-welcome">Welcome back · {lastVisit}</p>}
          <h1 className="acct-id-name">{profile?.full_name || 'Welcome back'}</h1>
          <div className="acct-id-sub">
            {profile?.email || session.user?.email}
            {admin && <a className="org-rolechip is-admin" href="#org" style={{ marginLeft: 8, whiteSpace: 'nowrap', textDecoration: 'none' }} aria-label="Company admin — open your organization">Company admin</a>}
            {company && <> · <a className="ca-link" href="#org">{company}</a>{tier && <span className="acct-tier">{tier}</span>}</>}
          </div>
        </div>
        <div className="acct-id-actions">
          {profile?.customer && <a className="gs-btn ghost sm" href="#org">Your organization →</a>}
          <a className="gs-btn ghost sm" href="#shop">Continue shopping</a>
          <button className="gs-btn ghost sm" onClick={() => signOut()}>Sign out</button>
        </div>
      </header>

      <div className="org-stats" style={{ marginBottom: 20 }}>
        <div className="org-stat"><div className="org-stat-v">{loadingOrders ? '…' : fmtMoney(totalSpent, curr)}</div><div className="org-stat-l">Invested</div></div>
        {/* count + spend both exclude cancelled/refunded, so the two tiles can't disagree; tiles jump to the Purchases tab */}
        <button type="button" className="org-stat" onClick={() => setTab('orders')} style={{ cursor: 'pointer', font: 'inherit', textAlign: 'left' }} aria-label="View your orders"><div className="org-stat-v">{loadingOrders ? '…' : liveOrders.length}</div><div className="org-stat-l">Orders</div></button>
        <button type="button" className="org-stat" onClick={() => setTab('orders')} style={{ cursor: 'pointer', font: 'inherit', textAlign: 'left' }} aria-label="View your quotes"><div className="org-stat-v">{openQuotes}</div><div className="org-stat-l">Open quotes</div></button>
      </div>

      {nextStep && (
        <section className="acct-next" aria-labelledby="acct-next-h">
          <div className="acct-next-text">
            <span className="st-kicker">Your next step</span>
            <h2 id="acct-next-h">{nextStep.title}</h2>
            <p>{nextStep.body}</p>
          </div>
          <div className="acct-next-ctas">
            {nextStep.ctas.map((c, i) => c.href
              ? <a key={i} className={'gs-btn ' + (c.primary ? 'primary' : 'ghost') + ' sm'} href={c.href}>{c.label}</a>
              : <button key={i} type="button" className={'gs-btn ' + (c.primary ? 'primary' : 'ghost') + ' sm'} onClick={c.onClick}>{c.label}</button>)}
          </div>
        </section>
      )}

      {profile?.customer && !isCompanyAdmin(profile) && (() => {
        // a non-admin member hits walls (company settings, team, licences they can't manage) — give them a warm
        // route to whoever can help: their company admin if known, else the Greatstone team.
        const href = askAdminMailto({ company, admin: companyAdmin });
        return <p className="acct-askadmin">Need access to company settings, team or a licence you can&rsquo;t manage? <a className="ca-link" href={href}>Ask your admin{companyAdmin?.full_name ? ' (' + firstNameOf(companyAdmin.full_name) + ')' : ''} &rarr;</a></p>;
      })()}

      {!pendingDismissed && pending.length > 0 && (
        <section className="acct-pending" role="region" aria-label="Items that need your attention">
          <span className="acct-pending-icon" aria-hidden="true">!</span>
          <div className="acct-pending-body">
            <h2 className="acct-pending-h">{pending.length} thing{pending.length === 1 ? '' : 's'} need{pending.length === 1 ? 's' : ''} your attention</h2>
            <ul className="acct-pending-list">
              {pending.map(p => (
                <li key={p.key}>
                  <button type="button" className={'acct-pending-link' + (p.urgent ? ' is-urgent' : '')} onClick={p.action}>{p.label}<span aria-hidden="true"> →</span></button>
                </li>
              ))}
            </ul>
          </div>
          <button type="button" className="acct-pending-x" onClick={() => setPendingDismissed(true)} aria-label="Dismiss this attention banner">×</button>
        </section>
      )}

      <div className="acct-settings">
        <div className="ca-tabs acct-tabs" role="tablist" aria-label="Your account" style={{ flexWrap: 'wrap' }}>
          {ACCOUNT_TABS.map((t, i) => (
            <button key={t.id} id={'acct-tab-' + t.id} role="tab" type="button"
              aria-selected={tab === t.id} aria-controls={'acct-panel-' + t.id}
              tabIndex={tab === t.id ? 0 : -1}
              className={tab === t.id ? 'on' : ''}
              onClick={() => setTab(t.id)} onKeyDown={(e) => onTabKey(e, i)}>{t.label}</button>
          ))}
        </div>

        {/* Purchases — order history + quotes */}
        <div role="tabpanel" id="acct-panel-orders" aria-labelledby="acct-tab-orders" hidden={tab !== 'orders'}>
          <div className="acct-ordhead">
            <h2>Order history</h2>
            {!!orders.length && (
              <div className="acct-ordhead-actions">
                {liveOrders[0] && <button className="gs-btn ghost sm" onClick={() => reorder(liveOrders[0])}>Reorder your last order</button>}
                <button className="gs-btn ghost sm" onClick={loadOrders}>Refresh</button>
              </div>
            )}
          </div>
          {!loadingOrders && !ordersErr && orders.length > 0 && (
            <div className="acct-ordtools">
              <input className="acct-ordsearch" type="search" value={orderQ} onChange={e => setOrderQ(e.target.value)}
                placeholder="Search by reference, item or status…" aria-label="Search your orders" />
              {orderQuery && <span className="acct-ordcount" role="status" aria-live="polite">{filteredOrders.length} of {orders.length}</span>}
            </div>
          )}
          <div className="ca-table-wrap">
            <table className="ca-table acct-orders">
              <thead><tr><th scope="col">Date</th><th scope="col">Reference</th><th scope="col">Items</th><th scope="col">Total</th><th scope="col">Status</th><th scope="col"><span className="gs-sr-only">Actions</span></th></tr></thead>
              <tbody>
                {loadingOrders ? <tr><td colSpan="6" className="ca-muted" data-label=""><span role="status">Loading your orders…</span></td></tr>
                  : ordersErr ? <tr><td colSpan="6" className="ca-muted" data-label=""><span role="alert">Couldn't load your orders. <button className="ca-link" onClick={loadOrders}>Try again</button></span></td></tr>
                    : !orders.length ? <tr><td colSpan="6" className="ca-muted" data-label=""><span role="status">No orders yet. <a className="ca-link" href="#shop">Browse the store →</a></span></td></tr>
                      : !filteredOrders.length ? <tr><td colSpan="6" className="ca-muted" data-label=""><span role="status">No orders match “{orderQ.trim()}”. <button className="ca-link" onClick={() => setOrderQ('')}>Clear search</button></span></td></tr>
                      : filteredOrders.map(o => {
                        const expanded = open === o.id;
                        return (
                          <React.Fragment key={o.id}>
                            <tr className="acct-ordrow" onClick={() => setOpen(expanded ? null : o.id)}>
                              <td data-label="Date">{fmtDate(o.placed_at || o.created_at)}</td>
                              <td data-label="Reference" className="ca-name"><code className="ca-ref">{ref(o.reference)}</code></td>
                              <td data-label="Items">{(o.order_items || []).length}</td>
                              <td data-label="Total" className="ca-amt">{fmtMoney(o.total_minor, o.currency)}</td>
                              <td data-label="Status"><span className={'ca-status ca-ord-' + o.status}>{o.status}</span>{o.refunded_minor > 0 && o.status !== 'refunded' && <span className="ca-ord-refund">−{fmtMoney(o.refunded_minor, o.currency)}</span>}</td>
                              <td className="ca-ord-actions acct-ord-cell-actions">
                                <button className="acct-toggle" aria-expanded={expanded} aria-controls={'ord-' + o.id} onClick={(e) => { e.stopPropagation(); setOpen(expanded ? null : o.id); }} title={expanded ? 'Hide items' : 'Show items'}>{expanded ? '▾' : '▸'}</button>
                                <a className="gs-btn ghost sm" href={'#invoice/' + o.id} onClick={(e) => e.stopPropagation()}>Invoice</a>
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
                                  {keysByOrder[o.id]?.length > 0 && (
                                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.1)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                                      <span style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em', opacity: .65 }}>Licence keys for this order</span>
                                      {keysByOrder[o.id].map(k => {
                                        const isCopied = copiedKey === k.id;
                                        const name = `${k.offering_name}${k.variant_name ? ' · ' + k.variant_name : ''}${k.status !== 'issued' ? ` (${k.status})` : ''}`;
                                        return (
                                          <button key={k.id} type="button" className={'acct-keychip' + (isCopied ? ' is-copied' : '')}
                                            onClick={(e) => { e.stopPropagation(); copyKey(k); }}
                                            aria-label={isCopied ? `Copied licence key for ${k.offering_name}` : `Copy licence key for ${k.offering_name}`}
                                            title="Copy this licence key">
                                            {isCopied ? 'Copied ✓' : name}
                                          </button>
                                        );
                                      })}
                                      <span className="gs-sr-only" role="status" aria-live="polite">{copiedKey ? 'Licence key copied' : ''}</span>
                                      <button type="button" className="gs-btn ghost sm" style={{ marginLeft: 'auto' }} onClick={(e) => { e.stopPropagation(); setTab('keys'); }}>Open in Keys →</button>
                                    </div>
                                  )}
                                </div>
                              </td></tr>
                            )}
                          </React.Fragment>
                        );
                      })}
              </tbody>
            </table>
          </div>
          {(quotes.length > 0 || quotesErr) && <>
            <div className="acct-ordhead" style={{ marginTop: 28 }}><h2>Quotes</h2></div>
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
                          ? <>{fmtMoney(qt.quoted_total_minor, qt.currency)} <span className="ca-muted">(quoted, inc VAT)</span>{qt.valid_until ? <span className="ca-muted"> · valid until {fmtDate(qt.valid_until)}</span> : ''}{qt.valid_until && !['won', 'lost', 'cancelled'].includes(qt.status) && (() => {
                              const d = daysUntil(qt.valid_until); if (d === null) return null;
                              const cls = d < 0 ? ' is-over' : d <= 7 ? ' is-soon' : '';
                              return <span className={'acct-qcd' + cls}>{d < 0 ? 'Expired' : d === 0 ? 'Expires today' : `${d} day${d === 1 ? '' : 's'} left`}</span>;
                            })()}</>
                          : qt.indicative_total_minor != null
                            ? <>{fmtMoney(qt.indicative_total_minor, qt.currency)} <span className="ca-muted">(indicative, ex VAT)</span></>
                            : '–'}
                      </td>
                      <td data-label="Status"><span className={'ca-status ca-q-' + qt.status}>{quoteLabel(qt.status)}</span></td>
                      <td data-label="Invoice">{ord
                        ? <a className="ca-link" href={'#invoice/' + ord.id}>View invoice{ord.invoice_number ? ' ' + ord.invoice_number : ''}</a>
                        : <a className="ca-link" href={'mailto:DX@greatstoneinternational.co.uk?subject=' + encodeURIComponent('Re: quote ' + qt.reference) + '&body=' + encodeURIComponent('Hi Greatstone team,\n\nI\'d like to discuss quote ' + qt.reference + '.\n\nThanks')} aria-label={'Email the Greatstone team about quote ' + qt.reference}>Discuss this →</a>}</td>
                    </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </>}
        </div>

        {/* Licence keys */}
        <div role="tabpanel" id="acct-panel-keys" aria-labelledby="acct-tab-keys" hidden={tab !== 'keys'}>
          <LicenceKeys />
        </div>

        <div role="tabpanel" id="acct-panel-profile" aria-labelledby="acct-tab-profile" hidden={tab !== 'profile'}>
          <ProfileCard profile={profile} onProfile={onProfile} flash={flash} />
        </div>
        <div role="tabpanel" id="acct-panel-security" aria-labelledby="acct-tab-security" hidden={tab !== 'security'}>
          <SecurityCard email={profile?.email} lastSignIn={session.user?.last_sign_in_at} flash={flash} />
        </div>
        <div role="tabpanel" id="acct-panel-billing" aria-labelledby="acct-tab-billing" hidden={tab !== 'billing'}>
          <div className="pr-form">
            <h2>Billing &amp; cards</h2>
            {orders.length === 0 ? (
              // no purchases yet → don't send them into an empty Stripe portal (and don't create a Stripe customer for nothing)
              <p className="ca-note">Your saved cards, invoices and receipts will appear here after your first purchase. <a className="ca-link" href="#shop">Browse the store →</a></p>
            ) : (<>
              <p className="ca-note">Manage saved cards, download invoices and receipts in the secure Stripe portal.</p>
              <button className="gs-btn ghost" onClick={openPortal} disabled={portalBusy}>{portalBusy ? 'Opening…' : 'Manage billing & cards →'}</button>
            </>)}
          </div>
        </div>
      </div>
      {toast && <div className="ca-toast" role="status">{toast}</div>}
    </div>
  );
}

function ProfileCard({ profile, onProfile, flash }) {
  // Personal page edits the PERSON only (name, phone). Company details live on the org dashboard,
  // where editing is admin-gated (DB-enforced since migration 0014) — so this no longer writes customers.
  const [name, setName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setName(profile?.full_name || ''); setPhone(profile?.phone || ''); }, [profile]);
  // only let Save write when something actually changed — a no-op save that flashes "saved" is misleading
  const dirty = name.trim() !== (profile?.full_name || '').trim() || phone.trim() !== (profile?.phone || '').trim();

  const save = async () => {
    if (!profile?.id || !dirty) return;
    setBusy(true);
    const { error } = await supabase.from('customer_users').update({ full_name: name.trim() || null, phone: phone.trim() || null }).eq('id', profile.id);
    setBusy(false);
    if (error) { flash('Could not save profile.'); return; }
    flash('Profile saved.');
    getCustomerProfile().then(onProfile);
  };

  return (
    <div className="pr-form">
      <h2>Profile</h2>
      <label>Your name<input value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></label>
      <label>Phone<input value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" /></label>
      {profile?.customer && <p className="ca-note">Company: <b>{profile.customer.name}</b> — manage company details in <a className="ca-link" href="#org">your organization</a>.</p>}
      <button className="gs-btn primary" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : dirty ? 'Save profile' : 'Saved ✓'}</button>
    </div>
  );
}

function SecurityCard({ email, lastSignIn, flash }) {
  const [pw, setPw] = useState(''); const [confirmPw, setConfirmPw] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const [signingOut, setSigningOut] = useState(false);
  const fmtWhen = (s) => { try { return new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return s; } };
  const save = async (e) => {
    e.preventDefault(); setErr(null);
    if (pw.length < 8) { setErr('Use at least 8 characters.'); return; }
    if (pw !== confirmPw) { setErr('Passwords do not match.'); return; }
    setBusy(true);
    const { error } = await updatePassword(pw); setBusy(false);
    if (error) { setErr(error.message); return; }
    setPw(''); setConfirmPw(''); flash('Password updated.');
  };
  const signOutEverywhere = async () => {
    if (typeof window !== 'undefined' && !window.confirm('Sign out of Greatstone on all your devices?')) return;
    setSigningOut(true);
    const { error } = await signOutAll(); setSigningOut(false);
    if (error) flash('Could not sign out everywhere.'); // onAuth flips the session → AuthGate on success
  };
  return (
    <form className="pr-form" onSubmit={save}>
      <h2>Security</h2>
      {lastSignIn && <p className="ca-note" style={{ marginTop: -4 }}>Last signed in {fmtWhen(lastSignIn)}.</p>}
      <label>New password<PasswordInput value={pw} onChange={e => setPw(e.target.value)} minLength={8} autoComplete="new-password" showStrength /></label>
      <label>Confirm new password<PasswordInput value={confirmPw} onChange={e => setConfirmPw(e.target.value)} minLength={8} autoComplete="new-password" /></label>
      {err && <div className="ca-err" role="alert">{err}</div>}
      <button className="gs-btn primary" type="submit" disabled={busy || !pw}>{busy ? 'Updating…' : 'Update password'}</button>
      <div className="acct-seclist">
        <div className="acct-secrow">
          <div className="acct-secinfo"><b>Two-factor authentication</b><span>Add a second step at sign-in for extra protection.</span></div>
          <a className="gs-btn ghost sm" href="#go/contact" aria-label="Ask us to enable two-factor authentication">Ask us to enable</a>
        </div>
        <div className="acct-secrow">
          <div className="acct-secinfo"><b>Active sessions</b><span>Signed in as {email}. Use this if you've signed in on a shared or lost device.</span></div>
          <button type="button" className="gs-btn ghost sm" onClick={signOutEverywhere} disabled={signingOut} aria-label="Sign out everywhere — end all active sessions">{signingOut ? 'Signing out…' : 'Sign out everywhere'}</button>
        </div>
      </div>
      <p className="ca-note">To change your account email, contact us. We'll never ask for your password by email.</p>
    </form>
  );
}
