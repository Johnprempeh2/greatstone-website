// The portal's Prototypes section (John, 14 Nov): the prototypes Greatstone chose to show this client's organisation.
// The list comes from /api/portal-prototypes, which reads the session's organisation only; each opens in a new tab.
import React, { useEffect, useState } from 'react';

export default function PortalPrototypes() {
  const [items, setItems] = useState(undefined);
  useEffect(() => {
    let active = true;
    fetch('/api/portal-prototypes', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('unavailable'))))
      .then((body) => { if (active) setItems(Array.isArray(body.data) ? body.data : []); })
      .catch(() => { if (active) setItems(null); });
    return () => { active = false; };
  }, []);
  // Nothing shared: no section, so a client without prototypes never sees an empty heading.
  if (Array.isArray(items) && items.length === 0) return null;
  return (
    <section className="pt-card" aria-labelledby="pt-protos">
      <h2 id="pt-protos" className="pt-h2">Prototypes</h2>
      {items === undefined && <p className="pt-muted" aria-busy="true">Loading prototypes…</p>}
      {items === null && <p role="alert">Your prototypes could not load. Refresh the page to try again.</p>}
      {Array.isArray(items) && (
        <ul className="pt-protos">
          {items.map((p) => (
            <li key={p.id}>
              <a className="pt-proto" href={p.url} target="_blank" rel="noopener noreferrer">
                {p.thumbnail
                  ? <img className="pt-proto-img" src={p.thumbnail} alt="" loading="lazy" />
                  : <span className="pt-proto-img pt-proto-none" aria-hidden="true" />}
                <span className="pt-item-t">{p.title}</span>
                {p.description && <span className="pt-item-m">{p.description}</span>}
                <span className="pt-item-m">Version {p.version} · opens in a new tab<span className="gs-sr-only"> ({new URL(p.url).host})</span></span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
