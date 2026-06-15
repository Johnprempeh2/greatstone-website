// Tiny site store, persisted to localStorage. This stands in for the Laravel page-JSON
// endpoint the devs will build: the page shape (draft `data`, `published`, `status`, `seo`,
// `versions`) mirrors the rails they're building, so swapping to a real backend is a
// data-source change, not a rewrite.
import seedPages from './seed-pages.json';
import { config } from './puck.config.jsx';
import { STAGE_OPTIONS } from './stage-presets.js';

// Stable key — the schema version lives INSIDE the payload (state.schema), so a version bump
// migrates the existing row forward instead of orphaning it under a new key (which silently wiped
// drafts/history/media). This is the contract the Laravel backend will use: one row, versioned,
// migrations run against it. OLD_KEYS are read once so anyone mid-flight on the old key carries over.
const KEY = 'gs-studio';
const OLD_KEYS = ['gs-studio-v11'];
const SCHEMA = 12;

let _seq = 0;
// one canonical id generator (block/scene/asset ids must be unique within a page — they key both
// the gs-blk-<id> background anchors and the duplicate-page remap). Exported so App + panels share it.
export const rid = (t) => t.toLowerCase() + '-' + (_seq++).toString(36) + Math.random().toString(36).slice(2, 6);
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
  return { schema: SCHEMA, settings: { background: 'stone-summit', siteName: 'Greatstone International' }, order, pages, assets: {} };
}

