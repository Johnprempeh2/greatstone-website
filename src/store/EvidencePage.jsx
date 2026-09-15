// One evidence item's own page.
//
// Section 4.10 asks for "the evidence record, with provenance and validation status", and provenance
// is the part a list cannot hold. "We were told the chain runs through SPSS in the August session,
// and we have seen none of it" is a different fact from "we have it", and the difference decides
// whether a finding built on it can be relied on. So this page separates what we HOLD from what is
// still MISSING and from HOW WE KNOW either.
import React, { useMemo } from 'react';
import { PILLAR_GROUP, canReview } from '../data/deepdive-schema.mjs';
import { EVIDENCE_STATE, EVIDENCE_VSTATE, EVIDENCE_VSTATE_ORDER, BEN_CLASSIFICATION, CERTAINTY } from '../data/deepdive.mjs';
import { STATUS, stateOf, historyOf } from './deepdive-state.mjs';
import { deepDiveHref, sessionHref, questionHref, itemHref } from '../lib/deepdive-route.mjs';
import OutLink from './OutLink.jsx';
import RecordSearch from './RecordSearch.jsx';
import ChangeLog from './ChangeLog.jsx';
import InlineText from './InlineText.jsx';
import InlineSelect from './InlineSelect.jsx';
import InlineLinks from './InlineLinks.jsx';
import Attachments from './Attachments.jsx';
import More from './More.jsx';
import { Icon, Labelled } from './DeepDiveIcons.jsx';

const Chip = ({ tone, children, title }) => (
  <span className={`dd-chip dd-${tone}`} title={title}>{children}</span>
);

