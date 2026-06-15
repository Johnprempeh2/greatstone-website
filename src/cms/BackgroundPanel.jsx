import { useEffect, useMemo, useState } from 'react';
import { STAGE_OPTIONS, SCENE_KINDS } from '../stage-presets.js';
import { normalizeBackground } from '../store.js';

// Granular 3D background editor ("scene track"). The page's background is a list of scenes that
// cross-fade at editable scroll points; each transition has a position (%) and a fade width. A
// live scroll-map + scrubber drives the real Stage (onPreview) so the user sees exactly where a
// handoff happens without scrolling. All edits flow up via onChange(model) → autosave.
const uid = (p) => p + '-' + Math.random().toString(36).slice(2, 8);
const KIND_LABEL = Object.fromEntries(SCENE_KINDS.map((k) => [k.id, k.label]));
const KIND_COLOR = { stone: '#1b5039', summit: '#2a6e8f', tide: '#c8ff00', tideRadial: '#9bd64a', tideCalm: '#4ecdc4' };
const fadeWord = (f) => (f <= 0.08 ? 'Hard cut' : f <= 0.16 ? 'Crisp' : f <= 0.26 ? 'Smooth' : 'Very soft');
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

export default function BackgroundPanel({ value, onChange, onPreview, onClose }) {
  const model = useMemo(() => normalizeBackground(value), [value]);
  const [scrub, setScrub] = useState(null); // 0..1 while previewing

  // materialise a preset string into the editable object once, so ids stay stable while editing
  useEffect(() => { if (!(value && typeof value === 'object' && Array.isArray(value.scenes))) onChange(model); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // stop previewing when the panel closes
  useEffect(() => () => onPreview(null), [onPreview]);

  const scenes = model.scenes || [];
  const transitions = model.transitions || [];
  const commit = (next) => onChange(next);

  const setKind = (i, kind) => commit({ ...model, scenes: scenes.map((s, k) => (k === i ? { ...s, kind } : s)) });
  const applyPreset = (id) => { const opt = STAGE_OPTIONS.find((o) => o.id === id); if (!opt) return; onChange(id); /* normalize materialises on next render */ };

  const addScene = () => {
    if (scenes.length >= 3) return;
    const prevAt = transitions.length ? transitions[transitions.length - 1].at : 0;
    const at = clamp(prevAt + (1 - prevAt) * 0.5, 0.05, 0.95);
    commit({ ...model, scenes: [...scenes, { id: uid('sc'), kind: 'tide' }], transitions: [...transitions, { id: uid('tr'), at, fade: 0.2, anchor: { type: 'scroll' } }] });
  };
  const removeScene = (i) => {
    if (scenes.length <= 1) return;
    const ns = scenes.filter((_, k) => k !== i);
    const ti = i > 0 ? i - 1 : 0; // drop the transition adjacent to the removed scene
    const nt = transitions.filter((_, k) => k !== ti);
    commit({ ...model, scenes: ns, transitions: nt });
  };
  const moveScene = (i, dir) => {
    const j = i + dir; if (j < 0 || j >= scenes.length) return;
    const ns = [...scenes]; [ns[i], ns[j]] = [ns[j], ns[i]];
    commit({ ...model, scenes: ns }); // transitions keep their positions; kinds swap above/below
  };
  const setTransition = (i, patch) => {
    const lo = i > 0 ? transitions[i - 1].at + 0.02 : 0.02;
    const hi = i < transitions.length - 1 ? transitions[i + 1].at - 0.02 : 0.98;
    const nt = transitions.map((tr, k) => {
      if (k !== i) return tr;
      const at = patch.at != null ? clamp(patch.at, lo, hi) : tr.at;
      const fade = patch.fade != null ? clamp(patch.fade, 0.04, 0.4) : tr.fade;
      return { ...tr, at, fade };
    });
    commit({ ...model, transitions: nt });
  };

  const doScrub = (v) => { const p = v === '' ? null : Number(v); setScrub(p); onPreview(p); };
  const bandStart = (k) => (k > 0 ? transitions[k - 1].at : 0);
  const bandEnd = (k) => (k < scenes.length - 1 ? transitions[k].at : 1);

  return (
    <aside className="gs-panel" role="dialog" aria-label="3D background">
      <div className="gs-panel-head">
        <h3>3D background</h3>
        <button className="gs-x" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="gs-panel-body">
        {/* live scroll-map + scrubber */}
        <div className="gs-track" aria-hidden="true">
          <div className="gs-track-bands">
            {scenes.map((s, k) => (
              <span key={s.id} className="gs-track-band" style={{ width: ((bandEnd(k) - bandStart(k)) * 100) + '%', background: KIND_COLOR[s.kind] || '#333' }}>
                {KIND_LABEL[s.kind] || s.kind}
              </span>
            ))}
          </div>
          {transitions.map((tr) => <span key={tr.id} className="gs-track-tick" style={{ left: (tr.at * 100) + '%' }} />)}
        </div>
        <div className="gs-track-scrubrow">
          <span className="gs-track-cap">Top</span>
          <input className="gs-track-scrub" type="range" min="0" max="1" step="0.005" value={scrub == null ? 0 : scrub}
            onChange={(e) => doScrub(e.target.value)} aria-label="Preview scroll position" />
          <span className="gs-track-cap">Bottom</span>
        </div>
        <p className="gs-track-hint">{scrub == null ? 'Drag to preview the scroll, and watch the background hand off at each point.' : `Previewing at ${Math.round(scrub * 100)}% — `}{scrub != null && <button className="gs-link" onClick={() => doScrub('')}>stop</button>}</p>

        {/* presets */}
        <div className="gs-preview-label">Start from a preset</div>
        <div className="gs-bgpresets">
          {STAGE_OPTIONS.map((o) => <button key={o.id} className="gs-bgpreset" onClick={() => applyPreset(o.id)}>{o.label}</button>)}
        </div>

        {/* scenes + transitions, interleaved */}
        <div className="gs-preview-label">Scenes ({scenes.length}/3)</div>
        {scenes.map((s, k) => (
          <div key={s.id}>
            <div className="gs-scene">
              <span className="gs-scene-dot" style={{ background: KIND_COLOR[s.kind] || '#333' }} />
              <select value={s.kind} onChange={(e) => setKind(k, e.target.value)} aria-label={'Scene ' + (k + 1)}>
                {SCENE_KINDS.map((kd) => <option key={kd.id} value={kd.id}>{kd.label}</option>)}
              </select>
              <div className="gs-scene-acts">
                <button onClick={() => moveScene(k, -1)} disabled={k === 0} title="Move up" aria-label="Move up">↑</button>
                <button onClick={() => moveScene(k, 1)} disabled={k === scenes.length - 1} title="Move down" aria-label="Move down">↓</button>
                <button onClick={() => removeScene(k)} disabled={scenes.length <= 1} title="Remove" aria-label="Remove" className="gs-scene-del">×</button>
              </div>
            </div>
            {k < scenes.length - 1 && (
              <div className="gs-trans">
                <div className="gs-trans-label">{KIND_LABEL[s.kind]} → {KIND_LABEL[scenes[k + 1].kind]}</div>
                <label className="gs-trans-row">
                  <span>Transition at</span>
                  <input type="range" min="0.05" max="0.95" step="0.01" value={transitions[k].at} onChange={(e) => setTransition(k, { at: Number(e.target.value) })} />
                  <b>{Math.round(transitions[k].at * 100)}%</b>
                </label>
                <label className="gs-trans-row">
                  <span>Fade</span>
                  <input type="range" min="0.04" max="0.4" step="0.01" value={transitions[k].fade} onChange={(e) => setTransition(k, { fade: Number(e.target.value) })} />
                  <em>{fadeWord(transitions[k].fade)}</em>
                </label>
              </div>
            )}
          </div>
        ))}
        {scenes.length < 3 && <button className="gs-btn ghost sm gs-scene-add" onClick={addScene}>+ Add scene</button>}
      </div>
    </aside>
  );
}
