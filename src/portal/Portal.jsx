// Client portal (#portal, #portal/doc/<id>, #portal/receipt/<id>). GRE-1256; spec GRE-1227 revision 2, sections 2
// and 7. Under the existing customer sign-in. Every read is scoped by RLS (0037) to the signed-in person's company
// and to published documents; the explicit filters below are belt and braces. Acting goes through portal_accept()
// only: the company comes from the account and the email from the token, never from this page.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.mjs';
import { getCustomerProfile, isCustomer, signOut, getSession, onAuth } from '../store/customerAuth.mjs';
import { AuthGate } from '../store/AccountDashboard.jsx';
import DocumentView, { PrivacyNote } from './DocumentView.jsx';
import ActionPanel from './ActionPanel.jsx';
import {
  JOURNEY, KIND_LABEL, journeyStage, docState, panelState, waitingForYou, acceptanceFor, signatoryLabel,
} from './portal-model.mjs';
import { receiptRecord, emailStateLabel } from '../../supabase/functions/_shared/portal-receipt.mjs';
import '../store/store.css';
import '../store/admin.css';
import './portal.css';

const DOC_COLS = 'id, customer_id, kind, series, version, title, summary, body, demos, action, confirmation_text, signatory_email, status, content_sha256, published_at';
const JOB_COLS = 'id, acceptance_id, status, attempts, next_attempt_at, sent_at';

/** Ask the receipt worker to run now (it also runs every minute). Fire and forget: a failed nudge loses nothing. */
export function nudgeReceiptWorker() {
  try { supabase.functions.invoke('portal-receipt-worker', { body: {} }).catch(() => {}); } catch { /* the cron sends it */ }
}

export default function Portal({ route }) {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(undefined);
  useEffect(() => {
    getSession().then((s) => setSession(s || null));
    const { data } = onAuth((s) => setSession(s || null));
    return () => data?.subscription?.unsubscribe?.();
  }, []);
  useEffect(() => { if (session) getCustomerProfile().then((p) => setProfile(p || null)); else setProfile(undefined); }, [session]);

  if (session === undefined || (session && profile === undefined)) return <div className="ca-wrap pt-wrap"><div className="ca-center pt-hold">Checking…</div></div>;
  if (!session) return <AuthGate />;
  if (!isCustomer(profile)) return (
    <div className="ca-wrap pt-wrap"><div className="ca-center">
      <h1 className="pt-h1">This is not a client account</h1>
      <p>{session.user?.email} is not linked to a client company, so there is nothing to show here. Staff preview client documents in Clients &amp; DX → Portal.</p>
      <button className="gs-btn ghost" onClick={() => signOut()}>Sign out</button>
    </div></div>
  );
  return <PortalData route={route} profile={profile} email={session.user?.email || profile.email} />;
}

function PortalData({ route, profile, email }) {
  const company = profile.customer;
  const [docs, setDocs] = useState(null);
  const [acceptances, setAcceptances] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [members, setMembers] = useState([]);
  const [err, setErr] = useState(null);

  const load = useCallback(() => {
    setErr(null);
    supabase.from('portal_documents').select(DOC_COLS).eq('customer_id', company.id).eq('status', 'published')
      .order('published_at', { ascending: false })
      .then(({ data, error }) => { if (error) setErr(error); setDocs(data || []); });
    supabase.from('portal_acceptances').select('*').eq('customer_id', company.id).order('accepted_at', { ascending: false })
      .then(({ data, error }) => { if (error) setErr(error); setAcceptances(data || []); });
    supabase.from('portal_receipt_jobs').select(JOB_COLS).eq('customer_id', company.id)
      .then(({ data }) => setJobs(data || []));
    supabase.from('customer_users').select('id, email, full_name').is('deleted_at', null).eq('customer_id', company.id)
      .then(({ data }) => setMembers(data || []));
  }, [company.id]);
  useEffect(() => { load(); }, [load]);

  const loading = docs === null || acceptances === null;
  if (err && loading) return <Shell company={company}><LoadFailed onRetry={load} /></Shell>;
  if (route.view === 'receipt') return <Shell company={company} crumb><Receipt id={route.id} acceptances={acceptances} jobs={jobs} /></Shell>;
  if (route.view === 'doc') {
    return (
      <Shell company={company} crumb>
        {loading ? <Hold /> : <Reader id={route.id} docs={docs} acceptances={acceptances} jobs={jobs} members={members}
          company={company} email={email} profile={profile} onAccepted={load} />}
      </Shell>
    );
  }
  if (route.view === 'notfound') return <Shell company={company} crumb><NotFound /></Shell>;
  return <Shell company={company}>{loading ? <Hold /> : <Home docs={docs} acceptances={acceptances} email={email} err={err} onRetry={load} />}</Shell>;
}

