// One header for every client portal page (GRE-4398): the same identity row and pill nav as #account and #org, so
// the portal reads as part of the account area rather than a separate app. `current` marks the page you are on.
import React from 'react';

const PAGES = [
  { key: 'home', href: '#portal', label: 'Your portal' },
  { key: 'deep-dive', href: '#portal/deep-dive', label: 'Deep Dive' },
  { key: 'agreement', href: '#portal/agreement', label: 'Interview agreement' },
];

export default function PortalHeader({ company, current }) {
  return (
    <header className="pt-head">
      <div className="acct-id">
        <div className="acct-id-text">
          <span className="st-kicker">Client portal</span>
          <p className="pt-head-co">{company?.name}</p>
        </div>
        <div className="acct-id-actions">
          <a className="gs-btn ghost sm" href="#org">Your organisation</a>
          <a className="gs-btn ghost sm" href="#account">Your account</a>
        </div>
      </div>
      <nav className="ca-tabs pt-tabs" aria-label="Client portal">
        {PAGES.map((p) => (
          <a key={p.key} href={p.href} className={p.key === current ? 'on' : undefined}
            aria-current={p.key === current ? 'page' : undefined}>{p.label}</a>
        ))}
      </nav>
    </header>
  );
}
