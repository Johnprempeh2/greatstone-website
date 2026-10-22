import { staffDb } from './staff-store-api.mjs';
// Catalogue admin — orders. Reads orders + items written by the stripe-webhook (staff_all RLS gates
// access to the signed-in staff org). Expand a row to see line items, ISSUE the licence keys that
// fulfil the order (manual model: staff buy the key from the vendor, paste it here, the buyer sees it
// on their account instantly), see the keys already issued, then mark the order fulfilled. Refunds and
// cancellations are recorded here but any money movement happens in Stripe — this view doesn't move funds.
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.mjs';
import { fmtMoney } from '../lib/pricing.mjs';
import { orderRefDisplay } from '../lib/order-ref.mjs';
import { KeyEditor } from './ClientsManager.jsx';

// show the key as its shape, not its secret: keep the tail so staff can eyeball-match, mask the rest
const maskKey = (k) => { const s = String(k || ''); return s.length <= 6 ? s : '••••' + s.slice(-4); };

export default function OrdersManager({ staff }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [toast, setToast] = useState(null);
  const [keyEditing, setKeyEditing] = useState(null); // { order, prefill }
  const [loadErr, setLoadErr] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    staffDb.from('orders')
      .select('id, reference, status, currency, subtotal_minor, total_minor, refunded_minor, invoice_number, placed_at, created_at, customer_id, customer_email, order_items(id, offering_name, variant_name, qty, unit_price_minor, line_total_minor), licence_keys(id, offering_name, variant_name, licence_key, status)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data, error }) => { if (error) { console.error('orders load', error); setLoadErr(error.message || 'load failed'); } else setLoadErr(null); setOrders(data || []); setLoading(false); });
  }, []);
  useEffect(() => { load(); }, [load]);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  const markFulfilled = async (id) => {
    const { error } = await staffDb.from('orders').update({ status: 'fulfilled' }).eq('id', id);
    if (error) { flash('Could not update. ' + error.message); return; }
    // Ben's fulfilment flow: marking an order fulfilled tells the buyer their licences are ready to collect.
    // Best-effort + non-blocking — if the edge fn isn't deployed or email is off, the status change stands.
    // (The email never carries keys/files; it links the buyer to their account. Note: issuing a key already
    // sends this same email, so a staffer who issues then marks fulfilled may trigger two — see the handoff.)
    let emailed = false;
    try { const { data } = await supabase.functions.invoke('notify-licence-issued', { body: { order_id: id } }); emailed = !!(data && data.sent); }
    catch { /* function not deployed / email off — silent */ }
    flash(emailed ? 'Order fulfilled — the buyer has been emailed.' : 'Order marked fulfilled.'); load();
  };
  const cancelOrder = async (id) => {
    if (typeof confirm === 'function' && !confirm('Mark this order cancelled? This records the status only. Issue any refund in Stripe (it will reconcile back here automatically).')) return;
    const { error } = await staffDb.from('orders').update({ status: 'cancelled' }).eq('id', id);
    if (error) { flash('Could not update. ' + error.message); return; }
    flash('Order cancelled.'); load();
  };

  // open the (shared) licence-key issuer, pre-filled from a line item + this order's buyer
  const issueForItem = (o, it) => {
    if (!o.customer_id) { flash('This order has no linked customer yet — issue the key from Clients, or link a customer first.'); return; }
    setKeyEditing({
      order: o,
      customer: { id: o.customer_id, name: o.customer_email || 'this customer' },
      prefill: { offering_name: it ? it.offering_name : '', variant_name: it ? it.variant_name : '', order_id: o.id },
    });
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
          <thead><tr><th scope="col">Date</th><th scope="col">Reference</th><th scope="col">Items</th><th scope="col">Keys</th><th scope="col">Total</th><th scope="col">Status</th><th scope="col"><span className="gs-sr-only">Actions</span></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="7" className="ca-muted"><span role="status">Loading…</span></td></tr>
              : loadErr ? <tr><td colSpan="7" className="ca-muted" role="alert">Couldn&rsquo;t load orders. <button className="ca-link" onClick={load}>Try again</button></td></tr>
              : !orders.length ? <tr><td colSpan="7" className="ca-muted"><span role="status">No orders yet. Completed checkouts appear here automatically.</span></td></tr>
                : orders.map(o => {
                  const items = o.order_items || [];
                  const keys = (o.licence_keys || []).filter(k => k.status !== 'revoked');
                  const totalQty = items.reduce((n, it) => n + (it.qty || 1), 0);
                  const needsKeys = o.status === 'confirmed' && totalQty > keys.length;
                  return (
                  <React.Fragment key={o.id}>
                    <tr>
                      <td>{fmtDate(o.placed_at || o.created_at)}</td>
                      <td className="ca-name"><code className="ca-ref">{orderRefDisplay(o.reference).label}</code>{orderRefDisplay(o.reference).migrated && <span className="ca-ord-migrated" title="Imported from the old store — no Stripe session">migrated</span>}</td>
                      <td>{items.length}</td>
                      <td>{keys.length}/{totalQty}{needsKeys ? <span className="ca-ord-refund" title="Some purchased items have no licence key yet">issue</span> : null}</td>
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
                      <tr className="ca-ord-detailrow" id={'omgr-ord-' + o.id}><td colSpan="7">
                        <div className="ca-ord-items">
                          {o.customer_email && <div className="ca-ord-ref">Buyer: <strong>{o.customer_email}</strong>{!o.customer_id ? ' (no linked account yet)' : ''}</div>}
                          {items.map(it => (
                            <div key={it.id} className="ca-ord-item">
                              <span className="oi-name">{it.offering_name}{it.variant_name ? ' · ' + it.variant_name : ''}</span>
                              <span className="oi-qty">×{it.qty}</span>
                              <span className="oi-amt">{fmtMoney(it.line_total_minor, o.currency)}</span>
                              <button className="gs-btn ghost sm oi-issue" onClick={() => issueForItem(o, it)} title="Issue the licence key that fulfils this line">Issue key</button>
                            </div>
                          ))}
                          {!items.length && <div className="ca-muted" style={{ padding: 8 }}>No line items recorded.</div>}

                          {/* keys already issued against this order */}
                          {(o.licence_keys || []).length > 0 && (
                            <div className="ca-ord-keys">
                              <div className="ca-ord-keys-h">Licence keys issued</div>
                              {(o.licence_keys || []).map(k => (
                                <div key={k.id} className="ca-ord-key">
                                  <span className="oi-name">{k.offering_name}{k.variant_name ? ' · ' + k.variant_name : ''}</span>
                                  <code className="ca-ref">{maskKey(k.licence_key)}</code>
                                  <span className={'ca-status ca-lk-' + k.status}>{k.status}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="ca-ord-tot"><span>Subtotal (ex VAT)</span><span>{fmtMoney(o.subtotal_minor, o.currency)}</span></div>
                          <div className="ca-ord-tot total"><span>Total (inc VAT)</span><span>{fmtMoney(o.total_minor, o.currency)}</span></div>
                          {o.refunded_minor > 0 && <div className="ca-ord-tot"><span>Refunded</span><span>−{fmtMoney(o.refunded_minor, o.currency)}</span></div>}
                          {orderRefDisplay(o.reference).migrated
                            ? <div className="ca-ord-ref">Migrated order — no Stripe session (old ref <code>{orderRefDisplay(o.reference).label}</code>)</div>
                            : <div className="ca-ord-ref">Stripe session: <code>{o.reference}</code></div>}
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                  );
                })}
          </tbody>
        </table>
      </div>
      {keyEditing && (
        <KeyEditor
          lkey={keyEditing.prefill}
          customer={keyEditing.customer}
          staff={staff}
          orders={[keyEditing.order]}
          onClose={() => setKeyEditing(null)}
          onSaved={(m) => { setKeyEditing(null); flash(m); load(); }}
        />
      )}
      {toast && <div className="ca-toast" role="status">{toast}</div>}
    </div>
  );
}
