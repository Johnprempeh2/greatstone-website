// Bulk CSV import/export (catalogue admin). Export offerings → edit in Excel → re-import with a
// dry-run diff → apply (writes via the authenticated client, staff_all RLS). Pure logic in bulkCsv.mjs.
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.mjs';
import { offeringsToCsv, csvToObjects, diffOfferings, changesToPatch } from './bulkCsv.mjs';

export default function BulkImport({ staff }) {
  const [current, setCurrent] = useState([]);
  const [diff, setDiff] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [fileName, setFileName] = useState('');

  const load = () => supabase.from('offerings')
    .select('id,slug,name,status,featured,short_description,type,vendor:vendors(name),category:categories(name)')
    .order('name').limit(1000).then(({ data }) => setCurrent(data || []));
  useEffect(() => { load(); }, []);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 3200); };

  const exportCsv = () => {
    const blob = new Blob([offeringsToCsv(current)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'greatstone-offerings.csv'; a.click();
    URL.revokeObjectURL(url);
  };
  const onFile = async (e) => {
    const f = e.target.files[0]; if (!f) return; setFileName(f.name);
    try { setDiff(diffOfferings(csvToObjects(await f.text()), current)); }
    catch (err) { flash('Could not parse that CSV.'); console.error(err); }
  };
  const apply = async () => {
    if (!diff || !diff.updates.length) return;
    setBusy(true); let ok = 0, fail = 0;
    for (const u of diff.updates) {
      const { error } = await supabase.from('offerings').update(changesToPatch(u.changes)).eq('id', u.id);
      if (error) { fail++; console.error('bulk update', u.slug, error); } else ok++;
    }
    setBusy(false); setDiff(null); setFileName('');
    flash('Applied ' + ok + ' update' + (ok === 1 ? '' : 's') + (fail ? ' (' + fail + ' failed)' : '') + '.'); load();
  };

  return (
    <div className="pr-admin">
      <div className="bk-grid">
        <div className="pr-form">
          <h2>Export</h2>
          <p className="ca-note">Download all {current.length} offerings as a CSV, edit data points (name, short description, status, featured) in Excel, then re-import. <b>slug</b> is the match key — don't change it. Vendor/category/type columns are reference-only.</p>
          <button className="gs-btn ghost" onClick={exportCsv}>Export offerings CSV</button>
        </div>
        <div className="pr-form">
          <h2>Import</h2>
          <p className="ca-note">Upload your edited CSV. You'll see a dry-run diff before anything is saved.</p>
          <label className="bk-file"><input type="file" accept=".csv,text/csv" onChange={onFile} /><span>{fileName || 'Choose CSV…'}</span></label>
        </div>
      </div>

      {diff && (
        <div className="bk-diff">
          <h2>Dry run{fileName ? ' · ' + fileName : ''}</h2>
          <p className="pr-affects"><b>{diff.updates.length}</b> to update · {diff.unchanged.length} unchanged · <span className={diff.errors.length ? 'bk-errn' : ''}>{diff.errors.length} error{diff.errors.length === 1 ? '' : 's'}</span></p>
          {diff.errors.length > 0 && <ul className="bk-errs">{diff.errors.slice(0, 12).map((e, i) => <li key={i}>{e.slug || '(no slug)'}: {e.reason}</li>)}</ul>}
          <div className="ca-table-wrap"><table className="ca-table">
            <thead><tr><th>Slug</th><th>Changes</th></tr></thead>
            <tbody>
              {diff.updates.slice(0, 80).map(u => (
                <tr key={u.slug}><td className="ca-name">{u.slug}</td>
                  <td>{Object.entries(u.changes).map(([f, c]) => <div key={f} className="bk-chg"><b>{f}</b>: <s>{String(c.from)}</s> → {String(c.to)}</div>)}</td></tr>
              ))}
              {!diff.updates.length && <tr><td colSpan="2" className="ca-muted">No changes to apply.</td></tr>}
            </tbody>
          </table></div>
          <div className="ca-drawer-foot" style={{ marginTop: 14 }}>
            <button className="gs-btn ghost" onClick={() => { setDiff(null); setFileName(''); }}>Cancel</button>
            <button className="gs-btn primary" onClick={apply} disabled={busy || !diff.updates.length}>{busy ? 'Applying…' : 'Apply ' + diff.updates.length + ' update' + (diff.updates.length === 1 ? '' : 's')}</button>
          </div>
        </div>
      )}
      {toast && <div className="ca-toast" role="status">{toast}</div>}
    </div>
  );
}
