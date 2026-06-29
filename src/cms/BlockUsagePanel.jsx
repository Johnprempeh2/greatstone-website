import { useState } from 'react';
import PanelFrame from './PanelFrame.jsx';

// Block usage (composition analytics): a read-only, SORTABLE table of every registered block type — how
// many pages use it, where, and which are UNUSED (registered but never placed). Orthogonal to Content
// inventory (word counts). App owns analyzeBlocks(state, knownTypes, categories); this renders + sorts.
// WCAG-AA sortable <table> (aria-sort, th scope=col, focusable sort buttons, sr-only caption). Reuses gs-inv-*.
const COLS = [
  { key: 'type', label: 'Block', type: 'str' },
  { key: 'category', label: 'Category', type: 'str' },
  { key: 'instances', label: 'Instances', type: 'num' },
  { key: 'pageCount', label: 'Pages', type: 'num' },
];

export default function BlockUsagePanel({ report, onOpen, onClose, embedded }) {
  const rows = (report && report.rows) || [];
  const extras = (report && report.extras) || [];
  const summary = (report && report.summary) || { knownTypes: 0, usedTypes: 0, unusedTypes: 0, totalInstances: 0, pages: 0, mostCommon: '', leastCommon: '' };
  const [sortKey, setSortKey] = useState('instances');
  const [dir, setDir] = useState('desc'); // most-used first

  const onSort = (key) => {
    if (key === sortKey) { setDir((d) => (d === 'asc' ? 'desc' : 'asc')); return; }
    setSortKey(key); setDir(key === 'instances' || key === 'pageCount' ? 'desc' : 'asc');
  };
  const col = COLS.find((c) => c.key === sortKey) || COLS[0];
  const sorted = [...rows].sort((a, b) => {
    if (col.type === 'num') { const d = (a[sortKey] || 0) - (b[sortKey] || 0); return dir === 'asc' ? d : -d; }
    const av = String(a[sortKey] || '').toLowerCase(), bv = String(b[sortKey] || '').toLowerCase();
    return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  });
  const unused = rows.filter((r) => r.unused);
  const pageLinks = (slugs) => (slugs.length === 0 ? <span className="gs-inv-ok">—</span> : slugs.map((slug, i) => (
    <span key={slug}>{i ? ', ' : ''}{onOpen ? <button type="button" className="gs-inv-link" onClick={() => onOpen(slug)}>{slug}</button> : slug}</span>
  )));

  return (
    <PanelFrame embedded={embedded} label={<>Block usage {summary.knownTypes ? <span className="gs-panel-count">{summary.usedTypes}/{summary.knownTypes}</span> : null}</>} name="Block usage" onClose={onClose}>
      <div className="gs-panel-body">
        <p className="gs-field-hint" style={{ marginTop: 0 }}>
          Which content blocks the site is built from — how often each is used, on which pages, and which
          registered blocks are never placed. Advisory composition view; it never changes anything.
        </p>
        {rows.length === 0 ? (
          <p className="gs-la-clean" role="status">No block types registered.</p>
        ) : (
          <>
            <p className="gs-cs-sub" style={{ margin: '0 0 12px' }}>
              {summary.usedTypes}/{summary.knownTypes} block types used · {summary.unusedTypes} unused · {summary.totalInstances} placements{summary.mostCommon ? ' · most-used ' + summary.mostCommon : ''}{summary.leastCommon ? ' · least-used ' + summary.leastCommon : ''}
            </p>
            {unused.length ? (
              <p style={{ margin: '0 0 14px', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: '.78rem', fontWeight: 700 }}>Never placed:</span>
                {unused.map((u) => <span key={u.type} className="gs-la-pill is-orphan" title="Registered but used on no page">{u.type}</span>)}
              </p>
            ) : null}
            <div className="gs-inv-tablewrap">
              <table className="gs-inv-table">
                <caption className="gs-sr-only">Block usage — {summary.knownTypes} registered types, sortable by column.</caption>
                <thead>
                  <tr>
                    {COLS.map((c) => (
                      <th key={c.key} scope="col" aria-sort={sortKey === c.key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button type="button" className="gs-inv-sort" onClick={() => onSort(c.key)}>{c.label}<span className="gs-inv-arrow" aria-hidden="true">{sortKey === c.key ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</span></button>
                      </th>
                    ))}
                    <th scope="col"><span className="gs-inv-th">Used on</span></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.type}>
                      <td>{r.type}{r.unused ? <span className="gs-la-pill is-orphan" style={{ marginLeft: 8 }}>Unused</span> : null}</td>
                      <td>{r.category || '—'}</td>
                      <td className="gs-inv-num">{r.instances}</td>
                      <td className="gs-inv-num">{r.pageCount}</td>
                      <td>{pageLinks(r.pages)}</td>
                    </tr>
                  ))}
                  {extras.map((r) => (
                    <tr key={r.type}>
                      <td>{r.type} <span className="gs-la-pill is-recoverable" title="Placed on a page but not a registered block type">Unregistered</span></td>
                      <td>—</td>
                      <td className="gs-inv-num">{r.instances}</td>
                      <td className="gs-inv-num">{r.pageCount}</td>
                      <td>{pageLinks(r.pages)}</td>
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
