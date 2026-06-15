// Tiny site store, persisted to localStorage. This stands in for the Laravel page-JSON
// endpoint the devs will build: the page shape (draft `data`, `published`, `status`, `seo`,
// `versions`) mirrors the rails they're building, so swapping to a real backend is a
// data-source change, not a rewrite.
import seedPages from './seed-pages.json';
import { config } from './puck.config.jsx';

const KEY = 'gs-studio-v6';

let _seq = 0;
const rid = (t) => t.toLowerCase() + '-' + (_seq++).toString(36) + Math.random().toString(36).slice(2, 6);
// backfill the component's defaultProps so no field (esp. a contentEditable one) is ever
// undefined in the editor — Puck's inline fields expect strings, and a missing one throws.
const blk = (type, props) => {
  const def = (config.components[type] && config.components[type].defaultProps) || {};
  return { type, props: { id: rid(type), ...def, ...props } };
};

function seedPage(title, background, content, seo, status = 'published') {
  const data = { root: { props: { title } }, content };
  return { title, background, status, seo: seo || { title: title + ' — Greatstone International', description: '', ogImage: '' }, data, published: data, versions: [] };
}

export function seedState() {
  const pages = {
      home: seedPage('Home', 'stone-summit', [
        blk('Hero', {
          kicker: '',
          headline: 'The Foundation of', highlight: 'Digital Excellence.',
          body: 'We don’t decorate businesses with technology. We build what holds everything up.',
          prompt: 'Move your cursor. The stone responds', align: 'center', size: 'full', ctaLabel: '', ctaHref: '#',
        }),
        blk('Chapter', {
          index: '01', eyebrow: 'Twenty Years Deep', headline: 'A transformation partner.', highlight: 'Not a software house.',
          body: 'For two decades our team has modernised how organisations actually work (their tools, their processes, their people), and now the intelligent layer above them all.',
          coda: 'Digital transformation first. AI as the accelerator.', align: 'left',
        }),
        blk('Chapter', {
          index: '02', eyebrow: 'Embedded, Not Advisory', headline: 'We sit inside', highlight: 'the business.',
          body: 'Shoulder-to-shoulder with the people who run it. We learn your rules, then build the system to match the business, never the other way around.',
          coda: 'No reports that gather dust. No tools for the sake of innovation.', align: 'left',
        }),
        blk('Pillars', {
          index: '03', eyebrow: 'The Methodology', headline: 'We leave no stone', highlight: 'unturned.',
          body: 'Every engagement begins with the Digital Transformation Playbook: a rigorous diagnostic across eight pillars, producing the Periscope Report, a scored view of where you stand and a phased roadmap to where you’re going.',
          items: [
            { title: 'People', text: 'Know who moves what, and set them up to move it well.' },
            { title: 'Communication', text: 'Make the value land, inside the business and out.' },
            { title: 'Innovation', text: 'A repeatable way to find the next worthwhile change.' },
            { title: 'Data', text: 'Map the lifecycle so the right decision is the easy one.' },
            { title: 'Customer', text: 'See the whole relationship, not just the last ticket.' },
            { title: 'Competition', text: 'Know the field, and where your edge actually is.' },
            { title: 'Technology', text: 'A stack that earns its keep and bends when you need it to.' },
            { title: 'Value', text: 'Tie every move back to money, time or risk.' },
          ],
        }),
        blk('Chapter', {
          index: '04', eyebrow: 'Systems That Think', headline: 'Intelligence,', highlight: 'properly integrated.',
          body: 'We build agentic systems on the stack you already own. Intelligence that reasons across your own data, with human oversight built in, delivered in sprints that earn their keep early.',
          coda: 'Privacy-first by architecture. Not wrappers. Not gimmicks.', align: 'left',
        }),
        blk('StatStrip', {
          index: '05', eyebrow: 'Proof, Not Promises', headline: 'Measured in', highlight: 'hours back.',
          body: 'Our leadership has delivered transformation for Deloitte, Lloyds, Bank of Scotland and the NHS. Today we’re embedded with clients across the UK and Africa.',
          clients: 'Deloitte · Lloyds · Bank of Scotland · NHS',
          stats: [
            { value: 21, prefix: '', suffix: '+', dec: 0, label: 'Hours recovered weekly, one engagement' },
            { value: 27, prefix: '£', suffix: 'k', dec: 0, label: 'Capacity returned annually' },
            { value: 20, prefix: '', suffix: '', dec: 0, label: 'Years of leadership heritage' },
            { value: 2, prefix: '', suffix: '', dec: 0, label: 'Continents, one team' },
          ],
        }),
        blk('Steps', {
          index: '06', eyebrow: 'How a Deep Dive Works', headline: 'Three moves to your', highlight: 'foundation.',
          body: 'No theatre, no twelve-week discovery. We diagnose, we report, we build, and each layer settles before the next one lands.',
          items: [
            { title: 'Diagnostic', text: 'We map where the week goes, across all eight pillars.' },
            { title: 'Periscope Report', text: 'A clear read of where you stand and the fastest gains.' },
            { title: 'Phased Roadmap', text: 'The build, embedded into how you already work, not bolted on.' },
          ],
        }),
        blk('Invite', {
          eyebrow: 'Start the Conversation', headline: 'The first step', highlight: 'costs nothing.',
          body: 'A Deep Dive: we learn your business and map what’s holding it back. If your organisation should work better than it does, talk to us.',
          ctaLabel: 'Book a Deep Dive', ctaHref: '#', email: 'dx@greatstonesoftware.co.uk',
        }),
      ], { title: 'Greatstone International — The Foundation of Digital Excellence', description: 'A transformation partner, not a software house. Twenty years modernising how organisations work, with AI as the accelerator.', ogImage: '' }),

      method: seedPage('Method', 'summit', [
        blk('Hero', { kicker: 'The Climb', headline: 'Pebble. Plateau.', highlight: 'Peak.', body: 'Where you stand on the climb decides the route up. This page rides the summit terrain as it grows beneath you.', prompt: '', align: 'left', size: 'full', ctaLabel: '', ctaHref: '#' }),
        blk('FeatureGrid', { kicker: 'Where you stand', heading: 'Three tiers, one route up.', items: [
          { title: 'Pebble', text: 'Surviving. Manual, reactive, held together by heroics.' },
          { title: 'Plateau', text: 'Organised. Process exists, some automation has landed.' },
          { title: 'Peak', text: 'Compounding. Intelligent, integrated, setting the pace.' },
        ]}),
        blk('PillarExplorer', {
          index: '02', eyebrow: 'The Methodology', headline: 'Explore the eight', highlight: 'pillars.',
          body: 'Every engagement begins with the Digital Transformation Playbook: a rigorous diagnostic across eight pillars. Hover a gem, or pick a pillar, to see what we read.',
          items: [
            { title: 'People', text: 'Know who moves what, and set them up to move it well.' },
            { title: 'Communication', text: 'Make the value land, inside the business and out.' },
            { title: 'Innovation', text: 'A repeatable way to find the next worthwhile change.' },
            { title: 'Data', text: 'Map the lifecycle so the right decision is the easy one.' },
            { title: 'Customer', text: 'See the whole relationship, not just the last ticket.' },
            { title: 'Competition', text: 'Know the field, and where your edge actually is.' },
            { title: 'Technology', text: 'A stack that earns its keep and bends when you need it to.' },
            { title: 'Value', text: 'Tie every move back to money, time or risk.' },
          ],
        }),
        blk('Steps', {
          index: '03', eyebrow: 'The Playbook', headline: 'Diagnose. Report.', highlight: 'Build.',
          body: 'The same three moves, whatever tier you start from.',
          items: [
            { title: 'Diagnostic', text: 'We map where the week goes, across all eight pillars.' },
            { title: 'Periscope Report', text: 'A clear read of where you stand and the fastest gains.' },
            { title: 'Phased Roadmap', text: 'The build, embedded into how you already work, not bolted on.' },
          ],
        }),
      ], { title: 'Method — Greatstone International', description: 'Pebble, plateau, peak. Where you stand on the climb decides the route up.', ogImage: '' }),

      contact: seedPage('Contact', 'none', [
        blk('Hero', { kicker: 'Find your altitude', headline: 'Let us find out where you', highlight: 'stand.', body: 'A clean canvas: this page carries no 3D background. The background is a per-page setting you control.', prompt: '', align: 'left', size: 'standard', ctaLabel: '', ctaHref: '#' }),
        blk('Invite', {
          eyebrow: 'Start the Conversation', headline: 'You still cannot buy time.', highlight: 'Let us save yours.',
          body: 'A Deep Dive scores you across all eight pillars and hands you the route up. The first step costs nothing.',
          ctaLabel: 'Book a Deep Dive', ctaHref: '#', email: 'dx@greatstonesoftware.co.uk',
        }),
      ], { title: 'Contact — Greatstone International', description: 'Book a Deep Dive. The first step costs nothing.', ogImage: '' }),
  };
  // fold in the rest of the site, converted from the live pages into editable blocks
  seedPages.forEach((p) => {
    pages[p.slug] = seedPage(p.title, p.background, p.blocks.map((b) => blk(b.type, b.props)), p.seo);
  });
  const order = ['home', 'method', 'services', 'industries', 'proof', 'about', 'insights', 'climb', 'contact'].filter((s) => pages[s]);
  return { settings: { background: 'stone-summit', siteName: 'Greatstone International' }, order, pages };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { /* ignore */ }
  return seedState();
}

