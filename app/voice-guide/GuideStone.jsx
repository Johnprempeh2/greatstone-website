'use client';

// The Greatstone stone beside the guide. The still mark paints with the page; the live 3D stone replaces it only
// after the page has loaded and the browser is idle, and never with reduced motion, Save-Data or without WebGL
// (the still stays). `levels()` gives the guide's and the visitor's loudness, 0 to 1, read on every frame.
import { useEffect, useRef } from 'react';
import { stonePose } from './guide-client.mjs';

const quiet = () => ({ speak: 0, mic: 0 });

export default function GuideStone({ status = 'idle', levels = quiet, className = '' }) {
  const host = useRef(null);
  const live = useRef({ status, levels });
  live.current = { status, levels };

  useEffect(() => {
    const node = host.current;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let release;
    let idle;
    let gone = false;
    const up = () => {
      if (gone || release || reduced.matches || navigator.connection?.saveData) return;
      import('./voice-stone.mjs').then(({ mountVoiceStone }) => {
        if (gone || release || reduced.matches) return;
        try {
          release = mountVoiceStone(node, (t) => stonePose(live.current.status, live.current.levels(), t));
        } catch { /* no WebGL: the still stays */ }
      }).catch(() => {});
    };
    const later = () => { idle = 'requestIdleCallback' in window ? requestIdleCallback(up, { timeout: 1500 }) : setTimeout(up, 200); };
    const onMotion = () => {
      if (reduced.matches) { release?.(); release = undefined; } else later();
    };
    if (document.readyState === 'complete') later();
    else window.addEventListener('load', later, { once: true });
    reduced.addEventListener('change', onMotion);
    return () => {
      gone = true;
      window.removeEventListener('load', later);
      if ('cancelIdleCallback' in window) cancelIdleCallback(idle); else clearTimeout(idle);
      reduced.removeEventListener('change', onMotion);
      release?.();
    };
  }, []);

  return (
    <span className={`gsvg-stone ${className}`} data-status={status} ref={host} aria-hidden="true">
      <img className="gsvg-stone-still" src="/motion/stone-accent.svg" alt="" width="372" height="526" />
    </span>
  );
}
