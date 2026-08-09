import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';
import { resolveLink, hasLink } from '../lib/link-resolver.mjs';
import { LinkField } from '../cms/LinkField.jsx';
import { RichTextField } from '../cms/RichTextField.jsx';
import { APPEARANCE_FIELD, APPEARANCE_DEFAULT, CTA_STYLE_FIELD, CTA_STYLE_DEFAULT } from '../cms/style-field.jsx';
import { appearanceClass } from '../lib/block-style.mjs';
import { ctaStyleClass } from '../lib/cta-style.mjs';
import RichText from './RichText.jsx';

// A statement band: display-scale sentences carrying no heading semantics.
//
// It exists because the homepage opening statement is three sentences long, and holding all three in
// the hero meant the hero WAS the phone screen (13 lines at 375px, 787px tall, nothing else visible).
// Splitting the triad across the fold keeps every approved word, in order, at one weight, while the
// hero gets back to a hook plus a button. The type scale here is deliberately identical to
// .b-hero.v-statement h1 so the sentences read as one continuous thought rather than two designs.
//
// The lines are <p>, not headings: the page already has its h1 in the hero, and promoting display
// copy to h2 would put 48px sentences above the real section headings in the outline.
export function Statement({ lines = [], align = 'left', ctaLabel, ctaHref = '#', ctaStyle, appearance }) {
  const ref = useReveal();
  const shown = lines.filter((l) => l && l.text);
  if (!shown.length) return null;
  return (
    <section ref={ref} className={`b-stmt align-${align}`}>
      <div className={('wrap b-stmt-inner ' + appearanceClass(appearance)).trim()}>
        {shown.map((l, i) => (
          <p key={i} className={'b-stmt-line' + (l.accent ? ' accent' : '')} data-reveal>
            <RichText html={l.text} />
          </p>
        ))}
        {ctaLabel && hasLink(ctaHref) ? (
          <a className={('b-cta b-stmt-cta ' + ctaStyleClass(ctaStyle)).trim()} {...resolveLink(ctaHref)} data-reveal>
            {ctaLabel}<Arrow />
          </a>
        ) : null}
      </div>
    </section>
  );
}

export const css = `
.b-stmt{padding:clamp(56px,9vh,104px) 0 clamp(72px,11vh,132px);position:relative;overflow-x:clip}
.b-stmt.align-center{text-align:center}
.b-stmt-inner{max-width:min(1240px,100%)}
.b-stmt.align-center .b-stmt-inner{margin-inline:auto}
/* Matched to .b-hero.v-statement h1 exactly (size, leading, tracking, balance). If that scale is ever
   retuned, retune this with it or the triad visibly changes voice halfway through. */
.b-stmt-line{font-weight:900;font-size:clamp(31px,4vw,48px);line-height:1.16;letter-spacing:-.018em;
  text-wrap:balance;color:var(--gs-text)}
.b-stmt-line + .b-stmt-line{margin-top:.28em}
.b-stmt-line.accent{color:var(--gs-accent)}
.b-stmt-cta{margin-top:clamp(30px,4.5vh,46px);display:inline-flex}
.b-stmt.align-center .b-stmt-cta{margin-inline:auto}

/* Phone scale, matched to the hero's mobile floor in Hero.jsx so the triad stays one voice. */
@media(max-width:640px){
  /* The hero above already reserves 68px below its button for the scroll cue, so a full top pad here
     stacked into ~120px of void on a phone. Trimmed: the fold still reads as a pause, not a gap. */
  .b-stmt{padding:clamp(20px,3vh,32px) 0 clamp(56px,8vh,88px)}
  .b-stmt-line{font-size:clamp(22px,5.4vw,27px);line-height:1.24;letter-spacing:-.01em;text-wrap:normal}
  .b-stmt-line + .b-stmt-line{margin-top:.4em}
}
`;

export const puck = {
  label: 'Statement (display sentences)',
  fields: {
    align: { type: 'radio', label: 'Alignment', options: [
      { label: 'Left', value: 'left' }, { label: 'Centre', value: 'center' },
    ]},
    ctaLabel: { type: 'text', label: 'Button label (optional)' },
    ctaHref: { type: 'custom', label: 'Button link', render: (props) => <LinkField {...props} /> },
    ctaStyle: CTA_STYLE_FIELD,
    appearance: APPEARANCE_FIELD,
    // array field stays LAST (see memory "puck-slot-misdetection-inline-editing")
    lines: {
      type: 'array', label: 'Sentences',
      arrayFields: {
        text: { type: 'custom', label: 'Sentence', render: (props) => <RichTextField {...props} variant="heading" /> },
        accent: { type: 'radio', label: 'Lime', options: [
          { label: 'No', value: false }, { label: 'Yes', value: true },
        ]},
      },
      defaultItemProps: { text: '', accent: false },
      getItemSummary: (item) => (item.text || 'Sentence').replace(/<[^>]*>/g, '').slice(0, 48),
      max: 6,
    },
  },
  defaultProps: {
    align: 'left', ctaLabel: '', ctaHref: '#', ctaStyle: CTA_STYLE_DEFAULT, appearance: APPEARANCE_DEFAULT,
    lines: [],
  },
  render: (props) => <Statement {...props} />,
};

export default Statement;
