// Staff: clients & DX engagements (#catalogue → Clients tab). Pick a client company, then curate its
// DX engagement timeline — meeting recaps / milestones / deliverables, each inline HTML OR an external
// link (e.g. a deployed Netlify recap). Writes go through the staff JWT → staff_all RLS (0004/0013).
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase.mjs';
import { useModal } from './useModal.mjs';
import { sanitizeHtml } from '../lib/sanitize-html.mjs';
import { portfolioHealth, quietFirstRank } from './client-recency.mjs';
import { engagementView } from './engagement-view.mjs';
import { shareChecklist } from './engagement-checklist.mjs';
import './store.css';
import './admin.css';

const KIND_LABEL = { recap: 'Meeting recap', milestone: 'Milestone', deliverable: 'Deliverable', kickoff: 'Kickoff', review: 'Review', note: 'Note' };
const KINDS = ['recap', 'milestone', 'deliverable', 'kickoff', 'review', 'note'];
const NEEDS_CONTENT = new Set(['recap', 'deliverable']); // mirror the 0013 chk_engagement_content constraint
// Quick-start scaffolds for a new engagement — prefill kind + a title stub + a sensible phase so staff start faster.
const ENG_TEMPLATES = [
  { kind: 'kickoff', label: 'Kickoff', title: 'Kickoff — mapping the climb', phase: 'Discovery' },
  { kind: 'recap', label: 'Recap', title: 'Meeting recap — ', phase: '' },
  { kind: 'milestone', label: 'Milestone', title: 'Milestone — ', phase: 'Build' },
  { kind: 'deliverable', label: 'Deliverable', title: 'Deliverable — ', phase: 'Build' },
  { kind: 'review', label: 'Review', title: 'Review — measuring the return', phase: 'Review' },
];
// freshness flag for the client list — amber after 30 quiet days, red after 60, a nudge when a client has none
const staleBadge = (lastIso) => {
  if (!lastIso) return <span className="ci-stale is-none" title="No engagements yet">No activity</span>;
  const days = Math.floor((Date.now() - new Date(lastIso).getTime()) / 86400000);
  if (days > 60) return <span className="ci-stale is-red" title={`Last update ${days} days ago`}>{days}d quiet</span>;
  if (days > 30) return <span className="ci-stale is-amber" title={`Last update ${days} days ago`}>{days}d quiet</span>;
  return null;
};
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s; } };
const arr = (s) => (s || '').split(',').map(x => x.trim()).filter(Boolean);

