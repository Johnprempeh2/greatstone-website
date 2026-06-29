import { useState } from 'react';
import PanelFrame from './PanelFrame.jsx';

// Content inventory (content-analytics): a read-only, SORTABLE dashboard — one row per page with word
// count, est. read time, block count, words/block, status, and advisory THIN / SKELETON / BULK chips,
// plus a site summary. Always populated (not a defect audit). App owns analyzeContent(state); this only
// renders + sorts. WCAG-AA sortable table: native <table>, <th scope=col>, aria-sort, focusable sort
// buttons, a visible <caption>, horizontal-scroll wrapper. Reuses existing pill/status classes (no new pill).
const COLS = [
  { key: 'title', label: 'Page', type: 'str' },
  { key: 'status', label: 'Status', type: 'str' },
  { key: 'words', label: 'Words', type: 'num' },
  { key: 'readMins', label: 'Read', type: 'num' },
  { key: 'blocks', label: 'Blocks', type: 'num' },
  { key: 'wordsPerBlock', label: 'Words/block', type: 'num' },
];

export default function ContentInventoryPanel({ report, onOpen, onClose, embedded }) {
  const rows = (report && report.rows) || [];
  const summary = (report && report.summary) || { pages: 0, totalWords: 0, totalReadMins: 0, medianWords: 0, thinCount: 0 };
  const [sortKey, setSortKey] = useState('words');
  const [dir, setDir] = useState('asc'); // thinnest-first by default = the actionable view

  const onSort = (key) => {
    if (key === sortKey) { setDir((d) => (d === 'asc' ? 'desc' : 'asc')); return; }
    setSortKey(key); setDir('asc');
  };
  const col = COLS.find((c) => c.key === sortKey) || COLS[0];
  const sorted = [...rows].sort((a, b) => {
    if (col.type === 'num') { const d = (a[sortKey] || 0) - (b[sortKey] || 0); return dir === 'asc' ? d : -d; }
    const av = String(a[sortKey] || '').toLowerCase(), bv = String(b[sortKey] || '').toLowerCase();
    return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  return (
    <PanelFrame embedded={embedded} label={<>Content inventory {summary.pages ? <span className="gs-panel-count">{summary.pages}</span> : null}</>} name="Content inventory" onClose={onClose}>
      <div className="gs-panel-body">
        <p className="gs-field-hint" style={{ marginTop: 0 }}>
          How much substance each page carries — words, estimated read time and structure, sortable by any
          column. <strong>Thin</strong> = under 120 words (barely started). <strong>Skeleton</strong> = many
          blocks, little prose. <strong>Bulk</strong> = one block is most of the page. Advisory only.
        </p>

        {rows.length === 0 ? (
          <p className="gs-la-clean" role="status">No pages yet.</p>
        ) : (
          <>
            <p className="gs-cs-sub" style={{ margin: '0 0 14px' }}>
              {summary.pages} pages · {summary.totalWords.toLocaleString()} words · ~{summary.totalReadMins} min total · median {summary.medianWords} · {summary.thinCount} thin
            </p>
            <div className="gs-inv-tablewrap">
              <table className="gs-inv-table">
                <caption className="gs-sr-only">Content inventory — {summary.pages} pages, sortable by column.</caption>
                <thead>
                  <tr>
                    {COLS.map((c) => (
                      <th key={c.key} scope="col" aria-sort={sortKey === c.key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button type="button" className="gs-inv-sort" onClick={() => onSort(c.key)}>
                          {c.label}<span className="gs-inv-arrow" aria-hidden="true">{sortKey === c.key ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</span>
                        </button>
                      </th>
                    ))}
                    <th scope="col"><span className="gs-inv-th">Flags</span></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.slug}>
                      <td>
                        {onOpen ? <button type="button" className="gs-inv-link" onClick={() => onOpen(r.slug)}>{r.title}</button> : r.title}
                        <span className="gs-inv-slug"> /{r.slug === 'home' ? '' : r.slug}</span>
                      </td>
                      <td><span className={'gs-page-status gs-st-' + r.status}><span className="gs-dot" />{r.status}</span></td>
                      <td className="gs-inv-num">{r.words.toLocaleString()}</td>
                      <td className="gs-inv-num">{r.readMins} min</td>
                      <td className="gs-inv-num">{r.blocks}</td>
                      <td className="gs-inv-num">{r.wordsPerBlock}</td>
                      <td>
                        {r.thin ? <span className="gs-la-pill is-changed" title="Under 120 words — barely started.">Thin</span> : null}
                        {r.skeleton ? <span className="gs-la-pill is-changed" title="4+ blocks but little prose.">Skeleton</span> : null}
                        {r.bulk ? <span className="gs-la-pill is-orphan" title={'One block (' + (r.maxBlockType || 'a block') + ') is most of this page.'}>Bulk</span> : null}
                        {!r.thin && !r.skeleton && !r.bulk ? <span className="gs-inv-ok" aria-label="No flags">—</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </PanelFrame>
  );
}
