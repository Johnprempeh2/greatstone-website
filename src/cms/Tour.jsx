import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { useModal } from '../store/useModal.mjs';
import { TOURS, filterSteps, clampIndex, nextIndex, prevIndex, isLast, progressLabel, placeCard } from '../lib/tour-model.mjs';

// The guided-tour overlay: one dimmed spotlight cut-out over the current step's target element + a branded
// dialog card with Skip / Back / Next. Rendered in App's `overlays` fragment only while a tour is active. Steps
// are role-filtered (caps); a step whose target element never appears (role-gated rail item, or Puck DOM not
// mounted yet) is auto-skipped, never spotlighting empty space. This is a NON-interactive walkthrough: the user
// reads a step and presses Next/Back/Skip; the spotlight is pointer-events:none only so a mouse user can still
// click around underneath. The card reuses useModal for the focus trap + Escape + focus-restore (WCAG 2.4.3 /
// 2.1.2); aria-modal is correct because the walkthrough owns the interaction. The card content sits in an
// aria-live region so a screen reader announces each step as Next/Back changes it (the node itself is reused).
// Reduced-motion is handled in the CSS (the spotlight snaps instead of animating).
const CARD_W = 340;

// resolve a step's element: prefer the data-tour token (markup we own), fall back to a raw CSS selector for a
// surface we do not own (e.g. the Puck canvas). Returns null when neither is present yet.
function resolveEl(step) {
  if (!step) return null;
  if (step.target) { const el = document.querySelector('[data-tour="' + step.target + '"]'); if (el) return el; }
  if (step.selector) { try { return document.querySelector(step.selector); } catch { return null; } }
  return null;
}

export default function Tour({ tourId, caps, onNavigate, onClose, onAbort }) {
  const tour = TOURS[tourId];
  const steps = tour ? filterSteps(tour.steps, caps || {}) : [];
  const total = steps.length;
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const [card, setCard] = useState(null);
  const cardRef = useRef(null);
  const shownRef = useRef(false); // has ANY step been shown yet? distinguishes "surface still mounting" from "mid-tour skip"
  const titleId = useId();        // unique per instance, so a transient double-mount can't share aria-labelledby
  const idx = clampIndex(i, total);
  const step = steps[idx];

  // the resolve effect below deliberately re-runs only on [idx, tourId], but it reads `total` and the host
  // callbacks — which can change identity mid-tour (email resolving flips tour.close/abort; caps recompute).
  // Read them from a ref updated every render so the running rAF loop always uses the latest, never a stale
  // closure that would mis-terminate or key seen-state under the wrong identity.
  const liveRef = useRef();
  liveRef.current = { total, onNavigate, onClose, onAbort };

  const measure = useCallback((el) => {
    shownRef.current = true;
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom });
    const ch = cardRef.current ? cardRef.current.offsetHeight : 180;
    setCard(placeCard({ top: r.top, bottom: r.bottom, left: r.left, width: r.width },
      { width: CARD_W, height: ch }, { width: window.innerWidth, height: window.innerHeight }));
  }, []);

  // resolve the current step: navigate if it names a route, then find the target. A lazy surface (the catalogue
  // chunk + its auth gate) can take a second or two to mount, so on the FIRST step we wait patiently rather than
  // race ahead and skip the whole tour. If the surface never appears and we have shown nothing, we ABORT without
  // marking seen (so it re-offers next visit); a missing MID-tour target is just skipped; a missing LAST target
  // after we have shown steps completes the tour.
  useEffect(() => {
    if (!step) return;
    let cancelled = false, rafId = 0, toId = 0, tries = 0;
    const FAST = 40; // ~0.7s of rAF retries for a normally-present target
    setRect(null); // drop the previous step's spotlight immediately, so it never lingers on the wrong element
    const nav = liveRef.current.onNavigate;
    if (step.route && nav) nav(step.route.section, step.route.slug);
    const giveUp = () => {
      const { total: t, onClose: close, onAbort: abort } = liveRef.current;
      if (!shownRef.current && idx === 0) { (abort || close) && (abort || close)(); return; } // surface never mounted
      if (idx >= t - 1) { close && close(); return; }                                         // end reached, tour shown
      setI((n) => nextIndex(n, t));                                                            // skip a missing mid step
    };
    const find = () => {
      if (cancelled) return;
      const el = resolveEl(step);
      // require a laid-out element: a 0x0 rect means it is mid-navigation / not yet sized, so keep waiting rather
      // than spotlight a collapsed box in the corner (seen when a route step lands before the rail has settled).
      const r = el && el.getBoundingClientRect();
      if (r && r.width > 0 && r.height > 0) {
        try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch { /* ignore */ } measure(el); return;
      }
      if (tries++ < FAST) { rafId = requestAnimationFrame(find); return; }
      // slow path: the very first step on a still-mounting surface keeps polling a while before giving up (~6s)
      if (!shownRef.current && idx === 0 && tries < FAST + 40) { toId = setTimeout(find, 150); return; }
      giveUp();
    };
    rafId = requestAnimationFrame(find);
    return () => { cancelled = true; cancelAnimationFrame(rafId); clearTimeout(toId); };
  }, [idx, tourId]); // eslint-disable-line react-hooks/exhaustive-deps

  // keep the spotlight + card glued to the target through scroll/resize (rAF-throttled)
  useEffect(() => {
    if (!step) return;
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const el = resolveEl(step); if (el) measure(el); }); };
    window.addEventListener('scroll', on, true);
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on, true); window.removeEventListener('resize', on); cancelAnimationFrame(raf); };
  }, [idx, step, measure]);

  useModal(cardRef, !!step, onClose);

  // a guide whose every step is role-gated out of THIS user's view (e.g. a signed-in viewer landing on Releases,
  // where all quality steps require edit) has total 0 and nothing to show: clear the active slot rather than
  // leave an invisible tour wedged there. Abort (no seen mark) so it re-offers if the user later gains the role.
  useEffect(() => {
    if (tour && total === 0) { const { onAbort: abort, onClose: close } = liveRef.current; (abort || close) && (abort || close)(); }
  }, [tour, total]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!step || !tour) return null;
  const last = isLast(idx, total);
  const go = (fn) => () => setI((n) => fn(n, total));

  return (
    <div className="gs-tour" role="presentation">
      {/* only dim once the target is measured, so we never darken a blank screen while a lazy surface mounts */}
      {rect ? (
        <div className="gs-tour-spot" style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }} />
      ) : null}
      {card ? (
        <div ref={cardRef} className={'gs-tour-card is-' + card.placement} role="dialog" aria-modal="true" aria-labelledby={titleId}
          style={{ top: card.top, left: card.left, '--arrow': card.arrowOffset + 'px' }}>
          <div aria-live="polite">
            <span className="gs-tour-prog">{tour.title} · {progressLabel(idx, total)}</span>
            <h2 id={titleId} className="gs-tour-t">{step.title}</h2>
            <p className="gs-tour-b">{step.body}</p>
          </div>
          <div className="gs-tour-acts">
            <button type="button" className="gs-tour-skip" onClick={onClose}>Skip tour</button>
            <span className="gs-tour-nav">
              {idx > 0 ? <button type="button" className="gs-btn ghost sm" onClick={go(prevIndex)}>Back</button> : null}
              <button type="button" className="gs-btn primary sm" onClick={() => (last ? onClose && onClose() : setI((n) => nextIndex(n, total)))}>{last ? 'Finish' : 'Next'}</button>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
