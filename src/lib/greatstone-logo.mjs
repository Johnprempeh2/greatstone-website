/* Greatstone animated stone — ES module. Page must provide the three.js importmap. */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/* the five traced slab outlines of the Greatstone "O/G" mark */
const SLABS = {"imageSize":[372,526],"slabs":[
  {"centroid":[228.2,109.0],"poly":[[218,58],[228,58],[285,86],[304,150],[193,149],[182,142],[145,99],[160,84]]},
  {"centroid":[200.4,194.2],"poly":[[137,127],[155,129],[194,172],[303,174],[323,237],[241,247],[79,195],[75,185],[81,174],[124,135]]},
  {"centroid":[121.4,254.6],"poly":[[69,207],[257,266],[49,293],[52,232],[63,211]]},
  {"centroid":[171.3,323.6],"poly":[[301,274],[304,274],[304,281],[298,375],[262,335],[162,339],[65,396],[39,307]]},
  {"centroid":[182.3,411.1],"poly":[[248,353],[262,356],[292,391],[291,395],[264,432],[256,450],[243,456],[240,446],[183,478],[171,477],[125,457],[112,464],[61,413],[151,358]]}
]};
const clamp = (v,a,b)=>Math.min(b,Math.max(a,v));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarsePointer = matchMedia('(hover:none),(pointer:coarse)').matches; // phones/tablets: render fewer pixels

