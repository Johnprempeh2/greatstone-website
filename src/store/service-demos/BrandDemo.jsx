// Brand, Content & Media archetype.
//
// The motion kind runs the REAL thing: src/lib/greatstone-logo.mjs, the same WebGL build that drives the
// homepage. Showing our own mark is the honest move here, since it is the one real-time build we can put in
// front of a visitor and say "this is running now, not a video". three.js is pulled in by dynamic import at
// the moment the demo scrolls into view, so a visitor who never reaches it never downloads it, and destroy()
// gives the GL context back on unmount.
//
// The studio kind draws on a plain canvas from a seeded generator, so a study number always produces the
// same picture. The other two kinds are DOM, in brand-screens.jsx.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { pieceFor } from './brand-content.mjs';
import { MultiplyScreen, DocumentScreen } from './brand-screens.jsx';

const prefersReduced = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── the real-time mark ─────────────────────────────────────────────────────────────────────────────── */
function MotionScreen({ data }) {
  const host = useRef(null);
  const handle = useRef(null);
  const [state, setState] = useState('idle'); // idle | loading | live | failed
  const [scroll, setScroll] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    let dead = false;

    const start = async () => {
      if (dead || handle.current) return;
      setState('loading');
      try {
        const mod = await import('../../lib/greatstone-logo.mjs');
        if (dead) return;
        handle.current = mod.mountGreatstoneLogo(el, {
          envUrl: import.meta.env.BASE_URL + 'env-emerald.jpg',
          bloom: 0.85, exposure: 1.4, idle: true, autoTurn: data.mode !== 'scroll',
        });
        setState('live');
      } catch {
        if (!dead) setState('failed');
      }
    };

    // Only pay for the mark once it is worth looking at. Measure first and start straight away when it is
    // already on screen: an observer's callbacks are delivered by the rendering loop, so waiting on one in a
    // background tab (or any paused renderer) leaves the demo stuck at "loading" forever.
    let io = null;
    const near = () => {
      const r = el.getBoundingClientRect();
      return r.bottom > -200 && r.top < (window.innerHeight || 0) + 200;
    };
    if (near() || typeof IntersectionObserver === 'undefined') {
      start();
    } else {
      io = new IntersectionObserver((es) => {
        if (es.some((e) => e.isIntersecting)) { start(); if (io) { io.disconnect(); io = null; } }
      }, { rootMargin: '200px' });
      io.observe(el);
    }

    return () => {
      dead = true;
      if (io) io.disconnect();
      if (handle.current) { handle.current.destroy(); handle.current = null; }
    };
  }, [data.mode]);

  const onScroll = (v) => {
    setScroll(v);
    if (handle.current) handle.current.setScroll(v / 100);
  };
  const togglePlay = () => {
    const next = !playing;
    setPlaying(next);
    if (handle.current) handle.current.setActive(next);
  };

  return (
    <div className="sbd-motion">
      <div className="sbd-stagewrap">
        <div className="sbd-stage" ref={host} aria-hidden="true" />
        {/* 'idle' means it has not been asked to start yet, which is not worth a message */}
        {state === 'loading' || state === 'failed' ? (
          <p className="sbd-stagenote" role="status">
            {state === 'failed'
              ? 'This browser would not give us a 3D context, so the mark is not running. On a live build a still frame takes its place.'
              : 'Bringing the mark up…'}
          </p>
        ) : null}
      </div>

      <div className="sbd-controls">
        {data.mode === 'scroll' ? (
          <label className="sbd-slider">
            <span>Scroll position</span>
            <input
              type="range" min="0" max="100" value={scroll}
              onChange={(e) => onScroll(Number(e.target.value))}
              disabled={state !== 'live'}
            />
            <b>{scroll}%</b>
          </label>
        ) : (
          <p className="sbd-hint">{data.hint}</p>
        )}
        <button type="button" className="sdemo-reset" onClick={togglePlay} disabled={state !== 'live'}>
          {playing ? 'Pause it' : 'Play it'}
        </button>
      </div>

      {data.mode === 'scroll' ? <p className="sbd-hint">{data.hint}</p> : null}
    </div>
  );
}

