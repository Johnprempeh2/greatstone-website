// Tiny site store, persisted to localStorage. This stands in for the Laravel page-JSON
// endpoint the devs will build: the page shape (draft `data`, `published`, `status`, `seo`,
// `versions`) mirrors the rails they're building, so swapping to a real backend is a
// data-source change, not a rewrite.
import seedPages from './seed-pages.json';
import { BRAND_TAGLINE, PRIMARY_CTA_LABEL, PRIMARY_CTA_HREF } from './lib/brand.mjs';
import { config } from './puck.config.jsx';
import { STAGE_OPTIONS } from './stage-presets.js';
// Link integrity (pure, read-only) lives in its own module; store stays the single import surface.
export { auditLinks, resolveRedirect, LINK_PROPS } from './lib/link-audit.mjs';
export { addRedirect, removeRedirect, setRedirect, listRedirects, validateRedirect } from './lib/redirects-model.mjs';
export { addSection, removeSection, renameSection, listSections, buildInsertBlock } from './lib/sections-model.mjs';
export { listStarters, getStarter } from './lib/templates-model.mjs'; // page-starter recipes (cycle 17)
import { getStarter as starterById, buildStarterContent } from './lib/templates-model.mjs';

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
// Bumped 22 Jul 2026: the About team strip now distinguishes a named person from a seat that gets filled
// at kickoff. Without a bump, anyone with saved studio state keeps the old items, where "Principal
// Engineer" rendered in the same avatar card as Ben, John and Naa and read as a sixth colleague.
const SEED_VERSION = 20260827;

// Global site chrome settings (the logo, name, footer tagline + header CTA that wrap every page). Edited
// in the admin Site-Settings panel; the defaults below match the values previously hardcoded in Header /
// Footer / AdminConsole, so backfilling them onto an existing store changes nothing until an admin edits.
export const DEFAULT_LOGO = '/assets/greatstone-logo-web.png';
// headerCtaLabel is Ben's locked wording ("The wording should remain unchanged"). It sat one inch above
// body copy reading "Begin the Conversation" while itself saying "Book a Diagnostic", which the first
// screenshot of the rebuilt homepage showed plainly. footerTagline and footerEmail are NOT changed here:
// the tagline is the positioning Ben's opening statement retires and needs his replacement, and the email
// is one of three candidate addresses in this repo and needs John's decision, not a guess.
const DEFAULT_SETTINGS = { background: 'stone', siteName: 'Greatstone International', logo: DEFAULT_LOGO, footerTagline: BRAND_TAGLINE, headerCtaLabel: PRIMARY_CTA_LABEL, footerEmail: 'dx@greatstonesoftware.co.uk', legalName: 'Greatstone International Ltd' };
const clone = (x) => JSON.parse(JSON.stringify(x));

// the org/tenant. The DX dashboard is multi-tenant; the prototype runs one org but stamps orgId on
// every team/catalogue record so the data shape already carries the tenant scope the Laravel build
// enforces. organisations + per-record orgId map straight onto the tenant column + scoped queries.
const ORG = { id: 'org-greatstone', name: 'Greatstone International', slug: 'greatstone' };

let _seq = 0;
// one canonical id generator (block/scene/asset ids must be unique within a page — they key both
// the gs-blk-<id> background anchors and the duplicate-page remap). Exported so App + panels share it.
export const rid = (t) => t.toLowerCase() + '-' + (_seq++).toString(36) + Math.random().toString(36).slice(2, 6);

// The editable header navigation tree (state.navigation): page links, custom/external links, and
// one-level dropdown groups. Seeded to mirror the current bar exactly; edited in the Navigation panel.
// A blank label on a page item falls back to that page's own title. 'Products' (the storefront route)
// and the booking CTA stay header chrome added by Header.jsx, so they are not items in this tree.
const navItem = (o) => ({ id: rid('nav'), visible: true, ...o });
export function DEFAULT_NAVIGATION() {
  // Ben's architecture v2.0: Home / How We Help / Executive Intelligence / Technology Solutions /
  // About Greatstone / Begin the Conversation. Labels come from each page's title, so the retitles
  // above (insights -> Executive Intelligence, about -> About Greatstone, contact -> Begin the
  // Conversation) are what render here.
  //
  // TECHNOLOGY SOLUTIONS IS DELIBERATELY NOT WIRED YET. Its page does not exist, and the architecture
  // is explicit that the experience "should not begin as a conventional software catalogue" with
  // commerce sitting INSIDE it. Pointing the label at the existing product storefront would present
  // the catalogue as the proposition, which is the one thing that section may not be. The storefront
  // keeps its honest "Products" entry until the gateway page is written.
  //
  // Services, Proof, Process, The Climb and Industries drop out of the primary nav because Ben's list
  // has six items and does not include them. They remain published and reachable by URL, and their
  // content is destined for Professional Services and Organisational Transformation once those pages
  // are specified. This is a visible IA change and is flagged for review, not a silent removal.
  return [
    navItem({ type: 'page', pageSlug: 'home' }),
    navItem({ type: 'page', pageSlug: 'how-we-help' }),
    navItem({ type: 'page', pageSlug: 'insights' }),
    // NOTE: no 'products' entry. Header.jsx:263 already appends a hardcoded "Products" storefront link
    // after the configured nav, so listing it here rendered it twice. Caught by screenshot, not by tests.
    navItem({ type: 'page', pageSlug: 'about' }),
    navItem({ type: 'page', pageSlug: 'contact' }),
  ];
}
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

