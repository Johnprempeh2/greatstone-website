import { useEffect, useRef } from 'react';
import { motionBudget } from '../../next-proof/motion-runtime.mjs';

// A copy-free divider. The still is present before WebGL loads and on phones.
export function MotionBand({ motion, motionRuntime = 'still' }) {
  const host = useRef(null);
  const budget = motionBudget(motion?.intensity);
  useEffect(() => {
    if (motion?.effect !== 'band.tide' || motionRuntime !== 'animate' || !host.current) return undefined;
    let destroyed = false;
    let tide;
    import('../lib/tide-gl.js').then(({ mountGreatstoneTide }) => {
      if (!destroyed && host.current) tide = mountGreatstoneTide(host.current, { view: 'calm', speed: .36, swell: .6, dpr: 1.5 });
    }).catch(() => {}); // The still remains if WebGL is unavailable.
    return () => { destroyed = true; tide?.destroy(); };
  }, [motion?.effect, motionRuntime]);
  if (!motion || motion.effect === 'none' || motion.intensity === 'off') return null;
  return <div className="b-motion-band" aria-hidden="true"><div ref={host} className="td-tide td-tide-calm" style={{ opacity: .65 + .35 * budget.alphaScale }} /></div>;
}

export const css = `
.b-motion-band{position:relative;height:210px;overflow:hidden;isolation:isolate;background:#07120e url('/motion/tide-still.png') center/cover no-repeat;pointer-events:none;
  mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)}
.b-motion-band>.td-tide{position:absolute;inset:0}
@media(max-width:760px){.b-motion-band{height:150px}}
@media(prefers-reduced-motion:reduce){.b-motion-band>.td-tide{display:none}}
`;

export const puck = { label: 'Tide divider', fields: {}, defaultProps: {}, render: (props) => <MotionBand {...props} /> };
