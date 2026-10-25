'use client';

import { useEffect, useState } from 'react';
import { ContainedMotion, css as containedCss } from '../../../src/blocks/ContainedMotion.jsx';
import { StoneSymbol, css as heroCss } from '../../../src/blocks/Hero.jsx';
import { MotionBand, css as tideCss } from '../../../src/blocks/MotionBand.jsx';

export default function EffectPreview({ effect }) {
  const [mode, setMode] = useState('still');
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = window.matchMedia('(max-width: 760px)');
    const update = () => setMode(reduced.matches || mobile.matches || navigator.connection?.saveData ? 'still' : 'animate');
    update();
    reduced.addEventListener('change', update);
    mobile.addEventListener('change', update);
    return () => { reduced.removeEventListener('change', update); mobile.removeEventListener('change', update); };
  }, []);
  const motion = { effect: effect.id, intensity: 'subtle', speed: 'slow', colour: 'emerald' };
  return <><style>{containedCss + heroCss + tideCss + `
    html,body{margin:0;width:100%;height:100%;background:#0c0e0c;overflow:hidden}
    .gs-effect-preview{position:relative;isolation:isolate;width:100vw;height:100vh;min-height:120px;overflow:hidden;background:#0c0e0c}
    .gs-effect-preview .gs-contained-motion{mask-image:linear-gradient(90deg,transparent 0%,transparent 35%,#000 100%)}
    .gs-effect-preview .b-motion-band{height:100%}
    .gs-effect-preview .b-hero-stone{display:block;position:absolute;right:2%;top:0;height:100%;width:55%}
  `}</style><div className="gs-effect-preview" role="img" aria-label={`${effect.label} background effect`}>
    {effect.id.startsWith('bg.') ? <ContainedMotion effect={effect.id} intensity="subtle" speed="slow" colour="emerald" mode={mode} /> : null}
    {effect.id === 'hero.stone' ? <StoneSymbol enabled={mode === 'animate'} /> : null}
    {effect.id === 'band.tide' ? <MotionBand motion={motion} motionRuntime={mode} /> : null}
  </div></>;
}
