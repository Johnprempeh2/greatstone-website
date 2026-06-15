// Tiny site store, persisted to localStorage. This stands in for the Laravel page-JSON
// endpoint the devs will build: the page shape (draft `data`, `published`, `status`, `seo`,
// `versions`) mirrors the rails they're building, so swapping to a real backend is a
// data-source change, not a rewrite.
import seedPages from './seed-pages.json';
import { config } from './puck.config.jsx';

const KEY = 'gs-studio-v11';

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
  return { title, background, status, seo: seo || { title: title + ' — Greatstone International', description: '', ogImage: '' }, data, published: data, versions: [], statusHistory: [], approvedBy: null };
}

// the editorial state machine: who can move where (the future Laravel backend enforces this
// server-side; here it makes the status real instead of a label). Approving + publishing need
// the `publish` capability (admins); editors propose by requesting review.
export const TRANSITIONS = { draft: ['review'], review: ['approved', 'draft'], approved: ['published', 'draft'], published: ['draft'] };
export const canTransition = (from, to) => !!(TRANSITIONS[from] && TRANSITIONS[from].includes(to));

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
          ctaLabel: 'Book a Deep Dive', ctaHref: '#book', email: 'dx@greatstonesoftware.co.uk',
        }),
      ], { title: 'Greatstone International — The Foundation of Digital Excellence', description: 'A transformation partner, not a software house. Twenty years modernising how organisations work, with AI as the accelerator.', ogImage: '' }),

      method: seedPage('Method', 'summit', [
        blk('Hero', { kicker: 'The Climb', headline: 'Pebble. Plateau.', highlight: 'Peak.', body: 'Where you stand on the climb decides the route up. This page rides the summit terrain as it grows beneath you.', prompt: '', align: 'left', size: 'full', ctaLabel: '', ctaHref: '#book' }),
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

      contact: seedPage('Contact', 'tide', [
        blk('TimeCounter', {
          kicker: 'The one thing you can’t make more of',
          headline: 'You can’t buy time.', highlight: 'We’re the exception.',
          body: 'It moves in one direction and never comes back. The whole of business is a fight to spend less of it on the wrong things. That fight is what we win for you.',
          clockLabel: 'Slipping past since you arrived', coda: '', ctaLabel: '', ctaHref: '#book',
        }),
        blk('BookDeepDive', {
          eyebrow: 'Tell us where the week goes', headline: 'Book a', highlight: 'Deep Dive.',
          body: 'Two hours of our time and a sharper picture of yours. No deck to sit through, no obligation after.',
          submitLabel: 'Book a Deep Dive', asideHeading: 'What you walk away with',
          asidePoints: [
            { title: 'A scored read', text: 'across all eight pillars of the method.' },
            { title: 'The Periscope Report', text: 'where you stand and the fastest gains.' },
            { title: 'A phased roadmap', text: 'the route up, embedded in how you already work.' },
          ],
          email: 'dx@greatstonesoftware.co.uk',
        }),
        blk('Steps', {
          index: '01', eyebrow: 'How a Deep Dive Works', headline: 'Three steps.', highlight: 'No theatre.',
          body: 'We diagnose, we report, we build. Each layer settles before the next one lands.',
          items: [
            { title: 'Diagnostic', text: 'We map where the week goes, across all eight pillars.' },
            { title: 'Periscope Report', text: 'A clear read of where you stand and the fastest gains.' },
            { title: 'Phased Roadmap', text: 'The build, embedded into how you already work, not bolted on.' },
          ],
        }),
        blk('ContactBand', {
          kicker: 'Rather just talk?', heading: 'Reach us direct.',
          body: 'No forms, no gatekeeping. Write a line about where your week goes and we’ll write back with where it could go instead.',
          email: 'dx@greatstonesoftware.co.uk',
          cardKicker: 'Before you book', cardStat: '45', cardStatUnit: 'seconds',
          cardHeading: 'See the hours, in your own numbers',
          cardBody: 'A short read of what a Deep Dive surfaces, before you spend a minute on the call.',
        }),
      ], { title: 'Book a Deep Dive — Greatstone International', description: 'You still can’t buy time. Let’s save yours. Book a Deep Dive: the first step costs nothing.', ogImage: '' }),
  };
  // fold in the rest of the site, converted from the live pages into editable blocks
  seedPages.forEach((p) => {
    pages[p.slug] = seedPage(p.title, p.background, p.blocks.map((b) => blk(b.type, b.props)), p.seo);
  });
  const order = ['home', 'method', 'services', 'industries', 'proof', 'about', 'insights', 'climb', 'contact'].filter((s) => pages[s]);
  return { settings: { background: 'stone-summit', siteName: 'Greatstone International' }, order, pages, assets: {} };
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
    if (!Array.isArray(p.statusHistory)) p.statusHistory = [];
    if (p.approvedBy === undefined) p.approvedBy = null;
  });
  if (!state.settings) state.settings = { background: 'stone-summit', siteName: 'Greatstone International' };
  if (!state.assets) state.assets = {};
  return state;
}