export function load() {
  try {
    let raw = localStorage.getItem(KEY);
    if (!raw) { // first run on the stable key: carry over any prior versioned-key data, then drop it
      for (const k of OLD_KEYS) { const old = localStorage.getItem(k); if (old) { raw = old; try { localStorage.removeItem(k); } catch (e) { /* ignore */ } break; } }
    }
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { /* ignore */ }
  return seedState();
}

// tolerate older/partial shapes so a saved draft never crashes the editor; branch on the in-payload
// schema version so future shape changes have a real forward-migration path (and never re-wipe data)
function migrate(state) {
  if (!state || !state.pages) return seedState();
  Object.values(state.pages).forEach((p) => {
    if (!p.status) p.status = 'published';
    if (!p.seo) p.seo = { title: (p.title || 'Page') + ' — Greatstone International', description: '', ogImage: '' };
    if (!Array.isArray(p.versions)) p.versions = [];
    if (!Array.isArray(p.statusHistory)) p.statusHistory = [];
    if (p.approvedBy === undefined) p.approvedBy = null;
    if (p.published == null) p.published = p.data; // never strand a page with no renderable live content
  });
  if (!state.settings) state.settings = { background: 'stone-summit', siteName: 'Greatstone International' };
  if (!state.assets) state.assets = {};
  state.schema = SCHEMA;
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

// ---- 3D background model ----
// A page's background is either a preset id (string, what the seed + presets write) or the
// granular { v, scenes, transitions } object the editor authors. normalizeBackground expands
// the string form into the object so Stage + the editor only ever deal with one shape. The
// string→object expansion of 'stone-summit' reproduces today's smoothstep(0.40,0.70) exactly
// (at 0.55, fade 0.30). Idempotent: passing an object returns it unchanged.
export function normalizeBackground(bg) {
  if (bg && typeof bg === 'object' && Array.isArray(bg.scenes)) return bg;
  const opt = STAGE_OPTIONS.find((o) => o.id === bg) || STAGE_OPTIONS[0];
  const scenes = opt.scenes.map((kind) => ({ id: rid('sc'), kind }));
  const transitions = scenes.slice(1).map(() => ({ id: rid('tr'), at: 0.55, fade: 0.30, anchor: { type: 'scroll' } }));
  return { v: 1, scenes, transitions };
}

export function persist(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { /* quota — try to recover */ }
  // shed the heaviest, most-expendable data (oldest version snapshots) and retry a few times before
  // giving up, so a full store degrades gracefully instead of dropping the user's live edits.
  try {
    let working = state;
    for (let i = 0; i < 6; i++) {
      const trimmed = trimVersions(working);
      if (trimmed === working) break; // nothing left to shed
      working = trimmed;
      try { localStorage.setItem(KEY, JSON.stringify(working)); return true; } catch (e) { /* keep trimming */ }
    }
  } catch (e) { /* ignore */ }
  return false;
}
// drop the oldest version snapshot from whichever page holds the most — one step of graceful eviction
function trimVersions(state) {
  let target = null, max = 0;
  Object.entries(state.pages || {}).forEach(([slug, p]) => { const n = (p.versions || []).length; if (n > max) { max = n; target = slug; } });
  if (!target) return state;
  const p = state.pages[target];
  return { ...state, pages: { ...state.pages, [target]: { ...p, versions: p.versions.slice(0, -1) } } };
}

export function slugify(title) {
  return (title || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'page';
}

export function addPageTo(state, title) {
  let slug = slugify(title); let n = 2;
  while (state.pages[slug]) slug = slugify(title) + '-' + n++;
  // match the live default ('stone-summit', not 'stone') and deep-clone object backgrounds so two
  // pages never share one mutable {scenes,transitions} object
  const dflt = state.settings.background || 'stone-summit';
  const bg = typeof dflt === 'object' ? JSON.parse(JSON.stringify(dflt)) : dflt;
  const page = seedPage(title, bg, [
    blk('Hero', { kicker: 'New page', headline: title, highlight: '', body: 'Start composing. Drag blocks in the editor, set the background, publish.', prompt: '', align: 'left', size: 'full', ctaLabel: '', ctaHref: '#book' }),
  ], null, 'draft');
  return { ...state, order: [...state.order, slug], pages: { ...state.pages, [slug]: page }, _goto: slug };
}

// keep at most the last 20 snapshots; newest first. snap = { label, data, by?, status? }. Each gets a
// unique id (ts alone collides when two snapshots land in the same millisecond — breaks React keys).
export function pushVersion(versions, snap) {
  return [{ id: rid('v'), ts: Date.now(), ...snap }, ...(versions || [])].slice(0, 20);
}

// slugs the site wires structurally (the #book CTA resolves the contact page, the home path is '').
// Renaming them would silently misroute, so they're held fixed in this prototype.
export const RESERVED_SLUGS = ['home', 'contact'];

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
  // fresh block ids so the clone is independent (track old→new to fix block-pinned backgrounds)
  const idMap = {};
  if (clone.data && clone.data.content) clone.data.content.forEach((b) => { const nid = rid(b.type); idMap[b.props.id] = nid; b.props = { ...b.props, id: nid }; });
  if (clone.background && typeof clone.background === 'object' && Array.isArray(clone.background.transitions)) {
    clone.background.transitions = clone.background.transitions.map((tr) => (tr.anchor && tr.anchor.type === 'block' && idMap[tr.anchor.blockId]) ? { ...tr, anchor: { ...tr.anchor, blockId: idMap[tr.anchor.blockId] } } : tr);
  }
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
  if (RESERVED_SLUGS.includes(oldSlug)) return { ...state, _slugError: oldSlug }; // structural page, can't re-key
  while (state.pages[next]) next = slugify(nextRaw) + '-' + n++;
  const pages = {}; Object.keys(state.pages).forEach((k) => { pages[k === oldSlug ? next : k] = state.pages[k]; });
  const order = state.order.map((s) => (s === oldSlug ? next : s));
  // collapse chains (a→b then b→c must leave a→c, not a→dead-b) and dedupe by `from`, so the redirect
  // table stays a flat from→final map the backend can apply in one hop
  const redirects = (state.redirects || []).map((r) => (r.to === oldSlug ? { ...r, to: next } : r))
    .filter((r) => r.from !== oldSlug && r.from !== next);
  redirects.push({ from: oldSlug, to: next, ts: Date.now() });
  return { ...state, order, pages, redirects, _goto: next };
}
