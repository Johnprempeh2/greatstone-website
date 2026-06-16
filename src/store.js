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
const SCHEMA = 19;
const clone = (x) => JSON.parse(JSON.stringify(x));

// the org/tenant. The DX dashboard is multi-tenant; the prototype runs one org but stamps orgId on
// every team/catalogue record so the data shape already carries the tenant scope the Laravel build
// enforces. organisations + per-record orgId map straight onto the tenant column + scoped queries.
const ORG = { id: 'org-greatstone', name: 'Greatstone International', slug: 'greatstone' };

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

// ---- product catalogue (north-star: Products + e-commerce) ----
// A CMS-native catalogue: products organised by category, managed from inside the studio. This is
// the prototype data model that maps 1:1 onto the dev team's Laravel Products/Categories tables.
// Prices/licences are display-only here; real checkout + licence issuance is a backend handoff.
const SEED_CATEGORIES = [
  { id: 'cat-platform', name: 'Platforms', slug: 'platforms', blurb: 'The foundations everything else is built on.' },
  { id: 'cat-automation', name: 'Automation & Workflow', slug: 'automation', blurb: 'Take the manual, repetitive work off your team’s plate.' },
  { id: 'cat-data', name: 'Data & Integration', slug: 'data', blurb: 'Make your systems talk, and your numbers tell the truth.' },
];
const SEED_PRODUCTS = [
  { id: 'prod-bedrock', slug: 'bedrock-platform', sku: 'GS-BDRK', name: 'Bedrock Platform', category: 'cat-platform', price: 'From £12,000', period: '/year', licence: 'Site licence', badge: 'Core', status: 'active',
    summary: 'The Greatstone delivery platform: workspaces, roles and audited workflows on one foundation your whole organisation builds on.',
    features: ['Unlimited workspaces', 'Role-based access + audit log', 'Bedrock API + webhooks', 'SSO-ready'] },
  { id: 'prod-slate', slug: 'slate-workflow', sku: 'GS-SLATE', name: 'Slate Workflow', category: 'cat-automation', price: 'From £180', period: '/seat/year', licence: 'Per-seat', badge: 'Popular', status: 'active',
    summary: 'Turn the processes living in inboxes and spreadsheets into governed, automated workflows, without writing code.',
    features: ['Visual workflow builder', 'Approvals + SLAs', 'Bedrock-native', '120+ connectors'] },
  { id: 'prod-quarry', slug: 'quarry-analytics', sku: 'GS-QRY', name: 'Quarry Analytics', category: 'cat-data', price: 'From £6,000', period: '/year', licence: 'Site licence', badge: '', status: 'active',
    summary: 'Operational analytics that read from the work itself, so the dashboard matches what actually happened.',
    features: ['Live operational metrics', 'Self-serve exploration', 'Scheduled briefings', 'Warehouse export'] },
  { id: 'prod-keystone', slug: 'keystone-integrations', sku: 'GS-KEY', name: 'Keystone Integrations', category: 'cat-data', price: 'From £4,500', period: '/year', licence: 'Per-connection', badge: '', status: 'active',
    summary: 'The integration layer that keeps your finance, CRM and operational systems in step, one source of truth, no copy-paste.',
    features: ['Pre-built connectors', 'Two-way sync', 'Field-level mapping', 'Failure alerting'] },
  { id: 'prod-mortar', slug: 'mortar-connect', sku: 'GS-MORT', name: 'Mortar Connect', category: 'cat-automation', price: 'From £95', period: '/seat/year', licence: 'Per-seat', badge: 'Legacy', status: 'legacy',
    summary: 'Our original point-to-point connector suite. Still supported and sold for teams that depend on it; new builds use Keystone.',
    features: ['Legacy connector library', 'Long-term support', 'Migration path to Keystone'] },
];

