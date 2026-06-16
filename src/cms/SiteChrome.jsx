import { useEffect, useRef } from 'react';

// The public site's bespoke desktop chrome — a faithful port of the live site's signature layer:
// a top scroll-progress line + a lime custom cursor (dot follows raw, ring + "Explore" label follow
// an eased position; mix-blend difference). Rendered ONLY on the public view (never in the Puck
// editor, where a custom cursor would fight precise editing). The cursor is gated to fine pointers
// and disabled under prefers-reduced-motion; the progress line always runs (it's cheap + rAF-batched).
// (Facet-trail canvas, dot-nav, hud-chapter and preloader are the remaining parts of this gap.)
export default function SiteChrome() {
  const cursorRef = useRef(null);
  useEffect(() => {
    const bar = document.getElementById('gs-progress-bar');
    const scroller = () => document.scrollingElement || document.documentElement;
    let pTick = false;
    const onScroll = () => {
      if (pTick) return; pTick = true;
      requestAnimationFrame(() => {
        pTick = false;
        const se = scroller();
        const h = se.scrollHeight - se.clientHeight;
        if (bar) bar.style.transform = `scaleX(${h > 0 ? Math.min(1, Math.max(0, se.scrollTop / h)) : 0})`;
      });
    };
    addEventListener('scroll', onScroll, { passive: true, capture: true });
    addEventListener('resize', onScroll, { passive: true });
    onScroll();

    const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;
    const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
    if (!fine || reduce) {
      return () => { removeEventListener('scroll', onScroll, { capture: true }); removeEventListener('resize', onScroll); };
    }

    document.documentElement.classList.add('gs-cursor-on');
    const root = cursorRef.current;
    const dot = root.querySelector('.gs-cur-dot');
    const ring = root.querySelector('.gs-cur-ring');
    const label = root.querySelector('.gs-cur-label');
    const mouse = { x: innerWidth / 2, y: innerHeight / 2 };
    const smooth = { x: mouse.x, y: mouse.y };
    const ringP = { x: mouse.x, y: mouse.y };
    const ease = (a, b, k) => a + (b - a) * k;
    let raf = 0;
    const loop = () => {
      if (!document.hidden) {
        smooth.x = ease(smooth.x, mouse.x, 0.2); smooth.y = ease(smooth.y, mouse.y, 0.2);
        ringP.x = ease(ringP.x, smooth.x, 0.4); ringP.y = ease(ringP.y, smooth.y, 0.4);
        dot.style.transform = `translate(${mouse.x}px, ${mouse.y}px)`;
        ring.style.transform = `translate(${ringP.x}px, ${ringP.y}px)`;
        label.style.transform = `translate(${smooth.x}px, ${smooth.y}px) translate(-50%,-50%) scale(${root.classList.contains('label') ? 1 : 0.5})`;
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    const onMove = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const interactive = 'a,button,[role="button"],input,select,textarea,label';
    const onOver = (e) => {
      const stone = e.target.closest && e.target.closest('[data-cursor="explore"]');
      const i = e.target.closest && e.target.closest(interactive);
      if (stone) { root.classList.add('label'); root.classList.remove('hover'); }
      else if (i) { root.classList.add('hover'); root.classList.remove('label'); }
    };
    const onOut = (e) => { if (!e.relatedTarget || !(e.relatedTarget.closest && e.relatedTarget.closest(interactive + ',[data-cursor]'))) root.classList.remove('hover', 'label'); };
    addEventListener('pointermove', onMove, { passive: true });
    addEventListener('pointerover', onOver);
    addEventListener('pointerout', onOut);

    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('scroll', onScroll, { capture: true });
      removeEventListener('resize', onScroll);
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerover', onOver);
      removeEventListener('pointerout', onOut);
      document.documentElement.classList.remove('gs-cursor-on');
    };
  }, []);

  return (
    <>
      <div className="gs-progress" id="gs-progress-bar" aria-hidden="true" />
      <div className="gs-cursor" ref={cursorRef} aria-hidden="true">
        <div className="gs-cur-dot" />
        <div className="gs-cur-ring" />
        <div className="gs-cur-label">Explore</div>
      </div>
    </>
  );
}