// ---- launch legal scaffolds (footer-only, draft) ----
// Editable placeholder pages (Terms, Privacy, Cookies, Refunds) so the structure, routing and footer wiring
// are ready for launch and a solicitor's final wording drops straight into the CMS. They ship as DRAFT and
// footerOnly: never in the primary nav or ⌘K, hidden from the PUBLIC footer until someone publishes them (so
// placeholder text can't reach a customer), but reachable by staff to edit. Nothing here is legal copy — every
// page says so in bold at the top. Seeded for fresh stores AND backfilled into existing ones (no re-seed).
const LEGAL_DRAFT_BANNER = '<strong>Draft placeholder, not yet in force.</strong> This page is a launch scaffold. Our solicitor’s final wording replaces everything here before we sell, and nothing on this page is legal advice or a binding term.';
export const LEGAL_SCAFFOLDS = [
  { slug: 'terms', title: 'Terms of sale', desc: 'The terms on which Greatstone sells software licences. Draft scaffold, final wording pending.', sections: [
    { h: 'Who we are', b: 'Greatstone International Ltd, and how to reach us. [Company number and registered address to be confirmed.]' },
    { h: 'What you are buying', b: 'We resell hand-picked third-party software licences. Each product’s vendor, edition and licence term are shown on its page.' },
    { h: 'Orders and acceptance', b: 'When an order becomes a contract, and our right to decline or cancel an order before a licence is issued.' },
    { h: 'Price, currency and VAT', b: 'Prices show in pounds, converted from the vendor list price, with VAT added at checkout where it applies.' },
    { h: 'Licence delivery', b: 'Licence keys are issued once payment clears and appear in your account. [Expected delivery window to be confirmed.]' },
    { h: 'Cancellations and refunds', b: 'How cancelling works for digital licences. See the <a href="#go/refunds">refunds and returns policy</a>.' },
    { h: 'Liability and governing law', b: 'The limits of our liability, and the law that governs these terms. [Final wording from counsel.]' },
  ] },
  { slug: 'privacy', title: 'Privacy policy', desc: 'How Greatstone collects, uses and protects your personal data. Draft scaffold, final wording pending.', sections: [
    { h: 'Who controls your data', b: 'Greatstone International Ltd is the data controller, and here is how to contact us about your data.' },
    { h: 'What we collect', b: 'Your account details, order history and how you use the site. We never store card numbers; payments are handled by our payment provider.' },
    { h: 'How we use it, and our lawful basis', b: 'To take orders, deliver licences, support you and improve the site, under the UK GDPR lawful bases.' },
    { h: 'Who we share it with', b: 'Our processors for hosting, payments and email, each under contract. We do not sell your data.' },
    { h: 'Cookies', b: 'How we use cookies, and your choices. See the <a href="#go/cookies">cookie policy</a>.' },
    { h: 'Your rights', b: 'Access, correction, deletion and the rest of your UK GDPR rights, and how to exercise them.' },
    { h: 'Retention, security and complaints', b: 'How long we keep data, how we protect it, and your right to complain to the ICO.' },
  ] },
  { slug: 'cookies', title: 'Cookie policy', desc: 'The cookies Greatstone uses, and how to control them. Draft scaffold, final wording pending.', sections: [
    { h: 'What cookies are', b: 'Small files a site stores on your device, and why sites use them.' },
    { h: 'Essential cookies', b: 'Sign-in and basket cookies the site needs to work. These always run.' },
    { h: 'Analytics cookies', b: 'Usage measurement that runs only with your consent, so we can see what to improve.' },
    { h: 'Managing your choices', b: 'Change your cookie choices at any time from the banner or your browser settings.' },
  ] },
  { slug: 'refunds', title: 'Refunds and returns', desc: 'When and how Greatstone refunds a software licence purchase. Draft scaffold, final wording pending.', sections: [
    { h: 'Digital licences and your right to cancel', b: 'How the right to cancel applies to digital licence keys, including where it ends once a key has been supplied.' },
    { h: 'When a refund applies', b: 'The cases where we refund, in full or in part. [Final policy from counsel.]' },
    { h: 'Faulty or misdescribed licences', b: 'What to do if a licence does not work, or was not as described.' },
    { h: 'How to request a refund', b: 'Email us from your account with your order reference, and we will confirm the next steps and the timeframe.' },
  ] },
];
function buildLegalPage({ title, desc, sections }) {
  const blocks = [
    // ctaLabel/prompt set empty so the Hero's defaults (the primary CTA, the cursor prompt) don't bleed
    // onto a legal page — it wants just the title + the draft banner.
    blk('Hero', { kicker: 'Legal', headline: title, highlight: '', body: LEGAL_DRAFT_BANNER, align: 'left', size: 'compact', scrollCue: false, ctaLabel: '', ctaLabel2: '', prompt: '' }),
    ...sections.map((s) => blk('Prose', { kicker: s.h, body: s.b, align: 'left', width: 'reading' })),
  ];
  const page = seedPage(title, 'stone', blocks, { title: title + ' · Greatstone International', description: desc, ogImage: '' }, 'draft');
  // A true draft has NO published projection (mirrors addPageTo), so the public "published" gate hides it
  // until a real publish. Without this, seedPage's default published-snapshot would leak the placeholder.
  page.published = null;
  page.publishedBackground = null;
  return { ...page, footerOnly: true };
}
// Add every legal scaffold to a pages map + return the slugs (in declared order) for the nav order.
export function seedLegalPages(pages) {
  const slugs = [];
  for (const spec of LEGAL_SCAFFOLDS) {
    if (!pages[spec.slug]) pages[spec.slug] = buildLegalPage(spec);
    slugs.push(spec.slug);
  }
  return slugs;
}

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

