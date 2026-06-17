/* Greatstone 8-pillar explorer — a faithful port of the live homepage's #/method methodology gems.
   Each pillar is an extruded emerald BODY (depth + bevelled sides, holds up when it turns) wearing a
   DISPLACED, normal-mapped relief FACE on the front AND back, driven by per-icon albedo/normal/height
   maps so the facets physically protrude — a carved emerald medallion, not a flat card. Same material
   family + fresnel lime rim + bloom as the logo. Gems fan out from the centre into a ring on mount,
   then rock and breathe on their own axes; hover pops one, click selects (onSelect(index)). */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { PILLAR_SVG } from './pillar-svg.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isCoarse = matchMedia('(pointer: coarse)').matches;
const RIM = new THREE.Color(0xc8ff00), RIM_POW = 1.7;
const TINTS = [0x16432f, 0x113826, 0x1b5039, 0x0e3122, 0x154631, 0x16432f, 0x113826, 0x1b5039];
const BASE = { metalness: 0.64, roughness: 0.05, envMapIntensity: 4.2, clearcoat: 1.0, clearcoatRoughness: 0.03, flatShading: true, emissive: 0x052314 };
const PILLAR_SIZE = 1.5, PILLAR_DEPTH = 0.36;
const FACE_SEG = isCoarse ? 1 : 96;
// per-icon relief metadata + tuning (from the design pass that generated the maps)
const RELIEF_META = { people: { cropW: 533, cropH: 422 }, communication: { cropW: 538, cropH: 465 }, innovation: { cropW: 386, cropH: 532 }, data: { cropW: 538, cropH: 412 }, customer: { cropW: 538, cropH: 336 }, competition: { cropW: 504, cropH: 535 }, technology: { cropW: 530, cropH: 529 }, value: { cropW: 538, cropH: 471 } };
const RELIEF_FX = { people: { disp: 0.15, norm: 1.15 }, communication: { disp: 0.15, norm: 1.2 }, innovation: { disp: 0.17, norm: 1.3 }, data: { disp: 0.15, norm: 1.2 }, customer: { disp: 0.15, norm: 1.1 }, competition: { disp: 0.16, norm: 1.1 }, technology: { disp: 0.16, norm: 1.15 }, value: { disp: 0.16, norm: 1.2 } };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

function addRim(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRimColor = { value: RIM }; sh.uniforms.uRimPow = { value: RIM_POW };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimPow;')
      .replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\nfloat gsFres=pow(1.0-abs(dot(normalize(vViewPosition),normal)),3.0);\ntotalEmissiveRadiance += uRimColor*gsFres*uRimPow;');
  };
  mat.needsUpdate = true;
}

