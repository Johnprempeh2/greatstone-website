import { useRef, useState } from 'react';
import { track } from '../lib/analytics.js';
import { MediaField } from '../cms/MediaField.jsx';

// The unconfirmed claims in v15 are review material only. A production build has no
// switch in the browser that can reveal them.
const REVIEW_CONTENT = import.meta.env.VITE_TWO_DOORS_DRAFT_CONTENT === 'true';
const TOOLS = [
  { name: 'Aspose', line: 'Create, edit and convert Word, Excel, PowerPoint and PDF files from your own code.' },
  { name: 'Apryse', line: 'A PDF and document SDK to view, annotate, edit and sign files inside your apps.' },
  { name: 'DevExpress', line: 'UI controls, data grids, charts and reports for .NET and JavaScript apps.' },
  { name: 'GroupDocs', line: 'Document APIs to view, convert, compare, annotate and sign files across common formats.' },
  { name: 'Iron Software', line: 'C# and .NET libraries for PDF, OCR, barcodes and Excel files.' },
  { name: 'Conholdate', line: 'Aspose and GroupDocs APIs together, under one licence.' },
];

function Carousel({ items, label, render }) {
  const [index, setIndex] = useState(0);
  const count = items.length;
  const move = (step) => setIndex((i) => (i + step + count) % count);
  const touch = useRef(null);
  return <div className="td-carousel" role="region" aria-roledescription="carousel" aria-label={label}>
    <div className="td-slide" tabIndex="0" onKeyDown={(e) => { if (e.key === 'ArrowRight') move(1); if (e.key === 'ArrowLeft') move(-1); }}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }} onTouchEnd={(e) => { if (touch.current == null) return; const dx = e.changedTouches[0].clientX - touch.current; if (Math.abs(dx) > 45) move(dx < 0 ? 1 : -1); touch.current = null; }}>
      {render(items[index], index)}
    </div>
    <div className="td-carousel-controls">
      <span className="td-dots" aria-label={`${index + 1} of ${count}`}>{items.map((item, i) => <button key={i} type="button" className={index === i ? 'active' : ''} aria-label={`Show ${label} ${i + 1}`} aria-current={index === i ? 'true' : undefined} onClick={() => setIndex(i)} />)}</span>
      <button type="button" aria-label={`Previous ${label}`} onClick={() => move(-1)}>←</button>
      <button type="button" aria-label={`Next ${label}`} onClick={() => move(1)}>→</button>
    </div>
  </div>;
}

export function TwoDoors({ kicker, heading, intro, consultancyLine, toolsLine, clientLogos = [] }) {
  const [side, setSide] = useState('choose');
  const [expanded, setExpanded] = useState(null);
  const swipeStart = useRef(null);
  const select = (next) => { setSide(next); track('door_selected', { door: next }); };
  const onSwipeEnd = (e) => { if (swipeStart.current == null) return; const dx = e.changedTouches[0].clientX - swipeStart.current; if (Math.abs(dx) > 55) select(dx < 0 ? 'tools' : 'consultancy'); swipeStart.current = null; };
  const approvedLogos = clientLogos.filter((logo) => logo?.image && logo?.permission === 'approved');
  return <div className="td-home" id="top">
    <section className="td-intro" aria-labelledby="td-heading">
      <p className="td-kicker">{kicker}</p>
      <h1 id="td-heading"><span>{heading}</span> and the tools to deliver it.</h1>
      <p className="td-lede">{intro}</p>
      <a className="td-cue" href="#choose">↓ &nbsp; Choose your side <small>· DX Consultancy or DX Dev Tools</small></a>
    </section>

    <section className="td-door-section" id="choose" aria-label="Choose a side" onTouchStart={(e) => { swipeStart.current = e.touches[0].clientX; }} onTouchEnd={onSwipeEnd}>
      <nav className="td-stepbar" aria-label="Choose a side">
        <button type="button" aria-current={side === 'consultancy'} onClick={() => select('consultancy')}>DX Consultancy</button>
        <button type="button" aria-current={side === 'choose'} onClick={() => select('choose')}>Choose</button>
        <button type="button" aria-current={side === 'tools'} onClick={() => select('tools')}>DX Dev Tools</button>
      </nav>
      <div className={'td-doors td-state-' + side}>
        <article className={'td-door td-consultancy' + (expanded === 'consultancy' ? ' expanded' : '')} id="door-dx" onMouseEnter={() => { setExpanded('consultancy'); setSide('consultancy'); }} onMouseLeave={() => { setExpanded(null); setSide('choose'); }}>
          <img src="/assets/two-doors/consultancy-hero.webp" alt="A team working together around a laptop" width="640" height="640" />
          <div className="td-door-shade" />
          <div className="td-door-copy"><p className="td-door-tag">For leaders who transform</p><h2>DX Consultancy</h2><p>{consultancyLine}</p>
            <button type="button" className="td-more" aria-expanded={expanded === 'consultancy'} onClick={() => setExpanded(expanded === 'consultancy' ? null : 'consultancy')}>What’s inside ↓</button>
            <div className="td-door-detail" hidden={expanded !== 'consultancy'}>
              {approvedLogos.length ? <div className="td-client-logos"><p>Our team has delivered for</p><ul>{approvedLogos.map((logo, i) => <li key={i}><img src={logo.image} alt={logo.alt || ''} loading="lazy" /></li>)}</ul></div> : REVIEW_CONTENT && <p className="td-draft">Client logos await written permission.</p>}
              <ul><li><b>Diagnose</b> Find the work worth changing first.</li><li><b>Deliver</b> Build it with specialists and reviewers.</li><li><b>Run</b> Keep a managed team on it, with a person approving.</li></ul>
            </div>
            <a className="td-pill" href="#contact">Discuss your transformation →</a><a className="td-text-link" href="#proof">See our work</a>
          </div>
        </article>
        <div className="td-chooser"><h2>Choose your side</h2><p>Two ways to work with Greatstone.</p><div><button type="button" onClick={() => select('consultancy')}><b>DX Consultancy</b><span>Transform with AI ←</span></button><button type="button" onClick={() => select('tools')}><b>DX Dev Tools</b><span>Proven developer tools →</span></button></div><small>Swipe or tap a side.</small></div>
        <article className={'td-door td-tools' + (expanded === 'tools' ? ' expanded' : '')} id="door-tools" onMouseEnter={() => { setExpanded('tools'); setSide('tools'); }} onMouseLeave={() => { setExpanded(null); setSide('choose'); }}>
          <img src="/assets/two-doors/tools-hero.webp" alt="Developer working at a computer" width="640" height="640" />
          <div className="td-door-shade" />
          <div className="td-door-copy"><p className="td-door-tag">For teams who deliver</p><h2>DX Dev Tools</h2><p>{toolsLine}</p>
            <button type="button" className="td-more" aria-expanded={expanded === 'tools'} onClick={() => setExpanded(expanded === 'tools' ? null : 'tools')}>What’s inside ↓</button>
            <div className="td-door-detail" hidden={expanded !== 'tools'}><ul><li><b>Browse by brand</b> Start with the platform you know.</li><li><b>Find the fit</b> Compare product capabilities.</li><li><b>Buy or renew</b> Keep the route direct.</li></ul></div>
            <a className="td-pill td-pill-teal" href="#dev-tools">Browse DX Dev Tools →</a>
          </div>
        </article>
      </div>
    </section>
  </div>;
}