export default function ClientsManager({ staff }) {
  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null); // selected customer
  const [activity, setActivity] = useState({}); // customer_id → most recent engagement created_at (staleness)
  const [quietFirst, setQuietFirst] = useState(false); // sort the list by who's gone quiet longest
  const [toast, setToast] = useState(null);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  const load = useCallback(() => {
    setLoading(true);
    let query = supabase.from('customers')
      .select('id, name, slug, domain, created_at, tier:customer_tiers(name)')
      .is('deleted_at', null).order('name').limit(500);
    if (q.trim()) query = query.ilike('name', '%' + q.trim() + '%');
    query.then(({ data, error }) => { if (error) console.error(error); setCustomers(data || []); setLoading(false); });
    // staleness: most recent engagement created_at per client, so the list flags dashboards going quiet
    supabase.from('engagements').select('customer_id, created_at').is('deleted_at', null).limit(2000)
      .then(({ data }) => { const m = {}; for (const e of (data || [])) { if (!m[e.customer_id] || e.created_at > m[e.customer_id]) m[e.customer_id] = e.created_at; } setActivity(m); });
  }, [q]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  if (sel) return <ClientDetail customer={sel} staff={staff} onBack={() => setSel(null)} flash={flash} toast={toast} />;

  // portfolio health from the most-recent-engagement recency per client (real signal, not seeded)
  const health = portfolioHealth(customers.map(c => activity[c.id]));
  const needAttention = health.quiet + health.cold + health.none;
  const HEALTH = [
    { key: 'active', label: 'active (≤7d)' }, { key: 'steady', label: 'steady (≤30d)' },
    { key: 'quiet', label: 'going quiet' }, { key: 'cold', label: 'cold (60d+)' }, { key: 'none', label: 'no activity' },
  ];
  const ordered = quietFirst
    ? [...customers].sort((a, b) => quietFirstRank(activity[b.id]) - quietFirstRank(activity[a.id]))
    : customers;

  return (
    <div className="ca-wrap">
      <header className="ca-head"><div><span className="st-kicker">Clients</span><h1>Clients &amp; DX engagements</h1></div></header>
      <p className="ca-note" style={{ marginBottom: 14 }}>Pick a client company to curate its digital-experience timeline — upload meeting recaps (inline or a link), milestones and deliverables they'll see on their organization dashboard.</p>
      {!loading && customers.length > 0 && (
        <div className="ci-health" role="group" aria-label="Portfolio health by recency of last engagement">
          {HEALTH.map(b => health[b.key] > 0 && (
            <span key={b.key} className={'ci-health-chip is-' + b.key}><b>{health[b.key]}</b> {b.label}</span>
          ))}
          {needAttention > 0 && (
            <button type="button" className={'ci-health-sort' + (quietFirst ? ' on' : '')} aria-pressed={quietFirst} onClick={() => setQuietFirst(v => !v)}>
              {quietFirst ? 'Quiet first ✓' : 'Show quiet first'}
            </button>
          )}
        </div>
      )}
      <div className="ca-toolbar">
        <input className="ca-search" placeholder="Search clients…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search clients" />
        <span className="ca-count">{customers.length} shown</span>
      </div>
      <div className="ca-table-wrap">
        <table className="ca-table ca-cards">
          <thead><tr><th scope="col">Company</th><th scope="col">Domain</th><th scope="col">Tier</th><th scope="col">Client since</th><th scope="col"><span className="gs-sr-only">Actions</span></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="5" className="ca-muted">Loading…</td></tr>
              : !customers.length ? <tr><td colSpan="5" className="ca-muted">No clients yet. They appear here once a buyer signs up or you seed one.</td></tr>
                : ordered.map(c => (
                  <tr key={c.id}>
                    <td data-label="Company" className="ca-name">{c.name}{staleBadge(activity[c.id])}</td>
                    <td data-label="Domain">{c.domain || '—'}</td>
                    <td data-label="Tier">{c.tier?.name || 'Standard'}</td>
                    <td data-label="Client since">{fmtDate(c.created_at)}</td>
                    <td data-label=""><button className="gs-btn ghost sm" onClick={() => setSel(c)}>Manage →</button></td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {toast && <div className="ca-toast" role="status">{toast}</div>}
    </div>
  );
}

function ClientDetail({ customer, staff, onBack, flash, toast }) {
  const [members, setMembers] = useState([]);
  const [items, setItems] = useState(null);
  const [requests, setRequests] = useState([]);
  const [keys, setKeys] = useState(null);
  const [orders, setOrders] = useState([]); // for linking a key to the purchase it fulfils
  const [editing, setEditing] = useState(null); // engagement object or {} for new
  const [keyEditing, setKeyEditing] = useState(null); // licence-key object or {} for new
  const [kindFilter, setKindFilter] = useState('all'); // filter the engagement list staff are curating
  const load = useCallback(() => {
    supabase.from('customer_users').select('id, email, full_name, is_primary, role').is('deleted_at', null).eq('customer_id', customer.id).order('is_primary', { ascending: false })
      .then(({ data }) => setMembers(data || []));
    supabase.from('engagements').select('*').is('deleted_at', null).eq('customer_id', customer.id).order('occurred_on', { ascending: false })
      .then(({ data, error }) => { if (error) console.error(error); setItems(data || []); });
    supabase.from('member_invite_requests').select('id, full_name, email, role, status, note, created_at').eq('customer_id', customer.id).order('created_at', { ascending: false })
      .then(({ data, error }) => { if (!error) setRequests(data || []); }); // keep prior on a transient read error
    supabase.from('licence_keys').select('id, offering_name, variant_name, licence_key, seats, status, delivered_at, expires_at, notes, download_url, order_id').is('deleted_at', null).eq('customer_id', customer.id).order('delivered_at', { ascending: false })
      .then(({ data, error }) => { if (!error) setKeys(data || []); });
    supabase.from('orders').select('id, reference, placed_at, created_at').is('deleted_at', null).eq('customer_id', customer.id).order('created_at', { ascending: false })
      .then(({ data, error }) => { if (!error) setOrders(data || []); });
  }, [customer.id]);
  useEffect(() => { load(); }, [load]);

  const handleReq = async (r, status) => {
    const { data, error } = await supabase.from('member_invite_requests').update({ status, handled_at: new Date().toISOString(), handled_by: staff.id }).eq('id', r.id).select('id');
    if (error || !data?.length) { flash(error ? 'Could not update.' : 'Request not found.'); load(); return; }
    flash(status === 'provisioned' ? 'Marked provisioned.' : 'Request declined.'); load();
  };
  const pendingReqs = requests.filter(r => r.status === 'pending');
  // engagement-list helpers: type filter + a draft nudge (draft = not shared and not archived → invisible to the client)
  const { kinds: kindsPresent, draftCount, filtered: filteredItems } = engagementView(items, kindFilter);

  const toggleShare = async (e) => {
    const next = e.status === 'shared' ? 'draft' : 'shared';
    const { data, error } = await supabase.from('engagements').update({ status: next }).eq('id', e.id).select('id');
    if (error || !data?.length) { flash(error ? 'Could not update.' : 'That item was not found — it may have been removed.'); load(); return; }
    flash(next === 'shared' ? 'Shared with the client.' : 'Hidden from the client (draft).');
    load();
  };
  const del = async (e) => {
    if (!confirm(`Delete “${e.title}”? This removes it from the client's timeline.`)) return;
    const { data, error } = await supabase.from('engagements').update({ deleted_at: new Date().toISOString() }).eq('id', e.id).select('id');
    if (error || !data?.length) { flash(error ? 'Could not delete.' : 'That item was already removed.'); load(); return; }
    flash('Deleted.'); load();
  };
  // open a NEW engagement editor pre-filled from an existing item (no id → insert on save), today + draft
  const duplicate = (e) => setEditing({
    kind: e.kind, title: e.title + ' (copy)', occurred_on: new Date().toISOString().slice(0, 10), status: 'draft',
    phase: e.phase, owner_name: e.owner_name, summary: e.summary, external_url: e.external_url,
    body_html: e.body_html, attendees: e.attendees, tags: e.tags, pinned: false,
  });

  const revokeKey = async (k) => {
    const next = k.status === 'revoked' ? 'issued' : 'revoked';
    if (next === 'revoked' && !confirm(`Revoke the key for “${k.offering_name}”? The client will see it marked revoked.`)) return;
    const { data, error } = await supabase.from('licence_keys').update({ status: next }).eq('id', k.id).select('id');
    if (error || !data?.length) { flash(error ? 'Could not update key.' : 'Key not found.'); load(); return; }
    flash(next === 'revoked' ? 'Key revoked.' : 'Key re-issued.'); load();
  };

  const admin = members.find(m => m.is_primary || m.role === 'admin');

  return (
    <div className="ca-wrap">
      <header className="ca-head">
        <div>
          <button className="ca-link" style={{ marginBottom: 4 }} onClick={onBack}>← All clients</button>
          <span className="st-kicker">Client</span><h1>{customer.name}</h1>
          <p className="ca-note">{customer.domain || 'no domain'} · {members.length} member{members.length === 1 ? '' : 's'}{admin ? ' · admin: ' + (admin.full_name || admin.email) : ''}</p>
        </div>
        <div className="ca-headtools"><button className="gs-btn primary sm" onClick={() => setEditing({})}>+ New engagement</button></div>
      </header>

      {pendingReqs.length > 0 && (
        <section className="ci-reqs" aria-label="Invite requests">
          <h2 className="ci-sub">Invite requests <span className="ca-status ca-draft">{pendingReqs.length} pending</span></h2>
          <div className="ca-table-wrap">
            <table className="ca-table ca-cards">
              <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Requested</th><th scope="col"><span className="gs-sr-only">Actions</span></th></tr></thead>
              <tbody>
                {pendingReqs.map(r => (
                  <tr key={r.id}>
                    <td data-label="Name" className="ca-name">{r.full_name || '—'}{r.note ? <span className="ca-muted"> · {r.note}</span> : ''}</td>
                    <td data-label="Email">{r.email}</td>
                    <td data-label="Role">{r.role === 'admin' ? 'Company admin' : 'Member'}</td>
                    <td data-label="Requested">{fmtDate(r.created_at)}</td>
                    <td data-label="" className="ca-ord-actions">
                      <button className="gs-btn ghost sm" onClick={() => handleReq(r, 'provisioned')}>Mark provisioned</button>
                      <button className="gs-btn ghost sm" onClick={() => handleReq(r, 'declined')}>Decline</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <h2 className="ci-sub" style={{ marginTop: pendingReqs.length ? 26 : 0 }}>Engagement timeline</h2>
      {draftCount > 0 && (
        <p className="ci-draftnudge" role="status"><span aria-hidden="true">✎</span> {draftCount} draft{draftCount === 1 ? '' : 's'} not yet shared with {customer.name} — only <b>Shared</b> items appear on their dashboard.</p>
      )}
      {items && items.length > 0 && kindsPresent.length > 1 && (
        <div className="ci-engfilter" role="group" aria-label="Filter engagements by type">
          <button type="button" className={'dx-chip' + (kindFilter === 'all' ? ' on' : '')} aria-pressed={kindFilter === 'all'} onClick={() => setKindFilter('all')}>All</button>
          {kindsPresent.map(k => (
            <button type="button" key={k} className={'dx-chip' + (kindFilter === k ? ' on' : '')} aria-pressed={kindFilter === k} onClick={() => setKindFilter(k)}>{KIND_LABEL[k] || k}</button>
          ))}
          <span className="ca-count">{filteredItems.length} of {items.length}</span>
        </div>
      )}
      <div className="ca-table-wrap">
        <table className="ca-table ca-cards">
          <thead><tr><th scope="col">Date</th><th scope="col">Type</th><th scope="col">Title</th><th scope="col">Content</th><th scope="col">Visibility</th><th scope="col"><span className="gs-sr-only">Actions</span></th></tr></thead>
          <tbody>
            {items === null ? <tr><td colSpan="6" className="ca-muted">Loading…</td></tr>
              : !items.length ? <tr><td colSpan="6" className="ca-muted">No engagements yet. Add the kickoff or first recap with “+ New engagement”.</td></tr>
                : filteredItems.map(e => (
                  <tr key={e.id}>
                    <td data-label="Date">{fmtDate(e.occurred_on)}</td>
                    <td data-label="Type"><span className={'dx-kind k-' + e.kind}>{KIND_LABEL[e.kind]}</span></td>
                    <td data-label="Title" className="ca-name">{e.title}{e.pinned && <><span className="ca-star" aria-hidden="true">★</span><span className="gs-sr-only"> Pinned</span></>}</td>
                    <td data-label="Content">{e.external_url ? <span className="ca-status ca-ord-confirmed">Link</span> : e.body_html ? <span className="ca-status ca-published">Inline</span> : <span className="ca-status ca-archived">—</span>}</td>
                    <td data-label="Visibility">{e.status === 'shared' ? <span className="ca-status ca-published">Shared</span> : e.status === 'archived' ? <span className="ca-status ca-archived">Archived</span> : <span className="ca-status ca-draft">Draft</span>}</td>
                    <td data-label="" className="ca-ord-actions">
                      <button className="gs-btn ghost sm" onClick={() => toggleShare(e)}>{e.status === 'shared' ? 'Unshare' : 'Share'}</button>
                      <button className="gs-btn ghost sm" onClick={() => setEditing(e)}>Edit</button>
                      <button className="gs-btn ghost sm" onClick={() => duplicate(e)}>Duplicate</button>
                      <button className="gs-btn ghost sm" onClick={() => del(e)}>Delete</button>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      <div className="acct-ordhead" style={{ marginTop: 30 }}>
        <h2 className="ci-sub" style={{ margin: 0 }}>Licence keys</h2>
        <button className="gs-btn primary sm" onClick={() => setKeyEditing({})}>+ Issue key</button>
      </div>
      <div className="ca-table-wrap">
        <table className="ca-table ca-cards">
          <thead><tr><th scope="col">Product</th><th scope="col">Key</th><th scope="col">Seats</th><th scope="col">Status</th><th scope="col">Delivered</th><th scope="col"><span className="gs-sr-only">Actions</span></th></tr></thead>
          <tbody>
            {keys === null ? <tr><td colSpan="6" className="ca-muted">Loading…</td></tr>
              : !keys.length ? <tr><td colSpan="6" className="ca-muted">No licence keys yet. Issue one when you fulfil an order — the client sees it on their account.</td></tr>
                : keys.map(k => (
                  <tr key={k.id}>
                    <td data-label="Product" className="ca-name">{k.offering_name}{k.variant_name ? ' · ' + k.variant_name : ''}</td>
                    <td data-label="Key"><code className="ca-ref">{k.licence_key}</code></td>
                    <td data-label="Seats">{k.seats || '—'}</td>
                    <td data-label="Status"><span className={'ca-status ' + (k.status === 'issued' ? 'ca-published' : k.status === 'revoked' ? 'ca-ord-refunded' : 'ca-draft')}>{k.status}</span></td>
                    <td data-label="Delivered">{fmtDate(k.delivered_at)}</td>
                    <td data-label="" className="ca-ord-actions">
                      <button className="gs-btn ghost sm" onClick={() => setKeyEditing(k)}>Edit</button>
                      <button className="gs-btn ghost sm" onClick={() => revokeKey(k)}>{k.status === 'revoked' ? 'Re-issue' : 'Revoke'}</button>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {editing && <EngagementEditor engagement={editing} customer={customer} staff={staff} onClose={() => setEditing(null)} onSaved={(m) => { setEditing(null); flash(m); load(); }} />}
      {keyEditing && <KeyEditor lkey={keyEditing} customer={customer} staff={staff} orders={orders} onClose={() => setKeyEditing(null)} onSaved={(m) => { setKeyEditing(null); flash(m); load(); }} />}
      {toast && <div className="ca-toast" role="status">{toast}</div>}
    </div>
  );
}

function KeyEditor({ lkey, customer, staff, orders = [], onClose, onSaved }) {
  const isNew = !lkey.id;
  const [offering, setOffering] = useState(lkey.offering_name || '');
  const [variant, setVariant] = useState(lkey.variant_name || '');
  const [key, setKey] = useState(lkey.licence_key || '');
  const [seats, setSeats] = useState(lkey.seats != null ? String(lkey.seats) : '');
  const [expires, setExpires] = useState(lkey.expires_at ? String(lkey.expires_at).slice(0, 10) : '');
  const [status, setStatus] = useState(lkey.status || 'issued');
  const [download, setDownload] = useState(lkey.download_url || '');
  const [orderId, setOrderId] = useState(lkey.order_id || '');
  const [notes, setNotes] = useState(lkey.notes || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const ref = useRef(null);
  useModal(ref, true, onClose);

  const save = async () => {
    setErr(null);
    if (!offering.trim()) { setErr('Which product is this key for?'); return; }
    if (!key.trim()) { setErr('Paste the licence key.'); return; }
    const seatsN = seats.trim() === '' ? null : parseInt(seats, 10);
    if (seatsN !== null && (!Number.isInteger(seatsN) || seatsN < 1)) { setErr('Seats must be a whole number of 1 or more, or left blank.'); return; }
    if (download.trim() && !/^https?:\/\//i.test(download.trim())) { setErr('The download link must start with http:// or https://'); return; }
    setBusy(true);
    const payload = {
      offering_name: offering.trim(), variant_name: variant.trim() || null, licence_key: key.trim(),
      seats: seatsN, status, notes: notes.trim() || null, download_url: download.trim() || null,
      order_id: orderId || null,
      expires_at: expires ? new Date(expires + 'T00:00:00').toISOString() : null,
    };
    let error;
    if (isNew) ({ error } = await supabase.from('licence_keys').insert({ ...payload, org_id: staff.org_id, customer_id: customer.id, created_by: staff.id }));
    else ({ error } = await supabase.from('licence_keys').update(payload).eq('id', lkey.id));
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onSaved(isNew ? 'Licence key issued — the client can see it on their account now.' : 'Licence key saved.');
  };

  return (
    <div className="ca-drawer-scrim" onClick={onClose}>
      <div ref={ref} tabIndex={-1} className="ca-drawer" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={isNew ? 'Issue licence key' : 'Edit licence key'}>
        <h2>{isNew ? 'Issue a licence key' : 'Edit licence key'}</h2>
        <p className="ca-note" style={{ marginTop: -2 }}>Delivered to {customer.name} — they'll see it on their account → Licence keys.</p>
        <label>Product<input value={offering} onChange={e => setOffering(e.target.value)} placeholder="e.g. Aspose.Total for .NET" /></label>
        <label>Edition / licence type <span style={{ fontWeight: 400 }}>(optional)</span><input value={variant} onChange={e => setVariant(e.target.value)} placeholder="e.g. Developer Small Business" /></label>
        <label>Licence key<textarea rows="2" value={key} onChange={e => setKey(e.target.value)} placeholder="Paste the activation code" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '.86rem' }} /></label>
        <label>Download link <span style={{ fontWeight: 400 }}>(optional — where the client gets the software)</span><input type="url" value={download} onChange={e => setDownload(e.target.value)} placeholder="https://…" /></label>
        {orders.length > 0 && (
          <label>Purchase this fulfils <span style={{ fontWeight: 400 }}>(optional — links the key to an order)</span>
            <select value={orderId} onChange={e => setOrderId(e.target.value)}>
              <option value="">— not linked to an order —</option>
              {orders.map(o => <option key={o.id} value={o.id}>{o.reference || 'Order'} · {fmtDate(o.placed_at || o.created_at)}</option>)}
            </select>
          </label>
        )}
        <div className="pr-row">
          <label>Seats <span style={{ fontWeight: 400 }}>(optional)</span><input type="number" min="1" value={seats} onChange={e => setSeats(e.target.value)} placeholder="e.g. 5" /></label>
          <label>Expires <span style={{ fontWeight: 400 }}>(optional)</span><input type="date" value={expires} onChange={e => setExpires(e.target.value)} /></label>
        </div>
        <div className="pr-row">
          <label>Status
            <select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="issued">Issued (active)</option>
              <option value="revoked">Revoked</option>
              <option value="expired">Expired</option>
            </select>
          </label>
          <label>Internal note <span style={{ fontWeight: 400 }}>(optional)</span><input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Not shown to the client" /></label>
        </div>
        {err && <div className="ca-err" role="alert">{err}</div>}
        <div className="ca-drawer-foot">
          <button className="gs-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="gs-btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : isNew ? 'Issue key' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

function EngagementEditor({ engagement, customer, staff, onClose, onSaved }) {
  const isNew = !engagement.id;
  const [kind, setKind] = useState(engagement.kind || 'recap');
  const [title, setTitle] = useState(engagement.title || '');
  const [occurredOn, setOccurredOn] = useState(engagement.occurred_on || new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState(engagement.status || 'draft'); // new items start hidden; staff Share deliberately
  const [phase, setPhase] = useState(engagement.phase || '');
  const [owner, setOwner] = useState(engagement.owner_name || (isNew ? (staff.full_name || '') : ''));
  const [summary, setSummary] = useState(engagement.summary || '');
  const [externalUrl, setExternalUrl] = useState(engagement.external_url || '');
  const [bodyHtml, setBodyHtml] = useState(engagement.body_html || '');
  const [attendees, setAttendees] = useState((engagement.attendees || []).join(', '));
  const [tags, setTags] = useState((engagement.tags || []).join(', '));
  const [pinned, setPinned] = useState(!!engagement.pinned);
  const [showPreview, setShowPreview] = useState(false);
  const cleanPreview = useMemo(() => (showPreview ? sanitizeHtml(bodyHtml) : ''), [showPreview, bodyHtml]); // exactly what the client's #org sees
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const ref = useRef(null);
  useModal(ref, true, onClose);

  // pre-share readiness: what the client will see, and whether the item is complete enough to make visible
  const checklist = shareChecklist({ kind, title, occurredOn, externalUrl, bodyHtml });
  const shareReady = checklist.every(i => i.ok);
  const applyTemplate = (t) => { // set kind + phase; fill title/phase only when blank so a typed title isn't clobbered
    setKind(t.kind);
    setTitle(prev => prev.trim() ? prev : t.title);
    if (t.phase) setPhase(prev => prev.trim() ? prev : t.phase);
  };

  const save = async () => {
    setErr(null);
    if (!title.trim()) { setErr('Give it a title.'); return; }
    if (externalUrl.trim() && !/^https?:\/\//i.test(externalUrl.trim())) { setErr('The link must start with http:// or https://'); return; }
    if (NEEDS_CONTENT.has(kind) && !externalUrl.trim() && !bodyHtml.trim()) { setErr(`A ${KIND_LABEL[kind].toLowerCase()} needs inline content or a link.`); return; }
    setBusy(true);
    const payload = {
      kind, title: title.trim(), occurred_on: occurredOn, status, pinned,
      phase: phase.trim() || null, owner_name: owner.trim() || null, summary: summary.trim() || null,
      external_url: externalUrl.trim() || null, body_html: bodyHtml.trim() || null,
      attendees: arr(attendees), tags: arr(tags),
    };
    let error;
    if (isNew) {
      ({ error } = await supabase.from('engagements').insert({ ...payload, org_id: staff.org_id, customer_id: customer.id, created_by: staff.id }));
    } else {
      ({ error } = await supabase.from('engagements').update(payload).eq('id', engagement.id));
    }
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onSaved(isNew ? 'Engagement added.' : 'Engagement saved.');
  };

  return (
    <div className="ca-drawer-scrim" onClick={onClose}>
      <div ref={ref} tabIndex={-1} className="ca-drawer" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={isNew ? 'New engagement' : 'Edit engagement'}>
        <h2>{isNew ? 'New engagement' : 'Edit engagement'}</h2>
        <p className="ca-note" style={{ marginTop: -2 }}>For {customer.name}'s DX timeline.</p>
        {isNew && (
          <div className="eng-templates" role="group" aria-label="Start from a template">
            <span className="eng-tpl-label">Quick start</span>
            {ENG_TEMPLATES.map(t => (
              <button type="button" key={t.kind} className="gs-btn ghost sm" onClick={() => applyTemplate(t)}>{t.label}</button>
            ))}
          </div>
        )}
        <label>Type
          <select value={kind} onChange={e => setKind(e.target.value)}>
            {KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label>Title<input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Kickoff — mapping the climb" /></label>
        <div className="pr-row">
          <label>Date<input type="date" value={occurredOn} onChange={e => setOccurredOn(e.target.value)} /></label>
          <label>Phase<input value={phase} onChange={e => setPhase(e.target.value)} placeholder="Discovery / Build / Adoption / Review" list="dx-phases" /></label>
          <datalist id="dx-phases"><option value="Discovery" /><option value="Build" /><option value="Adoption" /><option value="Review" /></datalist>
        </div>
        <label>Owner (Greatstone lead)<input value={owner} onChange={e => setOwner(e.target.value)} placeholder="e.g. John Prempeh" /></label>
        <label>Summary (1–2 lines)<textarea rows="2" value={summary} onChange={e => setSummary(e.target.value)} /></label>
        <label>External link (a deployed recap, Notion doc…)<input type="url" value={externalUrl} onChange={e => setExternalUrl(e.target.value)} placeholder="https://…netlify.app" /></label>
        <label>Inline content (HTML — shown in an expandable “Read recap”)
          <textarea rows="5" value={bodyHtml} onChange={e => setBodyHtml(e.target.value)} placeholder="<p>…</p>  (sanitised on render)" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '.82rem' }} />
        </label>
        <p className="ca-note" style={{ marginTop: -6 }}>Provide a link, inline HTML, or both. Recaps &amp; deliverables need at least one.</p>
        {bodyHtml.trim() && (
          <div className="ca-preview">
            <button type="button" className="gs-btn ghost sm" aria-expanded={showPreview} aria-controls="ca-preview-pane" onClick={() => setShowPreview(s => !s)}>
              {showPreview ? 'Hide preview' : 'Preview as the client sees it'}
            </button>
            {showPreview && (
              cleanPreview
                ? <div id="ca-preview-pane" className="ca-preview-pane dx-body" dangerouslySetInnerHTML={{ __html: cleanPreview }} />
                : <p id="ca-preview-pane" className="ca-note" role="status" style={{ marginTop: 8 }}>Nothing renders — the sanitiser strips everything in this content (only basic formatting and safe links survive).</p>
            )}
          </div>
        )}
        <div className="pr-row">
          <label>Attendees (comma-separated)<input value={attendees} onChange={e => setAttendees(e.target.value)} placeholder="Naa Korkoi, Ben Mensah" /></label>
          <label>Tags (comma-separated)<input value={tags} onChange={e => setTags(e.target.value)} placeholder="report, roadmap" /></label>
        </div>
        <div className="pr-row">
          <label>Visibility
            <select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="shared">Shared (client sees it)</option>
              <option value="draft">Draft (staff only)</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label className="ca-check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} /> Pin to Highlights</label>
        </div>
        {status === 'shared' && (
          <div className={'eng-checklist' + (shareReady ? ' is-ready' : '')} role="status" aria-live="polite">
            <p className="eng-checklist-head">{shareReady ? `Ready to share — ${customer.name} will see:` : 'Before sharing, finish:'}</p>
            <ul>
              {checklist.map(i => (
                <li key={i.key} className={i.ok ? 'ok' : 'todo'}>
                  <span aria-hidden="true">{i.ok ? '✓' : '○'}</span> {i.label}
                  <span className="gs-sr-only">{i.ok ? ' — done' : ' — still needed'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {err && <div className="ca-err" role="alert">{err}</div>}
        <div className="ca-drawer-foot">
          <button className="gs-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="gs-btn primary" onClick={save} disabled={busy || (status === 'shared' && !shareReady)} title={status === 'shared' && !shareReady ? 'Finish the share checklist first, or save it as a draft.' : undefined}>{busy ? 'Saving…' : isNew ? 'Add to timeline' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
