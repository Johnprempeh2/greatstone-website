import React, { useEffect, useState } from 'react';
import './portal.css';
import './deep-dive-client.css';
import { sharedStreams } from './deep-dive-progress.mjs';

async function call(op, args = {}) {
  const response = await fetch('/api/deep-dive-client', { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op, ...args }) });
  const body = await response.json();
  if (!response.ok && response.status !== 202) throw new Error(body.error || 'The request could not be saved.');
  return body.data;
}

function RequestAnswer({ request, onReceived, api }) {
  const [note, setNote] = useState('');
  const [state, setState] = useState('open');
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    setState('saving'); setError('');
    try {
      const result = await api(state === 'pending' ? 'retry' : 'answer', { requestId: request.id, note });
      setState(result.status);
      if (result.status === 'received') onReceived();
    } catch (cause) { setState('open'); setError(cause.message); }
  };
  if (request.status === 'received' || state === 'received') return <p role="status">Response received.</p>;
  return <form onSubmit={submit}>
    {request.note && <p>{request.note}</p>}
    <label htmlFor={'dd-answer-' + request.id}>Your response</label>
    <textarea id={'dd-answer-' + request.id} value={note} onChange={(event) => setNote(event.target.value)}
      rows="4" maxLength="2000" required disabled={state === 'saving' || state === 'pending'} />
    <div className="pt-actions"><button className="gs-btn primary sm" type="submit" disabled={state === 'saving'}>
      {state === 'saving' ? 'Sending…' : state === 'pending' ? 'Try sending again' : 'Send response'}
    </button></div>
    {state === 'pending' && <p role="status">Your response is saved. We could not confirm receipt yet. Try sending it again.</p>}
    {error && <p role="alert">{error}</p>}
  </form>;
}

export default function DeepDiveClient({ company, api = call }) {
  const [snapshot, setSnapshot] = useState(undefined);
  const [error, setError] = useState('');
  const load = async () => {
    setError('');
    try { setSnapshot(await api('overview')); }
    catch (cause) { setError(cause.message); }
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
      <section className="pt-card" aria-labelledby="dd-items"><h2 className="pt-h2" id="dd-items">Shared work</h2>
        {!snapshot.items.some((item) => item.type !== 'deep_dive_stream') ? <p className="pt-muted">Nothing else has been shared yet.</p> : <ul className="pt-list">
          {snapshot.items.filter((item) => item.type !== 'deep_dive_stream').map((item) => <li key={item.id} className="dd-row"><strong>{item.title}</strong>
            {item.summary && <p className="pt-muted">{item.summary}</p>}</li>)}
        </ul>}
      </section>
      <section className="pt-card" aria-labelledby="dd-requests"><h2 className="pt-h2" id="dd-requests">Document requests</h2>
        {!snapshot.documentRequests.length ? <p className="pt-muted">No requests need a response.</p> : <ul className="pt-list">
          {snapshot.documentRequests.map((request, index) => <li key={request.id} className="dd-row">
            <details open={index === 0 && request.status === 'open'}><summary>{request.title}</summary>
              <RequestAnswer request={request} onReceived={load} api={api} /></details></li>)}
        </ul>}
      </section>
      <section className="pt-card" aria-labelledby="dd-deliverables"><h2 className="pt-h2" id="dd-deliverables">Published deliverables</h2>
        {!snapshot.deliverables.length ? <p className="pt-muted">No deliverables have been published yet.</p> : <ul className="pt-list">
          {snapshot.deliverables.map((item) => <li key={item.id} className="dd-row"><strong>{item.title}</strong>
            {item.version != null && <p className="pt-muted">Version {item.version}</p>}</li>)}
        </ul>}
      </section>
    </>}
  </div>;
}
