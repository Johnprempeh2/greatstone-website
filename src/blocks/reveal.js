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
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      nodes.forEach((n) => n.classList.add('is-in'));
      return;
    }
    const vh = innerHeight || 800;
    const toObserve = [];
    nodes.forEach((n) => {
      const r = n.getBoundingClientRect();
      if (r.top < vh * 0.92 && r.bottom > -1) n.classList.add('is-in'); // already in view → reveal now
      else toObserve.push(n);
    });
    if (!toObserve.length) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); obs.unobserve(e.target); } });
    }, { threshold: 0.16, rootMargin: '0px 0px -6% 0px' });
    toObserve.forEach((n) => obs.observe(n));
    return () => obs.disconnect();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}
