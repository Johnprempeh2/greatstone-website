// One competitor, as its own page.
//
// The competitor list is desk research: ours to build and the client's to correct. On the tab it
// is a wall of prose; here one organisation gets the room to be read properly, and the card on the
// tab shrinks to what a card can honestly carry: the mark, the name, and where they meet.
//
// The logo is a URL on the record, never a bundled file. Client-adjacent research checked into the
// public bundle is exactly what the leak gate refuses, so the build ships no marks: an absent or
// broken logo falls back to a lettermark, which is honest rather than broken-image chrome.
import React, { useMemo, useState } from 'react';
import { historyOf } from './deepdive-state.mjs';
import { deepDiveHref } from '../lib/deepdive-route.mjs';
import { Icon, Labelled } from './DeepDiveIcons.jsx';
import RecordSearch from './RecordSearch.jsx';
import ChangeLog from './ChangeLog.jsx';
import InlineText from './InlineText.jsx';
import { safeLink } from '../data/deepdive-schema.mjs';

/** The mark, or the honest fallback. A competitor logo is a raster from THEIR site on THEIR
 *  colours, so it sits on a white plate the way the client's own mark does on the Overview:
 *  most are drawn for a light ground, and a plate means we never have to know which. */
export function CompMark({ name, logo, size = 'md' }) {
  const [broken, setBroken] = useState(false);
  const initials = String(name || '?').replace(/\(.*?\)/g, '').trim()
    .split(/\s+/).filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join('') || '?';
  const url = safeLink(logo);
  if (!url || broken) return <span className={`dd-compmark is-${size} is-letters`} aria-hidden="true">{initials}</span>;
  return (
    <span className={`dd-compmark is-${size}`}>
      {/* alt is empty on purpose: the name is always beside the mark, and a screen reader saying
          the organisation twice is noise, not access. */}
      <img src={url} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
    </span>
  );
}

/** Every http(s) URL in a free-text source line, so a citation can be OPENED rather than re-typed.
 *  The words stay: "their site and the coverage of the launch" reads as written, with the links
 *  pulled out beside it. */
export function sourceLinks(text) {
  return [...String(text || '').matchAll(/https?:\/\/[^\s,;)]+/g)]
    .map((m) => m[0].replace(/[.,;]+$/, ''))
    .filter((u, i, a) => a.indexOf(u) === i)
    .map((u) => { try { return { url: u, host: new URL(u).hostname.replace(/^www\./, '') }; } catch { return null; } })
    .filter(Boolean);
}

export default function CompetitorPage({
  slug, item, plan, log, staff, canAuthor, onEdit, onSaveField,
}) {
  const can = staff ? (canAuthor || { can: false }) : { can: false };
  const entries = useMemo(() => historyOf(log || [], item.id), [log, item.id]);
  const links = sourceLinks(item.source);

  return (
    <div className="ca-wrap dd-wrap">
      <nav className="dd-crumb" aria-label="Breadcrumb">
        <a href={deepDiveHref(slug)}>&larr; {plan.engagement?.client || 'Record'}</a>
        <span aria-hidden="true"> &middot; </span>
        <span>Competitors</span>
      </nav>
      {plan && <RecordSearch slug={slug} plan={plan} />}

      <header className="dd-head dd-comp-head">
        <CompMark name={item.name} logo={item.logo} size="lg" />
        <div>
          <div className="dd-kicker"><Labelled icon="market">In this market</Labelled></div>
          <h1 className="dd-qh1">{item.name}</h1>
          {links.length > 0 && (
            <p className="dd-comp-links">
              {links.map((l) => (
                <a key={l.url} className="dd-out dd-out-sm" href={safeLink(l.url)} target="_blank" rel="noopener noreferrer">
                  {Icon.link({ size: 13 })} {l.host}
                </a>
              ))}
            </p>
          )}
        </div>
        {staff && (
          <button type="button" className="gs-btn ghost sm dd-comp-editall" onClick={() => onEdit(item)}>
            Edit this competitor
          </button>
        )}
      </header>

      <div className="dd-comp-cols">
        <article className="org-sec dd-sec">
          <h2><Labelled icon="compare">Where they meet the client</Labelled></h2>
          <InlineText value={item.overlaps} onSave={(v) => onSaveField(item, { overlaps: v })} can={can}
            label="Where they meet the client" rows={4}
            placeholder="The ground the two of them are actually contesting."
            empty="Not established. Overlap is the whole reason a name is on this list, so this is a gap." />
        </article>
        <article className="org-sec dd-sec">
          <h2><Labelled icon="evidence">What we found</Labelled></h2>
          <InlineText value={item.evidence} onSave={(v) => onSaveField(item, { evidence: v })} can={can}
            label="What we found" rows={8}
            placeholder="What we actually established, not what we assume."
            empty="Nothing recorded, so this is a name rather than a finding." />
        </article>
      </div>

      <section className="org-sec dd-sec dd-comp-src-card">
        <h2><Labelled icon="source">Where we found it</Labelled></h2>
        <p className="dd-sub-lead">A desk-research claim with no source is a rumour. This is where somebody else can go and check.</p>
        <InlineText value={item.source} onSave={(v) => onSaveField(item, { source: v })} can={can}
          label="Where we found it" rows={2}
          placeholder="The site, the filing, the person who told us"
          empty="No source recorded." />
      </section>

      {staff && entries.length > 0 && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="history">What has changed</Labelled></h2>
          <ChangeLog entries={entries} />
        </section>
      )}
    </div>
  );
}
