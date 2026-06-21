// The customer's "Licence keys" section on #account — a dedicated home for the activation codes a buyer
// has been issued, instead of a placeholder note buried in each order. RLS-scoped (customer_self, 0017):
// a buyer reads only their own company's keys; staff issue them.
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.mjs';
import './store.css';
import './admin.css';

const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s; } };

export default function LicenceKeys() {
  const [keys, setKeys] = useState(null);   // null = loading
  const [err, setErr] = useState(null);
  const [copied, setCopied] = useState(null);
  const load = useCallback(() => {
    setErr(null);
    supabase.from('licence_keys')
      .select('id, offering_name, variant_name, licence_key, seats, status, delivered_at, expires_at, download_url, order:orders(reference)')
      .is('deleted_at', null).order('delivered_at', { ascending: false })
      .then(({ data, error }) => { setErr(error || null); setKeys(data || []); });
  }, []);
  useEffect(() => { load(); }, [load]);

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
  // explicit map so an unknown status can't silently render as the red "refunded" chip
  const statusClass = (s) => ({ issued: 'ca-published', expired: 'ca-draft', revoked: 'ca-ord-refunded' }[s] || 'ca-archived');

  return (
    <section className="org-sec" aria-labelledby="acct-keys-h">
      <div className="acct-ordhead">
        <h2 id="acct-keys-h">Licence keys</h2>
        {keys && keys.length > 0 && <button className="gs-btn ghost sm" onClick={load}>Refresh</button>}
      </div>
      {keys === null ? (
        <div className="st-skel" style={{ height: 76, borderRadius: 14 }} />
      ) : err ? (
        <p className="ca-note" role="alert">Couldn't load your licence keys. <button className="ca-link" onClick={load}>Try again</button></p>
      ) : keys.length === 0 ? (
        <div className="lk-empty">
          <p>Your licence keys appear here as soon as our team delivers them after a purchase — each with the product, your seats and any expiry. Nothing to activate yet.</p>
        </div>
      ) : (
        <div className="lk-list">
          {keys.map(kk => (
            <div key={kk.id} className={'lk-card' + (kk.status !== 'issued' ? ' is-inactive' : '')}>
              <div className="lk-head">
                <span className="lk-prod">{kk.offering_name}{kk.variant_name ? <span className="lk-variant"> · {kk.variant_name}</span> : ''}</span>
                <span className={'ca-status ' + statusClass(kk.status)}>{kk.status}</span>
              </div>
              <div className="lk-keyrow">
                <code className="lk-key" aria-label="Licence key">{kk.licence_key}</code>
                <button type="button" className="gs-btn ghost sm" onClick={(e) => copy(kk, e.currentTarget.previousElementSibling)}
                  aria-label={(copied === kk.id ? 'Copied' : copied === 'fail:' + kk.id ? 'Selected — press Cmd or Ctrl and C to copy' : 'Copy') + ' licence key for ' + kk.offering_name}>
                  {copied === kk.id ? 'Copied ✓' : copied === 'fail:' + kk.id ? 'Press ⌘/Ctrl+C' : 'Copy'}
                </button>
                {kk.download_url && kk.status === 'issued' && <a className="gs-btn ghost sm" href={kk.download_url} target="_blank" rel="noopener noreferrer" aria-label={'Download ' + kk.offering_name + ' (opens in a new tab)'}>Download ↗</a>}
              </div>
              <div className="lk-meta">
                {kk.seats ? <span>{kk.seats} seat{kk.seats === 1 ? '' : 's'}</span> : null}
                <span>Issued {fmtDate(kk.delivered_at)}</span>
                {kk.expires_at ? <span>Expires {fmtDate(kk.expires_at)}</span> : null}
                {kk.order?.reference ? <span>Order {kk.order.reference}</span> : null}
              </div>
              {kk.status === 'revoked' && <p className="ca-note" style={{ marginTop: 8 }}>This key has been deactivated. If you think that's a mistake, <a className="ca-link" href="#go/contact">contact us</a>.</p>}
              {kk.status === 'expired' && <p className="ca-note" style={{ marginTop: 8 }}>This licence has expired. <a className="ca-link" href="#go/contact">Get in touch</a> to renew it.</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