export function listCategories(state) { return (state && state.categories) || []; }
export function listProducts(state, categoryId) {
  const all = (state && state.products) || [];
  return categoryId ? all.filter((p) => p.category === categoryId) : all;
}
// products carry a URL slug (the #product/<slug> route) that must stay unique + url-safe. The slug is
// the shareable identity, so it's kept stable on rename; admins can edit it explicitly in the panel.
export function findProductBySlug(products, slug) {
  if (!slug) return null;
  return (products || []).find((p) => (p.slug || slugify(p.name)) === slug) || null;
}
export function productBySlug(state, slug) { return findProductBySlug(state && state.products, slug); }
// the catalogue has the same draft → published gate as pages: admins edit the DRAFT (products/categories)
// in the Products tab; the public storefront + product pages render the PUBLISHED projection. Publishing
// promotes the draft; discarding reverts it. So an in-progress price change never goes live by accident.
export function catalogHasDrift(state) {
  if (!state) return false;
  return JSON.stringify(state.products || []) !== JSON.stringify(state.publishedProducts || [])
    || JSON.stringify(state.categories || []) !== JSON.stringify(state.publishedCategories || []);
}
export function publishCatalog(state) {
  return { ...state, publishedProducts: clone(state.products || []), publishedCategories: clone(state.categories || []) };
}
export function discardCatalogDraft(state) {
  return { ...state, products: clone(state.publishedProducts || []), categories: clone(state.publishedCategories || []) };
}
function uniqueProductSlug(state, base, exceptId) {
  let slug = slugify(base) || 'product';
  const taken = (s) => (state.products || []).some((p) => p.id !== exceptId && (p.slug || slugify(p.name)) === s);
  let n = 2; const root = slug;
  while (taken(slug)) slug = root + '-' + n++;
  return slug;
}
export function addProduct(state, product) {
  const id = rid('prod');
  const base = { id, orgId: (state.org && state.org.id) || ORG.id, name: 'New product', sku: '', category: (state.categories[0] && state.categories[0].id) || '', price: '', period: '', licence: '', badge: '', status: 'active', summary: '', features: [], image: '', imageAlt: '', ...product, id };
  base.slug = uniqueProductSlug(state, product && product.slug ? product.slug : base.name, id);
  return { ...state, products: [...(state.products || []), base] };
}
export function updateProduct(state, id, patch) {
  const p = patch && patch.slug !== undefined ? { ...patch, slug: uniqueProductSlug(state, patch.slug || (state.products.find((x) => x.id === id) || {}).name, id) } : patch;
  return { ...state, products: (state.products || []).map((x) => (x.id === id ? { ...x, ...p, id } : x)) };
}
export function removeProduct(state, id) {
  return { ...state, products: (state.products || []).filter((p) => p.id !== id) };
}
export function addCategory(state, category) {
  const id = rid('cat');
  return { ...state, categories: [...(state.categories || []), { id, orgId: (state.org && state.org.id) || ORG.id, name: 'New category', slug: id, blurb: '', ...category, id }] };
}
export function removeCategory(state, id) {
  // products in a removed category fall back to uncategorised (empty category)
  return { ...state, categories: (state.categories || []).filter((c) => c.id !== id), products: (state.products || []).map((p) => (p.category === id ? { ...p, category: '' } : p)) };
}

// ---- team & roles (north-star: DX dashboard org accounts) ----
// A PROTOTYPE roster: who's on the team, their role, responsibilities and status (active / invited).
// This models the org-scoped membership + RBAC + invitations the DX Dashboard needs. It assigns
// roles and records invitations only — it creates NO real accounts, sets NO passwords, and sends
// NO email. Real multi-tenant auth, org scoping and invitation delivery are the Laravel backend
// (Spatie roles + a signed invitation link); see HANDOVER → Team & roles.
const SEED_TEAM = [
  { id: 'tm-admin', name: 'Studio Admin', email: 'admin@greatstone', role: 'admin', title: 'Studio administrator', status: 'active' },
  { id: 'tm-editor', name: 'Marketing Editor', email: 'editor@greatstone', role: 'editor', title: 'Content editor', status: 'active' },
  { id: 'tm-viewer', name: 'Reviewer', email: 'viewer@greatstone', role: 'viewer', title: 'Read-only reviewer', status: 'active' },
];
export function listTeam(state) { return (state && state.team) || []; }
export const INVITE_TTL_DAYS = 7;
// a fresh invitation envelope: the #join token, when it was sent, and a 7-day expiry. PROTOTYPE — the
// token is app-generated (not a signed server token); "accepting" only flips the roster status, it
// creates no account. The Laravel build signs the token, emails the link, and on accept provisions the
// real org user (HANDOVER → Team & roles).
function freshInvite() {
  const now = Date.now();
  return { token: rid('inv'), invitedAt: now, expiresAt: now + INVITE_TTL_DAYS * 86400000, acceptedAt: null };
}
export function inviteTeamMember(state, member) {
  const id = rid('tm');
  return { ...state, team: [...(state.team || []), { id, orgId: (state.org && state.org.id) || ORG.id, name: '', email: '', role: 'editor', title: '', status: 'invited', invitedBy: null, ...member, ...freshInvite(), id }] };
}
// re-send: re-stamp a fresh token + expiry and clear any prior acceptance, so a lapsed/expired invite
// recovers without losing the member's name/role (and the old link stops resolving).
export function resendInvite(state, id) {
  return { ...state, team: (state.team || []).map((m) => (m.id === id ? { ...m, status: 'invited', ...freshInvite() } : m)) };
}
// resolve a #join/<token> link to its invitation state, for the Accept-Invite screen to render honestly
export function inviteStatus(state, token) {
  const m = token ? (state.team || []).find((x) => x.token === token) : null;
  if (!m) return { kind: 'notfound', member: null };
  if (m.status === 'active' || m.acceptedAt) return { kind: 'accepted', member: m };
  if (m.expiresAt && Date.now() > m.expiresAt) return { kind: 'expired', member: m };
  return { kind: 'valid', member: m };
}
// accept: flip the (valid) invitation to an active member + stamp acceptedAt. PROTOTYPE — this records
// acceptance only; it does NOT sign anyone in or create credentials (that's the backend).
export function acceptInvite(state, token) {
  return { ...state, team: (state.team || []).map((m) => (m.token === token && m.status === 'invited' ? { ...m, status: 'active', acceptedAt: Date.now() } : m)) };
}
export function updateTeamMember(state, id, patch) {
  // flipping a member back to "invited" re-issues the invitation (fresh token, cleared acceptedAt), so
  // the previous #join link stops resolving and they can accept again.
  const p = patch && patch.status === 'invited' ? { ...freshInvite(), ...patch } : patch;
  return { ...state, team: (state.team || []).map((m) => (m.id === id ? { ...m, ...p, id } : m)) };
}
export function removeTeamMember(state, id) {
  return { ...state, team: (state.team || []).filter((m) => m.id !== id) };
}

