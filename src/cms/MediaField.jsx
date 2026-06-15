import { createContext, useContext, useState, useEffect, useRef } from 'react';

// Media wiring. App provides the library + an addAsset registrar through MediaContext; the
// blocks' image fields use <MediaField> as a Puck custom field. The stored prop value is the
// image URL itself (serialisable, decoupled from the store); the library just lets the team
// re-pick a URL they've used before. Upload converts small files to data URLs (bounded, since
// the prototype store is localStorage); the real backend will host the bytes and return a URL.
export const MediaContext = createContext({ assets: [], addAsset: () => {} });
const MAX_UPLOAD = 600 * 1024;

export function MediaField(props) {
  const { value, onChange } = props;
  const [open, setOpen] = useState(false);
  return (
    <div className="gs-mf">
      {value ? (
        <div className="gs-mf-have">
          <img className="gs-mf-thumb" src={value} alt="" />
          <div className="gs-mf-actions">
            <button type="button" className="gs-btn ghost sm" onClick={() => setOpen(true)}>Replace</button>
            <button type="button" className="gs-btn ghost sm" onClick={() => onChange('')}>Remove</button>
          </div>
        </div>
      ) : (
        <button type="button" className="gs-mf-empty" onClick={() => setOpen(true)}>+ Choose image</button>
      )}
      {open && <MediaPicker current={value} onPick={(url) => { onChange(url); setOpen(false); }} onClose={() => setOpen(false)} />}
    </div>
  );
}

export function MediaPicker({ current, onPick, onClose }) {
  const { assets, addAsset } = useContext(MediaContext);
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  const fileRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const choose = (u, alt) => { if (!u) return; addAsset({ url: u, alt: alt || '' }); onPick(u); };
  const addUrl = () => { const u = url.trim(); if (!u) return; choose(u); };
  const onFile = (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    if (!/^image\//.test(f.type)) { setErr('Please choose an image file.'); return; }
    if (f.size > MAX_UPLOAD) { setErr('That image is over 600 KB. For the prototype, host it and paste the URL instead.'); return; }
    const reader = new FileReader();
    reader.onload = () => choose(reader.result, f.name);
    reader.readAsDataURL(f);
  };

  return (
    <div className="gs-mp-backdrop" onMouseDown={onClose}>
      <div className="gs-mp" role="dialog" aria-label="Choose image" onMouseDown={(e) => e.stopPropagation()}>
        <div className="gs-mp-head"><h3>Media library</h3><button className="gs-x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="gs-mp-body">
          <div className="gs-mp-add">
            <input value={url} onChange={(e) => { setUrl(e.target.value); setErr(''); }} placeholder="Paste an image URL…" onKeyDown={(e) => { if (e.key === 'Enter') addUrl(); }} />
            <button className="gs-btn primary sm" onClick={addUrl}>Add</button>
            <button className="gs-btn ghost sm" onClick={() => fileRef.current && fileRef.current.click()}>Upload</button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          </div>
          {err && <p className="gs-mp-err" role="alert">{err}</p>}
          {assets.length === 0 ? (
            <p className="gs-empty">No images yet. Paste a URL or upload a small image to start your library.</p>
          ) : (
            <div className="gs-mp-grid">
              {assets.map((a) => (
                <button key={a.id} type="button" className={'gs-mp-item' + (a.url === current ? ' is-current' : '')} onClick={() => onPick(a.url)} title={a.alt || a.url}>
                  <img src={a.url} alt={a.alt || ''} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
