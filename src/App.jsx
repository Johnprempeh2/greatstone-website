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
import Header from './Header.jsx';
import Footer from './Footer.jsx';
import CommandPalette from './cms/CommandPalette.jsx';
import SeoPanel from './cms/SeoPanel.jsx';
import VersionHistory from './cms/VersionHistory.jsx';
import ActivityPanel from './cms/ActivityPanel.jsx';
import PagesPanel from './cms/PagesPanel.jsx';
import BackgroundPanel from './cms/BackgroundPanel.jsx';
import StudioPanel from './cms/StudioPanel.jsx';
import SignIn from './cms/SignIn.jsx';
import Modal from './cms/Modal.jsx';
import { currentUser, can, ROLES, isAdminRoute, signOut as authSignOut } from './cms/auth.js';
import { load, persist, addPageTo, pushVersion, TRANSITIONS, canTransition, removePage, duplicatePage, renamePage, movePage, setSlug, addAsset, listAssets, rid, RESERVED_SLUGS } from './store.js';
import EditorBoundary from './cms/EditorBoundary.jsx';
import { MediaContext } from './cms/MediaField.jsx';

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
function findMissingAlt(content) {
  const issues = [];
  (content || []).forEach((b) => {
    const p = (b && b.props) || {};
    const noAlt = (v) => !(v && String(v).trim());
    if ((b.type === 'Figure' || b.type === 'FeaturedArticle') && p.image && noAlt(p.alt)) {
      issues.push(b.type === 'Figure' ? 'Figure image' : 'Featured: ' + (p.title || 'article'));
    }
    if (b.type === 'Team' && Array.isArray(p.members)) {
      p.members.forEach((m) => { if (m && m.photo && noAlt(m.name)) issues.push('Team photo (no name)'); });
    }
  });
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
  const [adminRoute, setAdminRoute] = useState(isAdminRoute);
  const [storageError, setStorageError] = useState(false); // sticky: persist() failed (quota), edits at risk
  const [modal, setModal] = useState(null); // on-brand prompt/confirm (replaces window.prompt/confirm)
  const toastTimer = useRef(null);
  const didNavMount = useRef(false); // skip the initial mount when moving focus on navigation

  const authed = !!user;
  const canEdit = can(user, 'edit');
  const canPublish = can(user, 'publish');

  // persist() now trims old version snapshots and retries before failing; a failure here means the
  // store is genuinely full, so raise a STICKY banner (not a 2.6s toast) — those edits won't survive a reload
  useEffect(() => { setStorageError(!persist(state)); }, [state]);
  useEffect(() => {
    const onHash = () => setAdminRoute(isAdminRoute());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  // keep the document <head> in sync with the current page's SEO (title/meta/canonical/social)
  useEffect(() => {
    const p = state.pages[current] || state.pages[state.order[0]];
    if (p) applyHead(p.seo, p.title, current);
  }, [current, state.pages]);
  // on a public page change, move keyboard/screen-reader focus to the main content (skip the first
  // mount so we don't steal focus on load). Pairs with the skip link + scroll-to-top in navigate().
  useEffect(() => {
    if (!didNavMount.current) { didNavMount.current = true; return; }
    if (mode !== 'view') return;
    const m = document.getElementById('gs-main');
    if (m && typeof m.focus === 'function') m.focus({ preventScroll: true });
  }, [current]); // eslint-disable-line react-hooks/exhaustive-deps
  // route any "Book a Deep Dive" CTA (href="#book") to the contact page
  useEffect(() => {
    const onClick = (e) => {
      const a = e.target.closest && e.target.closest('a[href="#book"]');
      if (!a) return;
      e.preventDefault();
      navigate(state.pages.contact ? 'contact' : state.order[0]);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [state.order]); // eslint-disable-line react-hooks/exhaustive-deps

  const page = state.pages[current] || state.pages[state.order[0]];
  const bg = page.background || state.settings.background || 'stone';
  const hasUnpublished = useMemo(() => !eq(page.data, page.published), [page.data, page.published]);

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
    const missing = findMissingAlt(data && data.content);
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
  // enforced status machine + audit trail; approving needs publish rights
  function setStatus(to) {
    const from = page.status;
    if (from === to) return;
    if (to === 'published') return publish(page.data);   // publishing has its own gated path
    if (!canTransition(from, to)) return flash('Can’t move from ' + from + ' to ' + to + ' directly.');
    if (to === 'approved' && !canPublish) return flash('Only an admin can approve a page.');
    setState((s) => {
      const p = s.pages[current];
      const statusHistory = [...(p.statusHistory || []), { from, to, by: user ? user.email : null, ts: Date.now() }];
      const patch = { status: to, statusHistory };
      if (to === 'approved') patch.approvedBy = user ? user.email : null;
      return { ...s, pages: { ...s.pages, [current]: { ...p, ...patch } } };
    });
    flash('Status: ' + (STATUSES.find((x) => x.id === to) || {}).label);
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
    setCurrent(slug); setMode('view'); setQuery(''); setPanel(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
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
    if (canEdit) {
      cmds.push({ id: 'new', group: 'Pages', label: 'New page…', run: newPage });
      cmds.push({ id: 'dup', group: 'Pages', label: 'Duplicate this page', run: () => clonePage(current) });
      cmds.push({ id: 'rename', group: 'Pages', label: 'Rename this page', run: () => retitlePage(current) });
      if (state.order.length > 1) cmds.push({ id: 'del', group: 'Pages', label: 'Delete this page…', run: () => deletePage(current) });
      if (mode === 'view') cmds.push({ id: 'edit', group: 'Editor', label: 'Edit this page', hint: '↵', run: () => setMode('edit') });
      if (mode === 'edit') {
        cmds.push({ id: 'preview', group: 'Editor', label: 'Preview (back to site)', run: () => setMode('view') });
        if (canPublish) cmds.push({ id: 'publish', group: 'Editor', label: 'Publish this page', run: () => publish(page.data) });
        cmds.push({ id: 'pages', group: 'Editor', label: 'Open all pages', run: () => setPanel('pages') });
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
  }, [cmdOpen, state, current, mode, page, user, canEdit, canPublish]);

  const styleTag = <style dangerouslySetInnerHTML={{ __html: blockCss }} />;
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
  if (adminRoute && !authed) {
    return (
      <div className="is-view">
        {styleTag}
        <Stage background={bg} />
        <SignIn
          onAuthed={(u) => { setUser(u); location.hash = ''; setAdminRoute(false); flash(can(u, 'edit') ? ('Signed in as ' + u.name + '.') : ('Signed in as ' + u.name + ' (read-only).')); }}
          onCancel={() => { location.hash = ''; setAdminRoute(false); }} />
      </div>
    );
  }

  if (mode === 'edit' && canEdit) {
    return (
      <MediaContext.Provider value={{ assets: listAssets(state), addAsset: registerAsset }}>
      <div className="is-edit">
        {overlays}
        <Stage background={bg} previewP={previewP} />
        {panel && (
          <StudioPanel tab={panel} onTab={setPanel} onClose={() => { setPreviewP(null); setPanel(null); }} panels={{
            pages: <PagesPanel order={state.order} pages={state.pages} current={current} onOpen={switchPage} onNew={newPage} onDelete={deletePage} onDuplicate={clonePage} onRename={retitlePage} onMove={reorderPage} onClose={() => setPanel(null)} embedded />,
            background: <BackgroundPanel value={page.background || state.settings.background} onChange={setBgModel} onPreview={setPreviewP} onClose={() => setPanel(null)} blocks={(page.data && page.data.content) || []} embedded />,
            seo: <SeoPanel seo={page.seo} pageTitle={page.title} slug={current} onChange={setSeo} onSlug={(next) => renameSlug(current, next)} slugLocked={RESERVED_SLUGS.includes(current)} onClose={() => setPanel(null)} embedded />,
            history: <VersionHistory versions={page.versions} onRestore={restoreVersion} onClose={() => setPanel(null)} embedded />,
            activity: <ActivityPanel statusHistory={page.statusHistory} status={page.status} approvedBy={page.approvedBy} onClose={() => setPanel(null)} embedded />,
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
                <button className="gs-btn ghost sm" onClick={() => setMode('view')} title="Back to the live site">← Site</button>
                <label className="gs-pagesel" title="Switch page">
                  <select value={current} onChange={(e) => switchPage(e.target.value)} aria-label="Switch page">
                    {state.order.map((slug) => <option key={slug} value={slug}>{state.pages[slug].title}</option>)}
                  </select>
                </label>
                <button className={'gs-btn ghost sm' + (panel === 'pages' ? ' is-on' : '')} onClick={() => setPanel(panel === 'pages' ? null : 'pages')}>Pages</button>
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
                <button className={'gs-btn ghost sm' + (panel === 'background' ? ' is-on' : '')} onClick={() => setPanel(panel === 'background' ? null : 'background')}>3D background</button>
                <button className={'gs-btn ghost sm' + (panel === 'seo' ? ' is-on' : '')} onClick={() => setPanel(panel === 'seo' ? null : 'seo')}>SEO</button>
                <button className={'gs-btn ghost sm' + (panel === 'history' ? ' is-on' : '')} onClick={() => setPanel(panel === 'history' ? null : 'history')}>History</button>
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
    );
  }

  return (
    <div className="is-view">
      {overlays}
      <a className="gs-skip" href="#gs-main">Skip to content</a>
      <Stage background={bg} />
      <Header
        order={state.order} pages={state.pages} current={current} query={query}
        onSearch={setQuery} onNavigate={navigate} onNewPage={newPage}
        onEdit={() => canEdit && setMode('edit')} bg={bg} onSetBg={setBg} onCommand={() => setCmdOpen(true)}
        user={user} canEdit={canEdit} onSignIn={goSignIn} onSignOut={doSignOut}
      />
      <main className="gs-public" id="gs-main" tabIndex={-1} key={current}>
        <EditorBoundary key={'vb:' + current} label="page">
          <PublicRender config={config} data={page.published || page.data} />
        </EditorBoundary>
      </main>
      <Footer order={state.order} pages={state.pages} onNavigate={navigate} />
    </div>
  );
}
