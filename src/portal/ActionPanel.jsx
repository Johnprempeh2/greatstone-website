// The action panel at the end of a document (GRE-1256; spec GRE-1227 revision 2, section 2). Two labelled groups:
// "From your account" (company and signed-in email, read-only: the evidence of who acted and for which company)
// and "Entered by you" (name and job title). One unticked box with the document's own confirmation sentence,
// one button. Nothing is recorded until the database accepts it; on success the panel becomes the receipt
// summary and focus moves to it. The database calls are passed in (onSubmit, loadJob), so staff preview can
// show the panel without acting.
import React, { useEffect, useId, useRef, useState } from 'react';
import { validatePanel, canSubmit, acceptErrorMessage, emailOutcome, shortRef, fmtDay } from './portal-model.mjs';
import { AGREE_NEXT_LINE } from './wording.mjs';
import { PrivacyNote } from './DocumentView.jsx';

const CONTACT = 'mailto:dx@greatstonesoftware.co.uk?subject=' + encodeURIComponent('Please correct my portal account');
const actionWord = (a) => (a === 'agree_in_principle' ? 'Agree in principle' : 'Accept');
const doneWord = (a) => (a === 'agree_in_principle' ? 'Agreed in principle' : 'Accepted');

/** The line under "Accepted." about the email copy (spec section 2). */
function EmailLine({ outcome, email }) {
  if (outcome === 'sent') return <>Your copy is saved here, and the email copy has been sent to {email}.</>;
  if (outcome === 'failed') return <>Your copy is saved here; we could not send the email copy yet. We will keep trying and our team has been told.</>;
  return <>Your copy is saved here; the email copy is on its way.</>;
}

export function ReceiptSummary({ action, acceptance, job, email, focus = false }) {
  const ref = useRef(null);
  useEffect(() => { if (focus && ref.current) ref.current.focus(); }, [focus]);
  return (
    <div className="pt-panel pt-panel-done" role="status" aria-live="polite">
      <h2 className="pt-panel-h" ref={ref} tabIndex={-1}>
        <span aria-hidden="true">✓ </span>{doneWord(action)}{acceptance.signer_name ? ` by ${acceptance.signer_name}` : ''} on {fmtDay(acceptance.accepted_at)}
      </h2>
      <p>{doneWord(action)}. <EmailLine outcome={emailOutcome(job)} email={email || acceptance.signer_email} /></p>
      <p><a className="gs-btn primary sm" href={'#portal/receipt/' + acceptance.id}>View the receipt</a></p>
    </div>
  );
}

