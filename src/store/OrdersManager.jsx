// Catalogue admin — orders. Reads orders + items written by the stripe-webhook (staff_all RLS gates
// access to the signed-in staff org). Read-mostly: expand a row to see line items, and advance a
// paid order to "fulfilled" once licence keys are issued. Refunds/cancellations are recorded here but
// any money movement happens in Stripe — this view doesn't move funds.
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.mjs';
import { fmtMoney } from '../lib/pricing.mjs';

export default function OrdersManager({ staff }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    supabase.from('orders')
      .select('id, reference, status, currency, subtotal_minor, total_minor, refunded_minor, invoice_number, placed_at, created_at, order_items(id, offering_name, variant_name, qty, unit_price_minor, line_total_minor)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data, error }) => { if (error) console.error('orders load', error); setOrders(data || []); setLoading(false); });
  }, []);
  useEffect(() => { load(); }, [load]);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  const markFulfilled = async (id) => {
    const { error } = await supabase.from('orders').update({ status: 'fulfilled' }).eq('id', id);
    if (error) { flash('Could not update. ' + error.message); return; }
    flash('Order marked fulfilled.'); load();
  };
  const cancelOrder = async (id) => {
    if (typeof confirm === 'function' && !confirm('Mark this order cancelled? This records the status only. Issue any refund in Stripe (it will reconcile back here automatically).')) return;
    const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', id);
    if (error) { flash('Could not update. ' + error.message); return; }
    flash('Order cancelled.'); load();
  };

  const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s; } };

  return (
    <div className="ca-wrap">
      <header className="ca-head"><div><span className="st-kicker">Catalogue admin</span><h1>Orders</h1></div></header>
      <div className="ca-toolbar">
        <span className="ca-count">{orders.length} order{orders.length === 1 ? '' : 's'}</span>
        <button className="gs-btn ghost sm" onClick={load} style={{ marginLeft: 'auto' }}>Refresh</button>
      </div>
      <div className="ca-table-wrap">
        <table className="ca-table">
          <thead><tr><th scope="col">Date</th><th scope="col">Reference</th><th scope="col">Items</th><th scope="col">Total</th><th scope="col">Status</th><th scope="col"><span className="gs-sr-only">Actions</span></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="6" className="ca-muted"><span role="status">Loading…</span></td></tr>
              : !orders.length ? <tr><td colSpan="6" className="ca-muted"><span role="status">No orders yet. Completed checkouts appear here automatically.</span></td></tr>
                : orders.map(o => (
                  <React.Fragment key={o.id}>
                    <tr>
                      <td>{fmtDate(o.placed_at || o.created_at)}</td>
                      <td className="ca-name"><code className="ca-ref">{(o.reference || '').replace(/^cs_(test|live)_/, '').slice(0, 14)}…</code></td>
                      <td>{(o.order_items || []).length}</td>
                      <td className="ca-amt">{fmtMoney(o.total_minor, o.currency)}</td>
                      <td><span className={'ca-status ca-ord-' + o.status}>{o.status}</span>{o.refunded_minor > 0 && o.status !== 'refunded' && <span className="ca-ord-refund">−{fmtMoney(o.refunded_minor, o.currency)}</span>}</td>
                      <td className="ca-ord-actions">
                        <button className="gs-btn ghost sm" aria-expanded={expanded === o.id} aria-controls={'omgr-ord-' + o.id} onClick={() => setExpanded(expanded === o.id ? null : o.id)}>{expanded === o.id ? 'Hide' : 'View'}</button>
                        {o.invoice_number && <a className="gs-btn ghost sm" href={'#invoice/' + o.id}>Invoice</a>}
                        {o.status === 'confirmed' && <button className="gs-btn ghost sm" onClick={() => markFulfilled(o.id)}>Mark fulfilled</button>}
                        {(o.status === 'confirmed' || o.status === 'fulfilled') && <button className="gs-btn ghost sm" onClick={() => cancelOrder(o.id)}>Cancel</button>}
                      </td>
                    </tr>
                    {expanded === o.id && (
                      <tr className="ca-ord-detailrow" id={'omgr-ord-' + o.id}><td colSpan="6">
                        <div className="ca-ord-items">
                          {(o.order_items || []).map(it => (
                            <div key={it.id} className="ca-ord-item">
                              <span className="oi-name">{it.offering_name}{it.variant_name ? ' · ' + it.variant_name : ''}</span>
                              <span className="oi-qty">×{it.qty}</span>
                              <span className="oi-amt">{fmtMoney(it.line_total_minor, o.currency)}</span>
                            </div>
                          ))}
                          {!(o.order_items || []).length && <div className="ca-muted" style={{ padding: 8 }}>No line items recorded.</div>}
                          <div className="ca-ord-tot"><span>Subtotal (ex VAT)</span><span>{fmtMoney(o.subtotal_minor, o.currency)}</span></div>
                          <div className="ca-ord-tot total"><span>Total (inc VAT)</span><span>{fmtMoney(o.total_minor, o.currency)}</span></div>
                          {o.refunded_minor > 0 && <div className="ca-ord-tot"><span>Refunded</span><span>−{fmtMoney(o.refunded_minor, o.currency)}</span></div>}
                          <div className="ca-ord-ref">Stripe session: <code>{o.reference}</code></div>
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                ))}
          </tbody>
        </table>
      </div>
      {toast && <div className="ca-toast" role="status">{toast}</div>}
    </div>
  );
}
