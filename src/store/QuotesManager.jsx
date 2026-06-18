// Catalogue admin — quotes (the B2B pay-on-invoice path). List incoming quote requests, work the
// status, set the finalised inc-VAT total + validity, and convert a won quote to an order + invoice
// (atomic convert_quote_to_order RPC). Staff_all RLS scopes to the signed-in org.
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.mjs';
import { fmtMoney } from '../lib/pricing.mjs';

const STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost', 'cancelled'];

export default function QuotesManager({ staff }) {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    supabase.from('quotes')
      .select('id, reference, status, contact_company, contact_name, contact_email, contact_phone, po_reference, message, indicative_total_minor, quoted_total_minor, valid_until, currency, created_at, orders(id, invoice_number), quote_items(id, offering_name, variant_name, qty, list_price_minor, captured_price_minor)')
      .is('deleted_at', null).order('created_at', { ascending: false }).limit(200)
      .then(({ data, error }) => { if (error) console.error('quotes load', error); setQuotes(data || []); setLoading(false); });
  }, []);
  useEffect(() => { load(); }, [load]);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  const setStatus = async (id, status) => {
    const { error } = await supabase.from('quotes').update({ status }).eq('id', id);
    if (error) { flash('Could not update. ' + error.message); return; }
    flash('Status → ' + status); load();
  };
  const saveTerms = async (id, totalPounds, validUntil) => {
    const patch = { quoted_total_minor: totalPounds === '' ? null : Math.round(Number(totalPounds) * 100), valid_until: validUntil || null };
    const { error } = await supabase.from('quotes').update(patch).eq('id', id);
    if (error) { flash('Could not save. ' + error.message); return; }
    flash('Quote terms saved.'); load();
  };
  const convert = async (id) => {
    if (typeof confirm === 'function' && !confirm('Convert this quote to an order and raise an invoice?')) return;
    const { data, error } = await supabase.rpc('convert_quote_to_order', { p_quote_id: id });
    if (error) { flash('Could not convert. ' + error.message); return; }
    flash('Converted → ' + (data?.invoice_number || 'order created'));
    load();
    if (data?.order_id && typeof location !== 'undefined') location.hash = 'invoice/' + data.order_id;
  };

  const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s; } };

  return (
    <div className="ca-wrap">
      <header className="ca-head"><div><span className="st-kicker">Catalogue admin</span><h1>Quotes</h1></div></header>
      <div className="ca-toolbar">
        <span className="ca-count">{quotes.length} quote{quotes.length === 1 ? '' : 's'}</span>
        <button className="gs-btn ghost sm" onClick={load} style={{ marginLeft: 'auto' }}>Refresh</button>
      </div>
      <div className="ca-table-wrap">
        <table className="ca-table">
          <thead><tr><th scope="col">Date</th><th scope="col">Reference</th><th scope="col">Company</th><th scope="col">Indicative</th><th scope="col">Status</th><th scope="col"><span className="gs-sr-only">Actions</span></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="6" className="ca-muted">Loading…</td></tr>
              : !quotes.length ? <tr><td colSpan="6" className="ca-muted">No quote requests yet. They arrive from the storefront "Request a quote" flow.</td></tr>
                : quotes.map(qt => {
                  const converted = (qt.orders || []).length > 0;
                  return (
                    <React.Fragment key={qt.id}>
                      <tr>
                        <td>{fmtDate(qt.created_at)}</td>
                        <td className="ca-name"><code className="ca-ref">{qt.reference}</code></td>
                        <td>{qt.contact_company || qt.contact_name || qt.contact_email}</td>
                        <td className="ca-amt">{qt.indicative_total_minor != null ? fmtMoney(qt.indicative_total_minor, qt.currency) : '–'}</td>
                        <td><span className={'ca-status ca-q-' + qt.status}>{qt.status}</span></td>
                        <td className="ca-ord-actions">
                          <button className="gs-btn ghost sm" onClick={() => setExpanded(expanded === qt.id ? null : qt.id)}>{expanded === qt.id ? 'Hide' : 'Open'}</button>
                        </td>
                      </tr>
                      {expanded === qt.id && (
                        <tr className="ca-ord-detailrow"><td colSpan="6">
                          <div className="ca-ord-items">
                            <div className="q-contact">
                              <b>{qt.contact_name || '–'}</b> · {qt.contact_email}{qt.contact_phone ? ' · ' + qt.contact_phone : ''}
                              {qt.po_reference && <> · PO <b>{qt.po_reference}</b></>}
                            </div>
                            {(qt.quote_items || []).map(it => (
                              <div key={it.id} className="ca-ord-item">
                                <span className="oi-name">{it.offering_name}{it.variant_name ? ' · ' + it.variant_name : ''}</span>
                                <span className="oi-qty">×{it.qty}</span>
                                <span className="oi-amt">{it.captured_price_minor != null ? fmtMoney(it.captured_price_minor, qt.currency) : 'POA'}</span>
                              </div>
                            ))}
                            <div className="ca-ord-tot"><span>Indicative subtotal (ex VAT)</span><span>{fmtMoney(qt.indicative_total_minor || 0, qt.currency)}</span></div>
                            {qt.message && <div className="ca-note">“{qt.message}”</div>}

                            {converted ? (
                              <div className="q-converted">Converted to an order · invoice <b>{qt.orders[0].invoice_number}</b> · <a className="ca-link" href={'#invoice/' + qt.orders[0].id}>View invoice</a></div>
                            ) : (
                              <QuoteTerms quote={qt} onStatus={setStatus} onSave={saveTerms} onConvert={convert} />
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
      {toast && <div className="ca-toast" role="status">{toast}</div>}
    </div>
  );
}

function QuoteTerms({ quote, onStatus, onSave, onConvert }) {
  const [total, setTotal] = useState(quote.quoted_total_minor != null ? (quote.quoted_total_minor / 100).toFixed(2) : '');
  const [valid, setValid] = useState(quote.valid_until || '');
  return (
    <div className="q-terms">
      <div className="q-terms-row">
        <label>Status
          <select value={quote.status} onChange={e => onStatus(quote.id, e.target.value)}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>Quoted total inc VAT (£)<input type="number" step="0.01" min="0" value={total} onChange={e => setTotal(e.target.value)} placeholder="auto = subtotal + 20%" /></label>
        <label>Valid until<input type="date" value={valid} onChange={e => setValid(e.target.value)} /></label>
      </div>
      <div className="q-terms-actions">
        <button className="gs-btn ghost sm" onClick={() => onSave(quote.id, total, valid)}>Save terms</button>
        <button className="gs-btn primary sm" onClick={() => onConvert(quote.id)}>Convert to order + invoice</button>
      </div>
    </div>
  );
}
