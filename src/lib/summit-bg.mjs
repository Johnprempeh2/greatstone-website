/* ============================================================================
   Greatstone — Summit terrain background (climb page).
   Ported from the Animation Lab "No. 006 SUMMIT": a procedural fbm terrain with
   one dominant summit, drawn as a glowing emerald wireframe that fades up to lime
   at the peak. Adapted here as a transparent, scroll-reactive page background:

     mountSummit(container, opts) -> { setClimb(0..1), resize(), destroy() }

   The `climb` value drives the GROWTH — as you ascend the maturity map (pebble →
   plateau → peak) the range rises out of the dark, the lime spreads down from the
   summit, and the peak lights up. three.js r0.170.0 via the page's importmap.
   ============================================================================ */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export function mountSummit(container, opts = {}) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(hover:none),(pointer:coarse)').matches;

  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  container.appendChild(cv);

  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x000000, 0);              // transparent — the page's emerald void shows through
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const EMER = new THREE.Color(0x2a8f63);   // emerald wire
  const LIME = new THREE.Color(0xc8ff00);   // peak / ridge glow
  const FILL = new THREE.Color(0x0e1a12);   // faint faces beneath

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b1410, 9, 30);       // lime-dark fog receding into the void

  const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 100);
  const camBase = new THREE.Vector3(0, 4.6, 12.4);
  camera.position.copy(camBase);
  camera.lookAt(0, 1.1, -2.2);

  // ---- procedural terrain (deterministic value-noise fbm, one dominant summit) ----
  const SEG = coarse ? 84 : 132;
  const SIZE = 26;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);

  function hash(ix, iy) {
    let h = ix * 374761393 + iy * 668265263;
    h = (h ^ (h >> 13)) * 1274126177;
    h = (h ^ (h >> 16)) >>> 0;
    return h / 4294967295;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function vnoise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const a = hash(ix, iy), b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    const u = smooth(fx), v = smooth(fy);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  function fbm(x, y) {
    let amp = 0.5, freq = 1.0, sum = 0, norm = 0;
    for (let o = 0; o < 5; o++) {
      sum += amp * vnoise(x * freq + o * 11.3, y * freq - o * 7.7);
      norm += amp;
      amp *= 0.5; freq *= 2.03;
    }
    return sum / norm;
  }

  const PEAK = new THREE.Vector2(0, -6.2);
  let peakWorldY = 0;
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    let h = fbm(x * 0.26 + 4.0, z * 0.26 - 2.0) * 2.1;
    h += fbm(x * 0.6, z * 0.6) * 0.6;
    const dd = Math.hypot(x - PEAK.x, z - PEAK.y);
    const mound = Math.exp(-(dd * dd) / (2 * 4.4 * 4.4));
    const ridge = 0.5 + 0.5 * Math.sin(dd * 0.9);
    h += mound * (5.4 + ridge * 1.1);
    h += (z > 4 ? -(z - 4) * 0.18 : 0);
    pos.setY(i, h);
    if (Math.abs(x - PEAK.x) < 0.25 && Math.abs(z - PEAK.y) < 0.25) peakWorldY = Math.max(peakWorldY, h);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  const terrain = new THREE.Group();
  terrain.scale.y = 0.32;                            // starts low — emerges as you climb
  scene.add(terrain);

  // (a) faint filled faces beneath the wire
  const fillMat = new THREE.MeshBasicMaterial({
    color: FILL, transparent: true, opacity: 0.2,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, fog: true,
  });
  terrain.add(new THREE.Mesh(geo, fillMat));

  // (b) glowing emerald wireframe — vertex-coloured by height, plus a per-vertex
  //     normalised height (aHeight) so a shader uniform can spread lime up with climb
  const wireGeo = new THREE.WireframeGeometry(geo);
  const wpos = wireGeo.attributes.position;
  const cols = new Float32Array(wpos.count * 3);
  const heights = new Float32Array(wpos.count);
  const tmp = new THREE.Color();
  for (let i = 0; i < wpos.count; i++) {
    const y = wpos.getY(i);
    const t = Math.min(1, Math.max(0, y / (peakWorldY * 0.96)));
    heights[i] = t;
    const ridgeT = smooth(Math.min(1, Math.max(0, (t - 0.55) / 0.45)));
    tmp.copy(EMER).lerp(LIME, ridgeT);
    const lift = 0.35 + 0.65 * t;
    cols[i * 3] = tmp.r * lift;
    cols[i * 3 + 1] = tmp.g * lift;
    cols[i * 3 + 2] = tmp.b * lift;
  }
  wireGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  wireGeo.setAttribute('aHeight', new THREE.BufferAttribute(heights, 1));

  const climbU = { value: 0 };                        // shared uniform, updated each frame
  const wireMat = new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, fog: true, depthWrite: false,
  });
  wireMat.onBeforeCompile = (shader) => {
    shader.uniforms.uClimb = climbU;
    shader.vertexShader = 'attribute float aHeight;\nvarying float vH;\n' +
      shader.vertexShader.replace('void main() {', 'void main() {\n\tvH = aHeight;');
    shader.fragmentShader = 'uniform float uClimb;\nvarying float vH;\n' + shader.fragmentShader;
    const inject =
      'float _c = clamp(uClimb,0.0,1.0);\n' +
      'float _rev = mix(0.30, 1.0, _c);\n' +                       // whole range dim → bright with climb
      'float _lime = smoothstep(0.42, 1.0, vH) * _c;\n' +          // lime spreads down from the summit
      'outgoingLight = mix(outgoingLight, vec3(0.78,1.0,0.0), _lime*0.55) * _rev;\n';
    if (shader.fragmentShader.includes('#include <opaque_fragment>'))
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', inject + '#include <opaque_fragment>');
    else if (shader.fragmentShader.includes('#include <output_fragment>'))
      shader.fragmentShader = shader.fragmentShader.replace('#include <output_fragment>', inject + '#include <output_fragment>');
  };
  terrain.add(new THREE.LineSegments(wireGeo, wireMat));

  // (c) the summit glows — a lime point light + a soft sprite halo at the peak
  const peakPos = new THREE.Vector3(PEAK.x, peakWorldY, PEAK.y);
  const summitLight = new THREE.PointLight(0xc8ff00, 4.0, 14, 2.0);
  summitLight.position.copy(peakPos).add(new THREE.Vector3(0, 0.4, 0));
  terrain.add(summitLight);

  function glowTexture() {
    const s = 128, c = document.createElement('canvas'); c.width = c.height = s;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(200,255,0,0.95)');
    grd.addColorStop(0.25, 'rgba(200,255,0,0.45)');
    grd.addColorStop(1, 'rgba(200,255,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
  }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: 0xc8ff00, blending: THREE.AdditiveBlending,
    transparent: true, depthWrite: false, depthTest: false, opacity: 0.0, fog: false,
  }));
  halo.scale.setScalar(2.0);
  halo.position.copy(peakPos).add(new THREE.Vector3(0, 0.5, 0));
  terrain.add(halo);

  const key = new THREE.DirectionalLight(0x3fae7a, 0.8);
  key.position.set(-6, 7, 4); scene.add(key);
  scene.add(new THREE.AmbientLight(0x0d1f16, 0.6));

  // ---- post: bloom so the summit and ridge glow ----
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.62, 0.55);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ---- gentle pointer parallax (fine pointers only) ----
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  let onPointer = null;
  if (!coarse && !reduce) {
    onPointer = (e) => { ptr.tx = (e.clientX / innerWidth) * 2 - 1; ptr.ty = (e.clientY / innerHeight) * 2 - 1; };
    addEventListener('pointermove', onPointer, { passive: true });
  }

  // ---- climb (growth) state, eased toward the scroll-driven target ----
  const climb = { cur: 0, tgt: 0 };

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize, { passive: true });

  let T = 0;
  function update(dt) {
    T += dt;
    ptr.x += (ptr.tx - ptr.x) * 0.05;
    ptr.y += (ptr.ty - ptr.y) * 0.05;
    climb.cur += (climb.tgt - climb.cur) * 0.06;
    const c = climb.cur;
    climbU.value = c;

    // GROWTH: the range rises out of the dark as you climb
    const sy = 0.32 + 0.68 * c;
    terrain.scale.y += (sy - terrain.scale.y) * 0.12;
    fillMat.opacity = 0.12 + 0.28 * c;

    // slow camera drift over the range — feels like an ascent
    const drift = T * 0.06;
    camera.position.x = camBase.x + Math.sin(drift) * 1.8;
    camera.position.z = camBase.z + Math.cos(drift * 0.7) * 0.9;
    camera.position.y = camBase.y + Math.sin(drift * 0.5) * 0.45;

    // range turns gently toward the cursor
    terrain.rotation.y = ptr.x * 0.18;
    terrain.rotation.x = -ptr.y * 0.08;
    camera.lookAt(PEAK.x + ptr.x * 1.0, 1.0 + peakWorldY * 0.12 * terrain.scale.y, PEAK.y + 4.2);

    // the summit lights up toward the peak (and pulses gently)
    const pulse = 0.85 + 0.18 * Math.sin(T * 1.4);
    summitLight.intensity = (0.8 + 5.0 * c) * pulse;
    halo.scale.setScalar((1.2 + 2.0 * c) * (0.9 + 0.12 * pulse));
    halo.material.opacity = (0.08 + 0.7 * c) * (0.8 + 0.2 * pulse);
    bloom.strength = 0.32 + 0.7 * c;
    renderer.toneMappingExposure = 0.98 + 0.32 * c;
  }

  // warm-up: one synchronous frame so a paused/preview tab already shows the terrain
  resize();
  update(0);
  composer.render();

  let raf = 0;
  if (!reduce) {
    const nowFn = (typeof performance !== 'undefined' && performance.now) ? () => performance.now() : () => Date.now();
    let last = nowFn();
    const loop = () => {
      const now = nowFn();
      let dt = (now - last) / 1000; last = now;
      if (dt > 0.05) dt = 0.05;
      if (!document.hidden) { update(dt); composer.render(); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  } else {
    // reduced motion: settle at a grown, lit summit as a static frame
    climb.cur = climb.tgt = 0.75; update(0); composer.render();
  }

  return {
    setClimb(v) { climb.tgt = Math.min(1, Math.max(0, v)); },
    renderFrame(dt) { update(typeof dt === 'number' ? dt : 0.016); composer.render(); },  // manual tick (preview/debug)
    resize,
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
      if (onPointer) removeEventListener('pointermove', onPointer);
      geo.dispose(); wireGeo.dispose(); wireMat.dispose(); fillMat.dispose();
      renderer.forceContextLoss(); renderer.dispose();
      if (cv.parentNode) cv.parentNode.removeChild(cv);
    },
  };
}
