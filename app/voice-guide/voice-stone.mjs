// The guide's live stone: the site's own 3D mark (createStoneScene, the same one the home page draws) in a small
// canvas of its own, moved every frame by `pose(t)` (see stonePose in guide-client.mjs). Loaded only after the page
// has painted and is idle; draws only while the stone is on screen and the tab is in front.
import * as THREE from 'three';
import { createStoneScene } from '../../src/lib/stone-motion.mjs';

// Each slab moves out from the middle of the mark, alternately towards and away from the viewer.
const CENTRES = [[228.2, 109], [200.4, 194.2], [121.4, 254.6], [171.3, 323.6], [182.3, 411.1]];
const OUT = CENTRES.map(([x, y], index) => {
  const v = new THREE.Vector3((x - 186) / 86, (263 - y) / 86, 0).normalize();
  v.z = index % 2 ? -0.5 : 0.6;
  return v;
});
const ease = (from, to, rate, dt) => from + (to - from) * (1 - Math.exp(-rate * dt));

export function mountVoiceStone(host, pose) {
  const canvas = document.createElement('canvas');
  canvas.className = 'gsvg-stone-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.6;
  host.appendChild(canvas);
  const { scene, camera, stone, slabs, materials, edgeMaterial, rim, dispose } = createStoneScene(renderer);
  // Always fully opaque here (the home page fades its stone out as it scrolls; this one never fades).
  for (const material of materials) if (material !== edgeMaterial) { material.transparent = false; material.depthWrite = true; }

  const now = { scale: 1, spread: 0, glow: 0.3, turn: 0, lift: 0 };
  let visible = true;
  let frame = 0;
  let last = performance.now();
  const start = last;

  function resize() {
    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // The pill's tiny stone sits closer (it never opens far); the stage leaves room for the slabs to open.
    camera.position.z = (height < 60 ? 9.8 : 10.6) / Math.min(camera.aspect * 1.4, 1);
    camera.updateProjectionMatrix();
  }
  function draw(time) {
    const dt = Math.min((time - last) / 1000, 0.05);
    last = time;
    const target = pose((time - start) / 1000);
    now.scale = ease(now.scale, target.scale, 14, dt);
    now.spread = ease(now.spread, target.spread, 16, dt);
    now.glow = ease(now.glow, target.glow, 10, dt);
    now.lift = ease(now.lift, target.lift, 6, dt);
    // The shortest way round, so a long turn while thinking unwinds calmly afterwards.
    now.turn += Math.atan2(Math.sin(target.turn - now.turn), Math.cos(target.turn - now.turn)) * (1 - Math.exp(-4 * dt));
    stone.scale.setScalar(0.92 * now.scale);
    stone.rotation.y = now.turn;
    stone.position.y = now.lift;
    slabs.forEach((slab, index) => slab.position.copy(OUT[index]).multiplyScalar(now.spread));
    rim.intensity = 3 + now.glow * 3;
    for (const material of materials) if (material !== edgeMaterial) material.emissiveIntensity = 0.6 + now.glow * 0.5;
    renderer.render(scene, camera);
    host.classList.add('is-ready');
  }
  function loop(time) {
    frame = 0;
    if (!visible || document.hidden) return;
    draw(time);
    frame = requestAnimationFrame(loop);
  }
  const wake = () => {
    if (frame || !visible || document.hidden) return;
    last = performance.now();
    frame = requestAnimationFrame(loop);
  };
  const seen = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; wake(); });
  const sized = new ResizeObserver(() => { resize(); wake(); });
  seen.observe(host);
  sized.observe(host);
  document.addEventListener('visibilitychange', wake);
  resize();
  wake();

  return () => {
    cancelAnimationFrame(frame);
    seen.disconnect();
    sized.disconnect();
    document.removeEventListener('visibilitychange', wake);
    host.classList.remove('is-ready');
    dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  };
}
