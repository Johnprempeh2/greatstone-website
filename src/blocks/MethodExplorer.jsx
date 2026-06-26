import { useEffect, useRef, useState, useCallback } from 'react';
import { Arrow } from './icons.jsx';
import { safeHref } from '../lib/safe-url.js';

// The full-screen "interactive breakdown" — the live homepage's #/method methodology explorer brought
// into the studio. Eight emerald pillar-gems in a ring around a central EXPLORE orb; hover to feel one,
// click to look inside; a slide-in detail panel with what-we-assess + Prev/Next + back. Reached from the
// method Hero's "Open the interactive breakdown" CTA (#breakdown). three.js loads only when this mounts.
// Content (the eight pillars, incl. each one's optional link) comes from the editable Pillar-cards block,
// so marketing edits the cards and the breakdown follows.
const LOGO = '/assets/greatstone-logo-web.png';
const pad2 = (n) => String(n).padStart(2, '0');

export default function MethodExplorer({ pillars = [], onClose }) {
  const items = pillars.slice(0, 8);
  const hostRef = useRef(null);
  const stageRef = useRef(null);
  const handleRef = useRef(null);
  const rootRef = useRef(null);
  const [selected, setSelected] = useState(-1); // -1 = ring view; >=0 = a pillar's detail is open
  const [hover, setHover] = useState(-1);        // pillar under the cursor (-1 = none) — drives the floating name
  const [cursor, setCursor] = useState(null);    // {x,y} for the floating name label
  const open = selected >= 0;
  const active = open ? items[selected] : null;
  const hoverName = hover >= 0 && hover < items.length && !open ? (items[hover].name || '') : '';

  // mount the 3D ring (dynamic import keeps three.js off the critical path); onSelect opens the detail
  useEffect(() => {
    const host = hostRef.current; if (!host) return undefined;
    let handle; let alive = true;
    import('../lib/pillar-explorer.mjs').then(({ mountPillarExplorer }) => {
      if (!alive || !hostRef.current) return;
      try {
        handle = mountPillarExplorer(host, {
          envUrl: import.meta.env.BASE_URL + 'env-emerald.jpg',
          layout: 'ring', initial: -1, count: items.length, // build exactly as many gems as there are pillars
          onSelect: (i) => { if (i < items.length) setSelected(i); },
          onHover: (i) => setHover(i < items.length ? i : -1),
        });
        handleRef.current = handle;
      } catch (e) { /* no WebGL → the pillar list below still drives the detail panel */ }
    }).catch(() => {});
    return () => { alive = false; if (handle && handle.destroy) handle.destroy(); };
  }, []);

  // keep the 3D focus in sync with the selection however it changed — clicking a gem, a pill, or Prev/Next
  useEffect(() => { if (handleRef.current) handleRef.current.setSelected(selected); }, [selected]);
  const choose = useCallback((i) => setSelected(i), []);
  const close = useCallback(() => setSelected(-1), []);
  const step = useCallback((d) => { if (!items.length) return; const n = (selected + d + items.length) % items.length; choose(n); }, [selected, items.length, choose]);

  // a11y: it's a full-screen modal surface — move focus in on open, restore to the opener on close
  useEffect(() => {
    const opener = document.activeElement;
    const t = setTimeout(() => { const el = rootRef.current && rootRef.current.querySelector('.me-back'); if (el) el.focus(); }, 40);
    return () => { clearTimeout(t); if (opener && opener.focus) try { opener.focus(); } catch { /* opener gone */ } };
  }, []);

  // keep focus sane as the detail panel opens/closes. Opening (ring→detail): move focus onto the panel
  // heading so keyboard + screen-reader users land on the new pillar (the heading is a polite live region,
  // so arrow-key paging between pillars is announced too). Closing (detail→ring) unmounts the control that
  // held focus, which would drop focus to <body> and let the next Tab escape the modal, so re-home it on the
  // pill of the pillar just closed (still mounted in ring view), else the Back button.
  const prevSelRef = useRef(selected);
  useEffect(() => {
    const root = rootRef.current; if (!root) return;
    if (prevSelRef.current < 0 && selected >= 0) {
      const h = root.querySelector('.me-detail.is-open .me-detail-name');
      if (h) h.focus();
    } else if (prevSelRef.current >= 0 && selected < 0) {
      const pills = root.querySelectorAll('.me-pick');
      const target = pills[prevSelRef.current] || root.querySelector('.me-back');
      if (target) target.focus();
    }
    prevSelRef.current = selected;
  }, [selected]);

  // keyboard: Escape closes the detail then the explorer; arrows page through pillars when open; Tab is trapped
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); if (open) close(); else onClose && onClose(); }
      else if (open && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) { e.preventDefault(); step(1); }
      else if (open && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) { e.preventDefault(); step(-1); }
      else if (e.key === 'Tab') {
        const root = rootRef.current; if (!root) return;
        // when a pillar detail is open, trap focus WITHIN the panel — the ring controls behind it
        // (the Back button and the eight pillar pills) stay in the DOM and visible, so without this
        // scope Tab would cycle through controls hidden behind the open panel.
        const scope = (open && root.querySelector('.me-detail.is-open')) || root;
        const f = [...scope.querySelectorAll('button, a[href], select, input, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled && el.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open, close, step, onClose]);

  return (
    <div className={'me' + (open ? ' is-open' : '')} ref={rootRef} role="dialog" aria-modal="true" aria-label="The eight pillars, interactive breakdown">
      <style>{CSS}</style>
      <div className="me-top">
        <img className="me-logo" src={LOGO} alt="Greatstone International" width="800" height="160" decoding="async" />
        <div className="me-top-actions">
          {/* book from inside the explorer — the global #book handler opens the Calendly popup over it,
              so a visitor at peak interest never has to leave to convert (the popup overlays the explorer). */}
          <a className="me-book" href="#book" onClick={onClose}>Book a Diagnostic</a>
          <button className="me-back" onClick={onClose}><span>← Back</span></button>
        </div>
      </div>

      <header className="me-head">
        <div className="me-kicker">The Digital Transformation Playbook</div>
        <h2 className="me-title">Eight pillars. <span className="accent">No stone unturned.</span></h2>
        <p className="me-sub">We break your business into eight facets. Hover to feel each one, click to look inside.</p>
      </header>

      <div className="me-stage" ref={stageRef}
        onPointerMove={(e) => { const r = stageRef.current.getBoundingClientRect(); setCursor({ x: e.clientX - r.left, y: e.clientY - r.top }); }}
        onPointerLeave={() => setCursor(null)}>
        <div className="me-canvas" ref={hostRef} aria-hidden="true" />
        <div className={'me-orb' + (hover >= 0 ? ' is-dim' : '')} aria-hidden="true"><span>EXPLORE</span></div>
        {/* the hovered pillar's name follows the cursor, like the live site */}
        {hoverName && cursor ? (
          <div className="me-hovername" style={{ left: cursor.x, top: cursor.y }} aria-hidden="true">{hoverName}</div>
        ) : null}
        {/* keyboard + touch path (no hover on touch): pick any pillar by name */}
        <div className="me-picks" role="group" aria-label="Pillars">
          {items.map((p, i) => (
            <button key={i} type="button" aria-pressed={i === selected}
              className={'me-pick' + (i === selected ? ' is-active' : '') + (i === hover ? ' is-hover' : '')}
              onClick={() => choose(i)} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(-1)}>
              {p.name || ('Pillar ' + (i + 1))}
            </button>
          ))}
        </div>
      </div>

      <aside className={'me-detail' + (open ? ' is-open' : '')} aria-hidden={open ? 'false' : 'true'}>
        {active ? (
          <>
            <button className="me-detail-close" onClick={close}><span>← All pillars</span></button>
            <div className="me-detail-index">{active.n || ('P·' + pad2(selected + 1))} / {pad2(items.length)}</div>
            <div className="me-detail-label">The Methodology · No stone unturned</div>
            <h3 className="me-detail-name" tabIndex={-1} aria-live="polite">{active.name}</h3>
            {active.tag ? <div className="me-detail-tag">{active.tag}</div> : null}
            {active.def ? <p className="me-detail-def">{active.def}</p> : null}
            {Array.isArray(active.chips) && active.chips.length ? (
              <div className="me-assess">
                <div className="me-assess-h">What we assess</div>
                <ul>{active.chips.map((c, j) => <li key={j}>{c.text || c}</li>)}</ul>
              </div>
            ) : null}
            {/* peak-interest conversion: a guaranteed booking CTA in the open pillar panel (the detail
                panel covers the screen on mobile, so the top-bar CTA alone would be hidden here). The
                optional per-pillar link stays as a secondary, hidden when it would just duplicate #book. */}
            <div className="me-detail-actions">
              <a className="me-detail-book" href="#book" onClick={onClose}>Book a Diagnostic<Arrow /></a>
              {active.href && active.href !== '#' && active.href !== '#book' ? (
                <a className="me-detail-cta" href={safeHref(active.href)} onClick={onClose}>Inspect this pillar<Arrow /></a>
              ) : null}
            </div>
            <nav className="me-pager">
              <button onClick={() => step(-1)} aria-label="Previous pillar"><span>← Prev</span></button>
              <button onClick={() => step(1)} aria-label="Next pillar"><span>Next →</span></button>
            </nav>
          </>
        ) : null}
      </aside>
    </div>
  );
}

const CSS = `
.me{position:fixed;inset:0;z-index:4000;overflow:hidden;
  background:radial-gradient(1200px 800px at 50% 18%,rgba(20,60,42,.55),transparent 62%),
  radial-gradient(900px 700px at 50% 120%,rgba(14,49,34,.5),transparent 60%),#06100b;
  display:flex;flex-direction:column;color:var(--gs-text,#f5f5f5);animation:meIn .4s var(--gs-ease,ease)}
@keyframes meIn{from{opacity:0}to{opacity:1}}
.me-top{display:flex;align-items:center;justify-content:space-between;padding:clamp(16px,2.4vw,26px) clamp(18px,4vw,44px);position:relative;z-index:3}
.me-logo{height:24px;width:auto;display:block}
.me-back{background:rgba(255,255,255,.05);border:1px solid var(--gs-border-soft,rgba(255,255,255,.14));border-radius:100px;
  padding:9px 18px;color:var(--gs-text,#f5f5f5);font:700 .78rem/1 Montserrat,sans-serif;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;transition:border-color .25s,background .25s}
.me-back:hover{border-color:var(--gs-border,rgba(200,255,0,.3));background:rgba(200,255,0,.06)}
.me-head{text-align:center;padding:clamp(6px,1.5vw,16px) 24px 0;position:relative;z-index:2;transition:opacity .4s var(--gs-ease,ease),transform .4s var(--gs-ease,ease)}
.me.is-open .me-head{opacity:0;transform:translateY(-12px);pointer-events:none}
.me-kicker{font-size:.72rem;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:var(--gs-accent,#c8ff00)}
.me-title{font-size:clamp(1.7rem,4.4vw,3rem);font-weight:900;letter-spacing:-.02em;margin-top:.3em}
.me-title .accent{color:var(--gs-accent,#c8ff00)}
.me-sub{margin:14px auto 0;max-width:60ch;color:var(--gs-text-muted,#b0b0b0);font-size:clamp(.95rem,1.4vw,1.1rem);line-height:1.6}
.me-stage{position:relative;flex:1;min-height:0}
.me-canvas{position:absolute;inset:0}
.me-canvas canvas{width:100%;height:100%;display:block}
.me-orb{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:118px;height:118px;border-radius:50%;
  border:1px solid var(--gs-accent-mid,rgba(200,255,0,.4));display:grid;place-items:center;pointer-events:none;
  box-shadow:0 0 60px -10px rgba(200,255,0,.35);animation:meOrb 3.2s ease-in-out infinite}
@keyframes meOrb{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) scale(1.06)}}
.me-orb span{background:var(--gs-accent,#c8ff00);color:#0e1611;font:800 .68rem/1 Montserrat,sans-serif;letter-spacing:.14em;border-radius:100px;padding:8px 14px}
.me.is-open .me-orb{opacity:0;transition:opacity .3s}
.me-picks{position:absolute;left:0;right:0;bottom:clamp(14px,3vh,28px);display:flex;flex-wrap:wrap;gap:7px;justify-content:center;padding:0 18px;z-index:2}
.me-pick{background:rgba(255,255,255,.04);border:1px solid var(--gs-border-soft,rgba(255,255,255,.12));border-radius:100px;
  padding:7px 14px;color:var(--gs-text-muted,#b0b0b0);font:700 .76rem/1 Montserrat,sans-serif;cursor:pointer;transition:color .2s,border-color .2s,background .2s}
.me-pick:hover{color:var(--gs-text,#fff);border-color:var(--gs-border,rgba(200,255,0,.3))}
.me-pick.is-active{color:#0e1611;background:var(--gs-accent,#c8ff00);border-color:var(--gs-accent,#c8ff00)}
.me-pick.is-hover{color:var(--gs-text,#fff);border-color:var(--gs-accent-mid,rgba(200,255,0,.4))}
/* the pick pills are the only touch interaction on #breakdown — give them a 44px tap height on
   coarse-pointer devices (WCAG 2.5.8). Wrapping rows already absorb the extra height. */
@media (pointer:coarse){.me-pick{min-height:44px;padding-top:0;padding-bottom:0;display:inline-flex;align-items:center}.me-back,.me-book,.me-detail-book,.me-detail-close,.me-pager button{min-height:44px;display:inline-flex;align-items:center}}
.me-orb.is-dim{opacity:.35;transition:opacity .3s}
/* the hovered pillar's name, following the cursor */
.me-hovername{position:absolute;z-index:6;transform:translate(16px,-50%);pointer-events:none;white-space:nowrap;
  font:900 .9rem/1 Montserrat,sans-serif;letter-spacing:.01em;color:var(--gs-accent,#c8ff00);
  text-shadow:0 2px 18px rgba(0,0,0,.7);animation:meTag .18s var(--gs-ease,ease)}
@keyframes meTag{from{opacity:0;transform:translate(8px,-50%)}to{opacity:1;transform:translate(16px,-50%)}}
.me-detail{position:absolute;top:0;right:0;bottom:0;width:min(440px,92vw);z-index:5;
  background:linear-gradient(200deg,rgba(16,32,24,.96),rgba(8,18,12,.98));border-left:1px solid var(--gs-border,rgba(200,255,0,.18));
  backdrop-filter:blur(10px);box-shadow:-40px 0 90px -40px rgba(0,0,0,.8);padding:clamp(24px,3vw,40px);overflow-y:auto;
  transform:translateX(100%);transition:transform .45s var(--gs-ease,ease);display:flex;flex-direction:column;gap:6px}
.me-detail.is-open{transform:translateX(0)}
.me-detail-close{align-self:flex-start;background:none;border:0;color:var(--gs-text-faint,#8d938c);font:700 .78rem/1 Montserrat,sans-serif;cursor:pointer;padding:4px 0;margin-bottom:14px}
.me-detail-close:hover{color:var(--gs-accent,#c8ff00)}
.me-detail-index{font-size:.72rem;font-weight:900;letter-spacing:.14em;color:var(--gs-accent,#c8ff00);font-variant-numeric:tabular-nums}
.me-detail-label{font-size:.64rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--gs-text-faint,#8d938c);margin-top:10px}
.me-detail-name{font-size:clamp(1.7rem,3vw,2.3rem);font-weight:900;letter-spacing:-.02em;margin-top:6px}
.me-detail-tag{font-size:1rem;font-weight:700;color:var(--gs-text,#f5f5f5);margin-top:4px}
.me-detail-def{margin-top:14px;color:var(--gs-text-muted,#b0b0b0);font-size:.96rem;line-height:1.65}
.me-assess{margin-top:22px}
.me-assess-h{font-size:.66rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--gs-text-faint,#8d938c)}
.me-assess ul{list-style:none;display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}
.me-assess li{font-size:.74rem;color:var(--gs-text-muted,#b0b0b0);border:1px solid var(--gs-border-soft,rgba(255,255,255,.14));border-radius:100px;padding:5px 12px}
.me-detail-cta{margin-top:22px;display:inline-flex;align-items:center;gap:7px;font-size:.84rem;font-weight:800;color:var(--gs-accent,#c8ff00);text-decoration:none}
.me-detail-cta svg{transition:transform .25s var(--gs-ease,ease)}
.me-detail-cta:hover svg{transform:translateX(4px)}
/* in-explorer booking CTAs (peak-interest conversion) */
.me-top-actions{display:flex;align-items:center;gap:10px}
.me-book{background:var(--gs-accent,#c8ff00);color:#0e1611;border:1px solid var(--gs-accent,#c8ff00);border-radius:100px;
  font-family:inherit;font-weight:800;font-size:.8rem;padding:9px 16px;cursor:pointer;white-space:nowrap;text-decoration:none;
  transition:transform .2s var(--gs-ease,ease),box-shadow .2s var(--gs-ease,ease)}
.me-book:hover{transform:translateY(-1px);box-shadow:0 8px 24px -8px rgba(200,255,0,.5)}
/* narrow screens: the wide top-bar Book CTA would crowd the logo + push Back off-screen. Hide it there;
   the detail panel's Book CTA (always shown when a pillar is open) covers peak-interest conversion on mobile. */
@media (max-width:600px){.me-book{display:none}}
.me-detail-actions{margin-top:22px;display:flex;flex-direction:column;gap:12px;align-items:flex-start}
.me-detail-actions .me-detail-cta{margin-top:0}
.me-detail-book{display:inline-flex;align-items:center;gap:7px;background:var(--gs-accent,#c8ff00);color:#0e1611;border-radius:100px;
  font-weight:800;font-size:.84rem;padding:11px 18px;text-decoration:none;transition:transform .2s var(--gs-ease,ease)}
.me-detail-book:hover{transform:translateY(-1px)}
.me-detail-book svg{transition:transform .25s var(--gs-ease,ease)}
.me-detail-book:hover svg{transform:translateX(4px)}
.me-pager{margin-top:auto;padding-top:24px;display:flex;gap:10px}
.me-pager button{flex:1;background:rgba(255,255,255,.04);border:1px solid var(--gs-border-soft,rgba(255,255,255,.14));border-radius:100px;
  padding:11px;color:var(--gs-text,#f5f5f5);font:700 .8rem/1 Montserrat,sans-serif;cursor:pointer;transition:border-color .2s,background .2s}
.me-pager button:hover{border-color:var(--gs-border,rgba(200,255,0,.3));background:rgba(200,255,0,.06)}
.me :focus-visible{outline:2px solid var(--gs-accent,#c8ff00);outline-offset:2px;border-radius:8px}
.me-detail-name:focus{outline:none}/* programmatic focus target on open; keyboard users never Tab to it */
@media (max-width:760px){
  .me-detail{width:100%;top:auto;bottom:0;height:78vh;border-left:0;border-top:1px solid var(--gs-border,rgba(200,255,0,.18));transform:translateY(100%)}
  .me-detail.is-open{transform:translateY(0)}
  .me-orb{width:92px;height:92px}
}
@media (prefers-reduced-motion: reduce){
  .me,.me-orb,.me-detail,.me-head,.me-hovername{animation:none !important;transition:none !important}
}
`;
