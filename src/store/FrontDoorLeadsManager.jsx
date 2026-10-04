// Catalogue admin — front door leads (GRE-463, spec GRE-416 rev 2 §3): every finished "Meet your first three
// employees" visit. Anonymous rows (S5) show what the visitor asked for and the three agents we proposed;
// rows with a contact (S6) add name, email, role and proof of consent. Staff work the status and delete a
// lead when the visitor asks. Written only by the `front-door` edge function; staff read via staff_all RLS
// (migration 0031). Until 0031 is applied the table is absent → the not-enabled state shows.
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.mjs';
import { isAbsentOrForbidden } from '../lib/pg-absent.mjs';
import { zipFiles } from '../lib/package-zip.mjs';
import { buildAgentPackage, packageFolder } from '../../supabase/functions/_shared/front-door-package.mjs';

const STATUSES = ['new', 'contacted', 'closed'];
const COLS = 'id, industry, industry_other, team_size, brand_words, company_name, agents, chat_summary, chat_turns, source, '
  + 'contact_name, contact_email, contact_role, contact_at, consent_given, consent_at, consent_version, status, last_contacted_at, created_at';

const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s; } };
const fmtTime = (s) => { try { return new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return s; } };
const list = (v) => (Array.isArray(v) ? v : []);
// .ca-muted is the centred empty-state style; faint text inside a row or the detail uses this.
const faint = { color: 'var(--gs-text-faint)' };

