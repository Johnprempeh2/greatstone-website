// GRE-3789 (switch S4b): behaviour for schema 2 (HTML) pages. Page HTML cannot carry script, so the
// engine attaches the behaviour today's blocks added in React to the markup they left behind:
//
//   [data-reveal]               settles in once as it scrolls into view (all pages)
//   data-behaviour="more"       a button[aria-expanded][aria-controls] unclamps a panel body
//   data-behaviour="faq"        a button[aria-expanded][aria-controls] opens an answer
//   data-behaviour="tabs"       [role=tab] buttons show the [data-tab="<index>"] parts of the block
//   data-behaviour="climb"      the /climb map: a trail drawn by scroll, tiers lit as they are reached
//   data-behaviour="grow"       a chart grows its bars (`is-grown`) once it is in view
//   data-behaviour="carousel"   a scroll-snap [data-carousel-track] of slides: prev/next, dots, optional autoplay, loops for ever
//   data-behaviour="site-header" the exported studio header: page marks, menus, "More" (app/header-behaviour.mjs)
//
// The state lives in the HTML (aria-expanded, aria-selected, hidden), so the page reads correctly before
// the script runs and GSAM edits the content as plain HTML. The script only toggles attributes, classes,
// styles and button labels named in data attributes: no fetch, no HTML.
import { siteHeader } from './header-behaviour.mjs';

const IMPORTANT = 'important';
// Inline styles became page classes marked !important at export, so a runtime value must be too.
const setStyle = (element, property, value) => element?.style.setProperty(property, value, IMPORTANT);
const reducedMotion = (win) => Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

// Mirrors src/blocks/reveal.js: in view (or scrolled past) now, the rest on intersection, all at once
// with reduced motion. The stagger counts within each section, as each block's hook did.
function reveal(root, win) {
  const nodes = [...root.querySelectorAll('[data-reveal]')];
  if (!nodes.length) return null;
  const counts = new Map();
  for (const node of nodes) {
    const section = node.closest('section') || root;
    const index = counts.get(section) || 0;
    counts.set(section, index + 1);
    node.style.setProperty('--gs-reveal-delay', `${(index % 4) * 70}ms`);
  }
  if (reducedMotion(win)) { nodes.forEach((node) => node.classList.add('is-in')); return null; }
  const fold = (win.innerHeight || 800) * 0.92;
  const later = nodes.filter((node) => {
    if (node.getBoundingClientRect().top < fold) { node.classList.add('is-in'); return false; }
    return true;
  });
  if (!later.length) return null;
  if (typeof win.IntersectionObserver !== 'function') { later.forEach((node) => node.classList.add('is-in')); return null; }
  const observer = new win.IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('is-in'); observer.unobserve(entry.target); }
  }, { threshold: 0.16, rootMargin: '0px 0px -6% 0px' });
  later.forEach((node) => observer.observe(node));
  return () => observer.disconnect();
}

// A disclosure: each button[aria-expanded][aria-controls] in the block opens and closes the element it
// controls. A native button already answers Enter and Space with a click.
const DISCLOSURE = 'button[aria-expanded][aria-controls]';
function disclosure(root, update) {
  const target = (button) => root.ownerDocument.getElementById(button.getAttribute('aria-controls'));
  for (const button of root.querySelectorAll(DISCLOSURE)) update(button, target(button), button.getAttribute('aria-expanded') === 'true');
  const onClick = (event) => {
    const button = event.target.closest?.(DISCLOSURE);
    if (!button || !root.contains(button)) return;
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    update(button, target(button), open);
  };
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}

// Panels "More": the body is clamped while closed; the button reads its labels from the HTML.
function more(root) {
  return disclosure(root, (button, body, open) => {
    body?.classList.toggle('is-clamped', !open);
    const label = button.getAttribute(open ? 'data-label-open' : 'data-label-closed');
    if (label) button.textContent = label;
  });
}