// ---- media library (stand-in for the future Laravel media / S3 endpoint) ----
// Assets are a registry of image URLs (+ alt) the team has used, so they can be re-picked
// across blocks. Blocks store the URL itself as the prop value (kept serialisable + decoupled),
// not an id — the library is for reuse, not resolution.
export function addAsset(state, asset) {
  if (!asset || !asset.url) return state;
  const assets = state.assets || {};
  if (Object.values(assets).some((a) => a.url === asset.url)) return state; // dedupe by url
  const id = rid('asset');
  return { ...state, assets: { ...assets, [id]: { id, url: asset.url, alt: asset.alt || '', ts: Date.now() } } };
}
export function removeAsset(state, id) {
  const assets = { ...(state.assets || {}) }; delete assets[id];
  return { ...state, assets };
}
export function listAssets(state) {
  return Object.values(state.assets || {}).sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

export function persist(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { return false; }
}

export function slugify(title) {
  return (title || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'page';
}

export function addPageTo(state, title) {
  let slug = slugify(title); let n = 2;
  while (state.pages[slug]) slug = slugify(title) + '-' + n++;
  const page = seedPage(title, state.settings.background || 'stone', [
    blk('Hero', { kicker: 'New page', headline: title, highlight: '', body: 'Start composing. Drag blocks in the editor, set the background, publish.', prompt: '', align: 'left', size: 'full', ctaLabel: '', ctaHref: '#book' }),
  ], null, 'draft');
  return { ...state, order: [...state.order, slug], pages: { ...state.pages, [slug]: page }, _goto: slug };
}

// keep at most the last 20 snapshots; newest first. snap = { label, data, by?, status? }
export function pushVersion(versions, snap) {
  return [{ ts: Date.now(), ...snap }, ...(versions || [])].slice(0, 20);
}

// ---- page management (the ops a real content team needs) ----
export function removePage(state, slug) {
  if (!state.pages[slug] || state.order.length <= 1) return state;
  const pages = { ...state.pages }; delete pages[slug];
  return { ...state, order: state.order.filter((s) => s !== slug), pages, _goto: state.order.find((s) => s !== slug) };
}

export function duplicatePage(state, slug) {
  const src = state.pages[slug]; if (!src) return state;
  let dup = slugify(src.title + ' copy'); let n = 2;
  while (state.pages[dup]) dup = slugify(src.title + ' copy') + '-' + n++;
  const title = src.title + ' copy';
  const clone = JSON.parse(JSON.stringify({ ...src, title, status: 'draft', versions: [], statusHistory: [], approvedBy: null }));
  // fresh block ids so the clone is independent
  if (clone.data && clone.data.content) clone.data.content.forEach((b) => { b.props = { ...b.props, id: rid(b.type) }; });
  clone.data.root = { props: { title } };
  clone.published = clone.data;
  const i = state.order.indexOf(slug);
  const order = [...state.order]; order.splice(i + 1, 0, dup);
  return { ...state, order, pages: { ...state.pages, [dup]: clone }, _goto: dup };
}

export function renamePage(state, slug, title) {
  const p = state.pages[slug]; if (!p || !title) return state;
  const data = { ...p.data, root: { ...(p.data.root || {}), props: { ...((p.data.root || {}).props || {}), title } } };
  return { ...state, pages: { ...state.pages, [slug]: { ...p, title, data } } };
}

export function movePage(state, slug, dir) {
  const order = [...state.order]; const i = order.indexOf(slug); const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return state;
  [order[i], order[j]] = [order[j], order[i]];
  return { ...state, order };
}

// re-key a page's slug (the slug IS the map key + an entry in order). Records a redirect
// intent so the future backend can 301 the old path.
export function setSlug(state, oldSlug, nextRaw) {
  let next = slugify(nextRaw); let n = 2;
  if (next === oldSlug || !state.pages[oldSlug]) return state;
  while (state.pages[next]) next = slugify(nextRaw) + '-' + n++;
  const pages = {}; Object.keys(state.pages).forEach((k) => { pages[k === oldSlug ? next : k] = state.pages[k]; });
  const order = state.order.map((s) => (s === oldSlug ? next : s));
  const redirects = [...(state.redirects || []), { from: oldSlug, to: next, ts: Date.now() }];
  return { ...state, order, pages, redirects, _goto: next };
}
