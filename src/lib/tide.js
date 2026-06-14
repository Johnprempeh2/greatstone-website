/* Greatstone tide-of-time — dependency-free Canvas2D. window.mountGreatstoneTide(container, opts). */
/* ============================================================================
   GREATSTONE — "The Tide of Time"
   ----------------------------------------------------------------------------
   Concentric emerald arcs emanating outward from a focal point (time, one
   direction, unbuyable), a lime "now" crest pulsing through, and the cursor as
   Greatstone — the current bends toward the pointer and ignites lime ("you
   can't buy time; we're the exception"). Optional live clock counts the time
   that has slipped past since the visitor arrived.

   Dependency-free, pure Canvas 2D. Verified maths lifted verbatim from the
   live build (time-waves.html + the pitch.html tide IIFE), refactored into a
   single `mountGreatstoneTide(container, opts)` factory that mirrors the
   ergonomics of `mountGreatstoneLogo`.

   Behaviour guarantees:
     • paints ONE synchronous frame on mount (visible before the rAF loop and
       in a backgrounded / reduced-motion tab — the "initial frame" trick);
     • pauses the draw loop while `document.hidden`;
     • honours `prefers-reduced-motion` (no rAF loop, no cursor warp, the field
       parked at a settled outward offset, the clock holds at 0);
     • measures the cursor RELATIVE TO ITS OWN CONTAINER, so multiple instances
       and embedded (non-fullscreen) layouts work;
     • returns `{ destroy() }` for SPA / teardown.

   Colour / type / copy are deferred to greatstone-brand & greatstone-voice.
   ========================================================================== */
