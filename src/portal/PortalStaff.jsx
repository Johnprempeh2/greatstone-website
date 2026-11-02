// Staff: Clients & DX → <client> → Portal (GRE-1256; spec GRE-1227 revision 2, section 3). Documents with their
// state, Preview as the client (the same reader with the draft row), Submit for approval (the database computes the
// fingerprint and freezes the content), Back to draft, Approve and publish (shown only to the registered approver;
// one database call bound to the fingerprint on screen), Withdraw (owner or admin), New version, and every
// acceptance with its receipt email state and Send again. Writes go through the staff session and 0037's RLS and
// functions; nothing here can publish around portal_approve_and_publish().
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { staffDb } from '../store/staff-store-api.mjs';
import { useModal } from '../store/useModal.mjs';
import DrawerScrim from '../store/DrawerScrim.jsx';
import { sanitizeHtml } from '../lib/sanitize-html.mjs';
import DocumentView from './DocumentView.jsx';
import { downloadPortalPdf, portalFileStatus } from './portal-file.mjs';
import ActionPanel from './ActionPanel.jsx';
import { ReceiptView, nudgeReceiptWorker } from './Portal.jsx';
import { KIND_LABEL, STAFF_STATUS, receiptJobLabel, cleanSections, cleanDemos, fmtDay } from './portal-model.mjs';
import { confirmationTemplate, fillWording } from './wording.mjs';
import { MAX_ATTEMPTS } from '../../supabase/functions/_shared/portal-receipt.mjs';
import './portal.css';

const EDITOR_KINDS = ['engagement_pack', 'nda', 'gita', 'terms', 'deep_dive'];
const ACTIONS = [['none', 'Nothing (read only)'], ['accept', 'Accept'], ['agree_in_principle', 'Agree in principle']];
const STATUS_CLS = { draft: 'ca-draft', pending_approval: 'ca-ord-pending', published: 'ca-published', withdrawn: 'ca-archived', superseded: 'ca-archived' };
const errText = (e) => (e && e.message) || 'Something went wrong.';

