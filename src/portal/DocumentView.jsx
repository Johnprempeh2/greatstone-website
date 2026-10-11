// The portal reader (GRE-1256; spec GRE-1227 revision 2, section 2): one document, one column, readable on a phone.
// Used by the client's #portal/doc/<id> and by staff "Preview as the client" (same component, the draft row).
// Section HTML is sanitised again here, whatever wrote it. Demos sit after the section they belong to and open
// in a new tab. On wide screens a contents list sits beside the text.
import React, { useMemo } from 'react';
import { sanitizeHtml } from '../lib/sanitize-html.mjs';
import { KIND_LABEL, placeDemos } from './portal-model.mjs';
import { PRIVACY_NOTE_TITLE, PRIVACY_NOTE_BODY, PRIVACY_LINK_TEXT, PRIVACY_HREF } from './wording.mjs';

const anchor = (id) => 'pt-sec-' + String(id).replace(/[^\w-]/g, '');
// hash routes own location.hash, so contents links move focus and scroll instead of changing the hash
const jump = (e, id) => {
  e.preventDefault();
  const el = document.getElementById(anchor(id));
  if (!el) return;
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  el.focus({ preventScroll: true });
};

function Demos({ list }) {
  if (!list || !list.length) return null;
  return (
    <aside className="pt-demos" aria-label="Demos">
      <h3 className="pt-demos-h">{list.length === 1 ? 'Demo' : 'Demos'}</h3>
      <ul>
        {list.map((d, i) => (
          <li key={i}>
            <a href={d.url} target="_blank" rel="noopener noreferrer">{d.label}<span className="gs-sr-only"> (opens in a new tab)</span><span aria-hidden="true"> ↗</span></a>
            {d.note && <span className="pt-demo-note">{d.note}</span>}
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function PrivacyNote() {
  const [before, after] = PRIVACY_NOTE_BODY.split('{privacy_link}');
  return (
    <p className="pt-privacy"><b>{PRIVACY_NOTE_TITLE}</b> {before}<a href={PRIVACY_HREF}>{PRIVACY_LINK_TEXT}</a>{after}</p>
  );
}

export default function DocumentView({ doc, children, headingId = 'pt-doc-title' }) {
  const sections = (doc.body && Array.isArray(doc.body.sections)) ? doc.body.sections : [];
  const clean = useMemo(() => sections.map((s) => sanitizeHtml(s.html || '')), [doc.body]); // eslint-disable-line react-hooks/exhaustive-deps
  const { after, end } = placeDemos(sections, doc.demos || []);
  return (
    <article className="pt-doc" aria-labelledby={headingId}>
      <header className="pt-doc-head">
        <span className="st-kicker">{KIND_LABEL[doc.kind] || 'Document'}</span>
        <h1 id={headingId} className="pt-doc-title" tabIndex={-1}>{doc.title}</h1>
        <p className="pt-doc-meta">Version {doc.version}{doc.content_sha256 ? <> · <span className="pt-sha" title="Fingerprint (SHA-256) of this version">Fingerprint {doc.content_sha256.slice(0, 12)}…</span></> : null}</p>
        {doc.summary && <p className="pt-doc-summary">{doc.summary}</p>}
      </header>
      <div className="pt-doc-grid">
        {sections.length > 1 && (
          <nav className="pt-toc" aria-label="Contents">
            <h2 className="pt-toc-h">Contents</h2>
            <ol>{sections.map((s) => <li key={s.id}><a href={'#' + anchor(s.id)} onClick={(e) => jump(e, s.id)}>{s.title}</a></li>)}</ol>
          </nav>
        )}
        <div className="pt-doc-body">
          {sections.length === 0 && <p className="pt-muted">This document has no sections yet.</p>}
          {sections.map((s, i) => (
            <section key={s.id} className="pt-sec" aria-labelledby={anchor(s.id)}>
              <h2 id={anchor(s.id)} tabIndex={-1}>{s.title}</h2>
              <div className="pt-prose" dangerouslySetInnerHTML={{ __html: clean[i] }} />
              <Demos list={after[s.id]} />
            </section>
          ))}
          <Demos list={end} />
          {children}
        </div>
      </div>
    </article>
  );
}
