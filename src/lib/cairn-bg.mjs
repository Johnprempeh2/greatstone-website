/* ============================================================================
   Greatstone — Cairn background (phyllotaxis spiral).
   Ported from the Animation Lab "No. 008 CAIRN": ~1600 seeds placed on the
   golden-angle spiral, the foundation stacked outward point by point. Adapted
   here as a transparent, scroll-reactive page background:

     mountCairn(container, opts) -> { setClimb(0..1), setActive(b), resize(), destroy() }

   The `climb` value drives the GROWTH — as you scroll the spiral builds outward
   (more rings appear, the cairn stacks up). A travelling lime "now" ring rides
   the rings, the field breathes, and on fine pointers the cursor gathers nearby
   seeds toward it and ignites lime. Pure Canvas 2D, no dependencies.
   ============================================================================ */
export function mountCairn(container, opts = {}) {
  const o = Object.assign({
    count: null,          // override seed count (defaults by pointer type)
    dpr: 2,               // max device-pixel ratio (capped harder on coarse)
    baseReveal: 0.58,     // fraction of the spiral shown at climb 0 (the rest grows in)
    transparent: true,    // draw on a transparent canvas (the page void/scrim shows through)
  }, opts);

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(hover:none),(pointer:coarse)').matches;

  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  container.appendChild(cv);
  const ctx = cv.getContext('2d', { alpha: o.transparent });

  // the golden-angle spiral — seed n at angle n*137.5deg, radius proportional to sqrt(n)
  const N = o.count || (coarse ? 900 : 1600);
  const GOLD = Math.PI * (3 - Math.sqrt(5));   // 2.39996... rad = 137.5 degrees
  const SQN = Math.sqrt(N);
  const ang = new Float32Array(N);
  const rad0 = new Float32Array(N);            // sqrt(n), the unscaled radius
  for (let i = 0; i < N; i++) { ang[i] = i * GOLD; rad0[i] = Math.sqrt(i); }

  const EMER = [60, 150, 110], LIME = [200, 255, 0];
  const REACH = 190;                 // cursor influence radius (px)
  const RW = 64;                     // width of the travelling ring (px)
  const inv2RW = 1 / (2 * RW * RW);

  let active = true;   // declared early so the pointer handler can skip work when faded out
  let W, H, DPR, cx, cy, scaleBase, maxR;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : o.dpr);
    // size to the CONTAINER, not the viewport, so this is safe in any layout (not just a full-screen Stage layer)
    const rect = container.getBoundingClientRect();
    W = Math.max(1, rect.width); H = Math.max(1, rect.height);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cx = W * 0.5; cy = H * 0.5;
    maxR = Math.min(W, H) * 0.47;
    scaleBase = maxR / SQN;          // c such that the outermost seed sits at maxR
  }
  // observe the container's own box (catches layout changes a window 'resize' would miss); fall back to window resize
  let repaint = () => {};
  const onResize = () => { resize(); repaint(); };
  const ro = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(onResize) : null;
  if (ro) ro.observe(container); else addEventListener('resize', onResize, { passive: true });

  // pointer — the cursor gathers nearby seeds toward it (fine pointers only), measured RELATIVE to the
  // container so the influence lands correctly even when the canvas isn't the full viewport.
  const mouse = { x: -1e4, y: -1e4, on: false };
  let onPointer = null, onLeave = null;
  if (!coarse && !reduce) {
    onPointer = (e) => {
      if (!active) return;                 // don't track while the layer is faded out
      const rect = container.getBoundingClientRect();
      mouse.x = e.clientX - rect.left; mouse.y = e.clientY - rect.top; mouse.on = true;
    };
    onLeave = () => { mouse.on = false; };
    addEventListener('pointermove', onPointer, { passive: true });
    addEventListener('pointerleave', onLeave, { passive: true });
  }

  // climb (growth) state, eased toward the scroll-driven target
  const climb = { cur: 0, tgt: 0 };
  let ringR = 0;

  function step(t) {
    climb.cur += (climb.tgt - climb.cur) * 0.06;
    ringR = (maxR + RW * 2) * ((t * 0.085) % 1);
  }

  function paint(t) {
    ctx.clearRect(0, 0, W, H);
    const breathe = 1 + 0.03 * Math.sin(t * 0.6);
    const scale = scaleBase * breathe;
    // reveal grows outward with climb — the cairn stacks up as you scroll
    const reveal = o.baseReveal + (1 - o.baseReveal) * climb.cur;
    const revealN = reveal * N;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < N; i++) {
      // soft outward growth edge: seeds past the reveal front fade in over ~8% of the count
      let grow = (revealN - i) / (N * 0.08);
      if (grow <= 0) continue;
      if (grow > 1) grow = 1;

      const pr = rad0[i] * scale;
      const a = ang[i];
      let x = cx + Math.cos(a) * pr;
      let y = cy + Math.sin(a) * pr;

      // the travelling lime "now" ring, by distance from centre
      const dRing = pr - ringR;
      const ringMix = Math.exp(-dRing * dRing * inv2RW);

      // cursor attract — gather nearby seeds, ignite lime
      let curMix = 0;
      if (mouse.on) {
        const dx = mouse.x - x, dy = mouse.y - y, d = Math.hypot(dx, dy);
        if (d < REACH) {
          const f = 1 - d / REACH;
          const pull = f * f * 0.3;
          x += dx * pull; y += dy * pull;
          curMix = f * f;
        }
      }

      let mix = ringMix * 0.85 + curMix;
      if (mix > 1) mix = 1;
      const r = (EMER[0] + (LIME[0] - EMER[0]) * mix) | 0;
      const g = (EMER[1] + (LIME[1] - EMER[1]) * mix) | 0;
      const b = (EMER[2] + (LIME[2] - EMER[2]) * mix) | 0;

      const baseR = 0.9 + 1.5 * (rad0[i] / SQN);   // outer seeds a touch larger
      const dotR = baseR * (1 + 0.9 * curMix + 0.6 * ringMix);
      const alpha = (0.34 + 0.46 * ringMix + 0.5 * curMix) * grow;
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x, y, dotR, 0, 6.2832); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // warm-up: advance the sim then paint one synchronous frame so a paused/preview
  // tab (or a faded-out layer) already shows a living, settled spiral
  resize();
  let T = 0;
  const warm = reduce ? 60 : 150;
  for (let k = 0; k < warm; k++) { T += 0.016; step(T); }
  if (reduce) { climb.cur = climb.tgt = 0.75; }   // reduced motion settles at a grown cairn
  paint(T);
  repaint = () => paint(T); // resizing clears the canvas; keep the settled frame visible

  let raf = 0;   // active (declared above) is toggled by setActive; Stage pauses faded-out layers (opacity ~0)
  if (!reduce) {
    const nowFn = (typeof performance !== 'undefined' && performance.now) ? () => performance.now() : () => Date.now();
    let last = nowFn();
    const loop = () => {
      const now = nowFn();
      let dt = (now - last) / 1000; last = now;   // last always advances → no jump when paused
      if (dt > 0.05) dt = 0.05;
      if (active && !document.hidden) { T += dt; step(T); paint(T); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  return {
    setClimb(v) { climb.tgt = Math.min(1, Math.max(0, v)); },
    setActive(v) { active = v !== false; },   // Stage pauses this layer when faded out
    renderFrame(dt) { T += (typeof dt === 'number' ? dt : 0.016); step(T); paint(T); },  // manual tick (preview/debug)
    resize: onResize,
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      if (ro) ro.disconnect(); else removeEventListener('resize', onResize);
      if (onPointer) removeEventListener('pointermove', onPointer);
      if (onLeave) removeEventListener('pointerleave', onLeave);
      if (cv.parentNode) cv.parentNode.removeChild(cv);
    },
  };
}
