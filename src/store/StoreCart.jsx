// Live-store basket UI: floating button + slide-over drawer + Stripe checkout, plus the post-payment
// confirmation panel. Prices shown here are indicative; the edge function reconfirms every figure
// server-side before charging. TEST MODE — uses Stripe test keys; no real money moves.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useModal } from './useModal.mjs';
import { useCart, setQty, removeItem, removeService, clearCart, clearQuoteLines, markQuoteLines, cartCount, cartSubtotalMinor, paidLines, quoteLines, startCheckout, requestBasketQuote, onOpenCart, MAX_QTY } from './cart.mjs';
import { fmtMoney } from '../lib/pricing.mjs';
import { track } from '../lib/analytics.js';
import { basketSignature, sentBasketQuote, sentQuoteReference } from './basketCheckout.mjs';
import './store.css';

const VAT_RATE = Number((typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_VAT_RATE) || 0.20);

export default function StoreCart({ confirmed = false }) {
  const items = useCart();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('cart'); // cart | sent
  const [email, setEmail] = useState('');
  const [q, setQ] = useState(() => {
    try {
      const pending = JSON.parse(sessionStorage.getItem('gs-basket-checkout') || 'null');
      return { name: '', email: JSON.parse(pending?.signature || '{}').email || '', company: '', message: '', ...pending?.contact };
    } catch { return { name: '', email: '', company: '', message: '' }; }
  });
  const [quoteRef, setQuoteRef] = useState('');
  const [submittedQuote, setSubmittedQuote] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [returnedFromCheckout] = useState(() => {
    try { return Boolean(JSON.parse(sessionStorage.getItem('gs-basket-checkout') || 'null')?.quoteReference); }
    catch { return false; }
  });
  const count = cartCount();
  const paid = paidLines();
  const quoted = quoteLines();
  let pendingCheckout = null;
  try { pendingCheckout = JSON.parse(sessionStorage.getItem('gs-basket-checkout') || 'null'); } catch { /* unavailable storage */ }
  const sentQuote = sentBasketQuote(pendingCheckout, items);

  const drawerRef = useRef(null);
  // reset the drawer to the basket view + clear any stale error on every close, so reopening the FAB
  // never resurfaces the quote form or a stale "sent"/error state from a previous session.
  const closeCart = useCallback(() => { setOpen(false); setView('cart'); setErr(null); setQuoteRef(''); }, []);
  useModal(drawerRef, open, closeCart); // focus-in, Tab-trap, scroll-lock, Escape, focus-restore

  // let a "View basket" affordance elsewhere (e.g. the product page) open this drawer
  useEffect(() => onOpenCart(() => setOpen(true)), []);

  const checkout = useCallback(async () => {
    setBusy(true); setErr(null);
    track('begin_checkout', { value_minor: cartSubtotalMinor(), items: paid.length });
    try {
      const contactEmail = (sentQuote?.email || q.email || email).trim();
      if (quoted.length && !sentQuote && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail))
        throw new Error('Enter your email to request a quote.');
      const signature = basketSignature(items, contactEmail);
      let previous = null;
      try { previous = JSON.parse(sessionStorage.getItem('gs-basket-checkout') || 'null'); } catch { /* unavailable storage */ }
      const reusable = previous?.signature === signature && Date.now() - previous.createdAt < 15 * 60 * 1000;
      const { url, id, dropped } = reusable ? previous : await startCheckout({ email: q.email.trim() || email.trim() || undefined });
      // Some basket lines can't be sold by card (POA / unpublished / sub-£1). Don't slip the buyer
      // past silently with a smaller order: name them and confirm before redirecting to pay.
      if (dropped && dropped.length) {
        markQuoteLines(dropped.map((line) => line.variantId));
        throw new Error('A price changed. The affected item is now in Request a quote. Review the basket before paying.');
      }
      let sentQuoteRef = sentQuoteReference(previous, items, contactEmail);
      if (quoted.length && !sentQuoteRef) {
        sentQuoteRef = await requestBasketQuote({ contact: q, message: q.message.trim(), paidOrderReference: id });
        setQuoteRef(sentQuoteRef);
      }
      try { sessionStorage.setItem('gs-basket-checkout', JSON.stringify({ signature, createdAt: Date.now(), url, id,
        quoteReference: sentQuoteRef, contact: q })); } catch { /* unavailable storage */ }
      // stash the indicative order value so the confirmation page (a fresh page load after the Stripe
      // redirect, where the basket is already cleared) can fire the funnel-completing purchase event.
      try { sessionStorage.setItem('gs-pending-purchase', JSON.stringify({ value_minor: cartSubtotalMinor(), currency: 'GBP', items: paid.length,
        paid: paid.map((x) => ({ name: x.name, qty: x.qty })), quoted: quoted.map((x) => ({ name: x.name, qty: x.qty })), quoteReference: sentQuoteRef })); } catch (e) { /* ignore */ }
      window.location.href = url;
    }
    catch (e) { setErr(e.message || 'Could not start checkout.'); setBusy(false); }
  }, [email, q, items, paid, quoted, sentQuote]);

  const submitQuote = useCallback(async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      let pending = null;
      try { pending = JSON.parse(sessionStorage.getItem('gs-basket-checkout') || 'null'); } catch { /* unavailable storage */ }
      const alreadySent = sentQuoteReference(pending, items, q.email);
      const ref = quoteRef || alreadySent || await requestBasketQuote({ contact: q, message: q.message.trim() });
      track('generate_lead', { form: 'basket_quote' });
      setSubmittedQuote(quoteLines().map((line) => ({ name: line.name, qty: line.qty })));
      setQuoteRef(ref); setView('sent'); clearQuoteLines();
    } catch (e2) { setErr(e2.message || 'Could not submit the quote.'); }
    setBusy(false);
  }, [q, quoteRef, items]);
  const setQf = (k, v) => setQ(s => ({ ...s, [k]: v }));

  if (confirmed) return <Confirmed />;

  const sub = cartSubtotalMinor();
  const vat = Math.round(sub * VAT_RATE);
  const cur = (items[0] && items[0].currency) || 'GBP';

  return (
    <>
      <button className="sc-fab" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} aria-label={'Basket' + (count ? ' (' + count + ')' : '')}>
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
        {count > 0 && <span className="sc-fab-badge">{count}</span>}
      </button>
      <div className="gs-sr-only" aria-live="polite" aria-atomic="true">{count > 0 ? count + ' item' + (count === 1 ? '' : 's') + ' in your basket' : 'Basket empty'}</div>

      {open && (
        <div className="sc-scrim" onClick={closeCart}>
          <aside ref={drawerRef} tabIndex={-1} className="sc-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="sc-title">
            <header className="sc-head">
              <h2 id="sc-title">{view === 'sent' ? 'Request received' : 'Your basket' + (count ? ' · ' + count : '')}</h2>
              <button className="sc-x" onClick={closeCart} aria-label="Close basket">✕</button>
            </header>

            {view === 'sent' ? (
              <div className="sc-empty">
                <div className="sc-tick" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></div>
                <p>Your quote request is with the team. Reference <b>{quoteRef}</b>.</p>
                <ul>{submittedQuote.map((line, index) => <li key={index}>{line.name} × {line.qty}</li>)}</ul>
                <a href="#book">Book a discovery call</a>
                <button className="gs-btn primary" onClick={closeCart}>Done</button>
              </div>
            ) : !items.length ? (
              <div className="sc-empty">
                <p>Your basket is empty.</p>
                <a className="gs-btn ghost" href="#shop" onClick={() => setOpen(false)}>Browse the catalogue</a>
              </div>
            ) : (
              <>
                <ul className="sc-items">
                  {items.map((it) => (
                    <li key={it.variantId || it.serviceSlug} className="sc-item">
                      <div className="sc-it-main">
                        <div className="sc-it-name">{it.name} <span className="sc-it-chip">{it.kind === 'service' || !it.unitMinor ? 'Quote' : 'Buy now'}</span></div>
                        <div className="sc-it-meta">{[it.vendor, it.edition, it.category].filter(Boolean).join(' · ')}</div>
                      </div>
                      <div className="sc-it-side">
                        <div className="sc-it-price">{it.kind === 'service' || !it.unitMinor ? '' : fmtMoney(it.unitMinor * it.qty, it.currency)}</div>
                        {it.kind !== 'service' && <div className="sc-qty">
                          <button onClick={() => setQty(it.variantId, it.qty - 1)} aria-label={'Decrease quantity of ' + it.name} disabled={it.qty <= 1}>−</button>
                          <span>{it.qty}</span>
                          <button onClick={() => setQty(it.variantId, it.qty + 1)} aria-label={'Increase quantity of ' + it.name} disabled={it.qty >= MAX_QTY} title={it.qty >= MAX_QTY ? 'Maximum ' + MAX_QTY + ' per line. Request a quote for larger volumes.' : undefined}>+</button>
                        </div>}
                        <button className="sc-rm" onClick={() => it.serviceSlug ? removeService(it.serviceSlug) : removeItem(it.variantId)} aria-label={'Remove ' + it.name + ' from basket'}>Remove</button>
                      </div>
                    </li>
                  ))}
                </ul>

                {paid.length > 0 && <section className="sc-panel sc-pay" aria-labelledby="sc-pay-title">
                  <h3 id="sc-pay-title">Pay now · {paid.length} item{paid.length === 1 ? '' : 's'} · {fmtMoney(sub + vat, cur)}</h3>
                  <div className="sc-totals">
                  <div className="row"><span>Subtotal</span><span>{fmtMoney(sub, cur)}</span></div>
                  <div className="row"><span>VAT ({Math.round(VAT_RATE * 100)}%)</span><span>{fmtMoney(vat, cur)}</span></div>
                  <div className="row total"><span>Total</span><span>{fmtMoney(sub + vat, cur)}</span></div>
                  </div>
                </section>}

                {paid.length > 0 && quoted.length === 0 && <label className="sc-email">Email for your card receipt (optional)
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" />
                </label>}

                {quoted.length > 0 && sentQuote ? <section className="sc-quote sc-panel" aria-labelledby="sc-quote-sent-title">
                  <h3 id="sc-quote-sent-title">Quote request sent · ref {sentQuote.reference}</h3>
                  <p className="sc-note">The team will be in touch. <a href="#book">Book a discovery call</a>.</p>
                </section> : quoted.length > 0 && <form id="sc-quote-form" className="sc-quote sc-panel" onSubmit={submitQuote}>
                  <h3>Request a quote · {quoted.length} item{quoted.length === 1 ? '' : 's'}</h3>
                  <p className="sc-note">The team will quote these items. <a href="#book">Book a discovery call</a>.</p>
                  <label>Your name<input value={q.name} onChange={(e) => setQf('name', e.target.value)} autoComplete="name" /></label>
                  <label>Company<input value={q.company} onChange={(e) => setQf('company', e.target.value)} autoComplete="organization" /></label>
                  <label>Email<input type="email" required value={q.email} onChange={(e) => setQf('email', e.target.value)} autoComplete="email" /></label>
                  <label>Notes (optional)<textarea rows="2" value={q.message} onChange={(e) => setQf('message', e.target.value)} /></label>
                  {paid.length === 0 && <button className="gs-btn primary" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send quote request'}</button>}
                </form>}

                {err && <div className="sc-err" role="alert">{err}</div>}
                {!err && returnedFromCheckout && paid.length > 0 && sentQuote && <div className="sc-err" role="status">Card payment was not completed. Your quote request is already with the team. You can retry the card payment below.</div>}

                {paid.length > 0 && <div className="sc-methods" role="group" aria-label="Pay now">
                  <button type="button" className="sc-method sc-method-card" onClick={checkout} disabled={busy}>
                    <span className="sc-method-ic" aria-hidden="true"><svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg></span>
                    <span className="sc-method-tx">
                      <span className="sc-method-t">{busy ? 'Opening secure checkout…' : sentQuote ? `Retry card payment · ${fmtMoney(sub + vat, cur)}` : quoted.length ? `Pay ${fmtMoney(sub + vat, cur)} and send quote request` : `Pay ${fmtMoney(sub + vat, cur)} by card`}</span>
                      <span className="sc-method-d">Card via Stripe. {quoted.length ? 'Services are not charged.' : 'Secure test payment.'}</span>
                    </span>
                    <span className="sc-method-go" aria-hidden="true">→</span>
                  </button>
                </div>}

                {paid.length > 0 && quoted.length > 0 && !sentQuote && <button className={err ? 'sc-quote-alone sc-quote-alone-fallback' : 'sc-quote-alone'} type="submit" form="sc-quote-form" disabled={busy}>Send quote request alone</button>}

                {paid.length > 0 && <p className="sc-note">Card payments are handled securely by Stripe. The server confirms tool prices before payment. Services are quoted separately.</p>}
                <button className="sc-clear" onClick={() => { if (window.confirm('Empty your basket?')) clearCart(); }} disabled={busy}>Empty basket</button>
              </>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

function Confirmed() {
  // Stripe redirected back after a successful test payment.
  const sid = (location.hash.match(/session=([^&]+)/) || [])[1] || '';
  // Only a plausible Stripe session id makes this a real confirmation. A bare/garbage #order-confirmed
  // (a bookmark of the success URL, Back/Forward after paying, or a hand-typed hash) must NOT show a
  // counterfeit "order confirmed" or wipe the basket / fire a phantom conversion.
  const valid = /^cs_(test|live)_/.test(sid);
  const isTest = /^cs_test_/.test(sid);
  // Show a clean reference, not the raw Stripe session id: drop the cs_test_/cs_live_ prefix + the
  // trailing secret segment. 12-char lowercase so it matches the account history + the receipt-email
  // subject byte-for-byte (was 18-char upper, which matched neither).
  const ref = sid.replace(/^cs_(test|live)_/, '').split('#')[0].slice(0, 12);
  const [pending] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('gs-pending-purchase') || 'null'); }
    catch { return null; }
  });
  // Clear the basket and fire the funnel-completing purchase event. checkout() stashed the order
  // value/currency before the Stripe redirect; read + remove it here so a refresh of this page can't
  // double-fire the value (transaction_id lets GA4 dedupe the conversion regardless). Dormant until
  // GTM is configured, like every other track() call.
  useEffect(() => {
    if (!valid) return; // no real session → leave the basket intact and fire no conversion
    clearCart();
    try { sessionStorage.removeItem('gs-pending-purchase'); sessionStorage.removeItem('gs-basket-checkout'); } catch (e) { /* ignore */ }
    track('purchase', { transaction_id: ref, value_minor: pending?.value_minor, currency: pending?.currency, items: pending?.items });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!valid) {
    return (
      <>
        <div className="st-scrim" aria-hidden="true" />
        <div className="sc-confirm">
          <span className="st-kicker">Order</span>
          <h1>We couldn&rsquo;t find that order.</h1>
          <p>This page confirms an order right after checkout. If you just paid and landed here, your order and receipt are in your account. Otherwise, browse the catalogue or talk to us.</p>
          <div className="sc-confirm-cta">
            <a className="gs-btn primary" href="#account">Go to your account</a>
            <a className="gs-btn ghost" href="#shop">Browse the catalogue</a>
            <a className="gs-btn ghost" href="#book">Talk to the team</a>
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="st-scrim" aria-hidden="true" />
      <div className="sc-confirm">
        {isTest && <div className="sc-testbanner" role="status">Test mode: this was a Stripe test payment. No real money was taken.</div>}
        <div className="sc-tick" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        </div>
        <span className="st-kicker">Payment received</span>
        <h1>{pending?.quoted?.length > 0 ? 'Your tools are paid for and your quote request is with the team.' : 'Thank you. Your order is confirmed.'}</h1>
        <p>Our licensing team will be in touch shortly with your receipt, keys and onboarding details. Most licences are issued within one business day. Your order is now in your account.</p>
        <section><h2>Paid now</h2>{pending?.paid?.length > 0 && <ul>{pending.paid.map((line, index) => <li key={index}>{line.name} × {line.qty}</li>)}</ul>}{ref && <p className="sc-ref">Order reference: <code>{ref}</code></p>}</section>
        {pending?.quoted?.length > 0 && <section><h2>Sent for a quote</h2><ul>{pending.quoted.map((line, index) => <li key={index}>{line.name} × {line.qty}</li>)}</ul>{pending.quoteReference && <p>Quote reference: <code>{pending.quoteReference}</code></p>}<a className="gs-btn ghost" href="#book">Book a discovery call</a></section>}
        <div className="sc-confirm-cta">
          <a className="gs-btn primary" href="#account">Go to your account</a>
          <a className="gs-btn ghost" href="#shop">Continue browsing</a>
          {!pending?.quoted?.length && <a className="gs-btn ghost" href="#book">Talk to the team</a>}
        </div>
      </div>
    </>
  );
}
