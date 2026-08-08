import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';
import { resolveLink, hasLink } from '../lib/link-resolver.mjs';
import { LinkField } from '../cms/LinkField.jsx';
import { RichTextField } from '../cms/RichTextField.jsx';
import EditableText from './EditableText.jsx'; // inline-on-canvas edit while editing, static RichText on the public site
import { CTA_STYLE_FIELD, CTA_STYLE_DEFAULT, HEADING_LEVEL_FIELD } from '../cms/style-field.jsx';
import { ctaStyleClass } from '../lib/cta-style.mjs';
import { headingTag, headingLevelNum } from '../lib/heading-level.mjs';

// A section that introduces itself and then sets out N equal panels, each able to carry its own
// contextual link.
//
// WHY THIS EXISTS. Three sections of the executive homepage share one shape: heading, an introductory
// narrative, then three or four panels of EQUAL weight, with a call to action beneath each. No existing
// block held all four parts. ServiceCards has no per-card link and wears marketing chrome; FeatureGrid
// hard-codes three columns, so four principles orphan into a 3+1 row; Values has no intro and no link;
// Columns is the only block with a per-item link but has no heading and no intro.
//
// The obvious workaround, Chapter for the head plus Columns for the panels, fails STRUCTURALLY rather
// than cosmetically: the two blocks' vertical padding sums to roughly 213px at desktop, identical to the
// gap between two unrelated sections, and the Section spacing control can only ever ADD margin. The
// introduction would read as a separate section from the panels it introduces, which is precisely what
// the brief rules out ("read as part of one coherent philosophy rather than four independent statements").
//
// Restraint is the brief here: no cards, no borders, no hover lift, no backdrop blur. Panels are
// separated by whitespace and a single lime rule, because "whitespace should dominate".
const COLS = { two: 2, three: 3, four: 4 };