export default function FrontDoorLeadsManager() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notEnabled, setNotEnabled] = useState(false);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [kind, setKind] = useState('all'); // 'all' | 'contact' | 'anonymous'
  const [expanded, setExpanded] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    if (!supabase) { setNotEnabled(true); setLoading(false); return; }
    supabase.from('front_door_leads').select(COLS).order('created_at', { ascending: false }).limit(300)
      .then(({ data, error }) => {
        if (error) { const absent = isAbsentOrForbidden(error); setNotEnabled(absent); if (!absent) console.error('front door leads load', error); }
        else setNotEnabled(false);
        setRows(data || []); setLoading(false);
      });
  }, []);
  useEffect(() => { load(); }, [load]);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  // Marking a lead contacted also restarts its 24-month retention clock (spec §3).
  const setStatus = async (id, status) => {
    const patch = status === 'contacted' ? { status, last_contacted_at: new Date().toISOString() } : { status };
    const { error } = await supabase.from('front_door_leads').update(patch).eq('id', id);
    if (error) { flash('Could not update. ' + error.message); return; }
    flash('Status: ' + status); load();
  };
  // B8 (GRE-468): the three employees as an Agent Companies package, for the GS Agentic Manager import page.
  // The saved package (0032) when there is one, else built from the row, so older leads download too.
  const downloadPackage = async (r) => {
    const { data, error } = await supabase.from('front_door_leads').select('agent_package').eq('id', r.id).maybeSingle();
    const files = (!error && data && data.agent_package)
      || buildAgentPackage({ intake: { industry: r.industry, company: r.company_name, words: list(r.brand_words), teamSize: r.team_size }, agents: list(r.agents) });
    if (!files) { flash('This lead has no employees to package.'); return; }
    const folder = packageFolder(r.company_name);
    const url = URL.createObjectURL(new Blob([zipFiles(files, folder)], { type: 'application/zip' }));
    const a = document.createElement('a');
    a.href = url; a.download = folder + '.zip';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const remove = async (r) => {
    const who = r.contact_email || r.company_name;
    if (!window.confirm('Delete this lead for ' + who + '? This removes it for good. Use it when the visitor asks us to delete their data.')) return;
    const { error } = await supabase.from('front_door_leads').delete().eq('id', r.id);
    if (error) { flash('Could not delete. ' + error.message); return; }
    setExpanded(null); flash('Lead deleted'); load();
  };

  const shown = rows.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (kind === 'contact' && !r.contact_email) return false;
    if (kind === 'anonymous' && r.contact_email) return false;
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return [r.id, r.company_name, r.industry, r.contact_name, r.contact_email, r.contact_role, ...list(r.brand_words)]
      .join(' ').toLowerCase().includes(t);
  });
  const withContact = rows.filter((r) => r.contact_email).length;
  const newCount = rows.filter((r) => r.contact_email && r.status === 'new').length;

  return (
    <div className="ca-wrap">
      <header className="ca-head"><div><span className="st-kicker">Catalogue admin</span><h1>Front door leads</h1></div></header>
      {notEnabled ? (
        <p className="ca-muted" style={{ padding: '14px 0', maxWidth: 620 }}>
          Front door leads are not switched on yet. Apply migration <code>0031_front_door_leads.sql</code> in
          your Supabase project to start saving them here. Until then, each team pack request still reaches
          you as an alert email (once the Resend alert is set up).
        </p>
      ) : (
        <>
          <div className="ca-toolbar" style={{ flexWrap: 'wrap' }}>
            <span className="ca-count">{rows.length} visit{rows.length === 1 ? '' : 's'} · {withContact} with contact{newCount ? ' · ' + newCount + ' new' : ''}</span>
            <input className="gs-svc-search" style={{ maxWidth: 220 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search front door leads" />
            <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Filter by contact">
              <option value="all">All visits</option><option value="contact">With contact</option><option value="anonymous">Anonymous</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
              <option value="all">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="gs-btn ghost sm" onClick={load} style={{ marginLeft: 'auto' }}>Refresh</button>
          </div>
          <div className="ca-table-wrap">
            <table className="ca-table">
              <thead><tr><th scope="col">Date</th><th scope="col">Company</th><th scope="col">Industry</th><th scope="col">Contact</th><th scope="col">Status</th><th scope="col"><span className="gs-sr-only">Detail</span></th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan="6" className="ca-muted">Loading…</td></tr>
                  : !shown.length ? <tr><td colSpan="6" className="ca-muted">{rows.length ? 'No leads match.' : 'No leads yet. They arrive when a visitor meets their three employees on the front door.'}</td></tr>
                    : shown.map((r) => (
                      <React.Fragment key={r.id}>
                        <tr>
                          <td>{fmtDate(r.created_at)}</td>
                          <td className="ca-name">{r.company_name}<br /><span style={faint}>{r.id.slice(0, 8)}</span></td>
                          <td>{r.industry}{r.team_size ? <span style={faint}> · {r.team_size}</span> : null}</td>
                          <td>{r.contact_email
                            ? <>{r.contact_name}<br /><a style={faint} href={'mailto:' + r.contact_email}>{r.contact_email}</a></>
                            : <span style={faint}>Anonymous</span>}</td>
                          <td>
                            <select value={r.status} onChange={(e) => setStatus(r.id, e.target.value)} aria-label={'Status for ' + r.company_name} className={'ca-status ca-q-' + r.status}>
                              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          <td><button className="gs-btn ghost sm" onClick={() => setExpanded(expanded === r.id ? null : r.id)} aria-expanded={expanded === r.id}>{expanded === r.id ? 'Hide' : 'View'}</button></td>
                        </tr>
                        {expanded === r.id ? <tr><td colSpan="6" className="ca-inq-detail"><LeadDetail r={r} onDelete={() => remove(r)} onPackage={() => downloadPackage(r)} /></td></tr> : null}
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

function LeadDetail({ r, onDelete, onPackage }) {
  const src = r.source || {};
  const ft = src.firstTouch || {};
  const utm = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].filter((k) => ft[k]).map((k) => k.slice(4) + ': ' + ft[k]);
  return (
    <>
      <p><strong>What they told us</strong></p>
      <p>{r.industry}{r.industry_other ? ' (typed in)' : ''} · team size {r.team_size || 'not given'} · brand words: {list(r.brand_words).join(', ')}</p>
      <p style={faint}>{r.chat_turns ? r.chat_turns + ' message' + (r.chat_turns === 1 ? '' : 's') + ' with Everest' : 'Skipped the chat'}</p>
      {list(r.chat_summary).length ? <><p><strong>Chat summary</strong></p><ul>{list(r.chat_summary).map((s, i) => <li key={i}>{s}</li>)}</ul></> : null}
      <p><strong>Their three employees</strong></p>
      <ul>{list(r.agents).map((a, i) => (
        <li key={i}><strong>{a.name}</strong>{a.is_lead ? ' (lead)' : ''}: {a.role}
          <span style={faint}> · {list(a.personality).join(', ')}</span>
          <br /><span style={faint}>First tasks: {list(a.first_tasks).join('; ')}</span></li>
      ))}</ul>
      {r.contact_email ? (
        <>
          <p><strong>Contact</strong></p>
          <p>{r.contact_name} · {r.contact_role} · <a href={'mailto:' + r.contact_email}>{r.contact_email}</a></p>
          <p style={faint}>
            Asked for the pack {fmtTime(r.contact_at)}. {r.consent_given
              ? 'Consent to contact given ' + fmtTime(r.consent_at) + ' (' + r.consent_version + ').'
              : 'No consent to contact: send the team pack only.'}
            {r.last_contacted_at ? ' Last contacted ' + fmtDate(r.last_contacted_at) + '.' : ''}
          </p>
        </>
      ) : <p style={faint}>No contact details: the visitor stopped before asking for the team pack.</p>}
      <p><strong>Source</strong></p>
      <p style={faint}>
        Page {src.page || 'unknown'}{src.referrer ? ' · from ' + src.referrer : ''}
        {utm.length ? ' · ' + utm.join(', ') : ''}{ft.landing ? ' · first landed on ' + ft.landing : ''}
        {src.gaClientId ? ' · GA client ' + src.gaClientId : ''}
      </p>
      <p style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {list(r.agents).length ? <button className="gs-btn ghost sm" onClick={onPackage}>Download agent package (.zip)</button> : null}
        <button className="gs-btn ghost sm" onClick={onDelete}>Delete lead</button>
      </p>
    </>
  );
}
