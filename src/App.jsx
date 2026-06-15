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
import SignIn from './cms/SignIn.jsx';
import { currentUser, can, ROLES, isAdminRoute, signOut as authSignOut } from './cms/auth.js';
import { load, persist, addPageTo, pushVersion } from './store.js';

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
  const [user, setUser] = useState(currentUser);    // prototype session (real auth is server-side)
  const [adminRoute, setAdminRoute] = useState(isAdminRoute);
  const toastTimer = useRef(null);

  const authed = !!user;
  const canEdit = can(user, 'edit');

  useEffect(() => { persist(state); }, [state]);
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

  function publish(data) {
    setState((s) => {
      const p = s.pages[current];
      const versions = pushVersion(p.versions, 'Published', p.published);
      return { ...s, pages: { ...s.pages, [current]: { ...p, data, published: data, status: 'published', versions } } };
    });
    setMode('view'); setPanel(null);
    flash('Published. Snapshot saved to history.');
  }
  function saveDraft(data) { patchPage(current, { data }); setSavedAt(Date.now()); }
  function setBg(kind) { patchPage(current, { background: kind }); }
  function setStatus(st) { patchPage(current, { status: st }); flash('Status: ' + (STATUSES.find((x) => x.id === st) || {}).label); }
  function setSeo(seo) { patchPage(current, { seo }); }
  function newPage() {
    const title = window.prompt('New page title', 'New page');
    if (!title) return;
    setState((s) => { const next = addPageTo(s, title); setCurrent(next._goto); setMode('edit'); setPuckKey((k) => k + 1); return next; });
  }
  function navigate(slug) { setCurrent(slug); setMode('view'); setQuery(''); setPanel(null); }
  function switchPage(slug) { setCurrent(slug); setPuckKey((k) => k + 1); setPanel(null); } // jump pages while staying in the editor
  function goSignIn() { location.hash = 'admin'; }
  function doSignOut() { authSignOut(); setUser(null); setMode('view'); setPanel(null); flash('Signed out. The site is read-only again.'); }
  function restoreVersion(v) { patchPage(current, { data: v.data }); setPuckKey((k) => k + 1); setPanel(null); flash('Restored a snapshot into the draft. Publish to make it live.'); }
  function discardDraft() { patchPage(current, { data: page.published }); setPuckKey((k) => k + 1); flash('Reverted to the published version.'); }
  function addBlock(type) {
    const def = config.components[type];
    const block = { type, props: { id: newId(type), ...(def && def.defaultProps ? def.defaultProps : {}) } };
    const data = { ...page.data, content: [...(page.data.content || []), block] };
    patchPage(current, { data }); setSavedAt(Date.now());
    if (mode !== 'edit') setMode('edit');
    setPuckKey((k) => k + 1);
    flash('Added ' + (def ? def.label : type));
  }

  // Cmd/Ctrl-K toggles the palette; Escape closes whichever slide-over panel is open
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdOpen((o) => !o); }
      else if (e.key === 'Escape' && panel) { setPanel(null); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [panel]);

  const commands = useMemo(() => {
    const cmds = [];
    state.order.forEach((slug) => cmds.push({ id: 'go-' + slug, group: mode === 'edit' ? 'Edit page' : 'Go to', label: state.pages[slug].title, hint: slug === current ? 'current' : '', run: () => (mode === 'edit' ? switchPage(slug) : navigate(slug)) }));
    // editing commands are gated behind sign-in AND the edit capability (a viewer is signed in
    // but read-only). The admin login is NOT surfaced on the public site — it lives at the
    // separate #admin URL — so a signed-out visitor's palette is navigation only.
    if (!authed) return cmds;
    if (canEdit) {
      cmds.push({ id: 'new', group: 'Pages', label: 'New page…', run: newPage });
      if (mode === 'view') cmds.push({ id: 'edit', group: 'Editor', label: 'Edit this page', hint: '↵', run: () => setMode('edit') });
      if (mode === 'edit') {
        cmds.push({ id: 'preview', group: 'Editor', label: 'Preview (back to site)', run: () => setMode('view') });
        cmds.push({ id: 'publish', group: 'Editor', label: 'Publish this page', run: () => publish(page.data) });
        cmds.push({ id: 'pages', group: 'Editor', label: 'Open all pages', run: () => setPanel('pages') });
        cmds.push({ id: 'seo', group: 'Editor', label: 'Open SEO & social', run: () => setPanel('seo') });
        cmds.push({ id: 'history', group: 'Editor', label: 'Open version history', run: () => setPanel('history') });
        Object.entries(config.components).forEach(([type, def]) => cmds.push({ id: 'add-' + type, group: 'Add block', label: def.label, run: () => addBlock(type) }));
        STATUSES.forEach((s) => cmds.push({ id: 'status-' + s.id, group: 'Set status', label: s.label, run: () => setStatus(s.id) }));
      }
      STAGE_OPTIONS.forEach((o) => cmds.push({ id: 'bg-' + o.id, group: 'Background', label: o.label, run: () => setBg(o.id) }));
    }
    cmds.push({ id: 'signout', group: 'Admin', label: 'Sign out (' + user.name + ')', run: doSignOut });
    return cmds;
  }, [state, current, mode, page, user, canEdit]);

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
      <div className="is-edit">
        {overlays}
        <Stage background={bg} />
        {panel === 'pages' && <PagesPanel order={state.order} pages={state.pages} current={current} onOpen={switchPage} onNew={newPage} onClose={() => setPanel(null)} />}
        {panel === 'seo' && <SeoPanel seo={page.seo} pageTitle={page.title} slug={current} onChange={setSeo} onClose={() => setPanel(null)} />}
        {panel === 'history' && <VersionHistory versions={page.versions} onRestore={restoreVersion} onClose={() => setPanel(null)} />}
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
                <button className="gs-btn ghost" onClick={() => setMode('view')}>← Back to site</button>
                <label className="gs-pagesel" title="Switch page">
                  <select value={current} onChange={(e) => switchPage(e.target.value)} aria-label="Switch page">
                    {state.order.map((slug) => <option key={slug} value={slug}>{state.pages[slug].title}</option>)}
                  </select>
                </label>
                <button className="gs-btn ghost sm" onClick={() => setPanel('pages')}>Pages</button>
                <span className="gs-userchip" title={user.email}>{user.name} · {ROLES[user.role].label}</span>
                <label className="gs-statusctl" data-status={page.status}>
                  <span className="gs-dot" />
                  <select value={page.status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                    {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </label>
                <label className="gs-bg dark">
                  <span>3D</span>
                  <select value={bg} onChange={(e) => setBg(e.target.value)} aria-label="Background">
                    {STAGE_OPTIONS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                  </select>
                </label>
                <button className="gs-btn ghost sm" onClick={() => setPanel('seo')}>SEO</button>
                <button className="gs-btn ghost sm" onClick={() => setPanel('history')}>History</button>
                <span className={'gs-saved' + (hasUnpublished ? ' is-draft' : '')} title={savedAt ? 'Draft autosaved' : ''}>
                  {hasUnpublished ? <>Unpublished draft · <button className="gs-link" onClick={discardDraft}>discard</button></> : 'All changes saved'}
                </span>
                <button className="gs-btn ghost sm" onClick={() => setCmdOpen(true)} aria-label="Command palette" title="Command palette (⌘K)">⌘K</button>
                <button className="gs-btn ghost sm" onClick={doSignOut}>Sign out</button>
                {children}
              </div>
            ),
          }}
        />
      </div>
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
        <Render config={config} data={page.published || page.data} />
      </main>
      <Footer order={state.order} pages={state.pages} onNavigate={navigate} />
    </div>
  );
}