/* ── the generative studio ──────────────────────────────────────────────────────────────────────────── */
function StudioScreen({ data }) {
  const canvas = useRef(null);
  const handle = useRef(null);
  const [seed, setSeed] = useState(14);
  const [technique, setTechnique] = useState('');
  const [depth, setDepth] = useState(85);
  const [angle, setAngle] = useState(215);

  const applyLight = useCallback((deg) => {
    const rad = (deg * Math.PI) / 180;
    if (handle.current) handle.current.setLight(0.5 + Math.cos(rad) * 0.5, 0.5 + Math.sin(rad) * 0.5);
  }, []);

  useEffect(() => {
    let dead = false;
    const el = canvas.current;
    if (!el) return undefined;
    import('./brand-canvas.mjs').then((mod) => {
      if (dead) return;
      handle.current = mod.mountStudio(el, { mode: data.mode, seed, depth: depth / 100 });
      setTechnique(handle.current.technique());
      applyLight(angle);
    }).catch(() => {});
    return () => { dead = true; if (handle.current) { handle.current.destroy(); handle.current = null; } };
    // Mount once. Every later change goes through the handle rather than a remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.mode]);

  const another = () => {
    const next = seed + 1;
    setSeed(next);
    if (handle.current) { handle.current.setSeed(next); setTechnique(handle.current.technique()); }
  };
  const onDepth = (v) => { setDepth(v); if (handle.current) handle.current.setDepth(v / 100); };
  const onAngle = (v) => { setAngle(v); applyLight(v); };

  // The canvas is a nicety for pointer users; the sliders below carry the same control for everyone else.
  const onPointer = (e) => {
    if (data.mode !== 'relief' || !handle.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - r.left) / r.width - 0.5;
    const dy = (e.clientY - r.top) / r.height - 0.5;
    const deg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
    setAngle(deg);
    handle.current.setLight(0.5 + dx, 0.5 + dy);
  };

  return (
    <div className="sbd-studio">
      <div className={'sbd-canvaswrap' + (data.mode === 'relief' ? ' is-relief' : '')} onPointerMove={onPointer}>
        <canvas ref={canvas} className="sbd-canvas" aria-hidden="true" />
      </div>

      {data.mode === 'relief' ? (
        <div className="sbd-controls">
          <label className="sbd-slider">
            <span>Light</span>
            <input type="range" min="0" max="359" value={angle} onChange={(e) => onAngle(Number(e.target.value))} />
            <b>{angle}°</b>
          </label>
          <label className="sbd-slider">
            <span>Depth</span>
            <input type="range" min="0" max="100" value={depth} onChange={(e) => onDepth(Number(e.target.value))} />
            <b>{depth === 0 ? 'flat' : depth + '%'}</b>
          </label>
        </div>
      ) : (
        <div className="sbd-controls">
          <p className="sbd-studytag">
            <b>Study {String(seed).padStart(3, '0')}</b>
            {technique ? <span>{technique}</span> : null}
          </p>
          <button type="button" className="sdemo-run" onClick={another}>Another study</button>
        </div>
      )}

      <p className="sbd-hint">{data.hint}</p>
    </div>
  );
}

/* ── the frame ──────────────────────────────────────────────────────────────────────────────────────── */
const KINDS = { motion: MotionScreen, studio: StudioScreen, multiply: MultiplyScreen, document: DocumentScreen };

export default function BrandDemo({ svc }) {
  const piece = pieceFor(svc);
  if (!piece) return null;
  const Screen = KINDS[piece.kind];
  if (!Screen) return null;
  const data = piece[piece.kind] || {};
  const reduced = prefersReduced();

  return (
    <div className="sbd">
      <div className="sdemo-console">
        <div className="sdemo-bar">
          <span className="sdemo-dot" aria-hidden="true" />
          <span className="sdemo-name">{svc.name}</span>
          <span className="sdemo-chan">{piece.kind === 'motion' ? 'Real time' : piece.kind === 'studio' ? 'Generated live' : 'Sample'}</span>
        </div>

        <div className="sbd-body">
          <Screen data={data} />
        </div>

        {data.facts ? (
          <div className="sdemo-ask sbd-facts">
            {data.facts.map(([k, v]) => (
              <span key={k} className="swd-fact"><i>{k}</i><b>{v}</b></span>
            ))}
          </div>
        ) : null}
      </div>

      {data.truth ? <p className="sbd-truth">{data.truth}</p> : null}
      {reduced && (piece.kind === 'motion' || piece.kind === 'studio') ? (
        <p className="sbd-truth">Your system asks for reduced motion, so this is holding a still frame.</p>
      ) : null}
    </div>
  );
}
