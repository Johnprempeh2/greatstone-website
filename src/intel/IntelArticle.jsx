// A single briefing's own article page (#intel/<id>). Renders inside the site chrome (Header above,
// Footer below) like any other page — a full-bleed generative cover, the byline, the standfirst, the
// Greatstone read as a featured analysis block, the source, and related briefings. Opening a story
// here (instead of expanding it inline in the feed) is what John asked for: each report gets its page.
import React, { useMemo, useEffect, useRef } from 'react';
import buildIntel, { TOPIC_LABEL, TOPIC_HUE } from '../data/ai-intel.mjs';
import { recordRead, recordVendor, recordDwell } from './interest.js';
import Logo from './Logo.jsx';
import BriefingArt from './BriefingArt.jsx';
import { readTime, briefHref, kickerStyle } from './articleMeta.js';
import './intel.css';

const fmtLong = (s) => { try { return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return s; } };
const fmtShort = (s) => { try { return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); } catch { return s; } };
const hueOf = (b) => { const t = (b.topics || [])[0]; return t != null && TOPIC_HUE[t] != null ? TOPIC_HUE[t] : 84; };

// A compact related-story card (reuses the feed card styling); the heading link stretches over the card.
function RelatedCard({ b }) {
  const k = (b.topics || [])[0];
  const hue = hueOf(b);
  return (
    <article className="ih-brief">
      <div className="ih-brief-media">
        <BriefingArt brief={b} className="card" />
        {k && <span className="ih-art-kicker" style={kickerStyle(hue)}>{TOPIC_LABEL[k] || k}</span>}
      </div>
      <div className="ih-brief-body">
        <div className="ih-brief-top">
          <Logo domain={b.vendorDomain} name={b.vendor} />
          <span className="ih-brief-vendor">{b.vendor}</span>
          <span className="ih-brief-date">{fmtShort(b.date)}</span>
        </div>
        <h3 className="ih-brief-h"><a className="ih-brief-link" href={briefHref(b.id)}>{b.headline}</a></h3>
        <p>{b.summary}</p>
        <span className="ih-readmore" aria-hidden="true">{readTime(b)} min read<span className="ih-arrow">→</span></span>
      </div>
    </article>
  );
}

export default function IntelArticle({ id, onBack }) {
  const intel = useMemo(() => buildIntel(), []);
  const b = useMemo(() => (intel.briefings || []).find((x) => x.id === id) || null, [intel, id]);
  const readRef = useRef(null);

  // record the read once per article (weights topics/vendor for "For you") and open at the top. Guard
  // against StrictMode's double-invoke so a single open never counts as two reads.
  useEffect(() => {
    if (!b || readRef.current === b.id) return;
    readRef.current = b.id;
    recordRead(b, 0);
    try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch { window.scrollTo(0, 0); }
  }, [b]);
  // keep the tab title on the headline (separate, un-guarded: App's head effect can re-assert a generic
  // "Briefing" title on an unrelated re-render while parked here, so re-set it whenever the briefing resolves)
  useEffect(() => { if (b) document.title = b.headline + ' · Greatstone Intelligence'; }, [b]);
  // dwell as a sales signal: how long the visitor stayed on this briefing (fires on leave / id change).
  // recordDwell ignores sub-400ms bounces, and StrictMode's immediate cleanup records ~0ms (ignored).
  useEffect(() => {
    if (!b) return undefined;
    const at = Date.now();
    return () => recordDwell(b.id, Date.now() - at);
  }, [b]);

  if (!b) {
    return (
      <div className="ih-root ih-article-root">
        <div className="ih-grain" aria-hidden="true" />
        <div className="ih-article-missing">
          <span className="ih-eyebrow">Greatstone Intelligence</span>
          <h1 className="ih-h2">This briefing isn&rsquo;t in the current edition</h1>
          <p className="ih-sub">It may have rolled off as the briefing was rebuilt. Head back for what&rsquo;s live now.</p>
          <button className="ih-back solid" onClick={onBack}>&larr; Back to Intelligence</button>
        </div>
      </div>
    );
  }

  const lead = (b.topics || [])[0];
  const hue = hueOf(b);
  const related = (intel.briefings || [])
    .filter((x) => x.id !== b.id && (x.topics || []).some((t) => (b.topics || []).includes(t)))
    .map((x) => ({ x, shared: (x.topics || []).filter((t) => (b.topics || []).includes(t)).length }))
    .sort((a, c) => (c.shared - a.shared) || ((+new Date(c.x.date) || 0) - (+new Date(a.x.date) || 0)))
    .slice(0, 3).map((o) => o.x);

  return (
    <div className="ih-root ih-article-root">
      <div className="ih-grain" aria-hidden="true" />
      <article className="ih-article">
        <header className="ih-art-hero">
          <BriefingArt brief={b} className="hero" />
          <div className="ih-art-hero-grad" aria-hidden="true" />
          <div className="ih-art-hero-inner">
            <a className="ih-back" href={briefHref('')} onClick={(e) => { e.preventDefault(); onBack(); }}>&larr; Intelligence</a>
            {lead && <span className="ih-art-kicker big" style={kickerStyle(hue)}>{TOPIC_LABEL[lead] || lead}</span>}
            <h1 className="ih-art-h">{b.headline}</h1>
            <div className="ih-art-byline">
              <Logo domain={b.vendorDomain} name={b.vendor} className="ih-art-logo" />
              <span className="ih-art-vendor">{b.vendor}</span>
              <span className="ih-art-sep" aria-hidden="true" />
              <time dateTime={b.date}>{fmtLong(b.date)}</time>
              <span className="ih-art-sep" aria-hidden="true" />
              <span>{readTime(b)} min read</span>
            </div>
          </div>
        </header>

        <div className="ih-article-body">
          <p className="ih-art-stand">{b.summary}</p>

          <aside className="ih-art-read" style={{ borderColor: `hsl(${hue} 60% 50% / .5)` }}>
            <span className="ih-art-read-lbl">The Greatstone read</span>
            <p>{b.take}</p>
          </aside>

          <div className="ih-art-foot">
            <div className="ih-art-tags">
              {(b.topics || []).map((t) => (
                <span key={t} className="ih-art-tag" style={{ borderColor: `hsl(${TOPIC_HUE[t] || 84} 55% 50% / .4)`, color: `hsl(${TOPIC_HUE[t] || 84} 72% 72%)` }}>{TOPIC_LABEL[t] || t}</span>
              ))}
            </div>
            {b.sourceUrl && <a className="ih-art-source" href={b.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={() => recordVendor(b.vendorDomain)}>Source: {b.sourceName}<span aria-hidden="true"> ↗</span></a>}
          </div>
        </div>

        {related.length > 0 && (
          <section className="ih-related" aria-label="Related briefings">
            <div className="ih-related-head"><h2 className="ih-related-h">More from the briefing</h2>
              <a className="ih-related-all" href={briefHref('')} onClick={(e) => { e.preventDefault(); onBack(); }}>All briefings &rarr;</a></div>
            <div className="ih-grid">{related.map((r) => <RelatedCard key={r.id} b={r} />)}</div>
          </section>
        )}
      </article>
    </div>
  );
}
