import { useReveal } from './reveal.js';
import { RichTextField } from '../cms/RichTextField.jsx';
import RichText from './RichText.jsx';
import { APPEARANCE_FIELD, APPEARANCE_DEFAULT } from '../cms/style-field.jsx';
import { appearanceClass } from '../lib/block-style.mjs';

// A plain editorial body-copy block: an optional kicker and a rich-text paragraph with inline bold / italic /
// underline + brand colour / highlight runs. The daily-driver text block, and the zero-migration proving
// ground for RichTextField (no existing page depends on it, so adopting it is risk-free). Existing blocks opt
// in to the same field one at a time. Body is rendered through the sanitising <RichText> chokepoint.
export function Prose({ kicker, body, align = 'left', width = 'reading', appearance }) {
  const ref = useReveal();
  return (
    <section ref={ref} className={'b-prose align-' + align + ' w-' + width}>
      <div className={('wrap b-prose-inner ' + appearanceClass(appearance)).trim()}>
        {kicker ? <p className="b-prose-kicker" data-reveal>{kicker}</p> : null}
        <RichText as="div" className="b-prose-body" html={body} data-reveal />
      </div>
    </section>
  );
}

export const css = `
.b-prose{padding:clamp(40px,7vh,84px) 0;position:relative}
.b-prose.align-center{text-align:center}
.b-prose-inner{max-width:760px}
.b-prose.w-narrow .b-prose-inner{max-width:600px}
.b-prose.w-wide .b-prose-inner{max-width:920px}
.b-prose.align-center .b-prose-inner{margin-inline:auto}
.b-prose-kicker{font-size:.72rem;font-weight:800;letter-spacing:.26em;text-transform:uppercase;color:var(--gs-accent);margin-bottom:14px}
.b-prose-body{color:var(--gs-text-muted);font-size:clamp(1.02rem,1.5vw,1.2rem);line-height:1.7;max-width:62ch}
.b-prose.align-center .b-prose-body{margin-inline:auto}
.b-prose-body strong{color:var(--gs-text);font-weight:700}
.b-prose-body a{color:var(--gs-accent);text-decoration:underline;text-underline-offset:2px}
`;

export const puck = {
  label: 'Prose',
  fields: {
    kicker: { type: 'text', label: 'Kicker (optional)' },
    body: { type: 'custom', label: 'Body', render: (props) => <RichTextField {...props} /> },
    align: { type: 'radio', label: 'Alignment', options: [
      { label: 'Left', value: 'left' }, { label: 'Centre', value: 'center' },
    ]},
    width: { type: 'radio', label: 'Width', options: [
      { label: 'Narrow', value: 'narrow' }, { label: 'Reading', value: 'reading' }, { label: 'Wide', value: 'wide' },
    ]},
    appearance: APPEARANCE_FIELD,
  },
  defaultProps: {
    kicker: '',
    body: 'A paragraph of body copy. Select any phrase and make it <strong>bold</strong>, italic, or give it a <span class="gs-rt-c-accent">colour</span>.',
    align: 'left', width: 'reading', appearance: APPEARANCE_DEFAULT,
  },
  render: (props) => <Prose {...props} />,
};

export default Prose;
