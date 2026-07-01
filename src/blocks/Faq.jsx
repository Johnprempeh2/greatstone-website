import { useState, useId } from 'react';
import { useReveal } from './reveal.js';
import { ldScript } from '../lib/ld-json.mjs';
import { RichTextField } from '../cms/RichTextField.jsx';
import EditableText from './EditableText.jsx'; // inline-on-canvas edit while editing, static RichText on the public site
import { stripTags } from '../lib/richtext-normalise.mjs';

// FAQ: an accessible accordion that answers the objections a buyer raises before booking. Each row is
// a real disclosure (button aria-expanded → region), independently togg*able, keyboard + screen-reader
// sound, reduced-motion aware. Questions/answers are fully editable (Puck array field). The block also
// emits FAQPage JSON-LD built from the same items, so the answers earn rich results once the site is
// indexable (dormant under the prototype noindex; correct + ready for the domain cutover).
export function Faq({ id, puck, kicker, heading, intro, items = [], showSchema = true }) {
  const ref = useReveal([items.length]);
  const editing = puck && puck.isEditing;
  const [open, setOpen] = useState(() => new Set());
  const uid = useId();
  const toggle = (i) => setOpen((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const qa = items.filter((it) => it && it.q && it.a);
  // emit JSON-LD safely via ldScript (escapes <, >, & so a free-text answer can't break out of <script>)
  // emit FAQPage schema only when this is the canonical FAQ for the page (showSchema); a secondary
  // instance (e.g. a recap FAQ on the home page) suppresses it so two FAQPage blobs never compete.
  const schema = showSchema && qa.length
    ? ldScript({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: qa.map((it) => ({ '@type': 'Question', name: it.q, acceptedAnswer: { '@type': 'Answer', text: stripTags(it.a) } })) })
    : '';
  return (
    <section ref={ref} className="b-faq section--tight">
      <div className="wrap b-faq-wrap">
        <div className="b-faq-head" data-reveal>
          <EditableText editing={editing} id={id} field="kicker" value={kicker} as="span" className="kicker" singleLine placeholder="Kicker…" />
          <EditableText editing={editing} id={id} field="heading" value={heading} as="h2" className="h2 b-faq-h" singleLine placeholder="Heading…" />
          <EditableText editing={editing} id={id} field="intro" value={intro} as="p" className="b-faq-intro muted" placeholder="Intro…" />
        </div>
        <div className="b-faq-list" data-reveal>
          {items.map((it, i) => {
            const isOpen = open.has(i);
            return (
              <div className={'b-faq-item' + (isOpen ? ' is-open' : '')} key={i}>
                <h3 className="b-faq-qh">
                  <button type="button" className="b-faq-q" aria-expanded={isOpen} aria-controls={uid + 'a' + i} id={uid + 'q' + i} onClick={() => toggle(i)}>
                    <span>{it.q}</span>
                    <span className="b-faq-ico" aria-hidden="true" />
                  </button>
                </h3>
                {/* animated disclosure: the grid 0fr->1fr row + inner overflow:hidden gives a smooth
                    height transition with no JS measurement; `inert` (not `hidden`) keeps the collapsed
                    panel out of the focus order and a11y tree while still allowing the open animation. */}
                <div className="b-faq-a" id={uid + 'a' + i} role="region" aria-labelledby={uid + 'q' + i} inert={!isOpen ? '' : undefined}>
                  <div className="b-faq-a-inner"><EditableText editing={editing} id={id} arrayField="items" index={i} field="a" value={it.a} as="p" placeholder="Answer…" /></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {schema ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schema }} /> : null}
    </section>
  );
}

export const css = `
.b-faq{padding:clamp(56px,9vw,110px) 0;position:relative}
.b-faq-wrap{max-width:820px}
.b-faq-head{margin-bottom:clamp(22px,4vw,40px)}
.b-faq-h{font-size:clamp(1.5rem,3.4vw,2.4rem);font-weight:800;letter-spacing:-.02em;line-height:1.06;margin-top:.5rem}
.b-faq-intro{margin-top:.7rem;color:var(--gs-text-muted);max-width:60ch;line-height:1.7}
.b-faq-list{display:flex;flex-direction:column;gap:10px}
.b-faq-item{border:1px solid var(--gs-border-soft);border-radius:14px;background:rgba(255,255,255,.02);overflow:hidden;
  transition:border-color .25s var(--gs-ease),background .25s var(--gs-ease)}
.b-faq-item:hover{border-color:var(--gs-border)}
.b-faq-item.is-open{border-color:var(--gs-border);background:rgba(200,255,0,.03)}
.b-faq-qh{margin:0;font-size:inherit}
.b-faq-q{width:100%;display:flex;align-items:center;justify-content:space-between;gap:16px;text-align:left;cursor:pointer;
  background:none;border:0;color:var(--gs-text);font-family:inherit;font-size:clamp(1rem,1.5vw,1.1rem);font-weight:700;
  padding:clamp(16px,2.2vw,22px) clamp(18px,2.4vw,24px);line-height:1.4}
.b-faq-q:hover{color:var(--gs-accent)}
.b-faq-q:focus-visible{outline:2px solid var(--gs-accent);outline-offset:-3px;border-radius:14px}
.b-faq-ico{flex:0 0 auto;width:22px;height:22px;position:relative}
.b-faq-ico::before,.b-faq-ico::after{content:"";position:absolute;background:var(--gs-accent);border-radius:2px;
  transition:transform .3s var(--gs-ease),opacity .3s var(--gs-ease)}
.b-faq-ico::before{top:10px;left:3px;right:3px;height:2px}
.b-faq-ico::after{left:10px;top:3px;bottom:3px;width:2px}
.b-faq-item.is-open .b-faq-ico::after{transform:scaleY(0);opacity:0}
.b-faq-a{display:grid;grid-template-rows:0fr;transition:grid-template-rows .32s var(--gs-ease)}
.b-faq-item.is-open .b-faq-a{grid-template-rows:1fr}
.b-faq-a-inner{overflow:hidden}
.b-faq-a-inner p{margin:0;padding:0 clamp(18px,2.4vw,24px) clamp(18px,2.4vw,22px);color:var(--gs-text-muted);line-height:1.75;max-width:66ch}
@media (prefers-reduced-motion: reduce){.b-faq-item,.b-faq-a,.b-faq-ico::before,.b-faq-ico::after{transition:none}}
`;

export const puck = {
  label: 'FAQ (accordion)',
  fields: {
    kicker: { type: 'custom', label: 'Kicker', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    heading: { type: 'custom', label: 'Heading', render: (props) => <RichTextField {...props} variant="heading" /> },
    intro: { type: 'custom', label: 'Intro', render: (props) => <RichTextField {...props} /> },
    showSchema: { type: 'radio', label: 'FAQ rich-result schema (one per page)', options: [{ label: 'Emit', value: true }, { label: 'Suppress', value: false }] },
    // array field stays LAST — Puck mis-slots top-level custom fields (kicker/heading/intro) placed
    // before an array when another field follows it (see memory "puck-slot-misdetection-inline-editing")
    items: {
      type: 'array', label: 'Questions',
      arrayFields: {
        q: { type: 'text', label: 'Question' },
        a: { type: 'custom', label: 'Answer', render: (props) => <RichTextField {...props} /> },
      },
      defaultItemProps: { q: 'A question buyers ask?', a: 'A straight, concrete answer.' },
      getItemSummary: (it) => it.q || 'Question',
    },
  },
  defaultProps: {
    showSchema: true,
    kicker: 'Common questions',
    heading: 'The questions buyers ask first.',
    intro: 'Straight answers to what most teams want to know before they book. If yours is not here, the Diagnostic is the fastest way to get it.',
    items: [
      { q: 'What actually happens in a Diagnostic?', a: 'Thirty focused minutes where we map your week against the eight pillars and show you where the hours are draining. You leave with a clear read on what your week is quietly costing you and where we would start. No deck, no obligation.' },
      { q: 'Are you a software house or consultants?', a: 'Neither, exactly. We embed alongside your team and build the systems that fit how you actually run. Twenty years of doing the work, not advising from the outside.' },
      { q: 'How long before we see results?', a: 'The Diagnostic gives you a costed picture in the first session. Real change follows the work: we find the drains, build the fix, then stay embedded until the new way is the only way. Usually weeks, not quarters.' },
      { q: 'What about our data and security?', a: 'We work inside your stack and your controls, never around them. Access is least-privilege, scoped to the engagement, and removed when it ends. Security runs through the Technology and Data pillars of our assessment.' },
      { q: 'Do you replace our team?', a: 'No. We make your team faster. We hand back the hours lost to copy-paste, handoffs and waiting so your people spend their time on the work only they can do.' },
      { q: 'Is this just AI hype?', a: 'Digital transformation first, AI as the accelerator. We automate the boring before the brilliant, and only deploy AI where it pays back in hours returned, not headlines.' },
    ],
  },
  render: (props) => <Faq {...props} />,
};

export default Faq;
