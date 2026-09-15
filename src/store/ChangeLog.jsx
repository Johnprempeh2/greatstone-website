// What changed, said once.
//
// Four screens each had their own copy of "turn a log entry into a sentence", and they had already
// drifted: three said "Portal" where the trail now names a person, one printed the raw field key
// (`howToday changed`), and one printed `added changed` for an item being added. A log is the one
// surface where every screen must say the same thing about the same event, so it says it here.
import React from 'react';
import { STATUS, whoDid } from './deepdive-state.mjs';
import { FINDING_STATE } from '../data/deepdive-findings.mjs';
import { Icon } from './DeepDiveIcons.jsx';

// A field's name in English. Splitting a camelCase key gives "how today", which is a variable name
// wearing a space rather than something a person would say.
export const FIELD_WORD = {
  howToday: 'how it works today', whoRuns: 'who runs it', speakTo: 'who we speak to',
  pains: 'what is already named', opens: 'what we establish', feeds: 'what it hands to',
  steps: 'what happens inside it', offerings: 'which offerings it serves', num: 'its number',
  group: 'its band', q: 'the question', certainty: 'certainty', why: 'why it matters',
  route: 'how it gets answered', subset: 'the area', ref: 'its reference', mergedFrom: 'what merged into it',
  item: 'what we need', held: 'what we hold', missing: 'what is missing',
  provenance: 'how we know it', provenanceKind: 'how we know it', processes: 'which processes it bears on',
  link: 'the link to it', located: 'where it lives', record: 'the record of it', recordNote: 'where the record lives',
  person: 'who', only: 'what only they can give', objectives: 'the objectives', covers: 'the questions it covers',
  minutes: 'the estimated length', materials: 'what to bring', context: 'the context', opening: 'how to open',
  role: 'why this person', notHere: 'what is not asked here', output: 'what it produces',
  method: 'how it is run', priority: 'its priority',
  sourceType: 'what kind of source', gives: 'what it can tell us', access: 'how we reach it', owner: 'who controls it',
  scope: 'whose number', unit: 'the unit', current: 'where it is now', target: 'where it needs to be',
  direction: 'which way is good', cadence: 'how often it is measured', definition: 'how it is calculated',
  measuredBy: 'where the number comes from', affectedBy: 'what moves it',
  claim: 'the claim', grounds: 'the grounds', kills: 'what would kill it', confirms: 'what would confirm it',
  test: 'how it is tested', ifWrong: 'what changes if it is false', verdict: 'the verdict', bearsOn: 'what it bears on',
  evidence: 'what we found', overlaps: 'where they meet the client', source: 'where we found it',
  alias: 'what the client calls it', what: 'what it is', who: 'who buys it', state: 'where it stands',
  name: 'its name', note: 'the note', pillars: 'the pillars', pillar: 'its pillar', from: 'what it follows',
  alsoPillars: 'the other pillars it belongs to', sessionIds: 'the sessions it is tied to',
  client: 'the client', title: 'the title', sponsor: 'the sponsor', stage: 'the stage',
  follows: 'what it follows', accessNote: 'the access note', lead: 'the lead line', outcomes: 'the outcomes',
  agreement: 'the agreement across accounts',

  // ⚠ FIFTY-SIX FIELDS FELL THROUGH TO THE CAMEL-CASE FALLBACK, which is the exact fault the header
  // of this file describes: `stateWhy` read as "state why changed", a variable name wearing a space.
  // Whole kinds were missing, so every change to a proposed build, a person or a unit was logged in
  // developer vocabulary. The test below now refuses a field with no English behind it.

  // links to another record, said as the relationship rather than the id
  whoRunsId: 'who runs it', speakToIds: 'who we speak to', unitId: 'which part of the business',
  personId: 'the person', ownerId: 'who owns it', leadId: 'who leads it', reportsTo: 'who they report to',
  parent: 'what it sits under', worksWith: 'who they work with',
  opportunityId: 'the opportunity it serves', buildId: 'the initiative it assesses',
  fromFindings: 'the findings behind it', dependsOn: 'what must exist first', kpis: 'the numbers it should move',

  // where a box sits on the canvas. Both keys, one idea: nobody says "y changed".
  x: 'where it sits on the canvas', y: 'where it sits on the canvas',

  // the evidence record's second axis, and what makes an outstanding item a gap
  vstate: 'whether we have assessed it', whyItMatters: 'why it matters',
  impactIfUnresolved: 'what happens if we never get it',

  // people and the shape of the business
  side: 'which side they are on', email: 'their email', accountEmail: 'their sign-in',
  unitType: 'what kind of unit', headcount: 'the headcount', does: 'what it does',
  hours: 'how long it takes', fate: 'what becomes of it', cadenceNote: 'how often, in words',
  logo: 'their mark',

  // a proposed initiative
  stateWhy: 'why it stands there', forWhom: 'who would use it', replaces: 'what it takes out',
  touches: 'which steps it changes', needs: 'what it needs', unknowns: 'what we still have to find out',
  options: 'the options', problems: 'the problems', blockers: 'what is blocking it',
  roi: 'what it is worth', effort: 'the effort we judged', impact: 'the impact we judged',
  foundational: 'whether other things depend on it', decisions: 'the decisions taken on it',
  demoKind: 'what can be shown', demoLink: 'the link to the demo', demoNote: 'what the demo shows',

  // the opportunity, and what delivering it would take
  statement: 'the opportunity', rootCause: 'why it happens', desiredOutcome: 'what has to get better',
  potentialValue: 'what it could be worth', baselineRequired: 'whether a baseline is needed',
  dimensions: 'the complexity dimensions', interactions: 'where factors compound',
  preconditions: 'what would make it easier', risks: 'the risks carried',
  uncertainty: 'what is still not known',

  // the measurement definition, which is what makes a number reproducible rather than merely recorded
  period: 'what period it covers', population: 'what is counted',
  limitations: 'what limits it', confidence: 'how far it can be relied on',
};

