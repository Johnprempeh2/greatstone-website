// The workflow as a diagram you can arrange.
//
// Cards are HTML so the text wraps and each one is a real link with a real focus ring; the edges
// are one SVG underneath, drawn between the cards' own coordinates rather than measured from the
// DOM, so there is no ResizeObserver and nothing to fall out of step.
//
// ⚠ POSITION IS LAYOUT, NEVER A CLAIM. Dragging a box to the left of another does not say it
// happens first. An arrow appears only where a handoff was actually recorded, which is the same
// rule the whole record runs on: the numbers imply an order to a reader, they never state one.
// Until somebody moves a card it is placed automatically, so an untouched diagram still reads as
// the chain the recorded handoffs describe.
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Icon } from './DeepDiveIcons.jsx';
import { itemHref } from '../lib/deepdive-route.mjs';
import { STATUS, stateOf } from './deepdive-state.mjs';

// A card is a FIXED box, because the SVG edges are drawn from these numbers rather than measured
// from the DOM. That makes the height a real constraint: at 118px a two-line process name squeezed
// the "who runs it" line to ZERO and the card still looked finished, so the diagram quietly stopped
// saying who owns half the workflow. 150 fits the worst case the CSS now allows (a two-line title
// and a two-line owner), and the CSS stops any child shrinking below its own content.
const W = 250, H = 150, GAP_X = 90, GAP_Y = 34, PAD = 20, GRID = 10;

// ⚠ THE TYPED LINE IS A DESCRIPTION, NOT A NAME. "Seven permanent staff under a field supervisor"
// says something the link to the field supervisor does not, so it stays beside the link. It is
// dropped only when it IS the name: the line leads with it and the rest is a note about them.
// This is InlinePeople.jsx's covered() rule, kept identical on purpose; "contains the name" was
// far too greedy there and deleted the client's own words from the page.
const bare = (t) => String(t).trim().toLowerCase().replace(/^(the|a|an|one|our)\s+/, '');
const covered = (text, name) => {
  const t = bare(text); const n = bare(name);
  if (!n || !t.startsWith(n)) return false;
  const rest = t.slice(n.length).trim();
  return rest === '' || /^[,;:.\u2013\u2014-]/.test(rest);
};

/** Where a card sits when nobody has moved it: columns by how far downstream the recorded handoffs
 *  put it, which is the layout the board used before it could be dragged. */
export function autoLayout(processes) {
  const byNum = new Map(processes.map((p) => [p.num, p]));
  const depth = new Map();
  const walk = (p, d, guard) => {
    if (guard.has(p.num) || (depth.get(p.num) ?? -1) >= d) return;
    depth.set(p.num, d); guard.add(p.num);
    for (const n of p.feeds || []) {
      const next = byNum.get(n);
      if (next && next.num !== p.num) walk(next, d + 1, guard);
    }
    guard.delete(p.num);
  };
  const fedInto = new Set(processes.flatMap((p) => (p.feeds || []).filter((n) => byNum.has(n))));
  processes.filter((p) => !fedInto.has(p.num)).forEach((p) => walk(p, 0, new Set()));
  processes.forEach((p) => { if (!depth.has(p.num)) walk(p, 0, new Set()); });

  const cols = [];
  processes.forEach((p) => { const d = depth.get(p.num) ?? 0; (cols[d] = cols[d] || []).push(p); });
  cols.forEach((c) => c && c.sort((a, b) => String(a.num).localeCompare(String(b.num))));
  const out = new Map();
  cols.forEach((col, x) => (col || []).forEach((p, y) => {
    out.set(p.num, { x: PAD + x * (W + GAP_X), y: PAD + y * (H + GAP_Y) });
  }));
  return out;
}

/** A cubic between two boxes, leaving the right edge and arriving at the left. */
function edgePath(a, b) {
  const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2;
  const mid = x1 + (x2 - x1) / 2;
  return `M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`;
}