// FAQ: a closed answer is inert (out of the focus order and the accessibility tree) and its item loses
// `is-open`, which runs the height transition. The item is the nearest parent holding both parts.
function faq(root) {
  return disclosure(root, (button, answer, open) => {
    if (!answer) return;
    answer.toggleAttribute('inert', !open);
    let item = button.parentElement;
    while (item && item !== root && !item.contains(answer)) item = item.parentElement;
    if (item && item !== root) item.classList.toggle('is-open', open);
  });
}

// Tabs, with the ARIA tabs keyboard model: arrows move and select, Home and End jump. Each tab's index
// picks the [data-tab] parts to show; [data-tab-indicator] slides under the selected tab and
// [data-tab-fade] fades out and back in around the change.
function tabs(root, win) {
  const list = [...root.querySelectorAll('[role="tab"]')];
  if (!list.length) return null;
  const indicator = root.querySelector('[data-tab-indicator]');
  const fade = root.querySelector('[data-tab-fade]');
  let active = Math.max(0, list.findIndex((tab) => tab.getAttribute('aria-selected') === 'true'));
  let timer = 0;
  const frames = [];

  const measure = () => {
    const tab = list[active];
    setStyle(indicator, 'width', `${tab.offsetWidth}px`);
    setStyle(indicator, 'transform', `translateX(${tab.offsetLeft}px)`);
  };
  const show = (index) => {
    for (const part of root.querySelectorAll('[data-tab]')) part.hidden = part.getAttribute('data-tab') !== String(index);
    const panel = root.ownerDocument.getElementById(list[index].getAttribute('aria-controls'));
    if (panel && list[index].id) panel.setAttribute('aria-labelledby', list[index].id);
  };
  const select = (index) => {
    if (index === active) return;
    active = index;
    list.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; });
    if (indicator) measure();
    win.clearTimeout(timer);
    if (!fade || reducedMotion(win)) { fade?.classList.remove('is-swapping'); show(index); return; }
    fade.classList.add('is-swapping');
    timer = win.setTimeout(() => { show(index); fade.classList.remove('is-swapping'); }, 220);
  };
  const onClick = (event) => {
    const index = list.indexOf(event.target.closest?.('[role="tab"]'));
    if (index !== -1) select(index);
  };
  const onKey = (event) => {
    const index = list.indexOf(event.target.closest?.('[role="tab"]'));
    if (index === -1) return;
    const last = list.length - 1;
    const next = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: last }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const wrapped = (next + list.length) % list.length;
    select(wrapped);
    list[wrapped].focus();
  };

  show(active);
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKey);
  if (indicator) {
    // The indicator needs layout and settled fonts, then follows the tabs as they reflow.
    frames.push(win.requestAnimationFrame(() => frames.push(win.requestAnimationFrame(measure))));
    win.document.fonts?.ready.then(measure, () => {});
    win.addEventListener('resize', measure, { passive: true });
  }
  return () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('keydown', onKey);
    win.removeEventListener('resize', measure);
    frames.forEach((frame) => win.cancelAnimationFrame(frame));
    win.clearTimeout(timer);
  };
}

