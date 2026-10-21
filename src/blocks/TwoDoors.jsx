import { useEffect, useRef, useState } from 'react';
import { TideField } from './TideField.jsx';
import { track } from '../lib/analytics.js';
import { MediaField } from '../cms/MediaField.jsx';
import { safeHref, safeMailto } from '../lib/safe-url.js';

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

const homeCopy = {
  headlineSuffix: 'and the tools to deliver it.', cueText: 'Choose your side', cueSubtext: 'DX Consultancy or DX Dev Tools',
  consultancyName: 'DX Consultancy', toolsName: 'DX Dev Tools', chooseLabel: 'Choose',
  consultancyTag: 'For leaders who transform', toolsTag: 'For teams who deliver',
  moreClosed: 'What’s inside ↓', moreOpen: 'Less ↑', logoLabel: 'Our team has delivered for', logoDraft: 'Client logos await written permission.',
  consultancyPoint1: 'Diagnose', consultancyPoint1Text: 'Find the work worth changing first.', consultancyPoint2: 'Deliver', consultancyPoint2Text: 'Build it with specialists and reviewers.', consultancyPoint3: 'Run', consultancyPoint3Text: 'Keep a managed team on it, with a person approving.',
  consultancyCta: 'Discuss your transformation →', proofLink: 'See our work', toolsCta: 'Browse DX Dev Tools →',
  chooserHeading: 'Choose your side', chooserLine: 'Two ways to work with Greatstone.', consultancyChooserLine: 'Transform with AI', toolsChooserLine: 'Proven developer tools', orLabel: 'OR', swipeHint: '← Swipe or tap a side →',
  toolsPoint1: 'Browse by brand', toolsPoint1Text: 'Start with the platform you know.', toolsPoint2: 'Find the fit', toolsPoint2Text: 'Compare product capabilities.', toolsPoint3: 'Buy or renew', toolsPoint3Text: 'Keep the route direct.',
  chooseHref: '#choose', contactHref: '#contact', proofHref: '#proof', toolsHref: '#dev-tools',
};
const storyCopy = {
  storyKicker: 'Who we are', numbersLabel: 'Greatstone in numbers', draftNumbersHeading: 'Draft numbers strip', draftNumbersLine: 'Figures and counting rules await confirmation.',
  rangeLabel: 'The work we do',
};
const defaultRange = [
  { title: 'Transformation', line: 'Operating models and change programmes.' },
  { title: 'Delivery', line: 'Programme and project leadership.' },
  { title: 'Technology', line: 'Systems, integration and developer tools.' },
  { title: 'Data', line: 'Reporting and data quality.' },
];
const proofCopy = { proofKicker: 'Case studies', proofHeading: 'What changed for our clients', draftBadge: 'DRAFT', draftCaseLine: 'Engagement facts, outcome and permission are pending.', pendingLine: 'Verified case studies are being prepared.', pendingLink: 'See our current proof', proofHref: '#proof' };
const draftCases = [{ headline: 'First study', image: '/assets/two-doors/consultancy-hero.webp' }, { headline: 'Second study', image: '/assets/two-doors/tools-hero.webp' }, { headline: 'Third study', image: '/assets/two-doors/consultancy-hero.webp' }];
const toolsCopy = { toolsKicker: 'DX Dev Tools', toolsHeading: 'The tools we supply', toolsIntro: 'Developer components and SDKs from the brands you know.', toolLinkPrefix: 'Browse', toolLinkSuffix: '→', closeHeading: 'Begin the conversation', closeLine: 'Tell us what you are working on. We will suggest a next step.', closeCta: 'Begin the conversation →', bottomKicker: 'Two ways to work with Greatstone', bottomHeading: 'Choose your side', bottomConsultancy: 'DX Consultancy →', bottomTools: 'DX Dev Tools →', toolsHref: '#dev-tools', contactHref: '#contact', consultancyHref: '#door-dx', consultancyImage: '/assets/two-doors/consultancy-hero.webp', toolsImage: '/assets/two-doors/tools-hero.webp' };
const devCopy = { devKicker: 'DX Dev Tools', shopCta: 'Browse the Greatstone Software shop →', brandHeading: 'Browse by brand', brandCta: 'Browse in the shop →', helpLine: 'Need help choosing?', helpEmail: 'DX@greatstonesoftware.co.uk', shopHref: '#shop' };
const copyFields = (defaults) => Object.fromEntries(Object.keys(defaults).map((key) => [key, { type: 'text', label: key.replace(/([A-Z])/g, ' $1') }]));
const toolFields = { type: 'array', label: 'Tool brands and approved lines', arrayFields: { name: { type: 'text', label: 'Brand' }, line: { type: 'textarea', label: 'Approved line' }, image: { type: 'custom', label: 'Brand image', render: (props) => <MediaField {...props} /> }, href: { type: 'text', label: 'Link' } }, defaultItemProps: { name: '', line: '', image: '', href: '' }, getItemSummary: (item) => item.name || 'Brand' };

