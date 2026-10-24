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
// The next section has frosted cards: fade the stone before it can colour their copy.
export const stoneExitOpacity = (progress) => {
  const t = clamp((progress - .45) / .3);
  return 1 - t * t * (3 - 2 * t);
};
export const stoneSlabOffset = (index, progress) => ({
  x: (index - 2) * .32 * progress,
  y: -(2.4 + index * .65) * progress,
  z: (index % 2 ? -.35 : .35) * progress,
});
// Keep the sinking slabs drawable to the viewport edge, but stop once the
// hero has travelled one full host height above it.
export const stoneExitVisible = (box, height, progress) =>
  progress > 0 && box.top < height && box.bottom > -box.height;
export const stoneExitRoom = (box, height, progress) =>
  stoneExitVisible(box, height, progress) ? Math.max(0, height - box.bottom) : 0;
export function stoneViewport(box, width, height, exitRoom) {
  const left = Math.max(0, Math.floor(box.left));
  const right = Math.min(width, Math.ceil(box.right));
  const bottom = Math.max(0, Math.floor(height - box.bottom - exitRoom));
  const top = Math.min(height, Math.ceil(height - box.top));
  if (left >= right || bottom >= top) return null;
  return {
    viewport: [box.left, height - box.bottom - exitRoom, box.width, box.height + exitRoom],
    scissor: [left, bottom, right - left, top - bottom],
  };
}

let shared;

function makeShared() {
  const canvas = document.createElement('canvas');
  canvas.className = 'gs-stone-layer';
  canvas.setAttribute('aria-hidden', 'true');
  // Keep the canvas in the public page's stacking context. The following block's
  // z-index can then cover slabs as they pass beneath its cards.
  (document.querySelector('.gs-public') || document.body).appendChild(canvas);
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
  // One environment map gives the cut faces the old emerald depth without a bloom pass.
  const environmentCanvas = document.createElement('canvas');
  environmentCanvas.width = 512;
  environmentCanvas.height = 256;
  const paint = environmentCanvas.getContext('2d');
  const ramp = paint.createLinearGradient(0, 0, 0, 256);
  for (const [stop, color] of [[0, '#06140d'], [.45, '#16432f'], [.55, '#1d5a3e'], [1, '#04100a']]) ramp.addColorStop(stop, color);
  paint.fillStyle = ramp;
  paint.fillRect(0, 0, 512, 256);
  paint.globalCompositeOperation = 'lighter';
  for (const [x, y, w, h, color, alpha] of [[40, 28, 360, 10, '#dfffe8', .55], [120, 86, 300, 6, '#c8ff00', .38], [20, 150, 430, 16, '#ffffff', .16]]) {
    paint.fillStyle = color;
    paint.globalAlpha = alpha;
    paint.fillRect(x, y, w, h);
  }
  const environmentTexture = new THREE.CanvasTexture(environmentCanvas);
  environmentTexture.mapping = THREE.EquirectangularReflectionMapping;
  environmentTexture.colorSpace = THREE.SRGBColorSpace;
  const environmentGenerator = new THREE.PMREMGenerator(renderer);
  const environment = environmentGenerator.fromEquirectangular(environmentTexture);
  scene.environment = environment.texture;
  environmentGenerator.dispose();
  environmentTexture.dispose();
  scene.add(new THREE.AmbientLight(0x96d6a6, 1.1));
  const key = new THREE.DirectionalLight(0xe9ffd9, 3);
  key.position.set(5, 8, 5);
  scene.add(key);
  const rim = new THREE.PointLight(0xc8ff00, 4.5, 30, 2);
  rim.position.set(-8, 3.5, 7);
  scene.add(rim);
  const glint = new THREE.PointLight(0xf0fff1, 7, 18, 2);
  glint.position.set(3, 7, 7);
  scene.add(glint);
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 50);
  camera.position.z = 9.5;
  const stone = new THREE.Group();
  scene.add(stone);
  const geometries = [];
  const materials = [];
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xc8ff00, transparent: true, opacity: .86 });
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
        color: tint, metalness: .32, roughness: .08, envMapIntensity: 2.8,
        transparent: true,
        clearcoat: 1, clearcoatRoughness: .03, flatShading: true,
        emissive: 0x0d3b26, emissiveIntensity: .8,
      });
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 gsRimColor;')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat gsRim = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 3.0);\ntotalEmissiveRadiance += gsRimColor * gsRim * 1.9;');
        shader.uniforms.gsRimColor = { value: new THREE.Color(0xc8ff00) };
      };
      materials.push(material);
      group.add(new THREE.Mesh(geometry, material));
      const edges = new THREE.EdgesGeometry(geometry, 25);
      geometries.push(edges);
      group.add(new THREE.LineSegments(edges, edgeMaterial));
    }
    stone.add(group);
    return group;
  });
  const glintGeometry = new THREE.SphereGeometry(.055, 8, 6);
  const glintMaterial = new THREE.MeshBasicMaterial({ color: 0xf1ffdf, transparent: true });
  geometries.push(glintGeometry);
  materials.push(glintMaterial);
  const glintMark = new THREE.Mesh(glintGeometry, glintMaterial);
  glintMark.position.set(.4, 2.12, .86);
  slabs[0].add(glintMark);
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
      const progress = entry.kind === 'accent' ? 0 : stoneProgress(box.top, box.height);
      const opacity = stoneExitOpacity(progress);
      const exiting = entry.kind === 'hero' && stoneExitVisible(box, height, progress);
      const exitRoom = exiting ? stoneExitRoom(box, height, progress) : 0;
      if ((!entry.visible && !exiting) || box.top >= height || box.right <= 0 || box.left >= width) continue;
      const clip = stoneViewport(box, width, height, exitRoom);
      if (!clip) continue;
      if (opacity === 0) continue;
      // Extend the hero's viewport and scissor together as it leaves the page.
      // Scaling the camera distance by the same ratio preserves the stone's size.
      renderer.setViewport(...clip.viewport);
      renderer.setScissor(...clip.scissor);
      camera.aspect = box.width / (box.height + exitRoom);
      camera.position.z = entry.kind === 'accent' ? 10.8 : (9.5 / Math.min(box.width / box.height, 1)) * (1 + exitRoom / box.height);
      camera.updateProjectionMatrix();
      const settle = entry.kind === 'accent' ? 1 : clamp(1 - Math.max(0, settlingUntil - now) / 650);
      stone.rotation.y = (1 - settle) * -.35 + progress * .28;
      stone.scale.setScalar(entry.kind === 'accent' ? .95 : .88);
      slabs.forEach((slab, index) => {
        const offset = stoneSlabOffset(index, progress);
        slab.position.set(offset.x, offset.y, offset.z);
        slab.rotation.z = (index - 2) * .12 * progress;
      });
      for (const material of materials) material.opacity = material === edgeMaterial ? .86 * opacity : opacity;
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
        environment.dispose();
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
