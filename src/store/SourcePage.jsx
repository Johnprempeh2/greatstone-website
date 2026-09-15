// One source, and how to actually reach it.
//
// A record that cites "the August transcript" and cannot open it asks a practitioner to go and find
// it again every single time, and asks a reviewer to take the citation on trust. This page is the
// end of that trail: what the source is, where it physically lives, who has to say yes before you
// can reach it, and everything in the record that leans on it.
//
// The outward link is rendered through safeLink even though the schema already refused a bad scheme
// on the way in, because a record written before that guard existed was never checked.
import React, { useMemo } from 'react';
import { deepDiveHref, itemHref, questionHref, sessionHref, evidenceHref } from '../lib/deepdive-route.mjs';
import { Icon, Labelled } from './DeepDiveIcons.jsx';
import RecordSearch from './RecordSearch.jsx';
import InlineText from './InlineText.jsx';
import InlineSelect from './InlineSelect.jsx';
import InlinePeople from './InlinePeople.jsx';
import { SOURCE_TYPES } from '../data/deepdive-schema.mjs';
import Attachments from './Attachments.jsx';
import OutLink from './OutLink.jsx';

const TYPE_WORD = {
  person: 'A person', team: 'A team', system: 'A system',
  document: 'A document', external: 'Something outside the business',
};

