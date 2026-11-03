import { useEffect, useRef } from 'react';
import { mountGreatstoneTide } from '../lib/tide-gl.js';
import { tailStrength } from '../lib/tide-tail.mjs';

// Start the WebGL tide after the page has loaded and the browser is idle. Returns a cancel function.
function whenIdle(view, start) {
  let idleId;
  let timeoutId;
  const later = () => {
    if ('requestIdleCallback' in view) idleId = view.requestIdleCallback(start, { timeout: 600 });
    else timeoutId = view.setTimeout(start, 120);
  };
  if (view.document.readyState === 'complete') later();
  else view.addEventListener('load', later, { once: true });
  return () => {
    view.removeEventListener('load', later);
    if (idleId != null) view.cancelIdleCallback(idleId);
    if (timeoutId != null) view.clearTimeout(timeoutId);
  };
}

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
    const cancelStart = whenIdle(window, start);
    return () => {
      cancelled = true;
      cancelStart();
      observer?.disconnect();
      tide?.destroy();
      node.classList.remove('live');
    };
  }, [view, enabled]);
  return <div ref={host} className={`td-tide td-tide-${view}`} aria-hidden="true" />;
}

// The calm tide from this segment down to the footer. One fixed layer behind the page, so the lines
// run on unbroken under every later segment; it gets weaker the further down the page you read.
export function TideTail({ enabled = true }) {
  const anchor = useRef(null);
  useEffect(() => {
    if (!enabled || !anchor.current) return;
    const segment = anchor.current.parentElement;
    const doc = segment.ownerDocument;
    const view = doc.defaultView;
    const layer = doc.createElement('div');
    layer.className = 'td-tide-tail';
    layer.setAttribute('aria-hidden', 'true');
    const field = doc.createElement('div');
    field.className = 'td-tide-tail-field';
    layer.appendChild(field);
    doc.body.appendChild(layer);
    doc.documentElement.classList.add('td-tail-on');
    let tide;
    let cancelled = false;
    let ticking = false;
    const apply = () => {
      ticking = false;
      const top = segment.getBoundingClientRect().top;
      const footer = doc.querySelector('footer');
      const bottom = footer ? footer.getBoundingClientRect().top : doc.documentElement.scrollHeight - view.scrollY;
      field.style.opacity = String(tailStrength(0, view.innerHeight, top, bottom));
      tide?.setActive(top < view.innerHeight && bottom > 0);
    };
    const onScroll = () => { if (!ticking) { ticking = true; view.requestAnimationFrame(apply); } };
    const start = () => {
      if (cancelled) return;
      try { tide = mountGreatstoneTide(field, { view: 'calm', speed: 0.36, swell: 0.6, dpr: 1.5 }); } catch { tide = null; }
      if (!tide) return;
      layer.classList.add('live');
      tide.onLost = () => layer.classList.remove('live');
      apply();
    };
    view.addEventListener('scroll', onScroll, { passive: true });
    view.addEventListener('resize', onScroll, { passive: true });
    apply();
    const cancelStart = whenIdle(view, start);
    return () => {
      cancelled = true;
      cancelStart();
      view.removeEventListener('scroll', onScroll);
      view.removeEventListener('resize', onScroll);
      tide?.destroy();
      layer.remove();
      doc.documentElement.classList.remove('td-tail-on');
    };
  }, [enabled]);
  return <span ref={anchor} hidden />;
}
