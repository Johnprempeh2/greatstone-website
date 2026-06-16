import { useState, useEffect, useRef } from 'react';
import { useCart } from './CartContext.js';
import { useCatalog } from './CatalogContext.js';
import { Arrow } from '../blocks/icons.jsx';
import { safeMailto } from '../lib/safe-url.js';

// The licence basket drawer. A request-a-quote flow for enterprise licences, not a card checkout:
// it shows the chosen products, lets you set seats/quantity, and submits a licence REQUEST. It is a
// PROTOTYPE — it transmits nothing and never takes payment. Real purchase, payment (Stripe) and
// licence issuance are the Laravel backend (HANDOVER → Checkout). Mirrors the BookDeepDive pattern.
const CartIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M3 4h2l2.4 12.2a1 1 0 0 0 1 .8h8.7a1 1 0 0 0 1-.8L21 8H6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="9.5" cy="20" r="1.3" fill="currentColor" /><circle cx="17.5" cy="20" r="1.3" fill="currentColor" />
  </svg>
);

export default function CartDrawer() {
  const { cart, setQty, remove, clear, count } = useCart();
  const { products = [] } = useCatalog();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('cart'); // 'cart' | 'request' | 'done'
  const [form, setForm] = useState({ name: '', company: '', email: '' });
  const panelRef = useRef(null);
  const fabRef = useRef(null);
  const close = () => { setOpen(false); setTimeout(() => setStep('cart'), 250); };

  // real-modal behaviour: lock body scroll, move focus in, trap Tab, Escape to close, and restore
  // focus to the basket button on close (mirrors cms/Modal.jsx). Hooks run before the early return.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => { const p = panelRef.current; const f = p && p.querySelector('button, input, [href], select, textarea'); if (f) f.focus(); }, 30);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const f = [...panelRef.current.querySelectorAll('button, input, [href], select, textarea')].filter((el) => !el.disabled && el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    addEventListener('keydown', onKey);
    return () => { clearTimeout(t); removeEventListener('keydown', onKey); document.body.style.overflow = ''; if (fabRef.current) fabRef.current.focus(); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = Object.keys(cart).map((id) => { const p = products.find((x) => x.id === id); return p ? { ...p, qty: cart[id] } : null; }).filter(Boolean);
  if (count === 0 && !open) return null; // the basket button only appears once something's in it

  const submit = (e) => { e.preventDefault(); setStep('done'); };
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <button ref={fabRef} className="gs-cart-fab" onClick={() => { setOpen(true); setStep('cart'); }} aria-label={'Licence basket, ' + count + ' item' + (count === 1 ? '' : 's')}>
        <CartIcon /><span className="gs-cart-count">{count}</span>
      </button>
      {open && (
        <div className="gs-cart-scrim" onMouseDown={close}>
          <aside className="gs-cart" role="dialog" aria-modal="true" aria-labelledby="gs-cart-title" ref={panelRef} onMouseDown={(e) => e.stopPropagation()}>
            <div className="gs-cart-head">
              <h3 id="gs-cart-title">{step === 'done' ? 'Request received' : 'Your licence basket'}</h3>
              <button className="gs-x" onClick={close} aria-label="Close">×</button>
            </div>
            <div className="gs-sr-only" aria-live="polite">{step === 'done' ? 'Licence request received.' : step === 'request' ? 'Enter your details to send the request.' : ''}</div>

            {step === 'cart' && (
              <div className="gs-cart-body">
                {items.length === 0 ? (
                  <p className="gs-empty">Your basket is empty. Add a product from the catalogue.</p>
                ) : (
                  <>
                    <ul className="gs-cart-items">
                      {items.map((p) => (
                        <li className="gs-cart-item" key={p.id}>
                          <div className="gs-cart-itemmain">
                            <span className="gs-cart-itemname">{p.name}</span>
                            <span className="gs-cart-itemprice">{p.price}{p.period ? ' ' + p.period : ''}{p.licence ? ' · ' + p.licence : ''}</span>
                          </div>
                          <div className="gs-cart-qty">
                            <button onClick={() => setQty(p.id, p.qty - 1)} aria-label="Decrease quantity">−</button>
                            <span aria-label="Quantity">{p.qty}</span>
                            <button onClick={() => setQty(p.id, p.qty + 1)} aria-label="Increase quantity">+</button>
                          </div>
                          <button className="gs-cart-rm" onClick={() => remove(p.id)} aria-label={'Remove ' + p.name}>×</button>
                        </li>
                      ))}
                    </ul>
                    <p className="gs-cart-note">Prices are a guide. Final seats, term and total are confirmed on your licence agreement — we’ll tailor volume and multi-year terms.</p>
                    <button className="b-cta" onClick={() => setStep('request')}>Request these licences<Arrow /></button>
                  </>
                )}
              </div>
            )}

            {step === 'request' && (
              <form className="gs-cart-body" onSubmit={submit}>
                <p className="gs-cart-proto">Prototype — submitting prepares the request on screen only. Nothing is sent and no payment is taken. The live build issues the licence and takes payment server-side.</p>
                <label className="gs-field"><span className="gs-field-label">Your name</span>
                  <input value={form.name} onChange={(e) => set('name', e.target.value)} required /></label>
                <label className="gs-field"><span className="gs-field-label">Company</span>
                  <input value={form.company} onChange={(e) => set('company', e.target.value)} required /></label>
                <label className="gs-field"><span className="gs-field-label">Work email</span>
                  <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required /></label>
                <div className="gs-cart-actions">
                  <button type="button" className="gs-btn ghost" onClick={() => setStep('cart')}>← Basket</button>
                  <button type="submit" className="gs-btn primary">Send request</button>
                </div>
              </form>
            )}

            {step === 'done' && (
              <div className="gs-cart-body">
                <p className="gs-cart-done">Thanks{form.name ? ', ' + form.name.split(' ')[0] : ''} — we’d prepare a licence agreement for {items.length} product{items.length === 1 ? '' : 's'} and send it to <b>{form.email || 'your email'}</b>.</p>
                <p className="gs-cart-proto">This is a prototype: nothing was sent. <a href={safeMailto('dx@greatstonesoftware.co.uk')}>Email us</a> to talk licensing for real.</p>
                <button className="gs-btn primary" onClick={() => { clear(); close(); }}>Done</button>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
