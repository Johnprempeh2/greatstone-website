// One number the business runs on.
//
// The KPI card on the tab says what the number is; this page is for working ON it: whose it is,
// where it stands against its target, how it is actually arrived at, and the processes, questions
// and other numbers that move it. Linking a KPI to what affects it is what turns the record into a
// model rather than a list, and this is where those links become readable.
import React, { useMemo } from 'react';
import { historyOf } from './deepdive-state.mjs';
import { deepDiveHref, itemHref, ITEM_KINDS } from '../lib/deepdive-route.mjs';
import { labelOf, findItem , canBaseline, MEASURE_CONFIDENCE_MEANS } from '../data/deepdive-schema.mjs';
import { Icon, Labelled } from './DeepDiveIcons.jsx';
import RecordSearch from './RecordSearch.jsx';
import ChangeLog from './ChangeLog.jsx';
import InlineText from './InlineText.jsx';
import InlineSelect from './InlineSelect.jsx';

const Chip = ({ tone, children }) => <span className={`dd-chip dd-${tone}`}>{children}</span>;

/** An id resolved to something a person can read, and a link when the kind has a page. */
function RefLink({ plan, slug, id }) {
  const found = findItem(plan, id);
  const text = labelOf(plan, id) || id;
  if (found && ITEM_KINDS.includes(found.kind)) {
    return <a className="dd-either-a" href={itemHref(slug, found.kind, id)}>{text}</a>;
  }
  return <span>{text}</span>;
}