// The /climb map (src/blocks/MaturityMap.jsx): scrolling through the pinned stage draws the trail, walks
// the climber up it, fills the progress bar and lights each tier as it is reached. With reduced motion it
// settles at the summit, as the stylesheet unpins it.
export const CLIMB_TRIGGERS = [0, 0.42, 0.78];
function climb(root, win) {
  const trail = root.querySelector('.trail-draw');
  const climber = root.querySelector('.climber');
  if (!trail || !climber || typeof trail.getTotalLength !== 'function') return null;
  const fill = root.querySelector('.climb-fill');
  const percent = root.querySelector('.climb-pct');
  const summit = root.querySelector('.summit-glow');
  const cap = root.querySelector('.peak-cap');
  const labels = [...root.querySelectorAll('.tier-glow-lbl')];
  const cards = [...root.querySelectorAll('.tier-card')];
  const length = trail.getTotalLength();
  trail.style.strokeDasharray = length;
  let frame = 0;
  let progress = 0;

  const apply = () => {
    frame = 0;
    trail.style.strokeDashoffset = length * (1 - progress);
    const point = trail.getPointAtLength(length * progress);
    climber.setAttribute('transform', `translate(${point.x},${point.y})`);
    const whole = Math.round(progress * 100);
    setStyle(fill, 'width', `${whole}%`);
    if (percent) percent.textContent = `${whole}%`;
    CLIMB_TRIGGERS.forEach((trigger, i) => {
      const next = i < CLIMB_TRIGGERS.length - 1 ? CLIMB_TRIGGERS[i + 1] : 1.01;
      setStyle(labels[i], 'opacity', progress >= trigger - 0.001 ? '1' : '0.45');
      cards[i]?.classList.toggle('active', progress >= trigger - 0.04 && progress < next);
    });
    const peak = Math.max(0, (progress - 0.78) / 0.22);
    setStyle(summit, 'opacity', (peak * 0.9).toFixed(3));
    setStyle(cap, 'opacity', (0.25 + peak * 0.75).toFixed(3));
  };
  if (reducedMotion(win)) { progress = 1; apply(); return null; }
  const compute = () => {
    const scrollable = root.offsetHeight - win.innerHeight;
    const passed = Math.min(Math.max(-root.getBoundingClientRect().top, 0), scrollable);
    progress = scrollable > 0 ? passed / scrollable : 0;
    if (!frame) frame = win.requestAnimationFrame(apply);
  };
  win.addEventListener('scroll', compute, { passive: true });
  win.addEventListener('resize', compute);
  compute();
  return () => {
    win.removeEventListener('scroll', compute);
    win.removeEventListener('resize', compute);
    if (frame) win.cancelAnimationFrame(frame);
  };
}

// MethodTieIn's pillar chart: the bars grow once, when 30% of the chart is in view (at once when it
// already is, or with reduced motion).
function grow(root, win) {
  const done = () => root.classList.add('is-grown');
  const box = root.getBoundingClientRect();
  if (reducedMotion(win) || (box.top < (win.innerHeight || 800) * 0.85 && box.bottom > 0) || typeof win.IntersectionObserver !== 'function') { done(); return null; }
  const observer = new win.IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) { done(); observer.disconnect(); }
  }, { threshold: 0.3 });
  observer.observe(root);
  return () => observer.disconnect();
}

