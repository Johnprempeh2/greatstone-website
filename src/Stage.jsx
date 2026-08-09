import { useEffect, useRef, useMemo } from 'react';
import { mountGreatstoneLogo } from './lib/greatstone-logo.mjs';
import { mountSummit } from './lib/summit-bg.mjs';
import { mountCairn } from './lib/cairn-bg.mjs';
import { mountTide } from './lib/tideMount.js';
import { smoothstep, scrollContext, resolveTransitionAt } from './stage-presets.js';
import { normalizeBackground } from './store.js';

// kind → 3D module. Each scene mounts into its own fixed full-screen layer; array order is z-index.
const MOUNTERS = {
  stone: (host) => mountGreatstoneLogo(host, { envUrl: import.meta.env.BASE_URL + 'env-emerald.jpg', bloom: 0.9, exposure: 1.4, idle: true, autoTurn: true }),
  summit: (host) => mountSummit(host, {}),
  cairn: (host) => mountCairn(host, {}),
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
      // mounting constructs a WebGL renderer, which THROWS when WebGL is unavailable (blocklisted GPU,
      // hardened/privacy browser, some VMs, a crashed GPU process). Guard it so the page degrades to a
      // solid surface instead of an uncaught commit-phase throw tearing down the whole React root.
      let handle = null;
      try { if (MOUNTERS[s.kind]) handle = MOUNTERS[s.kind](host); }
      catch (e) { handle = null; } // apply() already null-guards every handle, so a missing layer is harmless
      return { kind: s.kind, host, handle };
    });
    // Honour prefers-reduced-motion continuously, not just at mount: apply() re-activates layers by
    // opacity on every scroll/resize/visibility change, so the freeze has to be re-checked each time
    // or a single scroll un-freezes it.
    const mql = (typeof matchMedia !== 'undefined') ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    const reduce = () => !!(mql && mql.matches);
    const apply = () => {
      const c = cfgRef.current; const n = layers.length;
      const sc = scrollContext();
      const inj = previewRef.current;
      const p = inj != null ? inj : (sc.max > 0 ? Math.min(Math.max(sc.top / sc.max, 0), 1) : 0);
      // Optional lead-in. Scene 0 otherwise paints from the very first pixel of scroll, which is why a
      // page whose opening must sit on nothing (the homepage Opening Statement, where Ben's brief says
      // nothing may compete) had to run background 'none' and give up its 3D entirely. A `lead`
      // transition fades scene 0 UP from zero, so a track can start on void and arrive later. Costs
      // nothing while hidden: setActive below pauses a scene's WebGL loop at opacity <= 0.01.
      let leadT = 1;
      if (c.lead) {
        const la = resolveTransitionAt(c.lead, sc);
        const lh = Math.max(c.lead.fade || 0.2, 1e-4) / 2;
        leadT = smoothstep(la - lh, la + lh, p);
      }
      const ats = (c.transitions || []).map((tr) => resolveTransitionAt(tr, sc));
      let prev = 0;
      const t = ats.map((at, i) => {
        const half = Math.max((c.transitions[i] && c.transitions[i].fade) || 0.2, 1e-4) / 2;
        let ti = smoothstep(at - half, at + half, p);
        ti = Math.max(ti, prev); prev = ti; // monotonic: a later transition can't un-fade an earlier one
        return ti;
      });
      layers.forEach((l, k) => {
        // ?? guards a malformed track (scenes without a matching transition) → never write opacity "NaN"
        const incoming = k > 0 ? (t[k - 1] ?? 1) : leadT;
        const outgoing = k < n - 1 ? 1 - (t[k] ?? 0) : 1;
        // CEIL. A scene is decoration behind reading matter, so a track can cap how strong it is ever
        // allowed to get. Without this the stone reached full strength directly behind body copy and
        // took it well under the 7:1 the brand's background contract asks for. Defaults to 1, so every
        // existing page renders exactly as before; only a track that opts in is dimmed.
        const ceil = typeof c.ceil === 'number' ? Math.min(Math.max(c.ceil, 0), 1) : 1;
        const op = incoming * outgoing * ceil;
        l.host.style.opacity = String(op);
        l.host.style.zIndex = String(k);
        const bandStart = k > 0 ? ats[k - 1] : 0;
        const bandEnd = k < n - 1 ? ats[k] : 1;
        const localClimb = Math.min(Math.max((p - bandStart) / Math.max(bandEnd - bandStart, 1e-4), 0), 1);
        if (l.handle && l.handle.setClimb) l.handle.setClimb(localClimb);
        // pause a fully faded-out scene's WebGL loop — single-scene pages stay opaque (op=1) so unaffected.
        // reduced-motion users never get an active loop (one static frame), whatever the opacity.
        if (l.handle && l.handle.setActive) l.handle.setActive(!reduce() && op > 0.01);
      });
    };
    applyRef.current = apply;
    // rAF-batch so layout reads/opacity writes run at most once per frame, not per scroll event
    let ticking = false;
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; apply(); }); } };
    // capture:true so this window-level listener also receives scroll from the Puck canvas (scroll
    // events don't bubble, but capturing listeners on ancestors still fire for descendant scrollers)
    addEventListener('scroll', onScroll, { passive: true, capture: true });
    addEventListener('resize', onScroll, { passive: true });
    // Pause every layer's WebGL loop when the tab is hidden (battery/CPU); re-apply on return.
    const onVis = () => { if (document.hidden) layers.forEach((l) => { if (l.handle && l.handle.setActive) l.handle.setActive(false); }); else apply(); };
    document.addEventListener('visibilitychange', onVis);
    apply(); // apply() now freezes the loops when reduced motion is on (the scrim makes a static frame indistinguishable)
    // re-apply if the user toggles reduced motion mid-session
    const onReduceChange = () => apply();
    if (mql && mql.addEventListener) mql.addEventListener('change', onReduceChange);
    return () => {
      if (mql && mql.removeEventListener) mql.removeEventListener('change', onReduceChange);
      document.removeEventListener('visibilitychange', onVis);
      removeEventListener('scroll', onScroll, { capture: true }); removeEventListener('resize', onScroll);
      applyRef.current = null;
      layers.forEach((l) => { if (l.handle && l.handle.destroy) l.handle.destroy(); if (l.host.parentNode) l.host.parentNode.removeChild(l.host); });
    };
  }, [kindsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // re-apply (cross-fade only, no WebGL remount) when transitions or the preview position change
  useEffect(() => { if (applyRef.current) applyRef.current(); }, [background, previewP]);

  if (!cfg.scenes.length) return null;
  return (
    <>
      <div className="gs-stage" ref={ref} aria-hidden="true" data-cursor="explore" />
      <div className="gs-scrim" aria-hidden="true" />
    </>
  );
}