export default function KpiPage({
  slug, item, plan, log, staff, canAuthor, onEdit, onSaveField,
}) {
  // Whether this number can safely be compared to a later one, and which opportunities lean on it.
  const baseline = canBaseline(item);
  const measuring = (plan?.OPPORTUNITIES || []).filter((o) => (o.kpis || []).includes(item.id));
  const claiming = (plan?.BUILDS || []).filter((b) => (b.kpis || []).includes(item.id));
  const can = staff ? (canAuthor || { can: false }) : { can: false };
  const entries = useMemo(() => historyOf(log || [], item.id), [log, item.id]);
  const gap = item.current != null && item.target != null ? item.current - item.target : null;
  const good = gap == null ? null
    : item.direction === 'up' ? gap >= 0
    : item.direction === 'down' ? gap <= 0 : Math.abs(gap) < 1e-9;
  const people = (plan.PEOPLE || []).map((p) => ({ id: p.id, label: p.name }));
  const units = (plan.UNITS || []).map((u) => ({ id: u.id, label: u.name }));
  // The person the number is pinned to, when the record knows them. Null when ownerId is unset OR
  // names somebody outside PEOPLE, so the select's own "not one of this record's choices" handling
  // stays in charge of the unknown case instead of a link to a page that does not exist.
  const owner = item.ownerId ? (plan.PEOPLE || []).find((p) => p.id === item.ownerId) || null : null;

  return (
    <div className="ca-wrap dd-wrap">
      <nav className="dd-crumb" aria-label="Breadcrumb">
        <a href={deepDiveHref(slug)}>&larr; {plan.engagement?.client || 'Record'}</a>
        <span aria-hidden="true"> &middot; </span>
        <span>KPIs</span>
      </nav>
      {plan && <RecordSearch slug={slug} plan={plan} />}

      <header className="dd-head">
        <div className="dd-kicker"><Labelled icon="kpi">{item.scope ? `${item.scope} number` : 'A number'}</Labelled></div>
        <h1 className="dd-qh1">{item.name}</h1>
        {item.current != null && (
          <div className={`dd-kpi-n dd-kpi-hero${good === true ? ' is-good' : good === false ? ' is-off' : ''}`}>
            <span className="dd-kpi-v">{item.current}</span>
            {item.unit && <span className="dd-kpi-u">{item.unit}</span>}
            {item.target != null && <span className="dd-kpi-sep" aria-hidden="true" />}
            {item.target != null && (
              <span className="dd-kpi-t">
                {Icon[item.direction === 'down' ? 'down' : 'up']({ size: 15 })} target {item.target}
              </span>
            )}
          </div>
        )}
        {staff && (
          <button type="button" className="gs-btn ghost sm dd-comp-editall" onClick={() => onEdit(item)}>
            Edit this number
          </button>
        )}
      </header>

      <div className="dd-comp-cols">
        <article className="org-sec dd-sec">
          <h2><Labelled icon="session">Whose number it is</Labelled></h2>
          <InlineText value={item.owner} onSave={(v) => onSaveField(item, { owner: v })} can={can}
            label="Owned by" multiline={false} placeholder="A role, or a name"
            empty="Nobody owns this number yet, which usually means nobody moves it." />
          {/* The owner's name is a way THROUGH: their page says what they run and whether a session
              is arranged with them, which is where the question of how this number is defined gets
              booked. A read-only viewer gets the name as the link (InlineSelect would give them a
              dead span); an editor keeps the select, because re-pinning the number in place is the
              point of it, and gets the link beside it under a fixed label so the name is not printed
              twice. Same shape as PersonPage, Reports to. The unit below stays a plain select:
              'unit' has no page to go to. */}
          {owner && !can.can ? (
            <a className="dd-isel-v dd-either-a" href={itemHref(slug, 'person', owner.id)}>{owner.name}</a>
          ) : (
            <>
              <InlineSelect value={item.ownerId || ''} can={can} label="Who that is in the organisation"
                options={[{ id: '', label: 'Not linked to anybody yet' }, ...people]}
                onSave={(v) => onSaveField(item, { ownerId: v || null })} />
              {owner && (
                <a className="dd-either-a dd-isel-go" href={itemHref(slug, 'person', owner.id)}
                  aria-label={`Their page: ${owner.name}`}>Their page</a>
              )}
            </>
          )}
          <InlineSelect value={item.unitId || ''} can={can} label="Which part of the business"
            options={[{ id: '', label: 'Not tied to a team' }, ...units]}
            onSave={(v) => onSaveField(item, { unitId: v || null })} />
        </article>

        <article className="org-sec dd-sec">
          <h2><Labelled icon="target">Where it stands</Labelled></h2>
          {/* Three bare figures in a row read as a puzzle: the label has to be VISIBLE, not
              only in the editor's accessible name. */}
          <dl className="dd-meta">
            <div><dt>Now</dt><dd><InlineText value={item.current == null ? '' : String(item.current)} can={can} multiline={false}
              label="Now" placeholder="16" onSave={(v) => onSaveField(item, { current: v })} /></dd></div>
            <div><dt>Target</dt><dd><InlineText value={item.target == null ? '' : String(item.target)} can={can} multiline={false}
              label="Target" placeholder="20" onSave={(v) => onSaveField(item, { target: v })} /></dd></div>
            <div><dt>Unit</dt><dd><InlineText value={item.unit} can={can} multiline={false}
              label="Unit" placeholder="per day" onSave={(v) => onSaveField(item, { unit: v })} /></dd></div>
          </dl>
          <p className="dd-sub-lead">Better when it goes {item.direction || 'up'}.
            {gap != null && (good ? ' It is where they want it.' : ' It is not there yet.')}</p>
        </article>
      </div>

      <section className="org-sec dd-sec">
        <h2><Labelled icon="evidence">How the number is arrived at</Labelled></h2>
        <InlineText value={item.definition} onSave={(v) => onSaveField(item, { definition: v })} can={can}
          label="How it is calculated" rows={3} placeholder="In their terms, not ours."
          empty="How it is calculated is not recorded. Two people can read one number two ways until it is." />
        <InlineText value={item.measuredBy} onSave={(v) => onSaveField(item, { measuredBy: v })} can={can}
          label="Where the number comes from" multiline={false}
          placeholder="A system, a report, a spreadsheet"
          empty="Where it is read from is not recorded." />
        <InlineText value={item.period} onSave={(v) => onSaveField(item, { period: v })} can={can}
          label="What period it covers" multiline={false}
          placeholder="July to September 2026"
          empty="No period recorded, so nothing says which stretch of time this number is of." />
        <InlineText value={item.population} onSave={(v) => onSaveField(item, { population: v })} can={can}
          label="What is counted, and what is not" rows={2}
          placeholder="Which cases, which teams, which sites, and the exclusions."
          empty="Not recorded. Exclusions are what a later comparison trips on." />
        {item.cadence && (
          <p className="dd-sub-lead">Measured {item.cadence}{item.cadence === 'other' && item.cadenceNote ? `: ${item.cadenceNote}` : ''}.</p>
        )}

        {/* ⚠ TWO NUMBERS CALCULATED DIFFERENTLY ARE NOT AN IMPROVEMENT. A baseline of 8.4 days and a
            later 2.7 days that counted different months, or a different caseload, is not a 68%
            reduction. This does not stop anybody recording the number, which is usually the first
            thing learned; it stops it being treated as a baseline before it can be reproduced. */}
        {!baseline.ok && <p className="dd-nogap">{baseline.why}</p>}

        <dl className="dd-meta">
          <div><dt>How far it can be relied on</dt><dd>
            {MEASURE_CONFIDENCE_MEANS[item.confidence] ? (
              <>{item.confidence} · <span className="dd-prov-none">{MEASURE_CONFIDENCE_MEANS[item.confidence]}</span></>
            ) : item.confidence}
          </dd></div>
          <div><dt>What limits it</dt><dd>
            <InlineText value={item.limitations} onSave={(v) => onSaveField(item, { limitations: v })} can={can}
              label="what limits it" multiline={false}
              placeholder="Seasonality, an exceptional event, incomplete data"
              empty="Nothing recorded. A limited number quietly becomes a solid one when nobody writes down why it is not." />
          </dd></div>
        </dl>
      </section>

      {/* ⚠ WHAT THIS NUMBER IS ACTUALLY FOR. A measure with no opportunity behind it is a dashboard
          entry: it may be interesting, but nothing in the record says why the investigation is
          carrying it or what improving it would mean. */}
      {(measuring.length > 0 || claiming.length > 0) && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="target">What it would show moved</Labelled></h2>
          {measuring.length > 0 && (
            <ul className="dd-list">
              {measuring.map((o) => (
                <li key={o.id}>
                  <strong>{[o.ref, o.name].filter(Boolean).join(' ')}</strong>
                  {o.desiredOutcome && <><br /><span className="dd-prov-none">{o.desiredOutcome}</span></>}
                </li>
              ))}
            </ul>
          )}
          {/* The reverse of BUILDS.kpis: a build says which numbers it should move, and this is
              where that claim is checked against the baseline it claims to shift. */}
          {claiming.length > 0 && (
            <>
              <p className="dd-sub-lead">Proposals claiming to move it:</p>
              <ul className="dd-list">
                {claiming.map((b) => (
                  <li key={b.id}>
                    <a className="dd-either-a" href={itemHref(slug, 'build', b.id)}>
                      {[b.ref, b.name].filter(Boolean).join(' ')}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <section className="org-sec dd-sec">
        <h2><Labelled icon="link">What moves it</Labelled></h2>
        <p className="dd-sub-lead">The processes, questions and other numbers this one answers to.
          A change we propose should be traceable to a number it shifts.</p>
        {(item.affectedBy || []).length === 0
          ? <p className="dd-sub-lead dd-covgap">Nothing is linked to it yet, so no proposal can claim to move it.</p>
          : <ul className="dd-list">
              {item.affectedBy.map((id) => <li key={id}><RefLink plan={plan} slug={slug} id={id} /></li>)}
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
