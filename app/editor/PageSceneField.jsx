'use client';

import { createUsePuck } from '@puckeditor/core';
import { SCENE_KINDS } from '../../src/stage-presets.js';
import { editablePageScene, validSceneTrack } from '../../next-proof/page-scene.mjs';

const usePageBlocks = createUsePuck();
const names = { stone: 'Stone', summit: 'Summit', cairn: 'Cairn', tide: 'Tide waves', tideRadial: 'Tide radial', tideCalm: 'Tide calm' };
const label = (block, index) => `${index + 1}. ${block.props?.heading || block.props?.headline || block.props?.title || block.type}`;
const uid = () => crypto.randomUUID();
const percent = (value) => `${Math.round(value * 100)}%`;

export default function PageSceneField({ value, onChange }) {
  const blocks = usePageBlocks((state) => state.appState.data.content);
  const model = editablePageScene(value, uid);
  const { scenes, transitions } = model.track;
  const trackValid = validSceneTrack(model.track, blocks.map((block) => block.props.id));
  const update = (track) => onChange({ ...model, track });
  const changeScene = (index, patch) => update({ ...model.track, scenes: scenes.map((scene, i) => i === index ? { ...scene, ...patch } : scene) });
  const changeTransition = (index, patch) => update({ ...model.track, transitions: transitions.map((tr, i) => i === index ? { ...tr, ...patch } : tr) });
  const add = () => {
    if (scenes.length === 3) return;
    const at = transitions.length ? Math.min(0.95, transitions.at(-1).at + (0.95 - transitions.at(-1).at) / 2) : 0.55;
    update({ ...model.track, scenes: [...scenes, { id: uid(), kind: 'tide', strength: 'standard' }], transitions: [...transitions, { id: uid(), at, fade: 0.2, anchor: { type: 'scroll' } }] });
  };
  const remove = (index) => {
    if (scenes.length === 1) return;
    update({ ...model.track, scenes: scenes.filter((_, i) => i !== index), transitions: transitions.filter((_, i) => i !== (index ? index - 1 : 0)) });
  };
  const move = (index, direction) => {
    const next = [...scenes];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    update({ ...model.track, scenes: next });
  };
  return <div className="gs-page-scene-field">
    <fieldset><legend>Background</legend>
      <label><input type="radio" name="page-surface" checked={model.surface === 'plain'} onChange={() => onChange({ ...model, surface: 'plain' })} /> Plain surface</label>
      {model.surface === 'plain' && <p className="gs-page-scene-hint">Uses the page&apos;s dark brand surface.</p>}
      <label><input type="radio" name="page-surface" checked={model.surface === '3d'} onChange={() => onChange({ ...model, surface: '3d' })} /> 3D on</label>
    </fieldset>
    {model.surface === '3d' && <>
      <fieldset><legend>Motion</legend>
        <label><input type="radio" name="page-motion" checked={model.motion === 'animate'} onChange={() => onChange({ ...model, motion: 'animate' })} /> Animate</label>
        <label><input type="radio" name="page-motion" checked={model.motion === 'still'} onChange={() => onChange({ ...model, motion: 'still' })} /> Still</label>
      </fieldset>
      <p className="gs-page-scene-count">Scenes ({scenes.length}/3)</p>
      {!trackValid && <p className="gs-page-scene-error" role="alert">Use section pins for both transitions, or transition points for both. Pinned transitions must follow page section order. Adjust these settings before saving.</p>}
      {scenes.map((scene, index) => <div className="gs-page-scene-card" key={scene.id}>
        <div className="gs-page-scene-card-title"><strong>Scene {index + 1}</strong><div>
          <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move scene ${index + 1} up`}>↑</button>
          <button type="button" disabled={index === scenes.length - 1} onClick={() => move(index, 1)} aria-label={`Move scene ${index + 1} down`}>↓</button>
          <button type="button" disabled={scenes.length === 1} onClick={() => remove(index)} aria-label={`Remove scene ${index + 1}`}>×</button>
        </div></div>
        <label>Scene<select value={scene.kind} onChange={(event) => changeScene(index, { kind: event.target.value })}>{SCENE_KINDS.map((kind) => <option key={kind.id} value={kind.id}>{names[kind.id]}</option>)}</select></label>
        <label>Strength<select value={scene.strength} onChange={(event) => changeScene(index, { strength: event.target.value })}><option value="quiet">Quiet</option><option value="standard">Standard</option><option value="bold">Bold</option></select></label>
        {index < transitions.length && (() => {
          const tr = transitions[index];
          const pinned = tr.anchor.type === 'block';
          const min = index ? transitions[index - 1].at + 0.02 : 0.05;
          const max = index < transitions.length - 1 ? transitions[index + 1].at - 0.02 : 0.95;
          return <div className="gs-page-transition">
            <strong>{names[scene.kind]} to {names[scenes[index + 1].kind]}</strong>
            <label><input type="checkbox" checked={pinned} disabled={!blocks.length} onChange={(event) => changeTransition(index, { anchor: event.target.checked ? { type: 'block', blockId: blocks[0].props.id, edge: 'center', fallbackAt: tr.at } : { type: 'scroll' } })} /> Pin to section</label>
            {pinned ? <>
              <label>Section<select value={tr.anchor.blockId} onChange={(event) => changeTransition(index, { anchor: { ...tr.anchor, blockId: event.target.value } })}>{blocks.map((block, i) => <option key={block.props.id} value={block.props.id}>{label(block, i)}</option>)}</select></label>
              <label>Trigger<select value={tr.anchor.edge} onChange={(event) => changeTransition(index, { anchor: { ...tr.anchor, edge: event.target.value } })}><option value="top">Top reaches screen centre</option><option value="center">Centre reaches screen centre</option><option value="bottom">Bottom reaches screen centre</option></select></label>
            </> : <label>Transition point <output>{percent(tr.at)}</output><input type="range" min={min} max={max} step="0.01" value={tr.at} onChange={(event) => changeTransition(index, { at: Number(event.target.value) })} aria-label={`Scene ${index + 1} transition point`} /></label>}
            <label>Fade <output>{percent(tr.fade)}</output><input type="range" min="0.04" max="0.4" step="0.01" value={tr.fade} onChange={(event) => changeTransition(index, { fade: Number(event.target.value) })} aria-label={`Scene ${index + 1} fade`} /></label>
          </div>;
        })()}
      </div>)}
      {scenes.length < 3 && <button type="button" className="gs-page-scene-add" onClick={add}>Add scene</button>}
    </>}
  </div>;
}
