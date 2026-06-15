import { useState, useEffect, useMemo, useRef } from 'react';
import { Puck, Render } from '@measured/puck';
import '@measured/puck/puck.css';
import { config, blockCss } from './puck.config.jsx';
import Stage, { STAGE_OPTIONS } from './Stage.jsx';
import Header from './Header.jsx';
import Footer from './Footer.jsx';
import CommandPalette from './cms/CommandPalette.jsx';
import SeoPanel from './cms/SeoPanel.jsx';
import VersionHistory from './cms/VersionHistory.jsx';
import PagesPanel from './cms/PagesPanel.jsx';
import BackgroundPanel from './cms/BackgroundPanel.jsx';
import StudioPanel from './cms/StudioPanel.jsx';
import SignIn from './cms/SignIn.jsx';
import { currentUser, can, ROLES, isAdminRoute, signOut as authSignOut } from './cms/auth.js';
import { load, persist, addPageTo, pushVersion, TRANSITIONS, canTransition, removePage, duplicatePage, renamePage, movePage, setSlug, addAsset, listAssets } from './store.js';
import EditorBoundary from './cms/EditorBoundary.jsx';
import { MediaContext } from './cms/MediaField.jsx';

const STATUSES = [
  { id: 'draft', label: 'Draft' },
  { id: 'review', label: 'In review' },
  { id: 'approved', label: 'Approved' },
  { id: 'published', label: 'Published' },
];
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const newId = (type) => type.toLowerCase() + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

