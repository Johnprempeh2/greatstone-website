import { useEffect, useRef } from 'react';

const isBackground = (effect) => /^bg\.(waves|stone|grid|haze|bedrock|ascent|datum|meridian|veil|orbit)$/.test(effect || '');
const isStudy = (effect) => /^bg\.(bedrock|ascent|datum|meridian|veil|orbit)$/.test(effect || '');

export function ContainedMotion({ effect, intensity, mode, speed = 'slow', colour = 'emerald' }) {
  const canvas = useRef(null);
  useEffect(() => {
    // The exported still is visible from first paint. Only the viewport winner
    // loads the drawing code after the shared load/idle gate opens.
    if (!isStudy(effect) || mode !== 'animate' || intensity === 'off' || !canvas.current) return undefined;
    let cancelled = false;
    let frame = 0;
    let resize;
    let painter;
    // The field is decorative. The block and its copy are present on the first paint.
    import('../lib/contained-effects.mjs').then(({ effectFrame }) => {
      if (cancelled || !canvas.current) return;
      painter = effectFrame;
      const node = canvas.current;
      const context = node.getContext('2d', { alpha: true });
      if (!context) return;
      const draw = (time = 0) => {
        if (cancelled) return;
        const box = node.getBoundingClientRect();
        const scale = Math.min(window.devicePixelRatio || 1, 1.5);
        const width = Math.max(1, Math.round(box.width * scale));
        const height = Math.max(1, Math.round(box.height * scale));
        if (node.width !== width || node.height !== height) { node.width = width; node.height = height; }
        context.setTransform(scale, 0, 0, scale, 0, 0);
        const light = document.documentElement.dataset.theme === 'light';
        painter(context, effect, box.width, box.height, time / 1000 * (speed === 'still' ? 0 : speed === 'slow' ? .5 : 1), { intensity, light, colour });
      };
      draw(24000);
      node.parentElement?.classList.add('is-ready');
      let last = 0;
      const tick = (time) => {
        if (time - last >= (intensity === 'full' ? 16 : 33)) { draw(time + 24000); last = time; }
        frame = requestAnimationFrame(tick);
      };
      if (speed !== 'still') frame = requestAnimationFrame(tick);
      resize = new ResizeObserver(() => draw(24000));
      resize.observe(node);
    }).catch(() => {}); // the box's base surface remains if canvas is unavailable
    return () => { cancelled = true; cancelAnimationFrame(frame); resize?.disconnect(); canvas.current?.parentElement?.classList.remove('is-ready'); painter = null; };
  }, [effect, intensity, mode, speed, colour]);
  if (!isBackground(effect) || intensity === 'off') return null;
  return <div className={`gs-contained-motion gs-contained-motion--${effect.slice(3)} gs-contained-motion--${intensity} gs-contained-motion--${colour}${mode === 'animate' && speed !== 'still' ? ` gs-contained-motion--moving gs-contained-motion--${speed}` : ''}`} aria-hidden="true">{isStudy(effect) ? <canvas ref={canvas} /> : null}</div>;
}

