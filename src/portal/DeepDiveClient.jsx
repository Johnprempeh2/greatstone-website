import React, { useEffect, useState } from 'react';
import { MAX_FILE_BYTES } from '../data/deepdive-sniff.mjs';
import './portal.css';
import './deep-dive-client.css';
import { sharedStreams } from './deep-dive-progress.mjs';
import { deepDiveDocuments, docState } from './portal-model.mjs';
import { portalStore } from './portal-store-api.mjs';

async function call(op, args = {}) {
  const response = await fetch('/api/deep-dive-client', { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op, ...args }) });
  const body = await response.json();
  if (!response.ok && response.status !== 202) throw new Error(body.error || 'The request could not be saved.');
  return body.data;
}

async function documents(op, args = {}) {
  const url = new URL('/api/deep-dive-document', location.origin);
  if (args.requestId) url.searchParams.set('requestId', args.requestId);
  if (args.id) url.searchParams.set('id', args.id);
  const response = await fetch(url, { method: op === 'upload' ? 'POST' : 'GET',
    headers: args.file ? { 'x-file-name-encoded': btoa(String.fromCharCode(...new TextEncoder().encode(args.file.name))) } : {},
    body: args.file });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Document unavailable. Try again.');
  }
  if (op !== 'download') return (await response.json()).data;
  const blob = await response.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = args.name || 'document';
  document.body.append(link);
  link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function RequestAnswer({ request, onReceived, api, documentApi }) {
  const [note, setNote] = useState('');
  const [file, setFile] = useState(null);
  const [state, setState] = useState('open');
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    setState('saving'); setError('');
    try {
      if (file && file.size > MAX_FILE_BYTES) throw new Error('File must be 25 MB or smaller.');
      if (file && state !== 'pending') await documentApi('upload', { requestId: request.id, file });
      const result = await api(state === 'pending' ? 'retry' : 'answer',
        { requestId: request.id, note: note.trim() || 'Document attached.' });
      setState(result.status);
      onReceived();
    } catch (cause) { setState('open'); setError(cause.message); }
  };
  if (request.status === 'received' || state === 'received') return <p role="status">Response received.</p>;
  return <form onSubmit={submit}>
    {request.note && <p>{request.note}</p>}
    <label htmlFor={'dd-answer-' + request.id}>Your response</label>
    <textarea id={'dd-answer-' + request.id} value={note} onChange={(event) => setNote(event.target.value)}
      rows="4" maxLength="2000" required={!file} disabled={state === 'saving' || state === 'pending'} />
    <label htmlFor={'dd-file-' + request.id}>Document (optional, up to 25 MB)</label>
    <input id={'dd-file-' + request.id} type="file" accept=".pdf,.xlsx,.xls,.csv,.txt,.png,.jpg,.jpeg,.gif,.webp,.sav,.zsav"
      disabled={state === 'saving' || state === 'pending'} onChange={(event) => setFile(event.target.files?.[0] || null)} />
    <div className="pt-actions"><button className="gs-btn primary sm" type="submit" disabled={state === 'saving'}>
      {state === 'saving' ? 'Sending…' : state === 'pending' ? 'Try sending again' : 'Send response'}
    </button></div>
    {state === 'pending' && <p role="status">Your response is saved. We could not confirm receipt yet. Try sending it again.</p>}
    {error && <p role="alert">{error}</p>}
  </form>;
}

function SharedList({ id, title, items, empty, render }) {
  return <section className="pt-card" aria-labelledby={id}><h2 className="pt-h2" id={id}>{title}</h2>
    {!items.length ? <p className="pt-muted">{empty}</p> : <ul className="pt-list">
      {items.map((item) => <li className="dd-row" key={item.id}>{render(item)}</li>)}
    </ul>}
  </section>;
}

