// Bulk SKU price-book import (catalogue admin). Export the catalogue as a SKU CSV, edit USD prices /
// add new SKUs in Excel, re-import: SKU is the match key. A pre-commit preview reports records,
// matching / new / invalid / duplicate SKUs + a field-level diff; nothing is written until you commit.
// Prices are USD; GBP recalculates automatically from the live FX rate (no GBP is ever written here).
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.mjs';
import { variantsToSkuCsv, csvToObjects, buildSkuPlan, changesToPatch, slugify } from './bulkCsv.mjs';

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
      const orgId = staff.org_id;
      const slugToId = new Map([...maps.offeringsBySlug].map(([slug, o]) => [slug, o.id]));
      // 1) resolve/create parent offerings for new SKUs (grouped by slug; created once)
      const newOfferings = new Map();
      for (const cr of plan.creates) {
        cr._slug = cr.offeringSlug || slugify(cr.offeringName || cr.sku);
        if (!slugToId.has(cr._slug) && !newOfferings.has(cr._slug)) newOfferings.set(cr._slug, cr);
      }
      for (const [slug, cr] of newOfferings) {
        // products require a vendor (chk_product_has_vendor): resolve by slug/name, else auto-create it.
        let vId = cr.vendor ? (maps.vendorsBySlug.get(slugify(cr.vendor))?.id || maps.vendorsByName.get(cr.vendor.toLowerCase())?.id || null) : null;
        if (!vId && cr.vendor) {
          const vslug = slugify(cr.vendor);
          const { data: nv, error: ve } = await supabase.from('vendors').insert({ org_id: orgId, slug: vslug, name: cr.vendor }).select('id,slug,name').single();
          if (ve) throw new Error('vendor "' + cr.vendor + '": ' + ve.message);
          vId = nv.id; maps.vendorsBySlug.set(vslug, nv); maps.vendorsByName.set(cr.vendor.toLowerCase(), nv);
        }
        let cId = cr.category ? (maps.categoriesBySlug.get(slugify(cr.category))?.id || maps.categoriesByName.get(cr.category.toLowerCase())?.id || null) : null;
        if (!cId && cr.category) {
          const cslug = slugify(cr.category);
          const { data: nc, error: ce } = await supabase.from('categories').insert({ org_id: orgId, slug: cslug, name: cr.category }).select('id,slug,name').single();
          if (ce) throw new Error('category "' + cr.category + '": ' + ce.message);
          cId = nc.id; maps.categoriesBySlug.set(cslug, nc); maps.categoriesByName.set(cr.category.toLowerCase(), nc);
        }
        const { data, error } = await supabase.from('offerings').insert({
          org_id: orgId, slug, name: cr.offeringName || cr.variant.name || slug, type: 'product',
          status: cr.status, featured: cr.featured, fulfilment: 'license', vendor_id: vId, category_id: cId,
        }).select('id').single();
        if (error) throw new Error('offering "' + slug + '": ' + error.message);
        slugToId.set(slug, data.id);
      }
      // 2) creates → one bulk insert (full rows)
      const createRows = plan.creates.map(cr => ({
        org_id: orgId, offering_id: slugToId.get(cr._slug), sku: cr.sku, name: cr.variant.name,
        license_type: cr.variant.license_type, billing_period: cr.variant.billing_period,
        base_price_minor: cr.variant.base_price_minor, currency: cr.variant.base_price_minor != null ? 'USD' : null,
      }));
      if (createRows.length) { const { error } = await supabase.from('offering_variants').insert(createRows); if (error) throw error; }
      // 3) updates → chunked parallel patches (by variant id; the partial unique index rules out a single upsert)
      let updated = 0;
      for (let i = 0; i < plan.updates.length; i += 25) {
        const batch = plan.updates.slice(i, i + 25);
        const res = await Promise.all(batch.map(u => {
          const patch = changesToPatch(u.changes);
          if ('base_price_minor' in patch) patch.currency = patch.base_price_minor != null ? 'USD' : null;
          return supabase.from('offering_variants').update(patch).eq('id', u.variantId);
        }));
        const bad = res.find(r => r.error); if (bad) throw bad.error;
        updated += batch.length;
      }
      // 4) recompute from_price (min USD) for every touched offering
      const touched = new Set([...createRows.map(r => r.offering_id), ...plan.updates.map(u => u.offeringId)]);
      for (const oid of touched) {
        if (!oid) continue;
        const { data: vs } = await supabase.from('offering_variants').select('base_price_minor').eq('offering_id', oid).is('deleted_at', null).not('base_price_minor', 'is', null);
        const min = (vs || []).reduce((m, v) => (m == null || v.base_price_minor < m) ? v.base_price_minor : m, null);
        await supabase.from('offerings').update({ from_price_minor: min, from_price_currency: min != null ? 'USD' : null }).eq('id', oid);
      }
      // 5) audit (best-effort)
      supabase.from('import_jobs').insert({ org_id: orgId, filename: fileName || 'sku-import.csv', type: 'variants', status: 'applied', dry_run: false, applied_at: new Date().toISOString(), total_rows: plan.counts.total, diff_summary: plan.counts, created_by: staff.id }).then(({ error }) => { if (error) console.warn('audit', error.message); });
      flash(`Applied · created ${plan.counts.new}, updated ${updated}.`);
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
          <p className="ca-note">Upload an edited CSV. New SKUs are created, existing SKUs updated — all matched by SKU. You'll see a full dry-run before anything is saved.</p>
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
          {!!plan.duplicates.length && <ul className="bk-errs">{plan.duplicates.slice(0, 8).map((d, i) => <li key={i}>SKU <b>{d.sku}</b> appears {d.rowIndexes.length}× in the file — skipped.</li>)}</ul>}
          <div className="ca-table-wrap"><table className="ca-table">
            <thead><tr><th>SKU</th><th>Action</th><th>Detail</th></tr></thead>
            <tbody>
              {plan.creates.slice(0, 60).map(c2 => (
                <tr key={'c' + c2.sku}><td className="ca-name">{c2.sku}</td><td><span className="ca-status ca-published">create</span></td>
                  <td>{c2.offeringName || c2.offeringSlug || '(standalone)'} · {c2.variant.name} · {usd(c2.variant.base_price_minor)}</td></tr>
              ))}
              {plan.updates.slice(0, 60).map(u => (
                <tr key={'u' + u.sku}><td className="ca-name">{u.sku}</td><td><span className="ca-status ca-draft">update</span></td>
                  <td>{Object.entries(u.changes).map(([f, ch]) => <div key={f} className="bk-chg"><b>{f === 'base_price_minor' ? 'price (USD)' : f}</b>: <s>{f === 'base_price_minor' ? usd(ch.from) : String(ch.from)}</s> → {f === 'base_price_minor' ? usd(ch.to) : String(ch.to)}</div>)}</td></tr>
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
