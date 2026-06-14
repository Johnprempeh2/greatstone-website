import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// The persistent stone "stage" as a React component. One fixed canvas behind the page.
// Demonstrates the WebGL lifecycle done right: the effect builds the scene, the cleanup
// calls renderer.forceContextLoss() BEFORE dispose() so the context never leaks across
// React mounts/unmounts (incl. StrictMode's double-invoke and SPA navigation).
const SLABS = { imageSize: [372, 526], slabs: [
  { centroid: [228.2, 109.0], poly: [[218,58],[228,58],[285,86],[304,150],[193,149],[182,142],[145,99],[160,84]] },
  { centroid: [200.4, 194.2], poly: [[137,127],[155,129],[194,172],[303,174],[323,237],[241,247],[79,195],[75,185],[81,174],[124,135]] },
  { centroid: [121.4, 254.6], poly: [[69,207],[257,266],[49,293],[52,232],[63,211]] },
  { centroid: [171.3, 323.6], poly: [[301,274],[304,274],[304,281],[298,375],[262,335],[162,339],[65,396],[39,307]] },
  { centroid: [182.3, 411.1], poly: [[248,353],[262,356],[292,391],[291,395],[264,432],[256,450],[243,456],[240,446],[183,478],[171,477],[125,457],[112,464],[61,413],[151,358]] },
]};

export default function StoneStage() {
  const ref = useRef(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
    camera.position.set(0, 0, 8.4);

    const pmrem = new THREE.PMREMGenerator(renderer);
    {
      const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#06140d'); gr.addColorStop(.45, '#16432f'); gr.addColorStop(.55, '#1d5a3e'); gr.addColorStop(1, '#04100a');
      g.fillStyle = gr; g.fillRect(0, 0, 512, 256); g.globalCompositeOperation = 'lighter';
      const s = (x, y, w, h, col, a) => { g.fillStyle = col; g.globalAlpha = a; g.fillRect(x, y, w, h); };
      s(40, 28, 360, 10, '#dfffe8', .55); s(120, 86, 300, 6, '#c8ff00', .38); s(20, 150, 430, 16, '#fff', .16); g.globalAlpha = 1;
      const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
      scene.environment = pmrem.fromEquirectangular(t).texture; t.dispose();
    }

    scene.add(new THREE.AmbientLight(0x141c17, 0.4));
    const key = new THREE.DirectionalLight(0xeaf5ec, 1.7); key.position.set(5, 8, 5); scene.add(key);
    const fill = new THREE.DirectionalLight(0x35584a, 0.7); fill.position.set(-5, -3, -4); scene.add(fill);
    const limeA = new THREE.PointLight(0xc8ff00, 2.6, 40, 2.0); limeA.position.set(7.5, -2.5, 8.5); scene.add(limeA);
    const limeB = new THREE.PointLight(0xc8ff00, 2.0, 40, 2.0); limeB.position.set(-8, 3.5, 7); scene.add(limeB);

    const IMG = SLABS.imageSize, CX = IMG[0] / 2, CY = IMG[1] / 2, SC = 1 / 95;
    const tints = [0x16432f, 0x113826, 0x1b5039, 0x0e3122, 0x154631];
    const RIM = new THREE.Color(0xc8ff00);
    const group = new THREE.Group(); scene.add(group);
    const slabs = [];
    const geos = [], mats = [];
    SLABS.slabs.forEach((sl, i) => {
      const shape = new THREE.Shape();
      sl.poly.forEach((p, j) => { const x = (p[0] - CX) * SC, y = -(p[1] - CY) * SC; j ? shape.lineTo(x, y) : shape.moveTo(x, y); });
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.34, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.045, bevelSegments: 2 });
      geo.computeVertexNormals(); geos.push(geo);
      const mat = new THREE.MeshPhysicalMaterial({ color: tints[i], metalness: 0.64, roughness: 0.05, envMapIntensity: 4.2, clearcoat: 1.0, clearcoatRoughness: 0.03, flatShading: true, emissive: 0x052314, emissiveIntensity: 0.5 });
      mat.onBeforeCompile = (sh) => { sh.uniforms.uRim = { value: RIM };
        sh.fragmentShader = 'uniform vec3 uRim;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n float _f=pow(1.0-clamp(dot(normalize(normal),normalize(vViewPosition)),0.0,1.0),1.7);\n totalEmissiveRadiance += uRim*_f*0.9;'); };
      mats.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      const dir = new THREE.Vector3((sl.centroid[0] - CX) * SC, -(sl.centroid[1] - CY) * SC, 0);
      slabs.push({ mesh, spreadDir: dir.clone().normalize(), baseRot: (i - 2) * 0.08 });
      group.add(mesh);
    });
    group.position.y = 0.2;

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.6, 0.6);
    composer.addPass(bloom); composer.addPass(new OutputPass());

    let pTarget = 0, p = 0, T = 0, raf = 0;
    const onScroll = () => { const max = document.body.scrollHeight - innerHeight; pTarget = max > 0 ? Math.min(Math.max(scrollY / max, 0), 1) : 0; };
    const onResize = () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); bloom.setSize(innerWidth, innerHeight); };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onResize, { passive: true });

    const fractureAt = (t) => t < 0.35 ? 0 : t < 0.72 ? (t - 0.35) / 0.37 : Math.max(0, 1 - (t - 0.72) / 0.24);
    function update(dt) {
      T += dt; p += (pTarget - p) * 0.07; const fr = fractureAt(p);
      group.rotation.y = T * 0.12 + p * 1.1;
      group.rotation.x = Math.sin(T * 0.3) * 0.06 + fr * 0.25;
      slabs.forEach((s, i) => { const amt = fr * (1.4 + 0.25 * i);
        s.mesh.position.copy(s.spreadDir).multiplyScalar(amt); s.mesh.position.z = fr * (i - 2) * 0.5;
        s.mesh.rotation.z = s.baseRot + fr * (i - 2) * 0.22; s.mesh.rotation.x = fr * 0.3 * Math.sin(i * 1.7); });
      const glow = 0.5 + fr * 0.9; limeA.intensity = 2.6 * glow; limeB.intensity = 2.0 * glow;
      bloom.strength = 0.55 + fr * 0.75; renderer.toneMappingExposure = 1.3 + fr * 0.25;
    }
    onResize(); onScroll(); update(0); composer.render();

    if (reduce) { pTarget = 0.5; update(0); composer.render(); }
    else {
      let last = performance.now();
      const loop = () => { const n = performance.now(); let dt = (n - last) / 1000; last = n; if (dt > 0.05) dt = 0.05; if (!document.hidden) { update(dt); composer.render(); } raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    }

    // THE LIFECYCLE FIX: free the WebGL context, not just GL objects.
    return () => {
      if (raf) cancelAnimationFrame(raf);
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onResize);
      geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose());
      pmrem.dispose();
      renderer.forceContextLoss();
      renderer.dispose();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, []);

  return (
    <>
      <div id="gs-stage" ref={ref} aria-hidden="true" />
      <div className="gs-scrim" aria-hidden="true" />
    </>
  );
}
