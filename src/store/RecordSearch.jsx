// Finding one thing in a record of 154 items.
//
// The portal grew twelve tabs, which is a taxonomy: it answers "show me the questions" and cannot
// answer "where is the one about master datasets". Those are different needs, and a practitioner
// mid-engagement almost always has the second. So this searches by WORD across every kind at once
// and goes straight to the thing, rather than to the category it happens to live in.
//
// Deliberately not bound to Cmd+K: the site's own admin command palette owns that, and quietly
// stealing a shortcut somebody already learned is worse than not having one.
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { itemHref, ITEM_KINDS } from '../lib/deepdive-route.mjs';
import { Icon } from './DeepDiveIcons.jsx';

// Which fields of each kind are worth matching on, and what to show when one hits. Searching every
// field would match the boilerplate in a process description and bury the thing being looked for.
const SHAPES = {
  question:   { label: 'Question',   fields: ['q', 'why', 'note', 'ref', 'subset'], title: (x) => x.q, sub: (x) => x.pillar },
  // num is searchable now that it is no longer painted on every row: the number stops being
  // decoration at the same moment it becomes a way to find something.
  process:    { label: 'Process',    fields: ['name', 'howToday', 'whoRuns', 'num'], title: (x) => x.name, sub: (x) => (x.num ? `${x.group} · ${x.num}` : x.group) },
  evidence:   { label: 'Evidence',   fields: ['item', 'held', 'missing', 'provenance'], title: (x) => x.item, sub: (x) => x.state },
  session:    { label: 'Session',    fields: ['person', 'only', 'role', 'output'], title: (x) => x.person, sub: (x) => x.role || x.only },
  // A person is findable whether or not anybody is interviewing them. Searching a name used to find
  // at best a session titled with it, and somebody nobody has scheduled could not be found at all.
  person:     { label: 'Person',     fields: ['name', 'role', 'email'], title: (x) => x.name, sub: (x) => x.role },
  // A unit has no page by design (the chart is the surface), so a hit lands on the Organisation
  // tab. ref is what the org calls it (OPS), searchable for the same reason a process number is.
  unit:       { label: 'Unit',       fields: ['name', 'ref', 'does'], title: (x) => x.name, sub: (x) => x.does || x.ref },
  hypothesis: { label: 'Hypothesis', fields: ['claim', 'ref', 'grounds', 'kills'], title: (x) => x.claim, sub: (x) => `${x.ref} · ${x.group}` },
  competitor: { label: 'Competitor', fields: ['name', 'evidence', 'overlaps'], title: (x) => x.name, sub: (x) => x.overlaps },
  source:     { label: 'Source',     fields: ['name', 'gives', 'owner'], title: (x) => x.name, sub: (x) => x.gives },
  kpi:        { label: 'KPI',        fields: ['name', 'definition', 'owner'], title: (x) => x.name, sub: (x) => x.scope },
  offering:   { label: 'Offering',   fields: ['name', 'alias', 'what', 'who', 'note', 'ref'], title: (x) => x.name, sub: (x) => (x.alias ? `they call it ${x.alias}` : x.state) },
  // What the GITA proposed. Searchable by what it would take out and by what we still cannot
  // answer, because those are the words somebody actually remembers about a proposal.
  build:      { label: 'Proposed build', fields: ['name', 'what', 'replaces', 'ref', 'forWhom'], title: (x) => x.name, sub: (x) => x.state },
};

// ⚠ EVERY VALUE HERE MUST BE A REAL TAB ID. A tab id nothing matches renders NO panel and selects
// NO tab, which blanks the whole record (that bug has happened once already, after the thirteen
// tabs became nine). Only kinds WITHOUT a page belong here: every other searched kind is in
// ITEM_KINDS and go() routes it to its own page. Offering lands on Processes; unit lands on
// Organisation, the surface that holds the chart.
const TAB_FOR = { offering: 'processes', unit: 'org' };

