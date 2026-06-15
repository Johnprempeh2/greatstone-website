/* Greatstone 8-pillar explorer — the methodology brought into the studio as a real 3D element.
   Each pillar icon is extruded into an emerald gem (the emerald-relief-3d body) wearing the
   brand material + lime fresnel rim + bloom, arranged in a grid. Hover lifts and brightens a
   gem; clicking selects it (onSelect(index)). Reuses the proven stone scene scaffolding so the
   WebGL lifecycle (forceContextLoss on destroy) and the transparent alpha-key blend are sound. */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { PILLAR_SVG } from './pillar-svg.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const RIM = new THREE.Color(0xc8ff00);
const TINTS = [0x16432f, 0x1b5039, 0x113826, 0x154631, 0x0e3122, 0x1b5039, 0x123c2a, 0x17492f];

export function mountPillarExplorer(container, opts = {}) {
  const o = Object.assign({ envUrl: 'env-emerald.jpg', bloom: 0.7, exposure: 1.35, keys: Object.keys(PILLAR_SVG),
    cols: 4, onSelect: null }, opts);

  const canvas = document.createElement('canvas'); canvas.style.cssText = 'width:100%;height:100%;display:block';
  container.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  // skip three's dev-time shader-error read: some WebGL backends (incl. the headless preview)
  // return null from getProgramInfoLog(), and three calls .trim() on it. Off = no throw, no cost.
  renderer.debug.checkShaderErrors = false;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = o.exposure;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100); camera.position.set(0, 0, 8.6);

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

  function addRim(mat) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uRim = { value: RIM };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
        .replace('#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\nfloat _f=pow(1.0-clamp(dot(normalize(normal),normalize(vViewPosition)),0.0,1.0),1.7);\ntotalEmissiveRadiance += uRim*_f*0.85;');
    };
  }

  // build a gem from a pillar SVG: extrude its shapes, centre and normalise to ~1.5 units
  const loader = new SVGLoader();
  function gemGeometry(svg) {
    const shapes = [];
    loader.parse(svg).paths.forEach((p) => p.toShapes(true).forEach((s) => shapes.push(s)));
    const geo = new THREE.ExtrudeGeometry(shapes, { depth: 64, bevelEnabled: true, bevelThickness: 12, bevelSize: 9, bevelSegments: 2, curveSegments: 4 });
    geo.computeBoundingBox(); const bb = geo.boundingBox;
    const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2, cz = (bb.min.z + bb.max.z) / 2;
    geo.translate(-cx, -cy, -cz);
    const sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y;
    geo.scale(1.5 / Math.max(sx, sy), 1.5 / Math.max(sx, sy), 1.5 / Math.max(sx, sy));
    geo.computeVertexNormals();
    return geo;
  }

  const grid = new THREE.Group(); scene.add(grid);
  const cols = o.cols, rows = Math.ceil(o.keys.length / cols);
  const spanX = 1.95, spanY = 1.95;
  const geos = [], mats = [], gems = [];
  o.keys.forEach((kkey, i) => {
    const geo = gemGeometry(PILLAR_SVG[kkey]); geos.push(geo);
    const mat = new THREE.MeshPhysicalMaterial({ color: TINTS[i % TINTS.length], metalness: 0.62, roughness: 0.06, envMapIntensity: 3.8,
      clearcoat: 1.0, clearcoatRoughness: 0.04, flatShading: false, emissive: 0x052314, emissiveIntensity: 0.45 });
    addRim(mat); mats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    const col = i % cols, row = Math.floor(i / cols);
    const hx = (col - (cols - 1) / 2) * spanX, hy = ((rows - 1) / 2 - row) * spanY;
    mesh.position.set(hx, hy, 0);
    mesh.userData = { i, home: new THREE.Vector3(hx, hy, 0), lift: 0, spin: (i % 2 ? 1 : -1) * 0.15, phase: i * 0.7 };
    grid.add(mesh); gems.push(mesh);
  });
  // fit the whole grid into frame
  grid.scale.setScalar(rows > 1 ? 0.92 : 1);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), o.bloom, 0.6, 0.62); composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uLo: { value: 0.06 }, uHi: { value: 0.16 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'precision highp float; varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uLo,uHi;\n' +
      'void main(){ vec4 c=texture2D(tDiffuse,vUv); float v=max(c.r,max(c.g,c.b)); float a=smoothstep(uLo,uHi,v); gl_FragColor=vec4(c.rgb*a,a); }',
  }));

  // pointer + raycast for hover / select
  const ray = new THREE.Raycaster(); const ptr = new THREE.Vector2(-2, -2);
  let hovered = -1, selected = opts.initial != null ? opts.initial : -1;
  const onMove = (e) => { const r = container.getBoundingClientRect(); ptr.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1)); };
  const onLeave = () => ptr.set(-2, -2);
  const onClick = (e) => { const r = container.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
    if (hovered >= 0) { selected = hovered; if (o.onSelect) o.onSelect(selected); } };
  container.style.pointerEvents = 'auto';
  container.addEventListener('pointermove', onMove, { passive: true });
  container.addEventListener('pointerleave', onLeave);
  container.addEventListener('click', onClick);

  function resize() {
    const w = container.clientWidth || 600, h = container.clientHeight || 500;
    renderer.setSize(w, h, false); composer.setSize(w, h); bloom.setSize(w, h);
    camera.aspect = w / h; camera.position.z = (rows > 1 ? 8.6 : 7.0) / Math.min(camera.aspect, 1.2); camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  const clock = new THREE.Clock(); let raf = 0, vis = true;
  const io = new IntersectionObserver((es) => { vis = es[0].isIntersecting; }, { threshold: 0 }); io.observe(container);

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    // hover pick
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(gems, false);
    hovered = hit.length ? hit[0].object.userData.i : -1;
    container.style.cursor = hovered >= 0 ? 'pointer' : 'default';
    grid.rotation.y = Math.sin(t * 0.12) * 0.06;
    gems.forEach((m) => { const u = m.userData;
      const active = (u.i === hovered) || (u.i === selected);
      u.lift += ((active ? 1 : 0) - u.lift) * (1 - Math.exp(-8 * dt));
      m.position.set(u.home.x, u.home.y + (reduceMotion ? 0 : Math.sin(t * 0.6 + u.phase) * 0.04), u.home.z + u.lift * 0.6);
      m.rotation.y = (reduceMotion ? 0 : t * u.spin) + u.lift * 0.4;
      m.scale.setScalar(1 + u.lift * 0.1);
      m.material.emissiveIntensity = 0.45 + u.lift * 0.9;
    });
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
      geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); pmrem.dispose();
      renderer.forceContextLoss(); renderer.dispose(); canvas.remove();
    },
  };
}