export function mountGreatstoneLogo(container, opts = {}) {
  const o = Object.assign({ envUrl:'env-emerald.jpg', bloom:0.52, exposure:1.4, dpr:2, samples:4,
    transparent:true, proxRadius:0.55, spreadLocal:0.4, idle:true, autoTurn:false,
    keyLo:0.10, keyHi:0.20 }, opts);   /* alpha-key thresholds: near-black empty + faint bloom halo → transparent; mark stays */

  const canvas = document.createElement('canvas'); canvas.style.cssText='width:100%;height:100%;display:block';
  container.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:o.transparent, powerPreference:'high-performance' });
  renderer.debug.checkShaderErrors = false;   // some backends return null from getProgramInfoLog(); three .trim()s it
  renderer.setPixelRatio(Math.min(devicePixelRatio, coarsePointer ? 2 : o.dpr)); // clamp DPR on mobile (MSAA below carries edge quality)
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = o.exposure;

  const scene = new THREE.Scene();
  if (!o.transparent) scene.background = new THREE.Color(0x0f1a14);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100); camera.position.set(0,0,9.5);

  /* env: procedural emerald immediately, then upgrade to the exact env-emerald.jpg if available */
  const pmrem = new THREE.PMREMGenerator(renderer);
  function proceduralEnv(){const c=document.createElement('canvas');c.width=512;c.height=256;const g=c.getContext('2d');
    const gr=g.createLinearGradient(0,0,0,256);gr.addColorStop(0,'#06140d');gr.addColorStop(.45,'#16432f');gr.addColorStop(.55,'#1d5a3e');gr.addColorStop(1,'#04100a');
    g.fillStyle=gr;g.fillRect(0,0,512,256);g.globalCompositeOperation='lighter';
    const s=(x,y,w,h,col,a)=>{g.fillStyle=col;g.globalAlpha=a;g.fillRect(x,y,w,h)};
    s(40,28,360,10,'#dfffe8',.55);s(120,86,300,6,'#c8ff00',.38);s(20,150,430,16,'#fff',.16);g.globalAlpha=1;
    const t=new THREE.CanvasTexture(c);t.mapping=THREE.EquirectangularReflectionMapping;t.colorSpace=THREE.SRGBColorSpace;return t;}
  scene.environment = pmrem.fromEquirectangular(proceduralEnv()).texture;
  if (o.envUrl) new THREE.TextureLoader().load(o.envUrl, tex => {
    tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.SRGBColorSpace;
    scene.environment = pmrem.fromEquirectangular(tex).texture;
  }, undefined, () => {/* keep procedural on failure */});

  scene.add(new THREE.AmbientLight(0x141c17, 0.35));
  const key = new THREE.DirectionalLight(0xeaf5ec, 1.7); key.position.set(5,8,5); scene.add(key);
  const fill = new THREE.DirectionalLight(0x35584a, 0.7); fill.position.set(-5,-3,-4); scene.add(fill);
  const limeA = new THREE.PointLight(0xc8ff00, 3.0, 30, 2.0); limeA.position.set(7.5,-2.5,8.5); scene.add(limeA);
  const limeB = new THREE.PointLight(0xc8ff00, 2.3, 30, 2.0); limeB.position.set(-8,3.5,7); scene.add(limeB);
  const cursorLight = new THREE.PointLight(0xc8ff00, 0, 9, 2.0); cursorLight.position.set(0,0,4.5); scene.add(cursorLight);

  /* material: Obsidian-Lime emerald + fresnel lime rim (RIM_POW 1.7) */
  const RIM = new THREE.Color(0xc8ff00);
  const baseMat = { metalness:0.64, roughness:0.05, envMapIntensity:4.2, clearcoat:1.0,
    clearcoatRoughness:0.03, flatShading:true, emissive:0x052314, emissiveIntensity:0.5 };
  const tints = [0x16432f, 0x113826, 0x1b5039, 0x0e3122, 0x154631];
  function addRim(mat){ mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRimColor={value:RIM}; sh.uniforms.uRimPow={value:1.7};
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>','#include <common>\nuniform vec3 uRimColor;\nuniform float uRimPow;')
      .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\nfloat gsF=pow(1.0-abs(dot(normalize(vViewPosition),normal)),3.0);\ntotalEmissiveRadiance+=uRimColor*gsF*uRimPow;');
  }; mat.needsUpdate=true; }

  /* geometry: terraced slabs (the cut-emerald stack) */
  const S = 1/86, [imgW,imgH]=SLABS.imageSize, cx=imgW/2, cy=imgH/2;
  const STEPS=[{scale:1.0,half:0.18,bevelT:0.11,bevelS:0.13},{scale:0.72,half:0.30,bevelT:0.075,bevelS:0.075},{scale:0.48,half:0.40,bevelT:0.055,bevelS:0.055}];
  const zStack=[0.55,-0.45,0.62,-0.5,0.48], slabLambda=[3.6,3.3,3.0,2.7,2.4], slabAmp=[1.15,1.05,1.0,0.92,0.85];
  function slabGroup(slab, material){
    const base = slab.poly.map(([x,y])=>new THREE.Vector2((x-slab.centroid[0])*S,(slab.centroid[1]-y)*S));
    const g=new THREE.Group();
    STEPS.forEach(st=>{ const pts=base.map(p=>p.clone().multiplyScalar(st.scale));
      const depth=Math.max(0.02, st.half*2-st.bevelT*2);
      const geo=new THREE.ExtrudeGeometry(new THREE.Shape(pts),{depth,bevelEnabled:true,bevelThickness:st.bevelT,bevelSize:st.bevelS,bevelSegments:2,curveSegments:3});
      geo.translate(0,0,-depth/2); g.add(new THREE.Mesh(geo,material)); });
    return g;
  }
  const stone = new THREE.Group(); stone.scale.setScalar(0.88); scene.add(stone);
  const slabs = SLABS.slabs.map((slab,i)=>{
    const m=new THREE.MeshPhysicalMaterial({...baseMat, color:tints[i], emissive:new THREE.Color(baseMat.emissive)}); addRim(m);
    const g=slabGroup(slab,m);
    const base=new THREE.Vector3((slab.centroid[0]-cx)*S,(cy-slab.centroid[1])*S,0); g.position.copy(base);
    const dir=base.clone(); dir.z=0; dir.normalize(); dir.z=zStack[i];   /* push direction: radial + depth */
    g.userData={ base, dir, lambda:slabLambda[i], amp:slabAmp[i], phase:i*1.7, prox:0, tilt:new THREE.Vector2(0,0) };
    stone.add(g); return g;
  });

  /* post: bloom (no grade — transparent overlay must stay clean) */
  /* MSAA: EffectComposer's default render target is NOT multisampled, so the renderer's antialias flag
     never takes effect — the mark's bevelled edges render jagged, and that aliasing crawls every frame
     as the stone turns. On mobile (DPR clamped + ~3x physical density) it reads as flicker + poor
     quality. A multisampled target antialiases the edges; the resolved (smooth) image also feeds the
     alpha-key pass below, so the transparency edge stops popping too. setSize() resizes it on mount. */
  const _msaaRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: o.samples });
  const composer=new EffectComposer(renderer, _msaaRT); composer.addPass(new RenderPass(scene,camera));
  const bloom=new UnrealBloomPass(new THREE.Vector2(1,1), o.bloom, 0.6, 0.66); composer.addPass(bloom); composer.addPass(new OutputPass());
  /* TRANSPARENT BLEND: the bloom chain forces an opaque (black) frame even on an alpha canvas. Final
     pass re-keys the canvas alpha from pixel brightness — the near-black empty + the faint bloom halo
     go transparent, the emerald mark + lime glow stay — and outputs PREMULTIPLIED rgb so soft edges
     don't wash out. Result: the symbol blends into any background instead of sitting in a box. */
  const sceneRT = null;   /* (unused; kept so resize/frame guards no-op) */
  if (o.transparent) {
    renderer.setClearColor(0x000000, 0);
    composer.addPass(new ShaderPass({
      uniforms: { tDiffuse:{value:null}, uLo:{value:o.keyLo}, uHi:{value:o.keyHi} },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'precision highp float; varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uLo,uHi;\n' +
        'void main(){ vec4 c=texture2D(tDiffuse,vUv); float v=max(c.r,max(c.g,c.b));\n' +
        '  float a=smoothstep(uLo,uHi,v); gl_FragColor=vec4(c.rgb*a, a); }',   /* premultiplied → clean blend */
    }));
  }

  /* pointer — measured RELATIVE TO THE CONTAINER so the proximity aligns with the mark */
  const mouseT=new THREE.Vector2(0,0), mouseS=new THREE.Vector2(0,0), cursorN=new THREE.Vector2(0,0);
  let inside=false;
  const _onPointerMove = e=>{ if(!visible || document.hidden) return; /* skip layout reads when faded out/offscreen */
    const r=container.getBoundingClientRect();
    mouseT.set((e.clientX-r.left)/r.width*2-1, (e.clientY-r.top)/r.height*2-1); cursorN.set(mouseT.x,-mouseT.y); inside=true; };
  const _onPointerLeave = ()=>{ inside=false; };
  /* listen on WINDOW so the stone responds to the cursor even as a pointer-events:none background */
  window.addEventListener('pointermove', _onPointerMove, {passive:true});
  window.addEventListener('blur', _onPointerLeave);

  const _dbs=new THREE.Vector2();
  let ready=false;
  function resize(){ const w=container.clientWidth||400, h=container.clientHeight||400;
    renderer.setSize(w,h,false); composer.setSize(w,h); bloom.setSize(w,h);
    if (sceneRT){ renderer.getDrawingBufferSize(_dbs); sceneRT.setSize(_dbs.x, _dbs.y); }
    camera.aspect=w/h; camera.position.z = 9.5 / Math.min(camera.aspect,1); camera.updateProjectionMatrix();
    if(ready) frame(); }
  const ro=new ResizeObserver(resize); ro.observe(container); resize();

  const clock=new THREE.Clock(); const tmpV=new THREE.Vector3(); let raf=0, visible=true, active=true;
  let scrollT=0, scrollS=0;   /* scroll progress 0..1 (target + smoothed) drives the fracture */
  const io=new IntersectionObserver(es=>{visible=es[0].isIntersecting;},{threshold:0}); io.observe(container);

  function frame(){
    const dt=Math.min(clock.getDelta(),0.05), t=clock.elapsedTime;
    mouseS.x += (mouseT.x-mouseS.x)*(1-Math.exp(-3*dt)); mouseS.y += (mouseT.y-mouseS.y)*(1-Math.exp(-3*dt));
    scrollS += (scrollT-scrollS)*(1-Math.exp(-4*dt));
    let ry=0, rx=0, py=0;
    if (o.idle && !reduceMotion){
      ry = Math.sin(t*0.1)*0.05 + (o.autoTurn ? t*0.12 : 0);
      rx = Math.sin(t*0.13)*0.02;
      py = Math.sin(t*0.24)*0.06;
    } else if (o.autoTurn && !reduceMotion){ ry = t*0.12; }
    stone.rotation.y = ry + scrollS*1.5;   /* scroll turns the stone */
    stone.rotation.x = rx + scrollS*0.18;
    stone.position.y = py;
    stone.updateMatrixWorld(true);
    const aspect = (container.clientWidth||1)/(container.clientHeight||1);
    let hoverAny=0;
    slabs.forEach((g,i)=>{ const u=g.userData;
      const ex=u.base.x, ey=u.base.y, ez=u.base.z;
      tmpV.set(ex,ey,ez).applyMatrix4(stone.matrixWorld).project(camera); /* slab → screen */
      const dx=(tmpV.x-cursorN.x)*aspect, dy=(tmpV.y-cursorN.y);
      let tp = inside ? clamp(1-Math.hypot(dx,dy)/o.proxRadius,0,1) : 0; tp=tp*tp*(3-2*tp);
      u.prox += (tp-u.prox)*(1-Math.exp(-(u.lambda+1.5)*dt));
      hoverAny=Math.max(hoverAny,u.prox);
      const hs=u.prox*o.spreadLocal;
      const ss=scrollS*(0.8+0.24*i);                                      /* scroll fractures the stack apart, staggered */
      g.position.set(ex+u.dir.x*(hs+ss), ey+u.dir.y*(hs+ss), ez+u.dir.z*(hs+ss));
      if (!reduceMotion) g.position.y += Math.sin(t*0.5+u.phase)*0.025*(0.4+u.prox);
      const k=1-Math.exp(-u.lambda*dt);
      u.tilt.x += (mouseS.y-u.tilt.x)*k; u.tilt.y += (mouseS.x-u.tilt.y)*k;
      g.rotation.set(u.tilt.x*0.06*u.amp*u.prox, u.tilt.y*0.06*u.amp*u.prox, scrollS*(i-2)*0.22);
    });
    bloom.strength = o.bloom + scrollS*0.28; renderer.toneMappingExposure = o.exposure + scrollS*0.22;
    cursorLight.intensity = hoverAny*1.3; cursorLight.position.set(mouseS.x*5.5, -mouseS.y*4.2, 4.5);
    if (sceneRT){ renderer.setRenderTarget(sceneRT); renderer.clear(); renderer.render(scene, camera); renderer.setRenderTarget(null); }
    composer.render();
  }
  // render only when on-screen, the tab is foreground, AND this layer is contributing (a faded-out
  // scene in a multi-scene track stops rendering — it's invisible). rAF keeps spinning (it's cheap);
  // only the expensive frame() is gated. dt is capped in frame(), so resuming never jumps.
  function loop(){ if(visible && active && !document.hidden) frame(); raf=requestAnimationFrame(loop); }
  ready=true; loop();
  return {
    setClimb(p){ scrollT = clamp(p,0,1); },   /* Stage drives this from scroll position */
    setScroll(p){ scrollT = clamp(p,0,1); },
    setActive(v){ active = v !== false; },    /* Stage pauses faded-out layers (opacity ~0) */
    destroy(){ cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      removeEventListener('pointermove', _onPointerMove); removeEventListener('blur', _onPointerLeave);
      composer.dispose(); renderer.forceContextLoss(); renderer.dispose(); pmrem.dispose(); canvas.remove(); } };
}
