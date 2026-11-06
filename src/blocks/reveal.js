import { useEffect, useRef } from 'react';

// Confident, restrained entrance: children with [data-reveal] settle in once, on the
// signature ease, staggered. Anything already in the viewport on mount reveals immediately
// (so above-the-fold content never waits on an observer that may be throttled); the rest
// reveals as it scrolls in. Honours reduced-motion and never re-hides.
export function useReveal(deps = []) {
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const nodes = root.matches('[data-reveal]') ? [root, ...root.querySelectorAll('[data-reveal]')] : [...root.querySelectorAll('[data-reveal]')];
    if (!nodes.length) return;
    nodes.forEach((node, index) => {
      if (!node.style.transitionDelay) node.style.setProperty('--gs-reveal-delay', `${(index % 4) * 70}ms`);
    });
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      nodes.forEach((n) => n.classList.add('is-in'));
      return;
    }
    const vh = innerHeight || 800;
    const toObserve = [];
    nodes.forEach((n) => {
      const r = n.getBoundingClientRect();
      if (r.top < vh * 0.92) n.classList.add('is-in'); // in view, OR scrolled past above the fold (mid-page refresh) → reveal now
      else toObserve.push(n);                          // only genuinely below-the-fold nodes wait on the observer
    });
    if (!toObserve.length) return;
    if (typeof IntersectionObserver === 'undefined') {
      toObserve.forEach((node) => node.classList.add('is-in'));
      return;
    }
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); obs.unobserve(e.target); } });
    }, { threshold: 0.16, rootMargin: '0px 0px -6% 0px' });
    toObserve.forEach((n) => obs.observe(n));
    return () => obs.disconnect();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}
