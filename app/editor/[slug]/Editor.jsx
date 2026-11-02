'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Puck, createUsePuck } from '@puckeditor/core';
import { proofBlockCss, proofConfig, ProofBlocks, PreviewContext } from '../../ProofBlocks.jsx';
import { FrameCopyContext, FrameEditingContext } from '../frame-context.jsx';
import { blockRef, envelope, findBlock, mapMediaRefs, validHello, validMessage, FRAME_PROTOCOL } from '../../../next-proof/frame-protocol.mjs';
import { insertMedia, insertMediaResult } from '../../../next-proof/frame-insert-media.mjs';
import { motionHello, setMotion, setMotionResult } from '../../../next-proof/frame-set-motion.mjs';
import { useInsertedMediaUrl } from '../../../next-proof/frame-media-urls.mjs';
import { saveDecision, saveRequest } from '../../../next-proof/frame-save.mjs';
import { splitTwoDoorsToolsDraft } from '../../../next-proof/two-doors-draft.mjs';
import { changedBlockText } from '../../../next-proof/frame-conflict.mjs';
import { MediaField } from '../../../src/cms/MediaField.jsx';
import { COPY_PERMISSIONS, copyModeAllows, editModeOf, editorState, helloAckPayload, importLiveData, mediaRequest, validEditorCommand } from '../../../next-proof/frame-editor.mjs';
import { EDITOR_MESSAGES, askAgent, capturePng, captureTarget, renderPins, validPins } from '../../../next-proof/frame-comments.mjs';
import './frame.css';

const usePuckSelection = createUsePuck();
const EDITOR_UI = { leftSideBarVisible: false, rightSideBarVisible: false, itemSelector: null, viewports: { current: { width: '100%', height: 'auto' }, controlsVisible: false, options: [] } };