export function TwoDoorsStory({ storyHeading, storyBody, storyBody2, numbers = [] }) {
  const approvedNumbers = numbers.filter((number) => number?.value && number?.label && number?.verified);
  return <div className="td-segment">
    <section className="td-story" id="about"><div><p className="td-kicker">Who we are</p><h2>{storyHeading}</h2></div><div><p>{storyBody}</p><p>{storyBody2}</p></div></section>
    {approvedNumbers.length ? <div className="td-review-strip td-numbers" aria-label="Greatstone in numbers">{approvedNumbers.map((item, i) => <div key={i}><b>{item.value}</b><span>{item.label}</span></div>)}</div> : REVIEW_CONTENT && <div className="td-review-strip" role="note"><b>Draft numbers strip</b><span>Figures and counting rules await confirmation.</span></div>}
    <section className="td-range" aria-label="The work we do"><div><b>Transformation</b><p>Operating models and change programmes.</p></div><div><b>Delivery</b><p>Programme and project leadership.</p></div><div><b>Technology</b><p>Systems, integration and developer tools.</p></div><div><b>Data</b><p>Reporting and data quality.</p></div></section>
  </div>;
}

export function TwoDoorsProof({ cases = [] }) {
  const approvedCases = cases.filter((study) => study?.headline && study?.result && study?.verified);
  return <div className="td-segment">
    <section className="td-section" id="cases"><p className="td-kicker">Case studies</p><h2>What changed for our clients</h2>
      {approvedCases.length ? <Carousel label="Case studies" items={approvedCases} render={(study) => <div className="td-case"><strong>{study.headline}</strong><p>{study.problem}</p><p>{study.work}</p><p>{study.result}</p></div>} /> : REVIEW_CONTENT ? <Carousel label="Draft case studies" items={['First study', 'Second study', 'Third study']} render={(item) => <div className="td-case"><strong>{item}</strong><p>Draft: engagement facts, outcome and permission are pending.</p></div>} /> : <p className="td-pending">Verified case studies are being prepared. <a href="#proof">See our current proof</a>.</p>}
    </section>
  </div>;
}

export function TwoDoorsTools() {
  return <div className="td-segment">
    <section className="td-section" id="tools"><p className="td-kicker td-teal">DX Dev Tools</p><h2>The tools we supply</h2><p>Developer components and SDKs from the brands you know.</p>
      <Carousel label="DX Dev Tools" items={TOOLS} render={(tool) => <article className="td-tool-card"><h3>{tool.name}</h3><p>{tool.line}</p><a href="#dev-tools">Browse {tool.name} →</a></article>} />
    </section>
    <section className="td-close"><h2>Begin the conversation</h2><p>Tell us what you are working on. We will suggest a next step.</p><a className="td-pill" href="#contact">Begin the conversation →</a></section>
    <section className="td-section td-bottom"><p className="td-kicker">Two ways to work with Greatstone</p><h2>Choose your side</h2><div><a href="#door-dx"><img src="/assets/two-doors/consultancy-hero.webp" alt="" /><span>DX Consultancy →</span></a><a href="#dev-tools"><img src="/assets/two-doors/tools-hero.webp" alt="" /><span>DX Dev Tools →</span></a></div></section>
  </div>;
}

