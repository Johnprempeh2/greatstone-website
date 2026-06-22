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
// Bump whenever the bundled SEED CONTENT changes (new/edited seed pages or blocks). On load, a stored
// studio whose seedVersion is older than this is re-seeded ONCE from the fresh bundle — so a deploy's
// content updates actually show for returning visitors instead of being masked by their saved store.
// Review-prototype behaviour: a bump resets in-editor drafts; between bumps, edits persist normally.
const SEED_VERSION = 20260617;

// Global site chrome settings (the logo, name, footer tagline + header CTA that wrap every page). Edited
// in the admin Site-Settings panel; the defaults below match the values previously hardcoded in Header /
// Footer / AdminConsole, so backfilling them onto an existing store changes nothing until an admin edits.
export const DEFAULT_LOGO = 'https://greatstone-home.netlify.app/assets/greatstone-logo-web.png';
const DEFAULT_SETTINGS = { background: 'stone', siteName: 'Greatstone International', logo: DEFAULT_LOGO, footerTagline: 'The Foundation of Digital Excellence', headerCtaLabel: 'Book a Deep Dive', footerEmail: 'dx@greatstonesoftware.co.uk', legalName: 'Greatstone International Ltd' };
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
  return { title, background, publishedBackground: background, status, seo: seo || { title: title + ' · Greatstone International', description: '', ogImage: '' }, data, published: data, versions: [], statusHistory: [], approvedBy: null };
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
// Greatstone resells hand-picked third-party developer software, organised by VENDOR BRAND (this is
// the real catalogue shape on greatstonesoftware.co.uk). Each category IS a vendor and carries its
// logo (logo = a URL, editable in the Products tab; domain drives a fallback). `count` is the real
// catalogue size for context. Prices are indicative guides until the full catalogue import (the
// authoritative price/SKU list comes from the vendor feed); real checkout is a backend handoff.
const vlogo = (domain) => 'https://logo.clearbit.com/' + domain; // editable per vendor; graceful-fallbacks in the card
const SEED_CATEGORIES = [
  { id: 'cat-aspose', name: 'Aspose', slug: 'aspose', domain: 'aspose.com', logo: vlogo('aspose.com'), count: 107, blurb: 'File-format automation APIs for documents, spreadsheets, slides, PDF and more, across .NET, Java, Python and Node.' },
  { id: 'cat-groupdocs', name: 'GroupDocs', slug: 'groupdocs', domain: 'groupdocs.com', logo: vlogo('groupdocs.com'), count: 32, blurb: 'Document viewing, conversion, comparison, annotation and signing APIs spanning 170+ formats.' },
  { id: 'cat-devexpress', name: 'DevExpress', slug: 'devexpress', domain: 'devexpress.com', logo: vlogo('devexpress.com'), count: 14, blurb: 'UI controls and developer productivity tools for .NET desktop, web and mobile.' },
  { id: 'cat-iron', name: 'Iron Software', slug: 'iron-software', domain: 'ironsoftware.com', logo: vlogo('ironsoftware.com'), count: 10, blurb: 'C# libraries for PDF, OCR, Excel, barcodes and web scraping.' },
  { id: 'cat-apryse', name: 'Apryse', slug: 'apryse', domain: 'apryse.com', logo: vlogo('apryse.com'), count: 9, blurb: 'Document SDKs for web, server and mobile: viewing, editing, conversion and data extraction (formerly PDFTron).' },
  { id: 'cat-iris', name: 'IRIS', slug: 'iris', domain: 'irislink.com', logo: vlogo('irislink.com'), count: 6, blurb: 'OCR, PDF and intelligent document-capture software.' },
  { id: 'cat-activepdf', name: 'ActivePDF', slug: 'activepdf', domain: 'activepdf.com', logo: vlogo('activepdf.com'), count: 5, blurb: 'PDF automation, generation and conversion tooling for .NET.' },
  { id: 'cat-pdflib', name: 'PDFlib', slug: 'pdflib', domain: 'pdflib.com', logo: vlogo('pdflib.com'), count: 4, blurb: 'Programmable PDF generation and text-extraction libraries.' },
  { id: 'cat-conholdate', name: 'Conholdate', slug: 'conholdate', domain: 'conholdate.com', logo: vlogo('conholdate.com'), count: 4, blurb: 'Combined document-processing APIs spanning the Aspose and GroupDocs families.' },
  { id: 'cat-investintech', name: 'Investintech', slug: 'investintech', domain: 'investintech.com', logo: vlogo('investintech.com'), count: 3, blurb: 'PDF creation, conversion and editing tools.' },
  { id: 'cat-nitro', name: 'Nitro', slug: 'nitro', domain: 'gonitro.com', logo: vlogo('gonitro.com'), count: 3, blurb: 'PDF productivity and e-signing for business.' },
];
// A representative slice of the real catalogue (the full ~200 imports from the vendor feed on Friday).
// Confirmed prices are marked; the rest are indicative guides ('From …') pending the authoritative feed.
const P = (vendor, name, price, opts = {}) => ({
  id: 'prod-' + slugify(name), slug: slugify(name), sku: opts.sku || '', name, category: vendor,
  price: price || '', period: opts.period || '', licence: opts.licence || 'Per developer · perpetual + 1yr support',
  badge: opts.badge || '', status: opts.status || 'active', summary: opts.summary || '', features: opts.features || [],
});
const SEED_PRODUCTS = [
  // Aspose
  P('cat-aspose', 'Aspose.Cells for .NET', '£870', { badge: 'Popular', summary: 'Create, edit and convert Excel spreadsheets in .NET without Microsoft Office.', features: ['XLS/XLSX/CSV/ODS', 'Charts + pivot tables', 'PDF + HTML export'] }),
  P('cat-aspose', 'Aspose.Words for .NET', 'From £870', { summary: 'Generate and convert Word documents programmatically: DOCX, PDF, HTML and more.', features: ['Mail merge + reporting', 'DOCX ⇄ PDF/HTML', 'No Word install'] }),
  P('cat-aspose', 'Aspose.PDF for .NET', 'From £870', { summary: 'Create, edit, render and extract from PDF documents in .NET.', features: ['Create + edit PDF', 'Form filling', 'PDF/A + redaction'] }),
  P('cat-aspose', 'Aspose.Total for .NET', 'From £3,597', { badge: 'Bundle', licence: 'Bundle · perpetual + 1yr support', summary: 'Every Aspose .NET file-format API in one developer bundle.', features: ['20+ APIs', 'Documents, sheets, slides, PDF', 'Best value'] }),
  // GroupDocs
  P('cat-groupdocs', 'GroupDocs.Viewer for .NET', 'From £1,199', { summary: 'Render 170+ document formats to HTML, image or PDF in your app, no third-party software.', features: ['170+ formats', 'HTML/Image/PDF output', 'Watermarks'] }),
  P('cat-groupdocs', 'GroupDocs.Conversion for .NET', 'From £1,199', { summary: 'Convert between documents, spreadsheets, presentations, images and PDF.', features: ['50+ formats', 'High-fidelity output', 'Server-side'] }),
  P('cat-groupdocs', 'GroupDocs.Total for .NET', 'From £4,799', { badge: 'Bundle', licence: 'Bundle · perpetual + 1yr support', summary: 'The full GroupDocs document-automation suite in one licence.', features: ['Viewer, Conversion, Comparison', 'Signature + Annotation', '170+ formats'] }),
  // DevExpress
  P('cat-devexpress', 'DevExpress Universal', '£1,563', { badge: 'Top seller', period: '/developer', licence: 'Per developer · 1yr subscription', summary: 'Every DevExpress UI control and tool for .NET in one subscription.', features: ['WinForms, WPF, Blazor, .NET MAUI', 'Reporting + Dashboard', 'Priority support'] }),
  P('cat-devexpress', 'DevExpress DXperience', 'From £1,099', { period: '/developer', licence: 'Per developer · 1yr subscription', summary: 'DevExpress UI controls for desktop and web .NET development.', features: ['WinForms + WPF + Web', 'Office-inspired controls', 'Annual updates'] }),
  P('cat-devexpress', 'DevExpress WPF Subscription', 'From £729', { period: '/developer', licence: 'Per developer · 1yr subscription', summary: 'The complete DevExpress control suite for WPF.', features: ['90+ WPF controls', 'Themes + templates', 'MVVM-ready'] }),
  // Iron Software
  P('cat-iron', 'IronPDF', 'From £599', { badge: 'Popular', summary: 'Generate, edit and read PDFs in C# from HTML, URLs or images.', features: ['HTML → PDF', 'Edit + merge', '.NET 8 ready'] }),
  P('cat-iron', 'IronOCR', 'From £599', { summary: 'Read text from images and scanned PDFs in C# with Tesseract 5.', features: ['127 languages', 'Image + PDF OCR', 'Barcode reading'] }),
  P('cat-iron', 'Iron Suite', 'From £1,498', { badge: 'Bundle', licence: 'Bundle · perpetual + 1yr support', summary: 'All nine Iron Software C# libraries for the price of two.', features: ['PDF, OCR, Excel, Barcode', 'WebScraper + more', 'Best value'] }),
  // Apryse
  P('cat-apryse', 'Apryse WebViewer', 'Contact for licence', { summary: 'A JavaScript document viewer and editor for any web app, 30+ formats.', features: ['View + annotate in-browser', 'PDF, Office, CAD, images', 'No server round-trips'] }),
  P('cat-apryse', 'Apryse PDF SDK', 'Contact for licence', { summary: 'Cross-platform document SDK: viewing, editing, conversion and data extraction.', features: ['Web, server, mobile', 'PDF + Office', 'Data extraction'] }),
  // IRIS
  P('cat-iris', 'Readiris PDF', 'From £99', { licence: 'Per user · perpetual', summary: 'Convert, edit, sign and OCR PDFs and paper documents on the desktop.', features: ['OCR 138 languages', 'PDF edit + sign', 'Batch convert'] }),
  P('cat-iris', 'IRISPowerscan', 'Contact for licence', { summary: 'High-volume scanning and intelligent document capture for the enterprise.', features: ['Batch capture', 'Classification + extraction', 'Export to ECM'] }),
  // ActivePDF
  P('cat-activepdf', 'ActivePDF Toolkit', 'Contact for licence', { licence: 'Server licence', summary: 'Programmatically create, manipulate and assemble PDFs in .NET.', features: ['Create + stamp + merge', 'Form fill', 'Server-side'] }),
  P('cat-activepdf', 'ActivePDF DocConverter', 'Contact for licence', { licence: 'Server licence', summary: 'Convert hundreds of file types to PDF and PDF/A at scale.', features: ['300+ formats', 'PDF/A archiving', 'Watched folders'] }),
  // PDFlib
  P('cat-pdflib', 'PDFlib + PDI', 'From £950', { licence: 'Per platform · perpetual', summary: 'Generate PDF on the fly and import pages from existing PDFs.', features: ['Programmatic PDF', 'Page import (PDI)', 'Cross-platform'] }),
  P('cat-pdflib', 'PDFlib TET', 'From £950', { licence: 'Per platform · perpetual', summary: 'Text and image extraction toolkit for PDF content.', features: ['Text + table extraction', 'Geometry-aware', 'Search indexing'] }),
  // Conholdate
  P('cat-conholdate', 'Conholdate.Total for .NET', 'From £4,799', { badge: 'Bundle', licence: 'Bundle · perpetual + 1yr support', summary: 'Aspose and GroupDocs document APIs combined in one .NET licence.', features: ['Two families, one bundle', '170+ formats', 'Best coverage'] }),
  // Investintech
  P('cat-investintech', 'Able2Extract Professional', 'From £130', { licence: 'Per user · perpetual', summary: 'Convert, edit and create PDFs, with accurate PDF-to-Excel conversion.', features: ['PDF ⇄ Excel/Word', 'OCR scanned PDFs', 'Edit + redact'] }),
  // Nitro
  P('cat-nitro', 'Nitro PDF Pro', 'From £140', { period: '/user/year', licence: 'Per user · subscription', summary: 'Create, edit, convert and e-sign PDFs across the business.', features: ['Edit + convert', 'e-Sign included', 'Office integration'] }),
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
  return { ...state, categories: [...(state.categories || []), { id, orgId: (state.org && state.org.id) || ORG.id, name: 'New vendor', slug: id, blurb: '', logo: '', domain: '', count: 0, ...category, id }] };
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
          kicker: 'Greatstone International',
          headline: 'The Foundation of', highlight: 'Digital Excellence.',
          body: 'We don’t decorate businesses with technology. We build what holds everything up.',
          prompt: '', align: 'center', size: 'full', ctaLabel: 'Book a Deep Dive', ctaHref: '#book', scrollCue: true,
        }),
        blk('Chapter', {
          index: '01', eyebrow: 'Twenty Years Deep', headline: 'A transformation partner. Not a software house.', highlight: '',
          body: 'For two decades our team has modernised how organisations actually work (their **tools**, their **processes**, their **people**), and now the intelligent layer above them all.',
          coda: 'Digital transformation first. AI as the accelerator.', align: 'left',
        }),
        blk('Chapter', {
          index: '02', eyebrow: 'Embedded, Not Advisory', headline: 'We sit inside the business.', highlight: '',
          body: 'Shoulder-to-shoulder with the people who run it. We learn your rules, then build the system to match the business, **never the other way around**.',
          coda: 'No reports that gather dust. No tools for the sake of innovation.', align: 'left',
        }),
        blk('Chapter', {
          index: '03', eyebrow: 'The Methodology', headline: 'We leave no stone unturned.', highlight: '',
          body: 'Every engagement begins with the **Digital Transformation Playbook**: a rigorous diagnostic across **eight pillars**, producing the Periscope Report, a scored view of where you stand and a phased roadmap to where you’re going.',
          coda: '', align: 'center', ctaLabel: 'Explore the eight pillars', ctaHref: '#go/method', ctaVariant: 'primary',
        }),
        blk('Chapter', {
          index: '04', eyebrow: 'Systems That Think', headline: 'Intelligence, properly integrated.', highlight: '',
          body: 'We build **agentic systems** on the stack you already own. Intelligence that reasons across your own data, with human oversight built in, delivered in sprints that earn their keep early.',
          coda: 'Privacy-first by architecture. **Not wrappers. Not gimmicks.**', align: 'left',
        }),
        blk('StatStrip', {
          index: '05', eyebrow: 'Proof, Not Promises', headline: 'Measured in hours back.', highlight: '', variant: 'cards', columns: 2,
          body: 'Our leadership has delivered transformation for **Deloitte, Lloyds, Bank of Scotland and the NHS**. Today we’re embedded with clients across the UK and Africa.',
          clients: '',
          stats: [
            { value: 21, prefix: '', suffix: '+ hrs', dec: 0, label: 'Capacity recovered weekly · one engagement' },
            { value: 27, prefix: '£', suffix: 'k', dec: 0, label: 'Capacity returned annually' },
            { value: 20, prefix: '', suffix: 'yrs', dec: 0, label: 'Leadership heritage' },
            { value: 2, prefix: '', suffix: '', dec: 0, label: 'Continents, one team' },
          ],
        }),
        blk('Terrace', {
          index: '06', eyebrow: 'How a Deep Dive Works', headline: 'Three moves to your foundation.', highlight: '',
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
      ], { title: 'Greatstone International · Foundation of Digital Excellence', description: 'A transformation partner, not a software house. Twenty years modernising how organisations work, embedding alongside your team with AI as the accelerator.', ogImage: '' }),

      method: seedPage('Process', 'stone', [
        blk('Hero', { kicker: 'The Digital Transformation Playbook', headline: 'We leave no', highlight: 'stone', headlineSuffix: ' unturned.',
          body: 'Your business has eight faces. We score every one: read where you stand, benchmark against your peers, and climb the lowest first. Move your cursor across the stone, then look inside each piece.',
          prompt: '', align: 'center', size: 'full',
          ctaLabel: 'Open the interactive breakdown', ctaHref: '#breakdown', ctaLabel2: 'Book a Deep Dive', ctaHref2: '#book' }),
        blk('FeatureGrid', { kicker: 'The Approach', heading: 'One method. Eight pillars. No guesswork.', variant: 'principles',
          body: 'Most transformation starts with a tool and hunts for a problem. We start the other way round: a full, honest read of the business across eight pillars, so the work that follows is the work that actually moves you.',
          items: [
            { n: '01', title: 'We score, not guess', text: 'Every pillar gets a number, a clear, defensible read of where you stand today.' },
            { n: '02', title: 'We benchmark', text: 'Your scores set against your peers, so you can see the gap and the lead.' },
            { n: '03', title: 'We climb the lowest first', text: 'The biggest gain is hiding in your weakest pillar. That’s where we start.' },
          ]}),
        blk('PillarCards', {}),
        blk('MaturityModel', {}),
        blk('Invite', { eyebrow: 'The First Step', headline: 'Find out where you stand.', highlight: '',
          body: 'A Deep Dive scores all eight pillars and hands you the map: where the week goes, and where the next gain is hiding.',
          ctaLabel: 'Book a Deep Dive', ctaHref: '#book', variant: 'framed' }),
      ], { title: 'Process · Eight Pillars · Greatstone International', description: 'The Digital Transformation Playbook scores your business across eight pillars, benchmarks you against your peers, and climbs the lowest first to win hours back.', ogImage: '' }),

      contact: seedPage('Contact', 'tide', [
        blk('TimeCounter', {}),
        blk('BookDeepDive', {
          eyebrow: 'The first step', headline: 'Tell us where the week goes', highlight: '',
          body: 'Two minutes here saves us an hour later. The more honest the picture, the sharper the dive.',
          submitLabel: 'Book a Deep Dive',
          email: 'dx@greatstonesoftware.co.uk',
        }),
        blk('Steps', {
          index: '', eyebrow: 'What happens next', headline: 'Three steps.', highlight: 'No theatre.', align: 'center', numberStyle: 'text',
          body: 'From the moment you book to the moment you see the hours, the path is short and plainly worth your time.',
          items: [
            { phase: 'Within 24 hours', title: 'We read your week', text: 'We take what you’ve told us and map it against the eight pillars before we ever speak, so the call starts where most engagements end.', timing: 'A short reply, a held slot' },
            { phase: 'The deep dive', title: '30 focused minutes', text: 'We sit with you, pull on the threads, and surface where the hours are draining. You’ll feel the difference between advice and a foundation being laid.', timing: 'One session, real findings' },
            { phase: 'The hours, costed', title: 'A picture you can act on', text: 'You leave with a clear read on what your week is quietly costing you, and exactly where Greatstone buys it back. No deck. No fluff.', timing: 'Yours to keep, pressure-free' },
          ],
        }),
        blk('ContactBand', {
          kicker: 'Rather just talk?', heading: 'Reach us direct.',
          body: 'No forms, no gatekeeping. Write a line about where your week goes and we’ll write back with where it could go instead.',
          email: 'dx@greatstonesoftware.co.uk',
          cardKicker: 'Before you book', cardStat: '45', cardStatUnit: 'seconds',
          cardHeading: 'Run the time-savings calculator',
          cardBody: 'Forty-five seconds to see, in your own numbers, the hours your business is quietly losing each year. The deep dive picks up exactly where it leaves off.',
          cardCtaLabel: 'Open the calculator', cardCtaHref: '#go/services',
        }),
      ], { title: 'Book a Deep Dive · Greatstone International', description: 'You still cannot buy time, so let us save yours. Book a Deep Dive and we map where your week goes across eight pillars. The first step costs nothing.', ogImage: '' }),
  };
  // fold in the rest of the site, converted from the live pages into editable blocks
  seedPages.forEach((p) => {
    pages[p.slug] = seedPage(p.title, p.background, p.blocks.map((b) => blk(b.type, b.props)), p.seo);
  });
  pages.products = productsPage(); // kept for any deep links, but NOT in the nav — the live storefront (#shop, labelled "Products") is the catalogue
  const order = ['home', 'about', 'method', 'climb', 'services', 'industries', 'proof', 'insights', 'contact'].filter((s) => pages[s]);
  const withOrg = (arr) => arr.map((x) => ({ ...x, orgId: ORG.id }));
  const seedProducts = withOrg(SEED_PRODUCTS); const seedCats = withOrg(SEED_CATEGORIES);
  // the catalogue ships published: draft (products/categories) and the public projection start identical
  return { schema: SCHEMA, seedVersion: SEED_VERSION, settings: { ...DEFAULT_SETTINGS }, order, pages, assets: {}, org: ORG,
    categories: seedCats, products: seedProducts, publishedCategories: clone(seedCats), publishedProducts: clone(seedProducts),
    team: withOrg(SEED_TEAM), activity: [] };
}

