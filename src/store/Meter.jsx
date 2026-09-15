// A thin stacked bar showing what a number is made of.
//
// ⚠ IT ONLY EVER SHOWS COMPOSITION, NEVER A SEQUENCE OR A TREND. Segments are counts of things the
// record actually holds, laid out left to right in a fixed order that means nothing: read as a
// timeline it would assert a progression nobody recorded. The portal has been careful about this
// everywhere else (the workflow board refuses to draw arrows it cannot evidence) and a chart in a
// dashboard tile is not exempt just because it is small.
//
// ⚠ AND IT REFUSES TO DRAW NOTHING. A meter with no data renders as an empty track with a word,
// not as a full bar of the first colour or a bar of zero width that reads as "complete".
import React from 'react';

/**
 * @param parts [{ n, tone, label }] — tone is one of the dd-m-* classes below
 * @param empty what to say when every count is zero
 */
export default function Meter({ parts = [], empty = 'Nothing recorded yet', className = '' }) {
  const rows = parts.filter((p) => p.n > 0);
  const total = rows.reduce((a, p) => a + p.n, 0);
  if (!total) return <p className={`dd-m-none ${className}`}>{empty}</p>;
  return (
    <div className={`dd-m ${className}`}>
      {/* aria-hidden because the same counts are already in the text beside it: a screen reader
          hearing them twice learns nothing the second time. */}
      <div className="dd-m-track" aria-hidden="true">
        {rows.map((p) => (
          <span key={p.label} className={`dd-m-seg dd-m-${p.tone}`}
            style={{ width: `${(p.n / total) * 100}%` }} title={`${p.label}: ${p.n}`} />
        ))}
      </div>
      <p className="dd-m-key">
        {rows.map((p, i) => (
          <span key={p.label} className="dd-m-k">
            <i className={`dd-m-dot dd-m-${p.tone}`} aria-hidden="true" />
            <b>{p.n}</b> {p.label}{i < rows.length - 1 ? <span aria-hidden="true"> · </span> : null}
          </span>
        ))}
      </p>
    </div>
  );
}
