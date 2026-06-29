// Catalogue admin — service inquiries: the "Inquire about these services" submissions from the public site.
// List incoming inquiries, see the chosen services + contact details + message, and work the status
// (new → contacted → closed). Public submission is the rate-limited submit_service_inquiry rpc (migration
// 0023); staff read via staff_all RLS. Until 0023 is applied the table is absent → the not-enabled state
// shows and nothing breaks (inquiries still arrive as prefilled emails meanwhile).
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.mjs';

const STATUSES = ['new', 'contacted', 'closed'];
const ABSENT = /relation|does not exist|schema cache|could not find|not find the table/i;

export default function InquiriesManager({ staff }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notEnabled, setNotEnabled] = useState(false);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    if (!supabase) { setNotEnabled(true); setLoading(false); return; }
    supabase.from('service_inquiries')
      .select('id, services, contact_name, contact_email, contact_company, message, status, created_at')
      .is('deleted_at', null).order('created_at', { ascending: false }).limit(300)
      .then(({ data, error }) => {
        if (error) { const absent = ABSENT.test(error.message || ''); setNotEnabled(absent); if (!absent) console.error('inquiries load', error); }
        else setNotEnabled(false);
        setRows(data || []); setLoading(false);
      });
  }, []);
  useEffect(() => { load(); }, [load]);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  const setStatus = async (id, status) => {
    const { error } = await supabase.from('service_inquiries').update({ status }).eq('id', id);
    if (error) { flash('Could not update. ' + error.message); return; }
    flash('Status → ' + status); load();
  };
  const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s; } };

  const shown = rows.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    const t = q.trim().toLowerCase();
    if (!t) return true;
    const svc = (r.services || []).map((s) => s.name || s.slug).join(' ');
    return ((r.contact_company || '') + ' ' + (r.contact_name || '') + ' ' + (r.contact_email || '') + ' ' + (r.message || '') + ' ' + svc).toLowerCase().includes(t);
  });
  const newCount = rows.filter((r) => r.status === 'new').length;

  return (
    <div className="ca-wrap">
      <header className="ca-head"><div><span className="st-kicker">Catalogue admin</span><h1>Service inquiries</h1></div></header>
      {notEnabled ? (
        <p className="ca-muted" style={{ padding: '14px 0', maxWidth: 620 }}>
          The inquiries inbox isn’t switched on yet. Apply migration <code>0023_service_inquiries.sql</code> in
          your Supabase project to start capturing submissions here. Until then, inquiries still reach you as
          prefilled emails, exactly as before.
        </p>
      ) : (
        <>
          <div className="ca-toolbar">
            <span className="ca-count">{rows.length} inquir{rows.length === 1 ? 'y' : 'ies'}{newCount ? ' · ' + newCount + ' new' : ''}</span>
            <input className="gs-svc-search" style={{ maxWidth: 220 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search inquiries" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
              <option value="all">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="gs-btn ghost sm" onClick={load} style={{ marginLeft: 'auto' }}>Refresh</button>
          </div>
          <div className="ca-table-wrap">
            <table className="ca-table">
              <thead><tr><th scope="col">Date</th><th scope="col">From</th><th scope="col">Services</th><th scope="col">Status</th><th scope="col"><span className="gs-sr-only">Detail</span></th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan="5" className="ca-muted">Loading…</td></tr>
                  : !shown.length ? <tr><td colSpan="5" className="ca-muted">{rows.length ? 'No inquiries match.' : 'No inquiries yet. They arrive when a visitor sends one from the services catalogue.'}</td></tr>
                    : shown.map((r) => (
                      <React.Fragment key={r.id}>
                        <tr>
                          <td>{fmtDate(r.created_at)}</td>
                          <td className="ca-name">{r.contact_company || r.contact_name || r.contact_email || '(no name)'}{r.contact_email ? <><br /><a className="ca-muted" href={'mailto:' + r.contact_email}>{r.contact_email}</a></> : null}</td>
                          <td>{(r.services || []).length} service{(r.services || []).length === 1 ? '' : 's'}<span className="ca-muted"> · {(r.services || []).map((s) => s.name || s.slug).slice(0, 2).join(', ')}{(r.services || []).length > 2 ? '…' : ''}</span></td>
                          <td>
                            <select value={r.status} onChange={(e) => setStatus(r.id, e.target.value)} aria-label="Inquiry status" className={'ca-status ca-q-' + r.status}>
                              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          <td><button className="gs-btn ghost sm" onClick={() => setExpanded(expanded === r.id ? null : r.id)} aria-expanded={expanded === r.id}>{expanded === r.id ? 'Hide' : 'View'}</button></td>
                        </tr>
                        {expanded === r.id ? (
                          <tr><td colSpan="5" className="ca-inq-detail">
                            <p><strong>Services requested</strong></p>
                            <ul>{(r.services || []).map((s, i) => <li key={i}>{s.name || s.slug}{s.category ? ' · ' + s.category : ''}</li>)}</ul>
                            {r.contact_name ? <p><strong>Name:</strong> {r.contact_name}</p> : null}
                            {r.contact_company ? <p><strong>Company:</strong> {r.contact_company}</p> : null}
                            {r.contact_email ? <p><strong>Email:</strong> <a href={'mailto:' + r.contact_email}>{r.contact_email}</a></p> : null}
                            {r.message ? <><p><strong>What they’re solving</strong></p><p>{r.message}</p></> : <p className="ca-muted">No message.</p>}
                          </td></tr>
                        ) : null}
                      </React.Fragment>
                    ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {toast ? <div className="ca-toast" role="status">{toast}</div> : null}
    </div>
  );
}
