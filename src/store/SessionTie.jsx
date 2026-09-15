// Tie a question to the sessions that will ask it, from the QUESTION's side.
//
// The covers list lives on the SESSION (a practitioner opens a session and needs its questions),
// but the person doing the planning stands on a question asking "who is going to ask this?".
// Making them go to the Sessions tab to answer it is the go-elsewhere pattern this portal keeps
// killing. So the control renders here and WRITES THERE: each toggle edits that session's covers,
// through the same op every other write goes through, so the trail names the hand and the schema
// still referees.
import React from 'react';
import InlineLinks from './InlineLinks.jsx';
import { itemHref } from '../lib/deepdive-route.mjs';

/**
 * @param plan     the record
 * @param q        the question whose ties these are
 * @param slug     for the session links
 * @param can      { can, why }, the portal's usual shape
 * @param save     async (session, fields) => void — the cross-record writer. Callers hand in
 *                 whichever they hold: the portal's ctx.runOp wrapped, or a page's onSaveRecord.
 */
export default function SessionTie({ plan, q, slug, can, save }) {
  const sessions = plan.SESSIONS || [];
  const covering = sessions.filter((s) => (s.covers || []).includes(q.id)).map((s) => s.id);
  const options = sessions.map((s) => ({
    id: s.id,
    label: `${s.ref ? `${s.ref} · ` : ''}${s.name || s.person}`,
    sub: s.name ? s.person : (s.pillars || []).join(' · '),
  }));
  const onChange = async (next) => {
    const now = new Set(covering); const want = new Set(next);
    for (const s of sessions) {
      const has = now.has(s.id); const should = want.has(s.id);
      if (has === should) continue;
      const covers = should
        ? [...(s.covers || []), q.id]
        : (s.covers || []).filter((x) => x !== q.id);
      await save(s, { covers });
    }
  };
  return (
    <InlineLinks value={covering} options={options} onChange={onChange} can={can}
      label="session" href={(id) => itemHref(slug, 'session', id)}
      empty="Nobody set to ask this yet." addLabel="Tie to a session" />
  );
}