export default function PortalStaff({ customer, staff, members = [], flash }) {
  const [docs, setDocs] = useState(null);
  const [acceptances, setAcceptances] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [approver, setApprover] = useState(false);
  const [loadErr, setLoadErr] = useState(null);
  const [fileStatus, setFileStatus] = useState(null);
  const [editing, setEditing] = useState(null);   // a draft row, or {} for new, or { series, kind, … } for a new version
  const [preview, setPreview] = useState(null);   // a document row
  const [approving, setApproving] = useState(null);
  const [receipt, setReceipt] = useState(null);   // an acceptance row
  const [busyId, setBusyId] = useState(null);
  const canWithdraw = staff && ['owner', 'admin'].includes(staff.role);
  useEffect(() => {
    let active = true;
    portalFileStatus().then((value) => { if (active) setFileStatus(value); })
      .catch(() => { if (active) setFileStatus({ error: true }); });
    return () => { active = false; };
  }, []);

  const load = useCallback(() => {
    setLoadErr(null);
    staffDb.from('portal_documents').select('*').eq('customer_id', customer.id).order('created_at', { ascending: false })
      .then(({ data, error }) => { setLoadErr(error || null); setDocs(error ? [] : (data || [])); });
    staffDb.from('portal_acceptances').select('*').eq('customer_id', customer.id).order('accepted_at', { ascending: false })
      .then(({ data }) => setAcceptances(data || []));
    staffDb.from('portal_receipt_jobs').select('id,acceptance_id,status,attempts,next_attempt_at,sent_at').eq('customer_id', customer.id).then(({ data }) => setJobs(data || []));
    staffDb.from('portal_approvals').select('id, document_id, approved_at, approver_user_id, gsam_approval_ref').eq('customer_id', customer.id)
      .then(({ data }) => setApprovals(data || []));
    staffDb.rpc('portal_is_approver').then(({ data }) => setApprover(data === true));
  }, [customer.id]);
  useEffect(() => { load(); }, [load]);

  const docById = useMemo(() => Object.fromEntries((docs || []).map((d) => [d.id, d])), [docs]);
  const approvalOf = (d) => approvals.find((a) => a.document_id === d.id);

  const act = async (id, fn, ok) => {
    setBusyId(id);
    const { error } = await fn();
    setBusyId(null);
    if (error) { flash('Not done: ' + errText(error)); load(); return; }
    flash(ok); load();
  };
  const submitForApproval = (d) => act(d.id, () => staffDb.from('portal_documents').update({ status: 'pending_approval' }).eq('id', d.id).eq('status', 'draft').select('id').single(),
    'Submitted for approval. The fingerprint is fixed; John approves it in this section.');
  const backToDraft = (d) => act(d.id, () => staffDb.from('portal_documents').update({ status: 'draft' }).eq('id', d.id).eq('status', 'pending_approval').select('id').single(),
    'Back to draft. The old fingerprint can no longer be approved.');
  const withdraw = (d) => {
    if (!confirm(`Withdraw “${d.title}” (version ${d.version})? The client stops seeing it. Nothing is deleted and acceptances stay.`)) return;
    act(d.id, () => staffDb.rpc('portal_withdraw', { p_document_id: d.id }), 'Withdrawn. The client no longer sees it.');
  };
  const sendAgain = (a) => act(a.id, async () => {
    const r = await staffDb.rpc('portal_requeue_receipt', { p_acceptance_id: a.id });
    if (!r.error) nudgeReceiptWorker();
    return r;
  }, 'Queued again. The email goes within a minute.');
  const newVersion = (d) => setEditing({
    series: d.series, kind: d.kind, title: d.title, summary: d.summary, body: d.body, demos: d.demos, action: d.action,
    signatory_email: d.signatory_email, fromVersion: d.version,
  });

  // one source for each cell, shared by the laptop table and the phone cards
  const docMeta = (d) => KIND_LABEL[d.kind] + (d.action !== 'none' ? ' · asks to ' + (d.action === 'accept' ? 'accept' : 'agree in principle') : '');
  const docState = (d) => <>
    <span className={'ca-status ' + (STATUS_CLS[d.status] || '')}>{STAFF_STATUS[d.status]}</span>
    {d.content_sha256 && d.status === 'pending_approval' && <div className="pts-sha" title={d.content_sha256}>{d.content_sha256.slice(0, 12)}…</div>}
  </>;
  const docAuthor = (d) => (d.created_by_kind === 'agent' ? 'Agent' : 'Staff');
  const docApproved = (d) => {
    const ap = approvalOf(d);
    return ap ? <>Registered approver · {fmtDay(ap.approved_at)}{ap.gsam_approval_ref ? <span className="ca-muted"> · ref {ap.gsam_approval_ref}</span> : null}</> : <span className="ca-muted">—</span>;
  };
  const docActions = (d) => <>
    <button className="gs-btn ghost sm" onClick={() => setPreview(d)}>Preview as the client</button>
    {d.status === 'draft' && <>
      <button className="gs-btn ghost sm" onClick={() => setEditing(d)}>Edit</button>
      <button className="gs-btn ghost sm" disabled={busyId === d.id} onClick={() => submitForApproval(d)}>Submit for approval</button>
    </>}
    {d.status === 'pending_approval' && <>
      {approver && <button className="gs-btn primary sm" onClick={() => setApproving(d)}>Approve and publish</button>}
      <button className="gs-btn ghost sm" disabled={busyId === d.id} onClick={() => backToDraft(d)}>Back to draft</button>
    </>}
    {d.status === 'published' && <>
      <button className="gs-btn ghost sm" onClick={() => newVersion(d)}>New version</button>
      {canWithdraw && <button className="gs-btn ghost sm" disabled={busyId === d.id} onClick={() => withdraw(d)}>Withdraw</button>}
    </>}
  </>;
  const jobOf = (a) => jobs.find((x) => x.acceptance_id === a.id);
  const accTitle = (a) => (docById[a.document_id] ? docById[a.document_id].title : 'Document');
  const accAction = (a) => (a.action === 'accept' ? 'Accepted' : 'Agreed in principle');
  const accEmail = (a) => {
    const j = jobOf(a);
    return <>
      <span className={'ca-status ' + (j && j.status === 'sent' ? 'ca-published' : j && j.status === 'failed' ? 'ca-ord-refunded' : 'ca-draft')}>{receiptJobLabel(j, MAX_ATTEMPTS)}</span>
      {j && j.last_error && j.status !== 'sent' && <div className="ca-muted pts-err">{j.last_error}</div>}
    </>;
  };
  const accActions = (a) => {
    const j = jobOf(a);
    return <>
      <button className="gs-btn ghost sm" onClick={() => setReceipt(a)}>View receipt</button>
      {j && ['queued', 'failed'].includes(j.status) && <button className="gs-btn ghost sm" disabled={busyId === a.id} onClick={() => sendAgain(a)}>Send again</button>}
    </>;
  };

  return (
    <section className="pts" aria-labelledby="pts-h">
      <div className="acct-ordhead" style={{ marginTop: 30 }}>
        <h2 id="pts-h" className="ci-sub" style={{ margin: 0 }}>Portal</h2>
        <button className="gs-btn primary sm" onClick={() => setEditing({})}>+ New document</button>
      </div>
      <p className="ca-note">Documents {customer.name} sees in their client portal. A client sees nothing until the registered approver presses Approve and publish on the exact version.</p>
      <p className="pts-storage-status" role="status" aria-busy={!fileStatus}>{!fileStatus
        ? 'Checking file storage…'
        : fileStatus.error ? 'File storage status unavailable. Portal files remain in private storage.'
          : fileStatus.connected ? 'OneDrive enabled. Portal files also remain in private storage.'
            : <><strong>OneDrive not connected yet.</strong> Portal files remain in private storage.</>}</p>

      <h3 className="pts-sub">Documents</h3>
      {docs === null ? <p className="ca-muted">Loading…</p>
        : loadErr ? <p className="ca-muted" role="alert">Couldn't load portal documents. <button className="ca-link" onClick={load}>Try again</button></p>
        : !docs.length ? <p className="ca-muted">No portal documents yet. Add a draft with “+ New document”, or an agent adds one through the portal MCP server.</p>
        : <>
          <div className="ca-table-wrap pts-wide-only">
            <table className="ca-table">
              <caption className="gs-sr-only">Portal documents for {customer.name}</caption>
              <thead><tr><th scope="col">Document</th><th scope="col">Version</th><th scope="col">State</th><th scope="col">Author</th><th scope="col">Approved</th><th scope="col"><span className="gs-sr-only">Actions</span></th></tr></thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td className="ca-name">{d.title}<span className="ca-muted"> · {docMeta(d)}</span></td>
                    <td>{d.version}</td>
                    <td>{docState(d)}</td>
                    <td>{docAuthor(d)}</td>
                    <td>{docApproved(d)}</td>
                    <td className="ca-ord-actions">{docActions(d)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* phones: one card per document, label above value, so nothing is cut off (Mikey's review) */}
          <ul className="pts-cards pts-narrow-only" aria-label={'Portal documents for ' + customer.name}>
            {docs.map((d) => (
              <li key={d.id} className="pts-card">
                <h4 className="pts-card-t">{d.title}</h4>
                <p className="ca-muted pts-card-m">{docMeta(d)}</p>
                <dl className="pts-card-dl">
                  <div><dt>Version</dt><dd>{d.version}</dd></div>
                  <div><dt>State</dt><dd>{docState(d)}</dd></div>
                  <div><dt>Author</dt><dd>{docAuthor(d)}</dd></div>
                  <div><dt>Approved</dt><dd>{docApproved(d)}</dd></div>
                </dl>
                <div className="pts-card-actions">{docActions(d)}</div>
              </li>
            ))}
          </ul>
        </>}
      {docs && docs.some((d) => d.status === 'pending_approval') && !approver && (
        <p className="ca-note" role="note">Waiting for approval: only the registered approver sees Approve and publish, when signed in with their own account.</p>
      )}

      <h3 className="pts-sub">Acceptances and receipt copies</h3>
      {!acceptances.length ? <p className="ca-muted">No acceptances yet.</p> : <>
        <div className="ca-table-wrap pts-wide-only">
          <table className="ca-table">
            <caption className="gs-sr-only">Acceptances by {customer.name}</caption>
            <thead><tr><th scope="col">Document</th><th scope="col">Action</th><th scope="col">Signer</th><th scope="col">When</th><th scope="col">Email copy</th><th scope="col"><span className="gs-sr-only">Actions</span></th></tr></thead>
            <tbody>
              {acceptances.map((a) => (
                <tr key={a.id}>
                  <td className="ca-name">{accTitle(a)} <span className="ca-muted">v{a.document_version}</span></td>
                  <td>{accAction(a)}</td>
                  <td>{a.signer_name}<span className="ca-muted"> · {a.signer_title} · {a.signer_email}</span></td>
                  <td>{fmtDay(a.accepted_at)}</td>
                  <td>{accEmail(a)}</td>
                  <td className="ca-ord-actions">{accActions(a)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="pts-cards pts-narrow-only" aria-label={'Acceptances by ' + customer.name}>
          {acceptances.map((a) => (
            <li key={a.id} className="pts-card">
              <h4 className="pts-card-t">{accTitle(a)} <span className="ca-muted">v{a.document_version}</span></h4>
              <dl className="pts-card-dl">
                <div><dt>Action</dt><dd>{accAction(a)}</dd></div>
                <div><dt>Signer</dt><dd>{a.signer_name}<span className="ca-muted pts-card-sub">{a.signer_title}</span><span className="ca-muted pts-card-sub">{a.signer_email}</span></dd></div>
                <div><dt>When</dt><dd>{fmtDay(a.accepted_at)}</dd></div>
                <div><dt>Email copy</dt><dd>{accEmail(a)}</dd></div>
              </dl>
              <div className="pts-card-actions">{accActions(a)}</div>
            </li>
          ))}
        </ul>
      </>}

      {editing && <DraftEditor draft={editing} customer={customer} members={members} onClose={() => setEditing(null)} onSaved={(m) => { setEditing(null); flash(m); load(); }} />}
      {preview && <PreviewDrawer doc={preview} customer={customer} members={members} onClose={() => setPreview(null)} />}
      {approving && <ApproveDialog doc={approving} customer={customer} onClose={() => setApproving(null)} onDone={(m) => { setApproving(null); flash(m); load(); }} />}
      {receipt && <ReceiptDrawer acceptance={receipt} job={jobs.find((x) => x.acceptance_id === receipt.id)} onClose={() => setReceipt(null)} />}
    </section>
  );
}

function Drawer({ label, onClose, wide = false, children }) {
  const ref = useRef(null);
  useModal(ref, true, onClose);
  return (
    <DrawerScrim onClose={onClose}>
      <div ref={ref} tabIndex={-1} className={'ca-drawer' + (wide ? ' pts-wide' : '')} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </DrawerScrim>
  );
}

function PreviewDrawer({ doc, customer, members, onClose }) {
  const signer = doc.signatory_email ? (members.find((m) => m.email && m.email.toLowerCase() === String(doc.signatory_email).toLowerCase()) || {}) : {};
  return (
    <Drawer label={'Preview as the client: ' + doc.title} onClose={onClose} wide>
      <div className="pts-drawer-head">
        <h2>Preview as the client</h2>
        <button className="gs-btn ghost sm" onClick={onClose}>Close</button>
      </div>
      <p className="ca-note">{STAFF_STATUS[doc.status]}. {doc.status === 'published' ? 'The client sees this now.' : 'The client does not see this until it is approved and published.'}</p>
      <div className="pt-surface">
        <DocumentView doc={doc} headingId="pts-preview-title" onDownloadPdf={() => downloadPortalPdf(doc.id)}>
          <ActionPanel doc={doc} company={customer.name} email={doc.signatory_email || 'the signed-in client’s email'}
            defaultName={signer.full_name || ''} state={doc.action === 'none' ? 'none' : 'eligible'} preview onSubmit={async () => null} />
        </DocumentView>
      </div>
    </Drawer>
  );
}

function ApproveDialog({ doc, customer, onClose, onDone }) {
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const approve = async () => {
    setBusy(true); setErr(null);
    const { error } = await staffDb.rpc('portal_approve_and_publish', { p_document_id: doc.id, p_expected_sha256: doc.content_sha256, p_gsam_approval_ref: ref.trim() || null });
    setBusy(false);
    if (error) { setErr(errText(error)); return; }
    onDone(`Published. ${customer.name} sees version ${doc.version} now.`);
  };
  return (
    <Drawer label={'Approve and publish ' + doc.title} onClose={onClose}>
      <h2>Approve and publish</h2>
      <p className="ca-note">You approve this exact version for {customer.name}. If anything changed since it was submitted, the database refuses.</p>
      <dl className="pts-dl">
        <div><dt>Document</dt><dd>{doc.title}</dd></div>
        <div><dt>Version</dt><dd>{doc.version}</dd></div>
        <div><dt>Fingerprint (SHA-256)</dt><dd><code className="pts-sha-full">{doc.content_sha256}</code></dd></div>
      </dl>
      <label>GS Agentic Manager approval reference <span style={{ fontWeight: 400 }}>(optional, for reading only)</span>
        <input value={ref} maxLength={200} onChange={(e) => setRef(e.target.value)} placeholder="e.g. the task's approval link" />
      </label>
      {err && <div className="ca-err" role="alert">{err}</div>}
      <div className="ca-drawer-foot">
        <button className="gs-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="gs-btn primary" onClick={approve} disabled={busy}>{busy ? 'Publishing…' : 'Approve and publish'}</button>
      </div>
    </Drawer>
  );
}

function ReceiptDrawer({ acceptance, job, onClose }) {
  const [doc, setDoc] = useState(undefined);
  useEffect(() => { staffDb.rpc('portal_receipt_document', { p_acceptance_id: acceptance.id }).then(({ data }) => setDoc((data && data[0]) || null)); }, [acceptance.id]);
  return (
    <Drawer label="Receipt" onClose={onClose} wide>
      <div className="pts-drawer-head"><h2>Receipt</h2><button className="gs-btn ghost sm" onClick={onClose}>Close</button></div>
      <div className="pt-surface">{doc === undefined ? <p className="ca-muted">Loading…</p> : <ReceiptView acceptance={acceptance} document={doc} job={job} linkToVersion={false} />}</div>
    </Drawer>
  );
}

// a stable id per section, so a demo placed after it stays there when sections are moved
const newId = () => 's-' + ((typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));
const blankSection = () => ({ id: newId(), title: '', html: '' });

function DraftEditor({ draft, customer, members, onClose, onSaved }) {
  const isNew = !draft.id;
  const [kind, setKind] = useState(draft.kind || 'engagement_pack');
  const [title, setTitle] = useState(draft.title || '');
  const [summary, setSummary] = useState(draft.summary || '');
  const [action, setAction] = useState(draft.action || 'accept');
  const [signatory, setSignatory] = useState(draft.signatory_email || '');
  const [sections, setSections] = useState(() => {
    const s = draft.body && Array.isArray(draft.body.sections) ? draft.body.sections : [];
    return s.length ? s.map((x) => ({ ...x })) : [blankSection()];
  });
  const [demos, setDemos] = useState(() => (Array.isArray(draft.demos) ? draft.demos.map((x) => ({ ...x })) : []));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const versionShown = draft.version || (draft.fromVersion ? draft.fromVersion + 1 : 1);
  const confirmation = fillWording(confirmationTemplate(action), { title: title.trim(), version: versionShown, company: customer.name });
  const setSec = (i, k, v) => setSections((rows) => rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const moveSec = (i, by) => setSections((rows) => { const r = [...rows]; const [x] = r.splice(i, 1); r.splice(Math.max(0, Math.min(r.length, i + by)), 0, x); return r; });
  const setDemo = (i, k, v) => setDemos((rows) => rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const cleanSecs = cleanSections(sections);

  const save = async () => {
    setErr(null);
    if (!title.trim()) { setErr('Give the document a title.'); return; }
    const { demos: demoRows, error: demoErr } = cleanDemos(demos);
    if (demoErr) { setErr(demoErr); return; }
    // sanitised on write as well as on render, so the stored HTML is already what the client sees
    const body = { sections: cleanSecs.map((s) => ({ ...s, html: sanitizeHtml(s.html) })) };
    const row = {
      kind, title: title.trim(), summary: summary.trim(), action, body, demos: demoRows,
      signatory_email: signatory.trim() || null,
    };
    setBusy(true);
    let id = draft.id;
    let version = draft.version;
    if (isNew) {
      const ins = { ...row, customer_id: customer.id, created_by_kind: 'staff', ...(draft.series ? { series: draft.series } : {}) };
      const { data, error } = await staffDb.from('portal_documents').insert(ins).select('id, version').single();
      if (error) { setBusy(false); setErr(errText(error)); return; }
      id = data.id; version = data.version;
    }
    // the confirmation sentence is Harbor's wording filled with this version's title, number and the account's company
    const confirmation_text = action === 'none' ? null : fillWording(confirmationTemplate(action), { title: row.title, version, company: customer.name });
    const { data: saved, error } = await staffDb.from('portal_documents').update(isNew ? { confirmation_text } : { ...row, confirmation_text })
      .eq('id', id).eq('status', 'draft').select('id');
    setBusy(false);
    if (error) { setErr(errText(error)); return; }
    if (!saved || !saved.length) { setErr('This document is no longer a draft (it may have been submitted for approval). Close and reload.'); return; }
    onSaved(isNew ? `Draft saved (version ${version}). The client does not see it.` : 'Draft saved.');
  };

  return (
    <Drawer label={isNew ? 'New portal document' : 'Edit portal draft'} onClose={onClose} wide>
      <h2>{isNew ? (draft.series ? `New version of “${draft.title}”` : 'New portal document') : 'Edit draft'}</h2>
      <p className="ca-note">A draft for {customer.name}. They see nothing until it is submitted, approved and published.</p>
      <div className="pr-row">
        <label>Kind
          <select value={kind} onChange={(e) => setKind(e.target.value)} disabled={!!draft.series}>
            {EDITOR_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label>What the client is asked to do
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            {ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>
      <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label>Summary <span style={{ fontWeight: 400 }}>(optional, plain text)</span><textarea rows="2" value={summary} onChange={(e) => setSummary(e.target.value)} /></label>
      {action !== 'none' && (
        <label>Named signatory <span style={{ fontWeight: 400 }}>(optional; without one, any member of {customer.name} can act)</span>
          <select value={signatory} onChange={(e) => setSignatory(e.target.value)}>
            <option value="">Anyone at {customer.name}</option>
            {members.filter((m) => m.email).map((m) => <option key={m.id} value={m.email}>{m.full_name ? m.full_name + ' · ' : ''}{m.email}</option>)}
          </select>
        </label>
      )}
      {action !== 'none' && (
        <div className="pts-confirm">
          <span className="pts-label">Confirmation sentence the client ticks</span>
          <p>{confirmation}</p>
          <span className="ca-muted pts-small">Harbor's approved wording, filled from this version. Not editable here.</span>
        </div>
      )}

      <fieldset className="pts-fs">
        <legend>Sections</legend>
        {sections.map((s, i) => (
          <div key={i} className="pts-row">
            <label>Section {i + 1} title<input value={s.title} onChange={(e) => setSec(i, 'title', e.target.value)} /></label>
            <label>Content <span style={{ fontWeight: 400 }}>(HTML: paragraphs, lists, bold, links)</span>
              <textarea rows="5" value={s.html} onChange={(e) => setSec(i, 'html', e.target.value)} style={{ fontFamily: 'ui-monospace, monospace', fontSize: '.86rem' }} /></label>
            <div className="pts-rowtools">
              <button type="button" className="gs-btn ghost sm" onClick={() => moveSec(i, -1)} disabled={i === 0} aria-label={`Move section ${i + 1} up`}>↑</button>
              <button type="button" className="gs-btn ghost sm" onClick={() => moveSec(i, 1)} disabled={i === sections.length - 1} aria-label={`Move section ${i + 1} down`}>↓</button>
              <button type="button" className="gs-btn ghost sm" onClick={() => setSections((r) => r.filter((_, j) => j !== i))} aria-label={`Remove section ${i + 1}`}>Remove</button>
            </div>
          </div>
        ))}
        <button type="button" className="gs-btn ghost sm" onClick={() => setSections((r) => [...r, blankSection()])}>+ Section</button>
      </fieldset>

      <fieldset className="pts-fs">
        <legend>Demos <span style={{ fontWeight: 400 }}>(optional; open in a new tab)</span></legend>
        {demos.map((d, i) => (
          <div key={i} className="pts-row">
            <div className="pr-row">
              <label>Label<input value={d.label || ''} onChange={(e) => setDemo(i, 'label', e.target.value)} /></label>
              <label>Link (https://)<input type="url" value={d.url || ''} onChange={(e) => setDemo(i, 'url', e.target.value)} placeholder="https://…" /></label>
            </div>
            <div className="pr-row">
              <label>Note <span style={{ fontWeight: 400 }}>(optional)</span><input value={d.note || ''} onChange={(e) => setDemo(i, 'note', e.target.value)} /></label>
              <label>Show after
                <select value={d.afterSection || ''} onChange={(e) => setDemo(i, 'afterSection', e.target.value)}>
                  <option value="">The end of the document</option>
                  {cleanSecs.map((s) => <option key={s.id} value={s.id}>{s.title || s.id}</option>)}
                </select>
              </label>
            </div>
            <button type="button" className="gs-btn ghost sm" onClick={() => setDemos((r) => r.filter((_, j) => j !== i))} aria-label={`Remove demo ${i + 1}`}>Remove</button>
          </div>
        ))}
        <button type="button" className="gs-btn ghost sm" onClick={() => setDemos((r) => [...r, { label: '', url: '', note: '', afterSection: '' }])}>+ Demo</button>
      </fieldset>

      {err && <div className="ca-err" role="alert">{err}</div>}
      <div className="ca-drawer-foot">
        <button className="gs-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="gs-btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save draft'}</button>
      </div>
    </Drawer>
  );
}
