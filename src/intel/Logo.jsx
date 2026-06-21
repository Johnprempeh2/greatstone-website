// Vendor logo, shared by the hub feed and the article byline. Clearbit's free logo API was retired,
// so use Google's favicon service (reliable, no key) and fall back to an on-brand monogram tile so a
// missing logo never renders as a blank/white box.
import React, { useState } from 'react';

export const LOGO = (d) => 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(d) + '&sz=128';
export const monogram = (s) => (s || '?').replace(/^(the|a|an)\s+/i, '').replace(/^www\./i, '').trim().charAt(0).toUpperCase() || '?';

export default function Logo({ domain, name, className }) {
  const [bad, setBad] = useState(false);
  const cls = 'ih-logo' + (className ? ' ' + className : '');
  if (bad || !domain) return <span className={cls + ' mono'} aria-hidden="true">{monogram(name || domain)}</span>;
  return <img className={cls} src={LOGO(domain)} alt="" loading="lazy" onError={() => setBad(true)} />;
}
