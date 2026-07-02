// Catalogue admin — Activation instructions. Ben (1 Jul): author the activation steps ONCE per product
// range (vendor), not per product. Staff edit vendors.activation_instructions here (migration 0025); the
// steps then show on the customer's account beside every licence in that range (LicenceKeys, matched by the
// licence's product name) and, once notify-licence-issued is redeployed, in the licence email. Writes go
// through the signed-in staff session (vendors staff_all RLS, 0004). Plain text, no secrets.
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.mjs';

export default function VendorActivation() {
  const [vendors, setVendors] = useState(null); // null = loading
  const [loadErr, setLoadErr] = useState(null);
  const [drafts, setDrafts] = useState({});     // vendor id -> edited text
  const [savingId, setSavingId] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(() => {
    setLoadErr(null);
    supabase.from('vendors').select('id, name, activation_instructions').is('deleted_at', null).order('sort_order', { ascending: true })
      .then(({ data, error }) => {
        if (error) { console.error('vendors load', error); setLoadErr(error.message || 'load failed'); return; }
        setVendors(data || []);
        const d = {}; for (const v of data || []) d[v.id] = v.activation_instructions || '';
        setDrafts(d);
      });
  }, []);
  useEffect(() => { load(); }, [load]);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  const dirty = (v) => (drafts[v.id] || '').trim() !== (v.activation_instructions || '');
  const save = async (v) => {
    setSavingId(v.id);
    const text = (drafts[v.id] || '').trim();
    const { error } = await supabase.from('vendors').update({ activation_instructions: text || null }).eq('id', v.id);
    setSavingId(null);
    if (error) { flash('Could not save. ' + error.message); return; }
    flash('Saved the ' + v.name + ' activation steps.');
    setVendors((vs) => (vs || []).map((x) => (x.id === v.id ? { ...x, activation_instructions: text || null } : x)));
  };

  return (
    <div className="ca-wrap">
      <header className="ca-head"><div><span className="st-kicker">Catalogue admin</span><h1>Activation instructions</h1></div></header>
      <p className="ca-note" style={{ maxWidth: '72ch', marginBottom: 16 }}>
        Write the activation steps once per product range. They appear on the customer&rsquo;s account beside
        every licence in that range, and in the licence email once it&rsquo;s deployed. Plain text: line breaks
        are kept, but HTML and markdown are shown as-is, so keep it to the steps a buyer follows to activate.
      </p>
      {vendors === null ? (
        <div className="st-skel" style={{ height: 140, borderRadius: 12 }} />
      ) : loadErr ? (
        <p className="ca-note" role="alert">Couldn&rsquo;t load the ranges. <button className="ca-link" onClick={load}>Try again</button></p>
      ) : !vendors.length ? (
        <p className="ca-note">No product ranges yet.</p>
      ) : (
        <div className="ca-va-list">
          {vendors.map((v) => (
            <div className="ca-va-item" key={v.id}>
              <label className="ca-va-label" htmlFor={'va-' + v.id}>{v.name}{!v.activation_instructions ? <span className="ca-va-empty"> · not set yet</span> : null}</label>
              <textarea id={'va-' + v.id} className="ca-va-text" rows="5" value={drafts[v.id] || ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [v.id]: e.target.value }))}
                placeholder={'How does a buyer activate ' + v.name + '? e.g. paste the licence key into the product’s licence screen…'} />
              <div className="ca-va-foot">
                <button className="gs-btn primary sm" onClick={() => save(v)} disabled={savingId === v.id || !dirty(v)}>
                  {savingId === v.id ? 'Saving…' : dirty(v) ? 'Save' : 'Saved ✓'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {toast && <div className="ca-toast" role="status">{toast}</div>}
    </div>
  );
}
