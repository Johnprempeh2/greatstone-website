// Live-store basket UI: floating button + slide-over drawer + Stripe checkout, plus the post-payment
// confirmation panel. Prices shown here are indicative; the edge function reconfirms every figure
// server-side before charging. TEST MODE — uses Stripe test keys; no real money moves.
import React, { useState, useEffect, useCallback } from 'react';
import { useCart, setQty, removeItem, clearCart, cartCount, cartSubtotalMinor, startCheckout } from './cart.mjs';
import { fmtMoney } from '../lib/pricing.mjs';

const VAT_RATE = Number((typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_VAT_RATE) || 0.20);

export default function StoreCart({ confirmed = false }) {
  const items = useCart();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const count = cartCount();

  // close the drawer with Escape; lock nothing else (the store stays interactive behind the scrim click)
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open]);

  const checkout = useCallback(async () => {
    setBusy(true); setErr(null);
    try { const url = await startCheckout({ email: email.trim() || undefined }); window.location.href = url; }
    catch (e) { setErr(e.message || 'Could not start checkout.'); setBusy(false); }
  }, [email]);

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

      {open && (
        <div className="sc-scrim" onClick={() => setOpen(false)}>
          <aside className="sc-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Your basket">
            <header className="sc-head">
              <h2>Your basket{count ? ' · ' + count : ''}</h2>
              <button className="sc-x" onClick={() => setOpen(false)} aria-label="Close basket">✕</button>
            </header>

            {!items.length ? (
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
                <button className="sc-clear" onClick={() => clearCart()} disabled={busy}>Empty basket</button>
                <p className="sc-note">Secure card payment via Stripe. Prices reconfirmed at checkout. Prefer a tailored quote or volume pricing? <a href="#book" onClick={() => setOpen(false)}>Request a quote</a>.</p>
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