export function Panels({
  id, puck, eyebrow, heading, intro, panelsLabel, coda,
  columns = 'three', panelStyle = 'ruled', items = [],
  ctaLabel, ctaHref = '#', ctaVariant = 'ghost', ctaStyle, headingLevel,
}) {
  const editing = puck && puck.isEditing;
  // A gated panel is one whose whole point is its destination (a contact route, a section that does not
  // exist yet). Hiding only its button would leave a heading and a paragraph with nothing to act on, which
  // reads worse than an absent panel. So the panel itself waits for a resolvable link. The editor still
  // sees it, otherwise the approved wording would be unreachable to the person who has to set the link.
  // Each entry keeps its ORIGINAL index: EditableText writes back through it, so filtering without
  // carrying it would make an inline edit land on the wrong panel once one is hidden.
  const shown = items
    .map((it, idx) => ({ it, idx }))
    .filter(({ it }) => editing || !it.gated || hasLink(it.ctaHref));
  const ref = useReveal([shown.length]);
  // Gating can leave fewer panels than the section declares columns for, and the grid would then hold its
  // authored track count: two panels stranded in the left half of a four-column row with a dead gap beside
  // them. The effective count follows what actually renders, so a hidden panel closes the row up instead.
  const effCols = Math.max(1, Math.min(COLS[columns] || 3, shown.length));
  const HeadTag = headingTag(headingLevel);
  // Panels sit one level below the section, derived rather than hard-coded, so dropping the section to
  // h3 does not leave the panels alongside it. The outline tooling reads the same helper, so the DOM and
  // the reported outline cannot drift apart.
  const PanelTag = 'h' + Math.min(4, headingLevelNum(headingLevel) + 1);

  return (
    <section ref={ref} className={`b-panels cols-${columns} style-${panelStyle}`}>
      <div className="wrap">
        <div className="b-panels-head">
          <EditableText editing={editing} id={id} field="eyebrow" value={eyebrow} as="span" className="b-chapter-name" singleLine placeholder="Eyebrow…" data-reveal />
          <HeadTag className="b-panels-h" data-reveal>
            <EditableText editing={editing} id={id} field="heading" value={heading} as="span" singleLine placeholder="Heading…" />
          </HeadTag>
          <EditableText editing={editing} id={id} field="intro" value={intro} as="p" className="b-panels-intro" placeholder="Introductory narrative…" data-reveal />
        </div>

        {panelsLabel ? <p className="b-panels-label" data-reveal>{panelsLabel}</p> : null}

        <div className="b-panels-grid" style={{ '--pcols': effCols }}>
          {shown.map(({ it, idx }, i) => (
            <div className="b-panel" key={idx} data-reveal style={{ transitionDelay: `${i * 70}ms` }}>
              {/* Numbered by DISPLAY position, not stored index, so a hidden panel never leaves a gap in
                  the sequence. The numeral is ordering, which the DOM order already gives a screen reader,
                  so it is hidden rather than read out as "zero one" ahead of every principle heading. */}
              {panelStyle === 'numbered'
                ? <span className="b-panel-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                : null}
              <span className="b-panel-rule" aria-hidden="true" />
              {it.label ? <span className="b-panel-label">{it.label}</span> : null}
              <EditableText editing={editing} id={id} arrayField="items" index={idx} field="title" value={it.title} as={PanelTag} className="b-panel-h" singleLine placeholder="Panel heading…" />
              <EditableText editing={editing} id={id} arrayField="items" index={idx} field="text" value={it.text} as="p" className="b-panel-body" placeholder="Panel body…" />
              {/* Renders only when the label AND a resolvable link both exist. That lets the seed carry
                  approved button wording verbatim, visible and editable in the studio, while a button
                  whose destination does not exist yet never reaches a visitor as a dead link. */}
              {it.ctaLabel && hasLink(it.ctaHref)
                ? <a className="b-cta ghost b-panel-cta" {...resolveLink(it.ctaHref)}>{it.ctaLabel}<Arrow /></a>
                : null}
            </div>
          ))}
        </div>

        <EditableText editing={editing} id={id} field="coda" value={coda} as="p" className="b-panels-coda" placeholder="Closing narrative (optional)…" data-reveal />

        {ctaLabel
          ? <a className={('b-cta b-panels-cta' + (ctaVariant === 'primary' ? '' : ' ghost') + ' ' + ctaStyleClass(ctaStyle)).trim()} {...resolveLink(ctaHref)} data-reveal>{ctaLabel}<Arrow /></a>
          : null}
      </div>
    </section>
  );
}

export const css = `
.b-panels{padding:clamp(72px,12vh,150px) 0;position:relative}
.b-panels-head{max-width:760px}
.b-panels-h{font-size:clamp(2rem,4.5vw,3.6rem);font-weight:900;line-height:1.05;letter-spacing:-.025em}
.b-panels-intro{margin-top:22px;color:var(--gs-muted);font-size:clamp(1.02rem,1.5vw,1.2rem);max-width:62ch;line-height:1.7}
.b-panels-label{margin-top:clamp(40px,6vw,72px);font-size:.72rem;font-weight:800;letter-spacing:.26em;
  text-transform:uppercase;color:var(--gs-faint)}
.b-panels-grid{display:grid;gap:clamp(28px,4vw,56px);margin-top:clamp(40px,6vw,72px);
  grid-template-columns:repeat(var(--pcols,3),minmax(0,1fr))}
.b-panels-label + .b-panels-grid{margin-top:clamp(24px,3vw,36px)}
.b-panels.cols-two{--pcols:2}.b-panels.cols-three{--pcols:3}.b-panels.cols-four{--pcols:4}
@media(max-width:1080px){.b-panels.cols-four .b-panels-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:900px){.b-panels.cols-three .b-panels-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:640px){.b-panels-grid{grid-template-columns:1fr}}
.b-panel{min-width:0;display:flex;flex-direction:column}
.b-panel-rule{display:block;width:28px;height:2px;background:var(--gs-accent);margin-bottom:22px}
.b-panels.style-plain .b-panel-rule{display:none}
/* Numbered progression. The brief asks each panel to carry a simple supporting motif, while the set must
   still read as ONE philosophy rather than four independent statements. Four different icons would pull
   the other way, so the motif is an ordinal: it differentiates each panel and sequences them at the same
   time. The rule then goes full width and fades out, so at desktop the four hairlines share a baseline and
   scan as a single line interrupted by the gaps. */
.b-panel-num{display:block;font-size:.82rem;font-weight:800;letter-spacing:.18em;color:var(--gs-accent);
  font-variant-numeric:tabular-nums;line-height:1;margin-bottom:12px}
.b-panels.style-numbered .b-panel-rule{width:100%;height:1px;margin-bottom:20px;
  background:linear-gradient(90deg,var(--gs-accent-mid,rgba(200,255,0,.4)),transparent)}
.b-panel-label{font-size:.7rem;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:var(--gs-faint);margin-bottom:10px}
.b-panel-h{font-size:clamp(1.18rem,1.9vw,1.45rem);font-weight:800;letter-spacing:-.015em;line-height:1.25}
.b-panel-body{margin-top:12px;color:var(--gs-muted);font-size:1rem;line-height:1.7}
.b-panel-body strong{color:var(--gs-text);font-weight:700}
.b-panel-cta{margin-top:auto;align-self:flex-start;transform:translateY(22px)}
.b-panels-coda{margin-top:clamp(36px,5vw,64px);color:var(--gs-muted);font-size:clamp(1.02rem,1.5vw,1.2rem);max-width:62ch;line-height:1.7}
.b-panels-cta{margin-top:clamp(28px,4vw,44px);display:inline-flex}
@media(prefers-reduced-motion:reduce){.b-panel-cta{transform:none;margin-top:22px}}
`;

const PANEL = (title, text) => ({ label: '', title, text, ctaLabel: '', ctaHref: '#' });

export const puck = {
  label: 'Panels (section + equal panels)',
  fields: {
    eyebrow: { type: 'custom', label: 'Eyebrow (optional)', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    heading: { type: 'custom', label: 'Heading', render: (props) => <RichTextField {...props} variant="heading" /> },
    intro: { type: 'custom', label: 'Introductory narrative', render: (props) => <RichTextField {...props} /> },
    panelsLabel: { type: 'text', label: 'Label above the panels (optional)' },
    columns: { type: 'radio', label: 'Panels per row', options: [{ label: 'Two', value: 'two' }, { label: 'Three', value: 'three' }, { label: 'Four', value: 'four' }] },
    panelStyle: { type: 'radio', label: 'Panel motif', options: [{ label: 'Plain', value: 'plain' }, { label: 'Lime rule', value: 'ruled' }, { label: 'Numbered', value: 'numbered' }] },
    coda: { type: 'custom', label: 'Closing narrative (optional)', render: (props) => <RichTextField {...props} /> },
    ctaLabel: { type: 'text', label: 'Section button label (optional)' },
    ctaHref: { type: 'custom', label: 'Section button link', render: (props) => <LinkField {...props} /> },
    ctaVariant: { type: 'radio', label: 'Button fill', options: [{ label: 'Ghost', value: 'ghost' }, { label: 'Primary (solid)', value: 'primary' }] },
    ctaStyle: CTA_STYLE_FIELD,
    headingLevel: HEADING_LEVEL_FIELD,
    // array field stays LAST (see memory "puck-slot-misdetection-inline-editing")
    items: {
      type: 'array', label: 'Panels',
      arrayFields: {
        label: { type: 'text', label: 'Panel label (optional)' },
        title: { type: 'custom', label: 'Panel heading', render: (props) => <RichTextField {...props} variant="heading" /> },
        text: { type: 'custom', label: 'Panel body', render: (props) => <RichTextField {...props} /> },
        ctaLabel: { type: 'text', label: 'Panel button label (optional)' },
        ctaHref: { type: 'custom', label: 'Panel button link', render: (props) => <LinkField {...props} /> },
        gated: { type: 'radio', label: 'Show this panel', options: [
          { label: 'Always', value: false }, { label: 'Only once its link is set', value: true },
        ]},
      },
      defaultItemProps: { label: '', title: 'Panel heading', text: 'What this panel is about.', ctaLabel: '', ctaHref: '#', gated: false },
      getItemSummary: (item, i) => item.title || ('Panel ' + (i + 1)),
      max: 4,
    },
  },
  defaultProps: {
    eyebrow: '', heading: 'Section heading', intro: 'The introductory narrative.',
    panelsLabel: '', columns: 'three', panelStyle: 'ruled', coda: '',
    ctaLabel: '', ctaHref: '#', ctaVariant: 'ghost',
    ctaStyle: CTA_STYLE_DEFAULT, headingLevel: 'h2',
    items: [
      PANEL('Panel one', 'What this panel is about.'),
      PANEL('Panel two', 'What this panel is about.'),
      PANEL('Panel three', 'What this panel is about.'),
    ],
  },
  render: (props) => <Panels {...props} />,
};

export default Panels;