function Shell({ company, crumb = false, children }) {
  return (
    <div className="ca-wrap pt-wrap" role="region" aria-label="Client portal">
      <div className="pt-bar">
        {crumb ? <a className="pt-back" href="#portal">← Your portal</a> : <span className="st-kicker">Client portal</span>}
        <span className="pt-bar-co">{company.name}</span>
        <nav className="pt-bar-links" aria-label="Your accounts">
          <a href="#org">Your organisation</a>
          <a href="#account">Your account</a>
        </nav>
      </div>
      {children}
    </div>
  );
}

const Hold = () => <div className="pt-hold" aria-busy="true"><span className="gs-sr-only">Loading…</span></div>;

function LoadFailed({ onRetry }) {
  return (
    <div className="pt-empty" role="alert">
      <h1 className="pt-h1">We could not load your portal</h1>
      <p>Check your connection and try again. If it keeps happening, email <a href="mailto:dx@greatstonesoftware.co.uk">dx@greatstonesoftware.co.uk</a>.</p>
      <button className="gs-btn primary sm" onClick={onRetry}>Try again</button>
    </div>
  );
}

function NotFound() {
  return (
    <div className="pt-empty">
      <h1 className="pt-h1">This page is not in your portal</h1>
      <p>It may have been replaced by a newer version, or the link is not complete. <a href="#portal">Go to your portal</a>.</p>
    </div>
  );
}