export default function ActionPanel({
  doc, company, email, defaultName = '', state, acceptance = null, job = null, signatoryName = '',
  onSubmit, loadJob, preview = false,
}) {
  const uid = useId();
  const [name, setName] = useState(defaultName);
  const [title, setTitle] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [touched, setTouched] = useState({});
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [done, setDone] = useState(null); // { acceptance, job } after this person acted here
  const nameRef = useRef(null); const titleRef = useRef(null); const boxRef = useRef(null); const failRef = useRef(null);

  // after accepting, look at the email job a few times so the panel can say "sent" when it went
  useEffect(() => {
    if (!done || !loadJob || emailOutcome(done.job) === 'sent') return undefined;
    let n = 0; let stop = false;
    const tick = async () => {
      if (stop || n++ >= 4) return;
      const j = await loadJob(done.acceptance.id).catch(() => null);
      if (stop) return;
      if (j) setDone((d) => (d ? { ...d, job: j } : d));
      if (!j || emailOutcome(j) !== 'sent') t = setTimeout(tick, 2500);
    };
    let t = setTimeout(tick, 1500);
    return () => { stop = true; clearTimeout(t); };
  }, [done && done.acceptance.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (failure && failRef.current) failRef.current.focus(); }, [failure]);

  if (!doc || state === 'none') return null;
  // after an agreement in principle the client still sees what happens next (GRE-1257)
  const next = doc.action === 'agree_in_principle' ? <p className="pt-next">{AGREE_NEXT_LINE}</p> : null;
  if (done) return <><ReceiptSummary action={doc.action} acceptance={done.acceptance} job={done.job} email={email} focus />{next}<PrivacyNote /></>;
  if (state === 'done' && acceptance) return <><ReceiptSummary action={doc.action} acceptance={acceptance} job={job} email={email} />{next}<PrivacyNote /></>;

  if (state === 'waiting_signatory') {
    return (
      <div className="pt-panel pt-panel-wait">
        <h2 className="pt-panel-h">Waiting for {signatoryName}</h2>
        <p>{signatoryName} is the named signatory for this document, so the {doc.action === 'agree_in_principle' ? 'agreement in principle' : 'acceptance'} is theirs to give. You can read it here.</p>
        <p className="pt-muted">If this should be you, <a href={CONTACT}>contact us to correct the document</a>.</p>
      </div>
    );
  }

  const fields = { name, title, confirmed };
  const errs = validatePanel(fields);
  const show = (k) => (tried || touched[k]) && errs[k];
  const ready = canSubmit(fields) && !busy && !preview;

  const submit = async (e) => {
    e.preventDefault();
    if (busy || preview) return;
    setTried(true);
    setFailure(null);
    if (!canSubmit(fields)) {
      const first = errs.name ? nameRef : errs.title ? titleRef : boxRef;
      if (first.current) first.current.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await onSubmit({ name: name.trim(), title: title.trim(), confirmed });
      setDone(res);
    } catch (err) {
      setFailure(acceptErrorMessage(err, shortRef(doc.id)));
    } finally {
      setBusy(false);
    }
  };

  const errId = (k) => `${uid}-${k}-err`;
  return (
    <>
      <form className="pt-panel" onSubmit={submit} noValidate aria-labelledby={uid + '-h'} aria-busy={busy}>
        <h2 className="pt-panel-h" id={uid + '-h'}>{doc.action === 'agree_in_principle' ? 'Agree in principle with this document' : 'Accept this document'}</h2>
        {preview && <p className="pt-preview-note" role="note">Preview: this is what the client sees. The button does nothing here.</p>}

        <fieldset className="pt-group pt-group-fixed">
          <legend>From your account <span className="pt-legend-note">(cannot be changed here)</span></legend>
          <dl className="pt-fixed">
            <div><dt>Company</dt><dd>{company}</dd></div>
            <div><dt>Email</dt><dd>{email}</dd></div>
          </dl>
          <p className="pt-muted pt-small">If either is wrong, <a href={CONTACT}>contact us to correct your account</a>.</p>
        </fieldset>

        <fieldset className="pt-group" disabled={busy}>
          <legend>Entered by you</legend>
          <div className="pt-field">
            <label htmlFor={uid + '-name'}>Full name</label>
            <input id={uid + '-name'} ref={nameRef} value={name} autoComplete="name" maxLength={200} required
              aria-invalid={show('name') ? 'true' : undefined} aria-describedby={show('name') ? errId('name') : undefined}
              onChange={(e) => setName(e.target.value)} onBlur={() => setTouched((t) => ({ ...t, name: true }))} />
            <p className="pt-err" id={errId('name')} hidden={!show('name')}>{show('name') || ''}</p>
          </div>
          <div className="pt-field">
            <label htmlFor={uid + '-title'}>Job title</label>
            <input id={uid + '-title'} ref={titleRef} value={title} autoComplete="organization-title" maxLength={200} required
              aria-invalid={show('title') ? 'true' : undefined} aria-describedby={show('title') ? errId('title') : undefined}
              onChange={(e) => setTitle(e.target.value)} onBlur={() => setTouched((t) => ({ ...t, title: true }))} />
            <p className="pt-err" id={errId('title')} hidden={!show('title')}>{show('title') || ''}</p>
          </div>
          <div className="pt-check">
            <input type="checkbox" id={uid + '-ok'} ref={boxRef} checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}
              aria-invalid={show('confirmed') ? 'true' : undefined} aria-describedby={show('confirmed') ? errId('confirmed') : undefined} />
            <label htmlFor={uid + '-ok'}>{doc.confirmation_text}</label>
          </div>
          <p className="pt-err" id={errId('confirmed')} hidden={!show('confirmed')}>{show('confirmed') || ''}</p>
        </fieldset>

        {failure && <div className="pt-fail" role="alert" tabIndex={-1} ref={failRef}>{failure}</div>}
        <div className="pt-actions">
          <button type="submit" className="gs-btn primary" aria-disabled={!ready} data-ready={ready ? 'yes' : 'no'}>
            {busy ? 'Recording…' : actionWord(doc.action)}
          </button>
          {!ready && !busy && !preview && <span className="pt-muted pt-small">Fill in your name and job title and tick the box first.</span>}
        </div>
        <p className="gs-sr-only" role="status" aria-live="polite">{busy ? 'Recording your ' + (doc.action === 'agree_in_principle' ? 'agreement' : 'acceptance') + '…' : ''}</p>
      </form>
      {next}
      <PrivacyNote />
    </>
  );
}
