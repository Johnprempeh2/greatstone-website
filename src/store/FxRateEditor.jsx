// FX rate editor (catalogue admin). Edit the single global USD→GBP display rate; the whole catalogue
// reprices on save because GBP is computed from USD at the live rate. Live before→after preview over a
// sample of real products + an audit history panel (fx_rate_history). Staff-gated via staff_all RLS.
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase.mjs';
import { usdToGbpMinor, fmtMoney } from '../lib/pricing.mjs';

const MIN_RATE = 0.10, MAX_RATE = 100;

export default function FxRateEditor({ staff }) {
  const [current, setCurrent] = useState(null);   // saved rate
  const [draft, setDraft] = useState('');          // editable string
  const [sample, setSample] = useState([]);        // ~10 representative products (USD from-price)
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(() => {
    supabase.from('org_settings').select('usd_to_gbp_display_rate').limit(1).maybeSingle()
      .then(({ data }) => { const r = Number(data?.usd_to_gbp_display_rate) || 1.30; setCurrent(r); setDraft(String(r)); });
    supabase.from('offerings').select('id,name,from_price_minor').eq('status', 'published')
      .not('from_price_minor', 'is', null).order('from_price_minor', { ascending: false }).limit(10)
      .then(({ data }) => setSample(data || []));
    supabase.from('fx_rate_history').select('old_rate,new_rate,changed_at').order('changed_at', { ascending: false }).limit(20)
      .then(({ data }) => setHistory(data || []));
  }, []);
  useEffect(() => { load(); }, [load]);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  const draftRate = Number(draft);
  const valid = draftRate >= MIN_RATE && draftRate <= MAX_RATE;
  const changed = valid && current != null && Math.abs(draftRate - current) > 1e-9;

  const rows = useMemo(() => sample.map(o => ({
    name: o.name,
    now: usdToGbpMinor(o.from_price_minor, current),
    next: valid ? usdToGbpMinor(o.from_price_minor, draftRate) : null,
  })), [sample, current, draftRate, valid]);

  const save = async () => {
    if (!valid) { setErr(`Rate must be between ${MIN_RATE} and ${MAX_RATE}.`); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase.from('org_settings')
      .update({ usd_to_gbp_display_rate: draftRate, updated_by: staff.id })
      .eq('org_id', staff.org_id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    flash('Rate saved. The whole catalogue now prices at ' + draftRate + '.');
    load();
  };

  const fmtDate = (s) => { try { return new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return s; } };

  return (
    <div className="pr-admin">
      <div className="pr-cols">
        <div className="pr-form">
          <h2>USD → GBP rate</h2>
          <p className="ca-note">Products are stored in their vendor USD list price. The site shows GBP, computed as <b>USD ÷ rate</b>, rounded to the whole pound. Change the rate and every price updates at once. You control the rate; nothing is fetched automatically.</p>
          <label>Rate ($ to the £)
            <input type="number" step="0.01" min={MIN_RATE} max={MAX_RATE} value={draft} onChange={e => setDraft(e.target.value)} placeholder="1.30" />
          </label>
          {!valid && draft !== '' && <div className="ca-err">Enter a rate between {MIN_RATE} and {MAX_RATE}.</div>}
          {err && <div className="ca-err" role="alert">{err}</div>}
          <p className="ca-note">Example: a $1,000 product at 1.32 shows <b>£758</b> (1000 ÷ 1.32 = 757.57, rounded).</p>
          <button className="gs-btn primary" onClick={save} disabled={busy || !changed}>{busy ? 'Saving…' : changed ? 'Save rate' : 'No change'}</button>
        </div>

        <div className="pr-preview">
          <h2>Live preview</h2>
          <p className="pr-affects">Every published price recalculates. {changed ? <>Current → <b>new</b> for {rows.length} sample products:</> : `Showing current prices at ${current ?? ''}. Type a new rate to preview.`}</p>
          <div className="pr-examples">
            {rows.map((h, i) => (
              <div key={i} className="pr-ex">
                <span className="pr-exname">{h.name}</span>
                <span className="pr-exprice">{fmtMoney(h.now)}{changed && h.next != null && <> → <b>{fmtMoney(h.next)}</b></>}</span>
              </div>
            ))}
            {!rows.length && <div className="ca-muted">No priced products to preview.</div>}
          </div>
        </div>
      </div>

      <h2 className="pr-listh">Rate history</h2>
      <div className="ca-table-wrap">
        <table className="ca-table">
          <thead><tr><th scope="col">When</th><th scope="col">From</th><th scope="col">To</th></tr></thead>
          <tbody>
            {!history.length ? <tr><td colSpan="3" className="ca-muted">No changes yet.</td></tr>
              : history.map((h, i) => (
                <tr key={i}>
                  <td>{fmtDate(h.changed_at)}</td>
                  <td>{h.old_rate != null ? Number(h.old_rate).toFixed(4) : '–'}</td>
                  <td className="ca-name">{Number(h.new_rate).toFixed(4)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {toast && <div className="ca-toast" role="status">{toast}</div>}
    </div>
  );
}
