// A link out of the record, to the actual thing.
//
// One component, because every surface that names where something lives has to treat a stored URL
// the same way. The scheme is checked AGAIN here even though the schema refused a bad one on the
// way in: a record written before that guard existed was never checked, and a stored `javascript:`
// URL rendered as an anchor is script execution on a practitioner's click.
//
// The destination is shown rather than hidden behind the link text. A reader should not have to
// hover to find out whether "Open the transcript" goes to their own workspace or somewhere else.
import React from 'react';
import { safeLink } from '../data/deepdive-schema.mjs';
import { Icon } from './DeepDiveIcons.jsx';

export default function OutLink({ href, children, className = 'dd-out' }) {
  const safe = safeLink(href);
  if (!safe) return null;
  let host = '';
  try { host = new URL(safe).host.replace(/^www\./, ''); } catch { host = ''; }
  return (
    <a className={className} href={safe} target="_blank" rel="noopener noreferrer">
      {Icon.link({ size: 15 })}
      <span>{children || 'Open it'}</span>
      {host && <span className="dd-out-host">{host}</span>}
    </a>
  );
}
