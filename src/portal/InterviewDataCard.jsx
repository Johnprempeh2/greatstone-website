// GRE-2653: "See my interview data" and "Delete my interview data" in the website account. Reads and deletes only
// the signed-in person's own interview data (POST /api/interview/my-data). The download is the same data as a file.
import React, { useState } from 'react';
import { formatDeletionDate } from './interview-notice.mjs';
import { QUOTE_CHOICE_LABEL, deleteConfirmText, downloadName } from './interview-data-view.mjs';

async function call(body) {
  const res = await fetch('/api/interview/my-data', {
    method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Something went wrong. Try again.');
  return json.data;
}

export default function InterviewDataCard({ flash = () => {} }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [confirming, setConfirming] = useState(null);

  const load = async () => {
    setBusy(true); setErr(null);
    try { setData(await call({ op: 'see' })); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const download = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = downloadName(data.generatedAt);
    a.click(); URL.revokeObjectURL(a.href);
  };
  const remove = async (round) => {
    setBusy(true); setErr(null);
    try {
      await call({ op: 'delete', engagementId: round.engagementId, confirm: true });
      setConfirming(null); flash('Your interview data was deleted.');
      setData(await call({ op: 'see' }));
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div className="pr-form">
      <h2>Interview data</h2>
      <p className="ca-note">If you took part in a Greatstone interview, you can see everything we hold about you from it, download it, or delete it.</p>
      {!data && <button className="gs-btn ghost" onClick={load} disabled={busy}>{busy ? 'Loading…' : 'See my interview data'}</button>}
      {err && <div className="ca-err" role="alert">{err}</div>}
      {data && data.rounds.length === 0 && <p className="ca-note">We hold no interview data about you.</p>}
      {data && data.rounds.length > 0 && <>
        <button className="gs-btn ghost sm" onClick={download}>Download my interview data</button>
        {data.rounds.map((round) => (
          <section key={round.engagementId} className="acct-interview" aria-label={`Interview: ${round.engagement}`}>
            <h3>{round.engagement}</h3>
            <p className="ca-note">
              {round.deletionDate ? `Deleted by ${formatDeletionDate(round.deletionDate)}.` : 'Deleted 90 days after the findings are presented.'}
              {' '}Quotes: {QUOTE_CHOICE_LABEL[round.consent.quotes]}{round.consent.quotesChosen ? '' : ' (you did not choose)'}.
              {round.consent.withdrawn ? ' You deleted your data from this interview.' : ''}
            </p>
            {round.sessions.map((s, n) => (
              <details key={n}>
                <summary>Conversation {n + 1}{s.startedAt ? `, ${new Date(s.startedAt).toLocaleDateString('en-GB')}` : ''}</summary>
                <ol className="acct-transcript">
                  {s.transcript.map((t, i) => <li key={i}><b>{t.speaker === 'you' ? 'You' : 'Interviewer'}:</b> {t.text}</li>)}
                </ol>
              </details>
            ))}
            {round.insights.length > 0 && (
              <details>
                <summary>What we noted from your answers ({round.insights.length})</summary>
                <ul>{round.insights.map((i, k) => <li key={k}>{i.label}{i.hoursPerWeek != null ? ` (about ${i.hoursPerWeek} hours a week)` : ''}</li>)}</ul>
              </details>
            )}
            <p className="ca-note">
              {round.quotesUsed.length === 0 ? 'None of your words are quoted in the findings.'
                : `${round.quotesUsed.length} of your quotes are in the findings${round.consent.quotes === 'named' ? ', with your name' : ', without your name'}.`}
            </p>
            {!round.consent.withdrawn && (round.sessions.length > 0 || round.insights.length > 0) && (confirming === round.engagementId ? (
              <div className="acct-confirm" role="alertdialog" aria-label="Confirm delete">
                <p>{deleteConfirmText(round.engagement)}</p>
                <button className="gs-btn primary sm" onClick={() => remove(round)} disabled={busy}>{busy ? 'Deleting…' : 'Delete my interview data'}</button>
                <button className="gs-btn ghost sm" onClick={() => setConfirming(null)} disabled={busy}>Keep it</button>
              </div>
            ) : (
              <button className="gs-btn ghost sm" onClick={() => setConfirming(round.engagementId)}>Delete my interview data</button>
            ))}
          </section>
        ))}
      </>}
    </div>
  );
}
