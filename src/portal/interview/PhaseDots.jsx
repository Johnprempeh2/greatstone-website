/**
 * PhaseDots: the five-dot conversation progress strip from the signed-off
 * mockup. Dots are deliberately unnumbered; the active phase glows lime,
 * completed phases dim to lime-mid, future phases stay neutral. Each dot
 * carries a hover tooltip, and an optional "Now: <phase>" label can sit
 * alongside.
 *
 * Port: source components/PhaseDots.tsx; the labels and dot states live in model.mjs (tested).
 */

import { PHASE_LABELS, PHASE_ORDER, phaseDots } from './model.mjs';

export { PHASE_LABELS, PHASE_ORDER };

export function PhaseDots({ phase, showLabel = false }) {
  const { label, ariaLabel, dots } = phaseDots(phase);

  return (
    <>
      <div className="phase-dots" aria-label={ariaLabel}>
        {dots.map((d) => (
          <span
            key={d.phase}
            className={`phase-dot${d.state ? ` ${d.state}` : ''}`}
            data-tip={d.tip}
            tabIndex={0}
          />
        ))}
      </div>
      {showLabel ? (
        <span className="phase-name">
          Now: <strong>{label}</strong>
        </span>
      ) : null}
    </>
  );
}
