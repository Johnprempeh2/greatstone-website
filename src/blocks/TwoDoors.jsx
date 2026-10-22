import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TideField } from './TideField.jsx';
import { track } from '../lib/analytics.js';
import { MediaField } from '../cms/MediaField.jsx';
import { safeHref, safeMailto } from '../lib/safe-url.js';

// The unconfirmed claims in v15 are review material only. A production build has no
// switch in the browser that can reveal them.
const REVIEW_CONTENT = import.meta.env.VITE_TWO_DOORS_DRAFT_CONTENT === 'true';
const copyFields = (keys) => Object.fromEntries(keys.map((key) => [key, { type: 'text', label: key.replace(/([A-Z])/g, ' $1') }]));
const textDefaults = (keys) => Object.fromEntries(keys.map((key) => [key, '']));
const homeFields = 'headlineSuffix cueText cueSubtext consultancyName toolsName chooseLabel consultancyTag toolsTag moreClosed moreOpen logoLabel logoDraft consultancyPoint1 consultancyPoint1Text consultancyPoint2 consultancyPoint2Text consultancyPoint3 consultancyPoint3Text consultancyCta proofLink toolsCta chooserHeading chooserLine consultancyChooserLine toolsChooserLine orLabel swipeHint toolsPoint1 toolsPoint1Text toolsPoint2 toolsPoint2Text toolsPoint3 toolsPoint3Text chooseHref contactHref proofHref toolsHref'.split(' ');
const storyFields = 'storyKicker numbersLabel draftNumbersHeading draftNumbersLine rangeLabel'.split(' ');
const proofFields = 'proofKicker proofHeading draftBadge draftCaseLine pendingLine pendingLink proofHref'.split(' ');
const toolsFields = 'toolsKicker toolsHeading toolsIntro toolLinkPrefix toolLinkSuffix closeHeading closeLine closeCta bottomKicker bottomHeading bottomConsultancy bottomTools toolsHref contactHref consultancyHref consultancyImage toolsImage'.split(' ');
const devFields = 'devKicker shopCta brandHeading brandCta helpLine helpEmail shopHref'.split(' ');
const toolFields = { type: 'array', label: 'Tool brands and approved lines', arrayFields: { name: { type: 'text', label: 'Brand' }, line: { type: 'textarea', label: 'Approved line' }, image: { type: 'custom', label: 'Brand image', render: (props) => <MediaField {...props} /> }, href: { type: 'text', label: 'Link' } }, defaultItemProps: { name: '', line: '', image: '', href: '' }, getItemSummary: (item) => item.name || 'Brand' };
const doorSides = ['consultancy', 'choose', 'tools'];
const doorPanels = (node) => doorSides.map((side) => node.querySelector(side === 'choose' ? '.td-chooser' : `.td-${side}`));
const panelPosition = (node, panel) => Math.max(0, Math.min(node.scrollWidth - node.clientWidth, panel.offsetLeft - (node.clientWidth - panel.offsetWidth) / 2));

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
  const copy = { ...props };
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
  useLayoutEffect(() => {
    const node = strip.current;
    if (node && mobile) node.scrollLeft = panelPosition(node, doorPanels(node)[1]);
  }, [mobile]);
  const select = (next) => {
    if (window.matchMedia('(max-width:760px)').matches && strip.current) {
      const node = strip.current;
      node.scrollTo({ left: panelPosition(node, doorPanels(node)[doorSides.indexOf(next)]), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
    setSide(next);
    if (next !== 'choose') track('door_selected', { door: next });
  };
  const open = (next) => {
    if (mobile) { setPinned(pinned === next ? null : next); return; }
    const shouldOpen = pinned !== next;
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
      <div ref={strip} className={'td-doors td-state-' + side} onScroll={(e) => { if (mobile) { const node = e.currentTarget; const panels = doorPanels(node); const nearest = panels.reduce((best, panel, i) => Math.abs(panelPosition(node, panel) - node.scrollLeft) < Math.abs(panelPosition(node, panels[best]) - node.scrollLeft) ? i : best, 0); setSide(doorSides[nearest]); } }} onMouseLeave={() => { if (!mobile) setSide(pinned || 'choose'); }} onBlur={(e) => { if (!mobile && !e.currentTarget.contains(e.relatedTarget)) setSide(pinned || 'choose'); }} onKeyDown={(e) => { if (e.key === 'Escape') { setPinned(null); setSide('choose'); } }}>
        <span className="td-join-label" aria-hidden="true">{copy.orLabel}</span>
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
            <button type="button" className="td-more" aria-expanded={active === 'tools'} onClick={() => open('tools')}>{active === 'tools' ? copy.moreOpen : copy.moreClosed}</button>
            <div className={'td-door-detail' + (active === 'tools' ? ' is-open' : '')} inert={active === 'tools' ? undefined : ''}><div className="td-door-detail-inner"><ul><li><b>{copy.toolsPoint1}</b> {copy.toolsPoint1Text}</li><li><b>{copy.toolsPoint2}</b> {copy.toolsPoint2Text}</li><li><b>{copy.toolsPoint3}</b> {copy.toolsPoint3Text}</li></ul></div></div>
            <a className="td-pill td-pill-teal" href={safeHref(copy.toolsHref)}>{copy.toolsCta}</a>
          </div>
        </article>
      </div>
    </section>
  </div>;
}

export function TwoDoorsStory(props) {
  const { storyHeading, storyBody, storyBody2, numbers = [], tide = true, range = [] } = props;
  const copy = { ...props };
  const approvedNumbers = numbers.filter((number) => number?.value && number?.label && number?.verified);
  return <div className="td-segment td-story-segment">
    <TideField view="calm" enabled={tide} />
    <section className="td-story" id="about"><div><p className="td-kicker">{copy.storyKicker}</p><h2>{storyHeading}</h2></div><div><p>{storyBody}</p><p>{storyBody2}</p></div></section>
    {approvedNumbers.length ? <div className="td-review-strip td-numbers" aria-label={copy.numbersLabel}>{approvedNumbers.map((item, i) => <div key={i}><b>{item.value}</b><span>{item.label}</span></div>)}</div> : REVIEW_CONTENT && <div className="td-review-strip" role="note"><b>{copy.draftNumbersHeading}</b><span>{copy.draftNumbersLine}</span></div>}
    <section className="td-range" aria-label={copy.rangeLabel}>{range.map((item, i) => <div key={i}><b>{item.title}</b><p>{item.line}</p></div>)}</section>
  </div>;
}

export function TwoDoorsProof(props) {
  const { cases = [], draftItems = [], carousel = true } = props;
  const copy = { ...props };
  const approvedCases = cases.filter((study) => study?.headline && study?.result && study?.verified);
  return <div className="td-segment">
    <section className="td-section" id="cases"><p className="td-kicker">{copy.proofKicker}</p><h2>{copy.proofHeading}</h2>
      {approvedCases.length ? <Carousel enabled={carousel} label={copy.proofKicker} items={approvedCases} render={(study) => <div className="td-case">{study.image && <img className="td-case-image" src={study.image} alt={study.imageAlt || ''} loading="lazy" />}<div className="td-case-copy"><strong>{study.headline}</strong><p>{study.problem}</p><p>{study.work}</p><p>{study.result}</p></div></div>} /> : REVIEW_CONTENT ? <Carousel enabled={carousel} label={copy.proofKicker} items={draftItems} render={(item) => <div className="td-case td-case-draft">{item.image && <img className="td-case-image" src={item.image} alt="" loading="lazy" />}<div className="td-case-copy"><span className="td-draft-badge">{copy.draftBadge}</span><strong>{item.headline}</strong><p>{copy.draftCaseLine}</p></div></div>} /> : <p className="td-pending">{copy.pendingLine} <a href={safeHref(copy.proofHref)}>{copy.pendingLink}</a>.</p>}
    </section>
  </div>;
}

export function TwoDoorsTools(props) {
  const { tools = [], carousel = true } = props;
  const copy = { ...props };
  return <div className="td-segment">
    <section className="td-section" id="tools"><p className="td-kicker td-teal">{copy.toolsKicker}</p><h2>{copy.toolsHeading}</h2><p>{copy.toolsIntro}</p>
      <Carousel enabled={carousel} label={copy.toolsKicker} items={tools} render={(tool) => <article className="td-tool-card">{tool.image && <img className="td-tool-image" src={tool.image} alt="" loading="lazy" />}<h3>{tool.name}</h3><p>{tool.line}</p><a href={safeHref(tool.href || copy.toolsHref)}>{copy.toolLinkPrefix} {tool.name} {copy.toolLinkSuffix}</a></article>} />
    </section>
    <section className="td-close"><h2>{copy.closeHeading}</h2><p>{copy.closeLine}</p><a className="td-pill" href={safeHref(copy.contactHref)}>{copy.closeCta}</a></section>
    <section className="td-section td-bottom"><p className="td-kicker">{copy.bottomKicker}</p><h2>{copy.bottomHeading}</h2><div><a href={safeHref(copy.consultancyHref)}><img src={copy.consultancyImage} alt="" /><span>{copy.bottomConsultancy}</span></a><a href={safeHref(copy.toolsHref)}><img src={copy.toolsImage} alt="" /><span>{copy.bottomTools}</span></a></div></section>
  </div>;
}

export function DevTools(props) {
  const { heading, intro, tools = [] } = props;
  const copy = { ...props };
  return <div className="td-home td-dev-page"><section className="td-intro"><p className="td-kicker td-teal">{copy.devKicker}</p><h1>{heading}</h1><p className="td-lede">{intro}</p><a className="td-pill td-pill-teal" href={safeHref(copy.shopHref)}>{copy.shopCta}</a></section><section className="td-section"><h2>{copy.brandHeading}</h2><div className="td-brand-grid">{tools.map((tool) => <article className="td-tool-card" key={tool.name}>{tool.image && <img className="td-tool-image" src={tool.image} alt="" loading="lazy" />}<h3>{tool.name}</h3><p>{tool.line}</p><a href={safeHref(tool.href || copy.shopHref)}>{copy.brandCta}</a></article>)}</div><p className="td-mail">{copy.helpLine} <a href={safeMailto(copy.helpEmail)}>{copy.helpEmail}</a></p></section></div>;
}

export const css = '';
export const puck = {
  label: 'Two Doors homepage',
  fields: {
    ...copyFields(homeFields),
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
  defaultProps: { ...textDefaults(homeFields), kicker: '', heading: '', intro: '', consultancyLine: '', toolsLine: '', consultancyImage: '', toolsImage: '', tide: true, clientLogos: [] },
  render: (props) => <TwoDoors {...props} />,
};

export const storyPuck = {
  label: 'Two Doors story and numbers',
  fields: {
    ...copyFields(storyFields),
    storyHeading: { type: 'text', label: 'Who we are heading' }, storyBody: { type: 'textarea', label: 'Who we are paragraph 1' }, storyBody2: { type: 'textarea', label: 'Who we are paragraph 2' },
    tide: { type: 'radio', label: 'Calm Tide effect', options: [{ label: 'On', value: true }, { label: 'Still', value: false }] },
    range: { type: 'array', label: 'Work areas', arrayFields: { title: { type: 'text', label: 'Title' }, line: { type: 'textarea', label: 'Description' } }, defaultItemProps: { title: '', line: '' }, getItemSummary: (item) => item.title || 'Area' },
    numbers: { type: 'array', label: 'Verified numbers', arrayFields: { value: { type: 'text', label: 'Value' }, label: { type: 'text', label: 'Meaning and counting rule' }, verified: { type: 'radio', label: 'Fact confirmed', options: [{ label: 'No', value: false }, { label: 'Yes', value: true }] } }, defaultItemProps: { value: '', label: '', verified: false }, getItemSummary: (item) => item.label || 'Number' },
  },
  defaultProps: { ...textDefaults(storyFields), storyHeading: '', storyBody: '', storyBody2: '', tide: true, range: [], numbers: [] },
  render: (props) => <TwoDoorsStory {...props} />,
};

export const proofPuck = {
  label: 'Two Doors case studies',
  fields: {
    ...copyFields(proofFields),
    carousel: { type: 'radio', label: 'Carousel', options: [{ label: 'On', value: true }, { label: 'Still', value: false }] },
    draftItems: { type: 'array', label: 'Draft case placeholders', arrayFields: { headline: { type: 'text', label: 'Placeholder label' }, image: { type: 'custom', label: 'Generic image', render: (props) => <MediaField {...props} /> } }, defaultItemProps: { headline: '', image: '' }, getItemSummary: (item) => item.headline || 'Draft' },
    cases: { type: 'array', label: 'Verified case studies', arrayFields: { headline: { type: 'text', label: 'Outcome headline' }, problem: { type: 'textarea', label: 'Problem and baseline' }, work: { type: 'textarea', label: 'What we did and duration' }, result: { type: 'textarea', label: 'Measured result and period' }, image: { type: 'custom', label: 'Image', render: (props) => <MediaField {...props} /> }, imageAlt: { type: 'text', label: 'Image description' }, verified: { type: 'radio', label: 'Facts and naming permission confirmed', options: [{ label: 'No', value: false }, { label: 'Yes', value: true }] } }, defaultItemProps: { headline: '', problem: '', work: '', result: '', image: '', imageAlt: '', verified: false }, getItemSummary: (item) => item.headline || 'Case study' },
  },
  defaultProps: { ...textDefaults(proofFields), cases: [], draftItems: [], carousel: true },
  render: (props) => <TwoDoorsProof {...props} />,
};

export const toolsPuck = { label: 'Two Doors tools and close', fields: { ...copyFields(toolsFields), carousel: { type: 'radio', label: 'Carousel', options: [{ label: 'On', value: true }, { label: 'Still', value: false }] }, tools: toolFields }, defaultProps: { ...textDefaults(toolsFields), tools: [], carousel: true }, render: (props) => <TwoDoorsTools {...props} /> };

export const devToolsPuck = {
  label: 'Two Doors tools page',
  fields: { ...copyFields(devFields), heading: { type: 'text', label: 'Heading' }, intro: { type: 'textarea', label: 'Intro' }, tools: toolFields },
  defaultProps: { ...textDefaults(devFields), heading: '', intro: '', tools: [] },
  render: (props) => <DevTools {...props} />,
};
