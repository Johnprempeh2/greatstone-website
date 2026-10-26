import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react';
import { BRAND_TAGLINE } from './lib/brand.mjs';
import { config, blockCss } from './puck.config.jsx';
import PublicRender from './PublicRender.jsx';
import { STAGE_OPTIONS } from './stage-presets.js';
import { publicNavOrder } from './lib/nav-order.js';
import { initAnalytics, pageview, track, analyticsConfigured } from './lib/analytics.js';
import { arrivalAction, parseEnquireHref, setPendingInterest } from './lib/enquiry.mjs';
import { openBooking } from './lib/booking.js';
import { siteOrigin } from './lib/site-origin.mjs';
import ConsentBanner from './ConsentBanner.jsx';

// The 3D Stage pulls in three.js (~520KB) — purely a decorative background, so it must not block
// first paint. Lazy-load it behind Suspense (transparent fallback): the page content renders
// immediately and the 3D fades in once its chunk arrives. Same <Stage .../> call sites as before.
const LazyStage = lazy(() => import('./Stage.jsx'));
function Stage(props) { return <Suspense fallback={null}><LazyStage {...props} /></Suspense>; }

// The Puck EDITOR (~432KB) + its CSS are admin-only. Lazy-load them so a public visitor never
// downloads the editor; the chunk arrives only when a signed-in admin opens edit mode. Public
// pages render through the tiny PublicRender above instead of Puck's heavyweight <Render>.
const PuckEditor = lazy(() => import('./EditorMount.jsx'));
// undo/redo buttons live in their own lazy module (they call usePuck → @measured/puck); kept off
// the public bundle, loaded with the editor and rendered inside Puck's context via headerActions.
const UndoRedo = lazy(() => import('./cms/UndoRedo.jsx'));
const ContextBar = lazy(() => import('./cms/ContextBar.jsx')); // universal contextual style strip (editor-only)
// Live storefront — reads Supabase (@supabase/supabase-js); lazy so the public bundle stays lean
// (the chunk arrives only on the #shop route).
const LazyStoreBrowse = lazy(() => import('./store/StoreBrowse.jsx'));
const LazyStoreProduct = lazy(() => import('./store/StoreProduct.jsx'));
const LazyCatalogueAdmin = lazy(() => import('./store/CatalogueAdmin.jsx'));
// Live-store basket + Stripe checkout + post-payment confirmation. Lazy: only the store/confirm
// routes pull it (and the cart singleton it depends on) into the bundle.
const LazyStoreCart = lazy(() => import('./store/StoreCart.jsx'));
const LazyAccount = lazy(() => import('./store/AccountDashboard.jsx')); // #account — customer self-serve portal
const LazyOrg = lazy(() => import('./store/OrgDashboard.jsx'));         // #org — customer organization dashboard
const LazyPortal = lazy(() => import('./portal/Portal.jsx'));           // #portal[/doc|receipt/<id>] — client portal (GRE-1256)
const LazyInvoice = lazy(() => import('./store/InvoiceView.jsx'));      // #invoice/<orderId> — printable VAT invoice
const LazyMethodExplorer = lazy(() => import('./blocks/MethodExplorer.jsx')); // #breakdown — full-screen methodology explorer
const LazyIntelHub = lazy(() => import('./intel/IntelHub.jsx')); // the AI Intelligence section — renders inline as the body of the "Intelligence" page (the renamed Insights)
const LazyIntelArticle = lazy(() => import('./intel/IntelArticle.jsx')); // #intel/<id> — a single briefing's own article page
const LazyServiceDetail = lazy(() => import('./store/ServiceDetail.jsx')); // #service/<slug> — a single service's own page

// Branded loading state for the lazy Intel Hub chunk. Self-contained (inline styles + scoped
// keyframes) because intel.css ships *inside* that chunk and isn't available while it loads.
function IntelBoot() {
  return (
    <div role="status" aria-live="polite" style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'grid', placeItems: 'center', background: 'radial-gradient(circle at 50% 36%, #11160f 0%, #090b08 72%)' }}>
      <style>{`
        @keyframes ihBootSpin { to { transform: rotate(360deg); } }
        @keyframes ihBootPulse { 0%,100% { opacity:.4; transform:scale(.93); } 50% { opacity:1; transform:scale(1); } }
        @keyframes ihBootDraw { from { stroke-dashoffset: 184; } to { stroke-dashoffset: 0; } }
        @keyframes ihBootBar { 0% { transform: translateX(-120%); } 100% { transform: translateX(360%); } }
        .ihb-ring { transform-origin: 50% 50%; animation: ihBootSpin 9s linear infinite; }
        .ihb-mark { animation: ihBootPulse 2.4s cubic-bezier(.16,1,.3,1) infinite; }
        .ihb-stroke { stroke-dasharray: 184; animation: ihBootDraw 1.7s cubic-bezier(.16,1,.3,1) forwards; }
        .ihb-track { position: relative; width: 168px; height: 3px; border-radius: 3px; background: rgba(200,255,0,.12); overflow: hidden; }
        .ihb-track::after { content:''; position:absolute; top:0; left:0; bottom:0; width:38%; border-radius:3px; background: linear-gradient(90deg, transparent, #c8ff00, transparent); animation: ihBootBar 1.5s cubic-bezier(.65,0,.35,1) infinite; }
        @media (prefers-reduced-motion: reduce) {
          .ihb-ring, .ihb-mark, .ihb-stroke { animation: none !important; }
          .ihb-track::after { animation: none !important; transform: none; width: 100%; opacity:.55; }
        }
      `}</style>
      <div style={{ display: 'grid', placeItems: 'center', gap: '28px' }}>
        <div style={{ position: 'relative', width: 92, height: 92, display: 'grid', placeItems: 'center' }}>
          <svg className="ihb-ring" width="92" height="92" viewBox="0 0 92 92" aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
            <circle cx="46" cy="46" r="43" fill="none" stroke="rgba(200,255,0,.13)" strokeWidth="1" />
            <circle cx="46" cy="46" r="43" fill="none" stroke="#c8ff00" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="22 250" />
          </svg>
          <svg className="ihb-mark" width="46" height="46" viewBox="0 0 64 64" aria-hidden="true">
            <path className="ihb-stroke" d="M32 10 L50 24 L44 50 L20 50 L14 24 Z" fill="none" stroke="#c8ff00" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </div>
        <div style={{ display: 'grid', placeItems: 'center', gap: '11px', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Montserrat',system-ui,sans-serif", fontSize: '.72rem', fontWeight: 700, letterSpacing: '.22em', textTransform: 'uppercase', color: '#c8ff00' }}>Greatstone Intelligence</div>
          <div style={{ fontFamily: "'Montserrat',system-ui,sans-serif", fontSize: '.86rem', color: '#b0b6ac' }}>Assembling today&rsquo;s briefing</div>
          <div className="ihb-track" />
        </div>
      </div>
    </div>
  );
}
import Header from './Header.jsx';
import Footer from './Footer.jsx';
import CommandPalette from './cms/CommandPalette.jsx';
import ShortcutsOverlay from './cms/ShortcutsOverlay.jsx';
// Admin studio panels: lazy-loaded so they ship in the on-demand 'studio' chunk (vite.config manualChunks),
// never in a public visitor's first paint. Every one of these renders ONLY inside the admin console or the
// editor's StudioPanel, both wrapped in Suspense below.
const SeoPanel = lazy(() => import('./cms/SeoPanel.jsx'));
const VersionHistory = lazy(() => import('./cms/VersionHistory.jsx'));
const ActivityPanel = lazy(() => import('./cms/ActivityPanel.jsx'));
const OverviewPanel = lazy(() => import('./cms/OverviewPanel.jsx'));
const ReleaseBoard = lazy(() => import('./cms/ReleaseBoard.jsx'));
const TeamPanel = lazy(() => import('./cms/TeamPanel.jsx'));
const PagesPanel = lazy(() => import('./cms/PagesPanel.jsx'));
const NavigationPanel = lazy(() => import('./cms/NavigationPanel.jsx'));
const LinkAuditPanel = lazy(() => import('./cms/LinkAuditPanel.jsx'));
const ContentSearchPanel = lazy(() => import('./cms/ContentSearchPanel.jsx'));
const RedirectsPanel = lazy(() => import('./cms/RedirectsPanel.jsx'));
const SavedSectionsPanel = lazy(() => import('./cms/SavedSectionsPanel.jsx'));
const CopyCoachPanel = lazy(() => import('./cms/CopyCoachPanel.jsx'));
const A11yPanel = lazy(() => import('./cms/A11yPanel.jsx'));
const OutlinePanel = lazy(() => import('./cms/OutlinePanel.jsx'));
const CtaConsistencyPanel = lazy(() => import('./cms/CtaConsistencyPanel.jsx'));
const ServicesManagerPanel = lazy(() => import('./cms/ServicesManagerPanel.jsx'));
import { findCatalog } from './lib/service-admin.mjs';
const SeoHealthPanel = lazy(() => import('./cms/SeoHealthPanel.jsx'));
const NavCoveragePanel = lazy(() => import('./cms/NavCoveragePanel.jsx'));
const MediaUsagePanel = lazy(() => import('./cms/MediaUsagePanel.jsx'));
const ContentInventoryPanel = lazy(() => import('./cms/ContentInventoryPanel.jsx'));
const BlockUsagePanel = lazy(() => import('./cms/BlockUsagePanel.jsx'));
const SiteHealthPanel = lazy(() => import('./cms/SiteHealthPanel.jsx'));
const GettingStartedPanel = lazy(() => import('./cms/GettingStartedPanel.jsx'));
const StartersPanel = lazy(() => import('./cms/StartersPanel.jsx'));
import { deriveChecklist } from './lib/onboarding-model.mjs';
const SchedulePanel = lazy(() => import('./cms/SchedulePanel.jsx'));
const NotesPanel = lazy(() => import('./cms/NotesPanel.jsx'));
import { diffVersions } from './lib/version-diff.mjs';
import { checkVoice } from './lib/voice-check.mjs';
import { checkA11y } from './lib/a11y-check.mjs';
import { buildSiteOutline } from './lib/outline-model.mjs';
import { headingsOf } from './lib/headings-of.mjs';
import { buildCtaReport } from './lib/cta-consistency.mjs';
import { buildReviewQueue } from './lib/review-model.mjs';
import { checkSeo } from './lib/seo-check.mjs';
import { auditNavCoverage } from './lib/nav-coverage.mjs';
import { auditMedia } from './lib/media-audit.mjs';
import { analyzeContent } from './lib/content-stats.mjs';
import { analyzeBlocks } from './lib/block-usage-model.mjs';
import { computeHealth } from './lib/site-health.mjs';
import { setSchedule, clearSchedule, listSchedules } from './lib/schedule-model.mjs';
import { setNote, clearNote, listNotes } from './lib/notes-model.mjs';
import { bulkSetStatus } from './lib/bulk-status.mjs';
import { bulkSetSchedule, bulkClearSchedule, bulkSetNote, bulkClearNote, bulkSetAssignee, bulkClearAssignee } from './lib/bulk-meta.mjs';
const BackgroundPanel = lazy(() => import('./cms/BackgroundPanel.jsx'));
const StudioPanel = lazy(() => import('./cms/StudioPanel.jsx'));
const AdminConsole = lazy(() => import('./cms/AdminConsole.jsx'));
const SiteSettingsPanel = lazy(() => import('./cms/SiteSettingsPanel.jsx'));
const MediaLibraryPanel = lazy(() => import('./cms/MediaLibraryPanel.jsx'));
import SignIn from './cms/SignIn.jsx';
import EditorTopMenu from './cms/EditorTopMenu.jsx';
import Tour from './cms/Tour.jsx';
import { useTour } from './cms/useTour.mjs';
import Modal from './cms/Modal.jsx';
import { ROLES } from './cms/auth.js'; // prototype roster roles (the Team panel is still a prototype)
import { staffCan, ROLE_LABEL, roleNotice } from './cms/staffRoles.mjs'; // the signed-in user's Supabase role → capabilities
import { parseAdminHash, PER_PAGE_SECTIONS } from './cms/adminRoute.mjs';
import { load, persist, addPageTo, pushVersion, TRANSITIONS, canTransition, removePage, duplicatePage, renamePage, movePage, setSlug, addAsset, listAssets, rid, RESERVED_SLUGS, addProduct, updateProduct, removeProduct, addCategory, removeCategory, inviteTeamMember, updateTeamMember, removeTeamMember, logActivity, findProductBySlug, catalogHasDrift, publishCatalog, discardCatalogDraft, inviteStatus, acceptInvite, resendInvite, updateSettings, setNavigation, removeAsset, updateAsset, auditLinks, resolveRedirect, addRedirect, removeRedirect, setRedirect, listRedirects, validateRedirect, addSection, removeSection, renameSection, listSections, buildInsertBlock, addPageFromStarter, listStarters } from './store.js';
import AcceptInvite from './cms/AcceptInvite.jsx';
import SiteChrome from './cms/SiteChrome.jsx';
import EditorBoundary from './cms/EditorBoundary.jsx';
import { MediaContext } from './cms/MediaField.jsx';
import { LinkContext } from './cms/LinkField.jsx';
import { CatalogContext } from './cms/CatalogContext.js';
import { ServicesContext, servicesFromPage } from './store/services.mjs';
import { parsePortalHash } from './portal/portal-model.mjs';

