import { useEffect, useRef, useMemo } from 'react';
import { mountGreatstoneLogo } from './lib/greatstone-logo.mjs';
import { mountSummit } from './lib/summit-bg.mjs';
import { mountTide } from './lib/tideMount.js';
import { smoothstep } from './stage-presets.js';
import { normalizeBackground } from './store.js';

// re-exported so existing importers keep working
export { STAGE_OPTIONS } from './stage-presets.js';

// kind → 3D module. Each scene mounts into its own fixed full-screen layer; array order is z-index.
const MOUNTERS = {
  stone: (host) => mountGreatstoneLogo(host, { envUrl: import.meta.env.BASE_URL + 'env-emerald.jpg', bloom: 0.9, exposure: 1.4, idle: true, autoTurn: true }),
  summit: (host) => mountSummit(host, {}),
  tide: (host) => mountTide(host, {}),
  tideRadial: (host) => mountTide(host, { focalPoint: { x: 0.5, y: 0.5 }, sweep: [0, Math.PI * 2], arcs: 44, warpStrength: 50 }),
  tideCalm: (host) => mountTide(host, { arcs: 30, flowSpeed: 0.10, crest: false, warpStrength: 28 }),
};

// The persistent 3D stage. The page's background is a scene track: ordered scenes that cross-fade
// at editable scroll points. Layer k's opacity = (faded-in by the transition below) × (faded-out by
// the transition above), so the base scene is always opaque and higher scenes dissolve over it.
// Each scene also gets a LOCAL climb (0..1 across its own band), an upgrade over a single global one.
// `previewP` (0..1) lets the editor scrub the transition without scrolling the page.
export default function Stage({ background = 'stone', previewP = null }) {
  const ref = useRef(null);
  const cfgRef = useRef(null);
  const applyRef = useRef(null);
  const previewRef = useRef(previewP);

  const cfg = useMemo(() => normalizeBackground(background), [background]);
  cfgRef.current = cfg;            // keep the latest transitions available to apply() without remount
  previewRef.current = previewP;
  const kindsKey = cfg.scenes.map((s) => s.kind).join('>'); // mount signature: only scene kinds force a remount

  useEffect(() => {
    const root = ref.current;
    if (!root || !cfg.scenes.length) { applyRef.current = null; return undefined; }
    const layers = cfg.scenes.map((s) => {
      const host = document.createElement('div'); host.className = 'gs-layer'; root.appendChild(host);
      return { kind: s.kind, host, handle: MOUNTERS[s.kind] ? MOUNTERS[s.kind](host) : null };
    });
    const apply = () => {
      const c = cfgRef.current; const n = layers.length;
      const max = document.body.scrollHeight - innerHeight;
      const inj = previewRef.current;
      const p = inj != null ? inj : (max > 0 ? Math.min(Math.max(scrollY / max, 0), 1) : 0);
      let prev = 0;
      const t = (c.transitions || []).map((tr) => {
        const half = Math.max(tr.fade, 1e-4) / 2;
        let ti = smoothstep(tr.at - half, tr.at + half, p);
        ti = Math.max(ti, prev); prev = ti; // monotonic: a later transition can't un-fade an earlier one
        return ti;
      });
      layers.forEach((l, k) => {
        const incoming = k > 0 ? t[k - 1] : 1;
        const outgoing = k < n - 1 ? 1 - t[k] : 1;
        l.host.style.opacity = String(incoming * outgoing);
        l.host.style.zIndex = String(k);
        const bandStart = k > 0 ? c.transitions[k - 1].at : 0;
        const bandEnd = k < n - 1 ? c.transitions[k].at : 1;
        const localClimb = Math.min(Math.max((p - bandStart) / Math.max(bandEnd - bandStart, 1e-4), 0), 1);
        if (l.handle && l.handle.setClimb) l.handle.setClimb(localClimb);
      });
    };
    applyRef.current = apply;
    addEventListener('scroll', apply, { passive: true });
    addEventListener('resize', apply, { passive: true });
    apply();
    return () => {
      removeEventListener('scroll', apply); removeEventListener('resize', apply);
      applyRef.current = null;
      layers.forEach((l) => { if (l.handle && l.handle.destroy) l.handle.destroy(); if (l.host.parentNode) l.host.parentNode.removeChild(l.host); });
    };
  }, [kindsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // re-apply (cross-fade only, no WebGL remount) when transitions or the preview position change
  useEffect(() => { if (applyRef.current) applyRef.current(); }, [background, previewP]);

  if (!cfg.scenes.length) return null;
  return (
    <>
      <div className="gs-stage" ref={ref} aria-hidden="true" />
      <div className="gs-scrim" aria-hidden="true" />
    </>
  );
}
