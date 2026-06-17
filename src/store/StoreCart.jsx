// Live-store basket UI: floating button + slide-over drawer + Stripe checkout, plus the post-payment
// confirmation panel. Prices shown here are indicative; the edge function reconfirms every figure
// server-side before charging. TEST MODE — uses Stripe test keys; no real money moves.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useModal } from './useModal.mjs';
import { useCart, setQty, removeItem, clearCart, cartCount, cartSubtotalMinor, startCheckout, requestQuote } from './cart.mjs';
import { fmtMoney } from '../lib/pricing.mjs';
import { getSession } from './customerAuth.mjs';

const VAT_RATE = Number((typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_VAT_RATE) || 0.20);

export default function StoreCart({ confirmed = false }) {
  const items = useCart();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('cart'); // cart | quote | sent
  const [email, setEmail] = useState('');
  const [q, setQ] = useState({ name: '', email: '', company: '', phone: '', po: '', message: '' });
  const [quoteRef, setQuoteRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const count = cartCount();

  const drawerRef = useRef(null);
  const closeCart = useCallback(() => { setOpen(false); setView('cart'); }, []);
  useModal(drawerRef, open, closeCart); // focus-in, Tab-trap, scroll-lock, Escape, focus-restore

  // prefill the quote contact email from the signed-in account, if any
  useEffect(() => { if (view === 'quote' && !q.email) getSession().then(s => { const e = s?.user?.email; if (e) setQ(v => ({ ...v, email: e })); }); }, [view]); // eslint-disable-line

  const checkout = useCallback(async () => {
    setBusy(true); setErr(null);
    try { const url = await startCheckout({ email: email.trim() || undefined }); window.location.href = url; }
    catch (e) { setErr(e.message || 'Could not start checkout.'); setBusy(false); }
  }, [email]);

  const submitQuote = useCallback(async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const ref = await requestQuote({ contact: { name: q.name.trim(), email: q.email.trim(), company: q.company.trim(), phone: q.phone.trim() }, poReference: q.po.trim() || undefined, message: q.message.trim() || undefined });
      setQuoteRef(ref); setView('sent'); clearCart();
    } catch (e2) { setErr(e2.message || 'Could not submit the quote.'); }
    setBusy(false);
  }, [q]);
  const setQf = (k, v) => setQ(s => ({ ...s, [k]: v }));

  if (confirmed) return <Confirmed />;

  const sub = cartSubtotalMinor();
  const vat = Math.round(sub * VAT_RATE);
  const cur = (items[0] && items[0].currency) || 'GBP';

  return (
    <>
      <button className="sc-fab" onClick={() => setOpen(true)} aria-label={'Basket' + (count ? ' (' + count + ')' : '')}>
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
        {count > 0 && <span className="sc-fab-badge">{count}</span>}
      </button>
      <div className="gs-sr-only" aria-live="polite" aria-atomic="true">{count > 0 ? count + ' item' + (count === 1 ? '' : 's') + ' in your basket' : 'Basket empty'}</div>

      {open && (
        <div className="sc-scrim" onClick={() => setOpen(false)}>
          <aside ref={drawerRef} tabIndex={-1} className="sc-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="sc-title">
            <header className="sc-head">
              <h2 id="sc-title">Your basket{count ? ' · ' + count : ''}</h2>
              <button className="sc-x" onClick={() => setOpen(false)} aria-label="Close basket">✕</button>
            </header>

            {view === 'sent' ? (
              <div className="sc-empty">
                <div className="sc-tick" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></div>
                <h3>Quote request sent</h3>
                <p>Reference <b>{quoteRef}</b>. Our team will price it (volume discounts, bespoke terms) and send your quote, normally within one business day.</p>
                <button className="gs-btn primary" onClick={() => { setView('cart'); setOpen(false); }}>Done</button>
              </div>
            ) : view === 'quote' ? (
              <form className="sc-quote" onSubmit={submitQuote}>
                <p className="sc-note">Tell us where to send the quote. We'll price it and invoice on a purchase order — no card needed.</p>
                <label>Company<input value={q.company} onChange={(e) => setQf('company', e.target.value)} autoComplete="organization" /></label>
                <label>Your name<input value={q.name} onChange={(e) => setQf('name', e.target.value)} autoComplete="name" /></label>
                <label>Email<input type="email" required value={q.email} onChange={(e) => setQf('email', e.target.value)} autoComplete="email" /></label>
                <label>Phone (optional)<input value={q.phone} onChange={(e) => setQf('phone', e.target.value)} autoComplete="tel" /></label>
                <label>PO reference (optional)<input value={q.po} onChange={(e) => setQf('po', e.target.value)} /></label>
                <label>Notes (optional)<textarea rows="2" value={q.message} onChange={(e) => setQf('message', e.target.value)} placeholder="Team size, timing, anything specific…" /></label>
                {err && <div className="sc-err" role="alert">{err}</div>}
                <button className="gs-btn primary" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send quote request'}</button>
                <button type="button" className="sc-clear" onClick={() => { setView('cart'); setErr(null); }}>Back to basket</button>
              </form>
            ) : !items.length ? (
              <div className="sc-empty">
                <p>Your basket is empty.</p>
                <a className="gs-btn ghost" href="#shop" onClick={() => setOpen(false)}>Browse the catalogue</a>
              </div>
            ) : (
              <>
                <ul className="sc-items">
                  {items.map((it) => (
                    <li key={it.variantId} className="sc-item">
                      <div className="sc-it-main">
                        <div className="sc-it-name">{it.name}</div>
                        <div className="sc-it-meta">{[it.vendor, it.edition].filter(Boolean).join(' · ')}</div>
                      </div>
                      <div className="sc-it-side">
                        <div className="sc-it-price">{fmtMoney((it.unitMinor || 0) * it.qty, it.currency)}</div>
                        <div className="sc-qty">
                          <button onClick={() => setQty(it.variantId, it.qty - 1)} aria-label="Decrease quantity" disabled={it.qty <= 1}>−</button>
                          <span>{it.qty}</span>
                          <button onClick={() => setQty(it.variantId, it.qty + 1)} aria-label="Increase quantity">+</button>
                        </div>
                        <button className="sc-rm" onClick={() => removeItem(it.variantId)}>Remove</button>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="sc-totals">
                  <div className="row"><span>Subtotal</span><span>{fmtMoney(sub, cur)}</span></div>
                  <div className="row"><span>VAT ({Math.round(VAT_RATE * 100)}%)</span><span>{fmtMoney(vat, cur)}</span></div>
                  <div className="row total"><span>Total</span><span>{fmtMoney(sub + vat, cur)}</span></div>
                </div>

                <label className="sc-email">Email for your receipt (optional)
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" />
                </label>

                {err && <div className="sc-err" role="alert">{err}</div>}
                <button className="gs-btn primary sc-pay" onClick={checkout} disabled={busy}>{busy ? 'Opening secure checkout…' : 'Checkout securely'}</button>
                <button className="gs-btn ghost sc-quote-btn" onClick={() => { setView('quote'); setErr(null); }} disabled={busy}>Request a quote · pay on invoice</button>
                <button className="sc-clear" onClick={() => clearCart()} disabled={busy}>Empty basket</button>
                <p className="sc-note">Pay securely by card via Stripe, or request a quote and we'll invoice you on a purchase order (volume discounts, bespoke terms). Prices reconfirmed before charging.</p>
              </>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

function Confirmed() {
  // Stripe redirected back after a successful test payment — clear the basket and thank the buyer.
  useEffect(() => { clearCart(); }, []);
  const sid = (location.hash.match(/session=([^&]+)/) || [])[1] || '';
  return (
    <>
      <div className="st-scrim" aria-hidden="true" />
      <div className="sc-confirm">
        <div className="sc-tick" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        </div>
        <span className="st-kicker">Payment received</span>
        <h1>Thank you — your order is confirmed.</h1>
        <p>We've emailed your receipt and the licensing team will be in touch shortly with your keys and onboarding details. Most licences are issued within one business day.</p>
        {sid && <p className="sc-ref">Reference: <code>{sid.slice(0, 24)}</code></p>}
        <div className="sc-confirm-cta">
          <a className="gs-btn primary" href="#shop">Continue browsing</a>
          <a className="gs-btn ghost" href="#book">Talk to the team</a>
        </div>
      </div>
    </>
  );
}