const when = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'no date recorded'
    : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export default function EvidencePage({
  slug, item, plan, map, log, findings, staff, canAuthor, busy, onEdit, onSaveField, onStatus,
  files, onAttach, onDetach,
}) {
  const can = staff ? (canAuthor || { can: false }) : { can: false };
  const st = stateOf(map, item.id);
  const entries = useMemo(() => historyOf(log, item.id), [log, item.id]);

  // The processes this bears on, resolved from their numbers to the real thing.
  const processes = (plan.PROCESSES || []).filter((p) => (item.processes || []).includes(p.num));
  // Pillars come from the processes it touches: evidence does not carry its own, and inferring them
  // from the processes is more honest than asking someone to type them twice.
  const pillars = [...new Set(processes.flatMap((p) => p.pillars || []))];
  // Who could actually produce it. A session covering the same pillars is the realistic route.
  const couldProduce = (plan.SESSIONS || []).filter((s) =>
    (s.pillars || []).some((x) => pillars.includes(x)));
  // ⚠ WHAT LEANS ON THIS, IN BOTH DIRECTIONS. `sourceId` was the only tie, so a finding that named
  // this evidence as SUPPORTING or CHALLENGING it was invisible here: you could delete an item
  // three conclusions rested on and nothing on the page would have said so. Challenging findings
  // are listed separately rather than counted in, because evidence that contradicts a conclusion is
  // doing the opposite job to evidence that supports it.
  const cites = (findings || []).filter((f) => f.sourceId === item.id
    || (f.evidenceIds || []).includes(item.id));
  const challenges = (findings || []).filter((f) => (f.challengedBy || []).includes(item.id));
  // ⚠ THE TRAIL RAN ONE WAY. Evidence has no sourceId, so free-text provenance is its only tie to a
  // source, and SourcePage already finds this item by asking whether the provenance text contains
  // the source's name. Nothing here asked the same question back, so from an outstanding item you
  // could read who showed us and still not reach the record holding their link, location and owner.
  // Same case-insensitive containment as SourcePage's `named.evidence`, so the two directions cannot
  // drift. A source with no name is skipped: the empty string is contained in everything.
  const namedSources = useMemo(() => {
    const text = (item.provenance || '').toLowerCase();
    if (!text) return [];
    return (plan.SOURCES || []).filter((s) => {
      const n = (s.name || '').trim().toLowerCase();
      return n && text.includes(n);
    });
  }, [plan.SOURCES, item.provenance]);

  const stateInfo = EVIDENCE_STATE[item.state] || EVIDENCE_STATE.missing;
  const review = canReview(item);
  const vInfo = item.vstate ? EVIDENCE_VSTATE[item.vstate] : null;
  const classedAs = item.provenanceKind ? BEN_CLASSIFICATION[item.provenanceKind] : undefined;

  return (
    <div className="ca-wrap dd-wrap">
      <nav className="dd-crumb">
        <a href={deepDiveHref(slug)}>&larr; {plan.engagement?.client}</a>
        <span aria-hidden="true"> · </span><span>Evidence</span>
      </nav>
      {plan && <RecordSearch slug={slug} plan={plan} />}

      <header className="dd-head">
        <div className="dd-kicker"><Labelled icon="evidence">Evidence</Labelled></div>
        <h1 className="dd-qh1">{item.item}</h1>
        <dl className="dd-meta">
          {/* ⚠ Held, part held, outstanding: the one word that says whether this evidence exists.
              It was read only here and set in a twenty-five field form. */}
          <div><dt>Where it stands</dt><dd>
            <InlineSelect value={item.state} can={onSaveField ? can : { can: false }}
              label="Where it stands"
              options={Object.keys(EVIDENCE_STATE).map((k) => ({ id: k, label: EVIDENCE_STATE[k].label }))}
              onSave={(next) => onSaveField(item, { state: next })} />
          </dd></div>
          <div><dt>Working status</dt><dd>
            <InlineSelect value={st.status} can={onStatus ? can : { can: false }} label="Working status"
              options={Object.keys(STATUS).map((k) => ({ id: k, label: STATUS[k].label }))}
              onSave={(next) => onStatus(item.id, { status: next }, item.item)} />
          </dd></div>
          {/* ⚠ THE SECOND AXIS. Holding a document and having weighed it are different facts, and
              both used to read as "Held". It is absent, not greyed, when nothing is in hand: a
              validation status on evidence nobody has provided is a claim about thin air. */}
          <div><dt>Have we assessed it</dt><dd>
            {review.ok ? (
              <InlineSelect value={item.vstate || 'captured'} can={onSaveField ? can : { can: false }}
                label="Have we assessed it"
                options={EVIDENCE_VSTATE_ORDER.map((k) => ({ id: k, label: EVIDENCE_VSTATE[k].label }))}
                onSave={(next) => onSaveField(item, { vstate: next })} />
            ) : <span className="dd-prov-none">{review.why}</span>}
          </dd></div>
          <div><dt>Bears on</dt><dd>{processes.length ? `${processes.length} process${processes.length === 1 ? '' : 'es'}` : 'Not linked'}</dd></div>
          {item.provenanceKind && (
            <div><dt>How we know</dt><dd>
              {item.provenanceKind}
              {/* The instruments ask for Fact / Perspective / Unknown. How we know answers it on the
                  way past and says more, so it is derived rather than typed twice. `inferred` maps
                  to nothing on purpose: an inference is ours, not the source's. */}
              {classedAs && <span className="dd-prov-none"> · {classedAs}</span>}
              {item.provenanceKind === 'inferred' && (
                <span className="dd-prov-none"> · our inference, not the source's. It belongs in a finding where it can be challenged.</span>
              )}
            </dd></div>
          )}
        </dl>
        {/* ⚠ TWO FIELDS THAT MEAN THE SAME THING AND ARE NEVER COMPARED WILL EVENTUALLY DISAGREE.
            The generic working status carries "Examined", which is the same claim the validation
            axis makes properly, with reasons and states of its own. Nothing stopped somebody
            marking an item Examined while the record still said nobody had weighed it, and both
            read as true on the same screen. The contradiction is surfaced rather than resolved
            silently, because which one is right is a judgement and only a person can make it. */}
        {st.status === 'done' && item.vstate === 'captured' && (
          <p className="dd-nogap">
            This is marked <strong>Examined</strong> as a working status, but nothing has weighed it
            yet: its assessment still reads <strong>Captured</strong>. One of the two is wrong.
          </p>
        )}
        {st.status === 'done' && !item.vstate && (
          <p className="dd-nogap">
            This is marked <strong>Examined</strong>, but nothing is in hand to examine. Either it
            arrived and the record has not caught up, or the status is optimistic.
          </p>
        )}
        {staff && (
          <div className="dd-headtools">
            <button type="button" className="gs-btn ghost sm" disabled={!canAuthor?.can}
              title={canAuthor?.can ? undefined : canAuthor?.why} onClick={() => onEdit(item)}>Edit this item</button>
          </div>
        )}
      </header>

      {/* The three-way split that a row cannot show.
          ⚠ All three used to be READ-ONLY here, under headings that named their own absence: this
          page told you provenance was missing and gave you nowhere to write it. They are edited in
          place now, because the moment you notice the gap is the moment you can close it. */}
      <div className="dd-prov">
        <section className={`dd-prov-c${item.held ? ' is-held' : ''}`}>
          <h2><Labelled icon="validated">What we hold</Labelled></h2>
          <InlineText value={item.held} can={staff ? (canAuthor || { can: false }) : { can: false }} rows={3}
            label="what we hold" empty="Nothing yet."
            placeholder="What is actually in our hands right now."
            onSave={(v) => onSaveField(item, { held: v })} />
          {item.link && <OutLink href={item.link}>Open the document</OutLink>}
        </section>
        <section className={`dd-prov-c${item.missing ? ' is-missing' : ''}`}>
          <h2><Labelled icon="warn">What is still missing</Labelled></h2>
          <InlineText value={item.missing} can={staff ? (canAuthor || { can: false }) : { can: false }} rows={3}
            label="what is still missing"
            empty={item.state === 'held' ? 'Nothing. This is in hand.' : 'Not yet stated.'}
            placeholder="What we asked for and have not got."
            onSave={(v) => onSaveField(item, { missing: v })} />
        </section>
        <section className="dd-prov-c">
          <h2><Labelled icon="source">How we know it</Labelled></h2>
          <InlineText value={item.provenance} can={staff ? (canAuthor || { can: false }) : { can: false }} rows={3}
            label="how we know it"
            empty="Provenance not recorded. Without it, a finding built on this cannot say how far to trust it."
            placeholder="Who showed us, when, and in what."
            onSave={(v) => onSaveField(item, { provenance: v })} />
          {/* The source records the provenance text names, each opening the page built to hold
              where it lives and who has to say yes. Matched on the name, not a recorded link, so
              the row is absent rather than empty when nothing matches. Folded past two lines. */}
          {namedSources.length > 0 && (
            <div className="dd-prov-named">
              <h3 className="dd-sub">Named here</h3>
              <More lines={2} className="dd-rigour-links">
                {namedSources.map((s) => (
                  <a key={s.id} className="dd-either-a" href={itemHref(slug, 'source', s.id)}
                    title="Matched on the name in the provenance text, not on a recorded link">{s.name}</a>
                ))}
              </More>
            </div>
          )}
        </section>
      </div>

      {/* ⚠ WHAT MAKES AN OUTSTANDING ITEM A GAP RATHER THAN A SHOPPING-LIST ENTRY. Without a stated
          consequence nobody can tell whether chasing this matters more than the next thing, so the
          chase order becomes whoever asked most recently. */}
      <section className="org-sec dd-sec">
        <h2><Labelled icon="session">Asked for in</Labelled></h2>
        <p className="dd-sub-lead">The sittings this will be asked for in. An outstanding document with
          no session naming it is chased by nobody.</p>
        <InlineLinks value={item.sessionIds || []} can={staff ? (canAuthor || { can: false }) : { can: false }}
          label="sessions" addLabel="Tie a session" empty="No session will ask for this yet."
          options={(plan.SESSIONS || []).map((s) => ({ id: s.id, label: [s.ref, s.name || s.person].filter(Boolean).join(' · ') }))}
          href={(id) => sessionHref(slug, id)}
          onChange={(next) => onSaveField(item, { sessionIds: next })} />
      </section>

      {(item.state === 'missing' || item.state === 'partial' || item.state === 'accepted') && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="warn">
            {item.state === 'accepted' ? 'The limitation we accepted' : 'Why this gap matters'}
          </Labelled></h2>
          {item.state === 'accepted' && (
            <p className="dd-sub-lead">
              We are not going to get this. The assessment proceeds, and the limitation stays visible
              wherever it bears on a conclusion.
            </p>
          )}
          <dl className="dd-meta">
            <div><dt>Why it matters</dt><dd>
              <InlineText value={item.whyItMatters} can={staff ? (canAuthor || { can: false }) : { can: false }} rows={2}
                label="why it matters"
                empty="Not stated, so this cannot be weighed against anything else outstanding."
                placeholder="What this would let us establish that nothing else can."
                onSave={(v) => onSaveField(item, { whyItMatters: v })} />
            </dd></div>
            <div><dt>If we never get it</dt><dd>
              <InlineText value={item.impactIfUnresolved} can={staff ? (canAuthor || { can: false }) : { can: false }} rows={2}
                label="what happens if we never get it"
                empty="Not stated. An unresolved gap with no stated impact quietly becomes an accepted one."
                placeholder="Which conclusion stays unsupported, and how far that limits the assessment."
                onSave={(v) => onSaveField(item, { impactIfUnresolved: v })} />
            </dd></div>
          </dl>
        </section>
      )}

      {/* ⚠ WHAT RESTS ON THIS. Deleting an item three conclusions lean on should never be a quiet
          act, and evidence that CHALLENGES a finding is doing the opposite job to evidence that
          supports one, so the two are never added together. */}
      {(cites.length > 0 || challenges.length > 0) && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="link">What rests on this</Labelled></h2>
          {cites.length > 0 && (
            <>
              <h3 className="dd-sub">Supports {cites.length} finding{cites.length === 1 ? '' : 's'}</h3>
              <p className="dd-sub-lead">
                If this turns out to be wrong, these are what to revisit.
              </p>
              <ul className="dd-list">
                {cites.map((f) => (
                  <li key={f.id}>
                    {f.questionId
                      ? <a className="dd-either-a" href={questionHref(slug, f.questionId)}>{f.text}</a>
                      : f.text}
                  </li>
                ))}
              </ul>
            </>
          )}
          {challenges.length > 0 && (
            <>
              <h3 className="dd-sub">Challenges {challenges.length} finding{challenges.length === 1 ? '' : 's'}</h3>
              <p className="dd-sub-lead">
                This conflicts with what those conclusions say. The conflict is an investigative
                signal, not a defect in either.
              </p>
              <ul className="dd-list dd-list-open">
                {challenges.map((f) => (
                  <li key={f.id}>
                    {f.questionId
                      ? <a className="dd-either-a" href={questionHref(slug, f.questionId)}>{f.text}</a>
                      : f.text}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* ⚠ The detail used to be HIDDEN once held or missing was filled in (`&& !item.held &&
          !item.missing`), so writing what we hold made the note about it disappear. */}
      {(item.note || staff) && (
        <section className="org-sec dd-sec">
          <h2>Detail</h2>
          <InlineText value={item.note} can={staff ? (canAuthor || { can: false }) : { can: false }} rows={3}
            label="the detail" empty="Nothing recorded."
            placeholder="Anything else worth knowing about this."
            onSave={(v) => onSaveField(item, { note: v })} />
        </section>
      )}

      {staff && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="proposed">Where it has got to</Labelled></h2>
          <p className="org-sec-sub">Chasing a document is work like any other, and it belongs on the record.</p>
          <div className="dd-ctl">
            <label className="dd-ctl-status">
              <span className="gs-sr-only">Status for {item.item}</span>
              <select value={st.status} disabled={busy || !canAuthor?.can}
                className={`dd-sel dd-sel-${STATUS[st.status].tone}`}
                onChange={(e) => onStatus(item.id, { status: e.target.value }, item.item)}>
                {Object.keys(STATUS).map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}
              </select>
            </label>
          </div>
        </section>
      )}

      <Attachments slug={slug} itemId={item.id} files={files} staff={staff}
        canAuthor={canAuthor} busy={busy} onAttach={onAttach} onDetach={onDetach} />

      {processes.length > 0 && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="process">What it bears on</Labelled></h2>
          <ul className="dd-cli">
            {processes.map((p) => (
              <li key={p.id} className="dd-cli-row">
                <div className="dd-cli-main">
                  <h3><a className="dd-q-link" href={itemHref(slug, 'process', p.id)}>{p.name}</a></h3>
                  <p>{p.howToday}</p>
                </div>
                <div className="dd-proc-pills">{(p.pillars || []).map((x) => <Chip key={x} tone="pillar">{x}</Chip>)}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ⚠ A second "What rests on it" section used to sit here, mapping the same `cites` array as
          the guarded section above, but linking EVERY finding to questionHref(f.questionId) with
          no guard: a finding tied to this item through evidenceIds alone (questionId null is a
          stored shape) rendered a live link to question/null and landed on the not-found screen.
          One list, guarded once, is the fix; its "what to revisit" line moved up with it. */}

      {item.state !== 'held' && couldProduce.length > 0 && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="session">Who could produce it</Labelled></h2>
          <p className="org-sec-sub">Sessions already covering the same pillars. Asking there costs nothing extra.</p>
          <ul className="dd-cli">
            {couldProduce.map((s) => (
              <li key={s.id} className="dd-cli-row">
                <div className="dd-cli-main"><h3><a className="ca-link" href={sessionHref(slug, s.id)}>{s.person}</a></h3><p>{s.only}</p></div>
                <Chip tone={`st-${stateOf(map, s.id).status}`}>{STATUS[stateOf(map, s.id).status].label}</Chip>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ⚠ Nothing is not a history. Three of these pages already hid this section when empty and
          five rendered a heading over the words "Nothing yet.", which is a section telling you what
          you could already see. */}
      {entries.length > 0 && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="history">History</Labelled></h2>
          <ChangeLog entries={entries} />
        </section>
      )}
    </div>
  );
}
