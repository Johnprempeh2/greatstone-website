import { createContext, useContext } from 'react';
import { LINK_KINDS, describeLink } from '../lib/link-resolver.mjs';

// A reusable custom Puck field for "where does this button/link go?" — the same mechanism as MediaField.
// A block declares e.g. `cta: { type: 'custom', label: 'Button link', render: (p) => <LinkField {...p} /> }`
// and renders the stored value through resolveLink(). The stored value is a structured object
// { kind, page, url, email, anchor, newTab }; legacy string values (from before this field) still load
// and are upgraded to an object on first edit. The page list comes from LinkContext (App provides it).
export const LinkContext = createContext({ pages: {}, order: [] });

const BLANK = { kind: 'page', page: '', url: '', email: '', anchor: '', newTab: false };

// Normalise either a legacy string or a stored object into the editable model the field renders.
// (Pure: never calls onChange, so existing string values stay strings on disk until the user edits.)
function coerce(value) {
  if (value && typeof value === 'object') return { ...BLANK, ...value, kind: value.kind || 'url' };
  const v = String(value == null ? '' : value).trim();
  if (!v || v === '#') return { ...BLANK };
  if (v === '#book') return { ...BLANK, kind: 'booking' };
  const m = v.match(/^#go\/([\w-]+)$/);
  if (m) return { ...BLANK, kind: 'page', page: m[1] };
  if (v.startsWith('mailto:')) return { ...BLANK, kind: 'email', email: v.slice(7) };
  if (v.startsWith('#')) return { ...BLANK, kind: 'anchor', anchor: v.slice(1) };
  return { ...BLANK, kind: 'url', url: v };
}

export function LinkField({ value, onChange }) {
  const { pages, order } = useContext(LinkContext);
  const model = coerce(value);
  const set = (patch) => onChange({ ...model, ...patch });

  return (
    <div className="gs-lf">
      <select className="gs-lf-kind" value={model.kind} onChange={(e) => set({ kind: e.target.value })} aria-label="Link type">
        {LINK_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
      </select>

      {model.kind === 'page' && (
        <select className="gs-lf-in" value={model.page} onChange={(e) => set({ page: e.target.value })} aria-label="Page">
          <option value="">Choose a page…</option>
          {(order || []).map((slug) => <option key={slug} value={slug}>{(pages[slug] && pages[slug].title) || slug}</option>)}
        </select>
      )}
      {model.kind === 'url' && (
        <>
          <input className="gs-lf-in" value={model.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://example.com" inputMode="url" />
          <label className="gs-lf-tab"><input type="checkbox" checked={!!model.newTab} onChange={(e) => set({ newTab: e.target.checked })} /> Open in a new tab</label>
        </>
      )}
      {model.kind === 'email' && (
        <input className="gs-lf-in" value={model.email} onChange={(e) => set({ email: e.target.value })} placeholder="name@greatstone.dev" inputMode="email" />
      )}
      {model.kind === 'anchor' && (
        <input className="gs-lf-in" value={model.anchor} onChange={(e) => set({ anchor: e.target.value })} placeholder="section-id (a block on this page)" />
      )}
      {model.kind === 'booking' && (
        <p className="gs-lf-note">Opens the on-site booking flow — the same as the header “Book a Diagnostic” button.</p>
      )}

      <p className="gs-lf-preview" aria-live="polite">→ {describeLink(model, pages)}</p>
    </div>
  );
}

export default LinkField;