const STATUSES = [
  { id: 'draft', label: 'Draft' },
  { id: 'review', label: 'In review' },
  { id: 'approved', label: 'Approved' },
  { id: 'published', label: 'Published' },
];
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Per-page SEO lives on the page (title/description/ogImage). The SeoPanel only PREVIEWS it; the
// real <head> was never updated, so the document title and social cards stayed on index.html's
// placeholder. This applies the stored SEO to the head and refreshes it on navigation/edit, so
// what the panel previews is what the page actually serves. The dev team's Laravel build will
// render the same fields server-side; the prototype keeps index.html's noindex (don't touch it).
// Canonical public origin (SEO/canonical/og/schema). Domain-portable: tracks the live host unless
// VITE_SITE_ORIGIN pins it at build time. Single source of truth in lib/site-origin.mjs (same as the
// SeoPanel preview). See docs/DOMAIN-CUTOVER.md.
const SITE_ORIGIN = siteOrigin();
// #product/<slug> (or #/product/<slug>) → the public product detail route; anything else → null
function readProductHash() {
  const m = (typeof location !== 'undefined' ? location.hash : '').match(/^#\/?product\/([\w-]+)/i);
  return m ? m[1] : null;
}
// #service/<slug> → a single service's own detail page (the services catalogue's product-detail twin)
function readServiceHash() {
  const m = (typeof location !== 'undefined' ? location.hash : '').match(/^#\/?service\/([\w-]+)/i);
  return m ? m[1] : null;
}
// #join/<token> → the invite-accept route (the DX-dashboard invitation link)
function readJoinHash() {
  const m = (typeof location !== 'undefined' ? location.hash : '').match(/^#\/?join\/([\w-]+)/i);
  return m ? m[1] : null;
}
// #admin[/<section>[/<slug>]] → the admin console (or the editor when section==='editor'). Defers to
// the pure, unit-tested parseAdminHash so the URL, the rendered destination and the active rail item
// can never disagree. Sections: overview|pages|releases|seo|background|history|activity|team|editor.
function readAdminHash() {
  return parseAdminHash(typeof location !== 'undefined' ? location.hash : '');
}
// #breakdown → the full-screen interactive methodology explorer (the method Hero's "interactive breakdown")
function readBreakdownHash() {
  return /^#\/?breakdown\b/i.test(typeof location !== 'undefined' ? location.hash : '');
}
// #intel/<id> → a single briefing's own article page (rendered inside the chrome).
function readIntelArticle() {
  const m = (typeof location !== 'undefined' ? location.hash : '').match(/^#\/?intel\/([\w-]+)/i);
  return m ? m[1] : null;
}
// bare #intel (or #intel/) → legacy hash for the old full-screen hub. The hub now lives inline on the
// Intelligence page, so this only triggers a redirect onto that page (see the effect below).
function readIntelHash() {
  return /^#\/?intel\/?$/i.test(typeof location !== 'undefined' ? location.hash : '');
}
// #shop or #shop/<vendor-slug> → the live storefront (reads Supabase)
function readShopHash() {
  const m = (typeof location !== 'undefined' ? location.hash : '').match(/^#\/?shop(?:\/([\w-]+))?/i);
  return m ? { vendor: m[1] || '' } : null;
}
// #catalogue[/<tab>] → the live catalogue admin (Supabase-authenticated, gated to staff). Returns the
// tab to open ('offerings' default) so the hub can deep-link to Orders/Quotes/etc., or null when off it.
function readCatalogueHash() {
  const m = (typeof location !== 'undefined' ? location.hash : '').match(/^#\/?catalogue(?:\/([a-z]+))?/i);
  return m ? (m[1] || 'offerings') : null;
}
// #order-confirmed[?session=…] → Stripe redirected back after a successful payment
function readConfirmHash() {
  return /^#\/?order-confirmed\b/i.test(typeof location !== 'undefined' ? location.hash : '');
}
// #account → customer self-serve portal (sign in / orders / billing)
function readAccountHash() {
  return /^#\/?account\b/i.test(typeof location !== 'undefined' ? location.hash : '');
}
// Better Auth returns reset tokens and invalid-link errors in the URL query.
// Capture them before routing so a bare email landing opens the account screen.
const _authQuery = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const AUTH_LANDING = _authQuery.has('token') || _authQuery.has('error');
const RECOVERY_LANDING = _authQuery.has('token');
const AUTH_ERROR_MSG = _authQuery.has('error') ? 'That link is invalid or has expired.' : null;
// #org → customer organization dashboard (company hub, members, DX engagement timeline)
function readOrgHash() {
  return /^#\/?org\b/i.test(typeof location !== 'undefined' ? location.hash : '');
}
// #portal, #portal/doc/<id>, #portal/receipt/<id> → client portal (route parsing is unit-tested in portal-model)
function readPortalHash() {
  return parsePortalHash(typeof location !== 'undefined' ? location.hash : '');
}
// #invoice/<orderId> → printable VAT invoice
function readInvoiceHash() {
  const m = (typeof location !== 'undefined' ? location.hash : '').match(/^#\/?invoice\/([\w-]+)/i);
  return m ? m[1] : null;
}
const SITE_NAME = 'Greatstone International';
function upsertMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute('content', content);
}
function dropMeta(attr, key) { const el = document.head.querySelector(`meta[${attr}="${key}"]`); if (el) el.remove(); }
function applyHead(seo, pageTitle, slug) {
  const s = seo || {};
  const title = s.title || `${pageTitle} · ${SITE_NAME}`;
  const desc = (s.description || '').trim();
  const url = SITE_ORIGIN + (slug === 'home' ? '' : '/' + slug);
  document.title = title;
  // canonical
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) { link = document.createElement('link'); link.setAttribute('rel', 'canonical'); document.head.appendChild(link); }
  link.setAttribute('href', url);
  // description family — present only when actually written, so empty pages carry no stub meta
  if (desc) { upsertMeta('name', 'description', desc); upsertMeta('property', 'og:description', desc); upsertMeta('name', 'twitter:description', desc); }
  else { dropMeta('name', 'description'); dropMeta('property', 'og:description'); dropMeta('name', 'twitter:description'); }
  // open graph
  upsertMeta('property', 'og:type', 'website');
  upsertMeta('property', 'og:site_name', SITE_NAME);
  upsertMeta('property', 'og:locale', 'en_GB');
  upsertMeta('property', 'og:title', title);
  upsertMeta('property', 'og:url', url);
  upsertMeta('name', 'twitter:title', title);
  // image family — clear it when a page has none so the previous page's image doesn't linger
  // Always emit a large-image card: the page's own image when set, otherwise the branded default
  // (absolute URL via SITE_ORIGIN). No page shares bare.
  const ogImg = s.ogImage || (SITE_ORIGIN + '/og-default.png');
  upsertMeta('property', 'og:image', ogImg); upsertMeta('name', 'twitter:image', ogImg); upsertMeta('name', 'twitter:card', 'summary_large_image');
}

// Site-level structured data (schema.org): Organization + WebSite, injected once. Makes the site
// eligible for richer search results / knowledge-panel signals. Reuses SITE_ORIGIN so it tracks the
// canonical domain the dev team sets (same source as the canonical link + og:url). WT-27.
function injectStructuredData() {
  if (typeof document === 'undefined' || document.getElementById('gs-ld-org')) return;
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': SITE_ORIGIN + '/#organization',
        name: SITE_NAME,
        url: SITE_ORIGIN,
        slogan: BRAND_TAGLINE,
        // Fallback description for any route without page-level SEO. This is what search results and link
        // previews show, and it lived in code rather than the seed, so the Architecture v2.0 rebuild did not
        // reach it: it was still selling the retired "transformation partner, not a software house" position.
        // GRE-659: the Home description from GRE-652 §4.1, so search results match the R1 position.
        description: 'Practical digital transformation and AI-enabled automation. Greatstone finds where your people’s time goes and sets up the work that should run itself, with your people in charge.',
      },
      {
        '@type': 'WebSite',
        '@id': SITE_ORIGIN + '/#website',
        name: SITE_NAME,
        url: SITE_ORIGIN,
        inLanguage: 'en-GB',
        publisher: { '@id': SITE_ORIGIN + '/#organization' },
      },
    ],
  };
  const el = document.createElement('script');
  el.type = 'application/ld+json';
  el.id = 'gs-ld-org';
  el.textContent = JSON.stringify(data);
  document.head.appendChild(el);
}

// Pre-publish accessibility/SEO check: find images on the page that have no alt text. Figure and
// FeaturedArticle carry an explicit alt field; Team avatars use the member's name as alt (so a photo
// with no name is the gap). Returns a short human-readable list, used to warn before publishing.
function findMissingAlt(content, products) {
  const issues = [];
  const noAlt = (v) => !(v && String(v).trim());
  const list = content || [];
  list.forEach((b) => {
    const p = (b && b.props) || {};
    if ((b.type === 'Figure' || b.type === 'FeaturedArticle') && p.image && noAlt(p.alt)) {
      issues.push(b.type === 'Figure' ? 'Figure image' : 'Featured: ' + (p.title || 'article'));
    }
    if (b.type === 'Team' && Array.isArray(p.items)) {
      p.items.forEach((m) => { if (m && m.photo && noAlt(m.name)) issues.push('Team photo (no name)'); });
    }
    if (b.type === 'InsightsGrid' && Array.isArray(p.posts)) {
      p.posts.forEach((post) => { if (post && post.image && noAlt(post.alt)) issues.push('Insight: ' + (post.title || 'post')); });
    }
    if (b.type === 'Columns' && Array.isArray(p.columns)) {
      p.columns.forEach((c) => { if (c && c.image && noAlt(c.alt)) issues.push('Column: ' + (c.heading || 'column')); });
    }
  });
  // a page that shows the storefront also surfaces every product image — flag any with no alt text
  if (list.some((b) => b.type === 'Storefront')) {
    (products || []).forEach((p) => { if (p && p.image && p.status !== 'draft' && noAlt(p.imageAlt)) issues.push('Product: ' + (p.name || 'product')); });
  }
  return issues;
}

export default function App() {
  const [state, setState] = useState(load);
  const [current, setCurrent] = useState(() => arrivalAction(typeof location !== 'undefined' ? location.hash : '') ? 'contact' : state.order[0]);
  const [pageHash, setPageHash] = useState(() => typeof location !== 'undefined' ? location.hash : '');
  const [mode, setMode] = useState('view');
  const [query, setQuery] = useState('');
  const [cmdOpen, setCmdOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [panel, setPanel] = useState(null);        // 'seo' | 'history' | null
  const [savedAt, setSavedAt] = useState(null);
  const [sectionBrowse, setSectionBrowse] = useState(''); // which page the Saved-sections block browser shows
  const [toast, setToast] = useState(null);
  const [puckKey, setPuckKey] = useState(0);        // bump to force Puck to re-read data
  const [previewP, setPreviewP] = useState(null);   // background editor scrubber (0..1) → Stage
  const [user, setUser] = useState(null);           // signed-in Supabase staff { email, name, role } (null = public)
  const [catalogueStaff, setCatalogueStaff] = useState(null); // the catalogue console reports its own staff up (it owns its auth)
  const tourEmail = (user && user.email) || (catalogueStaff && catalogueStaff.email) || ''; // whoever we know is signed in
  const tour = useTour(tourEmail);                  // guided onboarding tours (active id + per-user seen-state)
  const [authChecked, setAuthChecked] = useState(false); // resolved the Supabase session yet (lazy, on #admin)
  const [authNotice, setAuthNotice] = useState(null); // why an authenticated session can't use the CMS (no/read-only role)
  const authSubRef = useRef(null);                  // the onAuthStateChange subscription (set up once)
  const mountedRef = useRef(true);                  // App lifetime — the long-lived auth subscription guards on this, not a per-run flag
  const [adminNav, setAdminNav] = useState(readAdminHash); // { section, slug } | null — the one admin-route source
  const [productSlug, setProductSlug] = useState(readProductHash); // #product/<slug> → public detail view
  const [svcSlug, setSvcSlug] = useState(readServiceHash); // #service/<slug> → public service detail view
  const [joinToken, setJoinToken] = useState(readJoinHash);        // #join/<token> → invite-accept screen
  const [shopRoute, setShopRoute] = useState(readShopHash);        // #shop[/<vendor>] → live storefront
  const [catalogueAdmin, setCatalogueAdmin] = useState(readCatalogueHash); // #catalogue → live catalogue admin (Supabase auth)
  const [confirmRoute, setConfirmRoute] = useState(readConfirmHash); // #order-confirmed → Stripe success page
  const [accountRoute, setAccountRoute] = useState(readAccountHash); // #account → customer self-serve portal
  const [authLanding, setAuthLanding] = useState(AUTH_LANDING); // arrived via a Supabase auth email link → mount the account portal
  const [recovery, setRecovery] = useState(RECOVERY_LANDING);  // …and if it was a password-reset link, show the reset form
  const [authError, setAuthError] = useState(AUTH_ERROR_MSG);  // …or if the link was bad, the reason to show on the sign-in screen
  const [orgRoute, setOrgRoute] = useState(readOrgHash); // #org → organization dashboard
  const [portalRoute, setPortalRoute] = useState(readPortalHash); // #portal… → client portal
  const [invoiceRoute, setInvoiceRoute] = useState(readInvoiceHash); // #invoice/<orderId> → printable invoice
  const [breakdownRoute, setBreakdownRoute] = useState(readBreakdownHash); // #breakdown → full-screen method explorer
  const [intelRoute, setIntelRoute] = useState(readIntelHash); // legacy bare #intel → redirect to the Intelligence page
  const [intelArticle, setIntelArticle] = useState(readIntelArticle); // #intel/<id> → a briefing's own article page
  const [storageError, setStorageError] = useState(false); // sticky: persist() failed (quota), edits at risk
  const [modal, setModal] = useState(null); // on-brand prompt/confirm (replaces window.prompt/confirm)
  const toastTimer = useRef(null);
  const didNavMount = useRef(false); // skip the initial mount when moving focus on navigation
  const persistTimer = useRef(null); // debounce the localStorage write
  const stateRef = useRef(state);    // latest state, for the debounced/unload flush
  stateRef.current = state;

  const onAdmin = !!adminNav;                          // anywhere under #admin (console or editor)
  const adminSection = adminNav ? adminNav.section : 'overview';

  // auto-start the right guided tour the first time a signed-in user enters a surface (each fires once, ever;
  // maybeAutoStart is a no-op if a tour is already running or this one has been seen). Replay lives in Help.
  useEffect(() => {
    // the catalogue owns its own auth, so we wait for it to report its staff (catalogueStaff) before offering
    // its guide; the rest of the admin uses App's resolved `user`.
    if (catalogueAdmin) { if (catalogueStaff || user) tour.maybeAutoStart('catalogue'); return; }
    if (!user) return;
    if (mode === 'edit') tour.maybeAutoStart('editor');
    // the quality guide is entirely edit-gated, so only offer it to a user who can act on it (a viewer would
    // otherwise auto-start a guide with zero visible steps). staffCan(user,'edit') inline — `canEdit` is declared
    // below this effect, so referencing it here would be a temporal-dead-zone error.
    else if (staffCan(user, 'edit') && (adminSection === 'releases' || adminSection === 'sitehealth')) tour.maybeAutoStart('quality');
    else tour.maybeAutoStart('hub');
  }, [user, catalogueStaff, onAdmin, mode, adminSection, catalogueAdmin]); // eslint-disable-line react-hooks/exhaustive-deps
  // skip the decorative 561KB three.js stage on data-saver / 2g connections — the .gs-scrim + CSS
  // background leave the page visually complete without it (the brand 3D is a progressive enhancement).
  const saveData = typeof navigator !== 'undefined' && navigator.connection && (navigator.connection.saveData || /(^|-)2g$/.test(navigator.connection.effectiveType || ''));
  const adminSlug = adminNav ? adminNav.slug : null;
  const editorReturn = useRef('overview');             // the console section to return to from ◇ Hub
  const authed = !!user;
  const canEdit = staffCan(user, 'edit');
  const canPublish = staffCan(user, 'publish');
  const canManageUsers = staffCan(user, 'manageUsers'); // owners/admins — gates the Team panel
  // stable object so the Tour's role-filtering + effects don't re-run on every unrelated App render
  const tourCaps = useMemo(() => ({ edit: canEdit, manage: canManageUsers }), [canEdit, canManageUsers]);

  // persist() now trims old version snapshots and retries before failing; a failure here means the
  // store is genuinely full, so raise a STICKY banner (not a 2.6s toast) — those edits won't survive a reload
  // Debounced persist: writing the WHOLE store (pages + products + team + version snapshots) to
  // localStorage on every keystroke got janky as content grew. Coalesce writes to ~400ms after the
  // last change; flush on tab close so nothing in-flight is lost. (Quota warning surfaces on the write.)
  useEffect(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => { setStorageError(!persist(stateRef.current)); }, 400);
    return () => { if (persistTimer.current) clearTimeout(persistTimer.current); };
  }, [state]);
  useEffect(() => {
    const flush = () => persist(stateRef.current);
    addEventListener('beforeunload', flush);
    return () => removeEventListener('beforeunload', flush);
  }, []);
  // A bare #<slug> is a marketing page, but only if it names a page that actually exists. Anything else is
  // left to the route parsers above, so an unknown hash can never blank the site.
  const readPageHash = useCallback(() => {
    if (typeof location === 'undefined') return null;
    const m = location.hash.match(/^#\/?(?:go\/)?([a-z0-9-]+)(?:\/([a-z0-9-]+))?$/i);
    if (!m) return null;
    const slug = m[1].toLowerCase();
    const pages = stateRef.current && stateRef.current.pages;
    return pages && pages[slug] ? slug : resolveRedirect(stateRef.current, slug);
  }, []);

  useEffect(() => {
    const onHash = () => { setPageHash(location.hash); setAdminNav(readAdminHash()); setProductSlug(readProductHash()); setSvcSlug(readServiceHash()); setJoinToken(readJoinHash()); setShopRoute(readShopHash()); setCatalogueAdmin(readCatalogueHash()); setConfirmRoute(readConfirmHash()); setAccountRoute(readAccountHash()); setOrgRoute(readOrgHash()); setPortalRoute(readPortalHash()); setInvoiceRoute(readInvoiceHash()); setBreakdownRoute(readBreakdownHash()); setIntelRoute(readIntelHash()); setIntelArticle(readIntelArticle()); setAuthLanding(false); if (!readAccountHash()) setAuthError(null);
      // Back, Forward, a pasted link and a reload all land on the right page.
      const page = readPageHash();
      if (page) setCurrent(page);
      else if (!location.hash) setCurrent(stateRef.current.order[0]);
    };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, [readPageHash]);

  // First paint: honour a deep link straight to a marketing page.
  useEffect(() => {
    const page = readPageHash();
    if (page) setCurrent(page);
  }, [readPageHash]);
  // Action fragments are also public entry URLs. They have no anchor to click on a fresh visit.
  useEffect(() => {
    if (typeof location === 'undefined') return;
    const action = arrivalAction(location.hash);
    if (!action) return;
    // The contact form has already read the interest from the arrival hash on its first render.
    history.replaceState(null, '', location.pathname + location.search + '#contact');
    if (action.type === 'book') openBooking();
  }, []);
  useEffect(() => {
    const anchor = pageHash.match(/^#go\/[a-z0-9-]+\/([a-z0-9-]+)$/i)?.[1];
    if (!anchor) return;
    const frame = requestAnimationFrame(() => {
      const section = document.getElementById(anchor);
      if (section) { section.scrollIntoView(); section.focus({ preventScroll: true }); }
    });
    return () => cancelAnimationFrame(frame);
  }, [current, pageHash]);
  // Legacy redirect: the AI Intelligence hub used to be a full-screen #intel takeover. It now lives in
  // the site nav as the "Intelligence" page (the renamed Insights), rendered inside the normal chrome.
  // Send any old #intel bookmark/link onto that page so shared links still land somewhere sensible.
  useEffect(() => {
    if (!intelRoute) return;
    if (typeof location !== 'undefined' && location.hash) location.hash = '';
    setIntelRoute(false);
    navigate(state.pages['ai-market-intelligence'] ? 'ai-market-intelligence' : state.order[0]);
  }, [intelRoute]); // eslint-disable-line react-hooks/exhaustive-deps
  // Editing is URL-addressable. (A) A #admin/editor/<slug> URL — refresh, a shared link, Back/Forward
  // — restores the editor on the right page. (B) While editing under the admin area, mirror the page
  // in the hash so a refresh keeps you in the editor and Back leaves it cleanly. (C) Per-page console
  // views (#admin/seo/<slug>) drive the acted-on page from the URL, so it survives refresh.
  useEffect(() => {
    if (!adminNav || !authed) return;
    if (adminNav.section === 'editor' && !canEdit) { goAdmin('overview'); return; } // viewers can't edit → console
    if (!canEdit) return;
    if (adminNav.section === 'editor') {
      if (adminNav.slug && state.pages[adminNav.slug] && adminNav.slug !== current) { setCurrent(adminNav.slug); setPuckKey((k) => k + 1); }
      if (mode !== 'edit') setMode('edit');
    } else if (mode === 'edit') {
      setMode('view'); // URL left the editor (Back/Forward, a shared console link) → leave edit mode too
    }
  }, [adminNav, authed, canEdit]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (mode === 'edit' && authed && canEdit && /^#\/?admin/i.test(typeof location !== 'undefined' ? location.hash : '')) {
      const want = '#admin/editor/' + current;
      if (location.hash !== want) {
        // entering the editor → push (one Back returns to the console); hopping pages mid-edit →
        // replace, so editing five pages doesn't cost five Backs to leave.
        if (/^#\/?admin\/editor\//i.test(location.hash)) history.replaceState(null, '', want);
        else location.hash = want;
      }
    }
  }, [mode, current, authed, canEdit]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (adminNav && adminNav.slug && PER_PAGE_SECTIONS.has(adminNav.section) && state.pages[adminNav.slug] && adminNav.slug !== current) {
      setCurrent(adminNav.slug);
    }
  }, [adminNav]); // eslint-disable-line react-hooks/exhaustive-deps
  // Resolve the signed-in Greatstone staff user LAZILY — only once you enter the admin area (#admin),
  // so a public visitor never loads the Supabase client (it stays out of the eager bundle). The same
  // account controls the console, the editor and the catalogue. We resolve once, then stay subscribed
  // to sign-in/out so the chrome updates live. (The catalogue owns its own auth and reports its staff up
  // via onStaff → catalogueStaff, so the catalogue tour has an identity without loading auth twice here.)
  useEffect(() => {
    if (!onAdmin || authChecked) return;
    let alive = true;
    import('./store/adminAuth.mjs').then(async (m) => {
      // guard on mountedRef (App lifetime), NOT the per-run `alive`: the onAuth subscription below is
      // long-lived, and `alive` flips false as soon as setAuthChecked(true) re-runs this effect — which
      // would otherwise leave every later sign-in/out/expiry event unable to update the chrome.
      const resolve = async () => {
        const s = await m.getSession().catch(() => null);
        if (!s) { if (mountedRef.current) { setUser(null); setAuthNotice(null); } return; }
        const staff = await m.getStaffUser().catch(() => null);
        if (!mountedRef.current) return;
        if (staff && m.isStaff(staff)) { setUser({ email: staff.email, name: staff.full_name || staff.email, role: staff.role }); setAuthNotice(null); }
        else {
          // authenticated, but no usable CMS role — surface why instead of a blank sign-in form
          setUser(null);
          setAuthNotice(staff ? roleNotice(staff.role) : 'You’re signed in, but this account isn’t set up for the Greatstone admin. Ask an owner or admin to add you.');
        }
      };
      await resolve();
      if (alive) setAuthChecked(true);
      if (!authSubRef.current) { const { data } = m.onAuth(() => resolve()); authSubRef.current = data ? data.subscription : null; }
    }).catch(() => { if (alive) setAuthChecked(true); });
    return () => { alive = false; };
  }, [onAdmin, authChecked]);
  useEffect(() => () => { mountedRef.current = false; if (authSubRef.current) try { authSubRef.current.unsubscribe(); } catch { /* noop */ } }, []);
  // keep the document <head> in sync — a product detail route gets its own per-product SEO
  // (name/summary/image), otherwise the current page's SEO. applyHead handles canonical + og/twitter.
  useEffect(() => {
    // utility / app routes have no CMS page behind them. Give each a clear, self-describing title +
    // canonical instead of leaving the previous page's SEO stamped on the tab. Order mirrors the
    // render precedence below (breakdown > admin > invoice > account > confirm > catalogue > shop > product).
    const utility = (t, slug, desc) => applyHead({ title: t + ' · ' + SITE_NAME, description: desc }, t, slug);
    if (breakdownRoute) { utility('The eight pillars', 'method'); return; }
    if (intelArticle) { utility('Briefing', 'insights'); return; } // the article component refines this to the headline on mount
    if (adminNav) { utility('Studio admin', 'home'); return; }
    if (invoiceRoute) { utility('Invoice', 'home', 'View and print the details of your Greatstone order.'); return; }
    if (accountRoute || authLanding) { utility('Your account', 'home', 'Manage your Greatstone account, orders and details.'); return; }
    if (orgRoute) { utility('Your organisation', 'home', 'Manage your organisation, team and orders with Greatstone.'); return; }
    if (portalRoute) { utility(portalRoute.view === 'receipt' ? 'Receipt' : portalRoute.view === 'doc' ? 'Document' : 'Client portal', 'home', 'Your Greatstone client portal.'); return; }
    if (confirmRoute) { utility('Order confirmed', 'home', 'Your Greatstone order is confirmed. Review the details.'); return; }
    if (catalogueAdmin) { utility('Catalogue admin', 'home', 'Manage the Greatstone product catalogue.'); return; }
    if (shopRoute) { utility('Products', 'shop'); return; }
    if (svcSlug) { utility('Service', 'service/' + svcSlug); return; } // the ServiceDetail component refines this to the service name + one-liner on load
    if (productSlug) {
      const pr = findProductBySlug(state.publishedProducts, productSlug);
      if (pr) { applyHead({ description: pr.summary, ogImage: pr.image }, pr.name, 'product/' + (pr.slug || productSlug)); return; }
      utility('Product not found', 'shop'); return; // a broken/old product link shows the not-found page; don't leave the home title stamped on the tab
    }
    const p = state.pages[current] || state.pages[state.order[0]];
    if (p) applyHead(p.seo, p.title, current);
  }, [current, state.pages, productSlug, svcSlug, state.publishedProducts, breakdownRoute, intelArticle, adminNav, invoiceRoute, accountRoute, orgRoute, portalRoute, confirmRoute, catalogueAdmin, shopRoute, authLanding]);
  // analytics: init once (dormant unless VITE_GTM_ID is set), then a page_view per route. This effect is
  // defined AFTER applyHead so document.title is already the new route's title when we report the view.
  useEffect(() => { initAnalytics(); injectStructuredData(); }, []);
  useEffect(() => {
    if (typeof location === 'undefined') return;
    pageview(location.pathname + location.hash, document.title);
  }, [current, productSlug, shopRoute, accountRoute, orgRoute, portalRoute, confirmRoute, catalogueAdmin, invoiceRoute, breakdownRoute, intelArticle, adminNav]);
  // a product route opens at the top, like a fresh page
  useEffect(() => { if (productSlug) try { scrollTo({ top: 0, behavior: 'instant' }); } catch (e) { scrollTo(0, 0); } }, [productSlug]);
  // on a public page change, move keyboard/screen-reader focus to the main content (skip the first
  // mount so we don't steal focus on load). Pairs with the skip link + scroll-to-top in navigate().
  useEffect(() => {
    if (!didNavMount.current) { didNavMount.current = true; return; }
    if (mode !== 'view') return;
    const m = document.getElementById('gs-main');
    if (m && typeof m.focus === 'function') m.focus({ preventScroll: true });
  }, [current, shopRoute, productSlug, accountRoute, orgRoute, portalRoute, catalogueAdmin, confirmRoute, invoiceRoute]); // eslint-disable-line react-hooks/exhaustive-deps
  // in-app CTA links: "#book" → contact page; "#go/<slug>" → that page (so cross-page ghost CTAs
  // navigate within the SPA instead of hitting a dead .html href). preventDefault keeps the hash clean.
  useEffect(() => {
    const onClick = (e) => {
      const a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      const href = a.getAttribute('href') || '';
      // every in-content book CTA (configurable label, e.g. "Book a Diagnostic") opens the on-brand Calendly popup (openBooking lazy-loads
      // the widget, themed dark + lime, and falls back to a new tab). The contact page + its form stay
      // reachable via the "Contact" nav for a note instead.
      if (href === '#book') { e.preventDefault(); track('cta_click', { cta: 'book_deep_dive', cta_location: 'content' }); openBooking(); return; }
      // "#enquire/<option>" (GRE-1373 §6): the contact page's enquiry form, with that interest already chosen
      const want = parseEnquireHref(href);
      if (want) { e.preventDefault(); track('cta_click', { cta: 'enquire', cta_location: 'content' }); setPendingInterest(want); navigate('contact'); return; }
      const m = href.match(/^#go\/([\w-]+)(?:\/([\w-]+))?$/);
      // self-heal: a link to a since-renamed page forwards to its current slug via the redirect table
      // (resolveRedirect returns the slug itself when it's already live), so old internal links never dead-end.
      if (m) { const t = resolveRedirect(state, m[1]); if (t) { e.preventDefault(); navigate(t, m[2]); } }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [state.order, state.pages, state.redirects]); // eslint-disable-line react-hooks/exhaustive-deps

  const page = state.pages[current] || state.pages[state.order[0]] || {};
  // human block label for the version-compare diff (e.g. "Hero", not the raw type), without making
  // VersionHistory import the Puck config directly.
  const labelFor = (type) => (config.components[type] && config.components[type].label) || type;
  // the 3D scene is part of the draft→publish gate: an editor sees their working background live in the
  // canvas, but the public keeps the published background until the page is published (mirrors data/published).
  const bg = (canEdit ? page.background : (page.publishedBackground ?? page.background)) || state.settings.background || 'stone';
  // the catalogue has a draft → published gate: the editor (Storefront preview in the Puck canvas, the
  // Products tab) sees the DRAFT; the public site renders the PUBLISHED projection. So an in-progress
  // price or status change never reaches visitors until an admin publishes the catalogue.
  const draftCatalog = useMemo(() => ({ products: state.products || [], categories: state.categories || [] }), [state.products, state.categories]);
  // Stable context values so the editor-only Media/Link providers don't invalidate every consumer (media
  // field, link field, Puck internals) on unrelated App re-renders. registerAsset dispatches via a state
  // updater so a captured reference is always current — safe to omit from deps.
  const mediaCtxValue = useMemo(() => ({ assets: listAssets(state), addAsset: registerAsset }), [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const linkCtxValue = useMemo(() => ({ pages: state.pages, order: state.order }), [state.pages, state.order]);
  const pubProducts = state.publishedProducts || [];
  const pubCategories = state.publishedCategories || [];
  const publishedCatalog = { products: pubProducts, categories: pubCategories };
  const catalogDrift = catalogHasDrift(state);
  function exitProduct() { if (location.hash) location.hash = ''; setProductSlug(null); navigate(state.pages.products ? 'products' : state.order[0]); }
  // the services catalogue + per-service detail pages all read this one published projection (pulled from
  // the Services page's catalogue block — the single CMS-editable source), so the listing, the detail pages
  // and the inquiry list never drift.
  const publishedServices = useMemo(() => servicesFromPage(state.pages && state.pages.services), [state.pages]);
  function exitService() { if (location.hash) location.hash = ''; setSvcSlug(null); navigate(state.pages.services ? 'services' : state.order[0]); }
  // a page is "unpublished" if its content OR its 3D background differs from the published snapshot
  const hasUnpublished = useMemo(() => !eq(page.data, page.published) || !eq(page.background, page.publishedBackground), [page.data, page.published, page.background, page.publishedBackground]);
  // Attention signals surfaced on the one "Studio" toolbar button + the relevant tabs, so editors see
  // what needs action without opening every panel. A page counts once (drift OR awaiting review).
  // on-brand voice check (Copy coach) — computed once, shared by the panel + the rail badge.
  const voiceReport = useMemo(() => checkVoice(state), [state.pages, state.order]);
  // content accessibility pre-flight (A11y coach) — computed once, shared by the panel + the rail badge.
  const a11yReport = useMemo(() => checkA11y(state), [state.pages, state.order]);
  // document outline (per-page heading tree + skipped-level/not-h1-first order check) — computed once, shared.
  // 'insights' renders the live AI Intelligence hub (LazyIntelHub), NOT its authored blocks (see the
  // `current === 'insights'` render special-case) — so it's marked dynamic, never given a fictional outline.
  const outlineReport = useMemo(() => buildSiteOutline(state, headingsOf, { dynamic: ['ai-market-intelligence'] }), [state.pages, state.order]);
  // conversion map: CTA label consistency + hidden buttons + dead-end pages (deps include redirects — canonicalDest collapses aliases).
  const ctaReport = useMemo(() => buildCtaReport(state, { dynamic: ['ai-market-intelligence'] }), [state.pages, state.order, state.redirects]);
  // change-review queue (Releases): which pages have unpublished edits (drift) or were never published, + the diff.
  const reviewReport = useMemo(() => buildReviewQueue(state), [state.pages, state.order]);
  // the Managed Services catalogue (the ServiceCatalog block's services[]/categories[]) for the Services manager.
  const serviceCatalog = useMemo(() => findCatalog(state), [state.pages, state.order]);
  // site-wide SEO health (meta presence/length + cross-page duplicates) — computed once, shared.
  const seoReport = useMemo(() => checkSeo(state), [state.pages, state.order]);
  // navigation health (menu → unpublished/dead targets + pages missing from the menu) — computed once.
  const navCoverageReport = useMemo(() => auditNavCoverage(state), [state.pages, state.order, state.navigation, state.redirects]);
  // media usage (unused library images + untracked page images + missing alt) — computed once, shared.
  const mediaReport = useMemo(() => auditMedia(state), [state.pages, state.order, state.assets, state.products]);
  // content inventory (word counts / read time / thin+skeleton flags) — computed once, shared.
  const contentReport = useMemo(() => analyzeContent(state), [state.pages, state.order]);
  // block/component usage (which block types are placed where + which are unused) — computed once, shared.
  const blockReport = useMemo(() => analyzeBlocks(state, Object.keys(config.components), config.categories), [state.pages, state.order]);
  // first-run studio setup checklist (read-only; "changed-from-default" semantics need the defaults injected).
  const onboardingReport = useMemo(() => deriveChecklist(state, {
    analyticsKnown: true, analyticsConfigured,
  }), [state.settings, state.navigation, state.order, state.pages]);
  // site health: one score rolling up the six audits — pure synthesis of the reports already computed above.
  const healthReport = useMemo(() => computeHealth({
    links: auditLinks(state), navcheck: navCoverageReport, access: a11yReport,
    seohealth: seoReport, copy: voiceReport, mediausage: mediaReport,
  }), [state.pages, state.order, state.navigation, state.redirects, voiceReport, a11yReport, seoReport, navCoverageReport, mediaReport]);
  const studioAttention = useMemo(() => {
    const pagesNeedingAction = state.order.filter((s) => {
      const p = state.pages[s]; if (!p) return false;
      return !eq(p.data, p.published) || p.status === 'review' || p.status === 'approved';
    }).length;
    const pendingInvites = canManageUsers ? state.team.filter((m) => m.status === 'invited').length : 0;
    // broken internal links (deleted/renamed-without-redirect targets + dead CTAs) surfaced as an
    // attention signal on the Link health rail item + the Studio badge.
    const brokenLinks = auditLinks(state).broken;
    // (the live product catalogue lives in Supabase and is managed under Commerce, not here)
    // redirect problems (dead-end / shadowed rows) surface on the Redirects rail badge, but are NOT
    // added to `total` — a dead-end redirect already shows up as a broken inbound link in `links`.
    const badRedirects = listRedirects(state).filter((r) => r.status !== 'ok').length;
    // only the HARD voice issues (em-dashes) drive a quiet rail count; stylistic flags show in-panel and
    // are kept out of `total` so advisory advice never inflates the top-line "needs action" number.
    // sitehealth badge = the roll-up's error count; kept OUT of `total` because those errors are already
    // counted via links/access/seohealth/navcheck — adding it would double-count the same defects.
    // schedule badge = overdue count (a reminder, never a blocking defect, never auto-acts) — also OUT of total.
    const overdue = listSchedules(state, Date.now()).overdue.length;
    // notes badge = count of annotated pages (informational, OUT of total — a note is intent, not a defect).
    return { releases: pagesNeedingAction, team: pendingInvites, links: brokenLinks, redirects: badRedirects, copy: voiceReport.hard, access: a11yReport.errors, seohealth: seoReport.errors, navcheck: navCoverageReport.errors, mediausage: mediaReport.counts.untracked + mediaReport.counts.missingAlt, sitehealth: healthReport.errors, schedule: overdue, notes: listNotes(state).length, inventory: contentReport.summary.thinCount, blocks: blockReport.summary.unusedTypes, outline: outlineReport.total, conversion: ctaReport.summary.casingDupeCount + ctaReport.summary.deadEndCount, total: pagesNeedingAction + pendingInvites + brokenLinks };
  }, [state.order, state.pages, state.team, state.navigation, state.redirects, voiceReport, a11yReport, seoReport, navCoverageReport, mediaReport, healthReport, blockReport, outlineReport, ctaReport, canManageUsers]);

  // flash a toast. msg is a string; pass an optional action { label, onAction } to attach an Undo-style
  // button (the toast then carries { msg, action } and lingers a little longer so there is time to click).
  // Backward-compatible: every existing string call site keeps working unchanged.
  function flash(msg, action) {
    setToast(action ? { msg, action } : msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), action ? 6000 : 2600);
  }
  // on-brand prompt/confirm: ask() opens the modal and resolves with the input string (prompt) or
  // true/false (confirm); resolveModal closes it and settles the promise. Replaces window.* dialogs.
  function ask(opts) { return new Promise((resolve) => setModal({ ...opts, resolve })); }
  function resolveModal(value) { if (modal && modal.resolve) modal.resolve(value); setModal(null); }
  function patchPage(slug, patch) {
    setState((s) => ({ ...s, pages: { ...s.pages, [slug]: { ...s.pages[slug], ...patch } } }));
  }
  // Services manager → write a {services|categories|inquiryEmail} patch into the ServiceCatalog block's props,
  // as a DRAFT edit (reopens a live page to draft like saveDraft, so it flows through the review/publish queue).
  function setCatalog(patch) {
    setState((s) => {
      const loc = findCatalog(s);
      if (!loc) return s;
      const p = s.pages[loc.slug];
      const content = (p.data.content || []).map((b, i) => (i === loc.index ? { ...b, props: { ...b.props, ...patch } } : b));
      const data = { ...p.data, content };
      const reopen = (p.status === 'published' || p.status === 'approved') && p.published != null && !eq(data, p.published);
      const statusPatch = reopen ? { status: 'draft', statusHistory: [...(p.statusHistory || []), { from: p.status, to: 'draft', by: user ? user.email : null, ts: Date.now(), note: 'Service catalogue edited' }] } : {};
      return { ...s, pages: { ...s.pages, [loc.slug]: { ...p, data, ...statusPatch } } };
    });
  }
  // publish-schedule intent (reversible metadata; NEVER auto-publishes — go-live stays the gated publish()).
  const onSchedule = (slug, ts) => setState((s) => setSchedule(s, slug, ts));
  const onClear = (slug) => setState((s) => clearSchedule(s, slug));
  // editorial notes (additive, reversible; a reminder, never a publish gate). Same actor source as publish().
  const onSetNote = (slug, text) => setState((s) => setNote(s, slug, text, user ? user.email : null, Date.now()));
  const onClearNote = (slug) => setState((s) => clearNote(s, slug));

  // publishing needs the publish capability (admins). Admins can publish directly from any
  // status (the fast-path — they hold the authority); editors must route through review and
  // never reach this. The status history still records the jump, so the audit trail stays honest.
  // publish a SPECIFIC page's draft → live (snapshot + status). Keyed by slug so the in-editor publish AND
  // the Releases change-review queue (Approve) share one path. Returns true once published, false on cancel.
  async function publishPage(slug, data) {
    if (!canPublish) { flash('Editors can’t publish directly. Request review, then an admin publishes.'); return false; }
    // accessibility/SEO preflight: warn (don't hard-block) if any image is missing alt text
    const missing = findMissingAlt(data && data.content, state.products);
    if (missing.length) {
      const ok = await ask({ kind: 'confirm', title: 'Publish without alt text?',
        message: missing.length + (missing.length > 1 ? ' images have' : ' image has') + ' no alt text (' + missing.slice(0, 4).join(', ') + (missing.length > 4 ? '…' : '') + '). Alt text matters for accessibility and SEO. Publish anyway, or cancel to add it?',
        confirmLabel: 'Publish anyway' });
      if (!ok) return false;
    }
    // link preflight: warn (don't block) if a button on this page links nowhere or at a deleted page
    const deadLinks = auditLinks({ ...state, pages: { ...state.pages, [slug]: { ...state.pages[slug], data } } })
      .issues.filter((i) => i.pageSlug === slug && i.severity === 'broken');
    if (deadLinks.length) {
      const ok = await ask({ kind: 'confirm', title: 'Publish with broken links?',
        message: deadLinks.length + (deadLinks.length > 1 ? ' buttons on this page link' : ' button on this page links') + ' nowhere or at a page that no longer exists. Publish anyway, or cancel to fix them under Link health?',
        confirmLabel: 'Publish anyway' });
      if (!ok) return false;
    }
    setState((s) => {
      const p = s.pages[slug];
      const versions = pushVersion(p.versions, { label: 'Published', data, by: user.email, status: 'published' });
      const statusHistory = [...(p.statusHistory || []), { from: p.status, to: 'published', by: user.email, ts: Date.now() }];
      // the 3D background is published alongside the content snapshot, so a scene change reaches the public only on publish (not live).
      return { ...s, pages: { ...s.pages, [slug]: { ...p, data, published: data, publishedBackground: p.background, status: 'published', approvedBy: p.approvedBy || user.email, versions, statusHistory } } };
    });
    flash('Published. Snapshot saved to history.');
    return true;
  }
  async function publish(data) {
    const ok = await publishPage(current, data);
    if (ok) { setMode('view'); setPanel(null); }
  }
  // approve a drifted page straight from the Releases review queue (publish its current draft as-is).
  function approvePage(slug) { return publishPage(slug, (state.pages[slug] || {}).data); }
  function saveDraft(data) {
    setState((s) => {
      const p = s.pages[current];
      // Editing a LIVE page (published/approved) reopens the draft→review→publish path on the first real
      // change, so a non-admin editor's "Request review" is reachable instead of dead-ended. Guarded by
      // !eq so the status flip + history entry happen once, not on every Puck keystroke.
      const reopen = (p.status === 'published' || p.status === 'approved') && p.published != null && !eq(data, p.published);
      const patch = reopen
        ? { data, status: 'draft', statusHistory: [...(p.statusHistory || []), { from: p.status, to: 'draft', by: user ? user.email : null, ts: Date.now(), note: 'Reopened for editing' }] }
        : { data };
      return { ...s, pages: { ...s.pages, [current]: { ...p, ...patch } } };
    });
    setSavedAt(Date.now());
  }
  function setBg(kind) { patchPage(current, { background: kind }); }
  function setBgModel(v) { patchPage(current, { background: v }); } // granular scene-track or preset id
  // enforced status machine + audit trail; approving needs publish rights. Each collaboration
  // transition can carry an optional handoff note (e.g. "fix the hero copy") recorded in the trail.
  const TRANSITION_PROMPTS = {
    review: { title: 'Submit for review', label: 'Note for the reviewer (optional)', confirmLabel: 'Submit' },
    approved: { title: 'Approve page', label: 'Approval note (optional)', confirmLabel: 'Approve' },
    draft: { title: 'Send back to draft', label: 'What needs changing? (optional)', confirmLabel: 'Send back' },
  };
  async function setStatus(to) {
    const from = page.status;
    if (from === to) return;
    if (to === 'published') return publish(page.data);   // publishing has its own gated path
    if (!canTransition(from, to)) return flash('Can’t move from ' + from + ' to ' + to + ' directly.');
    if (to === 'approved' && !canPublish) return flash('Only an admin can approve a page.');
    let note = '';
    if (TRANSITION_PROMPTS[to]) {
      const input = await ask({ kind: 'prompt', allowEmpty: true, ...TRANSITION_PROMPTS[to] });
      if (input === null) return; // cancelled the transition
      note = (input || '').trim();
    }
    setState((s) => {
      const p = s.pages[current];
      const statusHistory = [...(p.statusHistory || []), { from, to, by: user ? user.email : null, ts: Date.now(), note: note || undefined }];
      const patch = { status: to, statusHistory };
      if (to === 'approved') patch.approvedBy = user ? user.email : null;
      return { ...s, pages: { ...s.pages, [current]: { ...p, ...patch } } };
    });
    flash('Status: ' + (STATUSES.find((x) => x.id === to) || {}).label + (note ? ' · note added' : ''));
  }
  // Bulk-safe status (cycle 14): the list-level sibling of setStatus. bulkSetStatus enforces a hard
  // draft<->review allowlist by construction — it can NEVER publish, approve, or delete. canEdit-gated as
  // defense-in-depth. `moved` is computed against the current state snapshot (NOT inside the updater, which
  // React may defer/batch) so the flash count is always accurate; by+ts are injected once for both passes.
  function bulkStatusMut(slugs, to) {
    if (!canEdit) return;
    const by = user ? user.email : null, now = Date.now();
    const moved = bulkSetStatus(state, slugs, to, by, now).moved;
    if (!moved) return flash('Nothing to move.');
    setState((s) => bulkSetStatus(s, slugs, to, by, now).state);
    flash(moved + (moved === 1 ? ' page' : ' pages') + ' sent to ' + (to === 'review' ? 'review' : 'draft') + '.');
  }
  // Bulk page metadata (cycle 19): list-level siblings of setSchedule/setNote/setAssignee. Pure folds over the
  // c12/c13/c19 helpers — ADDITIVE + REVERSIBLE only; never publishes/approves/deletes (publishAt is a
  // scheduled-DATE field, not a go-live trigger; publish() never reads it). canEdit-gated (defense in depth);
  // count is taken off the `state` snapshot (NOT inside the updater, which React may batch); by+ts injected once.
  function bulkScheduleMut(slugs, ts) {
    if (!canEdit) return;
    const { count } = bulkSetSchedule(state, slugs, ts);
    if (!count) return flash('Nothing to schedule.');
    setState((s) => bulkSetSchedule(s, slugs, ts).state);
    flash('Publish date set on ' + count + (count === 1 ? ' page' : ' pages') + '.');
  }
  function bulkClearScheduleMut(slugs) {
    if (!canEdit) return;
    const { count } = bulkClearSchedule(state, slugs);
    if (!count) return flash('Nothing to clear.');
    setState((s) => bulkClearSchedule(s, slugs).state);
    flash('Cleared the publish date on ' + count + (count === 1 ? ' page' : ' pages') + '.');
  }
  async function bulkNoteMut(slugs) {
    if (!canEdit) return;
    const text = await ask({ kind: 'prompt', title: 'Add a note to ' + slugs.length + (slugs.length === 1 ? ' page' : ' pages'), label: 'Note for the team (e.g. needs legal sign-off)', confirmLabel: 'Add note' });
    if (text === null) return; // cancelled / Escape (Confirm is disabled while blank, so text is non-empty here)
    const by = user ? user.email : null, now = Date.now();
    const { count } = bulkSetNote(state, slugs, text, by, now);
    if (!count) return flash('Nothing to note.');
    setState((s) => bulkSetNote(s, slugs, text, by, now).state);
    flash('Note added to ' + count + (count === 1 ? ' page' : ' pages') + '.');
  }
  function bulkClearNoteMut(slugs) {
    if (!canEdit) return;
    const { count } = bulkClearNote(state, slugs);
    if (!count) return flash('Nothing to clear.');
    setState((s) => bulkClearNote(s, slugs).state);
    flash('Cleared the note on ' + count + (count === 1 ? ' page' : ' pages') + '.');
  }
  async function bulkAssignMut(slugs) {
    if (!canEdit) return;
    const who = await ask({ kind: 'prompt', title: 'Assign ' + slugs.length + (slugs.length === 1 ? ' page' : ' pages'), label: 'Owner (email or name)', defaultValue: user ? user.email : '', confirmLabel: 'Assign' });
    if (who === null) return; // cancelled (Confirm is disabled while blank, so who is non-empty here)
    const by = user ? user.email : null, now = Date.now();
    const { count } = bulkSetAssignee(state, slugs, who, by, now);
    if (!count) return flash('Nothing to assign.');
    setState((s) => bulkSetAssignee(s, slugs, who, by, now).state);
    flash('Assigned ' + count + (count === 1 ? ' page' : ' pages') + ' to ' + who.trim() + '.');
  }
  function bulkClearAssignMut(slugs) {
    if (!canEdit) return;
    const { count } = bulkClearAssignee(state, slugs);
    if (!count) return flash('Nothing to unassign.');
    setState((s) => bulkClearAssignee(s, slugs).state);
    flash('Unassigned ' + count + (count === 1 ? ' page' : ' pages') + '.');
  }
  function setSeo(seo) { patchPage(current, { seo }); }
  function setSettings(patch) { setState((s) => updateSettings(s, patch)); } // global site chrome (logo, name, footer, CTA)
  function setNav(tree) { setState((s) => setNavigation(s, tree)); } // editable header navigation tree
  // the slug-rename forwarding table — global chrome, no publish gate (like setNav). The success boolean
  // is computed synchronously from the current state (validateRedirect is pure) so the panel can clear its
  // inputs reliably; the actual mutation goes through the updater form like every other store write.
  function addRedirectMut(from, to) {
    const ok = !validateRedirect(state, from, to);
    setState((s) => addRedirect(s, from, to));
    flash(ok ? 'Redirect added.' : 'Couldn’t add that redirect.');
    return ok;
  }
  function repointRedirect(from, to) { setState((s) => setRedirect(s, from, to)); flash('Redirect repointed.'); }
  function dropRedirect(from) { setState((s) => removeRedirect(s, from)); flash('Redirect removed.'); }

  // Saved sections: the browsed page's blocks, shaped for the panel (human label + a one-line summary).
  const browseSlug = sectionBrowse || current; // the block browser defaults to the current page
  const sectionBrowseBlocks = useMemo(() => {
    const p = state.pages[browseSlug];
    const content = (p && p.data && p.data.content) || [];
    const summarize = (props) => {
      const v = props && (props.headline || props.heading || props.title || props.kicker || props.eyebrow || props.label || props.body || props.text || props.lead || props.intro || props.quote);
      if (v) return String(v).replace(/\s+/g, ' ').slice(0, 70);
      const arr = props && Object.values(props).find((x) => Array.isArray(x) && x.length);
      return arr ? arr.length + ' item' + (arr.length === 1 ? '' : 's') : '';
    };
    return content.map((b) => ({ id: b.props.id, type: b.type, props: b.props, summary: summarize(b.props) }));
  }, [state.pages, browseSlug]);
  // SAVE: snapshot a browsed block under a name (App owns the ask() prompt; the panel stays presentational).
  async function saveSection(block) {
    const def = config.components[block.type];
    const label = await ask({ kind: 'prompt', title: 'Save section', label: 'Name this saved section', defaultValue: (def ? def.label : block.type), confirmLabel: 'Save section' });
    if (label === null) return;
    setState((s) => addSection(s, { type: block.type, props: block.props }, label, rid));
    flash('Saved “' + ((label || '').trim() || (def ? def.label : block.type)) + '” to your sections.');
  }
  // INSERT: append a fresh-id copy to the CURRENT page's draft, reopening it to draft if it was live.
  function insertSection(sectionId) {
    const sec = listSections(state).find((x) => x.id === sectionId);
    if (!sec) return;
    const block = buildInsertBlock(sec, rid); // fresh ids — never collides (mirrors duplicatePage)
    setState((s) => {
      const p = s.pages[current];
      const data = { ...p.data, content: [...((p.data && p.data.content) || []), block] };
      const reopen = (p.status === 'published' || p.status === 'approved') && p.published != null && !eq(data, p.published);
      const patch = reopen
        ? { data, status: 'draft', statusHistory: [...(p.statusHistory || []), { from: p.status, to: 'draft', by: user ? user.email : null, ts: Date.now(), note: 'Reopened (inserted a saved section)' }] }
        : { data };
      return { ...s, pages: { ...s.pages, [current]: { ...p, ...patch } } };
    });
    setSavedAt(Date.now());
    setPuckKey((k) => k + 1); // the editor re-reads on its next mount (console + editor are separate branches)
    flash('Inserted “' + sec.label + '” at the bottom of “' + state.pages[current].title + '”. Open the editor to place it.');
  }
  async function renameSavedSection(id) {
    const cur = listSections(state).find((x) => x.id === id);
    const label = await ask({ kind: 'prompt', title: 'Rename section', label: 'Section name', defaultValue: cur ? cur.label : '', confirmLabel: 'Rename' });
    if (label === null || !label.trim()) return;
    setState((s) => renameSection(s, id, label.trim())); flash('Section renamed.');
  }
  async function removeSavedSection(id) {
    const cur = listSections(state).find((x) => x.id === id);
    const ok = await ask({ kind: 'confirm', title: 'Remove saved section', message: 'Remove “' + (cur ? cur.label : 'this section') + '” from your saved sections? Pages already using a copy keep it.', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    setState((s) => removeSection(s, id)); flash('Removed from saved sections.');
  }
  async function newPage() {
    const title = await ask({ kind: 'prompt', title: 'New page', label: 'Page title', defaultValue: 'New page', confirmLabel: 'Create page' });
    if (!title || !title.trim()) return;
    setState((s) => { const next = addPageTo(s, title.trim()); setCurrent(next._goto); setMode('edit'); setPuckKey((k) => k + 1); return next; });
  }
  // Create a NEW DRAFT from a curated starter recipe (cycle 17), then open it in the editor. 'blank' routes
  // to the unchanged newPage path. Same create-then-open sequence as newPage/clonePage; the new page is a
  // deletable draft (reversible). rid is passed as the id factory so each block gets a unique id.
  async function startFromTemplate(starterId) {
    if (starterId === 'blank') return newPage();
    const title = await ask({ kind: 'prompt', title: 'New page from template', label: 'Page title', defaultValue: 'New page', confirmLabel: 'Create page' });
    if (!title || !title.trim()) return;
    setState((s) => { const next = addPageFromStarter(s, title.trim(), starterId, rid); setCurrent(next._goto); setMode('edit'); setPuckKey((k) => k + 1); return next; });
    const st = listStarters().find((x) => x.id === starterId);
    flash('Created a draft from the ' + (st ? st.label : 'template') + ' template.');
  }
  async function deletePage(slug) {
    if (state.order.length <= 1) return flash('You can’t delete the only page.');
    const ok = await ask({ kind: 'confirm', title: 'Delete page', message: 'Delete “' + state.pages[slug].title + '”? This removes the page and all of its version history.', confirmLabel: 'Delete page', danger: true });
    if (!ok) return;
    setState((s) => { const next = removePage(s, slug); if (current === slug && next._goto) { setCurrent(next._goto); setPuckKey((k) => k + 1); } return next; });
    flash('Page deleted.');
  }
  function clonePage(slug) {
    setState((s) => { const next = duplicatePage(s, slug); setCurrent(next._goto); setMode('edit'); setPuckKey((k) => k + 1); return next; });
    flash('Duplicated as a new draft.');
  }
  async function retitlePage(slug) {
    const cur = state.pages[slug];
    const title = await ask({ kind: 'prompt', title: 'Rename page', label: 'Page title', defaultValue: cur.title, confirmLabel: 'Rename' });
    if (!title || !title.trim() || title.trim() === cur.title) return;
    setState((s) => renamePage(s, slug, title.trim())); setPuckKey((k) => k + 1);
    flash('Page renamed.');
  }
  function reorderPage(slug, dir) { setState((s) => movePage(s, slug, dir)); }
  function registerAsset(asset) { setState((s) => addAsset(s, asset)); } // add a picked/uploaded image to the library
  async function deleteAsset(id) { // Media library: confirm (matches deletePage) then remove
    const ok = await ask({ kind: 'confirm', title: 'Remove from library', message: 'Remove this image from the media library? Pages already using it keep the image; only the re-pick convenience is lost.', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    setState((s) => removeAsset(s, id));
    flash('Removed from the library.');
  }
  function editAssetAlt(id, alt) { setState((s) => updateAsset(s, id, { alt })); } // Media library: fix an image's alt text
  // dev handoff: download the whole authored store as JSON so the dev team can seed Laravel from real
  // content instead of hand-copying. Admin-only; it's the same payload localStorage holds (see DATA-MODEL.md).
  function exportSiteJson() {
    try {
      const json = JSON.stringify(stateRef.current, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'greatstone-site.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      flash('Exported site JSON for the dev team.');
    } catch (e) { flash('Couldn’t export. The data may be too large for the browser.'); }
  }
  // product catalogue management (admin): add/edit/remove products + categories. Mutates the store
  // through the same CRUD the future Laravel API will mirror; the Storefront reads the result live.
  const actor = () => (user ? user.email : null); // who's making the change, for the audit log
  function createProduct() { setState((s) => logActivity(addProduct(s, {}), 'Added a product', actor())); flash('Product added. Edit its details below.'); }
  function editProduct(id, patch) { setState((s) => updateProduct(s, id, patch)); }
  async function deleteProduct(id, name) {
    const ok = await ask({ kind: 'confirm', title: 'Remove product', message: 'Remove “' + (name || 'this product') + '” from the catalogue?', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    setState((s) => logActivity(removeProduct(s, id), 'Removed product “' + (name || 'product') + '”', actor())); flash('Product removed.');
  }
  function createCategory() { setState((s) => logActivity(addCategory(s, {}), 'Added a category', actor())); }
  async function deleteCategory(id, name) {
    const ok = await ask({ kind: 'confirm', title: 'Remove category', message: 'Remove “' + (name || 'this category') + '”? Products in it become uncategorised.', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    setState((s) => logActivity(removeCategory(s, id), 'Removed category “' + (name || 'category') + '”', actor())); flash('Category removed.');
  }
  function editCategory(id, patch) { setState((s) => ({ ...s, categories: (s.categories || []).map((c) => (c.id === id ? { ...c, ...patch, id } : c)) })); }
  // catalogue publish gate (admin only): promote the draft catalogue to the public projection, or revert
  // the draft to what's live. Mirrors page publish; the public storefront/product pages only ever read published.
  function publishCatalogue() {
    if (!canPublish) return;
    setState((s) => logActivity(publishCatalog(s), 'Published the catalogue', actor())); flash('Catalogue published. Live on the site.');
  }
  async function discardCatalogue() {
    const ok = await ask({ kind: 'confirm', title: 'Discard catalogue changes', message: 'Revert all unpublished catalogue edits back to what’s live? This can’t be undone.', confirmLabel: 'Discard changes', danger: true });
    if (!ok) return;
    setState((s) => discardCatalogDraft(s)); flash('Reverted to the published catalogue.');
  }
  // team & roles (admin only). Prototype: records membership/role/invitation; no real account or email.
  // Guards mirror what a real org_user unique constraint + last-admin rule enforce server-side.
  const activeAdmins = (team) => (team || []).filter((m) => m.role === 'admin' && m.status !== 'invited');
  function inviteTeammate(member) {
    const email = (member.email || '').trim().toLowerCase();
    if (email && (state.team || []).some((m) => (m.email || '').trim().toLowerCase() === email)) return flash('That email is already on the team.');
    setState((s) => logActivity(inviteTeamMember(s, { ...member, invitedBy: actor() }), 'Invited ' + (member.email || 'a teammate') + ' as ' + ((ROLES[member.role] || {}).label || member.role || 'editor'), actor()));
    flash('Invitation recorded. Copy its link to share (prototype, no email sent).');
  }
  // accept a #join/<token> invite (prototype: flips the roster status to active; no account/sign-in)
  function acceptInviteToken(token) {
    const st = inviteStatus(state, token);
    if (st.kind !== 'valid') return;
    setState((s) => logActivity(acceptInvite(s, token), (st.member.email || 'A teammate') + ' accepted their invitation', st.member.email || null));
  }
  function editTeammate(id, patch) {
    const m = (state.team || []).find((x) => x.id === id);
    if (patch.role && patch.role !== 'admin') {
      if (m && m.role === 'admin' && m.status !== 'invited' && activeAdmins(state.team).length <= 1) return flash('There must be at least one administrator. Promote someone else first.');
    }
    setState((s) => {
      const next = updateTeamMember(s, id, patch);
      return patch.role && m && patch.role !== m.role ? logActivity(next, 'Changed ' + (m.name || m.email || 'a teammate') + ' to ' + ((ROLES[patch.role] || {}).label || patch.role), actor()) : next;
    });
  }
  function resendTeammateInvite(id) {
    const m = (state.team || []).find((x) => x.id === id);
    setState((s) => logActivity(resendInvite(s, id), 'Re-sent the invitation to ' + ((m && m.email) || 'a teammate'), actor()));
    flash('Invitation re-sent: a fresh link with 7 more days. Copy it to share.');
  }
  async function removeTeammate(id, name) {
    const m = (state.team || []).find((x) => x.id === id);
    if (m && m.email && user && m.email.toLowerCase() === (user.email || '').toLowerCase()) return flash('You can’t remove yourself from the team.');
    if (m && m.role === 'admin' && m.status !== 'invited' && activeAdmins(state.team).length <= 1) return flash('You can’t remove the last administrator.');
    const ok = await ask({ kind: 'confirm', title: 'Remove from team', message: 'Remove “' + (name || 'this teammate') + '” from the team?', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    setState((s) => logActivity(removeTeamMember(s, id), 'Removed ' + (name || 'a teammate') + ' from the team', actor())); flash('Removed from team.');
  }
  function renameSlug(slug, next) {
    const n = (next || '').trim();
    if (!n || n === slug) return;
    if (RESERVED_SLUGS.includes(slug)) return flash('The “' + slug + '” page URL is fixed; other parts of the site link to it.');
    setState((s) => { const r = setSlug(s, slug, n); if (current === slug && r._goto) setCurrent(r._goto); return r; });
    flash('URL updated. The old path will redirect.');
  }
  // public navigation: switch page, leave any editor mode, and reset scroll to the top (a new page
  // should start at its hero, not wherever the last one was scrolled to). The .gs-public remount
  // (key={current}) gives the brief fade — see gsPageIn in index.css.
  // Marketing pages are URL-addressable: #<slug>, with the first page living at the bare URL.
  //
  // They used to be React state only, which meant Proof and Services had no address at all. You could not
  // share or bookmark a page, reload put you back on the homepage, Back and Forward did nothing between
  // pages, every marketing page was invisible to search engines, and the analytics pageview (which reads
  // location.pathname + location.hash) recorded every one of them as the same URL.
  //
  // Bare slugs are safe alongside the existing routes: every reserved route either requires a slash
  // (#service/, #product/, #intel/, #join/, #invoice/) or is a word no page uses (#shop, #admin, #account,
  // #org, #breakdown, #catalogue, #order-confirmed). readPageHash below only accepts a known page slug, so
  // anything unrecognised still falls through to the parsers above.
  function navigate(slug, anchor = '') {
    if (typeof location !== 'undefined') {
      const want = anchor ? '#go/' + slug + '/' + anchor : slug && slug !== stateRef.current.order[0] ? '#' + slug : '';
      if (location.hash !== want) {
        // replace (not push) when only clearing to the homepage, so Back does not stick on an empty hash
        if (want) location.hash = want;
        else history.replaceState(null, '', location.pathname + location.search);
      }
    }
    setShopRoute(null); setProductSlug(null); setCatalogueAdmin(false); setConfirmRoute(false); setAccountRoute(false); setOrgRoute(false); setInvoiceRoute(null);
    setAdminNav(null); setBreakdownRoute(false); setIntelArticle(null); // clear admin/breakdown/article routes synchronously so the page renders without a flash
    setCurrent(slug); setMode('view'); setQuery(''); setPanel(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }
  function goShop() { if (typeof location !== 'undefined') location.hash = 'shop'; if (typeof window !== 'undefined') window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }
  // Go to an admin console destination (#admin/<section>[/<slug>]) — full-screen, no editor mounted.
  // Setting the hash drives the render; we also set adminNav synchronously so the view doesn't flash.
  function goAdmin(section, slug) {
    setMode('view'); setPanel(null);
    const sec = section || 'overview';
    const h = 'admin' + (sec !== 'overview' ? '/' + sec : '') + (slug ? '/' + slug : '');
    if (typeof location !== 'undefined') location.hash = h;
    setAdminNav({ section: sec, slug: slug || null });
  }
  // Return to the console section the editor was launched from (not always Overview).
  function goHub() { goAdmin(editorReturn.current || 'overview'); }
  // Open a page in the Puck editor from the console — the ONLY console path that mounts the editor.
  // Remember where we came from, and make the editor URL-addressable (#admin/editor/<slug>) so a
  // mid-edit refresh or a shared link restores the editor instead of dropping back to the console.
  function openPageInEditor(slug) {
    if (adminSection && adminSection !== 'editor') editorReturn.current = adminSection;
    const target = slug || current;
    setCurrent(target); setPuckKey((k) => k + 1); setPanel(null); setMode('edit');
    if (typeof location !== 'undefined') location.hash = 'admin/editor/' + target;
    setAdminNav({ section: 'editor', slug: target });
  }
  function switchPage(slug) { setCurrent(slug); setPuckKey((k) => k + 1); setPanel(null); } // jump pages while staying in the editor
  function goSignIn() { location.hash = 'admin'; }
  // await the sign-out before clearing local state: if it fails, keep the signed-in chrome so it can't
  // desync from a still-active Supabase/catalogue session (the user stays signed in, with a clear notice).
  async function doSignOut() {
    try { const m = await import('./store/adminAuth.mjs'); await m.signOut(); }
    catch { flash('Sign-out failed. Check your connection and try again.'); return; }
    setUser(null); setMode('view'); setPanel(null); flash('Signed out. The site is read-only again.');
  }
  // restore/discard snapshot the current draft first, so neither is unrecoverable
  async function restoreVersion(v) {
    // informed restore: show exactly what this snapshot would change vs the current draft (no longer blind)
    const d = diffVersions(page.data, v.data);
    const n = d.counts.total;
    const parts = [];
    if (d.counts.changed) parts.push(d.counts.changed + ' edited');
    if (d.counts.added) parts.push(d.counts.added + ' added');
    if (d.counts.removed) parts.push(d.counts.removed + ' removed');
    if (d.counts.moved) parts.push(d.counts.moved + ' moved');
    if (d.titleChanged) parts.push('title');
    const summary = n
      ? 'This restore changes ' + n + ' thing' + (n === 1 ? '' : 's') + (parts.length ? ' (' + parts.join(', ') + ')' : '') + '. '
      : 'This snapshot’s content is identical to your current draft. ';
    const ok = await ask({ kind: 'confirm', title: 'Restore snapshot',
      message: summary + 'Your current draft is snapshotted first, so nothing is lost.',
      confirmLabel: n ? 'Restore (' + n + ' change' + (n === 1 ? '' : 's') + ')' : 'Restore anyway' });
    if (!ok) return;
    setState((s) => { const p = s.pages[current]; const versions = pushVersion(p.versions, { label: 'Before restore', data: p.data, by: user ? user.email : null, status: p.status }); return { ...s, pages: { ...s.pages, [current]: { ...p, data: v.data, versions } } }; });
    setPuckKey((k) => k + 1); setPanel(null); flash('Restored into the draft. Request review to publish it.');
  }
  // revert a SPECIFIC page's unpublished edits back to the live version (snapshotting the draft first).
  // Keyed by slug so the in-editor discard AND the Releases review queue (Reject) share one path.
  async function discardPage(slug) {
    const target = state.pages[slug];
    // a never-published page has no live version to revert to — discarding would blank it; offer delete instead
    if (!target || target.published == null) { flash('This page has never been published, so there’s nothing to revert to. Delete it from Pages if you don’t want it.'); return false; }
    const ok = await ask({ kind: 'confirm', title: 'Discard changes', message: 'Discard the unpublished changes to “' + (target.title || slug) + '” and revert to the live version? The current draft is snapshotted to history first.', confirmLabel: 'Discard changes', danger: true });
    if (!ok) return false;
    setState((s) => { const p = s.pages[slug]; const versions = pushVersion(p.versions, { label: 'Before discard', data: p.data, by: user ? user.email : null, status: p.status }); return { ...s, pages: { ...s.pages, [slug]: { ...p, data: p.published, background: p.publishedBackground ?? p.background, versions } } }; });
    if (slug === current) setPuckKey((k) => k + 1);
    flash('Reverted to the published version.');
    return true;
  }
  function discardDraft() { return discardPage(current); }
  // Bulk approve from the Releases queue: publish each selected page's current draft. publishPage runs its
  // own per-page alt-text/broken-link preflight and reads the render-closure `state`, so we go sequentially
  // (never parallel — parallel reads would be stale). One summary toast at the end.
  async function approveAll(slugs) {
    let n = 0;
    for (const slug of (slugs || [])) {
      const ok = await publishPage(slug, (state.pages[slug] || {}).data);
      if (ok) n++;
    }
    if (n) flash(n + (n === 1 ? ' page published.' : ' pages published.'));
  }
  // Bulk discard: ONE confirm, then one atomic setState that snapshots + reverts every eligible page. Only
  // pages with a live version (published != null) can revert; never-published selections are skipped.
  async function discardAll(slugs) {
    const eligible = (slugs || []).filter((slug) => { const p = state.pages[slug]; return p && p.published != null; });
    if (!eligible.length) { flash('Nothing to discard. The selected pages have never been published.'); return; }
    const ok = await ask({ kind: 'confirm', danger: true, title: 'Discard selected changes',
      message: 'Discard the unpublished changes to ' + eligible.length + ' page' + (eligible.length === 1 ? '' : 's') + ' and revert each to its live version? Each draft is snapshotted to history first.',
      confirmLabel: 'Discard changes' });
    if (!ok) return;
    const set = new Set(eligible);
    setState((s) => {
      const pages = { ...s.pages };
      for (const slug of eligible) {
        const p = pages[slug]; if (!p) continue;
        const versions = pushVersion(p.versions, { label: 'Before discard', data: p.data, by: user ? user.email : null, status: p.status });
        pages[slug] = { ...p, data: p.published, background: p.publishedBackground ?? p.background, versions };
      }
      return { ...s, pages };
    });
    if (set.has(current)) setPuckKey((k) => k + 1);
    flash('Reverted ' + eligible.length + ' page' + (eligible.length === 1 ? '' : 's') + ' to the published version.');
  }
  function addBlock(type) {
    const def = config.components[type];
    const block = { type, props: { id: rid(type), ...(def && def.defaultProps ? def.defaultProps : {}) } };
    const data = { ...page.data, content: [...(page.data.content || []), block] };
    patchPage(current, { data }); setSavedAt(Date.now());
    if (mode !== 'edit') setMode('edit');
    setPuckKey((k) => k + 1);
    flash('Added ' + (def ? def.label : type));
  }

  // Cmd/Ctrl-K palette, Cmd/Ctrl-S publish (intercepts the browser save), "?" shortcuts reference,
  // Escape closes the topmost overlay.
  useEffect(() => {
    const onKey = (e) => {
      const k = e.key.toLowerCase();
      // a guided tour is a modal walkthrough: don't let ⌘K / ? open a second focus-trapped overlay on top of it
      if ((e.metaKey || e.ctrlKey) && k === 'k' && !tour.active) { e.preventDefault(); setCmdOpen((o) => !o); }
      else if ((e.metaKey || e.ctrlKey) && k === 's') {
        e.preventDefault();
        if (mode !== 'edit') return;
        if (canPublish) publish(page.data);
        else flash('Changes autosave. Request review to get it published.');
      } else if (e.key === '?' && (canEdit || catalogueStaff) && !tour.active && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // open the shortcuts reference — but never while the editor is typing into a field
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
        e.preventDefault(); setShortcutsOpen(true);
      } else if (k === 'escape') { if (shortcutsOpen) setShortcutsOpen(false); else if (cmdOpen) setCmdOpen(false); else if (panel) setPanel(null); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [panel, cmdOpen, shortcutsOpen, mode, page, canPublish, canEdit, catalogueStaff, tour.active]); // eslint-disable-line react-hooks/exhaustive-deps

  // replay a guide from the start: first go to the surface it spotlights (so its targets exist), then arm the
  // tour. Used by the Help commands, the ? overlay's Guides list, and the editor menu.
  const replayGuide = (id) => {
    if (id === 'editor') { openPageInEditor(current); }
    else if (id === 'catalogue') { if (typeof location !== 'undefined') location.hash = 'catalogue'; }
    else if (id === 'quality') { if (typeof location !== 'undefined') location.hash = 'admin/releases'; }
    else if (typeof location !== 'undefined') { location.hash = 'admin'; }
    tour.replayTour(id);
  };

  const commands = useMemo(() => {
    if (!cmdOpen) return []; // the palette is the only consumer; don't rebuild this list on every edit keystroke
    const cmds = [];
    // the palette is the site's search, so a signed-out visitor must NOT see (or be able to navigate to)
    // unpublished drafts — filter to the same published-only surface the Header + Footer use.
    publicNavOrder(state.order, state.pages, canEdit).forEach((slug) => cmds.push({ id: 'go-' + slug, group: mode === 'edit' ? 'Edit page' : 'Go to', label: state.pages[slug].title, hint: slug === current ? 'current' : '', run: () => (mode === 'edit' ? switchPage(slug) : navigate(slug)) }));
    // the storefront + account are nav destinations but not pages — surface them in the palette too, so
    // it works as the site's search (a visitor typing "products"/"account" should find them). View mode only.
    if (mode !== 'edit') {
      cmds.push({ id: 'go-shop', group: 'Go to', label: 'Products', hint: 'storefront', run: goShop });
      cmds.push({ id: 'go-account', group: 'Go to', label: 'Your account', run: () => { if (typeof location !== 'undefined') location.hash = 'account'; } });
      cmds.push({ id: 'go-org', group: 'Go to', label: 'Your organisation', run: () => { if (typeof location !== 'undefined') location.hash = 'org'; } });
    }
    // editing commands are gated behind sign-in AND the edit capability (a viewer is signed in
    // but read-only). The admin login is NOT surfaced on the public site — it lives at the
    // separate #admin URL — so a signed-out visitor's palette is navigation only.
    if (!authed) return cmds;
    if (authed) cmds.push({ id: 'hub', group: 'Admin', label: 'Go to the admin hub', run: goHub });
    if (canEdit) {
      cmds.push({ id: 'search', group: 'Admin', label: 'Search content', run: () => { if (typeof location !== 'undefined') location.hash = 'admin/search'; } });
      cmds.push({ id: 'links', group: 'Admin', label: 'Check link health', run: () => { if (typeof location !== 'undefined') location.hash = 'admin/links'; } });
      cmds.push({ id: 'copy', group: 'Admin', label: 'Coach my copy (voice check)', run: () => { if (typeof location !== 'undefined') location.hash = 'admin/copy'; } });
      cmds.push({ id: 'access', group: 'Admin', label: 'Check accessibility', run: () => { if (typeof location !== 'undefined') location.hash = 'admin/access'; } });
      cmds.push({ id: 'outline', group: 'Admin', label: 'View document outline (heading structure)', run: () => { if (typeof location !== 'undefined') location.hash = 'admin/outline'; } });
      cmds.push({ id: 'conversion', group: 'Admin', label: 'Conversion map (CTA label consistency, hidden buttons)', run: () => { if (typeof location !== 'undefined') location.hash = 'admin/conversion'; } });
      cmds.push({ id: 'services', group: 'Admin', label: 'Services (manage the catalogue)', run: () => { if (typeof location !== 'undefined') location.hash = 'admin/services'; } });
      cmds.push({ id: 'seohealth', group: 'Admin', label: 'Check SEO health', run: () => { if (typeof location !== 'undefined') location.hash = 'admin/seohealth'; } });
      cmds.push({ id: 'navcheck', group: 'Admin', label: 'Check navigation health', run: () => { if (typeof location !== 'undefined') location.hash = 'admin/navcheck'; } });
      cmds.push({ id: 'mediausage', group: 'Admin', label: 'Check media usage (unused / untracked images)', run: () => { if (typeof location !== 'undefined') location.hash = 'admin/mediausage'; } });
      cmds.push({ id: 'inventory', group: 'Admin', label: 'Content inventory (word counts, read time, thin pages)', run: () => { if (typeof location !== 'undefined') location.hash = 'admin/inventory'; } });
      cmds.push({ id: 'blocks', group: 'Admin', label: 'Block usage (which components are used / unused)', run: () => { if (typeof location !== 'undefined') location.hash = 'admin/blocks'; } });
      cmds.push({ id: 'shortcuts', group: 'Help', label: 'Keyboard shortcuts', hint: '?', run: () => setShortcutsOpen(true) });
      cmds.push({ id: 'tour-hub', group: 'Help', label: 'Guide: tour the admin hub', run: () => replayGuide('hub') });
      cmds.push({ id: 'tour-editor', group: 'Help', label: 'Guide: using the page editor', run: () => replayGuide('editor') });
      cmds.push({ id: 'tour-catalogue', group: 'Help', label: 'Guide: the catalogue console', run: () => replayGuide('catalogue') });
      cmds.push({ id: 'tour-quality', group: 'Help', label: 'Guide: quality checks and releases', run: () => replayGuide('quality') });
      cmds.push({ id: 'templates', group: 'Admin', label: 'New page from template', run: () => { if (typeof location !== 'undefined') location.hash = 'admin/templates'; } });
      cmds.push({ id: 'sitehealth', group: 'Admin', label: 'Site health overview (overall score)', run: () => { if (typeof location !== 'undefined') location.hash = 'admin/sitehealth'; } });
      if (canManageUsers) cmds.push({ id: 'gettingstarted', group: 'Admin', label: 'Getting started (studio setup guide)', run: () => { if (typeof location !== 'undefined') location.hash = 'admin/gettingstarted'; } });
      cmds.push({ id: 'schedule', group: 'Admin', label: 'Publish schedule (set a publish date)', run: () => { if (typeof location !== 'undefined') location.hash = 'admin/schedule'; } });
      cmds.push({ id: 'notes', group: 'Admin', label: 'Editorial notes (pin a note to a page)', run: () => { if (typeof location !== 'undefined') location.hash = 'admin/notes'; } });
      cmds.push({ id: 'redirects', group: 'Admin', label: 'Manage redirects', run: () => { if (typeof location !== 'undefined') location.hash = 'admin/redirects'; } });
      cmds.push({ id: 'sections', group: 'Admin', label: 'Saved sections', run: () => { if (typeof location !== 'undefined') location.hash = 'admin/sections'; } });
      cmds.push({ id: 'new', group: 'Pages', label: 'New page…', run: newPage });
      cmds.push({ id: 'dup', group: 'Pages', label: 'Duplicate this page', run: () => clonePage(current) });
      cmds.push({ id: 'rename', group: 'Pages', label: 'Rename this page', run: () => retitlePage(current) });
      if (state.order.length > 1) cmds.push({ id: 'del', group: 'Pages', label: 'Delete this page…', run: () => deletePage(current) });
      if (mode === 'view') cmds.push({ id: 'edit', group: 'Editor', label: 'Edit this page', hint: '↵', run: () => setMode('edit') });
      if (mode === 'edit') {
        cmds.push({ id: 'preview', group: 'Editor', label: 'Preview (back to site)', run: () => setMode('view') });
        if (canPublish) cmds.push({ id: 'publish', group: 'Editor', label: 'Publish this page', run: () => publish(page.data) });
        cmds.push({ id: 'home', group: 'Editor', label: 'Open Studio home', run: () => setPanel('home') });
        cmds.push({ id: 'pages', group: 'Editor', label: 'Open all pages', run: () => setPanel('pages') });
        cmds.push({ id: 'releases', group: 'Editor', label: 'Open release board', run: () => setPanel('releases') });
        if (canManageUsers) cmds.push({ id: 'team', group: 'Editor', label: 'Open team & roles', run: () => setPanel('team') });
        if (canManageUsers) cmds.push({ id: 'export', group: 'Admin', label: 'Export site JSON (for the dev team)', run: exportSiteJson });
        cmds.push({ id: 'bgpanel', group: 'Editor', label: 'Open 3D background editor', run: () => setPanel('background') });
        cmds.push({ id: 'seo', group: 'Editor', label: 'Open SEO & social', run: () => setPanel('seo') });
        cmds.push({ id: 'history', group: 'Editor', label: 'Open version history', run: () => setPanel('history') });
        cmds.push({ id: 'activity', group: 'Editor', label: 'Open activity log', run: () => setPanel('activity') });
        Object.entries(config.components).forEach(([type, def]) => cmds.push({ id: 'add-' + type, group: 'Add block', label: def.label, run: () => addBlock(type) }));
        // only legal, capability-allowed transitions appear
        [...(TRANSITIONS[page.status] || []).filter((t) => ((t === 'approved' || t === 'published') ? canPublish : true))]
          .forEach((id) => cmds.push({ id: 'status-' + id, group: 'Set status', label: (STATUSES.find((s) => s.id === id) || {}).label, run: () => setStatus(id) }));
      }
      STAGE_OPTIONS.forEach((o) => cmds.push({ id: 'bg-' + o.id, group: 'Background', label: o.label, run: () => setBg(o.id) }));
    }
    cmds.push({ id: 'signout', group: 'Admin', label: 'Sign out (' + user.name + ')', run: doSignOut });
    return cmds;
  }, [cmdOpen, state, current, mode, page, user, canEdit, canPublish, canManageUsers]);

  const styleTag = <style dangerouslySetInnerHTML={{ __html: blockCss }} />;
  const overlays = (
    <>
      {styleTag}
      <ConsentBanner />
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} commands={commands} />
      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} onReplay={replayGuide} />
      {storageError && (
        <div className="gs-banner gs-banner-warn" role="alert">
          Storage is full. Recent changes won’t survive a reload — trim version history or publish to free space.
        </div>
      )}
      {toast && (
        <div
          className="gs-toast"
          role="status"
          /* an actionable toast (Undo) must not auto-dismiss while the user is hovering or keyboard-focused on
             it, or the focused button vanishes mid-interaction and focus drops to <body>. Pause on enter/focus,
             reschedule on leave/blur. */
          onMouseEnter={() => { if (typeof toast === 'object' && toast.action && toastTimer.current) clearTimeout(toastTimer.current); }}
          onMouseLeave={() => { if (typeof toast === 'object' && toast.action) { if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 6000); } }}
          onFocus={() => { if (typeof toast === 'object' && toast.action && toastTimer.current) clearTimeout(toastTimer.current); }}
          onBlur={() => { if (typeof toast === 'object' && toast.action) { if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 6000); } }}
        >
          {typeof toast === 'string' ? toast : toast.msg}
          {toast && typeof toast === 'object' && toast.action ? (
            <button className="gs-toast-undo" onClick={() => { toast.action.onAction(); setToast(null); if (toastTimer.current) clearTimeout(toastTimer.current); }}>{toast.action.label}</button>
          ) : null}
        </div>
      )}
      <Modal modal={modal} onResolve={resolveModal} />
      {tour.active ? <Tour tourId={tour.active} caps={tourCaps} onNavigate={goAdmin} onClose={tour.close} onAbort={tour.abort} /> : null}
    </>
  );

  // the separate admin entry (#admin): sign in before any editing is possible
  // #join/<token>: the public invite-accept screen — renders regardless of sign-in or mode
  if (joinToken) {
    const exitJoin = () => { if (location.hash) location.hash = ''; setJoinToken(null); };
    return (
      <div className="is-view">
        {styleTag}
        <Stage background={bg} />
        <AcceptInvite key={joinToken} status={inviteStatus(state, joinToken)} org={state.org} onAccept={() => acceptInviteToken(joinToken)} onBack={exitJoin} />
      </div>
    );
  }

  // resolving the Supabase session on first #admin entry — avoid flashing the sign-in over a live session
  if (onAdmin && !authChecked) {
    return (
      <div className="is-view">
        {styleTag}
        <Stage background={bg} />
        <div className="gs-editor-loading" role="status" style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Checking your session…</div>
      </div>
    );
  }

  // #breakdown — the full-screen interactive methodology explorer, opened from the method Hero CTA.
  // Public, renders over everything. Its eight pillars come from the editable Pillar-cards block on the
  // method page, so marketing edits the cards (incl. each pillar's link) and the breakdown follows.
  if (breakdownRoute) {
    const mp = state.pages.method;
    const content = (mp && ((mp.published && mp.published.content) || (mp.data && mp.data.content))) || [];
    const pc = content.find((b) => b && b.type === 'PillarCards');
    const pillars = (pc && pc.props && Array.isArray(pc.props.pillars)) ? pc.props.pillars : [];
    return (
      <div className="is-view">
        {styleTag}
        <Suspense fallback={<div style={{ position: 'fixed', inset: 0, background: '#06100b' }} />}>
          <LazyMethodExplorer pillars={pillars} onClose={() => { setBreakdownRoute(false); navigate(state.pages.method ? 'method' : state.order[0]); }} />
        </Suspense>
      </div>
    );
  }

  if (onAdmin && !authed) {
    return (
      <div className="is-view">
        {styleTag}
        <Stage background={bg} />
        <SignIn
          notice={authNotice}
          onAuthed={(u) => { setUser(u); setAuthNotice(null); setAuthChecked(true); flash(staffCan(u, 'edit') ? ('Signed in as ' + u.name + '. Choose what to manage.') : ('Signed in as ' + u.name + ' (read-only).')); }}
          onCancel={() => { location.hash = ''; setAdminNav(null); setAuthNotice(null); }} />
      </div>
    );
  }

  // Central admin CONSOLE — the full-screen shell you land on after signing in (mode!=='edit' so the
  // 'Page editor' destination falls through to the editor branch below). Every destination renders
  // here WITHOUT mounting the Puck editor; only the 3D background view mounts the Stage so its live
  // preview works. The panels are rendered embedded (no dialog chrome) straight into the console body.
  if (onAdmin && authed && adminSection !== 'editor' && mode !== 'edit') {
    const section = adminSection || 'overview';
    const onConsoleClose = () => {}; // embedded panels have no close ×; the rail/Back owns navigation
    const consolePanels = {
      overview: <OverviewPanel embedded onSection={goAdmin} onCatalogue={() => { if (typeof location !== 'undefined') location.hash = 'catalogue'; }} order={state.order} pages={state.pages} team={state.team} activity={state.activity} org={state.org} />,
      pages: <PagesPanel embedded order={state.order} pages={state.pages} current={current} onOpen={openPageInEditor} onNew={newPage} onDelete={deletePage} onDuplicate={clonePage} onRename={retitlePage} onMove={reorderPage} onClose={onConsoleClose} onBulkStatus={bulkStatusMut} onBulkSchedule={bulkScheduleMut} onBulkClearSchedule={bulkClearScheduleMut} onBulkNote={bulkNoteMut} onBulkClearNote={bulkClearNoteMut} onBulkAssign={bulkAssignMut} onBulkClearAssign={bulkClearAssignMut} canEdit={canEdit} />,
      ...(canEdit ? { navigation: <NavigationPanel embedded navigation={state.navigation} pages={state.pages} order={state.order} onChange={setNav} onClose={onConsoleClose} /> } : {}),
      releases: <ReleaseBoard embedded order={state.order} pages={state.pages} current={current} review={reviewReport} canPublish={canPublish} onApprove={approvePage} onDiscard={discardPage} onApproveMany={approveAll} onDiscardMany={discardAll} onOpen={openPageInEditor} onClose={onConsoleClose} />,
      ...(canEdit ? { links: <LinkAuditPanel embedded audit={auditLinks(state)} pages={state.pages} onOpen={openPageInEditor} onClose={onConsoleClose} /> } : {}),
      ...(canEdit ? { copy: <CopyCoachPanel embedded report={voiceReport} pages={state.pages} onOpen={openPageInEditor} onClose={onConsoleClose} /> } : {}),
      ...(canEdit ? { access: <A11yPanel embedded report={a11yReport} pages={state.pages} onOpen={openPageInEditor} onClose={onConsoleClose} /> } : {}),
      ...(canEdit ? { outline: <OutlinePanel embedded report={outlineReport} pages={state.pages} onOpen={openPageInEditor} onClose={onConsoleClose} /> } : {}),
      ...(canEdit ? { conversion: <CtaConsistencyPanel embedded report={ctaReport} pages={state.pages} onOpen={openPageInEditor} onClose={onConsoleClose} /> } : {}),
      ...(canEdit ? { services: <ServicesManagerPanel embedded catalog={serviceCatalog} onChange={setCatalog} onNotify={(n) => flash(n.message, { label: 'Undo', onAction: n.undo })} onClose={onConsoleClose} /> } : {}),
      ...(canEdit ? { seohealth: <SeoHealthPanel embedded report={seoReport} pages={state.pages} onFix={(slug) => goAdmin('seo', slug)} onClose={onConsoleClose} /> } : {}),
      ...(canEdit ? { navcheck: <NavCoveragePanel embedded report={navCoverageReport} pages={state.pages} onFix={(section) => goAdmin(section)} onClose={onConsoleClose} /> } : {}),
      ...(canEdit ? { mediausage: <MediaUsagePanel embedded report={mediaReport} pages={state.pages} onOpen={openPageInEditor} onClose={onConsoleClose} /> } : {}),
      ...(canEdit ? { inventory: <ContentInventoryPanel embedded report={contentReport} onOpen={openPageInEditor} onClose={onConsoleClose} /> } : {}),
      ...(canEdit ? { blocks: <BlockUsagePanel embedded report={blockReport} onOpen={openPageInEditor} onClose={onConsoleClose} /> } : {}),
      ...(canEdit ? { templates: <StartersPanel embedded starters={listStarters()} onPick={startFromTemplate} onClose={onConsoleClose} /> } : {}),
      ...(canEdit ? { sitehealth: <SiteHealthPanel embedded report={healthReport} onFix={(section) => goAdmin(section)} onClose={onConsoleClose} /> } : {}),
      ...(canManageUsers ? { gettingstarted: <GettingStartedPanel embedded report={onboardingReport} onFix={(section) => goAdmin(section)} onClose={onConsoleClose} /> } : {}),
      ...(canEdit ? { schedule: <SchedulePanel embedded order={state.order} pages={state.pages} onOpen={openPageInEditor} onSchedule={onSchedule} onClear={onClear} onClose={onConsoleClose} /> } : {}),
      ...(canEdit ? { notes: <NotesPanel embedded order={state.order} pages={state.pages} onOpen={openPageInEditor} onSetNote={onSetNote} onClearNote={onClearNote} onClose={onConsoleClose} /> } : {}),
      ...(canEdit ? { search: <ContentSearchPanel embedded state={state} onOpen={openPageInEditor} onClose={onConsoleClose} /> } : {}),
      ...(canEdit ? { redirects: <RedirectsPanel embedded rows={listRedirects(state)} pages={state.pages} order={state.order} error={state._redirectError} onAdd={addRedirectMut} onRepoint={repointRedirect} onRemove={dropRedirect} onClose={onConsoleClose} /> } : {}),
      ...(canEdit ? { sections: <SavedSectionsPanel embedded sections={listSections(state)} pages={state.pages} order={state.order} current={current} browseSlug={browseSlug} browseBlocks={sectionBrowseBlocks} labelFor={labelFor} onBrowse={setSectionBrowse} onSave={saveSection} onInsert={insertSection} onRename={renameSavedSection} onRemove={removeSavedSection} onClose={onConsoleClose} /> } : {}),
      seo: <SeoPanel embedded seo={page.seo} pageTitle={page.title} slug={current} onChange={setSeo} onSlug={(next) => renameSlug(current, next)} slugLocked={RESERVED_SLUGS.includes(current)} onClose={onConsoleClose} />,
      background: <BackgroundPanel embedded value={page.background || state.settings.background} onChange={setBgModel} onPreview={setPreviewP} blocks={(page.data && page.data.content) || []} onClose={onConsoleClose} />,
      history: <VersionHistory embedded versions={page.versions} current={page.data} labelFor={labelFor} onRestore={restoreVersion} onClose={onConsoleClose} />,
      activity: <ActivityPanel embedded statusHistory={page.statusHistory} status={page.status} approvedBy={page.approvedBy} activity={state.activity} pageTitle={page.title} onClose={onConsoleClose} />,
      ...(canManageUsers ? { team: <TeamPanel embedded team={state.team} org={state.org} currentEmail={user && user.email} onInvite={inviteTeammate} onUpdate={editTeammate} onRemove={removeTeammate} onResend={resendTeammateInvite} onClose={onConsoleClose} /> } : {}),
      ...(canManageUsers ? { settings: <SiteSettingsPanel embedded settings={state.settings} onChange={setSettings} onClose={onConsoleClose} /> } : {}),
      media: <MediaLibraryPanel embedded assets={listAssets(state)} onAdd={registerAsset} onUpdateAlt={editAssetAlt} onRemove={deleteAsset} onClose={onConsoleClose} />,
    };
    return (
      <CatalogContext.Provider value={draftCatalog}>
      <MediaContext.Provider value={mediaCtxValue}>
      <LinkContext.Provider value={linkCtxValue}>
      <div className={'is-view ac-root' + (section === 'background' ? ' ac-has-stage' : '')}>
        {overlays}
        <a className="gs-skip" href="#admin-main">Skip to content</a>
        {section === 'background' && <Stage background={page.background || state.settings.background} previewP={previewP} />}
        <Suspense fallback={<div className="gs-editor-loading" role="status">Opening the studio…</div>}>
        <AdminConsole
          user={user} canEdit={canEdit} canManageUsers={canManageUsers} attention={studioAttention}
          section={section} panels={consolePanels}
          order={state.order} pages={state.pages} current={current}
          onSection={goAdmin} onEditor={() => openPageInEditor(current)} onEditPage={openPageInEditor}
          onSelectPage={(slug) => { setPreviewP(null); goAdmin(section, slug); }}
          onCommerce={(tab) => { if (typeof location !== 'undefined') location.hash = 'catalogue' + (tab && tab !== 'offerings' ? '/' + tab : ''); }}
          onStore={goShop}
          onAccount={() => { if (typeof location !== 'undefined') location.hash = 'account'; }}
          onExport={exportSiteJson}
          onSignOut={doSignOut}
          onSite={() => navigate(current)}
          logo={state.settings.logo} siteName={state.settings.siteName}
        />
        </Suspense>
      </div>
      </LinkContext.Provider>
      </MediaContext.Provider>
      </CatalogContext.Provider>
    );
  }

  if (canEdit && (mode === 'edit' || (onAdmin && adminSection === 'editor'))) {
    return (
      <CatalogContext.Provider value={draftCatalog}>
      <MediaContext.Provider value={mediaCtxValue}>
      <LinkContext.Provider value={linkCtxValue}>
      <div className="is-edit">
        {overlays}
        <Stage background={bg} previewP={previewP} />
        {panel && (
          <Suspense fallback={null}>
          <StudioPanel tab={panel} onTab={setPanel} badges={{ releases: studioAttention.releases, team: studioAttention.team }} onClose={() => { setPreviewP(null); setPanel(null); }} panels={{
            home: <OverviewPanel embedded onCatalogue={() => { if (typeof location !== 'undefined') location.hash = 'catalogue'; }} order={state.order} pages={state.pages} team={state.team} activity={state.activity} org={state.org} onClose={() => setPanel(null)} />,
            pages: <PagesPanel order={state.order} pages={state.pages} current={current} onOpen={switchPage} onNew={newPage} onDelete={deletePage} onDuplicate={clonePage} onRename={retitlePage} onMove={reorderPage} onClose={() => setPanel(null)} embedded onBulkStatus={bulkStatusMut} onBulkSchedule={bulkScheduleMut} onBulkClearSchedule={bulkClearScheduleMut} onBulkNote={bulkNoteMut} onBulkClearNote={bulkClearNoteMut} onBulkAssign={bulkAssignMut} onBulkClearAssign={bulkClearAssignMut} canEdit={canEdit} />,
            releases: <ReleaseBoard order={state.order} pages={state.pages} current={current} review={reviewReport} canPublish={canPublish} onApprove={approvePage} onDiscard={discardPage} onApproveMany={approveAll} onDiscardMany={discardAll} onOpen={switchPage} onClose={() => setPanel(null)} embedded />,
            ...(canManageUsers ? { team: <TeamPanel team={state.team} org={state.org} currentEmail={user && user.email} onInvite={inviteTeammate} onUpdate={editTeammate} onRemove={removeTeammate} onResend={resendTeammateInvite} onClose={() => setPanel(null)} embedded /> } : {}),
            background: <BackgroundPanel value={page.background || state.settings.background} onChange={setBgModel} onPreview={setPreviewP} onClose={() => setPanel(null)} blocks={(page.data && page.data.content) || []} embedded />,
            seo: <SeoPanel seo={page.seo} pageTitle={page.title} slug={current} onChange={setSeo} onSlug={(next) => renameSlug(current, next)} slugLocked={RESERVED_SLUGS.includes(current)} onClose={() => setPanel(null)} embedded />,
            history: <VersionHistory versions={page.versions} current={page.data} labelFor={labelFor} onRestore={restoreVersion} onClose={() => setPanel(null)} embedded />,
            activity: <ActivityPanel statusHistory={page.statusHistory} status={page.status} approvedBy={page.approvedBy} activity={state.activity} pageTitle={page.title} onClose={() => setPanel(null)} embedded />,
          }} />
          </Suspense>
        )}
        <EditorBoundary key={'eb:' + current + ':' + puckKey} label="editor" onReset={discardDraft} resetLabel="Discard draft & recover">
        <Suspense fallback={<div className="gs-editor-loading" role="status">Opening the studio…</div>}>
        <PuckEditor
          key={current + ':' + puckKey}
          config={config}
          data={page.data}
          iframe={{ enabled: true }}
          onPublish={publish}
          onChange={saveDraft}
          overrides={{
            // wrap Puck's block drawer so the guided tour has a stable anchor for its "add a block" step
            drawer: ({ children }) => <div data-tour="puck-add" className="gs-puck-drawer">{children}</div>,
            headerActions: ({ children }) => (
              <div className="gs-edit-chrome">
              <div className="gs-edit-actions">
                {/* consolidated nav + account menu — frees the bar so the editing controls lead */}
                <EditorTopMenu user={user} onHub={goHub} onSite={() => navigate(current)} onCmd={() => setCmdOpen(true)} onSignOut={doSignOut}
                  items={[{ label: 'Replay the page editor guide', icon: '?', onClick: () => tour.replayTour('editor') }]} />
                {/* page context */}
                <label className="gs-pagesel" title="Switch page">
                  <select value={current} onChange={(e) => switchPage(e.target.value)} aria-label="Switch page">
                    {state.order.map((slug) => <option key={slug} value={slug}>{state.pages[slug].title}</option>)}
                  </select>
                </label>
                <button data-tour="studio-btn" className={'gs-btn ghost sm gs-studio-btn' + (panel ? ' is-on' : '')} onClick={() => setPanel(panel ? null : 'home')}
                  aria-expanded={!!panel} title="Open the Studio (pages, products, team, releases, background, SEO, history, activity)">
                  Studio{studioAttention.total ? <span className="gs-studio-btnbadge" aria-label={studioAttention.total + (studioAttention.total === 1 ? ' item needing attention' : ' items needing attention')}>{studioAttention.total}</span> : null}
                </button>
                <span className="gs-edit-sep" aria-hidden="true" />
                {/* state */}
                <label data-tour="status-ctl" className="gs-statusctl" data-status={page.status} title="Page status">
                  <span className="gs-dot" />
                  <select value={page.status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                    {[page.status, ...(TRANSITIONS[page.status] || []).filter((t) => ((t === 'approved' || t === 'published') ? canPublish : true))]
                      .map((id) => <option key={id} value={id}>{(STATUSES.find((s) => s.id === id) || {}).label}</option>)}
                  </select>
                </label>
                <span className={'gs-saved' + (hasUnpublished ? ' is-draft' : '')} title={savedAt ? 'Draft autosaved locally' : ''}>
                  {hasUnpublished ? <>Unpublished · <button className="gs-link" onClick={discardDraft}>discard</button></> : 'Saved'}
                </span>
                <span className="gs-edit-sep" aria-hidden="true" />
                <Suspense fallback={null}><UndoRedo /></Suspense>
                {/* flexible gap keeps the primary publish action to the right, with room for the editor */}
                <span className="gs-edit-spacer" aria-hidden="true" />
                <span data-tour="publish-btn" className="gs-edit-publish">
                  {canPublish ? children : (
                    <button className="gs-btn primary" onClick={() => setStatus('review')} disabled={page.status !== 'draft'}
                      title={page.status === 'draft' ? 'Send to an admin for review' : ({ review: 'In review with an admin', approved: 'Approved; an admin can publish it', published: 'This page is live. Reopen it as a draft to request changes' }[page.status] || 'Already submitted for review')}>Request review</button>
                  )}
                </span>
              </div>
              {/* the universal contextual style strip — a pinned second row reflecting the selected block */}
              <Suspense fallback={null}><ContextBar /></Suspense>
              </div>
            ),
          }}
        />
        </Suspense>
        </EditorBoundary>
      </div>
      </LinkContext.Provider>
      </MediaContext.Provider>
      </CatalogContext.Provider>
    );
  }

  return (
    <CatalogContext.Provider value={publishedCatalog}>
    <ServicesContext.Provider value={publishedServices}>
    <div className="is-view">
      {overlays}
      <a className="gs-skip" href="#gs-main">Skip to content</a>
      <SiteChrome />
      {/* The 3D stage is a hero backdrop for the storefront/public pages only. Utility pages
          (account, catalogue admin, order confirmation) and the Intelligence section render on their
          own solid surface — no bleed-through, no WebGL cost. */}
      {!(accountRoute || orgRoute || portalRoute || catalogueAdmin || confirmRoute || invoiceRoute || intelArticle || current === 'ai-market-intelligence') && !saveData && <Stage background={bg} />}
      <Header
        order={state.order} pages={state.pages} navigation={state.navigation} current={current} query={query}
        onSearch={setQuery} onNavigate={navigate} onNewPage={newPage} onShop={goShop} shopActive={!!shopRoute}
        onAccount={() => { if (typeof location !== 'undefined') location.hash = 'portal'; }} accountActive={!!(portalRoute || accountRoute)}
        onEdit={() => canEdit && setMode('edit')} bg={bg} onSetBg={setBg} onCommand={() => setCmdOpen(true)}
        user={user} canEdit={canEdit} onSignIn={goSignIn} onSignOut={doSignOut}
        logo={state.settings.logo} ctaLabel={state.settings.headerCtaLabel} siteName={state.settings.siteName}
      />
      <main className="gs-public" id="gs-main" tabIndex={-1} key={intelArticle ? 'intel:' + intelArticle : invoiceRoute ? 'invoice' : accountRoute ? 'account' : orgRoute ? 'org' : portalRoute ? 'portal' : confirmRoute ? 'confirm' : catalogueAdmin ? 'catalogue' : shopRoute ? 'shop' : productSlug ? 'product:' + productSlug : svcSlug ? 'service:' + svcSlug : current}>
        <EditorBoundary key={intelArticle ? 'intel:' + intelArticle : invoiceRoute ? 'invoice' : (accountRoute || authLanding) ? 'account' : orgRoute ? 'org' : portalRoute ? 'portal' : confirmRoute ? 'confirm' : catalogueAdmin ? 'catalogue' : shopRoute ? 'shop' : productSlug ? 'pd:' + productSlug : svcSlug ? 'sd:' + svcSlug : 'vb:' + current} label="page" onHome={current === state.order[0] && !shopRoute && !productSlug && !svcSlug && !accountRoute && !orgRoute && !portalRoute && !invoiceRoute && !confirmRoute && !catalogueAdmin ? undefined : () => navigate(state.order[0])}>
          {invoiceRoute
            ? <Suspense fallback={<div style={{ minHeight: '60vh' }} />}><LazyInvoice orderId={invoiceRoute} /></Suspense>
            : (accountRoute || authLanding)
            ? <Suspense fallback={<div style={{ minHeight: '60vh' }} />}><LazyAccount recovery={recovery} authError={authError} onRecoveryDone={() => setRecovery(false)} onLanded={() => { if (!/^#\/?account\b/i.test(location.hash)) location.hash = 'account'; }} /></Suspense>
            : orgRoute
            ? <Suspense fallback={<div style={{ minHeight: '60vh' }} />}><LazyOrg /></Suspense>
            : portalRoute
            ? <Suspense fallback={<div style={{ minHeight: '100vh' }} />}><LazyPortal route={portalRoute} /></Suspense>
            : confirmRoute
            ? <Suspense fallback={<div style={{ minHeight: '60vh' }} />}><LazyStoreCart confirmed /></Suspense>
            : catalogueAdmin
            ? <Suspense fallback={<div style={{ minHeight: '60vh' }} />}><LazyCatalogueAdmin initialTab={typeof catalogueAdmin === 'string' ? catalogueAdmin : 'offerings'} onHub={goHub} onStaff={setCatalogueStaff} /></Suspense>
            : shopRoute
            ? <Suspense fallback={<div style={{ minHeight: '60vh' }} />}><LazyStoreBrowse initialVendor={shopRoute.vendor} /></Suspense>
            : productSlug
            ? <Suspense fallback={<div style={{ minHeight: '60vh' }} />}><LazyStoreProduct slug={productSlug} onBack={exitProduct} applyHead={applyHead} /></Suspense>
            : svcSlug
            ? <Suspense fallback={<div style={{ minHeight: '60vh' }} />}><LazyServiceDetail slug={svcSlug} onBack={exitService} applyHead={applyHead} /></Suspense>
            : intelArticle
            ? <Suspense fallback={<IntelBoot />}><LazyIntelArticle id={intelArticle} onBack={() => navigate(state.pages['ai-market-intelligence'] ? 'ai-market-intelligence' : state.order[0])} applyHead={applyHead} /></Suspense>
            : current === 'ai-market-intelligence'
            ? <Suspense fallback={<IntelBoot />}><LazyIntelHub /></Suspense>
            : <PublicRender config={config} data={(!canEdit && page.status !== 'published' && !page.published) ? { content: [], root: {} } : (page.published || page.data)} />}
        </EditorBoundary>
      </main>
      {!confirmRoute && (shopRoute || productSlug || svcSlug || current === 'services') && <Suspense fallback={null}><LazyStoreCart /></Suspense>}
      <Footer order={state.order} pages={state.pages} onNavigate={navigate} canEdit={canEdit} logo={state.settings.logo} tagline={state.settings.footerTagline} siteName={state.settings.siteName} footerEmail={state.settings.footerEmail} legalName={state.settings.legalName} />
    </div>
    </ServicesContext.Provider>
    </CatalogContext.Provider>
  );
}
