import * as THREE from 'three';
import { createStoneFrameScheduler } from './stone-frame.mjs';

// One renderer and scene serve every visible stone symbol. The old logo mount creates a
// renderer, post-processing chain and idle loop for each instance; this path draws on demand.
const OUTLINES = [
  [[218,58],[228,58],[285,86],[304,150],[193,149],[182,142],[145,99],[160,84]],
  [[137,127],[155,129],[194,172],[303,174],[323,237],[241,247],[79,195],[75,185],[81,174],[124,135]],
  [[69,207],[257,266],[49,293],[52,232],[63,211]],
  [[301,274],[304,274],[304,281],[298,375],[262,335],[162,339],[65,396],[39,307]],
  [[248,353],[262,356],[292,391],[291,395],[264,432],[256,450],[243,456],[240,446],[183,478],[171,477],[125,457],[112,464],[61,413],[151,358]],
];
const CENTRES = [[228.2,109],[200.4,194.2],[121.4,254.6],[171.3,323.6],[182.3,411.1]];
const clamp = (value) => Math.max(0, Math.min(1, value));
export const stoneProgress = (top, height) => clamp(-top / Math.max(height * .8, 1));
export const stoneSlabOffset = (index, progress) => ({
  x: (index - 2) * .19 * progress,
  y: -(1.4 + index * .35) * progress,
  z: (index % 2 ? -.35 : .35) * progress,
});

let shared;

function makeShared() {
  const canvas = document.createElement('canvas');
  canvas.className = 'gs-stone-layer';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (error) {
    canvas.remove();
    throw error;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.4;
  renderer.autoClear = false;
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xc3f2c8, 2.2));
  const key = new THREE.DirectionalLight(0xe9ffd9, 4);
  key.position.set(3, 6, 8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xc8ff00, 3);
  rim.position.set(-5, -2, 4);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 50);
  camera.position.z = 9.5;
  const stone = new THREE.Group();
  scene.add(stone);
  const geometries = [];
  const materials = [];
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xc8ff00, transparent: true, opacity: .54 });
  materials.push(edgeMaterial);
  const slabs = OUTLINES.map((outline, index) => {
    const group = new THREE.Group();
    const [cx, cy] = CENTRES[index];
    const tint = [0x16432f, 0x113826, 0x1b5039, 0x0e3122, 0x154631][index];
    for (const [step, scale] of [1, .72, .48].entries()) {
      const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(
        (cx + (x - cx) * scale - 186) / 86,
        (263 - cy - (y - cy) * scale) / 86,
      )));
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: [.28, .4, .5][step], bevelEnabled: true,
        bevelThickness: [.09, .07, .05][step], bevelSize: [.1, .07, .05][step],
        bevelSegments: 2, curveSegments: 3,
      });
      geometry.translate(0, 0, step * .2 - .14);
      geometries.push(geometry);
      const material = new THREE.MeshPhysicalMaterial({
        color: tint, metalness: .32, roughness: .13, clearcoat: 1,
        flatShading: true, emissive: 0x0c3921, emissiveIntensity: .55,
      });
      materials.push(material);
      group.add(new THREE.Mesh(geometry, material));
      const edges = new THREE.EdgesGeometry(geometry, 25);
      geometries.push(edges);
      group.add(new THREE.LineSegments(edges, edgeMaterial));
    }
    stone.add(group);
    return group;
  });
  const entries = new Set();
  let settlingUntil = 0;
  let frameCount = 0;
  const isStill = () => document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches ||
    matchMedia('(max-width: 760px)').matches || navigator.connection?.saveData ||
    (navigator.hardwareConcurrency <= 4 && navigator.deviceMemory <= 4);
  function draw(now) {
    if (isStill()) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);
    for (const entry of entries) {
      const box = entry.node.getBoundingClientRect();
      if (!entry.visible || box.bottom <= 0 || box.top >= height || box.right <= 0 || box.left >= width) continue;
      const x = Math.max(0, Math.floor(box.left));
      const y = Math.max(0, Math.floor(height - box.bottom));
      const w = Math.min(width - x, Math.ceil(box.width));
      const h = Math.min(height - y, Math.ceil(box.height));
      if (w <= 0 || h <= 0) continue;
      renderer.setViewport(x, y, w, h);
      renderer.setScissor(x, y, w, h);
      camera.aspect = w / h;
      camera.position.z = entry.kind === 'accent' ? 10.8 : 9.5 / Math.min(camera.aspect, 1);
      camera.updateProjectionMatrix();
      const progress = entry.kind === 'accent' ? 0 : stoneProgress(box.top, box.height);
      const settle = entry.kind === 'accent' ? 1 : clamp(1 - Math.max(0, settlingUntil - now) / 650);
      stone.rotation.y = (1 - settle) * -.35 + progress * .28;
      stone.scale.setScalar(entry.kind === 'accent' ? .95 : .88);
      slabs.forEach((slab, index) => {
        const offset = stoneSlabOffset(index, progress);
        slab.position.set(offset.x, offset.y, offset.z);
        slab.rotation.z = (index - 2) * .12 * progress;
      });
      renderer.render(scene, camera);
      frameCount++;
      entry.node.classList.add('is-ready');
    }
    if (now < settlingUntil && [...entries].some((entry) => entry.visible)) schedule();
  }
  const scheduler = createStoneFrameScheduler({ request: requestAnimationFrame, cancel: cancelAnimationFrame, draw, canDraw: () => !isStill() });
  function schedule() { scheduler.schedule(); }
  const onVisible = () => { if (isStill()) scheduler.stop(); else schedule(); };
  const onScroll = () => schedule();
  const onResize = () => schedule();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const phone = matchMedia('(max-width: 760px)');
  const observer = new IntersectionObserver((changes) => {
    for (const change of changes) {
      const entry = [...entries].find((item) => item.node === change.target);
      if (entry) entry.visible = change.isIntersecting;
    }
    schedule();
  });
  const resize = new ResizeObserver(schedule);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  motion.addEventListener('change', onVisible);
  phone.addEventListener('change', onVisible);
  return {
    add(node, kind) {
      const entry = { node, kind, visible: false };
      entries.add(entry);
      observer.observe(node);
      resize.observe(node);
      settlingUntil = performance.now() + 650;
      schedule();
      return () => {
        entries.delete(entry);
        observer.unobserve(node);
        resize.unobserve(node);
        node.classList.remove('is-ready');
        if (entries.size) { schedule(); return; }
        scheduler.stop();
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onResize);
        motion.removeEventListener('change', onVisible);
        phone.removeEventListener('change', onVisible);
        observer.disconnect();
        resize.disconnect();
        geometries.forEach((geometry) => geometry.dispose());
        materials.forEach((material) => material.dispose());
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
        shared = undefined;
      };
    },
    stats: () => ({ contexts: 1, symbols: entries.size, frames: frameCount, pending: scheduler.pending() }),
  };
}

export function mountStoneSymbol(node, kind = 'hero') {
  if (!shared) shared = makeShared();
  return shared.add(node, kind);
}

export function stoneMotionStats() {
  return shared?.stats() ?? { contexts: 0, symbols: 0, frames: 0, pending: false };
}
