// One claim, and what it would take to kill it.
//
// The register keeps the plan honest; this page is where one claim gets worked: the grounds, the
// twin tests (what would confirm it, what would kill it), the verdict, and what actually changes if
// it turns out to be false. The card on the tab shrinks to the claim and its falsifier, because
// those two lines are the hypothesis; everything else is the working.
import React, { useMemo, useState } from 'react';
import { historyOf } from './deepdive-state.mjs';
import { deepDiveHref, itemHref, ITEM_KINDS } from '../lib/deepdive-route.mjs';
import { labelOf, findItem, HYPOTHESIS_VERDICTS } from '../data/deepdive-schema.mjs';
import { Labelled } from './DeepDiveIcons.jsx';
import RecordSearch from './RecordSearch.jsx';
import ChangeLog from './ChangeLog.jsx';
import InlineText from './InlineText.jsx';
import InlineSelect from './InlineSelect.jsx';
import InlineLinks from './InlineLinks.jsx';

const Chip = ({ tone, children }) => <span className={`dd-chip dd-${tone}`}>{children}</span>;
const VERDICT_WORD = { open: 'To test', confirmed: 'Confirmed', killed: 'Killed' };
// Past this many sessions the list folds behind one control: the point is a way in, not a roster.
const FOLD_AT = 6;

function RefLink({ plan, slug, id }) {
  const found = findItem(plan, id);
  const text = labelOf(plan, id) || id;
  if (found && ITEM_KINDS.includes(found.kind)) {
    return <a className="dd-either-a" href={itemHref(slug, found.kind, id)}>{text}</a>;
  }
  return <span>{text}</span>;
}