// A carousel: the slides are the children of [data-carousel-track], a scroll-snap row the page CSS lays
// out, so it swipes and scrolls with no script. This adds [data-carousel-prev] / [data-carousel-next],
// [data-carousel-dot="<index>"] (aria-current on the shown one), arrow keys, and data-autoplay="<ms>"
// (at least 3000), which pauses on hover, focus, a hidden tab, reduced motion or [data-carousel-pause]
// (aria-pressed). The shown slide gets `is-active`.
//
// It loops for ever, both ways: copies of the last slides sit before the first and copies of the first
// after the last ([data-carousel-clone], aria-hidden and inert, so a screen reader and Tab never meet
// them). A step past either end scrolls on to a copy, and once the scroll settles the track jumps, with
// no animation, to the real slide the copy mirrors. One slide gets no copies and no loop.
const CAROUSEL_COPIES = 2; // enough to fill the track beside a slide narrower than it (the 75% cards)
function carousel(root, win) {
  const track = root.querySelector('[data-carousel-track]');
  const slides = track ? [...track.children].filter((slide) => !slide.hasAttribute('data-carousel-clone')) : [];
  const count = slides.length;
  if (count < 2) return null;
  const dots = [...root.querySelectorAll('[data-carousel-dot]')];
  const pause = root.querySelector('[data-carousel-pause]');
  const every = Number(root.getAttribute('data-autoplay')) || 0;
  let active = -1;
  let hovered = false;
  let timer = 0;
  let frame = 0;
  let idle = 0;

  const copy = (slide) => {
    const node = slide.cloneNode(true);
    for (const part of [node, ...node.querySelectorAll('[id]')]) part.removeAttribute('id');
    node.setAttribute('data-carousel-clone', '');
    node.setAttribute('aria-hidden', 'true');
    node.setAttribute('inert', '');
    return node;
  };
  const lead = slides.slice(-CAROUSEL_COPIES).map(copy);
  const tail = slides.slice(0, CAROUSEL_COPIES).map(copy);
  track.prepend(...lead);
  track.append(...tail);
  const all = [...lead, ...slides, ...tail];
  const first = lead.length; // where the real slides start in `all`
  const slideOf = (i) => (i - first + count * CAROUSEL_COPIES) % count; // the real slide `all[i]` shows
  const at = (i) => all[i].offsetLeft - all[0].offsetLeft; // the scroll position that shows `all[i]`
  const loop = () => at(first + count) - at(first); // one full turn, in pixels
  // Every position has a twin one turn away that looks the same, so moving between twins is invisible.
  const jump = (left) => { track.scrollLeft = left; };

  const mark = (index) => {
    if (index === active) return;
    active = index;
    all.forEach((slide, i) => slide.classList.toggle('is-active', slideOf(i) === index));
    dots.forEach((dot) => (dot.getAttribute('data-carousel-dot') === String(index) ? dot.setAttribute('aria-current', 'true') : dot.removeAttribute('aria-current')));
  };
  // The shown slide is the one whose position is nearest the track's.
  const nearest = (match = () => true) => {
    const left = track.scrollLeft;
    let best = -1;
    all.forEach((slide, i) => { if (match(i) && (best < 0 || Math.abs(at(i) - left) < Math.abs(at(best) - left))) best = i; });
    return best;
  };
  // At rest the track sits on the real slides, never on a copy.
  const settle = () => {
    const turn = loop();
    if (!turn) return;
    const left = track.scrollLeft;
    if (left < at(first) - 1) jump(left + turn);
    else if (left >= at(first) + turn - 1) jump(left - turn);
  };
  // `step` is the way the visitor asked to travel (1, -1, or 0 for a dot, which takes the short way).
  const go = (index, step = 0) => {
    const next = (index + count) % count;
    const ahead = () => nearest((i) => slideOf(i) === next && (at(i) - track.scrollLeft) * step > 1);
    let target = step ? ahead() : -1;
    if (target < 0 && step) {
      // Presses faster than the scroll can settle ran out of copies: carry on from the twin behind.
      const twin = track.scrollLeft - step * loop();
      if (twin >= 0 && twin <= track.scrollWidth - track.clientWidth) { jump(twin); target = ahead(); }
    }
    if (target < 0) target = nearest((i) => slideOf(i) === next);
    track.scrollTo?.({ left: at(target), behavior: reducedMotion(win) ? 'auto' : 'smooth' });
    mark(next);
  };
  const paused = () => hovered || root.contains(win.document.activeElement) || win.document.hidden || reducedMotion(win) || pause?.getAttribute('aria-pressed') === 'true';
  const schedule = () => {
    win.clearTimeout(timer);
    if (every >= 3000) timer = win.setTimeout(() => { if (!paused()) go(active + 1, 1); schedule(); }, every);
  };

  const onClick = (event) => {
    const target = event.target.closest?.('[data-carousel-prev],[data-carousel-next],[data-carousel-dot],[data-carousel-pause]');
    if (!target || !root.contains(target)) return;
    if (target === pause) { pause.setAttribute('aria-pressed', String(pause.getAttribute('aria-pressed') !== 'true')); return; }
    if (target.hasAttribute('data-carousel-dot')) go(Number(target.getAttribute('data-carousel-dot')) || 0);
    else { const step = target.hasAttribute('data-carousel-next') ? 1 : -1; go(active + step, step); }
    schedule();
  };
  const onKey = (event) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step || event.target.closest?.('input,textarea,select,[role="tab"]')) return;
    event.preventDefault();
    go(active + step, step);
    schedule();
  };
  // A swipe, drag or trackpad scroll: follow it, and when it stops (or meets the last copy) return to the
  // real slides. `scrollend` where the browser has it; the timer covers the ones that do not.
  const rest = () => { win.clearTimeout(idle); settle(); mark(slideOf(nearest())); };
  const onScroll = () => {
    if (track.scrollLeft <= 0 || track.scrollLeft >= track.scrollWidth - track.clientWidth) settle();
    if (!frame) frame = win.requestAnimationFrame(() => { frame = 0; mark(slideOf(nearest())); });
    win.clearTimeout(idle);
    if (!('onscrollend' in win)) idle = win.setTimeout(rest, 160);
  };
  const onResize = () => jump(at(first + active));
  const enter = () => { hovered = true; };
  const leave = () => { hovered = false; };

  mark(0);
  jump(at(first));
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKey);
  root.addEventListener('pointerenter', enter);
  root.addEventListener('pointerleave', leave);
  track.addEventListener('scroll', onScroll, { passive: true });
  track.addEventListener('scrollend', rest);
  win.addEventListener('resize', onResize);
  schedule();
  return () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('keydown', onKey);
    root.removeEventListener('pointerenter', enter);
    root.removeEventListener('pointerleave', leave);
    track.removeEventListener('scroll', onScroll);
    track.removeEventListener('scrollend', rest);
    win.removeEventListener('resize', onResize);
    win.clearTimeout(timer);
    win.clearTimeout(idle);
    if (frame) win.cancelAnimationFrame(frame);
    [...lead, ...tail].forEach((node) => node.remove());
    jump(slides[Math.max(active, 0)].offsetLeft - slides[0].offsetLeft);
  };
}