function rows(plan) {
  const out = [];
  const push = (kind, item, extra = {}) => out.push({ kind, item: { ...item, ...extra } });
  (plan.PROCESSES || []).forEach((x) => push('process', x));
  (plan.QUESTIONS || []).forEach((g) => (g.items || []).forEach((q) => push('question', q, { pillar: g.pillar })));
  (plan.EVIDENCE || []).forEach((x) => push('evidence', x));
  (plan.SESSIONS || []).forEach((x) => push('session', x));
  (plan.PEOPLE || []).forEach((x) => push('person', x));
  (plan.UNITS || []).forEach((x) => push('unit', x));
  (plan.HYPOTHESES || []).forEach((x) => push('hypothesis', x));
  (plan.COMPETITORS || []).forEach((x) => push('competitor', x));
  (plan.SOURCES || []).forEach((x) => push('source', x));
  (plan.KPIS || []).forEach((x) => push('kpi', x));
  (plan.OFFERINGS || []).forEach((x) => push('offering', x));
  (plan.BUILDS || []).forEach((x) => push('build', x));
  return out;
}

// Every word must appear somewhere, in any order, so "master data" finds "where the master datasets
// rest" without the searcher having to guess the phrasing.
function score(hay, terms) {
  let n = 0;
  for (const t of terms) {
    const i = hay.indexOf(t);
    if (i < 0) return 0;
    n += i < 40 ? 3 : 1;          // an early hit is usually the subject rather than an aside
  }
  return n;
}

export default function RecordSearch({ slug, plan, onJump }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const box = useRef(null);
  const all = useMemo(() => rows(plan), [plan]);

  // "/" focuses, the way it does in most tools, and only when you are not already typing somewhere.
  useEffect(() => {
    const onKey = (e) => {
      const inField = /^(input|textarea|select)$/i.test(document.activeElement?.tagName || '');
      if (e.key === '/' && !inField && !e.metaKey && !e.ctrlKey) { e.preventDefault(); box.current?.focus(); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const hits = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
    if (!terms.length) return [];
    return all
      .map((r) => {
        const shape = SHAPES[r.kind];
        const hay = shape.fields.map((f) => String(r.item[f] || '')).join(' ').toLowerCase();
        return { ...r, shape, n: score(hay, terms) };
      })
      .filter((r) => r.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 24);
  }, [q, all]);

  useEffect(() => { setActive(0); }, [q]);

  const go = (r) => {
    setQ('');
    // Every routable kind lands on ITS OWN page, not the tab that holds it: searching the process
    // named on a KPI page should end on that process, not on nine processes and a memory test.
    // This is also what makes the search work on item pages, which mount it without onJump.
    if (ITEM_KINDS.includes(r.kind)) { location.hash = itemHref(slug, r.kind, r.item.id).slice(1); return; }
    // The searched kinds with no page of their own (offering, unit): land on the tab that holds
    // them rather than nowhere.
    if (onJump && TAB_FOR[r.kind]) onJump(TAB_FOR[r.kind]);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setQ(''); box.current?.blur(); return; }
    if (!hits.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % hits.length); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + hits.length) % hits.length); }
    if (e.key === 'Enter') { e.preventDefault(); go(hits[active]); }
  };

  return (
    <div className="dd-search">
      <label className="dd-search-box">
        <span className="gs-sr-only">Search this record</span>
        <span className="dd-search-i" aria-hidden="true">{Icon.question({ size: 15 })}</span>
        <input ref={box} type="search" value={q} placeholder={`Search ${all.length} items…  /`}
          autoComplete="off" spellCheck="false"
          onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
          role="combobox" aria-expanded={hits.length > 0} aria-controls="dd-search-hits"
          aria-activedescendant={hits.length ? `dd-hit-${active}` : undefined} />
        {q && <button type="button" className="dd-search-x" onClick={() => { setQ(''); box.current?.focus(); }}>Clear<span className="gs-sr-only"> the search</span></button>}
      </label>

      {q.trim().length > 1 && (
        <div className="dd-search-out" id="dd-search-hits" role="listbox" aria-label="Results">
          {hits.length === 0 ? (
            <p className="dd-search-none">Nothing matches “{q}”.</p>
          ) : hits.map((r, i) => (
            <button key={r.item.id} id={`dd-hit-${i}`} type="button" role="option"
              aria-selected={i === active}
              className={`dd-hit${i === active ? ' is-active' : ''}`}
              onMouseEnter={() => setActive(i)} onClick={() => go(r)}>
              <span className="dd-hit-kind">{r.shape.label}</span>
              <span className="dd-hit-t">{r.shape.title(r.item)}</span>
              {r.shape.sub(r.item) && <span className="dd-hit-s">{r.shape.sub(r.item)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
