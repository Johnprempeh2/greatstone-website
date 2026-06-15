import { useState, useEffect } from 'react';
import { MediaField } from './MediaField.jsx';

// In-context SEO: edit the meta title/description and watch a live Google result and social
// card update, with length guidance (green in range, amber out). Catches the silent SEO
// mistakes (missing/over-long meta) before publish, where marketing can actually see them.
function meter(len, lo, hi) {
  const ok = len >= lo && len <= hi;
  return { cls: len === 0 ? 'is-empty' : ok ? 'is-ok' : 'is-warn', note: len === 0 ? 'empty' : ok ? 'good length' : len < lo ? 'a little short' : 'too long, will truncate' };
}

export default function SeoPanel({ seo, pageTitle, slug, onChange, onSlug, slugLocked, onClose }) {
  const title = seo.title || '';
  const desc = seo.description || '';
  const shownTitle = title || (pageTitle + ' — Greatstone International');
  const shownDesc = desc || 'Add a description so search and social show the right summary.';
  const url = 'greatstone.com' + (slug === 'home' ? '' : '/' + slug);
  const tm = meter(title.length, 40, 60);
  const dm = meter(desc.length, 110, 158);
  const set = (k, v) => onChange({ ...seo, [k]: v });

  // editable URL slug (commits on blur / Enter; reserved pages are read-only)
  const [slugDraft, setSlugDraft] = useState(slug);
  useEffect(() => setSlugDraft(slug), [slug]);
  const commitSlug = () => { const v = (slugDraft || '').trim(); if (v && v !== slug && onSlug) onSlug(v); };

  return (
    <aside className="gs-panel" role="dialog" aria-label="SEO">
      <div className="gs-panel-head">
        <h3>SEO &amp; social</h3>
        <button className="gs-x" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="gs-panel-body">
        <label className="gs-field">
          <span className="gs-field-label">Page URL {slugLocked && <em className="gs-meter is-empty">fixed</em>}</span>
          <input value={slugDraft} disabled={slugLocked} aria-label="Page URL slug"
            onChange={(e) => setSlugDraft(e.target.value)} onBlur={commitSlug}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
          <span className="gs-field-hint">{slugLocked ? 'Other pages link to this URL, so it’s fixed.' : 'The old path will 301-redirect after a change.'}</span>
        </label>
        <label className="gs-field">
          <span className="gs-field-label">Meta title <em className={'gs-meter ' + tm.cls}>{title.length} · {tm.note}</em></span>
          <input value={title} onChange={(e) => set('title', e.target.value)} placeholder={pageTitle + ' — Greatstone International'} />
        </label>
        <label className="gs-field">
          <span className="gs-field-label">Meta description <em className={'gs-meter ' + dm.cls}>{desc.length} · {dm.note}</em></span>
          <textarea rows={3} value={desc} onChange={(e) => set('description', e.target.value)} placeholder="One honest line about this page." />
        </label>
        <div className="gs-field">
          <span className="gs-field-label">Social image</span>
          <MediaField value={seo.ogImage || ''} onChange={(v) => set('ogImage', v)} />
        </div>

        <div className="gs-preview-label">Search result</div>
        <div className="gs-serp">
          <div className="gs-serp-url">{url}</div>
          <div className="gs-serp-title">{shownTitle}</div>
          <div className="gs-serp-desc">{shownDesc}</div>
        </div>

        <div className="gs-preview-label">Social card</div>
        <div className="gs-social">
          <div className="gs-social-img" style={seo.ogImage ? { backgroundImage: `url(${seo.ogImage})` } : undefined}>
            {!seo.ogImage && <span>no image set</span>}
          </div>
          <div className="gs-social-meta">
            <div className="gs-social-domain">greatstone.com</div>
            <div className="gs-social-title">{shownTitle}</div>
            <div className="gs-social-desc">{shownDesc}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