export const css = `
.gs-blk[data-motion-effect^="bg."]:not([data-motion-intensity="off"]){position:relative;isolation:isolate;overflow:hidden}
.gs-contained-motion{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;
  mask-image:linear-gradient(90deg,transparent 0%,transparent 48%,#000 82%)}
.gs-contained-motion--full{opacity:1}.gs-contained-motion--subtle{opacity:.7}
.gs-contained-motion--teal{filter:hue-rotate(24deg)}
.gs-contained-motion--waves{background:url('/motion/tide-still.png') center/cover no-repeat}
.gs-contained-motion--stone{background:url('/motion/stone-still.png') 90% center/auto 85% no-repeat}
.gs-contained-motion--grid{background-image:linear-gradient(rgba(78,205,196,.18) 1px,transparent 1px),linear-gradient(90deg,rgba(78,205,196,.18) 1px,transparent 1px);background-size:64px 64px}
.gs-contained-motion--haze{background:radial-gradient(ellipse at 85% 50%,rgba(27,80,57,.65),transparent 70%)}
.gs-contained-motion--moving.gs-contained-motion--waves{animation:gsWavesDrift var(--gs-motion-duration,28s) linear infinite alternate}
.gs-contained-motion--moving.gs-contained-motion--grid{animation:gsGridDrift var(--gs-motion-duration,28s) linear infinite}
.gs-contained-motion--moving.gs-contained-motion--haze,.gs-contained-motion--moving.gs-contained-motion--stone{animation:gsAmbientBreathe var(--gs-motion-duration,28s) ease-in-out infinite alternate}
.gs-contained-motion--slow{--gs-motion-duration:28s}.gs-contained-motion--normal{--gs-motion-duration:16s}
@keyframes gsWavesDrift{to{background-position:58% center}}
@keyframes gsGridDrift{to{background-position:64px 64px}}
@keyframes gsAmbientBreathe{to{opacity:.45}}
.gs-contained-motion canvas{display:block;width:100%;height:100%}
.gs-contained-motion.is-ready{background-image:none}
${['bedrock', 'ascent', 'datum', 'meridian', 'veil', 'orbit'].map((name) => `.gs-contained-motion--${name}{background:url('/motion/${name}-dark.webp') center/cover no-repeat}html[data-theme="light"] .gs-contained-motion--${name}{background-image:url('/motion/${name}-light.webp')}`).join('\n')}
.gs-blk[data-motion-effect^="bg."]:not([data-motion-intensity="off"])>:not(.gs-contained-motion):not(.gs-preview-pick),
.gs-blk.gs-sec-surface:not([data-motion-block^="TwoDoors"])>:not(.gs-contained-motion):not(.gs-preview-pick){position:relative;z-index:1;background-color:transparent!important;background-image:none!important}
.gs-blk[data-motion-effect^="bg."] .b-hero h1{text-shadow:none}
.gs-blk[data-divider="glow"]{position:relative;isolation:isolate}
.gs-blk[data-divider="glow"]::after{content:"";position:absolute;z-index:2;pointer-events:none;bottom:0;left:5%;right:5%;height:1px;background:linear-gradient(90deg,transparent,rgba(78,205,196,.55) 22%,rgba(200,255,0,.8) 50%,rgba(78,205,196,.55) 78%,transparent);box-shadow:0 4px 12px rgba(78,205,196,.26)}
.gs-blk[data-motion-effect^="bg."][data-motion-block="AiBaselineSurvey"] .gs-contained-motion{height:330px;mask-image:linear-gradient(90deg,transparent 0%,transparent 48%,#000 82%),linear-gradient(180deg,#000 0%,#000 55%,transparent 100%);mask-composite:intersect}
.gs-blk[data-motion-effect^="bg."][data-motion-block="DevTools"] .gs-contained-motion{height:520px}
.gs-blk[data-motion-effect="bg.meridian"] .gs-contained-motion{mask-image:linear-gradient(90deg,transparent 0%,transparent 48%,#000 82%),linear-gradient(180deg,#000 0%,#000 calc(100% - 140px),transparent 100%);mask-composite:intersect}
.gs-blk[data-motion-effect="bg.orbit"] .gs-contained-motion{height:330px}
@media(max-width:760px){.gs-contained-motion{mask-image:linear-gradient(90deg,transparent 0%,transparent 62%,#000 100%)}.gs-blk[data-motion-effect="bg.meridian"] .gs-contained-motion{mask-image:linear-gradient(180deg,#000 0%,#000 calc(100% - 90px),transparent 100%);opacity:.45}}
@media(prefers-reduced-motion:reduce){.gs-contained-motion--moving{animation:none!important}}
@media print{.gs-contained-motion{display:none}}
`;
