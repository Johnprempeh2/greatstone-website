// My GSAM (GSAM for Mac, P4): sign in with the website account, pick a package or modules, pay with Stripe Checkout,
// then see the licence key, the download, the modules, paid-until and status, and manage billing in the Stripe portal.
import React, { useCallback, useEffect, useState } from 'react';
import { getSession, onAuth } from '../store/customerAuth.mjs';
import { AuthGate } from '../store/AccountDashboard.jsx';
import { fmtMoney } from '../lib/pricing.mjs';
import { detectGsamPlatform, gsamTotal, gsamStatusLabel } from './gsam-model.mjs';
import '../store/store.css';
import '../store/admin.css';
import './my-gsam.css';

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Not known yet');
const LIVE = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'];

export default function MyGsam() {
  const [session, setSession] = useState(undefined);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const justPaid = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('checkout') === 'done';

  useEffect(() => {
    getSession().then((s) => setSession(s || null));
    const { data: sub } = onAuth((s) => setSession(s || null));
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/gsam/account', { credentials: 'same-origin' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError({ status: response.status, message: body.error || 'Could not load your GSAM account.' }); return; }
      setError(null);
      setData(body);
    } catch { setError({ status: 0, message: 'Could not reach the website. Check your connection and try again.' }); }
  }, []);

  useEffect(() => { if (session) load(); }, [session, load]);

  // Straight after payment the key arrives with Stripe's webhook, usually within seconds: check again for a minute.
  useEffect(() => {
    if (!justPaid || !session || data?.licence) return undefined;
    let tries = 0;
    const timer = setInterval(() => { tries += 1; if (tries > 15) clearInterval(timer); else load(); }, 4000);
    return () => clearInterval(timer);
  }, [justPaid, session, data?.licence, load]);

  if (session === undefined) return <div className="ca-wrap"><p className="ca-center" role="status">Checking…</p></div>;
  if (!session) return (
    <div className="gsam-acct gsam-out">
      <div className="ca-wrap gsam-intro">
        <p className="st-kicker">GSAM for Mac</p>
        <h1>Get GS Agentic Manager on your Mac</h1>
        <p className="gsam-lead">Sign in or create your Greatstone account, pick the modules you need, then pay monthly or annually. Your licence key and the download appear here straight after payment.</p>
      </div>
      <AuthGate />
    </div>
  );
  return (
    <div className="ca-wrap gsam-acct" role="region" aria-labelledby="gsam-acct-title">
      <p className="st-kicker">GSAM for Mac</p>
      <h1 id="gsam-acct-title">My GSAM</h1>
      {error ? <GsamError error={error} onRetry={load} />
        : !data ? <p role="status" className="gsam-muted">Loading your GSAM…</p>
          : data.subscription && LIVE.includes(data.subscription.status)
            ? <Owned data={data} justPaid={justPaid} onReload={load} />
            : <Picker catalogue={data.catalogue} ended={data.subscription} />}
    </div>
  );
}

function GsamError({ error, onRetry }) {
  if (error.status === 404) return (
    <div className="pr-form"><h2>No customer account here</h2>
      <p>This sign-in is not set up as a customer. <a className="ca-link" href="/contact">Contact us</a> and we will set you up.</p></div>
  );
  return <div className="pr-form"><p className="ca-err" role="alert">{error.message}</p>
    <button type="button" className="gs-btn ghost" onClick={onRetry}>Try again</button></div>;
}

