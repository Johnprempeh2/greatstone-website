import { useState } from 'react';
import PanelFrame from './PanelFrame.jsx';
import { diffVersions } from '../lib/version-diff.mjs';
// Version history: every publish snapshots the page. Restore rolls the editor back to any snapshot
// (which you then re-publish), so a bad edit is never more than two clicks from undone. Compare shows
// exactly what a restore would change — per row (snapshot vs the current draft) or between any two
// snapshots — so restoring is an informed decision, not a blind leap. Interim store is localStorage.
const DRAFT = '__draft__';

function when(ts) {
  const d = new Date(ts);
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
  if (diff < 86400) return Math.floor(diff / 3600) + ' h ago';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function fieldText(f) {
  if (f.kind === 'array') return f.path + ': ' + f.summary;
  if (f.kind === 'added') return f.path + ' added';
  if (f.kind === 'cleared') return f.path + ' cleared';
  return f.path + ' changed';
}

// the shared diff renderer — a grouped, screen-reader-friendly summary with text+colour pills
function DiffView({ diff, labelFor }) {
  const lbl = (t) => (labelFor && labelFor(t)) || t;
  if (!diff.counts.total) {
    return (
      <p className="gs-vdiff-clean" role="status">No content changes — these two versions are identical.
        <span className="gs-vdiff-foot"> The 3D background and SEO settings aren’t part of a snapshot, so those could still differ.</span>
      </p>
    );
  }
  const grp = (title, kind, items, render) => items.length ? (
    <div className="gs-vdiff-grp">
      <h4 className="gs-vdiff-h"><span className={'gs-la-pill is-' + kind}>{title}</span> <span className="gs-vdiff-n">{items.length}</span></h4>
      <ul className="gs-vdiff-list">{items.map(render)}</ul>
    </div>
  ) : null;
  return (
    <div className="gs-vdiff">
      {diff.titleChanged && (
        <p className="gs-vdiff-titlerow"><span className="gs-la-pill is-changed">Title</span> “{diff.titleChanged.from || '(none)'}” → “{diff.titleChanged.to || '(none)'}”</p>
      )}
      {grp('Added', 'added', diff.added, (b) => <li key={b.id}>{lbl(b.type)}</li>)}
      {grp('Removed', 'removed', diff.removed, (b) => <li key={b.id}>{lbl(b.type)}</li>)}
      {grp('Moved', 'moved', diff.moved, (b) => <li key={b.id}>{lbl(b.type)}</li>)}
      {grp('Edited', 'changed', diff.changed, (b) => (
        <li key={b.id}>{lbl(b.type)}
          <ul className="gs-vdiff-fields">{b.fields.map((f, i) => <li key={i}>{fieldText(f)}</li>)}</ul>
        </li>
      ))}
      <p className="gs-vdiff-foot">Compares page content only — the 3D background and SEO settings aren’t part of a snapshot.</p>
    </div>
  );
}

export default function VersionHistory({ versions = [], current, labelFor, onRestore, onClose, embedded }) {
  const hasDraft = !!current;
  const idOf = (v) => String(v.id || v.ts);
  // selectable = the live draft (a pseudo-version) + every snapshot; the draft is excluded from the
  // From/To defaults so the compare-two mode never opens on a pointless draft-vs-draft.
  const selectable = [...(hasDraft ? [{ id: DRAFT, label: 'Current draft (unsaved)', data: current, draft: true }] : []), ...versions];
  const canCompareTwo = selectable.length >= 2;
  const [openRow, setOpenRow] = useState(null);
  const [fromId, setFromId] = useState(versions[0] ? idOf(versions[0]) : DRAFT);
  const [toId, setToId] = useState(hasDraft ? DRAFT : (versions[1] ? idOf(versions[1]) : DRAFT));
  const dataOf = (id) => { const v = selectable.find((x) => idOf(x) === String(id)); return v ? v.data : null; };
  const optLabel = (v) => v.draft ? v.label : (v.label || 'Published') + ' · ' + when(v.ts);

  return (
    <PanelFrame embedded={embedded} label="Version history" onClose={onClose}>
      <div className="gs-panel-body">
        {versions.length === 0 && <p className="gs-empty">No snapshots yet. Publishing the page saves one here.</p>}

        {canCompareTwo && (
          <section className="gs-vdiff-compare" aria-label="Compare two versions">
            <div className="gs-vdiff-pick">
              <label>From <select value={fromId} onChange={(e) => setFromId(e.target.value)}>{selectable.map((v) => <option key={idOf(v)} value={idOf(v)}>{optLabel(v)}</option>)}</select></label>
              <span className="gs-vdiff-arrow" aria-hidden="true">→</span>
              <label>To <select value={toId} onChange={(e) => setToId(e.target.value)}>{selectable.map((v) => <option key={idOf(v)} value={idOf(v)}>{optLabel(v)}</option>)}</select></label>
            </div>
            <DiffView diff={diffVersions(dataOf(fromId), dataOf(toId))} labelFor={labelFor} />
          </section>
        )}

        <ol className="gs-versions">
          {versions.map((v, i) => {
            const rid = idOf(v);
            const isOpen = String(openRow) === rid;
            const regionId = 'gs-vdiff-' + rid;
            return (
              <li className="gs-version" key={rid}>
                <div className="gs-version-dot" aria-hidden="true" />
                <div className="gs-version-main">
                  <div className="gs-version-top">
                    <span className="gs-version-label">{v.label || 'Published'}</span>
                    {i === 0 && <span className="gs-version-tag">latest</span>}
                  </div>
                  <div className="gs-version-when">{when(v.ts)}{v.by ? ' · ' + v.by : ''}</div>
                  {isOpen && hasDraft && (
                    <div className="gs-version-diff" id={regionId}>
                      <p className="gs-vdiff-cap">Changes from this snapshot to your current draft:</p>
                      <DiffView diff={diffVersions(v.data, current)} labelFor={labelFor} />
                    </div>
                  )}
                </div>
                <div className="gs-version-acts">
                  {hasDraft && (
                    <button className="gs-btn ghost sm" aria-expanded={isOpen} aria-controls={regionId}
                      aria-label={(isOpen ? 'Hide comparison of' : 'Compare') + ' the ' + (v.label || 'snapshot') + ' from ' + when(v.ts) + ' with the current draft'}
                      onClick={() => setOpenRow(isOpen ? null : rid)}>{isOpen ? 'Hide' : 'Compare'}</button>
                  )}
                  <button className="gs-btn ghost sm" onClick={() => onRestore(v)} aria-label={'Restore the ' + (v.label || 'snapshot') + ' from ' + when(v.ts)}>Restore</button>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </PanelFrame>
  );
}
