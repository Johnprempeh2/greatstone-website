// #portal/agreement: the client's company admin reads and accepts the interview data processing agreement before
// Greatstone sends any interview invite (GRE-2794, gate GRE-2656). The server (/api/interview/agreement) decides who
// is an admin, holds the text and records the acceptance; this page only shows them. Other members see the state.
import React, { useCallback, useEffect, useState } from 'react';
import './portal.css';

async function call(body) {
  const response = await fetch('/api/interview/agreement', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body) });
  const out = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(out.error || 'The request could not be completed.'), { stale: out.stale === true });
  return out.data;
}

const when = (iso) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';
const copyHref = (id) => '/api/interview/agreement?copy=' + encodeURIComponent(id);

function Record({ acceptance }) {
  return (
    <div className="pt-empty" role="status">
      <h2>Accepted</h2>
      <p>{acceptance.name} ({acceptance.roleTitle}) accepted this agreement for {acceptance.legalName} on {when(acceptance.acceptedAt)}.</p>
      <p className="ca-muted">Agreement {acceptance.version}, text fingerprint {acceptance.contentSha256.slice(0, 12)}…</p>
    </div>
  );
}

function AcceptForm({ data, onAccepted }) {
  const [f, setF] = useState({ name: data.defaultName || '', roleTitle: '', legalName: data.organisationName || '', companyCountry: '',
    companyNumber: '', registeredAddress: '', readConfirmed: false, authorityConfirmed: false });
  const [state, setState] = useState('open');
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setState('saving'); setError('');
    try {
      await call({ op: 'accept', version: data.agreement.version, contentSha256: data.agreement.contentSha256, ...f });
      onAccepted();
    } catch (cause) {
      setState('open'); setError(cause.message);
      if (cause.stale) onAccepted();
    }
  };
  const ready = f.readConfirmed && f.authorityConfirmed && f.name.trim() && f.roleTitle.trim() && f.legalName.trim();
  const field = (k, label, opts = {}) => (
    <p><label htmlFor={'dpa-' + k}>{label}</label><br />
      <input id={'dpa-' + k} value={f[k]} onChange={set(k)} maxLength={opts.max || 200} required={!opts.optional}
        autoComplete={opts.auto || 'off'} disabled={state === 'saving'} /></p>
  );
  return (
    <form onSubmit={submit} aria-label="Accept the data processing agreement">
      <h2>Accept for your organisation</h2>
      {field('name', 'Your name', { auto: 'name' })}
      {field('roleTitle', 'Your role or title', { auto: 'organization-title' })}
      {field('legalName', "Your organisation's legal name", { max: 300, auto: 'organization' })}
      {field('companyCountry', 'Country of registration (optional)', { max: 100, optional: true })}
      {field('companyNumber', 'Company number (optional)', { max: 100, optional: true })}
      {field('registeredAddress', 'Registered office address (optional)', { max: 500, optional: true })}
      <p><label><input type="checkbox" checked={f.readConfirmed} onChange={set('readConfirmed')} disabled={state === 'saving'} />{' '}
        {data.wording.readLabel}</label></p>
      <p><label><input type="checkbox" checked={f.authorityConfirmed} onChange={set('authorityConfirmed')} disabled={state === 'saving'} />{' '}
        {data.wording.authorityLabel}</label></p>
      <div className="pt-actions">
        <button className="gs-btn primary" type="submit" disabled={!ready || state === 'saving'}>
          {state === 'saving' ? 'Saving…' : data.wording.acceptLabel}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export default function InterviewAgreement({ company }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    call({ op: 'status' }).then(setData).catch((cause) => setError(cause.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="ca-wrap pt-wrap" role="region" aria-label="Interview data processing agreement">
      <div className="pt-bar">
        <a className="pt-back" href="#portal">← Your portal</a>
        <span className="pt-bar-co">{company?.name}</span>
      </div>
      {error && !data && <div className="pt-empty" role="alert"><p>{error}</p>
        <button className="gs-btn primary sm" onClick={load}>Try again</button></div>}
      {!data && !error && <div className="pt-hold" aria-busy="true"><span className="gs-sr-only">Loading…</span></div>}
      {data && (
        <article>
          <h1 className="pt-h1">{data.wording.title}</h1>
          <ul>{data.wording.summary.map((line) => <li key={line}>{line}</li>)}</ul>
          {data.accepted && <Record acceptance={data.acceptance} />}
          {!data.accepted && !data.isAdmin && (
            <div className="pt-empty" role="status"><p>Your organisation has not accepted this agreement yet. A company admin
              must accept it before Greatstone sends any interview invites.</p></div>
          )}
          <section className="pt-doc" aria-label="Agreement text" tabIndex={0}
            style={{ maxHeight: '60vh', overflow: 'auto', border: '1px solid var(--line, #c9ced8)', padding: '1rem 1.25rem', margin: '1rem 0' }}
            // the server renders this from the approved text and escapes every character of it (agreementHtml)
            dangerouslySetInnerHTML={{ __html: data.agreement.html }} />
          {!data.accepted && data.isAdmin && <AcceptForm data={data} onAccepted={load} />}
          {data.isAdmin && data.history.length > 0 && (
            <section aria-label="Accepted copies">
              <h2>Download a copy</h2>
              <ul>{data.history.map((a) => (
                <li key={a.id}><a href={copyHref(a.id)} download>Agreement {a.version}, accepted {when(a.acceptedAt)}</a>
                  {a.current ? '' : ' (an earlier version)'}</li>
              ))}</ul>
            </section>
          )}
        </article>
      )}
    </div>
  );
}
