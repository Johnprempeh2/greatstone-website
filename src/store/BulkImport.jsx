// Bulk SKU price-book import (catalogue admin). Export the catalogue as a SKU CSV, edit USD prices /
// add new SKUs in Excel, re-import: SKU is the match key. A pre-commit preview reports records,
// matching / new / invalid / duplicate SKUs + a field-level diff; nothing is written until you commit.
// Prices are USD; GBP recalculates automatically from the live FX rate (no GBP is ever written here).
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.mjs';
import { variantsToSkuCsv, csvToObjects, buildSkuPlan } from './bulkCsv.mjs';

const usd = (minor) => minor == null ? 'POA' : '$' + (minor / 100).toFixed(2);

export default function BulkImport({ staff }) {
  const [variants, setVariants] = useState([]);   // for export
  const [maps, setMaps] = useState(null);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [fileName, setFileName] = useState('');

  const load = useCallback(async () => {
    const [{ data: offs }, { data: vars }, { data: vends }, { data: cats }] = await Promise.all([
      supabase.from('offerings').select('id,slug,name,status,featured,vendor_id,category_id').limit(2000),
      supabase.from('offering_variants').select('id,offering_id,sku,name,license_type,billing_period,base_price_minor,currency,offering:offerings(slug,name,status,featured,vendor:vendors(name),category:categories(name))').is('deleted_at', null).limit(5000),
      supabase.from('vendors').select('id,slug,name'),
      supabase.from('categories').select('id,slug,name'),
    ]);
    setVariants(vars || []);
    const variantsBySku = new Map();
    for (const v of vars || []) { if (v.sku) variantsBySku.set(v.sku, v); }
    setMaps({
      variantsBySku,
      offeringsBySlug: new Map((offs || []).map(o => [o.slug, o])),
      vendorsBySlug: new Map((vends || []).map(v => [v.slug, v])),
      vendorsByName: new Map((vends || []).map(v => [v.name.toLowerCase(), v])),
      categoriesBySlug: new Map((cats || []).map(c => [c.slug, c])),
      categoriesByName: new Map((cats || []).map(c => [c.name.toLowerCase(), c])),
    });
  }, []);
  useEffect(() => { load(); }, [load]);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 3600); };

  const exportCsv = () => {
    const blob = new Blob([variantsToSkuCsv(variants)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'greatstone-skus.csv'; a.click();
    URL.revokeObjectURL(url);
  };
  const onFile = async (e) => {
    const f = e.target.files[0]; if (!f || !maps) return; setFileName(f.name);
    try { setPlan(buildSkuPlan(csvToObjects(await f.text()), maps)); }
    catch (err) { flash('Could not parse that CSV.'); console.error(err); }
  };

  const apply = async () => {
    if (!plan || !maps) return;
    setBusy(true);
    try {
      // One atomic transaction (import_skus RPC, migration 0010): creates + updates + from_price
      // recompute all commit or all roll back — no orphaned offerings/vendors on a mid-import failure.
      const { data, error } = await supabase.rpc('import_skus', { p_creates: plan.creates, p_updates: plan.updates });
      if (error) throw error;
      // audit log (best-effort, non-blocking — not part of the import transaction)
      supabase.from('import_jobs').insert({ org_id: staff.org_id, filename: fileName || 'sku-import.csv', type: 'variants', status: 'applied', dry_run: false, applied_at: new Date().toISOString(), total_rows: plan.counts.total, diff_summary: plan.counts, created_by: staff.id }).then(({ error: e }) => { if (e) console.warn('audit', e.message); });
      flash(`Applied · created ${data?.created ?? 0}, updated ${data?.updated ?? 0}.`);
      setPlan(null); setFileName(''); load();
    } catch (e) { flash('Import failed: ' + e.message); console.error(e); }
    setBusy(false);
  };

  const c = plan?.counts;
  return (
    <div className="pr-admin">
      <div className="bk-grid">
        <div className="pr-form">
          <h2>Export price book</h2>
          <p className="ca-note">Download every SKU as CSV (USD list prices). Edit prices or add new SKU rows in Excel, then re-import. <b>sku</b> is the match key. Prices are USD; the site shows GBP at the live rate automatically.</p>
          <button className="gs-btn ghost" onClick={exportCsv} disabled={!variants.length}>Export SKUs CSV ({variants.length})</button>
        </div>
        <div className="pr-form">
          <h2>Import / update</h2>
          <p className="ca-note">Upload an edited CSV. New SKUs are created, existing SKUs updated, all matched by SKU. You'll see a full dry-run before anything is saved.</p>
          <label className="bk-file"><input type="file" accept=".csv,text/csv" onChange={onFile} disabled={!maps} /><span>{fileName || (maps ? 'Choose CSV…' : 'Loading…')}</span></label>
        </div>
      </div>

      {plan && (
        <div className="bk-diff">
          <h2>Dry run{fileName ? ' · ' + fileName : ''}</h2>
          <p className="pr-affects">
            <b>{c.total}</b> records · <b>{c.matching}</b> to update · <b>{c.new}</b> new ·
            <span className={c.invalid ? 'bk-errn' : ''}> {c.invalid} invalid</span> ·
            <span className={c.duplicate ? 'bk-errn' : ''}> {c.duplicate} duplicate</span> · {c.unchanged} unchanged
          </p>
          {!!plan.invalid.length && <ul className="bk-errs">{plan.invalid.slice(0, 12).map((e, i) => <li key={i}>row {e.rowIndex + 2} {e.sku ? '(' + e.sku + ')' : ''}: {e.reason}</li>)}</ul>}
          {!!plan.duplicates.length && <ul className="bk-errs">{plan.duplicates.slice(0, 8).map((d, i) => <li key={i}>SKU <b>{d.sku}</b> appears {d.rowIndexes.length}× in the file, skipped.</li>)}</ul>}
          <div className="ca-table-wrap"><table className="ca-table ca-cards">
            <thead><tr><th scope="col">SKU</th><th scope="col">Action</th><th scope="col">Detail</th></tr></thead>
            <tbody>
              {plan.creates.slice(0, 60).map(c2 => (
                <tr key={'c' + c2.sku}><td data-label="SKU" className="ca-name">{c2.sku}</td><td data-label="Action"><span className="ca-status ca-published">create</span></td>
                  <td data-label="Detail">{c2.offeringName || c2.offeringSlug || '(standalone)'} · {c2.variant.name} · {usd(c2.variant.base_price_minor)}</td></tr>
              ))}
              {plan.updates.slice(0, 60).map(u => (
                <tr key={'u' + u.sku}><td data-label="SKU" className="ca-name">{u.sku}</td><td data-label="Action"><span className="ca-status ca-draft">update</span></td>
                  <td data-label="Detail">{Object.entries(u.changes).map(([f, ch]) => <div key={f} className="bk-chg"><b>{f === 'base_price_minor' ? 'price (USD)' : f}</b>: <s>{f === 'base_price_minor' ? usd(ch.from) : String(ch.from)}</s> → {f === 'base_price_minor' ? usd(ch.to) : String(ch.to)}</div>)}</td></tr>
              ))}
              {!plan.creates.length && !plan.updates.length && <tr><td colSpan="3" className="ca-muted">No changes to apply.</td></tr>}
            </tbody>
          </table></div>
          <div className="ca-drawer-foot" style={{ marginTop: 14 }}>
            <button className="gs-btn ghost" onClick={() => { setPlan(null); setFileName(''); }}>Cancel</button>
            <button className="gs-btn primary" onClick={apply} disabled={busy || (!plan.creates.length && !plan.updates.length)}>{busy ? 'Applying…' : `Commit ${plan.creates.length + plan.updates.length} change${plan.creates.length + plan.updates.length === 1 ? '' : 's'}`}</button>
          </div>
        </div>
      )}
      {toast && <div className="ca-toast" role="status">{toast}</div>}
    </div>
  );
}
