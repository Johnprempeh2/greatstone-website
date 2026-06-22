// Printable VAT invoice for an order (#invoice/<orderId>). Readable by staff (staff_all) and by the
// owning customer (customer_self) under RLS. Browser print → PDF; no PDF dependency.
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.mjs';
import { fmtMoney } from '../lib/pricing.mjs';
import './store.css';

// Card orders store the raw Stripe session id (cs_test_/cs_live_…) as their reference; the email
// subject, account history and confirmation page all show a clean 12-char form. Match it here so the
// formal invoice carries the same reference the customer sees everywhere else — but ONLY strip a
// Stripe id, leaving human refs (quote-converted 'Q-YYYY-…-ORD', invoice numbers) untouched.
const cleanRef = (s) => {
  const r = String(s || '');
  return /^cs_(test|live)_/.test(r) ? r.replace(/^cs_(test|live)_/, '').slice(0, 12) : r;
};

export default function InvoiceView({ orderId }) {
  const [order, setOrder] = useState(undefined); // undefined = loading

  useEffect(() => {
    let alive = true;
    supabase.from('orders')
      .select('id, reference, invoice_number, po_reference, status, currency, subtotal_minor, total_minor, refunded_minor, placed_at, created_at, customer:customers(name, domain), order_items(id, offering_name, variant_name, qty, unit_price_minor, line_total_minor)')
      .eq('id', orderId).maybeSingle()
      .then(({ data }) => { if (alive) setOrder(data || null); })
      // a network/RLS/transport rejection must fall through to the "Invoice not found" state, not hang
      // forever on the loading spinner (this is a paid-order document — a silent infinite spinner is the
      // worst failure mode). Every other store surface resolves errors to a visible state.
      .catch(() => { if (alive) setOrder(null); });
    return () => { alive = false; };
  }, [orderId]);

  if (order === undefined) return <div className="ca-wrap"><div className="ca-center">Loading invoice…</div></div>;
  if (!order) return <div className="ca-wrap"><div className="ca-center"><h2>Invoice not found</h2><p>It may not exist, or you may not have access. <a className="ca-link" href="#account">Back to your account</a></p></div></div>;

  const vat = (order.total_minor || 0) - (order.subtotal_minor || 0);
  const cur = order.currency || 'GBP';
  const date = (() => { try { return new Date(order.placed_at || order.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }); } catch { return ''; } })();

  return (
    <div className="inv-wrap">
      <div className="inv-actions">
        <a className="gs-btn ghost sm" href="#account">← Back</a>
        <button className="gs-btn primary sm" onClick={() => window.print()}>Print / save PDF</button>
      </div>
      <article className="inv-sheet">
        <header className="inv-head">
          <div>
            <div className="inv-logo">GREATST<span>O</span>NE</div>
            <div className="inv-seller">Greatstone International Ltd<br />The Foundation of Digital Excellence<br />VAT registration: <span className="inv-todo">[add VAT no.]</span></div>
          </div>
          <div className="inv-meta">
            <h1>{order.status === 'refunded' ? 'Credit / Invoice' : 'VAT Invoice'}</h1>
            <div><b>{order.invoice_number || cleanRef(order.reference)}</b></div>
            <div>{date}</div>
            {order.po_reference && <div>PO: <b>{order.po_reference}</b></div>}
          </div>
        </header>

        <section className="inv-billto">
          <span className="inv-label">Billed to</span>
          <div>{order.customer?.name || 'Guest customer'}</div>
          {order.customer?.domain && <div>{order.customer.domain}</div>}
        </section>

        <table className="inv-table">
          <thead><tr><th scope="col">Description</th><th scope="col">Qty</th><th scope="col">Unit (ex VAT)</th><th scope="col">Amount</th></tr></thead>
          <tbody>
            {(order.order_items || []).map(it => (
              <tr key={it.id}>
                <td>{it.offering_name}{it.variant_name ? ' · ' + it.variant_name : ''}</td>
                <td>{it.qty}</td>
                <td>{fmtMoney(it.unit_price_minor, cur)}</td>
                <td>{fmtMoney(it.line_total_minor, cur)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan="3">Subtotal (ex VAT)</td><td>{fmtMoney(order.subtotal_minor, cur)}</td></tr>
            <tr><td colSpan="3">VAT (20%)</td><td>{fmtMoney(vat, cur)}</td></tr>
            <tr className="inv-total"><td colSpan="3">Total</td><td>{fmtMoney(order.total_minor, cur)}</td></tr>
            {order.refunded_minor > 0 && <tr className="inv-refund"><td colSpan="3">Refunded</td><td>−{fmtMoney(order.refunded_minor, cur)}</td></tr>}
          </tfoot>
        </table>

        <footer className="inv-foot">
          <p>{order.po_reference ? 'Payable on the above purchase order per agreed terms.' : 'Paid by card via Stripe.'} Licence keys are issued separately by our licensing team.</p>
          <p className="inv-contact">Queries: DX@greatstoneinternational.co.uk · Order reference {cleanRef(order.reference)}</p>
        </footer>
      </article>
    </div>
  );
}