function Owned({ data, justPaid, onReload }) {
  const sub = data.subscription;
  const [key, setKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  const reveal = async () => {
    setBusy(true); setNote(null);
    try {
      const response = await fetch('/api/gsam/account?reveal=1', { credentials: 'same-origin' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.licence?.key) throw new Error(body.error);
      setKey(body.licence.key);
    } catch { setNote('Could not show the key just now. Try again.'); }
    setBusy(false);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(key); setNote('Licence key copied.'); }
    catch { setNote('Copy did not work here. Select the key and copy it.'); }
  };
  const portal = async () => {
    setBusy(true); setNote(null);
    try {
      const response = await fetch('/api/stripe-portal', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ returnUrl: location.origin + '/my-gsam' }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.url) throw new Error(body.error);
      location.href = body.url;
      return;
    } catch { setNote('The billing portal is not available just now. Try again shortly.'); }
    setBusy(false);
  };

  return <>
    {justPaid && <p className="ca-ok" role="status">Payment received. Thank you.</p>}
    <section className="pr-form gsam-card" aria-labelledby="gsam-key-title">
      <h2 id="gsam-key-title">Licence key</h2>
      {!data.licence ? <p className="gsam-muted" role="status">
        Your licence key is being made. This page checks again by itself. <button type="button" className="ca-link" onClick={onReload}>Check now</button>
      </p> : <>
        <p className="gsam-muted">Enter this key when you install GSAM on your computer. Keep it private: it activates your install.</p>
        <div className="gsam-key">
          <code aria-live="polite">{key || '•••••••• hidden ••••••••'}</code>
          {key
            ? <button type="button" className="gs-btn ghost" onClick={copy}>Copy key</button>
            : <button type="button" className="gs-btn ghost" onClick={reveal} disabled={busy}>{busy ? 'Showing…' : 'Show key'}</button>}
        </div>
        {data.licence.expiresAt && <p className="gsam-muted">Activate by {fmtDate(data.licence.expiresAt)}.</p>}
      </>}
    </section>
    <Downloads links={data.downloads || { mac: data.downloadUrl || null, windows: null }} />
    <section className="pr-form gsam-card" aria-labelledby="gsam-plan-title">
      <h2 id="gsam-plan-title">Your subscription</h2>
      <dl className="gsam-facts">
        <div><dt>Status</dt><dd>{gsamStatusLabel(sub)}</dd></div>
        <div><dt>Paid until</dt><dd>{fmtDate(sub.paidUntil)}</dd></div>
        <div><dt>Billing</dt><dd>{sub.interval === 'year' ? 'Annual' : sub.interval === 'month' ? 'Monthly' : 'Not known yet'}</dd></div>
        <div><dt>Modules</dt><dd>{sub.modules.length ? <ul>{sub.modules.map((m, i) => <li key={m + i}>{m}</li>)}</ul> : 'None'}</dd></div>
      </dl>
      <p className="gsam-muted">Change modules, switch between monthly and annual, update your card or cancel in the secure Stripe billing portal. GSAM stops at the end of the paid period; your data stays on your computer.</p>
      <button type="button" className="gs-btn primary" onClick={portal} disabled={busy}>{busy ? 'Opening…' : 'Manage billing'}</button>
    </section>
    <div className="gs-sr-only" role="status" aria-live="polite">{note || ''}</div>
    {note && <p className="gsam-note">{note}</p>}
  </>;
}

const PLATFORMS = {
  mac: { label: 'Mac', button: 'Download GSAM for Mac',
    help: 'The first time you open it, right-click the app and choose Open.' },
  windows: { label: 'Windows', button: 'Download GSAM for Windows',
    help: 'Windows may say "Windows protected your PC" because the installer is new. Choose More info, then Run anyway. It installs for you only and needs no administrator password.' },
};

/** The download for the visitor's computer first (from the browser), with a switch to the other one. */
function Downloads({ links }) {
  const [platform, setPlatform] = useState('mac');
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const picked = detectGsamPlatform(navigator.userAgent, navigator.userAgentData?.platform);
    if (picked) setPlatform(picked);
  }, []);
  const chosen = PLATFORMS[platform];
  return <section className="pr-form gsam-card" aria-labelledby="gsam-dl-title">
    <h2 id="gsam-dl-title">Download</h2>
    <div className="gsam-platforms" role="radiogroup" aria-label="Your computer">
      {Object.entries(PLATFORMS).map(([id, p]) =>
        <button key={id} type="button" role="radio" aria-checked={platform === id}
          className={'gs-btn ' + (platform === id ? 'primary' : 'ghost')} onClick={() => setPlatform(id)}>{p.label}</button>)}
    </div>
    {links[platform]
      ? <><a className="gs-btn primary gsam-dl" href={links[platform]}>{chosen.button}</a>
        <p className="gsam-muted">{chosen.help}</p></>
      : <p className="gsam-muted">The {chosen.label} download is on its way. We will email you when it is ready.</p>}
  </section>;
}