(function (global) {
  'use strict';

  // Obsidian-Lime defaults. Override via opts.palette. RGB triplets.
  const DEFAULT_PALETTE = {
    deep:  [34, 84, 62],    // far / faint emerald (oldest time, near the focal point)
    emer:  [58, 140, 100],  // mid emerald (the body of the current)
    lime:  [200, 255, 0],   // the "now" crest + the cursor ignition
    well:  [200, 255, 0]    // the soft radial well that follows the cursor
  };

  const mix = (a, b, t) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
  const ss = (e0, e1, x) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };

  /**
   * Mount the tide into `container`.
   * @param {HTMLElement} container  host element (sized by you; can be fixed/full-viewport)
   * @param {Object} [opts]
   * @returns {{ destroy: Function }}
   */
  function mountGreatstoneTide(container, opts = {}) {
    const o = Object.assign({
      // --- geometry / motion -------------------------------------------------
      focalPoint:   { x: 0.03, y: 1.07 }, // fraction of W/H. Default: just off the lower-left.
      arcs:         48,                   // number of concentric waves (N)
      segments:     120,                  // samples per arc polyline (SEG); lower = cheaper
      sweep:        [-1.92, 0.5],         // angular sweep [A0, A1] in radians (canvas coords, y down)
      flowSpeed:    0.16,                 // outward emanation rate (× spacing / sec)
      spread:       1.2,                  // Rmax = hypot(W,H) * spread (how far arcs reach)
      // --- the "now" crest ---------------------------------------------------
      crest:        true,                 // the lime pulse(s) travelling outward
      crestSpeed:   0.12,                 // crest travel rate (fraction of Rmax / sec)
      crestWidth:   0.05,                 // crest half-width as a fraction of Rmax
      // --- cursor warp -------------------------------------------------------
      warpRadius:   0.27,                 // warp reach = min(W,H) * warpRadius
      warpStrength: 42,                   // px the current is pushed outward at the cursor
      well:         true,                 // soft lime radial well under the cursor
      // --- background-layer prominence --------------------------------------
      prominence:   1,                    // number 0..1, OR a () => number driven by scroll
      // --- the live elapsed clock -------------------------------------------
      clock:        false,                // true → create a clock element; or pass an HTMLElement
      clockFormat:  'tenths',             // 'tenths' (e.g. "12.4s") or 'mmss' (e.g. "1:02.4")
      // --- look --------------------------------------------------------------
      palette:      null,                 // override DEFAULT_PALETTE (partial merge)
      transparent:  true,                 // transparent canvas so it overlays any background
      dpr:          2,                    // pixel-ratio cap (perf)
      blend:        ''                    // optional canvas mix-blend-mode, e.g. 'screen' over a 3D scene
    }, opts);

    const PAL = Object.assign({}, DEFAULT_PALETTE, o.palette || {});
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = matchMedia('(hover:none),(pointer:coarse)').matches;

    // --- canvas ---------------------------------------------------------------
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;display:block;width:100%;height:100%;';
    if (o.blend) canvas.style.mixBlendMode = o.blend;
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d', { alpha: o.transparent });

    // --- optional clock element ----------------------------------------------
    let clockEl = null;
    if (o.clock instanceof HTMLElement) clockEl = o.clock;
    else if (o.clock === true) {
      clockEl = document.createElement('span');
      clockEl.className = 'gs-tide-clock';
      clockEl.style.cssText =
        'position:absolute;left:50%;bottom:24px;transform:translateX(-50%);' +
        'font-family:"JetBrains Mono",ui-monospace,SF Mono,Menlo,monospace;' +
        'font-size:13px;font-weight:600;letter-spacing:.04em;color:rgb(' +
        PAL.lime.join(',') + ');font-variant-numeric:tabular-nums;pointer-events:none;';
      container.appendChild(clockEl);
    }

    // --- geometry, recomputed on resize --------------------------------------
    let W, H, DPR, F, Rmax, SP;
    const N = o.arcs, SEG = o.segments, A0 = o.sweep[0], A1 = o.sweep[1];

    function resize() {
      DPR = Math.min(global.devicePixelRatio || 1, o.dpr);
      const rect = container.getBoundingClientRect();
      W = Math.max(1, rect.width);
      H = Math.max(1, rect.height);
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      F = { x: W * o.focalPoint.x, y: H * o.focalPoint.y };
      Rmax = Math.hypot(W, H) * o.spread;
      SP = Rmax / N;
      // keep the smoothed mouse in-bounds if the box shrank
      if (sm.x > W || sm.y > H) { sm.x = W * 0.6; sm.y = H * 0.5; }
    }

    // --- pointer (measured relative to the container) ------------------------
    const mouse = { x: 0, y: 0, active: false };
    const sm = { x: 0, y: 0 }; // exp-smoothed pointer ("Greatstone reaching into time")

    function onMove(e) {
      const rect = container.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.active = true;
    }
    function onLeave() { mouse.active = false; }

    // --- clock ----------------------------------------------------------------
    let t0 = null, lastClock = -1;
    function fmt(secs) {
      if (o.clockFormat === 'mmss') {
        const m = Math.floor(secs / 60), s = secs - m * 60;
        return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
      }
      return secs.toFixed(1) + 's';
    }

    // --- prominence (number or scroll-driven function) -----------------------
    function prominence() {
      const p = (typeof o.prominence === 'function') ? o.prominence() : o.prominence;
      return Math.min(1, Math.max(0, p));
    }

    // --- the draw --------------------------------------------------------------
    function draw(now) {
      if (t0 == null) t0 = now;
      const t = (now - t0) / 1000;

      // live "time slipping" clock (held at 0 under reduced-motion is fine; we
      // still tick it — it is the honest count of time elapsed, not an animation)
      if (clockEl) {
        const shown = Math.floor(t * 10);
        if (shown !== lastClock) { lastClock = shown; clockEl.textContent = fmt(t); }
      }

      sm.x += (mouse.x - sm.x) * 0.1;
      sm.y += (mouse.y - sm.y) * 0.1;

      const PROM = reduce ? 0.9 : prominence();

      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // waves emanate outward over time; under reduced-motion park at a settled offset
      const flow = reduce ? SP * 4 : t * SP * o.flowSpeed;
      const crestA = ((t * o.crestSpeed) % 1);
      const crestB = ((t * o.crestSpeed + 0.5) % 1);
      const warpR = Math.min(W, H) * o.warpRadius;
      const warpRq = warpR * warpR;
      const push = o.warpStrength;
      const cw = o.crestWidth;

      for (let i = 0; i < N; i++) {
        let r = (i * SP + flow) % Rmax;
        const fr = r / Rmax;
        const edge = Math.min(1, fr / 0.05) * Math.min(1, (1 - fr) / 0.2);
        if (edge <= 0.012) continue;

        let crestInf = 0;
        if (o.crest) {
          const dc = Math.min(Math.abs(fr - crestA), Math.abs(fr - crestB));
          crestInf = Math.max(0, 1 - dc / cw);
        }
        let bright = crestInf * 0.88;

        ctx.beginPath();
        for (let s = 0; s <= SEG; s++) {
          const a = A0 + (A1 - A0) * (s / SEG);
          let px = F.x + Math.cos(a) * r;
          let py = F.y + Math.sin(a) * r;
          if (mouse.active && !reduce) {
            const dx = px - sm.x, dy = py - sm.y, dq = dx * dx + dy * dy;
            if (dq < warpRq) {
              const inf = Math.exp(-dq / (warpRq * 0.42));
              const ux = px - F.x, uy = py - F.y, ul = Math.hypot(ux, uy) || 1;
              px += (ux / ul) * inf * push;
              py += (uy / ul) * inf * push;
              if (inf > bright) bright = inf;
            }
          }
          s === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }

        const base = mix(PAL.deep, PAL.emer, 0.35 + 0.65 * fr);
        const col = mix(base, PAL.lime, Math.min(1, bright));
        const alpha = edge * (0.15 + 0.6 * bright + 0.09 * (1 - fr)) * PROM;
        ctx.strokeStyle = 'rgba(' + (col[0] | 0) + ',' + (col[1] | 0) + ',' + (col[2] | 0) + ',' + alpha.toFixed(3) + ')';
        ctx.lineWidth = 0.85 + bright * 1.9;
        if (bright > 0.22 && PROM > 0.4) {
          ctx.shadowColor = 'rgba(' + PAL.lime[0] + ',' + PAL.lime[1] + ',' + PAL.lime[2] + ',' + (bright * 0.62 * PROM).toFixed(2) + ')';
          ctx.shadowBlur = 14 * bright;
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      // the soft lime well that follows the cursor
      if (o.well && mouse.active && !reduce && PROM > 0.25) {
        const g = ctx.createRadialGradient(sm.x, sm.y, 0, sm.x, sm.y, warpR);
        g.addColorStop(0, 'rgba(' + PAL.well.join(',') + ',' + (0.10 * PROM).toFixed(3) + ')');
        g.addColorStop(0.5, 'rgba(' + PAL.well.join(',') + ',' + (0.03 * PROM).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(' + PAL.well.join(',') + ',0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
    }

    // --- loop / lifecycle ------------------------------------------------------
    let raf = 0;
    function loop(now) {
      if (!document.hidden) draw(now);
      if (!reduce) raf = requestAnimationFrame(loop);
    }

    // init pointer to a sensible resting place, size, then paint ONE frame
    // synchronously so the field shows before the rAF loop (and in a paused /
    // reduced-motion tab) — the "initial synchronous frame" trick.
    resize();
    mouse.x = sm.x = W * 0.6;
    mouse.y = sm.y = H * 0.5;

    const onResize = () => resize();
    global.addEventListener('resize', onResize, { passive: true });
    if (!coarse) {
      global.addEventListener('pointermove', onMove, { passive: true });
      global.addEventListener('pointerleave', onLeave, { passive: true });
    }

    draw(typeof performance !== 'undefined' ? performance.now() : 0);
    if (!reduce) raf = requestAnimationFrame(loop);

    return {
      destroy() {
        if (raf) cancelAnimationFrame(raf);
        global.removeEventListener('resize', onResize);
        global.removeEventListener('pointermove', onMove);
        global.removeEventListener('pointerleave', onLeave);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        if (clockEl && o.clock === true && clockEl.parentNode) clockEl.parentNode.removeChild(clockEl);
      }
    };
  }

  global.mountGreatstoneTide = mountGreatstoneTide;
  if (typeof module !== 'undefined' && module.exports) module.exports = { mountGreatstoneTide };
})(typeof window !== 'undefined' ? window : globalThis);

// --- demo boot (remove when copying the factory into your own page) ----------
if (typeof document !== 'undefined' && document.getElementById('tide-host')) {
  mountGreatstoneTide(document.getElementById('tide-host'), { clock: true });
}