// A marquee (GRE-5823): one row the page CSS slides for ever ([data-marquee-track], the items once and
// then an aria-hidden copy, translated by half). Hover, focus and reduced motion hold it in CSS alone;
// this adds the [data-carousel-pause] button (aria-pressed), which sets `data-paused` on the root for
// visitors on touch, who cannot hover.
function marquee(root, win) {
  const pause = root.querySelector('[data-carousel-pause]');
  if (!root.querySelector('[data-marquee-track]') || !pause) return null;
  const onClick = (event) => {
    if (!pause.contains(event.target)) return;
    const held = pause.getAttribute('aria-pressed') !== 'true';
    pause.setAttribute('aria-pressed', String(held));
    root.toggleAttribute('data-paused', held);
  };
  root.addEventListener('click', onClick);
  return () => { root.removeEventListener('click', onClick); root.removeAttribute('data-paused'); };
}

export const BEHAVIOURS = { more, faq, tabs, climb, grow, carousel, marquee, 'site-header': siteHeader };

// GRE-4310: an island can attach its own element's behaviour, and the page region scan can find the same
// element too. Each element is attached once; the first caller owns the detach.
const attached = new WeakSet();
export function attachBehaviour(element, win = element?.ownerDocument?.defaultView, context = {}) {
  const name = element?.getAttribute('data-behaviour');
  if (!win || !Object.hasOwn(BEHAVIOURS, name) || attached.has(element)) return () => {};
  attached.add(element);
  const stop = BEHAVIOURS[name](element, win, context);
  return () => { attached.delete(element); stop?.(); };
}

// Attaches every behaviour inside `root` (a region of the page). `context` carries what a behaviour needs
// to know about the page (the header's: path, title and the analytics `track`). Returns one function
// that detaches them all.
export function attachBehaviours(root, win = root?.ownerDocument?.defaultView, context = {}) {
  if (!root || !win) return () => {};
  const detach = [reveal(root, win)];
  for (const element of root.querySelectorAll('[data-behaviour]')) detach.push(attachBehaviour(element, win, context));
  return () => detach.forEach((stop) => stop?.());
}