function Home({ docs, acceptances, email, err, onRetry }) {
  const stage = journeyStage(docs, acceptances);
  const waiting = waitingForYou(docs, { email, acceptances });
  return (
    <>
      <h1 className="pt-h1 pt-home-h" tabIndex={-1}>Your portal</h1>
      {err && <p className="pt-fail" role="alert">Some of your portal did not load. <button className="ca-link" onClick={onRetry}>Try again</button></p>}
      <section className="pt-card" aria-labelledby="pt-where">
        <h2 id="pt-where" className="pt-h2">Where you are</h2>
        <ol className="pt-journey">
          {JOURNEY.map((s, i) => (
            <li key={s} className={i < stage ? 'is-past' : i === stage ? 'is-now' : ''} aria-current={i === stage ? 'step' : undefined}>
              <span className="pt-step-n" aria-hidden="true">{i}</span>
              <span className="pt-step-l">{s}{i === stage && <span className="gs-sr-only"> (you are here)</span>}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="pt-card" aria-labelledby="pt-waiting">
        <h2 id="pt-waiting" className="pt-h2">Waiting for you</h2>
        {waiting.length === 0 ? <p className="pt-muted">Nothing needs your action right now.</p> : (
          <ul className="pt-list">
            {waiting.map((d) => (
              <li key={d.id}>
                <a href={'#portal/doc/' + d.id} className="pt-item">
                  <span className="pt-item-t">{d.title}</span>
                  <span className="pt-item-m">{KIND_LABEL[d.kind]} · version {d.version} · {d.action === 'agree_in_principle' ? 'waiting for your agreement in principle' : 'waiting for your acceptance'}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="pt-card" aria-labelledby="pt-docs">
        <h2 id="pt-docs" className="pt-h2">Your documents</h2>
        {docs.length === 0 ? <p className="pt-muted">No documents yet. When we share one with you, it appears here.</p> : (
          <ul className="pt-list">
            {docs.map((d) => {
              const st = docState(d, acceptances);
              return (
                <li key={d.id}>
                  <a href={'#portal/doc/' + d.id} className="pt-item">
                    <span className="pt-item-t">{d.title}</span>
                    <span className="pt-item-m">{KIND_LABEL[d.kind]} · version {d.version}</span>
                    <span className={'pt-badge is-' + st.key}>{st.label}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

function Reader({ id, docs, acceptances, jobs, members, company, email, profile, onAccepted }) {
  const doc = docs.find((d) => d.id === id);
  useEffect(() => { const h = document.getElementById('pt-doc-title'); if (h) h.focus({ preventScroll: true }); }, [id]);
  if (!doc) return <NotFound />;
  const state = panelState(doc, { email, acceptances });
  const acc = acceptanceFor(doc, acceptances);
  const submit = async ({ name, title, confirmed }) => {
    const { data, error } = await supabase.rpc('portal_accept', { p_document_id: doc.id, p_name: name, p_title: title, p_confirmed: confirmed });
    if (error) throw error;
    nudgeReceiptWorker();
    const { data: row } = await supabase.from('portal_acceptances').select('*').eq('id', data).maybeSingle();
    onAccepted();
    return { acceptance: row || { id: data, signer_name: name, accepted_at: new Date().toISOString() }, job: null };
  };
  const loadJob = async (accId) => {
    const { data } = await supabase.from('portal_receipt_jobs').select(JOB_COLS).eq('acceptance_id', accId).maybeSingle();
    return data;
  };
  return (
    <DocumentView doc={doc}>
      <ActionPanel doc={doc} company={company.name} email={email} defaultName={profile.full_name || ''}
        state={state} acceptance={acc} job={acc ? jobs.find((j) => j.acceptance_id === acc.id) : null}
        signatoryName={signatoryLabel(doc, members)} onSubmit={submit} loadJob={loadJob} />
    </DocumentView>
  );
}

export function ReceiptView({ acceptance, document, job, linkToVersion = true }) {
  const r = receiptRecord(acceptance, document);
  const live = document && document.status === 'published';
  return (
    <article className="pt-receipt" aria-labelledby="pt-receipt-h">
      <header>
        <span className="st-kicker">Receipt</span>
        <h1 id="pt-receipt-h" className="pt-h1" tabIndex={-1}>{r.action}: {document ? document.title : 'Document'}</h1>
      </header>
      <dl className="pt-rec">{r.record.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className={k.startsWith('Fingerprint') ? 'pt-sha-full' : undefined}>{v}</dd></div>)}</dl>
      <h2 className="pt-h2">Wording confirmed</h2>
      <blockquote className="pt-quote">{r.confirmation}</blockquote>
      <div className="pt-rec-blocks">
        <section aria-labelledby="pt-ver"><h2 id="pt-ver" className="pt-h2">Verified from the account</h2>
          <dl className="pt-rec">{r.verified.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></section>
        <section aria-labelledby="pt-ent"><h2 id="pt-ent" className="pt-h2">Entered by the signer</h2>
          <dl className="pt-rec">{r.entered.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></section>
      </div>
      <p className="pt-email-state" role="status">{emailStateLabel(job)}</p>
      <div className="pt-actions pt-noprint">
        <button className="gs-btn ghost sm" onClick={() => window.print()}>Print this receipt</button>
        {linkToVersion && document && (live
          ? <a className="gs-btn ghost sm" href={'#portal/doc/' + document.document_id}>Open the accepted version</a>
          : <span className="pt-muted pt-small">This version is no longer shown in the portal ({document.status}). The email copy has the full text.</span>)}
      </div>
      <PrivacyNote />
    </article>
  );
}

function Receipt({ id, acceptances, jobs }) {
  const [doc, setDoc] = useState(undefined);
  const acc = useMemo(() => (acceptances || []).find((a) => a.id === id), [acceptances, id]);
  useEffect(() => {
    supabase.rpc('portal_receipt_document', { p_acceptance_id: id }).then(({ data }) => setDoc((data && data[0]) || null));
  }, [id]);
  useEffect(() => { if (acc && doc !== undefined) { const h = document.getElementById('pt-receipt-h'); if (h) h.focus({ preventScroll: true }); } }, [acc, doc]);
  if (acceptances === null || doc === undefined) return <Hold />;
  if (!acc) return <NotFound />;
  return <ReceiptView acceptance={acc} document={doc} job={jobs.find((j) => j.acceptance_id === acc.id)} />;
}