// tolerate older/partial shapes so a saved draft never crashes the editor
function migrate(state) {
  if (!state || !state.pages) return seedState();
  Object.values(state.pages).forEach((p) => {
    if (!p.status) p.status = 'published';
    if (!p.seo) p.seo = { title: (p.title || 'Page') + ' — Greatstone International', description: '', ogImage: '' };
    if (!Array.isArray(p.versions)) p.versions = [];
  });
  if (!state.settings) state.settings = { background: 'stone-summit', siteName: 'Greatstone International' };
  return state;
}

export function persist(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

export function slugify(title) {
  return (title || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'page';
}

export function addPageTo(state, title) {
  let slug = slugify(title); let n = 2;
  while (state.pages[slug]) slug = slugify(title) + '-' + n++;
  const page = seedPage(title, state.settings.background || 'stone', [
    blk('Hero', { kicker: 'New page', headline: title, highlight: '', body: 'Start composing. Drag blocks in the editor, set the background, publish.', prompt: '', align: 'left', size: 'full', ctaLabel: '', ctaHref: '#' }),
  ], null, 'draft');
  return { ...state, order: [...state.order, slug], pages: { ...state.pages, [slug]: page }, _goto: slug };
}

// keep at most the last 20 snapshots; newest first
export function pushVersion(versions, label, data) {
  const snap = { ts: Date.now(), label, data };
  return [snap, ...(versions || [])].slice(0, 20);
}
