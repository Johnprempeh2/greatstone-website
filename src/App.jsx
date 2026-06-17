import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { config, blockCss } from './puck.config.jsx';
import PublicRender from './PublicRender.jsx';
import { STAGE_OPTIONS } from './stage-presets.js';

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
// Live storefront — reads Supabase (@supabase/supabase-js); lazy so the public bundle stays lean
// (the chunk arrives only on the #shop route).
const LazyStoreBrowse = lazy(() => import('./store/StoreBrowse.jsx'));
const LazyStoreProduct = lazy(() => import('./store/StoreProduct.jsx'));
const LazyCatalogueAdmin = lazy(() => import('./store/CatalogueAdmin.jsx'));
// Live-store basket + Stripe checkout + post-payment confirmation. Lazy: only the store/confirm
// routes pull it (and the cart singleton it depends on) into the bundle.
const LazyStoreCart = lazy(() => import('./store/StoreCart.jsx'));
const LazyAccount = lazy(() => import('./store/AccountDashboard.jsx')); // #account — customer self-serve portal
const LazyInvoice = lazy(() => import('./store/InvoiceView.jsx'));      // #invoice/<orderId> — printable VAT invoice
import Header from './Header.jsx';
import Footer from './Footer.jsx';
import CommandPalette from './cms/CommandPalette.jsx';
import SeoPanel from './cms/SeoPanel.jsx';
import VersionHistory from './cms/VersionHistory.jsx';
import ActivityPanel from './cms/ActivityPanel.jsx';
import OverviewPanel from './cms/OverviewPanel.jsx';
import ReleaseBoard from './cms/ReleaseBoard.jsx';
import ProductsPanel from './cms/ProductsPanel.jsx';
import TeamPanel from './cms/TeamPanel.jsx';
import PagesPanel from './cms/PagesPanel.jsx';
import BackgroundPanel from './cms/BackgroundPanel.jsx';
import StudioPanel from './cms/StudioPanel.jsx';
import AdminConsole from './cms/AdminConsole.jsx';
import SignIn from './cms/SignIn.jsx';
import Modal from './cms/Modal.jsx';
import { currentUser, can, ROLES, signOut as authSignOut } from './cms/auth.js';
import { parseAdminHash, PER_PAGE_SECTIONS } from './cms/adminRoute.mjs';
import { load, persist, addPageTo, pushVersion, TRANSITIONS, canTransition, removePage, duplicatePage, renamePage, movePage, setSlug, addAsset, listAssets, rid, RESERVED_SLUGS, addProduct, updateProduct, removeProduct, addCategory, removeCategory, inviteTeamMember, updateTeamMember, removeTeamMember, logActivity, findProductBySlug, catalogHasDrift, publishCatalog, discardCatalogDraft, inviteStatus, acceptInvite, resendInvite } from './store.js';
import { ProductDetail, css as productDetailCss } from './blocks/ProductDetail.jsx';
import AcceptInvite from './cms/AcceptInvite.jsx';
import SiteChrome from './cms/SiteChrome.jsx';
import EditorBoundary from './cms/EditorBoundary.jsx';
import { MediaContext } from './cms/MediaField.jsx';
import { CatalogContext } from './cms/CatalogContext.js';

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
const SITE_ORIGIN = 'https://greatstone.com'; // matches the SeoPanel URL preview; dev team sets the real domain
// #product/<slug> (or #/product/<slug>) → the public product detail route; anything else → null
function readProductHash() {
  const m = (typeof location !== 'undefined' ? location.hash : '').match(/^#\/?product\/([\w-]+)/i);
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
  const title = s.title || `${pageTitle} — ${SITE_NAME}`;
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
  upsertMeta('property', 'og:title', title);
  upsertMeta('property', 'og:url', url);
  upsertMeta('name', 'twitter:title', title);
  // image family — clear it when a page has none so the previous page's image doesn't linger
  if (s.ogImage) { upsertMeta('property', 'og:image', s.ogImage); upsertMeta('name', 'twitter:image', s.ogImage); upsertMeta('name', 'twitter:card', 'summary_large_image'); }
  else { dropMeta('property', 'og:image'); dropMeta('name', 'twitter:image'); upsertMeta('name', 'twitter:card', 'summary'); }
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
    if (b.type === 'Team' && Array.isArray(p.members)) {
      p.members.forEach((m) => { if (m && m.photo && noAlt(m.name)) issues.push('Team photo (no name)'); });
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
  const [current, setCurrent] = useState(() => state.order[0]); // derive from the one load() above, not a 2nd
  const [mode, setMode] = useState('view');
  const [query, setQuery] = useState('');
  const [cmdOpen, setCmdOpen] = useState(false);
  const [panel, setPanel] = useState(null);        // 'seo' | 'history' | null
  const [savedAt, setSavedAt] = useState(null);
  const [toast, setToast] = useState(null);
  const [puckKey, setPuckKey] = useState(0);        // bump to force Puck to re-read data
  const [previewP, setPreviewP] = useState(null);   // background editor scrubber (0..1) → Stage
  const [user, setUser] = useState(currentUser);    // prototype session (real auth is server-side)
  const [adminNav, setAdminNav] = useState(readAdminHash); // { section, slug } | null — the one admin-route source
  const [productSlug, setProductSlug] = useState(readProductHash); // #product/<slug> → public detail view
  const [joinToken, setJoinToken] = useState(readJoinHash);        // #join/<token> → invite-accept screen
  const [shopRoute, setShopRoute] = useState(readShopHash);        // #shop[/<vendor>] → live storefront
  const [catalogueAdmin, setCatalogueAdmin] = useState(readCatalogueHash); // #catalogue → live catalogue admin (Supabase auth)
  const [confirmRoute, setConfirmRoute] = useState(readConfirmHash); // #order-confirmed → Stripe success page
  const [accountRoute, setAccountRoute] = useState(readAccountHash); // #account → customer self-serve portal
  const [invoiceRoute, setInvoiceRoute] = useState(readInvoiceHash); // #invoice/<orderId> → printable invoice
  const [storageError, setStorageError] = useState(false); // sticky: persist() failed (quota), edits at risk
  const [modal, setModal] = useState(null); // on-brand prompt/confirm (replaces window.prompt/confirm)
  const toastTimer = useRef(null);
  const didNavMount = useRef(false); // skip the initial mount when moving focus on navigation
  const persistTimer = useRef(null); // debounce the localStorage write
  const stateRef = useRef(state);    // latest state, for the debounced/unload flush
  stateRef.current = state;

  const onAdmin = !!adminNav;                          // anywhere under #admin (console or editor)
  const adminSection = adminNav ? adminNav.section : 'overview';
  const adminSlug = adminNav ? adminNav.slug : null;
  const editorReturn = useRef('overview');             // the console section to return to from ◇ Hub
  const authed = !!user;
  const canEdit = can(user, 'edit');
  const canPublish = can(user, 'publish');
  const canManageUsers = can(user, 'manageUsers'); // admins only — gates the Team panel

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
  useEffect(() => {
    const onHash = () => { setAdminNav(readAdminHash()); setProductSlug(readProductHash()); setJoinToken(readJoinHash()); setShopRoute(readShopHash()); setCatalogueAdmin(readCatalogueHash()); setConfirmRoute(readConfirmHash()); setAccountRoute(readAccountHash()); setInvoiceRoute(readInvoiceHash()); };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
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
      if (location.hash !== want) location.hash = want;
    }
  }, [mode, current, authed, canEdit]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (adminNav && adminNav.slug && PER_PAGE_SECTIONS.has(adminNav.section) && state.pages[adminNav.slug] && adminNav.slug !== current) {
      setCurrent(adminNav.slug);
    }
  }, [adminNav]); // eslint-disable-line react-hooks/exhaustive-deps
  // keep the document <head> in sync — a product detail route gets its own per-product SEO
  // (name/summary/image), otherwise the current page's SEO. applyHead handles canonical + og/twitter.
  useEffect(() => {
    if (productSlug) {
      const pr = findProductBySlug(state.publishedProducts, productSlug);
      if (pr) { applyHead({ description: pr.summary, ogImage: pr.image }, pr.name, 'products/' + (pr.slug || productSlug)); return; }
    }
    const p = state.pages[current] || state.pages[state.order[0]];
    if (p) applyHead(p.seo, p.title, current);
  }, [current, state.pages, productSlug, state.publishedProducts]);
  // a product route opens at the top, like a fresh page
  useEffect(() => { if (productSlug) try { scrollTo({ top: 0, behavior: 'instant' }); } catch (e) { scrollTo(0, 0); } }, [productSlug]);
  // on a public page change, move keyboard/screen-reader focus to the main content (skip the first
  // mount so we don't steal focus on load). Pairs with the skip link + scroll-to-top in navigate().
  useEffect(() => {
    if (!didNavMount.current) { didNavMount.current = true; return; }
    if (mode !== 'view') return;
    const m = document.getElementById('gs-main');
    if (m && typeof m.focus === 'function') m.focus({ preventScroll: true });
  }, [current, shopRoute, productSlug, accountRoute, catalogueAdmin, confirmRoute, invoiceRoute]); // eslint-disable-line react-hooks/exhaustive-deps
  // in-app CTA links: "#book" → contact page; "#go/<slug>" → that page (so cross-page ghost CTAs
  // navigate within the SPA instead of hitting a dead .html href). preventDefault keeps the hash clean.
  useEffect(() => {
    const onClick = (e) => {
      const a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      const href = a.getAttribute('href') || '';
      if (href === '#book') { e.preventDefault(); navigate(state.pages.contact ? 'contact' : state.order[0]); return; }
      const m = href.match(/^#go\/([\w-]+)$/);
      if (m && state.pages[m[1]]) { e.preventDefault(); navigate(m[1]); }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [state.order, state.pages]); // eslint-disable-line react-hooks/exhaustive-deps

  const page = state.pages[current] || state.pages[state.order[0]];
  const bg = page.background || state.settings.background || 'stone';
  // the catalogue has a draft → published gate: the editor (Storefront preview in the Puck canvas, the
  // Products tab) sees the DRAFT; the public site renders the PUBLISHED projection. So an in-progress
  // price or status change never reaches visitors until an admin publishes the catalogue.
  const draftCatalog = { products: state.products || [], categories: state.categories || [] };
  const pubProducts = state.publishedProducts || [];
  const pubCategories = state.publishedCategories || [];
  const publishedCatalog = { products: pubProducts, categories: pubCategories };
  const catalogDrift = catalogHasDrift(state);
  // public product detail route (#product/<slug>): resolve from the PUBLISHED catalogue + same-category siblings
  const activeProduct = productSlug ? findProductBySlug(pubProducts, productSlug) : null;
  const activeProductCat = activeProduct ? pubCategories.find((c) => c.id === activeProduct.category) : null;
  const relatedProducts = activeProduct ? pubProducts.filter((p) => p.id !== activeProduct.id && p.category === activeProduct.category && p.status !== 'draft').slice(0, 3) : [];
  function exitProduct() { if (location.hash) location.hash = ''; setProductSlug(null); navigate(state.pages.products ? 'products' : state.order[0]); }
  const hasUnpublished = useMemo(() => !eq(page.data, page.published), [page.data, page.published]);
  // Attention signals surfaced on the one "Studio" toolbar button + the relevant tabs, so editors see
  // what needs action without opening every panel. A page counts once (drift OR awaiting review).
  const studioAttention = useMemo(() => {
    const pagesNeedingAction = state.order.filter((s) => {
      const p = state.pages[s]; if (!p) return false;
      return !eq(p.data, p.published) || p.status === 'review' || p.status === 'approved';
    }).length;
    const pendingInvites = canManageUsers ? state.team.filter((m) => m.status === 'invited').length : 0;
    const catalogue = catalogHasDrift(state) ? 1 : 0; // unpublished catalogue changes need a publish
    return { releases: pagesNeedingAction, team: pendingInvites, products: catalogue, total: pagesNeedingAction + pendingInvites + catalogue };
  }, [state.order, state.pages, state.team, state.products, state.categories, state.publishedProducts, state.publishedCategories, canManageUsers]);

  function flash(msg) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }
  // on-brand prompt/confirm: ask() opens the modal and resolves with the input string (prompt) or
  // true/false (confirm); resolveModal closes it and settles the promise. Replaces window.* dialogs.
  function ask(opts) { return new Promise((resolve) => setModal({ ...opts, resolve })); }
  function resolveModal(value) { if (modal && modal.resolve) modal.resolve(value); setModal(null); }
  function patchPage(slug, patch) {
    setState((s) => ({ ...s, pages: { ...s.pages, [slug]: { ...s.pages[slug], ...patch } } }));
  }

  // publishing needs the publish capability (admins). Admins can publish directly from any
  // status (the fast-path — they hold the authority); editors must route through review and
  // never reach this. The status history still records the jump, so the audit trail stays honest.
  async function publish(data) {
    if (!canPublish) return flash('Editors can’t publish directly. Request review, then an admin publishes.');
    // accessibility/SEO preflight: warn (don't hard-block) if any image is missing alt text
    const missing = findMissingAlt(data && data.content, state.products);
    if (missing.length) {
      const ok = await ask({ kind: 'confirm', title: 'Publish without alt text?',
        message: missing.length + (missing.length > 1 ? ' images have' : ' image has') + ' no alt text (' + missing.slice(0, 4).join(', ') + (missing.length > 4 ? '…' : '') + '). Alt text matters for accessibility and SEO. Publish anyway, or cancel to add it?',
        confirmLabel: 'Publish anyway' });
      if (!ok) return;
    }
    setState((s) => {
      const p = s.pages[current];
      const versions = pushVersion(p.versions, { label: 'Published', data, by: user.email, status: 'published' });
      const statusHistory = [...(p.statusHistory || []), { from: p.status, to: 'published', by: user.email, ts: Date.now() }];
      return { ...s, pages: { ...s.pages, [current]: { ...p, data, published: data, status: 'published', approvedBy: p.approvedBy || user.email, versions, statusHistory } } };
    });
    setMode('view'); setPanel(null);
    flash('Published. Snapshot saved to history.');
  }
  function saveDraft(data) { patchPage(current, { data }); setSavedAt(Date.now()); }
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
  function setSeo(seo) { patchPage(current, { seo }); }
  async function newPage() {
    const title = await ask({ kind: 'prompt', title: 'New page', label: 'Page title', defaultValue: 'New page', confirmLabel: 'Create page' });
    if (!title || !title.trim()) return;
    setState((s) => { const next = addPageTo(s, title.trim()); setCurrent(next._goto); setMode('edit'); setPuckKey((k) => k + 1); return next; });
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
    } catch (e) { flash('Couldn’t export — the data may be too large for the browser.'); }
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
    setState((s) => logActivity(publishCatalog(s), 'Published the catalogue', actor())); flash('Catalogue published — live on the site.');
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
    flash('Invitation recorded. Copy its link to share (prototype — no email sent).');
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
      if (m && m.role === 'admin' && m.status !== 'invited' && activeAdmins(state.team).length <= 1) return flash('There must be at least one administrator — promote someone else first.');
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
    if (RESERVED_SLUGS.includes(slug)) return flash('The “' + slug + '” page URL is fixed — other parts of the site link to it.');
    setState((s) => { const r = setSlug(s, slug, n); if (current === slug && r._goto) setCurrent(r._goto); return r; });
    flash('URL updated. The old path will redirect.');
  }
  // public navigation: switch page, leave any editor mode, and reset scroll to the top (a new page
  // should start at its hero, not wherever the last one was scrolled to). The .gs-public remount
  // (key={current}) gives the brief fade — see gsPageIn in index.css.
  function navigate(slug) {
    if (typeof location !== 'undefined' && location.hash) location.hash = ''; // leave #shop / #product
    setShopRoute(null); setProductSlug(null); setCatalogueAdmin(false); setConfirmRoute(false); setAccountRoute(false); setInvoiceRoute(null);
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
  function doSignOut() { authSignOut(); setUser(null); setMode('view'); setPanel(null); flash('Signed out. The site is read-only again.'); }
  // restore/discard snapshot the current draft first, so neither is unrecoverable
  async function restoreVersion(v) {
    const ok = await ask({ kind: 'confirm', title: 'Restore snapshot', message: 'Restore this snapshot into the draft? Your current draft is snapshotted first, so nothing is lost.', confirmLabel: 'Restore' });
    if (!ok) return;
    setState((s) => { const p = s.pages[current]; const versions = pushVersion(p.versions, { label: 'Before restore', data: p.data, by: user ? user.email : null, status: p.status }); return { ...s, pages: { ...s.pages, [current]: { ...p, data: v.data, versions } } }; });
    setPuckKey((k) => k + 1); setPanel(null); flash('Restored into the draft. Request review to publish it.');
  }
  async function discardDraft() {
    const ok = await ask({ kind: 'confirm', title: 'Discard changes', message: 'Discard unpublished changes and revert to the live version? The current draft is snapshotted to history first.', confirmLabel: 'Discard changes', danger: true });
    if (!ok) return;
    setState((s) => { const p = s.pages[current]; const versions = pushVersion(p.versions, { label: 'Before discard', data: p.data, by: user ? user.email : null, status: p.status }); return { ...s, pages: { ...s.pages, [current]: { ...p, data: p.published, versions } } }; });
    setPuckKey((k) => k + 1); flash('Reverted to the published version.');
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

  // Cmd/Ctrl-K palette, Cmd/Ctrl-S publish (intercepts the browser save), Escape closes overlays
  useEffect(() => {
    const onKey = (e) => {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === 'k') { e.preventDefault(); setCmdOpen((o) => !o); }
      else if ((e.metaKey || e.ctrlKey) && k === 's') {
        e.preventDefault();
        if (mode !== 'edit') return;
        if (canPublish) publish(page.data);
        else flash('Changes autosave. Request review to get it published.');
      } else if (k === 'escape') { if (cmdOpen) setCmdOpen(false); else if (panel) setPanel(null); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [panel, cmdOpen, mode, page, canPublish]); // eslint-disable-line react-hooks/exhaustive-deps

  const commands = useMemo(() => {
    if (!cmdOpen) return []; // the palette is the only consumer; don't rebuild this list on every edit keystroke
    const cmds = [];
    state.order.forEach((slug) => cmds.push({ id: 'go-' + slug, group: mode === 'edit' ? 'Edit page' : 'Go to', label: state.pages[slug].title, hint: slug === current ? 'current' : '', run: () => (mode === 'edit' ? switchPage(slug) : navigate(slug)) }));
    // editing commands are gated behind sign-in AND the edit capability (a viewer is signed in
    // but read-only). The admin login is NOT surfaced on the public site — it lives at the
    // separate #admin URL — so a signed-out visitor's palette is navigation only.
    if (!authed) return cmds;
    if (authed) cmds.push({ id: 'hub', group: 'Admin', label: 'Go to the admin hub', run: goHub });
    if (canEdit) {
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
        cmds.push({ id: 'products', group: 'Editor', label: 'Open products catalogue', run: () => setPanel('products') });
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

  const styleTag = <style dangerouslySetInnerHTML={{ __html: blockCss + '\n' + productDetailCss }} />;
  const overlays = (
    <>
      {styleTag}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} commands={commands} />
      {storageError && (
        <div className="gs-banner gs-banner-warn" role="alert">
          Storage is full. Recent changes won’t survive a reload — trim version history or publish to free space.
        </div>
      )}
      {toast && <div className="gs-toast" role="status">{toast}</div>}
      <Modal modal={modal} onResolve={resolveModal} />
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

  if (onAdmin && !authed) {
    return (
      <div className="is-view">
        {styleTag}
        <Stage background={bg} />
        <SignIn
          onAuthed={(u) => { setUser(u); flash(can(u, 'edit') ? ('Signed in as ' + u.name + '. Choose what to manage.') : ('Signed in as ' + u.name + ' (read-only).')); }}
          onCancel={() => { location.hash = ''; setAdminNav(null); }} />
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
      overview: <OverviewPanel embedded onSection={goAdmin} order={state.order} pages={state.pages} products={state.products} categories={state.categories} team={state.team} activity={state.activity} org={state.org} catalogDrift={catalogDrift} />,
      pages: <PagesPanel embedded order={state.order} pages={state.pages} current={current} onOpen={openPageInEditor} onNew={newPage} onDelete={deletePage} onDuplicate={clonePage} onRename={retitlePage} onMove={reorderPage} onClose={onConsoleClose} />,
      releases: <ReleaseBoard embedded order={state.order} pages={state.pages} current={current} onOpen={openPageInEditor} onClose={onConsoleClose} />,
      seo: <SeoPanel embedded seo={page.seo} pageTitle={page.title} slug={current} onChange={setSeo} onSlug={(next) => renameSlug(current, next)} slugLocked={RESERVED_SLUGS.includes(current)} onClose={onConsoleClose} />,
      background: <BackgroundPanel embedded value={page.background || state.settings.background} onChange={setBgModel} onPreview={setPreviewP} blocks={(page.data && page.data.content) || []} onClose={onConsoleClose} />,
      history: <VersionHistory embedded versions={page.versions} onRestore={restoreVersion} onClose={onConsoleClose} />,
      activity: <ActivityPanel embedded statusHistory={page.statusHistory} status={page.status} approvedBy={page.approvedBy} activity={state.activity} pageTitle={page.title} onClose={onConsoleClose} />,
      ...(canManageUsers ? { team: <TeamPanel embedded team={state.team} org={state.org} currentEmail={user && user.email} onInvite={inviteTeammate} onUpdate={editTeammate} onRemove={removeTeammate} onResend={resendTeammateInvite} onClose={onConsoleClose} /> } : {}),
    };
    return (
      <CatalogContext.Provider value={draftCatalog}>
      <MediaContext.Provider value={{ assets: listAssets(state), addAsset: registerAsset }}>
      <div className={'is-view ac-root' + (section === 'background' ? ' ac-has-stage' : '')}>
        {overlays}
        <a className="gs-skip" href="#admin-main">Skip to content</a>
        {section === 'background' && <Stage background={page.background || state.settings.background} previewP={previewP} />}
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
        />
      </div>
      </MediaContext.Provider>
      </CatalogContext.Provider>
    );
  }

  if (canEdit && (mode === 'edit' || (onAdmin && adminSection === 'editor'))) {
    return (
      <CatalogContext.Provider value={draftCatalog}>
      <MediaContext.Provider value={{ assets: listAssets(state), addAsset: registerAsset }}>
      <div className="is-edit">
        {overlays}
        <Stage background={bg} previewP={previewP} />
        {panel && (
          <StudioPanel tab={panel} onTab={setPanel} badges={{ releases: studioAttention.releases, team: studioAttention.team, products: studioAttention.products }} onClose={() => { setPreviewP(null); setPanel(null); }} panels={{
            home: <OverviewPanel embedded order={state.order} pages={state.pages} products={state.products} categories={state.categories} team={state.team} activity={state.activity} org={state.org} catalogDrift={catalogDrift} onClose={() => setPanel(null)} />,
            pages: <PagesPanel order={state.order} pages={state.pages} current={current} onOpen={switchPage} onNew={newPage} onDelete={deletePage} onDuplicate={clonePage} onRename={retitlePage} onMove={reorderPage} onClose={() => setPanel(null)} embedded />,
            releases: <ReleaseBoard order={state.order} pages={state.pages} current={current} onOpen={switchPage} onClose={() => setPanel(null)} embedded />,
            products: <ProductsPanel products={state.products} categories={state.categories} drift={catalogDrift} canPublish={canPublish} onPublish={publishCatalogue} onDiscard={discardCatalogue} onCreate={createProduct} onUpdate={editProduct} onRemove={deleteProduct} onCreateCategory={createCategory} onUpdateCategory={editCategory} onRemoveCategory={deleteCategory} onClose={() => setPanel(null)} embedded />,
            ...(canManageUsers ? { team: <TeamPanel team={state.team} org={state.org} currentEmail={user && user.email} onInvite={inviteTeammate} onUpdate={editTeammate} onRemove={removeTeammate} onResend={resendTeammateInvite} onClose={() => setPanel(null)} embedded /> } : {}),
            background: <BackgroundPanel value={page.background || state.settings.background} onChange={setBgModel} onPreview={setPreviewP} onClose={() => setPanel(null)} blocks={(page.data && page.data.content) || []} embedded />,
            seo: <SeoPanel seo={page.seo} pageTitle={page.title} slug={current} onChange={setSeo} onSlug={(next) => renameSlug(current, next)} slugLocked={RESERVED_SLUGS.includes(current)} onClose={() => setPanel(null)} embedded />,
            history: <VersionHistory versions={page.versions} onRestore={restoreVersion} onClose={() => setPanel(null)} embedded />,
            activity: <ActivityPanel statusHistory={page.statusHistory} status={page.status} approvedBy={page.approvedBy} activity={state.activity} pageTitle={page.title} onClose={() => setPanel(null)} embedded />,
          }} />
        )}
        <EditorBoundary key={'eb:' + current + ':' + puckKey} label="editor" onReset={discardDraft} resetLabel="Discard draft & recover">
        <Suspense fallback={<div className="gs-editor-loading" role="status">Opening the studio…</div>}>
        <PuckEditor
          key={current + ':' + puckKey}
          config={config}
          data={page.data}
          iframe={{ enabled: false }}
          onPublish={publish}
          onChange={saveDraft}
          overrides={{
            headerActions: ({ children }) => (
              <div className="gs-edit-actions">
                {/* page context */}
                <button className="gs-btn ghost sm" onClick={goHub} title="Back to the admin console">◇ Hub</button>
                <button className="gs-btn ghost sm" onClick={() => navigate(current)} title="View the live site">← Site</button>
                <label className="gs-pagesel" title="Switch page">
                  <select value={current} onChange={(e) => switchPage(e.target.value)} aria-label="Switch page">
                    {state.order.map((slug) => <option key={slug} value={slug}>{state.pages[slug].title}</option>)}
                  </select>
                </label>
                <button className={'gs-btn ghost sm gs-studio-btn' + (panel ? ' is-on' : '')} onClick={() => setPanel(panel ? null : 'home')}
                  aria-expanded={!!panel} title="Open the Studio (pages, products, team, releases, background, SEO, history, activity)">
                  Studio{studioAttention.total ? <span className="gs-studio-btnbadge" aria-label={studioAttention.total + ' items need attention'}>{studioAttention.total}</span> : null}
                </button>
                <span className="gs-edit-sep" aria-hidden="true" />
                {/* state */}
                <label className="gs-statusctl" data-status={page.status} title="Page status">
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
                {/* tools */}
                <Suspense fallback={null}><UndoRedo /></Suspense>
                <button className="gs-btn ghost sm" onClick={() => setCmdOpen(true)} aria-label="Command palette" title="Command palette (⌘K)">⌘K</button>
                <span className="gs-edit-sep" aria-hidden="true" />
                {/* account + publish */}
                <span className="gs-userchip" title={user.email + ' · ' + ROLES[user.role].label}>{user.name}</span>
                <button className="gs-signout" onClick={doSignOut} title="Sign out">Sign out</button>
                {canPublish ? children : (
                  <button className="gs-btn primary" onClick={() => setStatus('review')} disabled={page.status !== 'draft'}
                    title={page.status !== 'draft' ? 'Already submitted for review' : 'Send to an admin for review'}>Request review</button>
                )}
              </div>
            ),
          }}
        />
        </Suspense>
        </EditorBoundary>
      </div>
      </MediaContext.Provider>
      </CatalogContext.Provider>
    );
  }

  return (
    <CatalogContext.Provider value={publishedCatalog}>
    <div className="is-view">
      {overlays}
      <a className="gs-skip" href="#gs-main">Skip to content</a>
      <SiteChrome />
      {/* The 3D stage is a hero backdrop for the storefront/public pages only. Utility pages
          (account, catalogue admin, order confirmation) render on a solid surface — no bleed-through, no WebGL cost. */}
      {!(accountRoute || catalogueAdmin || confirmRoute || invoiceRoute) && <Stage background={bg} />}
      <Header
        order={state.order} pages={state.pages} current={current} query={query}
        onSearch={setQuery} onNavigate={navigate} onNewPage={newPage} onShop={goShop} shopActive={!!shopRoute}
        onAccount={() => { if (typeof location !== 'undefined') location.hash = 'account'; }} accountActive={accountRoute}
        onEdit={() => canEdit && setMode('edit')} bg={bg} onSetBg={setBg} onCommand={() => setCmdOpen(true)}
        user={user} canEdit={canEdit} onSignIn={goSignIn} onSignOut={doSignOut}
      />
      <main className="gs-public" id="gs-main" tabIndex={-1} key={invoiceRoute ? 'invoice' : accountRoute ? 'account' : confirmRoute ? 'confirm' : shopRoute ? 'shop' : productSlug ? 'product:' + productSlug : current}>
        <EditorBoundary key={invoiceRoute ? 'invoice' : accountRoute ? 'account' : confirmRoute ? 'confirm' : shopRoute ? 'shop' : productSlug ? 'pd:' + productSlug : 'vb:' + current} label="page">
          {invoiceRoute
            ? <Suspense fallback={<div style={{ minHeight: '60vh' }} />}><LazyInvoice orderId={invoiceRoute} /></Suspense>
            : accountRoute
            ? <Suspense fallback={<div style={{ minHeight: '60vh' }} />}><LazyAccount /></Suspense>
            : confirmRoute
            ? <Suspense fallback={<div style={{ minHeight: '60vh' }} />}><LazyStoreCart confirmed /></Suspense>
            : catalogueAdmin
            ? <Suspense fallback={<div style={{ minHeight: '60vh' }} />}><LazyCatalogueAdmin initialTab={typeof catalogueAdmin === 'string' ? catalogueAdmin : 'offerings'} onHub={goHub} /></Suspense>
            : shopRoute
            ? <Suspense fallback={<div style={{ minHeight: '60vh' }} />}><LazyStoreBrowse initialVendor={shopRoute.vendor} /></Suspense>
            : productSlug
            ? <Suspense fallback={<div style={{ minHeight: '60vh' }} />}><LazyStoreProduct slug={productSlug} onBack={exitProduct} /></Suspense>
            : <PublicRender config={config} data={page.published || page.data} />}
        </EditorBoundary>
      </main>
      {(shopRoute || productSlug) && <Suspense fallback={null}><LazyStoreCart /></Suspense>}
      <Footer order={state.order} pages={state.pages} onNavigate={navigate} />
    </div>
    </CatalogContext.Provider>
  );
}