// the seeded Products page: a hero + the Storefront block (which renders the catalogue from the store)
function productsPage() {
  return seedPage('Products', 'stone', [
    blk('Hero', { kicker: 'Software Catalogue', headline: 'Hand-picked developer software,', highlight: 'licensed and supported.', body: 'The document, PDF and developer tools your teams rely on, from the vendors who make them best. Trusted licensing, UK support, and a partner who knows the whole stack.', align: 'center', size: 'standard', ctaLabel: 'Talk to us about licensing', ctaHref: '#book' }),
    blk('Storefront', { heading: 'Browse by vendor', body: 'Hundreds of products across the vendors you already trust. Every licence includes support; prices are a guide, talk to us for volume and multi-year terms.' }),
  ], { title: 'Software Catalogue · Greatstone International', description: 'Hand-picked third-party developer software, licensed and supported by Greatstone: Aspose, DevExpress, GroupDocs, Iron Software, Apryse and more.', ogImage: '' });
}

export function load() {
  try {
    let raw = localStorage.getItem(KEY);
    if (!raw) { // first run on the stable key: carry over any prior versioned-key data, then drop it
      for (const k of OLD_KEYS) { const old = localStorage.getItem(k); if (old) { raw = old; try { localStorage.removeItem(k); } catch (e) { /* ignore */ } break; } }
    }
    if (raw) {
      const parsed = JSON.parse(raw);
      // a deploy with changed seed content (newer SEED_VERSION) re-seeds once so the updates show;
      // persist immediately so it happens on the bump, not on every load.
      if (parsed && parsed.seedVersion !== SEED_VERSION) { const fresh = seedState(); persist(fresh); return fresh; }
      return migrate(parsed);
    }
  } catch (e) { /* ignore */ }
  return seedState();
}

