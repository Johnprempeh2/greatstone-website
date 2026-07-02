// The customer's "Licence keys" section on #account — a dedicated home for the activation codes a buyer
// has been issued, instead of a placeholder note buried in each order. RLS-scoped (customer_self, 0017):
// a buyer reads only their own company's keys; staff issue them.
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.mjs';
import { expiryInfo } from './licence-expiry.mjs';
import { keysToCsv } from './keys-export.mjs';
import { activationInstructionsFor } from '../lib/activation-match.mjs';
import './store.css';
import './admin.css';

const fmtDate = (s) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); };

export default function LicenceKeys() {
  const [keys, setKeys] = useState(null);   // null = loading
  const [err, setErr] = useState(null);
  const [copied, setCopied] = useState(null);
  const [fileBusy, setFileBusy] = useState(null); // id being fetched, or 'fail:<id>'
  const load = useCallback(() => {
    setErr(null);
    supabase.from('licence_keys')
      .select('id, offering_name, variant_name, licence_key, seats, status, delivered_at, expires_at, download_url, file_path, file_name, order:orders(reference)')
      .is('deleted_at', null).order('delivered_at', { ascending: false })
      .then(({ data, error }) => { setErr(error || null); setKeys(data || []); });
  }, []);
  useEffect(() => { load(); }, [load]);

  // Per-product-range activation steps (vendors.activation_instructions, migration 0025), matched to each
  // licence by its product name. Failure-tolerant: before the migration the column doesn't exist, so on any
  // error we simply show no activation block. Vendors are customer-readable (public_read, published only).
  const [vendors, setVendors] = useState([]);
  useEffect(() => {
    supabase.from('vendors').select('id, name, activation_instructions').is('deleted_at', null)
      .then(({ data, error }) => { if (!error) setVendors((data || []).filter((v) => v.activation_instructions)); });
  }, []);
  // Match each licence to its range's steps by product name (token-anchored; see lib/activation-match.mjs).
  const activationFor = useCallback((offeringName) => activationInstructionsFor(offeringName, vendors), [vendors]);

  // Download a .lic licence FILE: mint a short-lived signed URL for the private object (Storage RLS lets a
  // buyer read only their own customer folder, 0024), then trigger the download. No file bytes touch our JS.
  const downloadFile = useCallback(async (kk) => {
    if (!kk.file_path) return;
    setFileBusy(kk.id);
    try {
      const { data, error } = await supabase.storage.from('licence-files').createSignedUrl(kk.file_path, 600, { download: kk.file_name || true });
      if (error || !data || !data.signedUrl) throw error || new Error('no url');
      const a = document.createElement('a');
      a.href = data.signedUrl; a.download = kk.file_name || 'licence.lic';
      document.body.appendChild(a); a.click(); a.remove();
      setFileBusy(null);
    } catch { setFileBusy('fail:' + kk.id); setTimeout(() => setFileBusy(null), 4000); }
  }, []);

  const copy = async (kk, codeEl) => {
    try {
      await navigator.clipboard.writeText(kk.licence_key);
      setCopied(kk.id); setTimeout(() => setCopied(null), 1800);          // only show success when it actually copied
    } catch {
      // clipboard API blocked (insecure origin / permission) — select the code so the user can copy it manually
      try { const r = document.createRange(); r.selectNodeContents(codeEl); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); } catch { /* ignore */ }
      setCopied('fail:' + kk.id); setTimeout(() => setCopied(null), 4000);
    }
  };
  // client-side export of all the customer's keys (no backend): serialize to CSV, download via an object URL
  const downloadKeys = () => {
    const csv = keysToCsv(keys);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }); // BOM so Excel reads UTF-8
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'greatstone-licence-keys.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  // explicit map so an unknown status can't silently render as the red "refunded" chip
  const statusClass = (s) => ({ issued: 'ca-published', expired: 'ca-draft', revoked: 'ca-ord-refunded' }[s] || 'ca-archived');

  return (
    <section className="org-sec" aria-labelledby="acct-keys-h">
      <div className="acct-ordhead">
        <h2 id="acct-keys-h">Licence keys</h2>
        {keys && keys.length > 0 && (
          <div className="acct-keystools">
            <button className="gs-btn ghost sm" onClick={downloadKeys} aria-label="Download all your licence keys as a CSV file">Download all (.csv)</button>
            <button className="gs-btn ghost sm" onClick={load}>Refresh</button>
          </div>
        )}
      </div>
      {keys === null ? (
        <div className="st-skel" style={{ height: 76, borderRadius: 14 }} />
      ) : err ? (
        <p className="ca-note" role="alert">Couldn't load your licence keys. <button className="ca-link" onClick={load}>Try again</button></p>
      ) : keys.length === 0 ? (
        <div className="lk-empty">
          <p>Your licence keys land here the moment our team delivers them after a purchase, each with its product, your seats and any expiry. Nothing to do until then; we&rsquo;ll email you the moment your first one is ready.</p>
          <p className="ca-note">When a key arrives, copy it and paste it into the product's licence or activation screen to unlock your seats. Stuck? <a className="ca-link" href="#go/contact">Our team will help you set it up</a>.</p>
        </div>
      ) : (
        <div className="lk-list">
          {keys.map(kk => (
            <div key={kk.id} className={'lk-card' + (kk.status !== 'issued' ? ' is-inactive' : '')}>
              <div className="lk-head">
                <span className="lk-prod">{kk.offering_name}{kk.variant_name ? <span className="lk-variant"> · {kk.variant_name}</span> : ''}</span>
                {(() => { const ex = expiryInfo(kk.expires_at); return ex && ex.kind !== 'ok' ? <span className={'lk-expbadge ' + ex.cls}>{ex.label}</span> : null; })()}
                <span className={'ca-status ' + statusClass(kk.status)}>{kk.status}</span>
              </div>
              <div className="lk-keyrow" style={{ flexWrap: 'wrap' }}>
                {kk.licence_key ? (<>
                  <code className="lk-key" aria-label="Licence key">{kk.licence_key}</code>
                  <button type="button" className="gs-btn ghost sm" onClick={(e) => copy(kk, e.currentTarget.previousElementSibling)}
                    aria-label={(copied === kk.id ? 'Copied' : copied === 'fail:' + kk.id ? 'Selected — press Cmd or Ctrl and C to copy' : 'Copy') + ' licence key for ' + kk.offering_name}>
                    {copied === kk.id ? 'Copied ✓' : copied === 'fail:' + kk.id ? 'Press ⌘/Ctrl+C' : 'Copy'}
                  </button>
                </>) : (
                  <span className="lk-key lk-key-file" aria-label="This licence is delivered as a file">Licence file</span>
                )}
                {kk.file_path && kk.status === 'issued' && (
                  <button type="button" className="gs-btn ghost sm" onClick={() => downloadFile(kk)} disabled={fileBusy === kk.id} aria-busy={fileBusy === kk.id}
                    aria-label={'Download the licence file for ' + kk.offering_name}>
                    {fileBusy === kk.id ? 'Preparing…' : fileBusy === 'fail:' + kk.id ? 'Try again' : 'Licence file ↓'}
                  </button>
                )}
                {kk.download_url && kk.status === 'issued' && <a className="gs-btn ghost sm" href={kk.download_url} target="_blank" rel="noopener noreferrer" aria-label={'Download ' + kk.offering_name + ' (opens in a new tab)'}>Download ↗</a>}
              </div>
              <div className="lk-meta">
                {kk.seats ? <span>{kk.seats} seat{kk.seats === 1 ? '' : 's'}</span> : null}
                <span>Issued {fmtDate(kk.delivered_at)}</span>
                {kk.expires_at ? <span>Expires {fmtDate(kk.expires_at)}</span> : null}
                {kk.order?.reference ? <span>Order {kk.order.reference}</span> : null}
              </div>
              {(() => { const act = kk.status === 'issued' ? activationFor(kk.offering_name) : null; return act ? (
                <details className="lk-activate"><summary>How to activate</summary><div className="lk-activate-body">{act}</div></details>
              ) : null; })()}
              {kk.status === 'revoked' && <p className="ca-note" style={{ marginTop: 8 }}>This key has been deactivated. If you think that's a mistake, <a className="ca-link" href="#go/contact">contact us</a>.</p>}
              {kk.status === 'expired' && <p className="ca-note" style={{ marginTop: 8 }}>This licence has expired. <a className="ca-link" href="#go/contact">Get in touch</a> to renew it.</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
