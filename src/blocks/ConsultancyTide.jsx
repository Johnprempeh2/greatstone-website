import { useEffect, useRef } from 'react';
import { mountGreatstoneTide } from '../lib/tide-gl.js';

const sceneFor = (item) => ({ Hero: 'hero', LogoWall: 'calm', PillarCards: 'calm', LayerStack: 'method', DxConsultancyMethod: 'method', ComposeExplorer: 'compose', BridgeMap: 'deep', CaseStudy: 'deep', ComparisonMatrix: 'land', Invite: 'hero', ContactBand: 'hero' })[item] || 'deep';

export function ConsultancyTide({ pageRef, content }) {
  const host = useRef(null);
  useEffect(() => {
    const node = host.current;
    const page = pageRef.current;
    if (!node || !page) return;
    let tide;
    let cancelled = false;
    let idleId;
    let timeoutId;
    let scrollFrame = 0;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const blocks = [...page.querySelectorAll('.consultancy-block')];
    const scenes = blocks.map((block, i) => ({
      block,
      scene: sceneFor(content[i]?.type),
    }));
    const reveal = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        reveal.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -6% 0px' });
    if (reduce) blocks.forEach((block) => block.classList.add('is-in'));
    else blocks.forEach((block) => {
      if (block.getBoundingClientRect().top < innerHeight * .92) block.classList.add('is-in');
      else reveal.observe(block);
    });
    page.classList.add('consultancy-ready');
    const update = () => {
      scrollFrame = 0;
      if (!tide || reduce) return;
      const focus = innerHeight * 0.52;
      let index = 0;
      for (let i = 0; i < scenes.length; i++) {
        if (scenes[i].block.getBoundingClientRect().top <= focus) index = i;
      }
      const current = scenes[index];
      const next = scenes[Math.min(index + 1, scenes.length - 1)];
      const a = current.block.getBoundingClientRect();
      const b = next.block.getBoundingClientRect();
      const progress = current === next ? 0 : Math.max(0, Math.min(1, (focus - a.top) / Math.max(1, b.top - a.top)));
      tide.setScene(current.scene, next.scene, progress);
      page.style.setProperty('--consultancy-parallax', `${Math.max(-8, Math.min(8, (focus - a.top) / Math.max(1, a.height) * 12 - 6))}px`);
      const lit = page.querySelectorAll('.b-compose-problem.is-on').length;
      tide.setComposeGlow(lit ? Math.min(1, .35 + lit * .18) : 0);
      tide.setStepRows(steps.map((step) => { range.selectNodeContents(step); const r = range.getBoundingClientRect(); return r.top + r.height / 2; }));
    };
    const onScroll = () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(update); };
    const methodBlock = scenes.find(({ scene }) => scene === 'method')?.block;
    const steps = methodBlock ? [...methodBlock.querySelectorAll('.b-layer-num, .b-dx-method-number')].slice(0, 4) : [];
    const range = document.createRange();   /* the number's text box: the span itself can stretch to the whole step */
    const compose = page.querySelector('.b-compose-problems');
    const composeObserver = compose ? new MutationObserver(onScroll) : null;
    if (composeObserver) composeObserver.observe(compose, { attributes: true, subtree: true, attributeFilter: ['class'] });
    const start = () => {
      if (cancelled) return;
      try { tide = mountGreatstoneTide(node, {
        touchTarget: page,
        scrollScene: true,
        dpr: matchMedia('(max-width: 860px)').matches ? 1.5 : 2,
        prominence: .85,
      }); } catch (error) { console.error('Consultancy tide failed', error); tide = null; }
      if (!tide) return;
      node.classList.add('live');
      tide.onLost = () => node.classList.remove('live');
      update();
      if (!reduce) window.addEventListener('scroll', onScroll, { passive: true });
      if (!reduce) window.addEventListener('resize', onScroll, { passive: true });
      /* the steps slide in on reveal, so re-read where they sit once they land */
      methodBlock?.addEventListener('transitionend', onScroll);
    };
    if (document.readyState === 'complete') {
      if ('requestIdleCallback' in window) idleId = requestIdleCallback(start, { timeout: 600 });
      else timeoutId = setTimeout(start, 120);
    } else window.addEventListener('load', start, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener('load', start);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      methodBlock?.removeEventListener('transitionend', onScroll);
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      if (idleId != null) cancelIdleCallback(idleId);
      if (timeoutId != null) clearTimeout(timeoutId);
      tide?.destroy();
      reveal.disconnect();
      composeObserver?.disconnect();
    };
  }, [pageRef, content]);
  return <div ref={host} className="consultancy-tide" aria-hidden="true" />;
}
