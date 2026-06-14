import { useEffect, useRef } from 'react';
import { mountGreatstoneLogo } from './lib/greatstone-logo.mjs';
import { mountSummit } from './lib/summit-bg.mjs';

// The selectable 3D "stage": one fixed layer behind the page. A page's background can be a
// single scene OR a scroll-staged SEQUENCE that cross-fades as the reader descends — the
// stone at the top giving way to the summit lower down, exactly how the live homepage reads.
// Two live WebGL contexts at once is well within budget; each module animates itself and
// forceContextLoss()es on destroy, so switching pages never leaks a context.
export const STAGE_OPTIONS = [
  { id: 'stone', label: 'Stone (logo)', scenes: ['stone'] },
  { id: 'summit', label: 'Summit (terrain)', scenes: ['summit'] },
  { id: 'stone-summit', label: 'Stone → Summit (scroll)', scenes: ['stone', 'summit'] },
  { id: 'none', label: 'None', scenes: [] },
];

const MOUNTERS = {
  stone: (host) => mountGreatstoneLogo(host, { envUrl: import.meta.env.BASE_URL + 'env-emerald.jpg', bloom: 0.9, exposure: 1.4, idle: true, autoTurn: true }),
  summit: (host) => mountSummit(host, {}),
};

const smoothstep = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };

export default function Stage({ background = 'stone' }) {
  const ref = useRef(null);

  useEffect(() => {
    const root = ref.current;
    const opt = STAGE_OPTIONS.find((o) => o.id === background) || STAGE_OPTIONS[0];
    if (!root || !opt.scenes.length) return;

    // each scene gets its own absolutely-positioned full-screen host + 3D module
    const layers = opt.scenes.map((kind) => {
      const host = document.createElement('div');
      host.className = 'gs-layer';
      root.appendChild(host);
      return { kind, host, handle: MOUNTERS[kind] ? MOUNTERS[kind](host) : null };
    });

    const apply = () => {
      const max = document.body.scrollHeight - innerHeight;
      const p = max > 0 ? Math.min(Math.max(scrollY / max, 0), 1) : 0;
      if (layers.length === 1) {
        layers[0].host.style.opacity = '1';
      } else {
        // cross-fade scene 0 → 1 through the middle third of the scroll
        const t = smoothstep(0.40, 0.70, p);
        layers[0].host.style.opacity = String(1 - t);
        layers[1].host.style.opacity = String(t);
      }
      layers.forEach((l) => { if (l.handle && l.handle.setClimb) l.handle.setClimb(p); });
    };
    addEventListener('scroll', apply, { passive: true });
    addEventListener('resize', apply, { passive: true });
    apply();

    return () => {
      removeEventListener('scroll', apply);
      removeEventListener('resize', apply);
      layers.forEach((l) => {
        if (l.handle && l.handle.destroy) l.handle.destroy();
        if (l.host.parentNode) l.host.parentNode.removeChild(l.host);
      });
    };
  }, [background]);

  if (background === 'none') return null;
  return (
    <>
      <div className="gs-stage" ref={ref} aria-hidden="true" />
      <div className="gs-scrim" aria-hidden="true" />
    </>
  );
}