export default function SourcePage({
  slug, item, plan, findings, files, staff, canAuthor, busy, onEdit, onSaveField, onSaveRecord,
  onAttach, onDetach,
}) {
  const can = staff ? (canAuthor || { can: false }) : { can: false };
  // Everything in the record that leans on this source. A citation nobody can trace back is the
  // thing this page exists to stop, so the traffic runs both ways.
  const cites = useMemo(() => {
    // The same rule standing() applies per question, applied across the whole record: a superseded
    // or rejected finding is history, not something this source is currently holding up.
    const live = (findings || []).filter((f) => f.state !== 'superseded' && f.state !== 'rejected');
    const qById = new Map();
    for (const g of plan.QUESTIONS || []) for (const q of g.items || []) qById.set(q.id, q);
    return live
      .filter((f) => f.sourceId === item.id)
      .map((f) => ({ f, q: qById.get(f.questionId) }))
      .filter((x) => x.q);
  }, [findings, plan, item.id]);

  const named = useMemo(() => {
    const n = item.name.toLowerCase();
    return {
      sessions: (plan.SESSIONS || []).filter((s) => s.person.toLowerCase().includes(n) || n.includes(s.person.toLowerCase())),
      evidence: (plan.EVIDENCE || []).filter((e) => (e.provenance || '').toLowerCase().includes(n)),
    };
  }, [plan, item.name]);

  const reachable = item.link || item.located;

  return (
    <div className="ca-wrap dd-wrap">
      <nav className="dd-crumb" aria-label="Breadcrumb">
        <a href={deepDiveHref(slug)}>&larr; {plan.engagement?.client || 'Record'}</a>
        <span aria-hidden="true"> · </span><span>Sources</span>
      </nav>
      {plan && <RecordSearch slug={slug} plan={plan} />}

      <header className="dd-head">
        <div className="dd-kicker"><Labelled icon="source">{TYPE_WORD[item.sourceType] || 'A source'}</Labelled></div>
        <h1 className="dd-qh1">{item.name}</h1>
        {/* ⚠ What a source GIVES was read only and rendered only when non-empty, so a source with
            nothing recorded showed nothing and the one line saying why it is in the record could
            only be written in the drawer. */}
        <InlineText className="dd-lead" value={item.gives} can={can} rows={2}
          label="what this source holds" empty="What this holds is not recorded."
          placeholder="What information it actually holds."
          onSave={(v) => onSaveField(item, { gives: v })} />
        <dl className="dd-meta">
          <div><dt>What kind</dt><dd>
            <InlineSelect value={item.sourceType} can={can} label="What kind of source"
              options={SOURCE_TYPES.map((t) => ({ id: t, label: TYPE_WORD[t] || t }))}
              onSave={(next) => onSaveField(item, { sourceType: next })} />
          </dd></div>
          {/* ⚠ Whose permission is needed, as a person the record can follow. It was free text, so
              "access goes through them" never reached anybody's page. */}
          <div><dt>Who controls it</dt><dd>
            <InlinePeople names={item.owner} ids={item.ownerId ? [item.ownerId] : []}
              slug={slug} people={(plan?.PEOPLE || [])} can={can} multiline={false} describes
              label="Who controls access to this" nameField="owner" idField="ownerId"
              placeholder="A name or a role."
              onSave={({ owner, ownerId }) => onSaveField(item,
                { owner, ownerId: (ownerId || []).slice(-1)[0] || null })} />
          </dd></div>
        </dl>
        {staff && (
          <div className="dd-headtools">
            <button type="button" className="gs-btn ghost sm" disabled={!canAuthor?.can}
              title={canAuthor?.can ? undefined : canAuthor?.why} onClick={() => onEdit(item)}>Edit this source</button>
          </div>
        )}
      </header>

      <section className="org-sec dd-sec">
        <h2><Labelled icon="link">How to reach it</Labelled></h2>
        {reachable ? (
          <div className="dd-reach">
            {item.link && <OutLink href={item.link} className="dd-out dd-out-big">Open the source</OutLink>}
            {item.located && <p className="dd-reach-where"><b>Where it lives.</b> {item.located}</p>}
            {item.access && <p className="dd-reach-how"><b>What it takes.</b> {item.access}</p>}
            {item.owner && <p className="dd-reach-who"><b>Who has to say yes.</b> {item.owner}</p>}
          </div>
        ) : (
          <div className="dd-empty">
            <h2>Nobody has said where this is</h2>
            <p>
              Every answer traced to this source is currently uncheckable: a reader has to take the
              citation on trust, or go and find it again.
            </p>
            {item.access && <p><b>What it takes.</b> {item.access}</p>}
            {item.owner && <p><b>Who has to say yes.</b> {item.owner}</p>}
          </div>
        )}
        {/* ⚠ "Add the link, or say where it lives" was the whole instruction, with nothing to add it
            with. Both fields sit here now, in the section that names their absence. */}
        {staff && (
          <div className="dd-recedit">
            <div>
              <h3 className="dd-sub">A link to it</h3>
              <InlineText value={item.link} can={canAuthor || { can: false }} multiline={false}
                label="the link to this source" placeholder="https://…" empty="No link."
                onSave={(v) => onSaveField(item, { link: v })} />
            </div>
            <div>
              <h3 className="dd-sub">Or where it lives</h3>
              <InlineText value={item.located} can={canAuthor || { can: false }} rows={2}
                label="where this source lives" empty="Not said."
                placeholder="Which system, whose drive, which shelf."
                onSave={(v) => onSaveField(item, { located: v })} />
            </div>
          </div>
        )}
      </section>

      <Attachments slug={slug} itemId={item.id} files={files} staff={staff}
        canAuthor={canAuthor} busy={busy} onAttach={onAttach} onDetach={onDetach} />

      <section className="org-sec dd-sec">
        <h2><Labelled icon="compare">What leans on it</Labelled></h2>
        {cites.length === 0 && !named.sessions.length && !named.evidence.length ? (
          <p className="ca-note">Nothing in the record cites this source yet.</p>
        ) : (
          <>
            {cites.length > 0 && (
              <ul className="dd-cli">
                {cites.map(({ f, q }) => (
                  <li key={f.id} className="dd-cli-row">
                    <div className="dd-cli-main">
                      <h3><a className="dd-q-link" href={questionHref(slug, q.id)}>{q.q}</a></h3>
                      <p>{f.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {(named.sessions.length > 0 || named.evidence.length > 0) && (
              <div className="dd-alsonamed">
                <h3 className="dd-sub">Also named here</h3>
                <p className="ca-note">
                  Matched on the name rather than on a recorded link, so treat these as a prompt to
                  check rather than as a statement that they are the same thing.
                </p>
                <div className="dd-alsonamed-l">
                  {named.sessions.map((s) => (
                    <a key={s.id} className="dd-either-a" href={sessionHref(slug, s.id)}>Session: {s.person}</a>
                  ))}
                  {named.evidence.map((e) => (
                    <a key={e.id} className="dd-either-a" href={evidenceHref(slug, e.id)}>Evidence: {e.item}</a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {item.pillars?.length > 0 && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="link">Pillars it bears on</Labelled></h2>
          <div className="dd-proc-pills">
            {item.pillars.map((p) => <span key={p} className="dd-chip dd-pillar">{p}</span>)}
          </div>
        </section>
      )}
    </div>
  );
}
