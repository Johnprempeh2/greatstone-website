// Central admin hub — the launcher you land on when you enter the admin side (#admin), instead of
// dropping straight into the page editor. Groups every admin surface into Content / Commerce /
// People & Settings and deep-links to the surface that already exists (Puck editor + StudioPanel
// tabs via callbacks; the Supabase catalogue via the #catalogue hash). Gated by the prototype studio
// session (same as #admin today); Commerce cards hand off to the catalogue's own Supabase sign-in —
// the chip shows that connection's status. Brand: charcoal + lime, Montserrat, the stone wordmark.
import { useState, useEffect } from 'react';
import { getSession, getStaffUser } from '../store/adminAuth.mjs';

function Card({ label, desc, badge, locked, onClick }) {
  return (
    <button type="button" className={'hub-card' + (locked ? ' is-locked' : '')} onClick={locked ? undefined : onClick} disabled={locked} aria-label={label}>
      <span className="hub-card-top">
        <span className="hub-card-label">{label}</span>
        {badge ? <span className="hub-card-badge" aria-label={badge + ' need attention'}>{badge}</span> : null}
      </span>
      <span className="hub-card-desc">{locked ? 'Your role doesn’t have access.' : desc}</span>
    </button>
  );
}

export default function AdminHub({ user, canEdit, canManageUsers, attention = {}, onEditor, onPanel, onCatalogue, onShop, onAccount, onExport, onSignOut }) {
  const [supa, setSupa] = useState({ state: 'checking' });
  useEffect(() => {
    let alive = true;
    getSession().then(async (s) => {
      if (!alive) return;
      if (!s) { setSupa({ state: 'out' }); return; }
      const staff = await getStaffUser().catch(() => null);
      if (alive) setSupa({ state: staff ? 'in' : 'notstaff', email: s.user?.email, role: staff?.role });
    });
    return () => { alive = false; };
  }, []);

  const supaChip = supa.state === 'in' ? `Catalogue: signed in as ${supa.email} · ${supa.role}`
    : supa.state === 'notstaff' ? 'Catalogue: signed in, but not a staff account'
    : supa.state === 'out' ? 'Catalogue: signs in separately when you open it'
    : 'Catalogue: checking…';

  return (
    <div className="hub-wrap">
      <header className="hub-head">
        <div className="hub-logo" aria-hidden="true">GREATST<span>O</span>NE</div>
        <div className="hub-head-r">
          <span className="hub-who">{user?.name} · {user?.role}</span>
          <button className="gs-btn ghost sm" onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      <div className="hub-intro">
        <span className="st-kicker">Admin</span>
        <h1>What would you like to manage?</h1>
        <p>Your website content and the live software store, in one place.</p>
      </div>

      <section className="hub-section">
        <h2>Content <span className="hub-sec-note">website pages</span></h2>
        <div className="hub-grid">
          <Card label="Page editor" desc="Edit any page in the visual builder." locked={!canEdit} onClick={onEditor} />
          <Card label="Pages &amp; releases" desc="Draft, review, approve and publish pages." badge={attention.releases} locked={!canEdit} onClick={() => onPanel('releases')} />
          <Card label="SEO &amp; social" desc="Titles, descriptions and share cards per page." locked={!canEdit} onClick={() => onPanel('seo')} />
          <Card label="3D background" desc="Choose the stone / tide scene behind a page." locked={!canEdit} onClick={() => onPanel('background')} />
          <Card label="Version history" desc="Restore or compare past snapshots." locked={!canEdit} onClick={() => onPanel('history')} />
          <Card label="Activity log" desc="Who changed what, and when." onClick={() => onPanel('activity')} />
          <Card label="Export site (JSON)" desc="Download the whole authored site for the dev team." locked={!canManageUsers} onClick={onExport} />
        </div>
      </section>

      <section className="hub-section">
        <h2>Commerce <span className="hub-chip">{supaChip}</span></h2>
        <div className="hub-grid">
          <Card label="Catalogue" desc="The live software catalogue — names, descriptions, status, featured." onClick={() => onCatalogue('offerings')} />
          <Card label="Pricing &amp; discounts" desc="Mass price / discount rules with a live preview." onClick={() => onCatalogue('pricing')} />
          <Card label="Currency (FX)" desc="The global USD→GBP rate; the whole catalogue reprices." onClick={() => onCatalogue('fx')} />
          <Card label="Orders" desc="Paid orders, fulfilment, refunds and invoices." badge={attention.orders} onClick={() => onCatalogue('orders')} />
          <Card label="Quotes" desc="B2B pay-on-invoice requests; price and convert to orders." badge={attention.quotes} onClick={() => onCatalogue('quotes')} />
          <Card label="Import / export" desc="Bulk SKU price book — export, edit in Excel, re-import." onClick={() => onCatalogue('bulk')} />
          <Card label="View live store" desc="Open the customer-facing storefront." onClick={onShop} />
        </div>
      </section>

      <section className="hub-section">
        <h2>People &amp; settings</h2>
        <div className="hub-grid">
          <Card label="Team &amp; roles" desc="Invite teammates and set their roles." badge={attention.team} locked={!canManageUsers} onClick={() => onPanel('team')} />
          <Card label="Customer accounts" desc="Open a customer's self-serve view to assist them." onClick={onAccount} />
          <Card label="Sign out" desc="End your studio session." onClick={onSignOut} />
        </div>
      </section>
    </div>
  );
}
