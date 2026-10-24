'use client';
import { useEffect, useRef, useState } from 'react';
import { Puck } from '@puckeditor/core';
import { proofConfig, ProofBlocks, PreviewContext } from '../../ProofBlocks.jsx';
import { FrameEditingContext } from '../frame-context.jsx';
import { blockRef, envelope, findBlock, mapMediaRefs, validHello, validMessage, FRAME_PROTOCOL } from '../../../next-proof/frame-protocol.mjs';
import { insertMedia, insertMediaResult } from '../../../next-proof/frame-insert-media.mjs';
import { motionHello, setMotion, setMotionResult } from '../../../next-proof/frame-set-motion.mjs';
import { useInsertedMediaUrl } from '../../../next-proof/frame-media-urls.mjs';
import { saveDecision, saveRequest } from '../../../next-proof/frame-save.mjs';
import { changedBlockText } from '../../../next-proof/frame-conflict.mjs';
import { MediaField } from '../../../src/cms/MediaField.jsx';
import './frame.css';

const isMediaField = (field) => field.type === 'image' || field.type === 'video' ||
  (field.type === 'custom' && field.render?.({ value: '', onChange: () => {} })?.type === MediaField);

export default function Editor({ page, forms, siteId, engine, origins, mode }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('waiting');
  const [message, setMessage] = useState('Waiting for the website builder');
  const [conflict, setConflict] = useState(null);
  const [highlight, setHighlight] = useState(null);
  const [generation, setGeneration] = useState(0);
  const [isDirty, setIsDirty] = useState(false);
  const session = useRef(null), draft = useRef(null), baseRevision = useRef(null), pending = useRef(null), timer = useRef(null);
  const mediaUrls = useRef({});

  function addMedia(media) {
    for (const [id, entry] of Object.entries(media || {})) {
      if (entry?.blob instanceof Blob && !mediaUrls.current[`media:${id}`]) mediaUrls.current[`media:${id}`] = URL.createObjectURL(entry.blob);
    }
  }
  function displayData(raw) { return mapMediaRefs(raw, mediaUrls.current); }
  function rawData(shown) { return mapMediaRefs(shown, Object.fromEntries(Object.entries(mediaUrls.current).map(([id, url]) => [url, id]))); }
  function releaseMedia() { for (const url of Object.values(mediaUrls.current)) if (url.startsWith('blob:')) URL.revokeObjectURL(url); mediaUrls.current = {}; }

  function send(type, payload) {
    const bound = session.current;
    if (bound) window.parent.postMessage(envelope(type, payload, bound), bound.origin);
  }
  function dirty(value) { setIsDirty(value); send('dirty', { dirty: value }); }
  function save(nextData = draft.current, retry = false) {
    if (!session.current || !nextData || (status === 'saving' && !retry) || conflict) return;
    const request = saveRequest({ pending: pending.current, retry, pageId: page.id, baseRevisionId: baseRevision.current, data: nextData, createId: () => crypto.randomUUID() });
    pending.current = request; setStatus('saving'); setMessage('Saving draft'); send('save', request);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setStatus('failed'); setMessage('Save did not finish. Your changes are still here.'); }, 30000);
  }
  useEffect(() => {
    function onMessage(event) {
      if (event.data?.type === 'hello') {
        const result = validHello(event, origins, siteId, session.current);
        if (!result) { if (event.data?.gs === 'website-frame') console.warn('Dropped frame hello: origin, source, nonce or protocol list invalid'); return; }
        if (result.payload.mode !== mode || result.payload.pageId !== page.id) { console.warn('Dropped frame hello: mode or page mismatch'); return; }
        const { nonce } = result.payload;
        if (result.refused) {
          window.parent.postMessage(envelope('hello-refused', { nonce, reason: result.refused, supported: [FRAME_PROTOCOL] }), event.origin); return;
        }
        session.current ||= { nonce, origin: event.origin };
        window.parent.postMessage(envelope('hello-ack', { protocol: FRAME_PROTOCOL, nonce, siteId, engine, supportedReleaseSchemas: [1], ...motionHello(proofConfig.components) }), event.origin);
        setMessage('Waiting for the page draft'); return;
      }
      if (!validMessage(event, session.current, ['load-draft', 'save-result', 'highlight', 'insert-media', 'set-motion', 'teardown'])) {
        if (event.data?.gs === 'website-frame') console.warn('Dropped frame message: origin, source, session, protocol or payload invalid');
        return;
      }
      const p = event.data.payload;
      if (event.data.type === 'teardown') {
        draft.current = null; baseRevision.current = null; session.current = null; pending.current = null;
        clearTimeout(timer.current); releaseMedia(); setData(null); setStatus('closed'); setMessage('Editor closed');
      } else if (event.data.type === 'load-draft' && !draft.current && p.pageId === page.id && typeof p.revisionId === 'string' && Array.isArray(p.data?.content)) {
        addMedia(p.media); draft.current = p.data; baseRevision.current = p.revisionId; setData(displayData(p.data)); setStatus('ready'); setMessage('Draft ready');
      } else if (event.data.type === 'highlight' && mode === 'preview') {
        setHighlight(typeof p.blockId === 'string' ? p.blockId : null);
      } else if (event.data.type === 'insert-media') {
        const result = mode === 'editor' && draft.current
          ? insertMedia(draft.current, proofConfig.components, p, isMediaField)
          : { ok: false, code: 'error', message: 'The editor draft is not ready.' };
        if (result.ok) {
          draft.current = result.data;
          useInsertedMediaUrl(mediaUrls.current, result.mediaRef, p.media, result.assetUrl);
          setData(displayData(result.data)); setGeneration((n) => n + 1);
          dirty(true); setStatus('ready'); setMessage('Unsaved changes');
        }
        send('insert-media-result', insertMediaResult(event.data.id, result));
      } else if (event.data.type === 'set-motion') {
        const result = mode === 'editor' && draft.current
          ? setMotion(draft.current, p)
          : { ok: false, code: 'error', message: 'The editor draft is not ready.' };
        if (result.ok) {
          draft.current = result.data;
          setData(displayData(result.data)); setGeneration((n) => n + 1);
          dirty(true); setStatus('ready'); setMessage('Unsaved changes');
        }
        send('set-motion-result', setMotionResult(event.data.id, result));
      } else if (event.data.type === 'save-result' && pending.current && p.requestId === pending.current.requestId) {
        clearTimeout(timer.current);
        const decision = saveDecision(pending.current, draft.current, p);
        if (decision?.kind === 'saved') {
          baseRevision.current = decision.revisionId; pending.current = null; setConflict(null); dirty(decision.dirty);
          setStatus(decision.dirty ? 'ready' : 'saved');
          setMessage(decision.dirty ? 'Saved earlier changes. New changes still need saving.' : `Saved ${new Date(p.savedAt || Date.now()).toLocaleTimeString()}`);
        } else if (decision?.kind === 'conflict') {
          pending.current = null; setConflict(p); setStatus('conflict'); setMessage('Someone saved this page first. Choose which version to keep.');
        } else if (decision?.kind === 'failed') {
          setStatus('failed'); setMessage(decision.message);
          if (!decision.retryable) pending.current = null;
        }
      }
    }
    function onPageHide() { draft.current = null; session.current = null; pending.current = null; clearTimeout(timer.current); releaseMedia(); }
    window.addEventListener('message', onMessage); window.addEventListener('pagehide', onPageHide);
    return () => { window.removeEventListener('message', onMessage); window.removeEventListener('pagehide', onPageHide); clearTimeout(timer.current); };
  }, [engine, mode, origins, page.id, siteId]);

  function onChange(nextData) {
    const nextRaw = rawData(nextData);
    if (JSON.stringify(nextRaw) === JSON.stringify(draft.current)) return;
    draft.current = nextRaw; dirty(true);
    if (status === 'saved') { setStatus('ready'); setMessage('Unsaved changes'); }
  }
  function takeTheirs() {
    addMedia(conflict.currentMedia); draft.current = conflict.currentData; baseRevision.current = conflict.currentRevisionId;
    setData(displayData(conflict.currentData)); setGeneration((n) => n + 1); setConflict(null); dirty(false); setStatus('ready'); setMessage('Their version loaded');
  }
  function keepMine() { baseRevision.current = conflict.currentRevisionId; setConflict(null); setStatus('ready'); setMessage('Your version is ready to save'); }
  const changes = conflict ? changedBlockText(draft.current, conflict.currentData) : [];
  function pick(event) {
    const el = event.target.closest('[data-gs-block-id]');
    if (!el || !draft.current) return;
    event.preventDefault(); event.stopPropagation();
    const item = findBlock(draft.current.content, el.dataset.gsBlockId, el.dataset.gsBlockType);
    if (!item) return;
    const r = el.getBoundingClientRect();
    send('block-picked', { ref: blockRef(item, { ...page, revisionId: baseRevision.current }, siteId, engine), label: item.type, rect: { x: r.x, y: r.y, width: r.width, height: r.height } });
  }
  if (!data) return <main className="gs-frame-empty" role="status"><span className="gs-frame-kicker">Greatstone Studio</span><h1>{mode === 'editor' ? 'Page editor' : 'Page preview'}</h1><p>{message}</p></main>;
  return <main className={`gs-frame gs-frame-${mode}`}>
    <header className="gs-frame-bar"><div><span className="gs-frame-kicker">Greatstone Studio</span><strong>{page.title}</strong></div><div className="gs-frame-actions"><span role="status" aria-live="polite">{message}</span>{mode === 'editor' && <button type="button" disabled={status === 'saving' || !isDirty || !!conflict} onClick={() => save()}>Save draft</button>}</div></header>
    {conflict && <section className="gs-frame-notice" role="alert"><h2>Someone saved this page first</h2><p>Review the differences below. Keep mine preserves this canvas and lets you save it over their draft. Take theirs replaces this canvas with their saved draft and discards your unsaved changes.</p><div className="gs-frame-versions">{changes.length ? changes.map((block) => <section key={block.id}><h3>{block.name}</h3>{block.fields.map((field) => <div className="gs-frame-change" key={field.label}><strong>{field.label}</strong><div><p><b>Mine</b><span>{field.mine || 'No text'}</span></p><p><b>Theirs</b><span>{field.theirs || 'No text'}</span></p></div></div>)}</section>) : <p>No wording changes. The page layout or other block settings differ.</p>}</div><div className="gs-frame-conflict-actions"><button type="button" onClick={keepMine}>Keep mine and review save</button><button type="button" onClick={takeTheirs}>Take theirs, discard mine</button></div></section>}
    {status === 'failed' && pending.current && <div className="gs-frame-notice" role="alert"><p>{message}</p><button type="button" onClick={() => save(undefined, true)}>Retry save</button></div>}
    {mode === 'editor' ? <FrameEditingContext.Provider value={true}><Puck key={generation} config={proofConfig} data={data} ui={{ viewports: { current: { width: '100%', height: 'auto' }, controlsVisible: true, options: [] } }} headerTitle={page.title} headerPath={page.path} dictionary={{ 'header-publish': 'Save draft' }} iframe={{ enabled: true, syncHostStyles: true }} viewports={[{ width: 390, label: 'Phone', icon: 'Smartphone' }, { width: 1440, label: 'Laptop', icon: 'Monitor' }, { width: '100%', label: 'Full width', icon: 'FullWidth' }]} onChange={onChange} onPublish={(nextData) => { draft.current = rawData(nextData); save(draft.current); }} /></FrameEditingContext.Provider>
      : <div className="gs-frame-preview" onClick={pick}><PreviewContext.Provider value={true}><ProofBlocks data={data} pageSlug={page.slug} forms={forms} /></PreviewContext.Provider>{highlight && <style>{`[data-gs-block-id="${CSS.escape(highlight)}"]{outline:3px solid #c8ff00;outline-offset:4px}`}</style>}</div>}
  </main>;
}