export default function DeepDiveClient({ company, api = call, documentApi = documents, portalApi = portalStore }) {
  const [snapshot, setSnapshot] = useState(undefined);
  const [stored, setStored] = useState(undefined);
  const [documentError, setDocumentError] = useState('');
  const [portalDocs, setPortalDocs] = useState(undefined);
  const [portalAcceptances, setPortalAcceptances] = useState([]);
  const [portalError, setPortalError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [error, setError] = useState('');
  const load = async () => {
    setError('');
    try { setSnapshot(await api('overview')); }
    catch (cause) { setError(cause.message); }
    try { setStored(await documentApi('list')); setDocumentError(''); }
    catch (cause) { setDocumentError(cause.message); }
    const { data, error: portalFailure } = await portalApi('overview');
    if (portalFailure) { setPortalDocs(undefined); setPortalError(portalFailure.message); }
    else { setPortalDocs(deepDiveDocuments(data.documents)); setPortalAcceptances(data.acceptances); setPortalError(''); }
  };
  const download = async (record) => {
    setDownloadError('');
    try { await documentApi('download', { id: record.id, name: record.file_name }); }
    catch (cause) { setDownloadError(cause.message); }
  };
  useEffect(() => { load(); }, []);
  return <div className="ca-wrap pt-wrap" role="region" aria-label="Client Deep Dive">
    <div className="pt-bar"><a className="pt-back" href="#portal">← Your portal</a><span className="pt-bar-co">{company.name}</span></div>
    <h1 className="pt-h1">Deep Dive</h1>
    {error && <div className="pt-empty" role="alert"><p>{error}</p><button className="gs-btn primary sm" onClick={load}>Try again</button></div>}
    {snapshot === undefined && !error && <div className="pt-hold" aria-busy="true">Loading…</div>}
    {snapshot === null && <p className="pt-muted">No Deep Dive has been shared with this account yet.</p>}
    {snapshot && <>
      <section className="pt-card" aria-labelledby="dd-progress"><h2 className="pt-h2" id="dd-progress">Progress by stream</h2>
        {!sharedStreams(snapshot.items).length ? <p className="pt-muted">No streams have been shared yet.</p> : <ul className="pt-list">
          {sharedStreams(snapshot.items).map((stream) => <li key={stream.id} className="dd-row dd-progress-row">
            <strong>{stream.title}</strong><span className="dd-progress-status">{stream.status}</span>
            {stream.summary && <p className="pt-muted">{stream.summary}</p>}
          </li>)}
        </ul>}
      </section>
      {documentError && <p role="alert">Documents could not load: {documentError} <button className="ca-link" onClick={load}>Try again</button></p>}
      {downloadError && <p role="alert">{downloadError}</p>}
      <section className="pt-card" aria-labelledby="dd-items"><h2 className="pt-h2" id="dd-items">Shared work</h2>
        {!snapshot.items.some((item) => item.type !== 'deep_dive_stream') ? <p className="pt-muted">Nothing else has been shared yet.</p> : <ul className="pt-list">
          {snapshot.items.filter((item) => item.type !== 'deep_dive_stream').map((item) => <li key={item.id} className="dd-row"><strong>{item.title}</strong>
            {item.summary && <p className="pt-muted">{item.summary}</p>}</li>)}
        </ul>}
      </section>
      <SharedList id="dd-findings" title="Shared findings" items={snapshot.findings || []}
        empty="No findings have been shared yet." render={(finding) => <>
          <strong>{finding.statement}</strong>
          <p className="pt-muted">{finding.status} · {finding.evidenceCount} {finding.evidenceCount === 1 ? 'piece' : 'pieces'} of evidence</p>
        </>} />
      <SharedList id="dd-opportunities" title="Shared opportunities" items={snapshot.opportunities || []}
        empty="No opportunities have been shared yet." render={(opportunity) => <>
          <strong>{opportunity.ref ? `${opportunity.ref} · ` : ''}{opportunity.title}</strong>
          <p className="pt-muted">{opportunity.status} · {opportunity.statement}</p>
          {opportunity.desiredOutcome && <p className="pt-muted">Desired outcome: {opportunity.desiredOutcome}</p>}
        </>} />
      <SharedList id="dd-kpis" title="Shared KPIs" items={snapshot.kpis || []}
        empty="No KPIs have been shared yet." render={(kpi) => <>
          <strong>{kpi.title}</strong>
          <p className="pt-muted">{kpi.definition}</p>
          <p className="pt-muted">Baseline: {kpi.baseline} {kpi.unit} ({kpi.baselinePeriod}) · Target: {kpi.target} {kpi.unit}</p>
        </>} />
      <section className="pt-card" aria-labelledby="dd-requests"><h2 className="pt-h2" id="dd-requests">Document requests</h2>
        {!snapshot.documentRequests.length ? <p className="pt-muted">No requests need a response.</p> : <ul className="pt-list">
          {snapshot.documentRequests.map((request, index) => <li key={request.id} className="dd-row">
            <details open={index === 0 && request.status === 'open'}><summary>{request.title}</summary>
              <RequestAnswer request={request} onReceived={load} api={api} documentApi={documentApi} /></details></li>)}
        </ul>}
      </section>
      <section className="pt-card" aria-labelledby="dd-collected"><h2 className="pt-h2" id="dd-collected">Collected documents</h2>
        {stored === undefined ? <p className="pt-muted" aria-busy="true">Loading documents…</p>
          : !stored.some((item) => item.kind === 'client' || item.kind === 'collected') ? <p className="pt-muted">No documents have been collected yet.</p> : <ul className="pt-list">
          {stored.filter((item) => item.kind === 'client' || item.kind === 'collected').map((item) => <li key={item.id} className="dd-row">
            <strong>{item.file_name}</strong> <button className="gs-btn ghost sm" onClick={() => download(item)}>Download</button>
          </li>)}
        </ul>}
      </section>
    </>}
    <section className="pt-card" aria-labelledby="dd-deliverables"><h2 className="pt-h2" id="dd-deliverables">Published deliverables</h2>
      {portalError ? <p role="alert">Deliverables could not load: {portalError} <button className="ca-link" onClick={load}>Try again</button></p>
        : portalDocs === undefined ? <p className="pt-muted" aria-busy="true">Loading deliverables…</p>
          : portalDocs.length === 0 ? <p className="pt-muted">No deliverables have been published yet.</p>
            : <ul className="pt-list">{portalDocs.map((doc) => <li key={doc.id} className="dd-row">
            <a href={'#portal/doc/' + doc.id}><strong>{doc.title}</strong></a>
            <p className="pt-muted">Version {doc.version} · {docState(doc, portalAcceptances).label}</p>
          </li>)}</ul>}
    </section>
  </div>;
}
