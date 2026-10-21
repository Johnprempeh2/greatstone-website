import { useEffect, useRef } from 'react';
import { mountGreatstoneTide } from '../lib/tide-gl.js';

export function TideField({ view = 'hero', enabled = true }) {
  const host = useRef(null);
  useEffect(() => {
    if (!enabled || !host.current) return;
    const node = host.current;
    const section = node.parentElement;
    const narrow = window.matchMedia('(max-width:860px)');
    let tide;
    let observer;
    let cancelled = false;
    let idleId;
    let timeoutId;
    const start = () => {
      if (cancelled) return;
      try {
        tide = mountGreatstoneTide(node, view === 'calm'
          ? { view: 'calm', speed: 0.36, swell: 0.6, dpr: 1.5 }
          : { touchTarget: section, prominence: () => narrow.matches ? 0.8 : 0.9, lime: () => narrow.matches ? 0.4 : 1 });
      } catch { tide = null; }
      if (!tide) return;
      node.classList.add('live');
      tide.onLost = () => node.classList.remove('live');
      if ('IntersectionObserver' in window) {
        observer = new IntersectionObserver(([entry]) => tide?.setActive(entry.isIntersecting));
        observer.observe(section);
      }
    };
    const later = () => {
      if ('requestIdleCallback' in window) idleId = window.requestIdleCallback(start, { timeout: 600 });
      else timeoutId = window.setTimeout(start, 120);
    };
    if (document.readyState === 'complete') later();
    else window.addEventListener('load', later, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener('load', later);
      if (idleId != null) window.cancelIdleCallback(idleId);
      if (timeoutId != null) window.clearTimeout(timeoutId);
      observer?.disconnect();
      tide?.destroy();
      node.classList.remove('live');
    };
  }, [view, enabled]);
  return <div ref={host} className={`td-tide td-tide-${view}`} aria-hidden="true" />;
}
