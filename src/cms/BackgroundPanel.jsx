import { useEffect, useMemo, useState } from 'react';
import { STAGE_OPTIONS, SCENE_KINDS, scrollContext, resolveTransitionAt } from '../stage-presets.js';
import { normalizeBackground } from '../store.js';

// Granular 3D background editor ("scene track"). The page's background is a list of scenes that
// cross-fade at editable points; each transition is anchored either to a SCROLL percentage or
// PINNED TO A BLOCK ("switch when you reach the Pillars section" — survives content edits). A
// live scroll-map + scrubber drives the real Stage so the user sees exactly where a handoff
// happens. All edits flow up via onChange(model) → autosave.
const uid = (p) => p + '-' + Math.random().toString(36).slice(2, 8);
const KIND = Object.fromEntries(SCENE_KINDS.map((k) => [k.id, k]));
const KIND_LABEL = Object.fromEntries(SCENE_KINDS.map((k) => [k.id, k.label]));
const kindColor = (id) => (KIND[id] && KIND[id].color) || '#333';        // swatch / band fill
const kindInk = (id) => (KIND[id] && KIND[id].ink) || 'rgba(255,255,255,.85)'; // legible label on that fill
const fadeWord = (f) => (f <= 0.08 ? 'Hard cut' : f <= 0.16 ? 'Crisp' : f <= 0.26 ? 'Smooth' : 'Very soft');
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const blockLabel = (b) => {
  const t = (b.props && (b.props.headline || b.props.heading || b.props.title || b.props.eyebrow || b.props.kicker)) || '';
  const s = String(t).replace(/\s+/g, ' ').trim().slice(0, 26);
  return (s ? s + ' · ' : '') + b.type;
};