function Picker({ catalogue = [], ended }) {
  const [interval, setBilling] = useState('month');
  const [pkg, setPkg] = useState('');
  const [modules, setModules] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const packages = catalogue.filter((item) => item.kind !== 'module');
  const mods = catalogue.filter((item) => item.kind === 'module');
  const picked = pkg ? [pkg] : modules;
  const total = gsamTotal(catalogue, picked, interval);
  const per = interval === 'year' ? 'a year' : 'a month';
  const priceOf = (item) => item.prices?.[interval];

  const buy = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const response = await fetch('/api/gsam/checkout', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemIds: picked, interval }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.url) { setErr(body.error || 'Could not start checkout. Please try again.'); setBusy(false); return; }
      location.href = body.url;
    } catch { setErr('Could not reach the website. Check your connection and try again.'); setBusy(false); }
  };

  if (!catalogue.length) return <div className="pr-form"><p className="gsam-muted">GSAM is not on sale online yet. <a className="ca-link" href="/gs-agentic-manager">Ask us about GS Agentic Manager</a>.</p></div>;
  return (
    <form className="pr-form gsam-card gsam-pick" onSubmit={buy} aria-describedby={err ? 'gsam-pick-err' : undefined}>
      <h2>Choose your GSAM</h2>
      {ended && <p className="gsam-muted">Your last subscription has ended. Pick again to carry on; your data is still on your Mac.</p>}
      <div className="ca-tabs gsam-interval" role="group" aria-label="Billing period">
        <button type="button" aria-pressed={interval === 'month'} className={interval === 'month' ? 'on' : ''} onClick={() => setBilling('month')}>Monthly</button>
        <button type="button" aria-pressed={interval === 'year'} className={interval === 'year' ? 'on' : ''} onClick={() => setBilling('year')}>Annual</button>
      </div>
      {packages.length > 0 && <fieldset>
        <legend>Packages</legend>
        {packages.map((item) => <label key={item.id} className={'gsam-option' + (priceOf(item) ? '' : ' off')}>
          <input type="radio" name="gsam-package" value={item.id} checked={pkg === item.id} disabled={!priceOf(item)}
            onChange={() => { setPkg(item.id); setModules([]); }} />
          <span className="gsam-option-name">{item.name}{item.kind === 'deal' && <span className="gsam-tag">Your price</span>}</span>
          <span className="gsam-option-price">{priceOf(item) ? `${fmtMoney(priceOf(item).amount, priceOf(item).currency)} ${per}` : `Not sold ${interval === 'year' ? 'annually' : 'monthly'}`}</span>
          {item.description && <span className="gsam-option-desc">{item.description}</span>}
        </label>)}
        <label className="gsam-option">
          <input type="radio" name="gsam-package" value="" checked={!pkg} onChange={() => setPkg('')} />
          <span className="gsam-option-name">No package, I will pick modules</span>
        </label>
      </fieldset>}
      {mods.length > 0 && <fieldset disabled={!!pkg}>
        <legend>Modules{pkg ? ' (included in the package)' : ''}</legend>
        {mods.map((item) => <label key={item.id} className={'gsam-option' + (priceOf(item) ? '' : ' off')}>
          <input type="checkbox" value={item.id} checked={modules.includes(item.id)} disabled={!priceOf(item)}
            onChange={(e) => setModules((now) => (e.target.checked ? [...now, item.id] : now.filter((id) => id !== item.id)))} />
          <span className="gsam-option-name">{item.name}</span>
          <span className="gsam-option-price">{priceOf(item) ? `${fmtMoney(priceOf(item).amount, priceOf(item).currency)} ${per}` : `Not sold ${interval === 'year' ? 'annually' : 'monthly'}`}</span>
          {item.description && <span className="gsam-option-desc">{item.description}</span>}
        </label>)}
      </fieldset>}
      <p className="gsam-total" aria-live="polite">{total ? <>Total: <strong>{fmtMoney(total.amount, total.currency)}</strong> {per}</> : 'Pick a package or at least one module.'}</p>
      {err && <p id="gsam-pick-err" className="ca-err" role="alert">{err}</p>}
      <button className="gs-btn primary" type="submit" disabled={busy || !total}>{busy ? 'Opening checkout…' : 'Continue to payment'}</button>
      <p className="gsam-muted">You pay on Stripe&rsquo;s secure page. Change modules or cancel at any time with Manage billing.</p>
    </form>
  );
}
