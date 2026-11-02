import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.mjs';
import { MAX_FILE_BYTES } from '../data/deepdive-sniff.mjs';
import './portal.css';
import './deep-dive-client.css';

async function call(op, args = {}) {
  if (!supabase) throw new Error('Deep Dive unavailable. Please try again later.');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Your session has ended. Sign in again.');
  const response = await fetch('/api/deep-dive-client', { method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + session.access_token },
    body: JSON.stringify({ op, ...args }) });
  const body = await response.json();
  if (!response.ok && response.status !== 202) throw new Error(body.error || 'The request could not be saved.');
  return body.data;
}

async function documents(op, args = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Your session has ended. Sign in again.');
  const url = new URL('/api/deep-dive-document', location.origin);
  if (args.requestId) url.searchParams.set('requestId', args.requestId);
  if (args.id) url.searchParams.set('id', args.id);
  const response = await fetch(url, { method: op === 'upload' ? 'POST' : 'GET',
    headers: { authorization: 'Bearer ' + session.access_token,
      ...(args.file ? { 'x-file-name-encoded': btoa(String.fromCharCode(...new TextEncoder().encode(args.file.name))) } : {}) }, body: args.file });
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

export default function DeepDiveClient({ company, api = call, documentApi = documents }) {
  const [snapshot, setSnapshot] = useState(undefined);
  const [stored, setStored] = useState(undefined);
  const [documentError, setDocumentError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [error, setError] = useState('');
  const load = async () => {
    setError('');
    try { setSnapshot(await api('overview')); }
    catch (cause) { setError(cause.message); }
    try { setStored(await documentApi('list')); setDocumentError(''); }
    catch (cause) { setDocumentError(cause.message); }
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
      {documentError && <p role="alert">Documents could not load: {documentError} <button className="ca-link" onClick={load}>Try again</button></p>}
      {downloadError && <p role="alert">{downloadError}</p>}
      <section className="pt-card" aria-labelledby="dd-items"><h2 className="pt-h2" id="dd-items">Shared work</h2>
        {!snapshot.items.length ? <p className="pt-muted">Nothing has been shared yet.</p> : <ul className="pt-list">
          {snapshot.items.map((item) => <li key={item.id} className="dd-row"><strong>{item.title}</strong>
            {item.summary && <p className="pt-muted">{item.summary}</p>}</li>)}
        </ul>}
      </section>
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
      <section className="pt-card" aria-labelledby="dd-deliverables"><h2 className="pt-h2" id="dd-deliverables">Published deliverables</h2>
        {!snapshot.deliverables.length ? <p className="pt-muted">No deliverables have been published yet.</p> : <ul className="pt-list">
          {snapshot.deliverables.map((item) => { const file = stored?.find((record) => record.kind === 'deliverable' && record.source_id === item.id);
            return <li key={item.id} className="dd-row"><strong>{item.title}</strong>
              {item.version != null && <p className="pt-muted">Version {item.version}</p>}
              {file ? <button className="gs-btn ghost sm" onClick={() => download(file)}>Download</button>
                : stored !== undefined && !documentError && <p className="pt-muted">Download available when the file is released.</p>}</li>; })}
        </ul>}
      </section>
    </>}
  </div>;
}