// tolerate older/partial shapes so a saved draft never crashes the editor; branch on the in-payload
// schema version so future shape changes have a real forward-migration path (and never re-wipe data)
function migrate(state) {
  if (!state || !state.pages) return seedState();
  Object.values(state.pages).forEach((p) => {
    if (!p.status) p.status = 'published';
    if (!p.seo) p.seo = { title: (p.title || 'Page') + ' · Greatstone International', description: '', ogImage: '' };
    // voice: the em dash is a banned AI tell. Repair any meta title persisted by an earlier seed
    // (e.g. "Greatstone International — The Foundation…") so saved sites match the current voice.
    else if (typeof p.seo.title === 'string' && / [—–] /.test(p.seo.title)) p.seo.title = p.seo.title.replace(/ [—–] /g, ' · ');
    if (!Array.isArray(p.versions)) p.versions = [];
    if (!Array.isArray(p.statusHistory)) p.statusHistory = [];
    if (p.approvedBy === undefined) p.approvedBy = null;
    // backfill the live projection ONLY for already-published pages (legacy rows); a genuine draft keeps
    // published=null so a reload can't silently re-publish it (which would defeat the draft→publish gate).
    if (p.published == null && p.status === 'published') p.published = p.data;
    // the 3D background is now part of the draft→publish flow (was applied live, bypassing publish).
    // Backfill the published background = current background for existing pages so nothing changes on the public side until the next publish.
    if (p.publishedBackground === undefined) p.publishedBackground = p.background;
  });
  // SEO meta refresh (additive, Ben's 18 Jun review; NO SEED_VERSION bump): push improved per-page
  // titles/descriptions onto saved sites, but ONLY where the stored value still matches the OLD seeded
  // default or is empty, so meta John has hand-edited in the studio is never overwritten. Idempotent:
  // once a value equals the new copy it no longer matches any OLD key and is left alone.
  {
    const SEO_UPDATES = {
      home: { oldTitles: ['Greatstone International · The Foundation of Digital Excellence'], title: 'Greatstone International · Foundation of Digital Excellence', oldDescs: ['', 'A transformation partner, not a software house. Twenty years modernising how organisations work, with AI as the accelerator.'], description: 'A transformation partner, not a software house. Twenty years modernising how organisations work, embedding alongside your team with AI as the accelerator.' },
      method: { oldTitles: ['Method · Greatstone International'], title: 'Process · Eight Pillars · Greatstone International', oldDescs: ['', 'The Digital Transformation Playbook: a scored read across eight pillars. We benchmark you against your peers and climb the lowest first.'], description: 'The Digital Transformation Playbook scores your business across eight pillars, benchmarks you against your peers, and climbs the lowest first to win hours back.' },
      contact: { oldTitles: ['Book a Deep Dive · Greatstone International'], title: 'Book a Deep Dive · Greatstone International', oldDescs: ['', 'You still can’t buy time. Let’s save yours. Book a Deep Dive: the first step costs nothing.'], description: 'You still cannot buy time, so let us save yours. Book a Deep Dive and we map where your week goes across eight pillars. The first step costs nothing.' },
      services: { oldTitles: ['Services · Greatstone International'], title: 'Services · Greatstone International', oldDescs: ['', "We don't advise, we become your foundation. One team, three moves: find the drains, build the systems, embed and scale. Full-spectrum digital excellence, problem first."], description: 'We do not advise, we become your foundation. One team, three moves: find the hours you are losing, build the systems that buy them back, then embed and scale.' },
      industries: { oldTitles: ['Industries · Greatstone International'], title: 'Industries · Greatstone International', oldDescs: ['', 'Pick your world and the rest adjusts: your drains, your numbers. The same foundation, shaped to the way your sector actually works.'], description: 'Pick your sector and the rest adjusts to your drains and your numbers. The same eight-pillar foundation, shaped to the way your industry actually works.' },
      proof: { oldTitles: ['Proof · Greatstone International'], title: 'Proof · Real Results · Greatstone International', oldDescs: ['', 'Real results from real engagements: hours given back, first-year ROI, payback inside a quarter. Anonymised case studies in real estate, healthcare and logistics.'], description: 'Real results from real engagements: hours given back, first-year ROI and payback inside a quarter. Anonymised studies in property, healthcare and logistics.' },
      about: { oldTitles: ['About · Greatstone International'], title: 'About Greatstone · Twenty Years Embedded', oldDescs: ['', 'Twenty years embedded, not advisory. Greatstone finds the hours a business is quietly losing and wins them back, becoming the foundation you build the next twenty years on.'], description: 'Twenty years embedded, not advisory. We find the hours a business is quietly losing and win them back, becoming the foundation you build the next decades on.' },
      insights: { oldTitles: ['Insights · Greatstone International', 'Insights · Field Notes · Greatstone International'], title: 'AI Intelligence · Greatstone International', oldDescs: ['', 'Field notes from inside the work: the hours businesses quietly lose, the maturity gaps no one names, and the plays that actually move the needle.', 'Field notes from inside the work: the hours businesses quietly lose, the maturity gaps no one names, and the plays that actually move the needle. No filler.'], description: "Greatstone's standing AI intelligence briefing: every meaningful move in AI, with our own read on what it means for a business modernising with it. Models ranked, themes tracked, sources shown." },
      climb: { oldTitles: ['The Climb · Greatstone International'], title: 'The Climb · Maturity Model · Greatstone International', oldDescs: ['', 'Every business sits somewhere on the mountain: pebble, plateau or peak. We meet you where you are, read where you stand, and find the shortest honest route up across all eight pillars of the method.'], description: 'Every business sits somewhere on the mountain: pebble, plateau or peak. We meet you where you are, read where you stand, and find the shortest honest route up.' },
    };
    Object.entries(SEO_UPDATES).forEach(([slug, u]) => {
      const p = state.pages && state.pages[slug];
      if (!p) return;
      if (!p.seo) p.seo = { title: '', description: '', ogImage: '' };
      if (u.oldTitles.includes(p.seo.title)) p.seo.title = u.title;
      if (u.oldDescs.includes(p.seo.description || '')) p.seo.description = u.description;
    });
  }
  // method page (additive): the "interactive breakdown" is now a FULL-SCREEN explorer at #breakdown
  // (not an inline section). On existing saved sites: drop any inline PillarExplorer that an earlier
  // build auto-inserted, and repoint the Hero "Open the interactive breakdown" CTA to #breakdown.
  {
    const mp = state.pages && state.pages.method;
    const fix = (content) => {
      if (!Array.isArray(content)) return content;
      return content
        .filter((b) => !(b && b.type === 'PillarExplorer'))
        .map((b) => (b && b.type === 'Hero' && b.props && b.props.ctaHref === '#go/method' && /interactive breakdown/i.test(b.props.ctaLabel || '')
          ? { ...b, props: { ...b.props, ctaHref: '#breakdown' } } : b));
    };
    if (mp && mp.data) mp.data.content = fix(mp.data.content);
    if (mp && mp.published) mp.published.content = fix(mp.published.content);
  }
  // backfill any missing chrome settings (logo/footerTagline/headerCtaLabel added in the Site-Settings
  // build) while preserving everything an admin has already set. Idempotent.
  state.settings = { ...DEFAULT_SETTINGS, ...(state.settings || {}) };
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
  // nav (additive, Ben's 18 Jun review): the Method page now reads "Process" in the nav. Rename the
  // DISPLAY title only (slug stays 'method' — the routing key for #go/method and the #breakdown CTA),
  // and only when it's still the old seed default, so a manual rename by John is never clobbered.
  {
    const mp = state.pages && state.pages.method;
    if (mp) {
      if (mp.title === 'Method') mp.title = 'Process';
      if (mp.data && mp.data.root && mp.data.root.props && mp.data.root.props.title === 'Method') mp.data.root.props.title = 'Process';
      if (mp.published && mp.published.root && mp.published.root.props && mp.published.root.props.title === 'Method') mp.published.root.props.title = 'Process';
    }
  }
  // nav (additive): new running order with Contact last (Home → About → Process → Climb → Services …).
  // Apply ONLY if state.order still matches the previous seed default exactly, so a manual reorder is kept.
  {
    const prevDefault = ['home', 'method', 'services', 'industries', 'proof', 'about', 'insights', 'climb', 'contact'];
    const newDefault = ['home', 'about', 'method', 'climb', 'services', 'industries', 'proof', 'insights', 'contact'];
    // compare against the products-stripped order so a legacy store that still carries 'products' in
    // its order reorders on the FIRST load too (the products-delist below then no-ops).
    const ord = Array.isArray(state.order) ? state.order.filter((s) => s !== 'products') : [];
    if (ord.length === prevDefault.length && ord.every((s, i) => s === prevDefault[i])) {
      state.order = newDefault.filter((s) => state.pages[s]);
    }
  }
  // home scroll cue (additive): turn the bouncing "Scroll down to start the climb" indicator ON for the
  // existing home hero (draft + published) so returning visitors get it. Idempotent — only sets the flag
  // when it isn't already set, so it never re-flips a hero an editor deliberately switched off.
  {
    const hp = state.pages && state.pages.home;
    const enableFirstHero = (content) => {
      if (!Array.isArray(content)) return;
      const hero = content.find((b) => b && b.type === 'Hero');
      if (!hero || !hero.props) return;
      // set only when the prop has never been written, so an editor who turns the cue OFF (explicit
      // false) keeps it off on the next load. Existing home heroes predate the prop, so this enables it once.
      if (hero.props.scrollCue === undefined) hero.props.scrollCue = true;
      // the dedicated scroll cue replaces the old cursor prompt on the home hero (two cues collide).
      // Only clear the prompt if it's still the old default, so a hand-edited prompt is left alone.
      if (hero.props.prompt === 'Move your cursor. The stone responds') hero.props.prompt = '';
    };
    if (hp && hp.data) enableFirstHero(hp.data.content);
    if (hp && hp.published) enableFirstHero(hp.published.content);
  }
  // Insights → AI Intelligence Hub launch (additive): give the insights Hero a CTA that opens the #intel
  // hub on stores that predate it. Only when the hero has no CTA yet, so a hand-edited CTA is respected.
  {
    const ip = state.pages && state.pages.insights;
    const addIntelCta = (content) => {
      if (!Array.isArray(content)) return;
      const hero = content.find((b) => b && b.type === 'Hero');
      if (hero && hero.props && !hero.props.ctaLabel) { hero.props.ctaLabel = 'Open the AI Intelligence Hub'; hero.props.ctaHref = '#intel'; }
    };
    if (ip && ip.data) addIntelCta(ip.data.content);
    if (ip && ip.published) addIntelCta(ip.published.content);
  }
  // Insights: insert the prominent AI Intelligence Hub entry band on stores that predate it, right after
  // the Hero. Runs ONCE (flagged) so a later hand-removal is respected and it is not re-added every load.
  if (!state._intelBandSeeded) {
    const ip = state.pages && state.pages.insights;
    const addIntelBand = (content) => {
      if (!Array.isArray(content) || content.some((b) => b && b.type === 'IntelBand')) return;
      const band = blk('IntelBand', {
        kicker: 'Live · rebuilt each working day', heading: 'The AI landscape,', highlight: 'read for you.',
        body: "Our standing intelligence briefing: every meaningful move in AI, with Greatstone's own read on what it means for a business modernising with it. Models ranked, themes tracked, sources shown.",
        ctaLabel: 'Open the AI Intelligence Briefing', ctaHref: '#intel',
        themes: [{ label: 'Frontier models' }, { label: 'Agents' }, { label: 'AI security' }, { label: 'Regulation' }, { label: 'Enterprise' }],
        stat1: { value: '26', label: 'live developments' }, stat2: { value: '8', label: 'models ranked' },
      });
      const heroIdx = content.findIndex((b) => b && b.type === 'Hero');
      content.splice(heroIdx >= 0 ? heroIdx + 1 : 0, 0, band);
    };
    if (ip && ip.data) addIntelBand(ip.data.content);
    if (ip && ip.published && ip.published !== ip.data) addIntelBand(ip.published.content);
    state._intelBandSeeded = true;
  }
  // Insights → Intelligence (additive, John 21 Jun): the Insights page IS the AI Intelligence section
  // now (the hub renders as its body). Rename the DISPLAY title only — the slug stays 'insights', the
  // routing key the hub renders on — and only while it's still the old seed default, so a hand-rename sticks.
  {
    const ip = state.pages && state.pages.insights;
    if (ip) {
      if (ip.title === 'Insights') ip.title = 'Intelligence';
      if (ip.data && ip.data.root && ip.data.root.props && ip.data.root.props.title === 'Insights') ip.data.root.props.title = 'Intelligence';
      if (ip.published && ip.published.root && ip.published.root.props && ip.published.root.props.title === 'Insights') ip.published.root.props.title = 'Intelligence';
    }
  }
  // the redundant 'products' CMS page is delisted from the nav (the live storefront #shop, labelled
  // "Products", is the catalogue now). Keep the page row for any deep links, just drop it from the order.
  state.order = state.order.filter((s) => s !== 'products');
  // Services FAQ (additive, Excellence-loop cycle 2; NO SEED_VERSION bump): insert the editable FAQ
  // accordion on the services page of existing saved sites, ONCE (flagged), placed just before the
  // closing Invite CTA. Idempotent + respects a later hand-removal (the flag is not re-run). Full props
  // are inlined because PublicRender renders stored props verbatim (it does not merge block defaults).
  if (!state._faqSeeded) {
    const sp = state.pages && state.pages.services;
    const FAQ_PROPS = {
      kicker: 'Common questions', heading: 'The questions buyers ask first.',
      intro: 'Straight answers to what most teams want to know before they book. If yours is not here, the Deep Dive is the fastest way to get it.',
      items: [
        { q: 'What actually happens in a Deep Dive?', a: 'Thirty focused minutes where we map your week against the eight pillars and show you where the hours are draining. You leave with a clear read on what your week is quietly costing you and where we would start. No deck, no obligation.' },
        { q: 'Are you a software house or consultants?', a: 'Neither, exactly. We embed alongside your team and build the systems that fit how you actually run. Twenty years of doing the work, not advising from the outside.' },
        { q: 'How long before we see results?', a: 'The Deep Dive gives you a costed picture in the first session. Real change follows the work: we find the drains, build the fix, then stay embedded until the new way is the only way. Usually weeks, not quarters.' },
        { q: 'What about our data and security?', a: 'We work inside your stack and your controls, never around them. Access is least-privilege, scoped to the engagement, and removed when it ends. Security runs through the Technology and Data pillars of our assessment.' },
        { q: 'Do you replace our team?', a: 'No. We make your team faster. We hand back the hours lost to copy-paste, handoffs and waiting so your people spend their time on the work only they can do.' },
        { q: 'Is this just AI hype?', a: 'Digital transformation first, AI as the accelerator. We automate the boring before the brilliant, and only deploy AI where it pays back in hours returned, not headlines.' },
      ],
    };
    const addFaq = (content) => {
      if (!Array.isArray(content) || content.some((b) => b && b.type === 'Faq')) return;
      const inviteIdx = content.findIndex((b) => b && b.type === 'Invite');
      content.splice(inviteIdx >= 0 ? inviteIdx : content.length, 0, blk('Faq', FAQ_PROPS));
    };
    if (sp && sp.data) addFaq(sp.data.content);
    if (sp && sp.published && sp.published !== sp.data) addFaq(sp.published.content);
    state._faqSeeded = true;
  }
  // Time-savings calculator (additive, Excellence-loop cycle 5; NO SEED_VERSION bump): insert the
  // interactive calculator on the services page of existing saved sites, ONCE (flagged), before the FAQ
  // (matches the seed order). Idempotent + respects a later hand-removal. Full props inlined because
  // PublicRender renders stored props verbatim. Fulfils the ContactBand "time-savings calculator" promise.
  if (!state._calcSeeded) {
    const sp = state.pages && state.pages.services;
    const CALC_PROPS = {
      kicker: 'The cost of the status quo', heading: 'See the hours you are quietly losing.',
      intro: 'A rough, honest estimate in seconds. Move the numbers to match your team, and watch what the week is costing you across a year.',
      teamLabel: 'People affected', hoursLabel: 'Hours lost per person, per week', costLabel: 'Average hourly cost',
      defaultTeam: 12, defaultHours: 5, defaultCost: 30, weeksPerYear: 46, currency: '£',
      resultLead: 'That is roughly', ctaLabel: 'Book a Deep Dive', ctaHref: '#book',
      footnote: 'A guide, not a quote. The Deep Dive replaces these round numbers with your real ones, then shows exactly where the hours go and where we buy them back.',
    };
    const addCalc = (content) => {
      if (!Array.isArray(content) || content.some((b) => b && b.type === 'TimeSavingsCalculator')) return;
      let idx = content.findIndex((b) => b && b.type === 'Faq');
      if (idx < 0) idx = content.findIndex((b) => b && b.type === 'Invite');
      content.splice(idx >= 0 ? idx : content.length, 0, blk('TimeSavingsCalculator', CALC_PROPS));
    };
    if (sp && sp.data) addCalc(sp.data.content);
    if (sp && sp.published && sp.published !== sp.data) addCalc(sp.published.content);
    state._calcSeeded = true;
  }
  // Copy unification (additive, Excellence-loop cycle 1, 2026-06-21; NO SEED_VERSION bump): align the
  // Deep Dive duration to the real 30-min booking slot, drop the "Placeholder names" framing above the
  // real founders, and give the home hero a primary CTA — but ONLY where the stored value still equals
  // the OLD seed default, so any hand-edit by John is preserved. Idempotent (once rewritten it no longer
  // matches an old key). Applied to BOTH the draft (data) and the live projection (published).
  {
    const editBlocks = (page, fn) => {
      if (!page) return;
      [page.data, page.published].forEach((proj) => {
        if (proj && Array.isArray(proj.content)) proj.content.forEach((b) => { if (b && b.props) fn(b); });
      });
    };
    // home hero: fill the empty primary CTA so the first viewport has an action
    editBlocks(state.pages && state.pages.home, (b) => {
      if (b.type === 'Hero' && !b.props.ctaLabel && (b.props.ctaHref === '#' || b.props.ctaHref == null)) {
        b.props.ctaLabel = 'Book a Deep Dive'; b.props.ctaHref = '#book';
      }
    });
    // contact: Deep Dive step duration 45 → 30 (matches the live Calendly slot)
    editBlocks(state.pages && state.pages.contact, (b) => {
      if (b.type === 'Steps' && Array.isArray(b.props.items)) {
        b.props.items = b.props.items.map((it) => (it && it.title === '45 focused minutes' ? { ...it, title: '30 focused minutes' } : it));
      }
    });
    // about: Invite "two hours" → "thirty focused minutes"; Team drop the "Placeholder names" framing
    editBlocks(state.pages && state.pages.about, (b) => {
      if (b.type === 'Invite' && b.props.body === 'A deep dive is two hours of our time and a sharper picture of yours. No deck to sit through, no obligation after.') {
        b.props.body = 'A deep dive is thirty focused minutes of our time and a sharper picture of yours. No deck to sit through, no obligation after.';
      }
      if (b.type === 'Team' && b.props.body === 'Placeholder names and roles. The real strip lands here once we confirm who is on your engagement.') {
        b.props.body = 'The senior people who do the work, not a sales team between you and them. Your founders are on it from day one; the rest of your engagement team is named at kickoff.';
      }
    });
  }
  state.schema = SCHEMA;
  return state;
}

// Update global site-chrome settings (logo, siteName, footerTagline, headerCtaLabel, background). Shallow
// merge so a panel can patch one field; persisted by App's autosave like any other state mutation.
export function updateSettings(state, patch) {
  return { ...state, settings: { ...state.settings, ...(patch || {}) } };
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
// Patch an asset's metadata (alt text) without changing its id/url/ts. For the Media Library panel.
export function updateAsset(state, id, patch) {
  const assets = state.assets || {};
  if (!assets[id]) return state;
  return { ...state, assets: { ...assets, [id]: { ...assets[id], ...(patch || {}) } } };
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
  page.published = null; // a brand-new page is a true draft — not public until it's published
  page.publishedBackground = null; // its 3D scene is likewise unpublished until the first publish
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
  clone.published = null; // a duplicate is a draft — it must not inherit the source's live (public) projection
  clone.publishedBackground = null; // nor its source's published 3D scene
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