function FrameControls({ send, save, commands, copy, pins, onLayout, onImport, pageSettingsRef }) {
  const puckSelected = usePuckSelection((s) => s.selectedItem);
  const [clicked, setClicked] = useState(null);
  const selected = puckSelected || clicked;
  const history = usePuckSelection((s) => s.history);
  const ui = usePuckSelection((s) => s.appState.ui);
  const dispatch = usePuckSelection((s) => s.dispatch);
  const getSelectorForId = usePuckSelection((s) => s.getSelectorForId);
  const getItemById = usePuckSelection((s) => s.getItemById);
  const contentLength = usePuckSelection((s) => s.appState.data.content.length);
  const [outline, setOutline] = useState(false);
  const [library, setLibrary] = useState(false);
  const [pageSettings, setPageSettings] = useState(() => pageSettingsRef.current);
  const pageButton = useRef(null);
  const selectedId = selected?.props?.id;
  const selector = selectedId ? getSelectorForId(selectedId) : null;

  useEffect(() => {
    const frame = document.querySelector('.gs-frame-editor iframe');
    if (!frame) return;
    let doc;
    function onClick(event) {
      if (event.target.closest?.('.gs-comment-pin')) return;
      const block = event.target.closest?.('[data-gs-block-id]');
      setClicked(block ? getItemById(block.dataset.gsBlockId) : null);
    }
    function bind() { doc?.removeEventListener('click', onClick, true); doc = frame.contentDocument; doc?.addEventListener('click', onClick, true); }
    frame.addEventListener('load', bind); bind();
    return () => { frame.removeEventListener('load', bind); doc?.removeEventListener('click', onClick, true); };
  }, [getItemById]);

  useEffect(() => {
    const frame = document.querySelector('.gs-frame-editor iframe');
    if (!frame) return;
    let observer;
    let doc;
    function draw() {
      observer?.disconnect();
      if (frame.contentDocument) renderPins(frame.contentDocument, pins, (pin) => send('pin-clicked', pin));
      if (frame.contentDocument?.body) observer?.observe(frame.contentDocument.body, { childList: true, subtree: true });
    }
    function bind() {
      observer?.disconnect(); doc?.removeEventListener('scroll', draw, true);
      doc = frame.contentDocument;
      doc?.addEventListener('scroll', draw, true);
      observer = new MutationObserver(draw); draw();
    }
    frame.addEventListener('load', bind); bind();
    return () => { frame.removeEventListener('load', bind); doc?.removeEventListener('scroll', draw, true); observer?.disconnect(); };
  }, [pins]);
  useEffect(() => {
    if (pageSettingsRef.current && !copy) dispatch({ type: 'setUi', ui: { itemSelector: null, leftSideBarVisible: false, rightSideBarVisible: true } });
  }, []); // Restore the page drawer when Puck remounts header actions after a field edit.

  useEffect(() => { send('editor-state', editorState(selected, history, outline)); }, [selectedId, selected?.type, history.hasPast, history.hasFuture, outline]);
  useEffect(() => {
    // Edit copy: clicking words selects the block but never opens its settings.
    if (selectedId) { setLibrary(false); pageSettingsRef.current = false; setPageSettings(false); dispatch({ type: 'setUi', ui: { rightSideBarVisible: !copy, leftSideBarVisible: false } }); }
  }, [selectedId, copy]);
  useEffect(() => {
    if (!copy) return;
    setLibrary(false); setOutline(false); pageSettingsRef.current = false; setPageSettings(false);
    if (ui.leftSideBarVisible || ui.rightSideBarVisible) dispatch({ type: 'setUi', ui: { itemSelector: null, leftSideBarVisible: false, rightSideBarVisible: false } });
  }, [copy, ui.leftSideBarVisible, ui.rightSideBarVisible]);
  useEffect(() => {
    if (!selectedId && !pageSettings && ui.rightSideBarVisible) dispatch({ type: 'setUi', ui: { rightSideBarVisible: false } });
  }, [selectedId, pageSettings, ui.rightSideBarVisible]);

  function close() {
    if (pageSettings) pageButton.current?.focus();
    setLibrary(false); pageSettingsRef.current = false; setPageSettings(false);
    setClicked(null);
    dispatch({ type: 'setUi', ui: { itemSelector: null, leftSideBarVisible: false, rightSideBarVisible: false } });
  }
  function add() {
    setLibrary(true); pageSettingsRef.current = false; setPageSettings(false);
    dispatch({ type: 'setUi', ui: { itemSelector: null, rightSideBarVisible: false, leftSideBarVisible: true, plugin: { current: 'blocks' } } });
  }
  function toggleOutline(on) {
    setOutline(on); pageSettingsRef.current = false; setPageSettings(false);
    setLibrary(false);
    dispatch({ type: 'setUi', ui: { itemSelector: null, rightSideBarVisible: false, leftSideBarVisible: on, plugin: { current: 'outline' } } });
  }
  function openPageSettings() {
    setLibrary(false); setOutline(false); pageSettingsRef.current = true; setPageSettings(true);
    setClicked(null);
    dispatch({ type: 'setUi', ui: { itemSelector: null, leftSideBarVisible: false, rightSideBarVisible: true } });
  }
  function command(payload) {
    if (!validEditorCommand(payload)) return;
    if (copy && !copyModeAllows(payload.command)) return;
    switch (payload.command) {
      case 'undo': history.back(); break;
      case 'redo': history.forward(); break;
      case 'save': save(); break;
      case 'add-block': add(); break;
      case 'deselect': close(); break;
      case 'outline': toggleOutline(payload.on); break;
      case 'layout': onLayout(payload.on); break;
      case 'import-live': onImport(); break;
    }
  }
  useEffect(() => { commands.current = command; return () => { commands.current = null; }; });
  useEffect(() => {
    function onKey(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); save(); return; }
      if (event.key !== 'Escape') return;
      if (event.target?.isContentEditable) return;
      if (selectedId || library || outline || pageSettings || ui.leftSideBarVisible || ui.rightSideBarVisible) { close(); setOutline(false); return; }
      send('editor-key', { key: 'escape' });
    }
    window.addEventListener('keydown', onKey);
    const frame = document.querySelector('.gs-frame-editor iframe');
    let doc;
    function bind() { doc?.removeEventListener('keydown', onKey); doc = frame?.contentDocument; doc?.addEventListener('keydown', onKey); }
    frame?.addEventListener('load', bind);
    bind();
    return () => { window.removeEventListener('keydown', onKey); frame?.removeEventListener('load', bind); doc?.removeEventListener('keydown', onKey); };
  }, [selectedId, library, outline, pageSettings, ui.leftSideBarVisible, ui.rightSideBarVisible]);
  useEffect(() => {
    const frame = document.querySelector('.gs-frame-editor iframe');
    if (!frame) return;
    function onClick(event) {
      if (copy) return;
      const media = event.target.closest?.('img,video');
      const block = media?.closest('[data-gs-block-id]');
      const item = block && getItemById(block.dataset.gsBlockId);
      const request = mediaRequest(item, media, proofConfig.components);
      if (request) { event.preventDefault(); event.stopPropagation(); send('media-requested', request); }
    }
    let doc;
    function bind() { doc?.removeEventListener('click', onClick, true); doc = frame.contentDocument; doc?.addEventListener('click', onClick, true); }
    frame.addEventListener('load', bind);
    bind();
    return () => { frame.removeEventListener('load', bind); doc?.removeEventListener('click', onClick, true); };
  }, [getItemById, copy]);
  function act(type, destinationIndex) {
    if (!selector) return;
    if (type === 'reorder') dispatch({ type, sourceIndex: selector.index, destinationIndex, destinationZone: selector.zone });
    else if (type === 'duplicate') dispatch({ type, sourceIndex: selector.index, sourceZone: selector.zone });
    else dispatch({ type, index: selector.index, zone: selector.zone });
  }
  const count = selector?.zone === 'root:default-zone' ? contentLength : 999;
  if (copy && !selected) return null;
  return createPortal(<div className={'gs-frame-controls' + (library || outline || selected || pageSettings ? ' is-drawer-open' : '')}>
    {selected && <div className="gs-frame-block-tools" role="toolbar" aria-label="Selected block">
      <span>{selected.type}</span><button type="button" onClick={() => { const payload = askAgent(selected); if (payload) send('ask-agent', payload); }}>Ask an agent</button>
      {!copy && <><button type="button" disabled={!selector || selector.index === 0} onClick={() => act('reorder', selector.index - 1)}>Move up</button>
      <button type="button" disabled={!selector || selector.index >= count - 1} onClick={() => act('reorder', selector.index + 1)}>Move down</button>
      <button type="button" onClick={() => act('duplicate')}>Duplicate</button><button type="button" onClick={() => act('remove')}>Delete</button>
      </>}<button type="button" onClick={close}>Close</button>
    </div>}
    {!copy && <button type="button" onClick={add}>Add block</button>}
    {!copy && <button ref={pageButton} type="button" onClick={openPageSettings}>Page background</button>}
    {(library || outline || selected || pageSettings) && <button type="button" onClick={() => { close(); setOutline(false); }}>Close drawer</button>}
    {(library || outline) && <span className="gs-frame-drawer-label">{outline ? 'Outline' : 'Block library'}</span>}
  </div>, document.body);
}

