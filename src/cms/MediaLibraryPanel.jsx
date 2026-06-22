import { useState, useRef } from 'react';
import PanelFrame from './PanelFrame.jsx';

const MAX_UPLOAD = 600 * 1024; // 600 KB cap, matches the MediaField picker (the prototype stores data URLs)

// Standalone media-library management. The MediaField picker only ADDS + CHOOSES an image inline on a
// block; this is the one place to CURATE the library: fix each image's alt text (accessibility), add new
// ones (URL or small upload), and delete the ones no longer used. Backed by the same state.assets registry.
export default function MediaLibraryPanel({ assets = [], onAdd, onUpdateAlt, onRemove, onClose, embedded }) {
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  const fileRef = useRef(null);
  const addUrl = () => {
    const u = url.trim(); if (!u) return;
    if (assets.some((a) => a.url === u)) { setErr('That image is already in your library.'); return; } // addAsset dedupes by url; tell the user instead of silently clearing
    onAdd({ url: u, alt: '' }); setUrl(''); setErr('');
  };
  const onFile = (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    if (!/^image\//.test(f.type)) { setErr('Please choose an image file.'); return; }
    if (f.size > MAX_UPLOAD) { setErr('That image is over 600 KB. For the prototype, host it and paste the URL instead.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      if (assets.some((a) => a.url === reader.result)) { setErr('That image is already in your library.'); return; }
      onAdd({ url: reader.result, alt: f.name.replace(/\.[^.]+$/, '') });
    };
    reader.readAsDataURL(f);
    e.target.value = '';
  };
  return (
    <PanelFrame embedded={embedded} label="Media library" name="Media library" onClose={onClose}>
      <div className="gs-panel-body">
        <p className="gs-field-hint" style={{ marginTop: 0, marginBottom: 14 }}>Every image your team has added. Give each a clear alt text for accessibility, and remove the ones you no longer use.</p>
        <div className="gs-mp-add">
          <input value={url} onChange={(e) => { setUrl(e.target.value); setErr(''); }} placeholder="Paste an image URL…" aria-label="Image URL" onKeyDown={(e) => { if (e.key === 'Enter') addUrl(); }} />
          <button className="gs-btn primary sm" onClick={addUrl}>Add</button>
          <button className="gs-btn ghost sm" onClick={() => fileRef.current && fileRef.current.click()}>Upload</button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
        </div>
        {err && <p className="gs-mp-err" role="alert">{err}</p>}
        {assets.length === 0 ? (
          <p className="gs-empty" style={{ marginTop: 16 }}>No images yet. Paste a URL or upload a small image to start your library.</p>
        ) : (
          <ul className="gs-ml-grid">
            {assets.map((a, i) => {
              // a human handle for AT: alt if set, else the filename from a real URL, else a positional label
              // (data: URLs have no useful path segment, so fall through to "image N")
              const name = a.alt || (a.url && !a.url.startsWith('data:') ? a.url.split('/').pop() : '') || ('image ' + (i + 1));
              return (
              <li key={a.id} className="gs-ml-item">
                <span className="gs-ml-thumb"><img src={a.url} alt={a.alt || ''} loading="lazy" onError={(e) => { e.currentTarget.style.opacity = '.25'; }} /></span>
                <label className="gs-ml-alt">
                  <span className="gs-field-hint">Alt text</span>
                  <input defaultValue={a.alt || ''} placeholder="Describe this image" aria-label={'Alt text for ' + name} onBlur={(e) => { const v = e.target.value; if (v !== (a.alt || '')) onUpdateAlt(a.id, v); }} />
                </label>
                <button className="gs-btn ghost sm gs-ml-del" onClick={() => onRemove(a.id)} aria-label={'Delete ' + name}>Delete</button>
              </li>
              );
            })}
          </ul>
        )}
      </div>
    </PanelFrame>
  );
}