// Home objection-handling FAQ (cycle 20): a focused 3-item subset of the Services FAQ, surfaced before
// the home closing CTA so the primary landing page answers the top objections too. Schema suppressed
// (showSchema:false) so the canonical FAQPage rich-result stays on the Services FAQ only. Pure reuse of
// existing answers (no fabrication). Shared by seedState + the migrate so the two never drift.
export function seedState() {
  const pages = {
      // Ben's Implementation Guide v2.0, chapters 2 to 8. Every string below is his approved Foundation
      // Content, verbatim. Two em dashes in the source are typed here as commas: deEmDash() in migrate()
      // would rewrite them anyway, but a FRESH seed persists without migrating, so the literal must
      // already carry the comma or the em dash renders once and then silently rewrites itself.
      // Background is 'none': chapter 2 requires that nothing visually competes with the opening
      // statement, and Stage makes scene zero fully opaque at scroll top, so a quieter stone is not
      // authorable. This retires the 3D mark from the homepage only; it still runs elsewhere.
      // The 3D stone, brought back with a lead-in rather than the blanket 'none' it ran before.
      // Ben's brief says nothing may compete with the Opening Statement, and scene zero used to paint
      // from the first pixel of scroll, so the only way to honour that was to have no 3D on the page at
      // all. `lead` fades the stone up instead: void behind the statement, stone arriving as the reader
      // reaches "Why Greatstone". Pinned to that block, so editing copy above it moves the reveal with
      // the content instead of stranding it at a stale scroll fraction.
      home: seedPage('Home', {
        v: 1,
        scenes: [{ id: 'sc-home-stone', kind: 'stone' }],
        transitions: [],
        // Held well below full strength: the stone is atmosphere behind reading matter, not a subject.
        // At full opacity its bright core sat directly behind the Panels intro paragraph.
        ceil: 0.38,
        // edge 'center' rather than 'top': a block anchor resolves to "when this point reaches mid-screen",
        // and with a 0.12 fade the top edge began lifting the stone while the third sentence was still on
        // screen. Centred, the fade starts exactly as the last statement line passes the middle of the
        // screen and completes with "Why Greatstone" centred.
        lead: { id: 'tr-home-lead', at: 0.15, fade: 0.12,
          anchor: { type: 'block', blockId: 'gs-home-why', edge: 'center', fallbackAt: 0.15 } },
      }, [
        // Chapter 2, The Opening Statement. Sentences 1 to 3 are the statement, sentence 4 is the
        // Supporting Narrative: his copywriting rule forbids the statement mentioning Greatstone, and
        // sentence 4 opens "At Greatstone". All four appear, in order, unaltered.
        blk('Hero', {
          variant: 'statement', kicker: '', headline: '', highlight: '', headlineSuffix: '', prompt: '',
          lines: [
            { text: 'Strong organisations are not created by chance.', accent: false },
          ],
          body: 'At Greatstone, we help organisations build the clarity, confidence and capability required to become stronger.',
          align: 'left', size: 'full', meta: [], pillEyebrow: false, gridBackdrop: false,
          // The mark, beside the statement rather than behind it. The hero was a short approved
          // sentence alone in a 1240px column, so half the screen was empty and the opening read as
          // thin. See the note on the background track below: the full-screen stone still stays out
          // of the hero entirely, it arrives later. These are two different jobs.
          stone: 'right',
          ctaLabel: 'Begin the Conversation', ctaHref: { kind: 'page', page: 'contact' },
          // A second route for the visitor who is not ready to talk yet. Ben's architecture makes
          // How We Help the gateway into the commercial capabilities, so that is where it points.
          ctaLabel2: 'How We Help', ctaHref2: { kind: 'page', page: 'how-we-help' },
          cueStyle: 'text', scrollCue: true, cueLabel: 'Continue',
        }),
        // Sentences 2 and 3 of the Opening Statement, at the same weight and scale as sentence 1 above.
        // All three of Ben's sentences are still on the page, in order, unaltered: the fold now falls
        // between the first and the second instead of after the third. Holding the whole triad in the
        // hero made the hero 787px tall on a 812px phone, so the visitor met the statement and nothing
        // else. To put it back, move these two lines into the Hero block's `lines` and delete this block.
        blk('Statement', {
          id: 'gs-home-statement', // stable: the 3D lead-in is pinned to this block, not a scroll number
          align: 'left', ctaLabel: '', ctaHref: '#',
          lines: [
            { text: 'They are built by understanding what matters before deciding what must change.', accent: false },
            { text: 'Only then can organisations transform with confidence.', accent: false },
          ],
        }),
        // Chapter 3, Why Greatstone.
        blk('Chapter', {
          id: 'gs-home-why', // stable: the 3D stone finishes fading in as this block reaches mid-screen
          index: '', eyebrow: 'Why Greatstone', highlight: '',
          headline: 'Organisations face increasing complexity, opportunity and change.',
          body: 'The challenge is not change itself, but understanding where meaningful change should begin.',
          // EM DASH 1 of 2 in Ben's source: "stronger—and sustain" becomes "stronger, and sustain".
          coda: 'At Greatstone, we help organisations build the clarity, confidence and capability to become stronger, and sustain that strength over time.',
          align: 'left', ctaLabel: '', ctaHref: '#', headingLevel: 'h2',
        }),
        // Chapter 4, Building a Stronger Organisation. Panel links are unset until the three destination
        // pages exist, so the approved button wording is stored and editable but nothing dead renders.
        blk('Panels', {
          eyebrow: '', heading: 'Building a Stronger Organisation',
          intro: 'Every organisation has the potential to become stronger. The organisations that realise that potential are those that focus their leadership, capability and investment where they create the greatest long-term value. For some, that means transforming with confidence. For others, it means strengthening organisational capability or applying technology where it delivers the greatest strategic advantage. Wherever your organisation is on its journey, Greatstone helps you move forward with greater clarity, confidence and purpose.',
          panelsLabel: '', columns: 'three', panelStyle: 'card', bodyClamp: 'three', coda: '',
          ctaLabel: '', ctaHref: '#', headingLevel: 'h2',
          items: [
            { label: '', icon: 'transform', title: 'Transform with Confidence',
              text: 'Successful transformation begins long before change begins. It starts with understanding the organisation, establishing the right priorities and creating a clear path towards stronger organisational outcomes. Whether your objective is improving performance, modernising operations, embracing Artificial Intelligence or preparing for future growth, Greatstone helps organisations establish the clarity and confidence required to transform successfully and create lasting organisational value.',
              ctaLabel: 'Explore Organisational Transformation', ctaHref: '#' },
            { label: '', icon: 'structure', title: 'Strengthen Organisational Capability',
              text: 'The strongest organisations understand that capability is one of their greatest strategic assets. They recognise when specialist expertise can strengthen leadership, accelerate progress and help deliver priorities that create lasting organisational value. Greatstone works alongside organisations, providing experienced expertise that strengthens internal capability, supports executive leadership and helps organisations achieve sustainable strategic progress.',
              ctaLabel: 'Explore Professional Services', ctaHref: '#' },
            { label: '', icon: 'technology', title: 'Invest in Technology That Matters',
              text: 'Technology creates value only when it is applied to the right organisational priorities. The objective is not simply to adopt new technology. It is to apply the right technology, to the right opportunities, at the right time, strengthening organisational capability and supporting long-term strategic success. Greatstone helps organisations identify, evaluate and implement technologies that matter, ensuring every investment contributes directly to stronger organisational performance and future capability.',
              ctaLabel: 'Explore Technology Solutions', ctaHref: '#' },
          ],
        }),
        // Chapter 5, Building Confidence Before Change. The brief asks each principle to carry a simple
        // supporting motif, while the four must still read as one philosophy; the numbered motif does both
        // (see Panels.jsx). No process diagram, no framework name, no engagement stage, per his prohibitions.
        blk('Panels', {
          // Tonal band. Three Panels sections ran back to back on one flat surface; lifting the middle one
          _section: { surface: 'panel', accent: 'default', spaceTop: 'default', spaceBottom: 'default' },
          eyebrow: '', heading: 'Building Confidence Before Change',
          intro: 'Every organisation is different. Every leadership team faces different opportunities, challenges and ambitions. For that reason, Greatstone believes that meaningful transformation should never begin with assumptions or predetermined solutions. It should begin by building the understanding and confidence required to make the right decisions for the organisation. That philosophy guides every engagement we undertake and every recommendation we make.',
          headAlign: 'center', panelsLabel: 'The Greatstone Principles',
          columns: 'four', panelStyle: 'numbered', bodyClamp: 'three', coda: '',
          ctaLabel: '', ctaHref: '#', headingLevel: 'h2',
          items: [
            { label: '', icon: 'compass', title: 'Understanding Before Action',
              text: 'Every meaningful initiative begins with understanding. Before recommending change, Greatstone develops a clear understanding of the organisation, its objectives and the factors that will determine long-term success. Only then can meaningful progress begin.',
              ctaLabel: '', ctaHref: '#' },
            { label: '', icon: 'evidence', title: 'Evidence Before Transformation',
              text: 'Transformation should always be guided by evidence rather than assumption. Every recommendation should be informed by organisational understanding, sound judgement and objective insight, creating the confidence required for meaningful and sustainable transformation.',
              ctaLabel: '', ctaHref: '#' },
            { label: '', icon: 'target', title: 'Execution with Purpose',
              text: 'Every initiative should contribute to a clearly defined organisational objective. Transformation, specialist expertise and technology should never become objectives in themselves. They should always strengthen the organisation they exist to serve.',
              ctaLabel: '', ctaHref: '#' },
            { label: '', icon: 'layers', title: 'Capability That Endures',
              text: 'The measure of success is not the completion of an engagement. It is the capability the organisation retains, the confidence leadership gains and the strength the organisation continues to build long after the engagement has concluded.',
              ctaLabel: '', ctaHref: '#' },
          ],
        }),
        // Chapter 6, Executive Intelligence. AI Market Intelligence goes straight to the live briefing; the other
        // three centres now point at the Executive Intelligence page, which presents all four as his four equal
        // panels. That is their real home, so the buttons are honest rather than dead.
        blk('Panels', {
          eyebrow: '', heading: 'Executive Intelligence',
          intro: 'The quality of an organisation’s decisions will never exceed the quality of its thinking. Executive Intelligence is where Greatstone shares the thinking that shapes its perspective on organisations, leadership, technology and transformation, helping executive leaders think more clearly about the decisions that matter most. Because stronger organisations begin with stronger thinking.',
          panelsLabel: '', columns: 'four', panelStyle: 'ruled', bodyClamp: 'three', coda: '',
          ctaLabel: 'Explore Executive Intelligence', ctaHref: { kind: 'page', page: 'insights' },
          ctaVariant: 'ghost', headingLevel: 'h2',
          items: [
            { label: '', icon: 'judgement', title: 'Understand AI Before You Adopt It',
              // EM DASH 2 of 2: "matters—and where it does not" becomes "matters, and where it does not".
              text: 'Artificial Intelligence presents extraordinary opportunities for organisations prepared to apply it thoughtfully. Its greatest value is realised when it strengthens organisational capability, supports strategic priorities and delivers measurable organisational outcomes. AI Market Intelligence helps executive leaders understand where Artificial Intelligence genuinely matters, and where it does not.',
              ctaLabel: 'Explore AI Market Intelligence', ctaHref: { kind: 'page', page: 'ai-market-intelligence' } },
            { label: '', icon: 'horizon', title: 'Think Beyond Today’s Challenges',
              text: 'The strongest organisations prepare for tomorrow while continuing to perform today. Organisational Thinking explores the ideas, leadership perspectives and strategic observations that help executive teams strengthen organisational capability, improve long-term performance and navigate change with confidence.',
              ctaLabel: 'Explore Organisational Thinking', ctaHref: { kind: 'page', page: 'insights' } },
            { label: '', icon: 'technology', title: 'Invest in Technology That Matters',
              text: 'Technology creates value only when it is applied where it makes the greatest organisational difference. The objective is not simply to adopt new technologies. It is to apply the right technology, to the right organisational priorities, at the right time. Technology Intelligence helps executive leaders make informed technology investment decisions that strengthen capability, support strategic objectives and create lasting organisational value.',
              ctaLabel: 'Explore Technology Intelligence', ctaHref: { kind: 'page', page: 'insights' } },
            { label: '', icon: 'briefing', title: 'Executive Briefings',
              text: 'Executive leaders need insight they can apply rather than information they already know. Executive Briefings distil complex developments into concise executive perspectives, helping leadership understand what has changed, why it matters and what should be considered next. Every briefing is designed to strengthen executive judgement through thoughtful analysis and practical insight.',
              ctaLabel: 'Explore Executive Briefings', ctaHref: { kind: 'page', page: 'insights' } },
          ],
        }),
        // Chapter 7, Trusted by Organisations That Expect More. Both logo walls ship EMPTY and render
        // nothing at all: there is no verified client or partner list, and the only named organisations
        // anywhere in this codebase are leadership heritage (where our people worked BEFORE Greatstone),
        // which must never be restated as clients. His chapter-7 CTA is omitted; chapter 8 follows
        // immediately and is itself the call to action.
        blk('Chapter', {
          // Movement 3 opens: proof, then the close
          _section: { surface: 'deep', accent: 'default', spaceTop: 'default', spaceBottom: 'default' },
          index: '', eyebrow: '', highlight: '',
          headline: 'Trusted by Organisations That Expect More',
          body: 'The organisations you choose to trust help shape the organisation you become. Executive leaders understand that the partners they choose influence the quality of their thinking, the confidence of their decisions and the success of their most important initiatives. That is why organisations that expect more choose their partners carefully. The same commitment to thoughtful leadership, disciplined judgement and meaningful organisational outcomes continues to shape every engagement Greatstone undertakes.',
          coda: 'Greatstone has supported organisations across a broad range of industries, helping executive leadership strengthen organisational capability, transform with confidence and apply technology where it creates lasting organisational value.',
          align: 'left', ctaLabel: '', ctaHref: '#', headingLevel: 'h2',
        }),
        blk('LogoWall', {
          // same movement as the chapter above
          _section: { surface: 'deep', accent: 'default', spaceTop: 'default', spaceBottom: 'default' }, eyebrow: 'Organisations we have supported', logos: [] }),
        blk('LogoWall', {
          // same movement
          _section: { surface: 'deep', accent: 'default', spaceTop: 'default', spaceBottom: 'default' }, eyebrow: 'Strategic technology partnerships', logos: [] }),
        blk('Prose', {
          // closes the proof movement
          _section: { surface: 'deep', accent: 'default', spaceTop: 'default', spaceBottom: 'default' },
          kicker: '', align: 'left', width: 'reading',
          body: 'Every engagement begins with understanding. Every successful engagement builds trust. Every trusted relationship creates the opportunity to strengthen organisations over the long term. The organisations Greatstone supports differ in size, sector and geography. The philosophy upon which every relationship is built remains the same.',
        }),
        // Chapter 8. email stays empty until the canonical address is decided; Invite hides it when blank.
        // The four contact routes are his, in his order. Two resolve today. Telephone has NO number
        // anywhere in this codebase and Email has three competing candidate addresses, so both ship with
        // the approved label and no destination: they stay editable in the studio and stay invisible to
        // visitors until someone sets them. Filling either in is a field edit, not a code change.
        blk('Invite', {
          eyebrow: '', highlight: '',
          headline: 'Let’s Build a Stronger Organisation',
          body: 'The journey towards a stronger organisation begins with a conversation. Let’s begin by understanding your organisation, your ambitions and the challenges that matter most. Every meaningful partnership begins with understanding.',
          ctaLabel: 'Begin the Conversation', ctaHref: { kind: 'page', page: 'contact' },
          ctaLabel2: 'Explore Executive Intelligence', ctaHref2: { kind: 'page', page: 'insights' },
          email: '',
          variant: 'band', pill: false,
          contactOptions: [
            { label: 'Schedule a Conversation', href: { kind: 'booking' } },
            { label: 'Send an Enquiry', href: { kind: 'page', page: 'contact' } },
            { label: 'Telephone', href: '' },
            { label: 'Email', href: { kind: 'email', email: '' } },
          ],
        }),
      ], { title: 'Greatstone International · Building Stronger Organisations', description: 'Strong organisations are not created by chance. They are built by understanding what matters before deciding what must change. Greatstone helps organisations build the clarity, confidence and capability to become stronger.', ogImage: '' }),

      method: seedPage('Process', 'stone', [
        blk('Hero', { kicker: 'The Digital Transformation Playbook', headline: 'We leave no', highlight: 'stone', headlineSuffix: ' unturned.',
          body: 'Your business has eight faces. We score every one: read where you stand, benchmark against your peers, and climb the lowest first. Move your cursor across the stone, then look inside each piece.',
          prompt: '', align: 'center', size: 'full',
          ctaLabel: 'Open the interactive breakdown', ctaHref: '#breakdown', ctaLabel2: PRIMARY_CTA_LABEL, ctaHref2: PRIMARY_CTA_HREF }),
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
          body: 'A Diagnostic scores all eight pillars and hands you the map: where the week goes, and where the next gain is hiding.',
          ctaLabel: PRIMARY_CTA_LABEL, ctaHref: PRIMARY_CTA_HREF, variant: 'framed' }),
      ], { title: 'Process · Eight Pillars · Greatstone International', description: 'The Digital Transformation Playbook scores your business across eight pillars, benchmarks you against your peers, and climbs the lowest first to win hours back.', ogImage: '' }),

      contact: seedPage('Begin the Conversation', 'none', [
        // Ben's section 8. The page is the primary route for organisations ready to engage, and his
        // constraints are explicit: professional, straightforward and human, with NO unnecessary friction,
        // qualification barriers or sales language. The previous build broke all three, so the Diagnostic
        // form headline, the three-step "what happens next" narrative and the 45-second calculator card
        // are gone, along with the TimeCounter that opened on a claim about buying time.
        blk('Hero', {
          kicker: '', headline: 'Begin the Conversation', highlight: '', headlineSuffix: '',
          body: 'The journey towards a stronger organisation begins with a conversation. Tell us about your organisation, your ambitions and the challenges that matter most, and we will take it from there.',
          prompt: '', size: 'standard', align: 'left', variant: 'statement',
          pillEyebrow: false, gridBackdrop: false, scrollCue: false,
          ctaLabel: '', ctaHref: '#', ctaLabel2: '', ctaHref2: '#',
          meta: [], lines: [],
        }),
        // His four routes, in his order. Telephone and Email are GATED: no number exists anywhere in this
        // codebase and the address is still one of three candidates, so both carry approved copy that
        // stays in the studio and stays off the public page until someone sets the link. Setting either
        // one reveals its panel with no code change.
        blk('Panels', {
          eyebrow: '', heading: 'However you would prefer to begin',
          intro: 'Different organisations open a conversation in different ways. Choose whichever suits you. Every route reaches the same team, and none of them commits you to anything.',
          panelsLabel: '', columns: 'four', panelStyle: 'ruled', bodyClamp: 'three', coda: '',
          ctaLabel: '', ctaHref: '#', headingLevel: 'h2',
          items: [
            { label: '', icon: 'horizon', title: 'Schedule a Conversation',
              text: 'Choose a time that suits your diary and we will meet you there. Thirty minutes is usually enough to understand whether there is something worth exploring together.',
              ctaLabel: 'Schedule a Conversation', ctaHref: { kind: 'booking' }, gated: false },
            { label: '', icon: 'briefing', title: 'Send an Enquiry',
              text: 'Prefer to put it in writing first? Tell us what is on your mind using the form below and we will reply with a considered response rather than a brochure.',
              ctaLabel: 'Go to the enquiry form', ctaHref: { kind: 'anchor', anchor: 'enquiry' }, gated: false },
            { label: '', icon: 'phone', title: 'Telephone',
              text: 'Some conversations are simply easier by voice. Call us directly and ask for whoever is best placed to help.',
              ctaLabel: 'Call Greatstone', ctaHref: '', gated: true },
            { label: '', icon: 'mail', title: 'Email',
              text: 'Write to us in your own words, in your own time. Everything that reaches this address is read by the team, not by an autoresponder.',
              ctaLabel: 'Email Greatstone', ctaHref: { kind: 'email', email: '' }, gated: true },
          ],
        }),
        // The enquiry route. The sector question is now OPTIONAL (his "no qualification barriers"), and the
        // form's wording is editable rather than hardcoded. email stays empty until the address is settled;
        // the block shows its fallback panel on submit either way.
        blk('BookDeepDive', {
          // the form is the page's one interactive surface; a lifted band makes it read as one
          _section: { surface: 'panel', accent: 'default', spaceTop: 'default', spaceBottom: 'default' },
          eyebrow: '', headline: 'Send an Enquiry', highlight: '',
          body: 'Tell us as much or as little as you would like. There are no required details beyond a way to reply to you.',
          submitLabel: 'Send Enquiry',
          sectorLabel: 'Your sector (optional)', sectorPlaceholder: 'Select if it is useful context',
          sectorRequired: false,
          messageLabel: 'What would you like to discuss?',
          messagePlaceholder: 'A challenge you are weighing up, an ambition you are planning around, or simply a question you would like a considered answer to.',
          subjectPrefix: 'Enquiry', anchorId: 'enquiry',
          asideKicker: 'What happens next',
          asideHeading: 'A considered reply, not a sales sequence.',
          asideBody: 'Every enquiry is read by the team. We reply with a view on whether we can genuinely help, and say so plainly when we cannot.',
          email: '',
          asidePoints: [
            { icon: 'check', title: 'Read by the team', text: 'Not routed into an automated nurture sequence.' },
            { icon: 'clock', title: 'A considered response', text: 'We would rather reply well than reply instantly.' },
            { icon: 'scan', title: 'No obligation', text: 'A conversation is a conversation. Nothing follows it unless you want it to.' },
          ],
        }),
      ], { title: 'Begin the Conversation · Greatstone International', description: 'The journey towards a stronger organisation begins with a conversation. Schedule a conversation, send an enquiry, telephone or email Greatstone International.', ogImage: '' }),
  };
  // fold in the rest of the site, converted from the live pages into editable blocks
  seedPages.forEach((p) => {
    pages[p.slug] = seedPage(p.title, p.background, p.blocks.map((b) => blk(b.type, b.props)), p.seo);
  });
  pages.products = productsPage(); // kept for any deep links, but NOT in the nav — the live storefront (#shop, labelled "Products") is the catalogue
  const legalSlugs = seedLegalPages(pages); // Terms/Privacy/Cookies/Refunds — footer-only, kept out of the primary nav
  const order = ['home', 'how-we-help', 'about', 'method', 'climb', 'services', 'industries', 'proof', 'insights', 'ai-market-intelligence', 'contact', ...legalSlugs].filter((s) => pages[s]);
  const withOrg = (arr) => arr.map((x) => ({ ...x, orgId: ORG.id }));
  const seedProducts = withOrg(SEED_PRODUCTS); const seedCats = withOrg(SEED_CATEGORIES);
  // the catalogue ships published: draft (products/categories) and the public projection start identical
  return { schema: SCHEMA, seedVersion: SEED_VERSION, settings: { ...DEFAULT_SETTINGS }, navigation: DEFAULT_NAVIGATION(), sections: [], order, pages, assets: {}, org: ORG,
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
// Deep voice repair: the em dash (—) is a banned AI tell, so sweep it out of every string value in a
// persisted content tree (e.g. a service catalogue baked into a block BEFORE the source file was cleaned).
// Replaces " — " / "—" with ", " (a comma is grammatically safe where an em dash sat). Returns the SAME
// reference when there is nothing to change, so it is idempotent + cheap on already-clean content.
function deEmDash(v) {
  if (typeof v === 'string') return v.indexOf('—') === -1 ? v : v.replace(/\s*—\s*/g, ', ');
  if (Array.isArray(v)) { let ch = false; const out = v.map((x) => { const n = deEmDash(x); if (n !== x) ch = true; return n; }); return ch ? out : v; }
  if (v && typeof v === 'object') { let ch = false; const out = {}; for (const k of Object.keys(v)) { const n = deEmDash(v[k]); if (n !== v[k]) ch = true; out[k] = n; } return ch ? out : v; }
  return v;
}

function migrate(state) {
  if (!state || !state.pages) return seedState();
  Object.values(state.pages).forEach((p) => {
    if (!p.status) p.status = 'published';
    // voice: sweep banned em dashes from persisted CONTENT (draft + live projection together, so no
    // artificial drift appears). Idempotent — clean pages return the same refs and are untouched.
    const sweptData = deEmDash(p.data); if (sweptData !== p.data) p.data = sweptData;
    if (p.published) { const sweptPub = deEmDash(p.published); if (sweptPub !== p.published) p.published = sweptPub; }
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
  // backfill the editable navigation tree (additive: only when absent, so an admin's edits are kept)
  if (!Array.isArray(state.navigation)) state.navigation = DEFAULT_NAVIGATION();
  if (!Array.isArray(state.redirects)) state.redirects = []; // slug-rename forwarding table (read by the #go self-heal + link audit)
  // launch legal scaffolds (additive: adds any missing Terms/Privacy/Cookies/Refunds page + appends to the
  // order, never overwriting one an admin has already edited). footerOnly keeps them out of the primary nav.
  if (state.pages && Array.isArray(state.order)) {
    for (const slug of seedLegalPages(state.pages)) if (!state.order.includes(slug)) state.order.push(slug);
  }
  if (!Array.isArray(state.sections)) state.sections = []; // saved-section library (reusable named block presets)
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
        { q: 'What actually happens in a Diagnostic?', a: 'Thirty focused minutes where we map your week against the eight pillars and show you where the hours are draining. You leave with a clear read on what your week is quietly costing you and where we would start. No deck, no obligation.' },
        { q: 'Are you a software house or consultants?', a: 'Neither, exactly. We embed alongside your team and build the systems that fit how you actually run. Twenty years of doing the work, not advising from the outside.' },
        { q: 'How long before we see results?', a: 'The Diagnostic gives you a costed picture in the first session. Real change follows the work: we find the drains, build the fix, then stay embedded until the new way is the only way. Usually weeks, not quarters.' },
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
  // Comparison matrix on Services (additive, Excellence-loop cycle 19; NO SEED_VERSION bump): insert the
  // "us vs the alternative" positioning block on existing saved sites ONCE (flagged), before the FAQ (the
  // decision-point cluster), else before the Invite. blk() merges the block's defaultProps so the stored
  // item carries full content (PublicRender renders it verbatim). Idempotent + respects a hand-removal.
  if (!state._cmpSeeded) {
    const sp = state.pages && state.pages.services;
    const addCmp = (content) => {
      if (!Array.isArray(content) || content.some((b) => b && b.type === 'ComparisonMatrix')) return;
      let idx = content.findIndex((b) => b && b.type === 'Faq');
      if (idx < 0) idx = content.findIndex((b) => b && b.type === 'Invite');
      content.splice(idx >= 0 ? idx : content.length, 0, blk('ComparisonMatrix', {}));
    };
    if (sp && sp.data) addCmp(sp.data.content);
    if (sp && sp.published && sp.published !== sp.data) addCmp(sp.published.content);
    state._cmpSeeded = true;
  }
  // The home FAQ migration was removed with Ben's homepage rebuild. It re-inserted an
  // objection-handling FAQ before the closing Invite, gated on a flag a FRESH seed never sets, so
  // after the re-seed it reappeared on the SECOND load and every load after, in the retired voice
  // and in a chapter sequence that has no FAQ. Deleting it is the fix; nothing replaces it.
  // Proof Hero CTA (additive, cycle 10; NO SEED_VERSION bump): give the proof page Hero its above-fold
  // "Book a Deep Dive" CTA on existing saved sites, ONLY when it is still the empty seed default with the
  // seeded #book href (so a hand-edited label/href is never clobbered). Both draft + published.
  {
    const pp = state.pages && state.pages.proof;
    const fillProofCta = (content) => {
      if (!Array.isArray(content)) return;
      const hero = content.find((b) => b && b.type === 'Hero');
      if (hero && hero.props && !hero.props.ctaLabel && (hero.props.ctaHref === '#book' || hero.props.ctaHref == null)) {
        hero.props.ctaLabel = 'Book a Deep Dive';
        if (!hero.props.ctaHref) hero.props.ctaHref = '#book';
      }
    };
    if (pp && pp.data) fillProofCta(pp.data.content);
    if (pp && pp.published && pp.published !== pp.data) fillProofCta(pp.published.content);
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
    // The home-hero CTA backfill was removed with the rebuild: it wrote "Book a Deep Dive" into an
    // empty primary CTA, which is the retired voice. Ben's hero ships with its own approved label.
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
  // Service catalogue (additive, 2026-06-25; NO SEED_VERSION bump): surface the productized service
  // catalogue on the services page of existing saved sites ONCE (flagged), just after the "three moves"
  // ServiceCards (the WHAT, after the HOW), else after the Hero. blk() bakes the block's full defaultProps
  // (the whole catalogue) into the stored item, so PublicRender renders it verbatim. Idempotent + respects
  // a later hand-removal (the flag is not re-run).
  if (!state._svcCatalogSeeded) {
    const sp = state.pages && state.pages.services;
    const addCatalog = (content) => {
      if (!Array.isArray(content) || content.some((b) => b && b.type === 'ServiceCatalog')) return;
      let idx = content.findIndex((b) => b && b.type === 'ServiceCards');
      if (idx >= 0) idx += 1; // just after the three-moves cards
      else { const h = content.findIndex((b) => b && b.type === 'Hero'); idx = h >= 0 ? h + 1 : content.length; }
      content.splice(idx, 0, blk('ServiceCatalog', {}));
    };
    if (sp && sp.data) addCatalog(sp.data.content);
    if (sp && sp.published && sp.published !== sp.data) addCatalog(sp.published.content);
    state._svcCatalogSeeded = true;
  }
  // Services catalogue kicker (additive, 2026-06-25; NO bump): John chose "Managed Services" over the
  // brainstorm's "The Foundation" umbrella. Relabel any ServiceCatalog already inserted (with the old
  // default kicker) on existing saved sites, ONCE (flagged). Idempotent; respects a later hand-edit.
  if (!state._svcCatalogKicker) {
    const relabel = (content) => {
      if (!Array.isArray(content)) return;
      content.forEach((b) => { if (b && b.type === 'ServiceCatalog' && b.props && b.props.kicker === 'The Foundation') b.props.kicker = 'Managed Services'; });
    };
    const sp = state.pages && state.pages.services;
    if (sp && sp.data) relabel(sp.data.content);
    if (sp && sp.published && sp.published !== sp.data) relabel(sp.published.content);
    state._svcCatalogKicker = true;
  }
  // Diagnostic rename (additive, 2026-06-25; NO SEED_VERSION bump): the "Deep Dive" booking language is
  // retired for "Diagnostic" wherever it shows. Sweep every saved page's block props, root, SEO, version
  // snapshots and the site-chrome settings ONCE (flagged), rewriting the display substrings. Runs AFTER the
  // inserts above so any freshly-added "Deep Dive" copy is caught too. Naturally idempotent (no match
  // remains after the first pass); flagged so it never fights a deliberate later hand-edit. Block TYPE ids
  // ("BookDeepDive") carry no space and are left untouched.
  if (!state._diagnosticRename) {
    const swap = (s) => (typeof s === 'string'
      ? s.replace(/Deep Dive/g, 'Diagnostic').replace(/deep dive/g, 'diagnostic')
      : s);
    const deep = (v) => {
      if (typeof v === 'string') return swap(v);
      if (Array.isArray(v)) return v.map(deep);
      if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = deep(v[k]); return o; }
      return v;
    };
    if (state.settings) state.settings = deep(state.settings);
    if (state.pages) {
      for (const k of Object.keys(state.pages)) {
        const p = state.pages[k]; if (!p) continue;
        if (p.data) p.data = deep(p.data);
        if (p.published) p.published = deep(p.published);
        if (p.seo) p.seo = deep(p.seo);
        if (p.versions) p.versions = deep(p.versions);
      }
    }
    state._diagnosticRename = true;
  }
  // Service catalogue v3 (additive, 2026-06-25; NO bump): clear NAMES + SLUGS (v2) PLUS the Featured
  // inputs — admin pick (featured), New (isNew) and most-popular by interaction. Refresh the data baked
  // into the Services-page catalogue block on existing saved sites ONCE (flagged) so returning visitors
  // get the new names/slugs/intro/New-flags. Keeps the editor's chosen kicker. The flag bumped v2→v3 so
  // sites that already took v2 re-refresh once. Safe: the catalogue is new with no real CMS edits yet.
  if (!state._svcCatalogV3) {
    const fresh = (config.components.ServiceCatalog && config.components.ServiceCatalog.defaultProps) || {};
    const refresh = (content) => {
      if (!Array.isArray(content)) return;
      content.forEach((b) => {
        if (b && b.type === 'ServiceCatalog' && b.props) {
          if (Array.isArray(fresh.services)) b.props.services = fresh.services;
          if (Array.isArray(fresh.categories)) b.props.categories = fresh.categories;
          if (fresh.intro) b.props.intro = fresh.intro;
          if (!b.props.kicker) b.props.kicker = fresh.kicker;
        }
      });
    };
    const sp = state.pages && state.pages.services;
    if (sp && sp.data) refresh(sp.data.content);
    if (sp && sp.published && sp.published !== sp.data) refresh(sp.published.content);
    state._svcCatalogV3 = true;
  }
  state.schema = SCHEMA;
  return state;
}

// Update global site-chrome settings (logo, siteName, footerTagline, headerCtaLabel, background). Shallow
// merge so a panel can patch one field; persisted by App's autosave like any other state mutation.
export function updateSettings(state, patch) {
  return { ...state, settings: { ...state.settings, ...(patch || {}) } };
}

// Replace the whole header navigation tree. The Navigation panel manages add/remove/reorder/nest in its
// own working copy and writes the full tree here. Global chrome — persisted + live immediately (no
// publish gate), exactly like updateSettings.
export function setNavigation(state, navigation) {
  return { ...state, navigation: Array.isArray(navigation) ? navigation : (state.navigation || []) };
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

// Seed a new DRAFT from a curated starter recipe (cycle 17). Mirrors addPageTo exactly — unique-slug mint,
// deep-cloned default bg, seedPage status 'draft', published/publishedBackground nulled, _goto — the ONLY
// difference is the content array comes from a starter instead of a hardcoded single Hero. Each built block
// runs through blk() so component defaultProps backfill (no undefined field). Uniqueness comes from passing
// rid as mintId (blk spreads ...props last, so the mintId-minted props.id survives). Unknown id → addPageTo.
export function addPageFromStarter(state, title, starterId, mintId = rid) {
  const starter = starterById(starterId);
  if (!starter) return addPageTo(state, title);
  let slug = slugify(title); let n = 2;
  while (state.pages[slug]) slug = slugify(title) + '-' + n++;
  const dflt = state.settings.background || 'stone-summit';
  const bg = typeof dflt === 'object' ? JSON.parse(JSON.stringify(dflt)) : dflt;
  const content = buildStarterContent(starter, mintId).map((b) => blk(b.type, b.props));
  const page = seedPage(title, bg, content, null, 'draft');
  page.published = null;
  page.publishedBackground = null;
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
  clone.publishAt = null; // nor its source's publish embargo — a fresh draft is unscheduled
  clone.note = null; // nor its source's editorial note — a fresh draft starts unannotated
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