export default function HypothesisPage({
  slug, item, plan, log, staff, canAuthor, onEdit, onSaveField,
}) {
  const can = staff ? (canAuthor || { can: false }) : { can: false };
  const entries = useMemo(() => historyOf(log || [], item.id), [log, item.id]);
  // Who could actually run the test. `item.test` is free text and the pillars were dead chips, so
  // unless a session id had been hand-added to bearsOn the only route to a session was the tab
  // bar. A session already covering the same pillars is the realistic place to settle it, the
  // same derivation EvidencePage uses for who could produce a missing document.
  const couldTest = useMemo(() => (plan.SESSIONS || []).filter((s) =>
    (s.pillars || []).some((x) => (item.pillars || []).includes(x))), [plan.SESSIONS, item.pillars]);
  const [allSessions, setAllSessions] = useState(false);
  const shownSessions = allSessions ? couldTest : couldTest.slice(0, FOLD_AT);

  return (
    <div className="ca-wrap dd-wrap">
      <nav className="dd-crumb" aria-label="Breadcrumb">
        <a href={deepDiveHref(slug)}>&larr; {plan.engagement?.client || 'Record'}</a>
        <span aria-hidden="true"> &middot; </span>
        <span>Hypotheses</span>
      </nav>
      {plan && <RecordSearch slug={slug} plan={plan} />}

      <header className="dd-head">
        <div className="dd-kicker"><Labelled icon="question">{item.ref || 'Hypothesis'}{item.group ? ` · ${item.group}` : ''}</Labelled></div>
        {/* The claim IS the title. It is a sentence, so it sets smaller than a name would. */}
        <h1 className="dd-qh1 dd-hyp-title">{item.claim}</h1>
        <div className="dd-proc-pills">
          <Chip tone={`hv-${item.verdict}`}>{VERDICT_WORD[item.verdict] || item.verdict}</Chip>
        </div>
        {staff && (
          <button type="button" className="gs-btn ghost sm dd-comp-editall" onClick={() => onEdit(item)}>
            Edit this hypothesis
          </button>
        )}
      </header>

      <div className="dd-comp-cols">
        <article className="org-sec dd-sec dd-hyp-row is-kill">
          <h2><Labelled icon="warn">What would kill it</Labelled></h2>
          <InlineText value={item.kills} onSave={(v) => onSaveField(item, { kills: v })} can={can}
            label="What would kill it" rows={3}
            placeholder="The finding that would disprove it."
            empty="No falsifier recorded. A claim that cannot be disproved is an opinion, not a hypothesis." />
        </article>
        <article className="org-sec dd-sec dd-hyp-row is-conf">
          <h2><Labelled icon="validated">What would confirm it</Labelled></h2>
          <InlineText value={item.confirms} onSave={(v) => onSaveField(item, { confirms: v })} can={can}
            label="What would confirm it" rows={3}
            placeholder="The finding that would settle it."
            empty="Not recorded." />
        </article>
      </div>

      <section className="org-sec dd-sec">
        <h2><Labelled icon="evidence">Why we hold it, and how we test it</Labelled></h2>
        <InlineText value={item.grounds} onSave={(v) => onSaveField(item, { grounds: v })} can={can}
          label="What makes us think so" rows={3}
          placeholder="What we already hold that points this way."
          empty="No grounds recorded, so this is a hunch on the record's own terms." />
        <InlineText value={item.test} onSave={(v) => onSaveField(item, { test: v })} can={can}
          label="How we test it" rows={2}
          placeholder="The observation or comparison that settles it."
          empty="No test recorded, so nothing is scheduled to settle it." />
        {/* Only while the claim is still open: once it is confirmed or killed, nobody needs to run
            the test, mirroring the state gate on EvidencePage's "Who could produce it". */}
        {item.verdict === 'open' && couldTest.length > 0 && (
          <>
            <h3 className="dd-sub"><Labelled icon="session">Who could run the test</Labelled></h3>
            <p className="org-sec-sub">Sessions already covering the same pillars. Asking there costs nothing extra.</p>
            <ul className="dd-cli">
              {shownSessions.map((s) => (
                <li key={s.id} className="dd-cli-row">
                  <div className="dd-cli-main">
                    <h4><a className="dd-q-link" href={itemHref(slug, 'session', s.id)}>{s.name || s.person || s.ref || s.id}</a></h4>
                    {s.only && <p>{s.only}</p>}
                  </div>
                </li>
              ))}
            </ul>
            {couldTest.length > FOLD_AT && (
              <button type="button" className="dd-tie-go" aria-expanded={allSessions}
                onClick={() => setAllSessions((v) => !v)}>
                {allSessions ? 'Show fewer' : `Show all ${couldTest.length} sessions`}
              </button>
            )}
          </>
        )}
      </section>

      <section className="org-sec dd-sec">
        <h2><Labelled icon="compare">Where it stands, and what changes</Labelled></h2>
        <InlineSelect value={item.verdict} can={can} label="Verdict"
          options={HYPOTHESIS_VERDICTS.map((v) => ({ id: v, label: VERDICT_WORD[v] || v }))}
          onSave={(v) => onSaveField(item, { verdict: v })} />
        <InlineText value={item.ifWrong} onSave={(v) => onSaveField(item, { ifWrong: v })} can={can}
          label="What changes if it is wrong" rows={2}
          placeholder="What the plan does differently if this turns out false."
          empty="Nothing recorded. If being wrong changes nothing, the claim is not worth testing." />
      </section>

      <section className="org-sec dd-sec">
        <h2><Labelled icon="session">Tested in</Labelled></h2>
        <p className="dd-sub-lead">The sittings that will actually run the test. Tie it here and the
          session page and the live run both carry it.</p>
        <InlineLinks value={item.sessionIds || []} can={can} label="sessions"
          options={(plan.SESSIONS || []).map((s) => ({ id: s.id, label: [s.ref, s.name || s.person].filter(Boolean).join(' · ') }))}
          href={(id) => itemHref(slug, 'session', id)} addLabel="Tie a session"
          empty="No session will run this test yet."
          onChange={(next) => onSaveField(item, { sessionIds: next })} />
      </section>

      <section className="org-sec dd-sec">
        <h2><Labelled icon="link">What it bears on</Labelled></h2>
        {(item.bearsOn || []).length === 0
          ? <p className="dd-sub-lead dd-covgap">Tied to nothing yet: confirming or killing it would change no recorded thing.</p>
          : <ul className="dd-list">
              {item.bearsOn.map((id) => <li key={id}><RefLink plan={plan} slug={slug} id={id} /></li>)}
            </ul>}
        {item.pillars?.length > 0 && (
          <div className="dd-proc-pills">{item.pillars.map((x) => <Chip key={x} tone="pillar">{x}</Chip>)}</div>
        )}
      </section>

      {staff && entries.length > 0 && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="history">What has changed</Labelled></h2>
          <ChangeLog entries={entries} />
        </section>
      )}
    </div>
  );
}