const isMediaField = (field) => field.type === 'image' || field.type === 'video' ||
  (field.type === 'custom' && field.render?.({ value: '', onChange: () => {} })?.type === MediaField);

export default function Editor({ page, liveData = null, forms, siteId, engine, origins, mode }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('waiting');
  const [message, setMessage] = useState('Waiting for the website builder');
  const [conflict, setConflict] = useState(null);
  const [highlight, setHighlight] = useState(null);
  const [generation, setGeneration] = useState(0);
  const [isDirty, setIsDirty] = useState(false);
  const [editMode, setEditMode] = useState('layout');
  const [pins, setPins] = useState([]);
  const pageSettingsRef = useRef(false);
  const session = useRef(null), draft = useRef(null), baseRevision = useRef(null), pending = useRef(null), timer = useRef(null);
  const mediaUrls = useRef({});
  const commands = useRef(null);
  const copyRef = useRef(false);

  useEffect(() => {
    if (mode !== 'editor') return undefined;
    const style = document.createElement('style');
    style.dataset.gsProofBlocks = '';
    style.textContent = proofBlockCss;
    document.head.append(style);
    return () => style.remove();
  }, [mode]);

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
    let request;
    try {
      request = saveRequest({ pending: pending.current, retry, pageId: page.id, baseRevisionId: baseRevision.current, data: nextData, createId: () => crypto.randomUUID() });
    } catch (error) {
      setStatus('failed'); setMessage(error.message); return;
    }
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
        if (mode === 'editor') setEditMode(editModeOf(result.payload));
        window.parent.postMessage(envelope('hello-ack', helloAckPayload({ protocol: FRAME_PROTOCOL, nonce, siteId,
          engine, mode, liveData, editorMessages: EDITOR_MESSAGES, motion: motionHello(proofConfig.components) })), event.origin);
        setMessage('Waiting for the page draft'); return;
      }
      if (!validMessage(event, session.current, ['load-draft', 'save-result', 'highlight', 'insert-media', 'set-motion', 'editor-command', 'comment-pins', 'capture', 'teardown'])) {
        if (event.data?.gs === 'website-frame') console.warn('Dropped frame message: origin, source, session, protocol or payload invalid');
        return;
      }
      const p = event.data.payload;
      if (event.data.type === 'editor-command') {
        if (mode === 'editor' && validEditorCommand(p)) commands.current?.(p);
      } else if (event.data.type === 'comment-pins' && mode === 'editor') {
        const next = validPins(p, draft.current);
        if (next) setPins(next);
      } else if (event.data.type === 'capture' && mode === 'editor') {
        const requestId = event.data.id;
        if (typeof requestId !== 'string' || !requestId) return;
        if (!captureTarget(p, draft.current)) { send('capture-result', { requestId, ok: false, message: 'The requested block is not in the draft.' }); return; }
        const doc = document.querySelector('.gs-frame-editor iframe')?.contentDocument;
        if (!doc) { send('capture-result', { requestId, ok: false, message: 'The page is not visible yet.' }); return; }
        capturePng(doc, p.blockId).then((result) => send('capture-result', { requestId, ok: true, ...result })).catch((error) => send('capture-result', { requestId, ok: false, message: String(error.message || error).slice(0, 2000) }));
      } else if (event.data.type === 'teardown') {
        draft.current = null; baseRevision.current = null; session.current = null; pending.current = null;
        clearTimeout(timer.current); releaseMedia(); setPins([]); setData(null); setStatus('closed'); setMessage('Editor closed');
      } else if (event.data.type === 'load-draft' && !draft.current && p.pageId === page.id && typeof p.revisionId === 'string' && Array.isArray(p.data?.content)) {
        addMedia(p.media); baseRevision.current = p.revisionId;
        const next = splitTwoDoorsToolsDraft(p.data);
        draft.current = next; setData(displayData(next)); setStatus('ready'); setMessage('Draft ready');
        if (next !== p.data) { dirty(true); save(next); }
      } else if (event.data.type === 'highlight' && mode === 'preview') {
        setHighlight(typeof p.blockId === 'string' ? p.blockId : null);
      } else if (event.data.type === 'insert-media') {
        const result = mode === 'editor' && draft.current && copyRef.current
          ? { ok: false, code: 'error', message: 'Edit copy changes words only. Switch to Layout to change images.' }
          : mode === 'editor' && draft.current
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
        const result = mode === 'editor' && draft.current && copyRef.current
          ? { ok: false, code: 'error', message: 'Edit copy changes words only. Switch to Layout to change motion.' }
          : mode === 'editor' && draft.current
          ? setMotion(draft.current, p, page.slug)
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
  }, [engine, mode, origins, page.id, siteId, liveData]);

  const copy = mode === 'editor' && editMode === 'copy';
  copyRef.current = copy;
  // Puck reads its permissions when it mounts: remount on the current draft, unsaved words kept.
  function switchEditMode(on) {
    const next = on ? 'layout' : 'copy';
    if (next === editMode) return;
    if (draft.current) setData(displayData(draft.current));
    setEditMode(next); setGeneration((n) => n + 1);
  }
  function importLive() {
    const imported = importLiveData(liveData, draft.current);
    if (!imported) return;
    draft.current = imported; setData(displayData(imported)); setGeneration((n) => n + 1);
    dirty(true); setStatus('ready'); setMessage('Live page imported. Saving draft');
    save(imported);
  }
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
    {mode !== 'editor' && <header className="gs-frame-bar"><div><span className="gs-frame-kicker">Greatstone Studio</span><strong>{page.title}</strong></div><div className="gs-frame-actions"><span role="status" aria-live="polite">{message}</span></div></header>}
    {conflict && <section className="gs-frame-notice" role="alert"><h2>Someone saved this page first</h2><p>Review the differences below. Keep mine preserves this canvas and lets you save it over their draft. Take theirs replaces this canvas with their saved draft and discards your unsaved changes.</p><div className="gs-frame-versions">{changes.length ? changes.map((block) => <section key={block.id}><h3>{block.name}</h3>{block.fields.map((field) => <div className="gs-frame-change" key={field.label}><strong>{field.label}</strong><div><p><b>Mine</b><span>{field.mine || 'No text'}</span></p><p><b>Theirs</b><span>{field.theirs || 'No text'}</span></p></div></div>)}</section>) : <p>No wording changes. The page layout or other block settings differ.</p>}</div><div className="gs-frame-conflict-actions"><button type="button" onClick={keepMine}>Keep mine and review save</button><button type="button" onClick={takeTheirs}>Take theirs, discard mine</button></div></section>}
    {status === 'failed' && <div className="gs-frame-notice" role="alert"><p>{message}</p>{pending.current && <button type="button" onClick={() => save(undefined, true)}>Retry save</button>}</div>}
    {mode === 'editor' ? <FrameEditingContext.Provider value={true}><FrameCopyContext.Provider value={copy}><Puck key={generation} config={proofConfig} data={data} {...(copy ? { permissions: COPY_PERMISSIONS } : {})} ui={EDITOR_UI} headerTitle={page.title} headerPath={page.path} dictionary={{ 'header-publish': 'Save draft' }} iframe={{ enabled: true, syncHostStyles: true }} overrides={{ headerActions: () => <FrameControls send={send} save={save} commands={commands} copy={copy} pins={pins} onLayout={switchEditMode} onImport={importLive} pageSettingsRef={pageSettingsRef} /> }} viewports={[{ width: '100%', label: 'Full width', icon: 'FullWidth' }]} onChange={onChange} onPublish={(nextData) => { draft.current = rawData(nextData); save(draft.current); }} /></FrameCopyContext.Provider></FrameEditingContext.Provider>
      : <div className="gs-frame-preview" onClick={pick}><PreviewContext.Provider value={true}><ProofBlocks data={data} pageSlug={page.slug} forms={forms} /></PreviewContext.Provider>{highlight && <style>{`[data-gs-block-id="${CSS.escape(highlight)}"]{outline:3px solid #c8ff00;outline-offset:4px}`}</style>}</div>}
  </main>;
}