// ---- activity log (audit trail) ----
// An append-only feed of who-changed-what across the catalogue and team — the gap the Laravel audit
// log fills. Page status changes already record their own history; this captures the rest. Capped so
// localStorage doesn't grow without bound. Compose it around a mutation: logActivity(addProduct(s,..), ..).
export function logActivity(state, label, by) {
  const entry = { id: rid('act'), ts: Date.now(), by: by || null, label };
  return { ...state, activity: [entry, ...(state.activity || [])].slice(0, 200) };
}

export function seedState() {
  const pages = {
      home: seedPage('Home', 'stone', [
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
        blk('Terrace', {
          index: '06', eyebrow: 'How a Deep Dive Works', headline: 'Three moves to your', highlight: 'foundation.',
          body: 'No theatre, no twelve-week discovery. We diagnose, we report, we build, and each layer settles before the next one lands.',
          slabs: [
            { n: '01', title: 'Diagnostic', body: 'We map where the week goes, across all eight pillars.' },
            { n: '02', title: 'Periscope Report', body: 'A clear read of where you stand and the fastest gains.' },
            { n: '03', title: 'Phased Roadmap', body: 'The build, embedded into how you already work, not bolted on.' },
          ],
        }),
        blk('Invite', {
          eyebrow: 'Start the Conversation', headline: 'The first step', highlight: 'costs nothing.',
          body: 'A Deep Dive: we learn your business and map what’s holding it back. If your organisation should work better than it does, talk to us.',
          ctaLabel: 'Book a Deep Dive', ctaHref: '#book', email: 'dx@greatstonesoftware.co.uk', variant: 'band',
        }),
      ], { title: 'Greatstone International — The Foundation of Digital Excellence', description: 'A transformation partner, not a software house. Twenty years modernising how organisations work, with AI as the accelerator.', ogImage: '' }),

      method: seedPage('Method', 'stone', [
        blk('Hero', { kicker: 'The Digital Transformation Playbook', headline: 'We leave no', highlight: 'stone unturned.',
          body: 'Your business has eight faces. We score every one: read where you stand, benchmark against your peers, and climb the lowest first. Move your cursor across the stone, then look inside each piece.',
          prompt: '', align: 'left', size: 'full', ctaLabel: 'Book a Deep Dive', ctaHref: '#book' }),
        blk('FeatureGrid', { kicker: 'The Approach', heading: 'One method. Eight pillars. No guesswork.',
          body: 'Most transformation starts with a tool and hunts for a problem. We start the other way round: a full, honest read of the business across eight pillars, so the work that follows is the work that actually moves you.',
          items: [
            { title: 'We score, not guess', text: 'Every pillar gets a number, a clear, defensible read of where you stand today.' },
            { title: 'We benchmark', text: 'Your scores set against your peers, so you can see the gap and the lead.' },
            { title: 'We climb the lowest first', text: 'The biggest gain is hiding in your weakest pillar. That’s where we start.' },
          ]}),
        blk('PillarCards', {}),
        blk('MaturityModel', {}),
        blk('Invite', { eyebrow: 'The First Step', headline: 'Find out where you stand.', highlight: '',
          body: 'A Deep Dive scores all eight pillars and hands you the map: where the week goes, and where the next gain is hiding.',
          ctaLabel: 'Book a Deep Dive', ctaHref: '#book', variant: 'framed' }),
      ], { title: 'Method — Greatstone International', description: 'The Digital Transformation Playbook: a scored read across eight pillars. We benchmark you against your peers and climb the lowest first.', ogImage: '' }),

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
  pages.products = productsPage();
  const order = ['home', 'method', 'services', 'industries', 'products', 'proof', 'about', 'insights', 'climb', 'contact'].filter((s) => pages[s]);
  const withOrg = (arr) => arr.map((x) => ({ ...x, orgId: ORG.id }));
  const seedProducts = withOrg(SEED_PRODUCTS); const seedCats = withOrg(SEED_CATEGORIES);
  // the catalogue ships published: draft (products/categories) and the public projection start identical
  return { schema: SCHEMA, settings: { background: 'stone', siteName: 'Greatstone International' }, order, pages, assets: {}, org: ORG,
    categories: seedCats, products: seedProducts, publishedCategories: clone(seedCats), publishedProducts: clone(seedProducts),
    team: withOrg(SEED_TEAM), activity: [] };
}

// the seeded Products page: a hero + the Storefront block (which renders the catalogue from the store)
function productsPage() {
  return seedPage('Products', 'stone', [
    blk('Hero', { kicker: 'Greatstone Software', headline: 'Software built on the same foundation.', highlight: 'Licensed, supported, yours.', body: 'The products our delivery teams build on, available to license directly. One platform, the tools around it, and the integrations that keep them honest.', align: 'center', size: 'standard', ctaLabel: 'Talk to us about licensing', ctaHref: '#book' }),
    blk('Storefront', { heading: 'The catalogue', body: 'Every licence includes onboarding and support. Prices are a guide; talk to us for volume and multi-year terms.' }),
  ], { title: 'Products — Greatstone International', description: 'Greatstone software products and licences: the Bedrock platform, Slate workflow automation, Quarry analytics and Keystone integrations.', ogImage: '' });
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
  if (!state.settings) state.settings = { background: 'stone', siteName: 'Greatstone International' };
  if (!state.assets) state.assets = {};
  // catalogue (additive): seed the product model + a Products page on first upgrade, never overwrite
  if (!Array.isArray(state.categories)) state.categories = SEED_CATEGORIES;
  if (!Array.isArray(state.products)) state.products = SEED_PRODUCTS;
  if (!Array.isArray(state.team)) state.team = SEED_TEAM;
  if (!Array.isArray(state.activity)) state.activity = [];
  // tenant scope (additive): one org + orgId stamped on every catalogue/team record
  if (!state.org) state.org = ORG;
  const oid = state.org.id;
  ['team', 'products', 'categories'].forEach((k) => { state[k] = (state[k] || []).map((x) => (x.orgId ? x : { ...x, orgId: oid })); });
  // product URL slug + SKU (additive, schema 17): backfill a unique slug from the name + an empty SKU
  {
    const seen = new Set();
    state.products = (state.products || []).map((p) => {
      let slug = p.slug || slugify(p.name) || 'product';
      const root = slug; let n = 2; while (seen.has(slug)) slug = root + '-' + n++;
      seen.add(slug);
      return p.slug === slug && p.sku !== undefined ? p : { ...p, slug, sku: p.sku || '' };
    });
  }
  // catalogue publish gate (additive, schema 18): the existing live catalogue becomes the published
  // projection, so nothing is suddenly "unpublished" on upgrade. Draft and published start identical.
  if (!Array.isArray(state.publishedProducts)) state.publishedProducts = clone(state.products || []);
  if (!Array.isArray(state.publishedCategories)) state.publishedCategories = clone(state.categories || []);
  // invitation lifecycle (additive, schema 19): give any existing pending invite a token + expiry so the
  // #join link resolves; active members don't need one. acceptedAt left undefined for already-active members.
  state.team = (state.team || []).map((m) => {
    if (m.status === 'invited' && !m.token) {
      const now = Date.now();
      return { ...m, token: rid('inv'), invitedAt: m.invitedAt || now, expiresAt: m.expiresAt || now + INVITE_TTL_DAYS * 86400000, invitedBy: m.invitedBy || null, acceptedAt: m.acceptedAt || null };
    }
    return m;
  });
  if (!state.pages.products) {
    state.pages.products = productsPage();
    if (!state.order.includes('products')) {
      const at = state.order.indexOf('industries');
      state.order.splice(at >= 0 ? at + 1 : state.order.length, 0, 'products');
    }
  }
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
