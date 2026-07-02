// Live-store basket UI: floating button + slide-over drawer + Stripe checkout, plus the post-payment
// confirmation panel. Prices shown here are indicative; the edge function reconfirms every figure
// server-side before charging. TEST MODE — uses Stripe test keys; no real money moves.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useModal } from './useModal.mjs';
import { useCart, setQty, removeItem, clearCart, cartCount, cartSubtotalMinor, startCheckout, requestQuote, onOpenCart, MAX_QTY } from './cart.mjs';
import { fmtMoney } from '../lib/pricing.mjs';
import { track } from '../lib/analytics.js';
import { getSession } from './customerAuth.mjs';

const VAT_RATE = Number((typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_VAT_RATE) || 0.20);

export default function StoreCart({ confirmed = false }) {
  const items = useCart();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('cart'); // cart | po | sent
  const [email, setEmail] = useState('');
  const [q, setQ] = useState({ name: '', email: '', company: '', phone: '', po: '', message: '' });
  const [poFile, setPoFile] = useState(null); // optional uploaded PO document (base64'd on submit)
  const [quoteRef, setQuoteRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const count = cartCount();

  const drawerRef = useRef(null);
  // reset the drawer to the basket view + clear any stale error on every close, so reopening the FAB
  // never resurfaces the quote form or a stale "sent"/error state from a previous session.
  const closeCart = useCallback(() => { setOpen(false); setView('cart'); setErr(null); setPoFile(null); }, []);
  useModal(drawerRef, open, closeCart); // focus-in, Tab-trap, scroll-lock, Escape, focus-restore

  // let a "View basket" affordance elsewhere (e.g. the product page) open this drawer
  useEffect(() => onOpenCart(() => setOpen(true)), []);

  // prefill the quote contact email from the signed-in account, if any (guard against setState after unmount)
  useEffect(() => {
    if (view !== 'po' || q.email) return;
    let alive = true;
    getSession().then(s => { const e = s?.user?.email; if (alive && e) setQ(v => ({ ...v, email: e })); });
    return () => { alive = false; };
  }, [view]); // eslint-disable-line

  const checkout = useCallback(async () => {
    setBusy(true); setErr(null);
    track('begin_checkout', { value_minor: cartSubtotalMinor(), items: cartCount() });
    try {
      const { url, dropped } = await startCheckout({ email: email.trim() || undefined });
      // Some basket lines can't be sold by card (POA / unpublished / sub-£1). Don't slip the buyer
      // past silently with a smaller order: name them and confirm before redirecting to pay.
      if (dropped && dropped.length) {
        const names = dropped.map(d => d && d.name).filter(Boolean);
        const list = names.length ? names.join(', ') : 'one or more items';
        const ok = typeof confirm !== 'function' || confirm(`These items can't be bought by card, so they won't be included: ${list}.\n\nContinue and pay for the rest? (Request a quote to buy the excluded items on invoice.)`);
        if (!ok) { setBusy(false); return; }
      }
      // stash the indicative order value so the confirmation page (a fresh page load after the Stripe
      // redirect, where the basket is already cleared) can fire the funnel-completing purchase event.
      try { sessionStorage.setItem('gs-pending-purchase', JSON.stringify({ value_minor: cartSubtotalMinor(), currency: (items[0] && items[0].currency) || 'GBP', items: cartCount() })); } catch (e) { /* ignore */ }
      window.location.href = url;
    }
    catch (e) { setErr(e.message || 'Could not start checkout.'); setBusy(false); }
  }, [email]);

  const submitQuote = useCallback(async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      // Read an attached PO document to base64 (the service-role edge fn stores it; migration 0026). Guard the
      // size client-side so we never send a huge body; the server also caps it and treats the doc as best-effort.
      let poDocument;
      if (poFile) {
        if (poFile.size > 10 * 1024 * 1024) { setErr('That PO file is over 10 MB. Attach a smaller one, or email it to us with your reference.'); setBusy(false); return; }
        const dataBase64 = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => { const s = String(r.result || ''); res(s.slice(s.indexOf(',') + 1)); };
          r.onerror = () => rej(new Error('Could not read that file.'));
          r.readAsDataURL(poFile);
        });
        poDocument = { name: poFile.name, type: poFile.type || 'application/octet-stream', dataBase64 };
      }
      const ref = await requestQuote({ contact: { name: q.name.trim(), email: q.email.trim(), company: q.company.trim(), phone: q.phone.trim() }, poReference: q.po.trim() || undefined, message: q.message.trim() || undefined, poDocument });
      track('generate_lead', { form: 'purchase_order' });
      setQuoteRef(ref); setView('sent'); clearCart();
    } catch (e2) { setErr(e2.message || 'Could not submit the quote.'); }
    setBusy(false);
  }, [q, poFile]);
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
              {/* the title tracks the active view, so the dialog's accessible name (aria-labelledby) and the
                  visible header both reflect where you are — not a stale "Your basket" over the quote form. */}
              <h2 id="sc-title">{view === 'po' ? 'Pay by purchase order' : view === 'sent' ? 'Purchase order received' : 'Your basket' + (count ? ' · ' + count : '')}</h2>
              <button className="sc-x" onClick={closeCart} aria-label="Close basket">✕</button>
            </header>

            {view === 'sent' ? (
              <div className="sc-empty">
                <div className="sc-tick" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></div>
                <p>Purchase order received. Reference <b>{quoteRef}</b>. Our team will confirm pricing (volume discounts, bespoke terms) and send your invoice, normally within one business day.</p>
                <p className="sc-note">Already have a signed PO document? Email it to <a href={'mailto:dx@greatstonesoftware.co.uk?subject=' + encodeURIComponent('Purchase order ' + quoteRef)}>dx@greatstonesoftware.co.uk</a> quoting <b>{quoteRef}</b> and we&rsquo;ll match it to your order.</p>
                <button className="gs-btn primary" onClick={() => { setView('cart'); setOpen(false); }}>Done</button>
              </div>
            ) : view === 'po' ? (
              <form className="sc-quote" onSubmit={submitQuote}>
                <p className="sc-note sc-po-intro">The way most teams buy. Send us your purchase order and we&rsquo;ll invoice you on your terms, no card needed. Volume discounts and bespoke pricing welcome.</p>
                <label className="sc-po-num">Purchase order number
                  <input value={q.po} onChange={(e) => setQf('po', e.target.value)} placeholder="e.g. PO-10432" aria-describedby="sc-po-hint" />
                  <span className="sc-po-hint" id="sc-po-hint">Have a PO number? Enter it here. Don&rsquo;t have one yet? Leave it blank and we&rsquo;ll raise the paperwork with you.</span>
                </label>
                <label>Company<input value={q.company} onChange={(e) => setQf('company', e.target.value)} autoComplete="organization" /></label>
                <label>Your name<input value={q.name} onChange={(e) => setQf('name', e.target.value)} autoComplete="name" /></label>
                <label>Email<input type="email" required value={q.email} onChange={(e) => setQf('email', e.target.value)} autoComplete="email" /></label>
                <label>Phone (optional)<input value={q.phone} onChange={(e) => setQf('phone', e.target.value)} autoComplete="tel" /></label>
                <label>Notes (optional)<textarea rows="2" value={q.message} onChange={(e) => setQf('message', e.target.value)} placeholder="Team size, timing, anything specific…" /></label>
                <label>Attach your PO <span style={{ fontWeight: 400 }}>(optional: PDF or document, up to 10 MB)</span>
                  <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,application/pdf" onChange={(e) => setPoFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
                </label>
                {poFile ? <p className="sc-note" style={{ marginTop: -6 }}>Attached: {poFile.name}. We&rsquo;ll match it to your purchase order.</p> : null}
                {err && <div className="sc-err" role="alert">{err}</div>}
                <button className="gs-btn primary" type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit purchase order'}</button>
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
                          <button onClick={() => setQty(it.variantId, it.qty - 1)} aria-label={'Decrease quantity of ' + it.name} disabled={it.qty <= 1}>−</button>
                          <span>{it.qty}</span>
                          <button onClick={() => setQty(it.variantId, it.qty + 1)} aria-label={'Increase quantity of ' + it.name} disabled={it.qty >= MAX_QTY} title={it.qty >= MAX_QTY ? 'Maximum ' + MAX_QTY + ' per line. Request a quote for larger volumes.' : undefined}>+</button>
                        </div>
                        <button className="sc-rm" onClick={() => removeItem(it.variantId)} aria-label={'Remove ' + it.name + ' from basket'}>Remove</button>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="sc-totals">
                  <div className="row"><span>Subtotal</span><span>{fmtMoney(sub, cur)}</span></div>
                  <div className="row"><span>VAT ({Math.round(VAT_RATE * 100)}%)</span><span>{fmtMoney(vat, cur)}</span></div>
                  <div className="row total"><span>Total</span><span>{fmtMoney(sub + vat, cur)}</span></div>
                </div>

                <label className="sc-email">Email for your card receipt (optional)
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" />
                </label>

                {err && <div className="sc-err" role="alert">{err}</div>}

                <div className="sc-methods" role="group" aria-label="Choose how to pay">
                  <button type="button" className="sc-method sc-method-card" onClick={checkout} disabled={busy}>
                    <span className="sc-method-ic" aria-hidden="true"><svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg></span>
                    <span className="sc-method-tx">
                      <span className="sc-method-t">{busy ? 'Opening secure checkout…' : 'Pay by card'}</span>
                      <span className="sc-method-d">Instant and secure, via Stripe.</span>
                    </span>
                    <span className="sc-method-go" aria-hidden="true">→</span>
                  </button>
                  <button type="button" className="sc-method sc-method-po" onClick={() => { setView('po'); setErr(null); }} disabled={busy}>
                    <span className="sc-method-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" /></svg></span>
                    <span className="sc-method-tx">
                      <span className="sc-method-t">Pay by purchase order</span>
                      <span className="sc-method-d">Invoice on your terms. No card needed.</span>
                    </span>
                    <span className="sc-method-go" aria-hidden="true">→</span>
                  </button>
                </div>

                <button className="sc-clear" onClick={() => clearCart()} disabled={busy}>Empty basket</button>
                <p className="sc-note">Most teams buy on a purchase order, and we invoice on your terms with volume discounts and bespoke pricing on request. Card payments are handled securely by Stripe; prices are reconfirmed before charging.</p>
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
  // Clear the basket and fire the funnel-completing purchase event. checkout() stashed the order
  // value/currency before the Stripe redirect; read + remove it here so a refresh of this page can't
  // double-fire the value (transaction_id lets GA4 dedupe the conversion regardless). Dormant until
  // GTM is configured, like every other track() call.
  useEffect(() => {
    if (!valid) return; // no real session → leave the basket intact and fire no conversion
    clearCart();
    let order = null;
    try { order = JSON.parse(sessionStorage.getItem('gs-pending-purchase') || 'null'); sessionStorage.removeItem('gs-pending-purchase'); } catch (e) { /* ignore */ }
    track('purchase', { transaction_id: ref, ...(order || {}) });
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
        <h1>Thank you. Your order is confirmed.</h1>
        <p>Our licensing team will be in touch shortly with your receipt, keys and onboarding details. Most licences are issued within one business day. Your order is now in your account.</p>
        {ref && <p className="sc-ref">Reference: <code>{ref}</code></p>}
        <div className="sc-confirm-cta">
          <a className="gs-btn primary" href="#account">Go to your account</a>
          <a className="gs-btn ghost" href="#shop">Continue browsing</a>
          <a className="gs-btn ghost" href="#book">Talk to the team</a>
        </div>
      </div>
    </>
  );
}
