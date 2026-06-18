// Pricing & mass-discount rules manager (catalogue admin). Create a rule (scope all/vendor/category,
// %/fixed), see a LIVE before→after preview computed by the pricing engine over the real catalogue,
// then save it (writes pricing_rules + pricing_rule_targets via the authenticated client; staff_all RLS).
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase.mjs';
import { effectivePrice, fmtMoney, usdToGbpMinor } from '../lib/pricing.mjs';

const blankForm = { name: '', scopeType: 'all', targetIds: [], adjType: 'percentage', pct: '10', fixed: '', label: '', active: false };

export default function PricingRules({ staff }) {
  const [rules, setRules] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [catalogue, setCatalogue] = useState([]); // lightweight, for preview
  const [rate, setRate] = useState(1.30);          // live USD→GBP rate so the preview shows real pounds
  const [form, setForm] = useState(blankForm);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [toast, setToast] = useState(null);

  const loadRules = () => supabase.from('pricing_rules')
    .select('id,name,active,scope_type,adjustment_type,adjustment_value,adjustment_value_pct,currency,label,pricing_rule_targets(vendor_id,category_id)')
    .order('created_at', { ascending: false }).then(({ data }) => setRules(data || []));
  useEffect(() => {
    loadRules();
    supabase.from('vendors').select('id,slug,name').eq('status', 'published').order('name').then(({ data }) => setVendors(data || []));
    supabase.from('categories').select('id,slug,name').eq('status', 'published').order('name').then(({ data }) => setCategories(data || []));
    supabase.from('offerings').select('id,name,type,vendor_id,category_id,from_price_minor,from_price_currency').eq('status', 'published').limit(500).then(({ data }) => setCatalogue(data || []));
    supabase.from('org_settings').select('usd_to_gbp_display_rate').limit(1).maybeSingle().then(({ data }) => { const r = Number(data?.usd_to_gbp_display_rate); if (r > 0) setRate(r); });
  }, []);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  // live preview: build a draft rule, run the engine over the real catalogue
  const preview = useMemo(() => {
    const draft = {
      id: 'draft', active: true, status: 'published', scopeType: form.scopeType,
      targets: { vendorIds: form.scopeType === 'vendor' ? form.targetIds : [], categoryIds: form.scopeType === 'category' ? form.targetIds : [], offeringIds: [], tierIds: [] },
      adjustmentType: form.adjType,
      adjustmentValue: form.adjType === 'fixed' ? Math.round(Number(form.fixed || 0) * 100) : 0,
      adjustmentValuePct: form.adjType === 'percentage' ? Number(form.pct || 0) : 0,
      currency: 'GBP', audience: 'public', priority: 100, floorFraction: 0,
    };
    const hits = [];
    for (const o of catalogue) {
      const gbp = usdToGbpMinor(o.from_price_minor, rate); // stored USD → GBP at the live rate
      if (gbp == null) continue;
      const ctx = { id: o.id, type: o.type, vendorId: o.vendor_id, categoryId: o.category_id };
      const p = effectivePrice(ctx, { basePriceMinor: gbp, currency: 'GBP' }, [draft]);
      if (p.hasDiscount) hits.push({ name: o.name, base: p.base, final: p.final });
    }
    return hits;
  }, [form, catalogue, rate]);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleTarget = (id) => setForm(f => ({ ...f, targetIds: f.targetIds.includes(id) ? f.targetIds.filter(x => x !== id) : [...f.targetIds, id] }));

  const save = async () => {
    if (!form.name.trim()) { setErr('Give the rule a name.'); return; }
    setBusy(true); setErr(null);
    const { data: rule, error } = await supabase.from('pricing_rules').insert({
      org_id: staff.org_id, name: form.name.trim(), active: form.active, scope_type: form.scopeType,
      adjustment_type: form.adjType,
      adjustment_value: form.adjType === 'fixed' ? Math.round(Number(form.fixed || 0) * 100) : 0,
      adjustment_value_pct: form.adjType === 'percentage' ? Number(form.pct || 0) : null,
      currency: form.adjType === 'fixed' ? 'GBP' : null,
      audience: 'public', priority: 100, floor_fraction: 0, label: form.label || null, status: 'published',
    }).select('id').single();
    if (error) { setBusy(false); setErr(error.message); return; }
    if (form.scopeType !== 'all' && form.targetIds.length) {
      const col = form.scopeType + '_id';
      const { error: e2 } = await supabase.from('pricing_rule_targets').insert(form.targetIds.map(tid => ({ org_id: staff.org_id, rule_id: rule.id, [col]: tid })));
      if (e2) { setBusy(false); setErr('Rule saved but targets failed: ' + e2.message); loadRules(); return; }
    }
    setBusy(false); setForm(blankForm); flash('Discount rule saved' + (form.active ? ' and live.' : ' (inactive, toggle on when ready).')); loadRules();
  };
  const toggleActive = async (r) => { await supabase.from('pricing_rules').update({ active: !r.active }).eq('id', r.id); loadRules(); };
  const remove = async (r) => { await supabase.from('pricing_rules').update({ deleted_at: new Date().toISOString(), active: false }).eq('id', r.id); loadRules(); flash('Rule removed.'); };

  const scopeLabel = (r) => r.scope_type === 'all' ? 'All products'
    : r.scope_type === 'vendor' ? `${r.pricing_rule_targets?.length || 0} vendor(s)`
    : r.scope_type === 'category' ? `${r.pricing_rule_targets?.length || 0} category(ies)` : r.scope_type;
  const valueLabel = (r) => r.adjustment_type === 'percentage' ? `−${r.adjustment_value_pct}%` : `−${fmtMoney(r.adjustment_value, r.currency || 'GBP')}`;

  return (
    <div className="pr-admin">
      <div className="pr-cols">
        <div className="pr-form">
          <h2>New discount rule</h2>
          <label>Name<input value={form.name} onChange={e => setF('name', e.target.value)} placeholder="e.g. Aspose summer sale" /></label>
          <label>Applies to
            <select value={form.scopeType} onChange={e => setF('scopeType', e.target.value) || setF('targetIds', [])}>
              <option value="all">All products</option>
              <option value="vendor">Specific vendors (brands)</option>
              <option value="category">Specific categories</option>
            </select>
          </label>
          {form.scopeType === 'vendor' && <div className="pr-targets">{vendors.map(v => <label key={v.id} className="pr-chk"><input type="checkbox" checked={form.targetIds.includes(v.id)} onChange={() => toggleTarget(v.id)} />{v.name}</label>)}</div>}
          {form.scopeType === 'category' && <div className="pr-targets">{categories.map(c => <label key={c.id} className="pr-chk"><input type="checkbox" checked={form.targetIds.includes(c.id)} onChange={() => toggleTarget(c.id)} />{c.name}</label>)}</div>}
          <div className="pr-row">
            <label>Discount type
              <select value={form.adjType} onChange={e => setF('adjType', e.target.value)}><option value="percentage">Percentage</option><option value="fixed">Fixed amount (£)</option></select>
            </label>
            {form.adjType === 'percentage'
              ? <label>Percent off<input type="number" min="0" max="100" value={form.pct} onChange={e => setF('pct', e.target.value)} /></label>
              : <label>£ off<input type="number" min="0" value={form.fixed} onChange={e => setF('fixed', e.target.value)} /></label>}
          </div>
          <label>Badge label (optional)<input value={form.label} onChange={e => setF('label', e.target.value)} placeholder="e.g. Offer price" /></label>
          <label className="pr-chk"><input type="checkbox" checked={form.active} onChange={e => setF('active', e.target.checked)} /> Make live now (otherwise saved inactive)</label>
          {err && <div className="ca-err">{err}</div>}
          <button className="gs-btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save discount rule'}</button>
        </div>

        <div className="pr-preview">
          <h2>Live preview</h2>
          <p className="pr-affects"><b>{preview.length}</b> product{preview.length === 1 ? '' : 's'} affected{form.scopeType !== 'all' && !form.targetIds.length ? ', pick targets above' : ''}.</p>
          <div className="pr-examples">
            {preview.slice(0, 8).map((h, i) => <div key={i} className="pr-ex"><span className="pr-exname">{h.name}</span><span className="pr-exprice"><s>{fmtMoney(h.base)}</s> → <b>{fmtMoney(h.final)}</b></span></div>)}
            {!preview.length && <div className="ca-muted">No products match yet.</div>}
          </div>
          <p className="ca-note">Quote-framed: discounts show as the offer price on the store and in quotes. Rules don't stack. The single best eligible rule applies.</p>
        </div>
      </div>

      <h2 className="pr-listh">Existing rules</h2>
      <div className="ca-table-wrap">
        <table className="ca-table">
          <thead><tr><th scope="col">Name</th><th scope="col">Scope</th><th scope="col">Discount</th><th scope="col">Status</th><th scope="col"><span className="gs-sr-only">Actions</span></th></tr></thead>
          <tbody>
            {!rules.length ? <tr><td colSpan="5" className="ca-muted">No rules yet.</td></tr>
              : rules.map(r => (
                <tr key={r.id}>
                  <td className="ca-name">{r.name}{r.label && <span className="pr-badge">{r.label}</span>}</td>
                  <td>{scopeLabel(r)}</td>
                  <td className="pr-val">{valueLabel(r)}</td>
                  <td><span className={'ca-status ' + (r.active ? 'ca-published' : 'ca-draft')}>{r.active ? 'Live' : 'Inactive'}</span></td>
                  <td className="pr-actions">
                    <button className="gs-btn ghost sm" onClick={() => toggleActive(r)}>{r.active ? 'Turn off' : 'Make live'}</button>
                    <button className="gs-btn ghost sm" onClick={() => remove(r)}>Delete</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {toast && <div className="ca-toast" role="status">{toast}</div>}
    </div>
  );
}