function Carousel({ items, label, render, enabled = true }) {
  const [index, setIndex] = useState(0);
  const count = items.length;
  const move = (step) => setIndex((i) => (i + step + count) % count);
  const touch = useRef(null);
  if (!count) return null;
  if (!enabled) return <div className="td-carousel td-carousel-still">{render(items[0], 0)}</div>;
  return <div className="td-carousel" role="region" aria-roledescription="carousel" aria-label={label}>
    <div className="td-slide" tabIndex="0" onKeyDown={(e) => { if (e.key === 'ArrowRight') move(1); if (e.key === 'ArrowLeft') move(-1); }}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }} onTouchEnd={(e) => { if (touch.current == null) return; const dx = e.changedTouches[0].clientX - touch.current; if (Math.abs(dx) > 45) move(dx < 0 ? 1 : -1); touch.current = null; }}>
      <div className="td-carousel-current">{render(items[index], index)}</div>
      {count > 1 && <div className="td-carousel-next" aria-hidden="true" inert="">{render(items[(index + 1) % count], (index + 1) % count)}</div>}
    </div>
    <div className="td-carousel-controls">
      <span className="td-dots" aria-label={`${index + 1} of ${count}`}>{items.map((item, i) => <button key={i} type="button" className={index === i ? 'active' : ''} aria-label={`Show ${label} ${i + 1}`} aria-current={index === i ? 'true' : undefined} onClick={() => setIndex(i)} />)}</span>
      <button type="button" aria-label={`Previous ${label}`} onClick={() => move(-1)}>←</button>
      <button type="button" aria-label={`Next ${label}`} onClick={() => move(1)}>→</button>
    </div>
  </div>;
}