export function DevTools({ heading, intro }) {
  return <div className="td-home td-dev-page"><section className="td-intro"><p className="td-kicker td-teal">DX Dev Tools</p><h1>{heading}</h1><p className="td-lede">{intro}</p><a className="td-pill td-pill-teal" href="#shop">Browse the Greatstone Software shop →</a></section><section className="td-section"><h2>Browse by brand</h2><div className="td-brand-grid">{TOOLS.map((tool) => <article className="td-tool-card" key={tool.name}><h3>{tool.name}</h3><p>{tool.line}</p><a href="#shop">Browse in the shop →</a></article>)}</div><p className="td-mail">Need help choosing? <a href="mailto:DX@greatstonesoftware.co.uk">DX@greatstonesoftware.co.uk</a></p></section></div>;
}

export const css = '';
export const puck = {
  label: 'Two Doors homepage',
  fields: {
    kicker: { type: 'text', label: 'Intro kicker' }, heading: { type: 'text', label: 'Intro highlighted word' }, intro: { type: 'textarea', label: 'Intro text' },
    consultancyLine: { type: 'textarea', label: 'Consultancy door line' }, toolsLine: { type: 'textarea', label: 'Tools door line' },
    clientLogos: { type: 'array', label: 'Client logos (written permission required)', arrayFields: {
      image: { type: 'custom', label: 'Logo image', render: (props) => <MediaField {...props} /> }, alt: { type: 'text', label: 'Organisation name' },
      permission: { type: 'select', label: 'Permission on file', options: [{ label: 'Pending', value: 'pending' }, { label: 'Approved in writing', value: 'approved' }] },
    }, defaultItemProps: { image: '', alt: '', permission: 'pending' }, getItemSummary: (item) => item.alt || 'Logo' },
  },
  defaultProps: { kicker: 'The Foundation of Digital Excellence', heading: 'Transformation', intro: 'Greatstone International is a transformation and technology firm. Today we bring our experience to AI, and to the tools developers build with.', consultancyLine: 'Turn slow, hidden work into AI delivery you can inspect and approve.', toolsLine: 'Developer components and SDKs from the brands you know.', clientLogos: [] },
  render: (props) => <TwoDoors {...props} />,
};

export const storyPuck = {
  label: 'Two Doors story and numbers',
  fields: {
    storyHeading: { type: 'text', label: 'Who we are heading' }, storyBody: { type: 'textarea', label: 'Who we are paragraph 1' }, storyBody2: { type: 'textarea', label: 'Who we are paragraph 2' },
    numbers: { type: 'array', label: 'Verified numbers', arrayFields: { value: { type: 'text', label: 'Value' }, label: { type: 'text', label: 'Meaning and counting rule' }, verified: { type: 'radio', label: 'Fact confirmed', options: [{ label: 'No', value: false }, { label: 'Yes', value: true }] } }, defaultItemProps: { value: '', label: '', verified: false }, getItemSummary: (item) => item.label || 'Number' },
  },
  defaultProps: { storyHeading: 'Making change work.', storyBody: 'Greatstone is a transformation and technology firm.', storyBody2: 'Today we bring that experience to AI, and to the tools developers build with.', numbers: [] },
  render: (props) => <TwoDoorsStory {...props} />,
};

export const proofPuck = {
  label: 'Two Doors case studies',
  fields: {
    cases: { type: 'array', label: 'Verified case studies', arrayFields: { headline: { type: 'text', label: 'Outcome headline' }, problem: { type: 'textarea', label: 'Problem and baseline' }, work: { type: 'textarea', label: 'What we did and duration' }, result: { type: 'textarea', label: 'Measured result and period' }, verified: { type: 'radio', label: 'Facts and naming permission confirmed', options: [{ label: 'No', value: false }, { label: 'Yes', value: true }] } }, defaultItemProps: { headline: '', problem: '', work: '', result: '', verified: false }, getItemSummary: (item) => item.headline || 'Case study' },
  },
  defaultProps: { cases: [] },
  render: (props) => <TwoDoorsProof {...props} />,
};

export const toolsPuck = { label: 'Two Doors tools and close', fields: {}, defaultProps: {}, render: (props) => <TwoDoorsTools {...props} /> };

export const devToolsPuck = {
  label: 'DX Dev Tools page',
  fields: { heading: { type: 'text', label: 'Heading' }, intro: { type: 'textarea', label: 'Intro' } },
  defaultProps: { heading: 'Tools for teams who deliver.', intro: 'Developer components and SDKs from the brands you know.' },
  render: (props) => <DevTools {...props} />,
};