export default function App() {
  const [state, setState] = useState(load);
  const [current, setCurrent] = useState(() => load().order[0]);
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
  const toastTimer = useRef(null);

  const authed = !!user;
  const canEdit = can(user, 'edit');
  const canPublish = can(user, 'publish');

  useEffect(() => { if (!persist(state)) flash('Storage is full. Recent changes may not be saved; trim version history or publish.'); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onHash = () => setAdminRoute(isAdminRoute());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
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
  function patchPage(slug, patch) {
    setState((s) => ({ ...s, pages: { ...s.pages, [slug]: { ...s.pages[slug], ...patch } } }));
  }

  // publishing needs the publish capability (admins). Admins can publish directly from any
  // status (the fast-path — they hold the authority); editors must route through review and
  // never reach this. The status history still records the jump, so the audit trail stays honest.
  function publish(data) {
    if (!canPublish) return flash('Editors can’t publish directly. Request review, then an admin publishes.');
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
  function newPage() {
    const title = window.prompt('New page title', 'New page');
    if (!title || !title.trim()) return;
    setState((s) => { const next = addPageTo(s, title.trim()); setCurrent(next._goto); setMode('edit'); setPuckKey((k) => k + 1); return next; });
  }
  function deletePage(slug) {
    if (state.order.length <= 1) return flash('You can’t delete the only page.');
    if (!window.confirm('Delete “' + state.pages[slug].title + '”? This removes the page and its history.')) return;
    setState((s) => { const next = removePage(s, slug); if (current === slug && next._goto) { setCurrent(next._goto); setPuckKey((k) => k + 1); } return next; });
    flash('Page deleted.');
  }
  function clonePage(slug) {
    setState((s) => { const next = duplicatePage(s, slug); setCurrent(next._goto); setMode('edit'); setPuckKey((k) => k + 1); return next; });
    flash('Duplicated as a new draft.');
  }
  function retitlePage(slug) {
    const cur = state.pages[slug];
    const title = window.prompt('Rename page', cur.title);
    if (!title || !title.trim() || title.trim() === cur.title) return;
    setState((s) => renamePage(s, slug, title.trim())); setPuckKey((k) => k + 1);
    flash('Page renamed.');
  }
  function reorderPage(slug, dir) { setState((s) => movePage(s, slug, dir)); }
  function registerAsset(asset) { setState((s) => addAsset(s, asset)); } // add a picked/uploaded image to the library
  function renameSlug(slug, next) {
    if (!next || !next.trim()) return;
    setState((s) => { const r = setSlug(s, slug, next.trim()); if (current === slug && r._goto) setCurrent(r._goto); return r; });
    flash('URL updated. The old path will redirect.');
  }
  function navigate(slug) { setCurrent(slug); setMode('view'); setQuery(''); setPanel(null); }
  function switchPage(slug) { setCurrent(slug); setPuckKey((k) => k + 1); setPanel(null); } // jump pages while staying in the editor
  function goSignIn() { location.hash = 'admin'; }
  function doSignOut() { authSignOut(); setUser(null); setMode('view'); setPanel(null); flash('Signed out. The site is read-only again.'); }
  // restore/discard snapshot the current draft first, so neither is unrecoverable
  function restoreVersion(v) {
    if (!window.confirm('Restore this snapshot into the draft? Your current draft is snapshotted first.')) return;
    setState((s) => { const p = s.pages[current]; const versions = pushVersion(p.versions, { label: 'Before restore', data: p.data, by: user ? user.email : null, status: p.status }); return { ...s, pages: { ...s.pages, [current]: { ...p, data: v.data, versions } } }; });
    setPuckKey((k) => k + 1); setPanel(null); flash('Restored into the draft. Request review to publish it.');
  }
  function discardDraft() {
    if (!window.confirm('Discard unpublished changes and revert to the live version?')) return;
    setState((s) => { const p = s.pages[current]; const versions = pushVersion(p.versions, { label: 'Before discard', data: p.data, by: user ? user.email : null, status: p.status }); return { ...s, pages: { ...s.pages, [current]: { ...p, data: p.published, versions } } }; });
    setPuckKey((k) => k + 1); flash('Reverted to the published version.');
  }
  function addBlock(type) {
    const def = config.components[type];
    const block = { type, props: { id: newId(type), ...(def && def.defaultProps ? def.defaultProps : {}) } };
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
        Object.entries(config.components).forEach(([type, def]) => cmds.push({ id: 'add-' + type, group: 'Add block', label: def.label, run: () => addBlock(type) }));
        // only legal, capability-allowed transitions appear
        [...(TRANSITIONS[page.status] || []).filter((t) => ((t === 'approved' || t === 'published') ? canPublish : true))]
          .forEach((id) => cmds.push({ id: 'status-' + id, group: 'Set status', label: (STATUSES.find((s) => s.id === id) || {}).label, run: () => setStatus(id) }));
      }
      STAGE_OPTIONS.forEach((o) => cmds.push({ id: 'bg-' + o.id, group: 'Background', label: o.label, run: () => setBg(o.id) }));
    }
    cmds.push({ id: 'signout', group: 'Admin', label: 'Sign out (' + user.name + ')', run: doSignOut });
    return cmds;
  }, [state, current, mode, page, user, canEdit, canPublish]);

  const styleTag = <style dangerouslySetInnerHTML={{ __html: blockCss }} />;
  const overlays = (
    <>
      {styleTag}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} commands={commands} />
      {toast && <div className="gs-toast" role="status">{toast}</div>}
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
            seo: <SeoPanel seo={page.seo} pageTitle={page.title} slug={current} onChange={setSeo} onClose={() => setPanel(null)} embedded />,
            history: <VersionHistory versions={page.versions} onRestore={restoreVersion} onClose={() => setPanel(null)} embedded />,
          }} />
        )}
        <EditorBoundary key={'eb:' + current + ':' + puckKey} label="editor" onReset={discardDraft} resetLabel="Discard draft & recover">
        <Puck
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
        </EditorBoundary>
      </div>
      </MediaContext.Provider>
    );
  }

  return (
    <div className="is-view">
      {overlays}
      <Stage background={bg} />
      <Header
        order={state.order} pages={state.pages} current={current} query={query}
        onSearch={setQuery} onNavigate={navigate} onNewPage={newPage}
        onEdit={() => canEdit && setMode('edit')} bg={bg} onSetBg={setBg} onCommand={() => setCmdOpen(true)}
        user={user} canEdit={canEdit} onSignIn={goSignIn} onSignOut={doSignOut}
      />
      <main className="gs-public" key={current}>
        <EditorBoundary key={'vb:' + current} label="page">
          <Render config={config} data={page.published || page.data} />
        </EditorBoundary>
      </main>
      <Footer order={state.order} pages={state.pages} onNavigate={navigate} />
    </div>
  );
}