export function TwoDoors(props) {
  const { kicker, heading, intro, consultancyLine, toolsLine, clientLogos = [], tide = true, consultancyImage, toolsImage } = props;
  const copy = { ...homeCopy, ...props };
  const [side, setSide] = useState('choose');
  const [pinned, setPinned] = useState(null);
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width:760px)').matches);
  const strip = useRef(null);
  useEffect(() => {
    const query = window.matchMedia('(max-width:760px)');
    const update = () => setMobile(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    document.documentElement.classList.add('td-no-cursor');
    return () => document.documentElement.classList.remove('td-no-cursor');
  }, []);
  useEffect(() => {
    const node = strip.current;
    if (!node) return;
    const mobile = window.matchMedia('(max-width:760px)');
    if (mobile.matches) node.scrollLeft = node.children[0].getBoundingClientRect().width + 8;
  }, []);
  const select = (next) => {
    if (window.matchMedia('(max-width:760px)').matches && strip.current) {
      const index = { consultancy: 0, choose: 1, tools: 2 }[next];
      strip.current.scrollTo({ left: index * (strip.current.children[0].getBoundingClientRect().width + 8), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
    setSide(next);
    if (next !== 'choose') track('door_selected', { door: next });
  };
  const open = (next) => {
    if (mobile) { setPinned(pinned === next ? null : next); return; }
    const shouldOpen = side !== next;
    setPinned(shouldOpen ? next : null);
    setSide(shouldOpen ? next : 'choose');
  };
  const active = mobile ? pinned : side === 'choose' ? null : side;
  const approvedLogos = clientLogos.filter((logo) => logo?.image && logo?.permission === 'approved');
  return <div className="td-home" id="top">
    <section className="td-intro" aria-labelledby="td-heading">
      <TideField enabled={tide} />
      <p className="td-kicker">{kicker}</p>
      <h1 id="td-heading"><span>{heading}</span> {copy.headlineSuffix}</h1>
      <p className="td-lede">{intro}</p>
      <a className="td-cue" href={safeHref(copy.chooseHref)}>↓ &nbsp; {copy.cueText} <small>· {copy.cueSubtext}</small></a>
    </section>

    <section className="td-door-section" id="choose" aria-label={copy.chooserHeading}>
      <nav className="td-stepbar" aria-label={copy.chooserHeading}>
        <button type="button" aria-current={side === 'consultancy'} onClick={() => select('consultancy')}>{copy.consultancyName}</button>
        <button type="button" aria-current={side === 'choose'} onClick={() => select('choose')}>{copy.chooseLabel}</button>
        <button type="button" aria-current={side === 'tools'} onClick={() => select('tools')}>{copy.toolsName}</button>
      </nav>
      <div ref={strip} className={'td-doors td-state-' + side} onScroll={(e) => { if (window.matchMedia('(max-width:760px)').matches) { const i = Math.round(e.currentTarget.scrollLeft / (e.currentTarget.children[0].getBoundingClientRect().width + 8)); setSide(['consultancy', 'choose', 'tools'][i] || 'choose'); } }} onMouseLeave={() => setSide(pinned || 'choose')} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setSide(pinned || 'choose'); }} onKeyDown={(e) => { if (e.key === 'Escape') { setPinned(null); setSide('choose'); } }}>
        <article className={'td-door td-consultancy' + (active === 'consultancy' ? ' expanded' : '')} id="door-dx" onMouseEnter={() => { if (window.matchMedia('(min-width:761px) and (hover:hover)').matches) setSide('consultancy'); }} onFocus={() => { if (window.matchMedia('(min-width:761px)').matches) setSide('consultancy'); }}>
          <img src={consultancyImage} alt="" width="640" height="640" />
          <div className="td-door-shade" />
          <div className="td-door-copy"><p className="td-door-tag">{copy.consultancyTag}</p><h2>{copy.consultancyName}</h2><p>{consultancyLine}</p>
            <button type="button" className="td-more" aria-expanded={active === 'consultancy'} onClick={() => open('consultancy')}>{active === 'consultancy' ? copy.moreOpen : copy.moreClosed}</button>
            <div className={'td-door-detail' + (active === 'consultancy' ? ' is-open' : '')} inert={active === 'consultancy' ? undefined : ''}><div className="td-door-detail-inner">
              {approvedLogos.length ? <div className="td-client-logos"><p>{copy.logoLabel}</p><ul>{approvedLogos.map((logo, i) => <li key={i}><img src={logo.image} alt={logo.alt || ''} loading="lazy" /></li>)}</ul></div> : REVIEW_CONTENT && <p className="td-draft">{copy.logoDraft}</p>}
              <ul><li><b>{copy.consultancyPoint1}</b> {copy.consultancyPoint1Text}</li><li><b>{copy.consultancyPoint2}</b> {copy.consultancyPoint2Text}</li><li><b>{copy.consultancyPoint3}</b> {copy.consultancyPoint3Text}</li></ul>
            </div></div>
            <a className="td-pill" href={safeHref(copy.contactHref)}>{copy.consultancyCta}</a><a className="td-text-link" href={safeHref(copy.proofHref)}>{copy.proofLink}</a>
          </div>
        </article>
        <div className="td-chooser"><h2>{copy.chooserHeading}</h2><p>{copy.chooserLine}</p><div className="td-chooser-split"><button type="button" onClick={() => select('consultancy')}><img src={consultancyImage} alt="" /><span className="td-chooser-arrow">←</span><b>{copy.consultancyName}</b><span>{copy.consultancyChooserLine}</span></button><span className="td-chooser-or">{copy.orLabel}</span><button type="button" onClick={() => select('tools')}><img src={toolsImage} alt="" /><span className="td-chooser-arrow">→</span><b>{copy.toolsName}</b><span>{copy.toolsChooserLine}</span></button></div><small>{copy.swipeHint}</small></div>
        <article className={'td-door td-tools' + (active === 'tools' ? ' expanded' : '')} id="door-tools" onMouseEnter={() => { if (window.matchMedia('(min-width:761px) and (hover:hover)').matches) setSide('tools'); }} onFocus={() => { if (window.matchMedia('(min-width:761px)').matches) setSide('tools'); }}>
          <img src={toolsImage} alt="" width="640" height="640" />
          <div className="td-door-shade" />
          <div className="td-door-copy"><p className="td-door-tag">{copy.toolsTag}</p><h2>{copy.toolsName}</h2><p>{toolsLine}</p>
            <button type="button" className="td-more" aria-expanded={active === 'tools'} onClick={() => open('tools')}>{active === 'tools' ? 'Less ↑' : 'What’s inside ↓'}</button>
            <div className={'td-door-detail' + (active === 'tools' ? ' is-open' : '')} inert={active === 'tools' ? undefined : ''}><div className="td-door-detail-inner"><ul><li><b>{copy.toolsPoint1}</b> {copy.toolsPoint1Text}</li><li><b>{copy.toolsPoint2}</b> {copy.toolsPoint2Text}</li><li><b>{copy.toolsPoint3}</b> {copy.toolsPoint3Text}</li></ul></div></div>
            <a className="td-pill td-pill-teal" href={safeHref(copy.toolsHref)}>{copy.toolsCta}</a>
          </div>
        </article>
      </div>
    </section>
  </div>;
}

export function TwoDoorsStory(props) {
  const { storyHeading, storyBody, storyBody2, numbers = [], tide = true, range = defaultRange } = props;
  const copy = { ...storyCopy, ...props };
  const approvedNumbers = numbers.filter((number) => number?.value && number?.label && number?.verified);
  return <div className="td-segment td-story-segment">
    <TideField view="calm" enabled={tide} />
    <section className="td-story" id="about"><div><p className="td-kicker">{copy.storyKicker}</p><h2>{storyHeading}</h2></div><div><p>{storyBody}</p><p>{storyBody2}</p></div></section>
    {approvedNumbers.length ? <div className="td-review-strip td-numbers" aria-label={copy.numbersLabel}>{approvedNumbers.map((item, i) => <div key={i}><b>{item.value}</b><span>{item.label}</span></div>)}</div> : REVIEW_CONTENT && <div className="td-review-strip" role="note"><b>{copy.draftNumbersHeading}</b><span>{copy.draftNumbersLine}</span></div>}
    <section className="td-range" aria-label={copy.rangeLabel}>{range.map((item, i) => <div key={i}><b>{item.title}</b><p>{item.line}</p></div>)}</section>
  </div>;
}

export function TwoDoorsProof(props) {
  const { cases = [], draftItems = draftCases, carousel = true } = props;
  const copy = { ...proofCopy, ...props };
  const approvedCases = cases.filter((study) => study?.headline && study?.result && study?.verified);
  return <div className="td-segment">
    <section className="td-section" id="cases"><p className="td-kicker">{copy.proofKicker}</p><h2>{copy.proofHeading}</h2>
      {approvedCases.length ? <Carousel enabled={carousel} label={copy.proofKicker} items={approvedCases} render={(study) => <div className="td-case">{study.image && <img className="td-case-image" src={study.image} alt={study.imageAlt || ''} loading="lazy" />}<div className="td-case-copy"><strong>{study.headline}</strong><p>{study.problem}</p><p>{study.work}</p><p>{study.result}</p></div></div>} /> : REVIEW_CONTENT ? <Carousel enabled={carousel} label={copy.proofKicker} items={draftItems} render={(item) => <div className="td-case td-case-draft">{item.image && <img className="td-case-image" src={item.image} alt="" loading="lazy" />}<div className="td-case-copy"><span className="td-draft-badge">{copy.draftBadge}</span><strong>{item.headline}</strong><p>{copy.draftCaseLine}</p></div></div>} /> : <p className="td-pending">{copy.pendingLine} <a href={safeHref(copy.proofHref)}>{copy.pendingLink}</a>.</p>}
    </section>
  </div>;
}

export function TwoDoorsTools(props) {
  const { tools = TOOLS, carousel = true } = props;
  const copy = { ...toolsCopy, ...props };
  return <div className="td-segment">
    <section className="td-section" id="tools"><p className="td-kicker td-teal">{copy.toolsKicker}</p><h2>{copy.toolsHeading}</h2><p>{copy.toolsIntro}</p>
      <Carousel enabled={carousel} label={copy.toolsKicker} items={tools} render={(tool) => <article className="td-tool-card">{tool.image && <img className="td-tool-image" src={tool.image} alt="" loading="lazy" />}<h3>{tool.name}</h3><p>{tool.line}</p><a href={safeHref(tool.href || copy.toolsHref)}>{copy.toolLinkPrefix} {tool.name} {copy.toolLinkSuffix}</a></article>} />
    </section>
    <section className="td-close"><h2>{copy.closeHeading}</h2><p>{copy.closeLine}</p><a className="td-pill" href={safeHref(copy.contactHref)}>{copy.closeCta}</a></section>
    <section className="td-section td-bottom"><p className="td-kicker">{copy.bottomKicker}</p><h2>{copy.bottomHeading}</h2><div><a href={safeHref(copy.consultancyHref)}><img src={copy.consultancyImage} alt="" /><span>{copy.bottomConsultancy}</span></a><a href={safeHref(copy.toolsHref)}><img src={copy.toolsImage} alt="" /><span>{copy.bottomTools}</span></a></div></section>
  </div>;
}

export function DevTools(props) {
  const { heading, intro, tools = TOOLS } = props;
  const copy = { ...devCopy, ...props };
  return <div className="td-home td-dev-page"><section className="td-intro"><p className="td-kicker td-teal">{copy.devKicker}</p><h1>{heading}</h1><p className="td-lede">{intro}</p><a className="td-pill td-pill-teal" href={safeHref(copy.shopHref)}>{copy.shopCta}</a></section><section className="td-section"><h2>{copy.brandHeading}</h2><div className="td-brand-grid">{tools.map((tool) => <article className="td-tool-card" key={tool.name}>{tool.image && <img className="td-tool-image" src={tool.image} alt="" loading="lazy" />}<h3>{tool.name}</h3><p>{tool.line}</p><a href={safeHref(tool.href || copy.shopHref)}>{copy.brandCta}</a></article>)}</div><p className="td-mail">{copy.helpLine} <a href={safeMailto(copy.helpEmail)}>{copy.helpEmail}</a></p></section></div>;
}

export const css = '';
export const puck = {
  label: 'Two Doors homepage',
  fields: {
    ...copyFields(homeCopy),
    kicker: { type: 'text', label: 'Intro kicker' }, heading: { type: 'text', label: 'Intro highlighted word' }, intro: { type: 'textarea', label: 'Intro text' },
    consultancyLine: { type: 'textarea', label: 'Consultancy door line' }, toolsLine: { type: 'textarea', label: 'Tools door line' },
    tide: { type: 'radio', label: 'Tide effect', options: [{ label: 'On', value: true }, { label: 'Still', value: false }] },
    consultancyImage: { type: 'custom', label: 'Consultancy image', render: (props) => <MediaField {...props} /> },
    toolsImage: { type: 'custom', label: 'Tools image', render: (props) => <MediaField {...props} /> },
    clientLogos: { type: 'array', label: 'Client logos (written permission required)', arrayFields: {
      image: { type: 'custom', label: 'Logo image', render: (props) => <MediaField {...props} /> }, alt: { type: 'text', label: 'Organisation name' },
      permission: { type: 'select', label: 'Permission on file', options: [{ label: 'Pending', value: 'pending' }, { label: 'Approved in writing', value: 'approved' }] },
    }, defaultItemProps: { image: '', alt: '', permission: 'pending' }, getItemSummary: (item) => item.alt || 'Logo' },
  },
  defaultProps: { ...homeCopy, kicker: 'The Foundation of Digital Excellence', heading: 'Transformation', intro: 'Greatstone International is a transformation and technology firm. Today we bring our experience to AI, and to the tools developers build with.', consultancyLine: 'Turn slow, hidden work into AI delivery you can inspect and approve.', toolsLine: 'Developer components and SDKs from the brands you know.', consultancyImage: '/assets/two-doors/consultancy-hero.webp', toolsImage: '/assets/two-doors/tools-hero.webp', tide: true, clientLogos: [] },
  render: (props) => <TwoDoors {...props} />,
};

export const storyPuck = {
  label: 'Two Doors story and numbers',
  fields: {
    ...copyFields(storyCopy),
    storyHeading: { type: 'text', label: 'Who we are heading' }, storyBody: { type: 'textarea', label: 'Who we are paragraph 1' }, storyBody2: { type: 'textarea', label: 'Who we are paragraph 2' },
    tide: { type: 'radio', label: 'Calm Tide effect', options: [{ label: 'On', value: true }, { label: 'Still', value: false }] },
    range: { type: 'array', label: 'Work areas', arrayFields: { title: { type: 'text', label: 'Title' }, line: { type: 'textarea', label: 'Description' } }, defaultItemProps: { title: '', line: '' }, getItemSummary: (item) => item.title || 'Area' },
    numbers: { type: 'array', label: 'Verified numbers', arrayFields: { value: { type: 'text', label: 'Value' }, label: { type: 'text', label: 'Meaning and counting rule' }, verified: { type: 'radio', label: 'Fact confirmed', options: [{ label: 'No', value: false }, { label: 'Yes', value: true }] } }, defaultItemProps: { value: '', label: '', verified: false }, getItemSummary: (item) => item.label || 'Number' },
  },
  defaultProps: { ...storyCopy, storyHeading: 'Making change work.', storyBody: 'Greatstone is a transformation and technology firm.', storyBody2: 'Today we bring that experience to AI, and to the tools developers build with.', tide: true, range: defaultRange, numbers: [] },
  render: (props) => <TwoDoorsStory {...props} />,
};

export const proofPuck = {
  label: 'Two Doors case studies',
  fields: {
    ...copyFields(proofCopy),
    carousel: { type: 'radio', label: 'Carousel', options: [{ label: 'On', value: true }, { label: 'Still', value: false }] },
    draftItems: { type: 'array', label: 'Draft case placeholders', arrayFields: { headline: { type: 'text', label: 'Placeholder label' }, image: { type: 'custom', label: 'Generic image', render: (props) => <MediaField {...props} /> } }, defaultItemProps: { headline: '', image: '' }, getItemSummary: (item) => item.headline || 'Draft' },
    cases: { type: 'array', label: 'Verified case studies', arrayFields: { headline: { type: 'text', label: 'Outcome headline' }, problem: { type: 'textarea', label: 'Problem and baseline' }, work: { type: 'textarea', label: 'What we did and duration' }, result: { type: 'textarea', label: 'Measured result and period' }, image: { type: 'custom', label: 'Image', render: (props) => <MediaField {...props} /> }, imageAlt: { type: 'text', label: 'Image description' }, verified: { type: 'radio', label: 'Facts and naming permission confirmed', options: [{ label: 'No', value: false }, { label: 'Yes', value: true }] } }, defaultItemProps: { headline: '', problem: '', work: '', result: '', image: '', imageAlt: '', verified: false }, getItemSummary: (item) => item.headline || 'Case study' },
  },
  defaultProps: { ...proofCopy, cases: [], draftItems: draftCases, carousel: true },
  render: (props) => <TwoDoorsProof {...props} />,
};

export const toolsPuck = { label: 'Two Doors tools and close', fields: { ...copyFields(toolsCopy), carousel: { type: 'radio', label: 'Carousel', options: [{ label: 'On', value: true }, { label: 'Still', value: false }] }, tools: toolFields }, defaultProps: { ...toolsCopy, tools: TOOLS, carousel: true }, render: (props) => <TwoDoorsTools {...props} /> };

export const devToolsPuck = {
  label: 'DX Dev Tools page',
  fields: { ...copyFields(devCopy), heading: { type: 'text', label: 'Heading' }, intro: { type: 'textarea', label: 'Intro' }, tools: toolFields },
  defaultProps: { ...devCopy, heading: 'Tools for teams who deliver.', intro: 'Developer components and SDKs from the brands you know.', tools: TOOLS },
  render: (props) => <DevTools {...props} />,
};
