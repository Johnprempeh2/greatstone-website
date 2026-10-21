export function mountGreatstoneTide(container, opts) {
  'use strict';
  const VS = [
    'attribute vec2 aG;',
    'uniform mat4 uPV; uniform float uT; uniform vec3 uP;',
    'varying vec2 vW; varying float vDepth; varying float vLight; varying float vCrest; varying float vSwell;',
    'float swell(vec2 p) { vec2 d = p - uP.xy; return uP.z * exp(-dot(d, d) / 3.6); }',
    'float height(vec2 p) {',
    '  float h = 0.26 * sin(p.x * 0.42 + p.y * 0.22 + uT * 0.32)',
    '          + 0.15 * sin(p.x * 0.85 - p.y * 0.48 - uT * 0.41)',
    '          + 0.06 * sin(p.x * 1.9 + p.y * 1.25 + uT * 0.63);',
    '  return h + 0.5 * swell(p);',
    '}',
    'void main() {',
    '  vec2 p = vec2(mix(-15.0, 15.0, aG.x), mix(-24.0, 4.0, aG.y));',
    '  float h = height(p);',
    '  vec3 n = normalize(vec3(height(p - vec2(0.08, 0.0)) - height(p + vec2(0.08, 0.0)), 0.16,',
    '                          height(p - vec2(0.0, 0.08)) - height(p + vec2(0.0, 0.08))));',
    '  vLight = clamp(dot(n, normalize(vec3(-0.45, 0.8, 0.35))), 0.0, 1.0);',
    '  vCrest = smoothstep(0.12, 0.42, h - 0.5 * swell(p));',
    '  vSwell = swell(p);',
    '  vW = p;',
    '  vec4 c = uPV * vec4(p.x, h, p.y, 1.0);',
    '  vDepth = c.w;',
    '  gl_Position = c;',
    '}'
  ].join('\n');
  const FS = [
    '#extension GL_OES_standard_derivatives : enable',
    'precision highp float;',
    'uniform float uDpr; uniform float uProm; uniform float uHot; uniform float uRows; uniform vec3 uDeep; uniform vec3 uEmer; uniform vec3 uLime;',
    'varying vec2 vW; varying float vDepth; varying float vLight; varying float vCrest; varying float vSwell;',
    /* distance to the nearest line in device pixels, and how crowded the lines are here */
    'vec2 lineDist(float u) { float fw = max(fwidth(u), 1e-4); return vec2(abs(fract(u - 0.5) - 0.5) / fw, fw); }',
    'void main() {',
    '  vec2 r = lineDist(vW.y * uRows);',
    '  vec2 c = lineDist(vW.x * 0.9);',
    '  float crowdR = 1.0 - smoothstep(0.22, 0.5, r.y);',
    '  float crowdC = 1.0 - smoothstep(0.18, 0.4, c.y);',
    '  float halfW = 0.55 * uDpr;',
    '  float core = (1.0 - smoothstep(halfW - 0.5, halfW + 0.7, r.x)) * crowdR;',
    '  float glow = exp(-r.x * r.x / (16.0 * uDpr * uDpr)) * crowdR;',
    '  float cross = (1.0 - smoothstep(halfW - 0.6, halfW + 0.6, c.x)) * crowdC * 0.16;',
    '  float fog = smoothstep(30.0, 9.0, vDepth) * smoothstep(0.6, 2.2, vDepth);',
    '  float hot = clamp(vCrest * 0.55 + vSwell * 0.95, 0.0, uHot);',
    '  vec3 col = mix(uDeep, uEmer, 0.25 + 0.75 * vLight);',
    '  col = mix(col, uLime, hot);',
    '  float a = (core * (0.28 + 0.55 * vLight + 0.35 * hot) + cross * (0.4 + 0.6 * vLight) + glow * 0.32 * hot) * fog * uProm;',
    '  a = clamp(a, 0.0, 1.0);',
    '  gl_FragColor = vec4(col * a, a);',
    '}'
  ].join('\n');

  const rgb = c => [c[0] / 255, c[1] / 255, c[2] / 255];
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }
  function lookAt(e, t) {
    let zx = e[0] - t[0], zy = e[1] - t[1], zz = e[2] - t[2], l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = zz, xy = 0, xz = -zx; l = Math.hypot(xx, xz); xx /= l; xz /= l;        /* up = +y */
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
      -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1];
  }
  function mul(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  }

  function mount(container, opts) {
    const o = Object.assign({ prominence: 1, lime: 1, touchTarget: null, dpr: 2, speed: 1, rows: null, view: 'hero', swell: 1 }, opts || {});
    const val = v => Math.min(1, Math.max(0, typeof v === 'function' ? v() : v));
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia('(hover:none),(pointer:coarse)').matches;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;display:block;width:100%;height:100%;';
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: true, powerPreference: 'low-power' });
    if (!gl || !gl.getExtension('OES_standard_derivatives')) return null;   /* the caller keeps the static rings */

    function shader(type, src) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const U = {};
    ['uPV', 'uT', 'uP', 'uDpr', 'uProm', 'uHot', 'uRows', 'uDeep', 'uEmer', 'uLime'].forEach(n => { U[n] = gl.getUniformLocation(prog, n); });
    gl.uniform3fv(U.uDeep, rgb([34, 84, 62]));
    gl.uniform3fv(U.uEmer, rgb([58, 140, 100]));
    gl.uniform3fv(U.uLime, rgb([200, 255, 0]));

    /* the grid: lighter on phones, still smooth because the lines are drawn per pixel, not per vertex */
    const GX = coarse ? 140 : 220, GZ = coarse ? 90 : 140;
    const verts = new Float32Array((GX + 1) * (GZ + 1) * 2);
    for (let z = 0, k = 0; z <= GZ; z++) for (let x = 0; x <= GX; x++) { verts[k++] = x / GX; verts[k++] = z / GZ; }
    const idx = new Uint16Array(GX * GZ * 6);
    for (let z = 0, k = 0; z < GZ; z++) for (let x = 0; x < GX; x++) {
      const i = z * (GX + 1) + x;
      idx[k++] = i; idx[k++] = i + 1; idx[k++] = i + GX + 1;
      idx[k++] = i + 1; idx[k++] = i + GX + 2; idx[k++] = i + GX + 1;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    const aG = gl.getAttribLocation(prog, 'aG');
    gl.enableVertexAttribArray(aG); gl.vertexAttribPointer(aG, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    container.appendChild(canvas);

    let W = 1, H = 1, DPR = 1, PV = null, IPV = null, eye = null;
    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, o.dpr);
      const rect = container.getBoundingClientRect();
      W = Math.max(1, rect.width); H = Math.max(1, rect.height);
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
      gl.viewport(0, 0, canvas.width, canvas.height);
      const aspect = W / H, narrow = aspect < 1.2;
      /* laptop: low, wide view with the swells on the right, clear of the words; phone: a steeper look down */
      /* ROUND 15: the calm copy below the doors looks down from higher and centred, so the swells fill the section
         evenly behind the text instead of gathering on the right */
      const calm = o.view === 'calm';
      eye = calm ? (narrow ? [0, 5.4, 5.2] : [0, 4.6, 6.2]) : narrow ? [0.6, 4.2, 6.0] : [-0.4, 3.4, 6.4];
      const target = calm ? (narrow ? [0.4, -0.8, -4] : [0.6, -1.2, -4]) : narrow ? [1.4, -0.6, -3] : [2.4, -0.9, -3];
      PV = mul(perspective((narrow ? 60 : calm ? 44 : 40) * Math.PI / 180, aspect, 0.3, 60), lookAt(eye, target));
      IPV = invert(PV);
      gl.uniformMatrix4fv(U.uPV, false, new Float32Array(PV));
      gl.uniform1f(U.uDpr, DPR);
      gl.uniform1f(U.uRows, o.rows ? o.rows(narrow) : narrow ? 1.5 : 2.4);   /* phone: wider spacing, so it reads as swells, not a grid */
    }
    function invert(m) {
      const a = m, inv = new Array(16);
      inv[0] = a[5]*a[10]*a[15]-a[5]*a[11]*a[14]-a[9]*a[6]*a[15]+a[9]*a[7]*a[14]+a[13]*a[6]*a[11]-a[13]*a[7]*a[10];
      inv[4] = -a[4]*a[10]*a[15]+a[4]*a[11]*a[14]+a[8]*a[6]*a[15]-a[8]*a[7]*a[14]-a[12]*a[6]*a[11]+a[12]*a[7]*a[10];
      inv[8] = a[4]*a[9]*a[15]-a[4]*a[11]*a[13]-a[8]*a[5]*a[15]+a[8]*a[7]*a[13]+a[12]*a[5]*a[11]-a[12]*a[7]*a[9];
      inv[12] = -a[4]*a[9]*a[14]+a[4]*a[10]*a[13]+a[8]*a[5]*a[14]-a[8]*a[6]*a[13]-a[12]*a[5]*a[10]+a[12]*a[6]*a[9];
      inv[1] = -a[1]*a[10]*a[15]+a[1]*a[11]*a[14]+a[9]*a[2]*a[15]-a[9]*a[3]*a[14]-a[13]*a[2]*a[11]+a[13]*a[3]*a[10];
      inv[5] = a[0]*a[10]*a[15]-a[0]*a[11]*a[14]-a[8]*a[2]*a[15]+a[8]*a[3]*a[14]+a[12]*a[2]*a[11]-a[12]*a[3]*a[10];
      inv[9] = -a[0]*a[9]*a[15]+a[0]*a[11]*a[13]+a[8]*a[1]*a[15]-a[8]*a[3]*a[13]-a[12]*a[1]*a[11]+a[12]*a[3]*a[9];
      inv[13] = a[0]*a[9]*a[14]-a[0]*a[10]*a[13]-a[8]*a[1]*a[14]+a[8]*a[2]*a[13]+a[12]*a[1]*a[10]-a[12]*a[2]*a[9];
      inv[2] = a[1]*a[6]*a[15]-a[1]*a[7]*a[14]-a[5]*a[2]*a[15]+a[5]*a[3]*a[14]+a[13]*a[2]*a[7]-a[13]*a[3]*a[6];
      inv[6] = -a[0]*a[6]*a[15]+a[0]*a[7]*a[14]+a[4]*a[2]*a[15]-a[4]*a[3]*a[14]-a[12]*a[2]*a[7]+a[12]*a[3]*a[6];
      inv[10] = a[0]*a[5]*a[15]-a[0]*a[7]*a[13]-a[4]*a[1]*a[15]+a[4]*a[3]*a[13]+a[12]*a[1]*a[7]-a[12]*a[3]*a[5];
      inv[14] = -a[0]*a[5]*a[14]+a[0]*a[6]*a[13]+a[4]*a[1]*a[14]-a[4]*a[2]*a[13]-a[12]*a[1]*a[6]+a[12]*a[2]*a[5];
      inv[3] = -a[1]*a[6]*a[11]+a[1]*a[7]*a[10]+a[5]*a[2]*a[11]-a[5]*a[3]*a[10]-a[9]*a[2]*a[7]+a[9]*a[3]*a[6];
      inv[7] = a[0]*a[6]*a[11]-a[0]*a[7]*a[10]-a[4]*a[2]*a[11]+a[4]*a[3]*a[10]+a[8]*a[2]*a[7]-a[8]*a[3]*a[6];
      inv[11] = -a[0]*a[5]*a[11]+a[0]*a[7]*a[9]+a[4]*a[1]*a[11]-a[4]*a[3]*a[9]-a[8]*a[1]*a[7]+a[8]*a[3]*a[5];
      inv[15] = a[0]*a[5]*a[10]-a[0]*a[6]*a[9]-a[4]*a[1]*a[10]+a[4]*a[2]*a[9]+a[8]*a[1]*a[6]-a[8]*a[2]*a[5];
      const det = a[0] * inv[0] + a[1] * inv[4] + a[2] * inv[8] + a[3] * inv[12];
      return inv.map(v => v / (det || 1));
    }
    /* where a screen point meets the sea (y = 0) */
    function toSea(x, y) {
      const nx = x / W * 2 - 1, ny = 1 - y / H * 2;
      const un = (v, z) => { const w = IPV[3] * v[0] + IPV[7] * v[1] + IPV[11] * z + IPV[15];
        return [0, 1, 2].map(i => (IPV[i] * v[0] + IPV[4 + i] * v[1] + IPV[8 + i] * z + IPV[12 + i]) / w); };
      const a = un([nx, ny], -1), b = un([nx, ny], 1);
      const dy = b[1] - a[1];
      if (dy >= -1e-6) return null;                  /* above the horizon */
      const s = -a[1] / dy;
      return [a[0] + (b[0] - a[0]) * s, a[2] + (b[2] - a[2]) * s];
    }

    const want = { x: 4, z: -3, on: 0 }, sm = { x: 4, z: -3, on: 0 };
    function at(cx, cy) {
      const r = container.getBoundingClientRect();
      const p = toSea(cx - r.left, cy - r.top);
      if (!p) { want.on = 0; return; }
      want.x = Math.max(-12, Math.min(12, p[0])); want.z = Math.max(-18, Math.min(3.5, p[1])); want.on = 1;
    }
    function onMove(e) { if (!document.hidden) at(e.clientX, e.clientY); }
    function onLeave() { want.on = 0; }
    let touchOff = 0;
    function onTouch(e) { const t = e.touches && e.touches[0]; if (!t || document.hidden) return; clearTimeout(touchOff); at(t.clientX, t.clientY); }
    function onTouchEnd() { clearTimeout(touchOff); touchOff = setTimeout(onLeave, 900); }

    let t0 = null, last = 0, lost = false;
    function draw(now) {
      if (lost) return;
      if (t0 == null) { t0 = now; last = now; }
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const k = 1 - Math.exp(-dt * 4.5), kOn = 1 - Math.exp(-dt * (want.on ? 3 : 1.4));
      sm.x += (want.x - sm.x) * k; sm.z += (want.z - sm.z) * k; sm.on += (want.on - sm.on) * kOn;
      gl.uniform1f(U.uT, reduce ? 4.2 : (now - t0) / 1000 * o.speed);
      gl.uniform3f(U.uP, sm.x, sm.z, reduce ? 0 : sm.on * o.swell);
      gl.uniform1f(U.uProm, val(o.prominence));
      gl.uniform1f(U.uHot, val(o.lime));
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
    }

    let raf = 0, active = true;
    function loop(now) {
      raf = 0;
      if (active && !document.hidden) draw(now);
      if (!reduce && !lost) raf = requestAnimationFrame(loop);
    }

    resize();
    const onResize = () => { resize(); if (reduce) draw(performance.now()); };
    window.addEventListener('resize', onResize, { passive: true });
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
    if (ro) ro.observe(container);
    const touchEl = o.touchTarget || container;
    if (!reduce) {
      if (coarse) {
        touchEl.addEventListener('touchstart', onTouch, { passive: true });
        touchEl.addEventListener('touchmove', onTouch, { passive: true });
        touchEl.addEventListener('touchend', onTouchEnd, { passive: true });
        touchEl.addEventListener('touchcancel', onTouchEnd, { passive: true });
      } else {
        window.addEventListener('pointermove', onMove, { passive: true });
        document.documentElement.addEventListener('pointerleave', onLeave, { passive: true });
      }
    }

    const api = {
      onLost: null,
      setActive(v) { active = v !== false; },
      destroy() {
        if (raf) cancelAnimationFrame(raf);
        if (ro) ro.disconnect();
        window.removeEventListener('resize', onResize);
        window.removeEventListener('pointermove', onMove);
        document.documentElement.removeEventListener('pointerleave', onLeave);
        ['touchstart', 'touchmove'].forEach(n => touchEl.removeEventListener(n, onTouch));
        ['touchend', 'touchcancel'].forEach(n => touchEl.removeEventListener(n, onTouchEnd));
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    };
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; api.destroy(); if (api.onLost) api.onLost(); });

    draw(performance.now());
    if (!reduce) raf = requestAnimationFrame(loop);
    return api;
  }
  return mount(container, opts);
}