export function mountPillarExplorer(container, opts = {}) {
  const o = Object.assign({ envUrl: 'env-emerald.jpg', bloom: 0.85, exposure: 1.35, keys: Object.keys(PILLAR_SVG),
    onSelect: null, layout: 'ring', ringRadius: 2.55, camZ: null, cols: 4 }, opts);
  const baseDir = o.envUrl.slice(0, o.envUrl.lastIndexOf('/') + 1);

  const canvas = document.createElement('canvas'); canvas.style.cssText = 'width:100%;height:100%;display:block';
  container.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.debug.checkShaderErrors = false; // some backends return null from getProgramInfoLog → three .trim() throws
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = o.exposure;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100); camera.position.set(0, 0, 9.4);

  const pmrem = new THREE.PMREMGenerator(renderer);
  (function env() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#06140d'); gr.addColorStop(.45, '#16432f'); gr.addColorStop(.55, '#1d5a3e'); gr.addColorStop(1, '#04100a');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 256); g.globalCompositeOperation = 'lighter';
    const s = (x, y, w, h, col, a) => { g.fillStyle = col; g.globalAlpha = a; g.fillRect(x, y, w, h); };
    s(40, 28, 360, 10, '#dfffe8', .55); s(120, 86, 300, 6, '#c8ff00', .38); s(20, 150, 430, 16, '#fff', .16); g.globalAlpha = 1;
    const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
    scene.environment = pmrem.fromEquirectangular(t).texture; t.dispose();
  })();
  if (o.envUrl) new THREE.TextureLoader().load(o.envUrl, (tex) => {
    tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.SRGBColorSpace;
    scene.environment = pmrem.fromEquirectangular(tex).texture;
  }, undefined, () => {});

  scene.add(new THREE.AmbientLight(0x141c17, 0.4));
  const key = new THREE.DirectionalLight(0xeaf5ec, 1.6); key.position.set(5, 8, 6); scene.add(key);
  const fill = new THREE.DirectionalLight(0x35584a, 0.6); fill.position.set(-5, -3, -4); scene.add(fill);
  const limeA = new THREE.PointLight(0xc8ff00, 2.2, 40, 2.0); limeA.position.set(7, -2, 8); scene.add(limeA);
  const limeB = new THREE.PointLight(0xc8ff00, 1.6, 40, 2.0); limeB.position.set(-8, 4, 7); scene.add(limeB);

  // shared lime glow sprite texture (per-pillar aura + centre pool)
  function glowTexture(size) {
    const cv = document.createElement('canvas'); cv.width = cv.height = size; const ctx = cv.getContext('2d'); const r = size / 2;
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, 'rgba(200,255,0,.95)'); g.addColorStop(.18, 'rgba(200,255,0,.55)'); g.addColorStop(.45, 'rgba(200,255,0,.18)'); g.addColorStop(1, 'rgba(200,255,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const GLOW = glowTexture(isCoarse ? 128 : 256);

  const root = new THREE.Group(); scene.add(root);
  // soft lime pool the ring orbits over
  const centerGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xc8ff00, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.05 }));
  centerGlow.scale.set(5.2, 5.2, 1); centerGlow.position.set(0, 0, -1.4); centerGlow.renderOrder = -1; root.add(centerGlow);

  // ── geometry: extruded body from the icon silhouette ────────────────────────
  const svgLoader = new SVGLoader();
  function bodyGeometry(svgText) {
    const data = svgLoader.parse(svgText); const shapes = [];
    data.paths.forEach((p) => SVGLoader.createShapes(p).forEach((s) => shapes.push(s)));
    const geo = new THREE.ExtrudeGeometry(shapes, { depth: 120, bevelEnabled: true, bevelThickness: 16, bevelSize: 13, bevelSegments: 2, curveSegments: 4 });
    geo.computeBoundingBox(); const bb = geo.boundingBox;
    const sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y, sz = bb.max.z - bb.min.z;
    const k = PILLAR_SIZE / Math.max(sx, sy), kz = PILLAR_DEPTH / sz;
    geo.translate(-(bb.min.x + sx / 2), -(bb.min.y + sy / 2), -(bb.min.z + sz / 2));
    geo.scale(k, k, kz); geo.rotateX(Math.PI); geo.computeVertexNormals();
    return geo;
  }
  const texL = new THREE.TextureLoader(); const texCache = {};
  function reliefTex(file, srgb) {
    if (texCache[file]) return texCache[file];
    const t = texL.load(baseDir + 'pillars/relief/' + file);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    texCache[file] = t; return t;
  }

  const geos = [], mats = [], pillars = [], pickables = [];
  o.keys.forEach((kkey, i) => {
    const grp = new THREE.Group();
    // BODY
    const bodyGeo = bodyGeometry(PILLAR_SVG[kkey]); geos.push(bodyGeo);
    const bodyMat = new THREE.MeshPhysicalMaterial({ ...BASE, color: TINTS[i % TINTS.length], emissive: new THREE.Color(BASE.emissive),
      emissiveIntensity: 0.34, transparent: true, opacity: 0, depthWrite: true, side: THREE.DoubleSide });
    addRim(bodyMat); mats.push(bodyMat);
    const body = new THREE.Mesh(bodyGeo, bodyMat); body.renderOrder = 2; body.userData.i = i; grp.add(body); pickables.push(body);

    // RELIEF FACE (front + back share geometry + textures)
    const meta = RELIEF_META[kkey] || { cropW: 540, cropH: 460 };
    const fx = RELIEF_FX[kkey] || { disp: 0.15, norm: 1.15 };
    const fk = PILLAR_SIZE / Math.max(meta.cropW, meta.cropH);
    const faceGeo = new THREE.PlaneGeometry(meta.cropW * fk, meta.cropH * fk, FACE_SEG, FACE_SEG); geos.push(faceGeo);
    const faceMat = new THREE.MeshPhysicalMaterial({
      metalness: BASE.metalness, roughness: 0.13, envMapIntensity: BASE.envMapIntensity, clearcoat: 1.0, clearcoatRoughness: 0.05, flatShading: false,
      map: reliefTex(kkey + '_albedo.webp', true),
      normalMap: reliefTex(kkey + '_normal.webp', false), normalScale: new THREE.Vector2(fx.norm, fx.norm),
      displacementMap: isCoarse ? null : reliefTex(kkey + '_height.webp', false), displacementScale: isCoarse ? 0 : fx.disp,
      transparent: true, alphaTest: 0.4, opacity: 0, emissive: new THREE.Color(BASE.emissive), emissiveIntensity: 0.16, side: THREE.DoubleSide });
    addRim(faceMat); mats.push(faceMat);
    const front = new THREE.Mesh(faceGeo, faceMat); front.renderOrder = 3; front.position.z = PILLAR_DEPTH / 2 + 0.004; grp.add(front); pickables.push(front);
    const back = new THREE.Mesh(faceGeo, faceMat); back.renderOrder = 3; back.position.z = -(PILLAR_DEPTH / 2 + 0.004); back.rotation.y = Math.PI; grp.add(back); pickables.push(back);

    // aura
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xc8ff00, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    glow.position.set(0, 0, -0.05); glow.scale.set(2.0, 2.0, 1); glow.renderOrder = 1; grp.add(glow);

    const ang = (i / o.keys.length) * Math.PI * 2 - Math.PI / 2;
    const fused = new THREE.Vector3(Math.cos(ang) * 0.5, -Math.sin(ang) * 0.5, (i % 2 ? 0.22 : -0.22));
    const ring = o.layout === 'ring'
      ? new THREE.Vector3(Math.cos(ang) * o.ringRadius * 1.16, -Math.sin(ang) * o.ringRadius * 0.86, 0)
      : (() => { const col = i % o.cols, row = Math.floor(i / o.cols), rows = Math.ceil(o.keys.length / o.cols);
          return new THREE.Vector3((col - (o.cols - 1) / 2) * 1.95, ((rows - 1) / 2 - row) * 1.95, 0); })();
    grp.position.copy(fused);
    grp.userData = { i, fused, ring, glow, mat: [bodyMat, faceMat], prox: 0, sel: 0, phase: i * 1.7, spinRate: 0.16 + (i % 4) * 0.035 };
    root.add(grp); pillars.push(grp);
  });
  root.scale.setScalar(o.layout === 'ring' ? 0.92 : 0.86);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), o.bloom, 0.6, 0.62); composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uLo: { value: 0.05 }, uHi: { value: 0.14 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'precision highp float; varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uLo,uHi;\n' +
      'void main(){ vec4 c=texture2D(tDiffuse,vUv); float v=max(c.r,max(c.g,c.b)); float a=smoothstep(uLo,uHi,v); gl_FragColor=vec4(c.rgb*a,a); }',
  }));

  // pointer hover + click
  const ray = new THREE.Raycaster(); const ptr = new THREE.Vector2(-2, -2);
  let hovered = -1, selected = opts.initial != null ? opts.initial : -1;
  const onMove = (e) => { const r = container.getBoundingClientRect(); ptr.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1)); };
  const onLeave = () => ptr.set(-2, -2);
  const onClick = (e) => { const r = container.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
    if (hovered >= 0 && o.onSelect) o.onSelect(hovered); };
  container.style.pointerEvents = 'auto';
  container.addEventListener('pointermove', onMove, { passive: true });
  container.addEventListener('pointerleave', onLeave);
  container.addEventListener('click', onClick);

  function resize() {
    const w = container.clientWidth || 600, h = container.clientHeight || 500;
    renderer.setSize(w, h, false); composer.setSize(w, h); bloom.setSize(w, h);
    const baseZ = o.camZ != null ? o.camZ : (o.layout === 'ring' ? 9.4 : 8.6);
    camera.aspect = w / h; camera.position.z = baseZ / Math.min(camera.aspect, 1.4); camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  const clock = new THREE.Clock(); let raf = 0, vis = true, born = 0; const v = new THREE.Vector3();
  const io = new IntersectionObserver((es) => { vis = es[0].isIntersecting; }, { threshold: 0 }); io.observe(container);

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime; born += dt;
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(pickables, false);
    hovered = hit.length ? hit[0].object.userData.i : -1;
    // raycast hits faces (no .i) sometimes → walk to the body's i via the group
    if (hovered < 0 && hit.length) { let p = hit[0].object; while (p && p.userData.i == null) p = p.parent; hovered = p ? p.userData.i : -1; }
    container.style.cursor = hovered >= 0 ? 'pointer' : 'default';

    pillars.forEach((s) => {
      const u = s.userData;
      // entrance: fan out from centre into the ring (staggered), then hold
      const stag = clamp(born * 1.5 - u.i * 0.07, 0, 1);
      v.lerpVectors(u.fused, u.ring, easeOutQuart(stag));
      const isSel = (u.i === selected);
      u.sel += ((isSel ? 1 : 0) - u.sel) * (1 - Math.exp(-7 * dt));
      u.prox += (((u.i === hovered) ? 1 : 0) - u.prox) * (1 - Math.exp(-12 * dt));
      if (!reduceMotion) { v.y += Math.sin(t * 0.9 + u.phase) * 0.06 * (1 - u.sel * 0.7); v.x += Math.cos(t * 0.6 + u.phase) * 0.03 * (1 - u.sel); }
      s.position.copy(v);
      let sc = 1 + u.prox * 0.16 + u.sel * 0.3;
      if (!reduceMotion) sc *= 1 + Math.sin(t * 1.3 + u.phase) * 0.018;
      if (selected >= 0 && !isSel) sc *= 0.7;
      s.scale.setScalar(Math.max(0.001, sc));
      // each gem rocks on its own axes to reveal depth + facets (relief face stays toward you)
      if (!reduceMotion) {
        const amp = 0.34 + u.prox * 0.5;
        s.rotation.y = Math.sin(t * (0.5 + u.spinRate) + u.phase) * amp * (1 - u.sel) + Math.sin(t * 0.7 + u.phase) * 0.22 * u.sel;
        s.rotation.x = Math.sin(t * 0.6 + u.phase) * (0.12 + u.prox * 0.13) * (1 - u.sel * 0.5);
        s.rotation.z = Math.cos(t * 0.5 + u.phase) * 0.03 * (1 - u.sel);
      }
      const op = stag * (selected >= 0 && !isSel ? 0.32 : 1);
      u.mat.forEach((m) => { m.opacity = op; });
      u.glow.material.opacity = Math.min(0.5, 0.025 + u.prox * 0.24 + u.sel * 0.26) * stag;
      const gsc = 2.0 + u.prox * 0.55 + u.sel * 0.9; u.glow.scale.set(gsc, gsc, 1);
    });
    root.rotation.y = reduceMotion ? 0 : Math.sin(t * 0.2) * 0.05;
    centerGlow.material.opacity = 0.05 + (hovered >= 0 ? 0.03 : 0);
    bloom.strength = o.bloom + (hovered >= 0 || selected >= 0 ? 0.25 : 0);
    composer.render();
  }
  function loop() { if (vis && !document.hidden) frame(); raf = requestAnimationFrame(loop); }
  loop();

  return {
    setSelected(i) { selected = i; },
    destroy() {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      container.removeEventListener('pointermove', onMove); container.removeEventListener('pointerleave', onLeave); container.removeEventListener('click', onClick);
      geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose());
      Object.values(texCache).forEach((tx) => tx.dispose()); GLOW.dispose(); pmrem.dispose();
      renderer.forceContextLoss(); renderer.dispose(); canvas.remove();
    },
  };
}
