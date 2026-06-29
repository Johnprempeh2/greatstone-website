import { useState } from 'react';
import PanelFrame from './PanelFrame.jsx';
import { catalogStats, serviceSlug, duplicateSlugs, patchAt, removeAt, insertAt, moveAt, blankService, blankCategory } from '../lib/service-admin.mjs';

// Services manager: a first-class surface to control the Managed Services catalogue without digging into
// the page editor. Reads/writes the ServiceCatalog block's services[] + categories[] (the single source the
// public listing, the per-service detail pages and the inquiry all share). onChange(patch) writes the patch
// back to that block's DRAFT — so changes flow through the normal review/publish queue before going live.
export default function ServicesManagerPanel({ catalog, onChange, onNotify, onClose, embedded }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null); // index of the service whose editor is expanded

  if (!catalog) {
    return (
      <PanelFrame embedded={embedded} label="Services" name="Services" onClose={onClose}>
        <div className="gs-panel-body">
          <p className="gs-la-clean" role="status">No service catalogue found. Add a “Service catalogue” block to a page (e.g. the Services page) and it will appear here to manage.</p>
        </div>
      </PanelFrame>
    );
  }

  const services = catalog.services;
  const categories = catalog.categories;
  const stats = catalogStats(catalog);
  const dupes = duplicateSlugs(services);
  const catNames = categories.map((c) => c.name).filter(Boolean);

  // --- service mutations (write the whole new array back to the block draft) ---
  const setServices = (next) => onChange({ services: next });
  const patchService = (i, patch) => setServices(patchAt(services, i, patch));
  const addService = () => { const next = insertAt(services, services.length, blankService(catNames[0] || '')); setServices(next); setOpen(next.length - 1); };
  const dupService = (i) => { const copy = { ...services[i], name: services[i].name + ' (copy)', slug: '' }; setServices(insertAt(services, i + 1, copy)); };
  const removeService = (i) => {
    const removed = services[i];
    const next = removeAt(services, i);
    setServices(next);
    if (open === i) setOpen(null);
    // offer an undo: re-insert the removed service at its original index (the toast is owned by App).
    if (onNotify) onNotify({ message: 'Removed ' + (removed.name || 'service') + '.', undo: () => setServices(insertAt(next, i, removed)) });
  };
  const moveService = (i, d) => { setServices(moveAt(services, i, d)); if (open === i) setOpen(i + d); };
  const patchBullet = (si, bi, text) => patchService(si, { bullets: patchAt(services[si].bullets || [], bi, { text }) });

  // --- category mutations ---
  const setCats = (next) => onChange({ categories: next });

  const shown = services.map((s, i) => ({ s, i })).filter(({ s }) => {
    const t = q.trim().toLowerCase();
    return !t || (s.name + ' ' + (s.category || '') + ' ' + (s.oneLiner || '')).toLowerCase().includes(t);
  });

  return (
    <PanelFrame embedded={embedded} label={<>Services <span className="gs-panel-count">{stats.services}</span></>} name="Services" onClose={onClose}>
      <div className="gs-panel-body">
        <p className="gs-field-hint" style={{ marginTop: 0 }}>
          {stats.services} services · {stats.categories} categories · {stats.featured} featured · {stats.isNew} new. Edits
          land as an unpublished draft on <strong>{catalog.title}</strong>, then go live from Releases. Each service has its own page at <code>#service/&lt;slug&gt;</code>.
        </p>
        {dupes.length ? <p className="gs-rev-what" style={{ color: 'var(--gs-warning)' }}>Two or more services share a URL slug ({dupes.join(', ')}). Give each a unique slug so their detail pages don’t collide.</p> : null}

        <label className="gs-field">
          <span className="gs-field-label">Inquiry email</span>
          <input value={catalog.email} onChange={(e) => onChange({ inquiryEmail: e.target.value })} placeholder="dx@greatstonesoftware.co.uk" />
          <span className="gs-field-hint">Where the “inquire about these services” email is addressed.</span>
        </label>

        <details className="gs-svc-cats">
          <summary>Categories ({stats.categories})</summary>
          <ul className="gs-svc-catlist">
            {categories.map((c, i) => (
              <li key={i} className="gs-svc-catrow">
                <input className="gs-svc-catname" value={c.name} onChange={(e) => setCats(patchAt(categories, i, { name: e.target.value }))} placeholder="Category name" aria-label="Category name" />
                <input className="gs-svc-catblurb" value={c.blurb || ''} onChange={(e) => setCats(patchAt(categories, i, { blurb: e.target.value }))} placeholder="Short blurb" aria-label="Category blurb" />
                <span className="gs-svc-rowacts">
                  <button onClick={() => setCats(moveAt(categories, i, -1))} disabled={i === 0} aria-label="Move category up" title="Move up">↑</button>
                  <button onClick={() => setCats(moveAt(categories, i, 1))} disabled={i === categories.length - 1} aria-label="Move category down" title="Move down">↓</button>
                  <button onClick={() => setCats(removeAt(categories, i))} aria-label="Remove category" title="Remove" className="gs-svc-del">×</button>
                </span>
              </li>
            ))}
          </ul>
          <button className="gs-btn ghost sm" onClick={() => setCats(insertAt(categories, categories.length, blankCategory()))}>+ Add category</button>
        </details>

        <div className="gs-svc-bar">
          <input className="gs-svc-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services…" aria-label="Search services" />
          <button className="gs-btn primary sm" onClick={addService}>+ Add service</button>
        </div>

        <ul className="gs-svc-list">
          {services.length === 0
            ? <li className="gs-empty">No services yet. Add your first service to build the Managed Services catalogue.</li>
            : shown.length === 0
              ? <li className="gs-empty">No services match “{q}”.</li>
              : shown.map(({ s, i }) => (
            <li key={i} className={'gs-svc-row' + (open === i ? ' is-open' : '')}>
              <div className="gs-svc-head">
                <button className="gs-svc-name" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                  <span>{s.name || '(untitled)'}</span>
                  <span className="gs-svc-sub">{s.category || 'Uncategorised'} · /{serviceSlug(s) || 'no-slug'}</span>
                </button>
                <span className="gs-svc-flags">
                  <button className={'gs-svc-flag' + (s.featured ? ' on' : '')} onClick={() => patchService(i, { featured: !s.featured })} aria-pressed={!!s.featured} title="Featured">★ Featured</button>
                  <button className={'gs-svc-flag' + (s.isNew ? ' on' : '')} onClick={() => patchService(i, { isNew: !s.isNew })} aria-pressed={!!s.isNew} title="New">New</button>
                </span>
                <span className="gs-svc-rowacts">
                  <button onClick={() => moveService(i, -1)} disabled={i === 0} aria-label="Move up" title="Move up">↑</button>
                  <button onClick={() => moveService(i, 1)} disabled={i === services.length - 1} aria-label="Move down" title="Move down">↓</button>
                  <button onClick={() => dupService(i)} aria-label="Duplicate" title="Duplicate">⧉</button>
                  <button onClick={() => removeService(i)} aria-label="Remove service" title="Remove" className="gs-svc-del">×</button>
                </span>
              </div>

              {open === i ? (
                <div className="gs-svc-edit">
                  <div className="gs-svc-grid">
                    <label className="gs-field"><span className="gs-field-label">Name</span><input value={s.name || ''} onChange={(e) => patchService(i, { name: e.target.value })} /></label>
                    <label className="gs-field"><span className="gs-field-label">Slug (URL; blank = auto)</span><input value={s.slug || ''} onChange={(e) => patchService(i, { slug: e.target.value })} placeholder={serviceSlug({ name: s.name })} /></label>
                    <label className="gs-field"><span className="gs-field-label">Category</span>
                      <input list="gs-svc-cats-dl" value={s.category || ''} onChange={(e) => patchService(i, { category: e.target.value })} />
                    </label>
                    <label className="gs-field"><span className="gs-field-label">How we deliver it</span><input value={s.format || ''} onChange={(e) => patchService(i, { format: e.target.value })} placeholder="Build / Build + Run / Subscription…" /></label>
                  </div>
                  <label className="gs-field"><span className="gs-field-label">One-liner</span><textarea rows={2} value={s.oneLiner || ''} onChange={(e) => patchService(i, { oneLiner: e.target.value })} /></label>
                  <label className="gs-field"><span className="gs-field-label">The payback</span><textarea rows={2} value={s.outcome || ''} onChange={(e) => patchService(i, { outcome: e.target.value })} /></label>
                  <label className="gs-field"><span className="gs-field-label">Ideal for</span><input value={s.idealClient || ''} onChange={(e) => patchService(i, { idealClient: e.target.value })} /></label>
                  <div className="gs-field">
                    <span className="gs-field-label">What we build</span>
                    <ul className="gs-svc-bullets">
                      {(s.bullets || []).map((b, bi) => (
                        <li key={bi}>
                          <input value={b.text || ''} onChange={(e) => patchBullet(i, bi, e.target.value)} placeholder="A deliverable." aria-label={'Bullet ' + (bi + 1)} />
                          <button onClick={() => patchService(i, { bullets: removeAt(s.bullets || [], bi) })} aria-label="Remove bullet" title="Remove" className="gs-svc-del">×</button>
                        </li>
                      ))}
                    </ul>
                    <button className="gs-btn ghost sm" onClick={() => patchService(i, { bullets: insertAt(s.bullets || [], (s.bullets || []).length, { text: '' }) })}>+ Add bullet</button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <datalist id="gs-svc-cats-dl">{catNames.map((n) => <option key={n} value={n} />)}</datalist>
      </div>
    </PanelFrame>
  );
}