export default function ProcessCanvas({
  processes, slug, staff, canAuthor, busy, map, onMove, onConnect, onTidy, onAddProcess,
  // A Map of id to person, the same one the offering board's cards use, so whoRunsId can resolve
  // to a name the card can link. Without it the card printed the id-only case as "not recorded".
  people,
}) {
  const auto = useMemo(() => autoLayout(processes), [processes]);
  // ⚠ ZOOM IS A VIEW, NOT A LAYOUT. It scales what is drawn and changes nothing about where a card
  // sits, so a diagram zoomed out and back is byte for byte the diagram it was. Dragging still
  // works because the pointer maths divides by the scale; without that the card would run away from
  // the cursor at anything other than 100%.
  const [zoom, setZoom] = useState(1);
  const viewport = useRef(null);
  // What is being dragged right now, so the card follows the pointer without a write per pixel.
  const [drag, setDrag] = useState(null);
  const [wiring, setWiring] = useState(false);
  const [from, setFrom] = useState(null);
  const board = useRef(null);

  const posOf = useCallback((p) => {
    if (drag && drag.num === p.num) return drag.at;
    if (p.x != null && p.y != null) return { x: p.x, y: p.y };
    return auto.get(p.num) || { x: PAD, y: PAD };
  }, [auto, drag]);

  const positions = new Map(processes.map((p) => [p.num, posOf(p)]));
  const width = Math.max(680, ...[...positions.values()].map((v) => v.x + W + PAD));
  const height = Math.max(260, ...[...positions.values()].map((v) => v.y + H + PAD));

  const nums = new Set(processes.map((p) => p.num));
  const edges = [];
  for (const p of processes) {
    for (const n of (p.feeds || [])) {
      if (!nums.has(n)) continue;
      edges.push({ key: `${p.num}-${n}`, d: edgePath(positions.get(p.num), positions.get(n)) });
    }
  }

  // ONE predicate for both the handler and the cursor, so the affordance cannot promise a drag the
  // handler will refuse. A reader used to get `cursor: grab` on a card that would never move.
  const canDrag = !wiring && !!staff && !!canAuthor?.can;

  const startDrag = (e, p) => {
    if (!canDrag) return;
    // Let a click through to the link; only a real move becomes a drag.
    if (e.target.closest('a, button')) return;
    e.preventDefault();
    const rect = board.current.getBoundingClientRect();
    const at = positions.get(p.num);
    // ⚠ /zoom on both. The rect is in SCREEN pixels and the card's position is in BOARD pixels; at
    // any scale but 1 they are different units and the card drifts from the cursor.
    setDrag({ num: p.num, at,
      grab: { x: (e.clientX - rect.left) / zoom - at.x, y: (e.clientY - rect.top) / zoom - at.y } });
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onDrag = (e) => {
    if (!drag) return;
    const rect = board.current.getBoundingClientRect();
    const raw = { x: (e.clientX - rect.left) / zoom - drag.grab.x, y: (e.clientY - rect.top) / zoom - drag.grab.y };
    const snap = (v) => Math.max(0, Math.round(v / GRID) * GRID);
    setDrag({ ...drag, at: { x: snap(raw.x), y: snap(raw.y) }, moved: true });
  };
  const endDrag = () => {
    if (!drag) return;
    // ONE write, on drop. A write per pixel would fill the change log with a drag.
    if (drag.moved && onMove) onMove(drag.num, drag.at);
    setDrag(null);
  };

  const pick = (p) => {
    if (!wiring) return;
    if (!from) { setFrom(p); return; }
    if (from.num === p.num) { setFrom(null); return; }
    Promise.resolve(onConnect && onConnect(from, p)).finally(() => { setFrom(null); setWiring(false); });
  };

  const placed = processes.filter((p) => p.x != null).length;
  // Worth offering a zoom only when the board is bigger than the space it has, or big enough that
  // somebody would want to pull back from it.
  const needsZoom = processes.length > 4 || width > 900;

  return (
    <div className="dd-canvas-wrap">
      <div className="dd-canvas-bar">
        {staff && onConnect && processes.length > 1 && (
          <button type="button" className={`gs-btn sm ${wiring ? 'primary' : 'ghost'}`}
            disabled={busy || !canAuthor?.can} aria-pressed={wiring}
            title={canAuthor?.can ? undefined : canAuthor?.why}
            onClick={() => { setWiring((v) => !v); setFrom(null); }}>
            {wiring ? 'Stop' : 'Record a handoff'}
          </button>
        )}
        {staff && placed > 0 && onTidy && (
          <button type="button" className="gs-btn ghost sm" disabled={busy || !canAuthor?.can}
            onClick={onTidy}>Tidy up</button>
        )}
        {staff && onAddProcess && (
          <button type="button" className="gs-btn ghost sm dd-canvas-add"
            disabled={busy || !canAuthor?.can}
            title={canAuthor?.can ? undefined : canAuthor?.why}
            onClick={() => onAddProcess()}>{Icon.add({ size: 14 })} Add a process</button>
        )}
        <span className="dd-canvas-sp" />
        {/* ⚠ THE ZOOM IS ONLY OFFERED WHEN IT DOES SOMETHING. On a board that already fits, a zoom
            control is a button that appears to do nothing, and a reader concludes the app is
            broken rather than that the diagram was small. */}
        {needsZoom && (
          <div className="dd-zoom" role="group" aria-label="Zoom">
            <button type="button" className="dd-zoom-b" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.15).toFixed(2)))}
              disabled={zoom <= 0.4} aria-label="Zoom out">&minus;</button>
            <button type="button" className="dd-zoom-n" onClick={() => setZoom(1)}
              aria-label={`Zoom, currently ${Math.round(zoom * 100)} per cent. Reset to fit.`}>
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" className="dd-zoom-b" onClick={() => setZoom((z) => Math.min(1.4, +(z + 0.15).toFixed(2)))}
              disabled={zoom >= 1.4} aria-label="Zoom in">+</button>
          </div>
        )}
        <span className="dd-canvas-hint">
          {wiring
            ? (from ? `Now click the box ${from.name} hands its work to.` : 'Click the box the work starts in, then the box it hands to.')
            : staff ? 'Drag a box to arrange it. Where it sits is layout: an arrow appears only where a handoff is recorded.'
            : 'An arrow appears only where a handoff is recorded.'}
        </span>
      </div>

      <div className="dd-canvas-vp" ref={viewport}>
      <div className="dd-canvas" ref={board}
        style={{ width, height, transform: zoom === 1 ? undefined : `scale(${zoom})` }}
        onPointerMove={onDrag} onPointerUp={endDrag} onPointerLeave={endDrag}>
        <svg className="dd-canvas-svg" width={width} height={height} aria-hidden="true">
          <defs>
            <marker id={`dd-c-arrow-${slug}`} viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill="var(--gs-teal)" />
            </marker>
          </defs>
          {edges.map((e) => (
            <path key={e.key} className="dd-canvas-edge" d={e.d} markerEnd={`url(#dd-c-arrow-${slug})`} />
          ))}
        </svg>

        {/* ⚠ IN WIRING MODE THE CARD IS THE CONTROL, and a div with an onClick is a control only a
            mouse can reach — recording a handoff was mouse-only. The same component on the offering
            board does this correctly with a real button; here the card takes the role and the
            keyboard behaviour a button would have.
            (This comment sits outside the tag on purpose: a `//` comment inside a JSX opening
            element is not valid JSX. esbuild accepted it, which is exactly the kind of leniency that
            makes a file build here and fail somewhere else.) */}
        {processes.map((p) => {
          const at = positions.get(p.num);
          const st = stateOf(map, p.id);
          const steps = (p.steps || []).length;
          const armed = from?.num === p.num;
          // ⚠ THE OWNER LINE READ whoRuns ALONE. A process linked to a person the encouraged way
          // (the picker, with no text typed) printed "Who runs it is not recorded" while
          // deepdive-org.mjs counted that same link as recorded: a false claim on the hub surface
          // and a missing way in. The id resolves to the person and the name links to their page.
          // Not in wiring mode: the card is the control there, and an anchor inside a control
          // is a second target the keyboard cannot tell apart from the first.
          const runner = p.whoRunsId ? people?.get(p.whoRunsId) : null;
          const said = String(p.whoRuns || '').trim();
          const saidToo = runner && covered(said, runner.name) ? '' : said;
          return (
            <div key={p.id}
              className={`dd-cnode dd-cst-${st.status}${armed ? ' is-armed' : ''}${drag?.num === p.num ? ' is-dragging' : ''}${wiring ? ' is-wiring' : ''}${canDrag ? ' is-draggable' : ''}`}
              style={{ left: at.x, top: at.y, width: W, minHeight: H }}
              onPointerDown={(e) => startDrag(e, p)}
              {...(wiring ? {
                role: 'button', tabIndex: 0, 'aria-pressed': armed,
                'aria-label': `${armed ? 'Cancel the handoff from' : from ? 'Hand work to' : 'Start a handoff from'} ${p.num} ${p.name}`,
                onKeyDown: (e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(p); }
                },
              } : {})}
              onClick={() => pick(p)}>
              <div className="dd-cnode-top">
                <span className="dd-cnode-n">{p.num}</span>
                {/* ⚠ THE STATUS WAS COLOUR ALONE, and aria-hidden on top of that — so it reached
                    neither somebody who cannot separate the hues nor anybody using a screen reader.
                    The dot stays; the word goes beside it. */}
                <span className={`dd-node-st dd-nst-${st.status}`} title={STATUS[st.status].label} aria-hidden="true" />
                <span className="gs-sr-only">{STATUS[st.status].label}</span>
              </div>
              <h3 className="dd-cnode-t">
                {wiring
                  ? p.name
                  : <a className="dd-cnode-a" href={itemHref(slug, 'process', p.id)}>{p.name}</a>}
              </h3>
              <p className="dd-cnode-w">
                {runner ? (
                  <>
                    {wiring
                      ? runner.name
                      : <a className="dd-either-a dd-cnode-p" href={itemHref(slug, 'person', runner.id)}>{runner.name}</a>}
                    {saidToo ? <> · {saidToo}</> : null}
                  </>
                ) : said ? said
                  // An id that resolves to nobody is still a link the record holds, so it is not
                  // "not recorded"; it points at a person the people list no longer has.
                  : p.whoRunsId ? 'Run by a person the record no longer holds'
                  : 'Who runs it is not recorded'}
              </p>
              <p className={`dd-cnode-s${steps ? ' has' : ''}`}>
                {steps ? `${steps} step${steps === 1 ? '' : 's'} inside` : 'Inside not mapped'}
              </p>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