const quote = (t) => `“${String(t).length > 70 ? String(t).slice(0, 70) + '…' : t}”`;

/** One change, in a sentence. */
export function sayChange(k, v) {
  const [from, to] = Array.isArray(v) ? v : [null, v];
  if (k === 'added') return 'added to the record';
  if (k === 'removed') return 'removed from the record';
  if (k === 'released') return `status released, ${to}`;
  if (k === 'status') return `${STATUS[from]?.label || from || 'nothing'} to ${STATUS[to]?.label || to}`;
  if (k === 'visibility') return to === 'shared' ? 'shared with the client' : 'made internal';
  if (k === 'note') return to ? 'note added' : 'note cleared';
  if (k === 'validation') return `${FINDING_STATE[from]?.label || from} to ${FINDING_STATE[to]?.label || to}`;
  if (k === 'finding') {
    if (from && to) return `finding replaced: ${quote(from)} became ${quote(to)}`;
    return to ? `finding recorded: ${quote(to)}` : `finding removed: ${quote(from)}`;
  }
  if (k === 'file') return to ? `document attached: ${to}` : `document detached: ${from}`;
  const nice = FIELD_WORD[k] || k.replace(/([A-Z])/g, ' $1').toLowerCase();
  if (!from && to) return `${nice} filled in`;
  if (from && !to) return `${nice} cleared`;
  return `${nice} changed`;
}

export const sayEntry = (e) => Object.entries(e.changed || {}).map(([k, v]) => sayChange(k, v)).join(' · ');

/** Who made it, as a chip. Claude takes the teal this portal already uses for something recorded;
 *  a person stays quiet. Never lime: the accent is reserved for what is still being asked. */
export const Who = ({ entry }) => (
  <span className={`dd-log-who${entry.by === 'mcp' ? ' is-mcp' : ''}`}>
    {entry.by === 'mcp' ? Icon.proposed({ size: 13 }) : Icon.session({ size: 13 })}
    {whoDid(entry)}
  </span>
);

/* ⚠ An em dash here broke John's standing style rule in the History tab, and the dash gate never
   saw it because its file list named twelve components and the portal renders thirty eight. Words
   are also the better answer: a dash leaves the reader guessing whether the entry has no time or a
   time nobody could read. */
const when = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'no date'
    : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

/** One item's own history: what happened to this thing, newest last, and who did it. */
export default function ChangeLog({ entries, empty = 'Nothing yet.' }) {
  if (!entries?.length) return <p className="ca-note">{empty}</p>;
  return (
    <ol className="dd-log">
      {entries.map((e, i) => (
        <li key={`${e.at}-${i}`} className="dd-log-row">
          <time className="dd-log-when" dateTime={e.at}>{when(e.at)}</time>
          <div className="dd-log-main"><p>{sayEntry(e)}</p></div>
          <Who entry={e} />
        </li>
      ))}
    </ol>
  );
}