export default function BackgroundPanel({ value, onChange, onPreview, onClose, blocks = [] }) {
  const model = useMemo(() => normalizeBackground(value), [value]);
  const [scrub, setScrub] = useState(null);

  useEffect(() => { if (!(value && typeof value === 'object' && Array.isArray(value.scenes))) onChange(model); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onPreview(null), [onPreview]);

  const scenes = model.scenes || [];
  const transitions = model.transitions || [];
  const commit = (next) => onChange(next);

  // effective scroll fraction — shared with Stage so the track + readouts can't drift from the live handoff
  const resolveAt = (tr) => resolveTransitionAt(tr, scrollContext());

  const setKind = (i, kind) => commit({ ...model, scenes: scenes.map((s, k) => (k === i ? { ...s, kind } : s)) });
  const applyPreset = (id) => { if (STAGE_OPTIONS.find((o) => o.id === id)) onChange(id); };

  const addScene = () => {
    if (scenes.length >= 3) return;
    const prevAt = transitions.length ? resolveAt(transitions[transitions.length - 1]) : 0;
    const at = clamp(prevAt + (1 - prevAt) * 0.5, 0.05, 0.95);
    commit({ ...model, scenes: [...scenes, { id: uid('sc'), kind: 'tide' }], transitions: [...transitions, { id: uid('tr'), at, fade: 0.2, anchor: { type: 'scroll' } }] });
  };
  const removeScene = (i) => {
    if (scenes.length <= 1) return;
    commit({ ...model, scenes: scenes.filter((_, k) => k !== i), transitions: transitions.filter((_, k) => k !== (i > 0 ? i - 1 : 0)) });
  };
  const moveScene = (i, dir) => {
    const j = i + dir; if (j < 0 || j >= scenes.length) return;
    const ns = [...scenes]; [ns[i], ns[j]] = [ns[j], ns[i]]; commit({ ...model, scenes: ns });
  };
  const patchTrans = (i, fn) => commit({ ...model, transitions: transitions.map((tr, k) => (k === i ? fn(tr) : tr)) });
  const setAt = (i, v) => {
    const lo = i > 0 ? resolveAt(transitions[i - 1]) + 0.02 : 0.02;
    const hi = i < transitions.length - 1 ? resolveAt(transitions[i + 1]) - 0.02 : 0.98;
    patchTrans(i, (tr) => ({ ...tr, at: clamp(v, lo, hi) }));
  };
  const setFade = (i, v) => patchTrans(i, (tr) => ({ ...tr, fade: clamp(v, 0.04, 0.4) }));
  const setAnchorType = (i, type) => patchTrans(i, (tr) => (type === 'block'
    ? { ...tr, anchor: { type: 'block', blockId: (blocks[0] && blocks[0].props.id) || null, edge: 'center', fallbackAt: tr.at } }
    : { ...tr, anchor: { type: 'scroll' } }));
  const setBlock = (i, blockId) => patchTrans(i, (tr) => ({ ...tr, anchor: { ...tr.anchor, blockId } }));
  const setEdge = (i, edge) => patchTrans(i, (tr) => ({ ...tr, anchor: { ...tr.anchor, edge } }));

  const doScrub = (v) => { const p = v === '' ? null : Number(v); setScrub(p); onPreview(p); };
  const atOf = (k) => resolveAt(transitions[k]);
  const bandStart = (k) => (k > 0 ? atOf(k - 1) : 0);
  const bandEnd = (k) => (k < scenes.length - 1 ? atOf(k) : 1);

  return (
    <aside className="gs-panel" role="dialog" aria-label="3D background">
      <div className="gs-panel-head"><h3>3D background</h3><button className="gs-x" onClick={onClose} aria-label="Close">×</button></div>
      <div className="gs-panel-body">
        <div className="gs-track" aria-hidden="true">
          <div className="gs-track-bands">
            {scenes.map((s, k) => (
              <span key={s.id} className="gs-track-band" style={{ width: ((bandEnd(k) - bandStart(k)) * 100) + '%', background: kindColor(s.kind), color: kindInk(s.kind) }}>{KIND_LABEL[s.kind] || s.kind}</span>
            ))}
          </div>
          {transitions.map((tr, k) => <span key={tr.id} className="gs-track-tick" style={{ left: (atOf(k) * 100) + '%' }} />)}
        </div>
        <div className="gs-track-scrubrow">
          <span className="gs-track-cap">Top</span>
          <input className="gs-track-scrub" type="range" min="0" max="1" step="0.005" value={scrub == null ? 0 : scrub} onChange={(e) => doScrub(e.target.value)} aria-label="Preview scroll position" />
          <span className="gs-track-cap">Bottom</span>
        </div>
        <p className="gs-track-hint">{scrub == null ? 'Drag to preview the scroll and watch the background hand off at each point.' : `Previewing at ${Math.round(scrub * 100)}% — `}{scrub != null && <button className="gs-link" onClick={() => doScrub('')}>stop</button>}</p>

        <div className="gs-preview-label">Start from a preset</div>
        <div className="gs-bgpresets">{STAGE_OPTIONS.map((o) => <button key={o.id} className="gs-bgpreset" onClick={() => applyPreset(o.id)}>{o.label}</button>)}</div>

        <div className="gs-preview-label">Scenes ({scenes.length}/3)</div>
        {scenes.map((s, k) => (
          <div key={s.id}>
            <div className="gs-scene">
              <span className="gs-scene-dot" style={{ background: kindColor(s.kind) }} />
              <select value={s.kind} onChange={(e) => setKind(k, e.target.value)} aria-label={'Scene ' + (k + 1)}>
                {SCENE_KINDS.map((kd) => <option key={kd.id} value={kd.id}>{kd.label}</option>)}
              </select>
              <div className="gs-scene-acts">
                <button onClick={() => moveScene(k, -1)} disabled={k === 0} title="Move up" aria-label="Move up">↑</button>
                <button onClick={() => moveScene(k, 1)} disabled={k === scenes.length - 1} title="Move down" aria-label="Move down">↓</button>
                <button onClick={() => removeScene(k)} disabled={scenes.length <= 1} title="Remove" aria-label="Remove" className="gs-scene-del">×</button>
              </div>
            </div>
            {k < scenes.length - 1 && (() => {
              const tr = transitions[k]; const pinned = tr.anchor && tr.anchor.type === 'block';
              return (
                <div className="gs-trans">
                  <div className="gs-trans-top">
                    <span className="gs-trans-label">{KIND_LABEL[s.kind]} → {KIND_LABEL[scenes[k + 1].kind]}</span>
                    <label className="gs-trans-pin"><input type="checkbox" checked={!!pinned} onChange={(e) => setAnchorType(k, e.target.checked ? 'block' : 'scroll')} disabled={!blocks.length} /> Pin to section</label>
                  </div>
                  {pinned ? (
                    <>
                      <label className="gs-trans-row"><span>Section</span>
                        <select value={tr.anchor.blockId || ''} onChange={(e) => setBlock(k, e.target.value)}>
                          {blocks.map((b) => <option key={b.props.id} value={b.props.id}>{blockLabel(b)}</option>)}
                        </select>
                      </label>
                      <label className="gs-trans-row"><span>Trigger</span>
                        <select value={tr.anchor.edge || 'center'} onChange={(e) => setEdge(k, e.target.value)}>
                          <option value="top">when it enters</option><option value="center">when centred</option><option value="bottom">when it leaves</option>
                        </select>
                        <b>~{Math.round(resolveAt(tr) * 100)}%</b>
                      </label>
                    </>
                  ) : (
                    <label className="gs-trans-row"><span>Transition at</span>
                      <input type="range" min="0.05" max="0.95" step="0.01" value={tr.at} onChange={(e) => setAt(k, Number(e.target.value))}
                        aria-label="Transition point" aria-valuetext={Math.round(tr.at * 100) + '%'} />
                      <b>{Math.round(tr.at * 100)}%</b>
                    </label>
                  )}
                  <label className="gs-trans-row"><span>Fade</span>
                    <input type="range" min="0.04" max="0.4" step="0.01" value={tr.fade} onChange={(e) => setFade(k, Number(e.target.value))}
                      aria-label="Fade softness" aria-valuetext={fadeWord(tr.fade)} />
                    <em>{fadeWord(tr.fade)}</em>
                  </label>
                </div>
              );
            })()}
          </div>
        ))}
        {scenes.length < 3 && <button className="gs-btn ghost sm gs-scene-add" onClick={addScene}>+ Add scene</button>}
      </div>
    </aside>
  );
}
