// The admin CONSOLE — the full-screen shell you land on at #admin after signing in, and the single
// home for every admin surface. Replaces the old launcher-that-opened-the-page-editor: a persistent
// left rail (Content / Commerce / People) keeps every destination one click away, and each
// destination renders FULL-SCREEN here with NO Puck editor and NO 3D Stage mounted. Only "Page
// editor" (and "Edit this page" on a per-page view) enters the heavyweight editor; everything else
// is the light, eagerly-bundled panel rendered straight into the console body.
//
// Per-page surfaces (SEO, 3D background, version history, activity) carry an explicit page picker so
// they never silently act on a hidden "current" page. Commerce items deep-link to the Supabase
// catalogue (#catalogue/<tab>), which has its own sign-in — the rail shows that connection's status.
import { useEffect, useRef } from 'react';
// adminAuth (and its @supabase/supabase-js dependency) is imported DYNAMICALLY inside the session
// effect below, so the heavy Supabase client stays out of the eager bundle the public homepage loads.

const LOGO = '/assets/greatstone-logo-web.png';
const LOGO_WEBP = '/assets/greatstone-logo-web.webp'; // 47% smaller twin; only offered when the logo is NOT CMS-overridden
const PER_PAGE = new Set(['seo', 'background', 'history', 'activity']);

// nav model — `type` decides what activating an item does:
//   view = render in the console body · editor = open the Puck editor · commerce = go to the
//   catalogue tab (#catalogue/<tab>) · link = leave the console · action = run a callback.
function buildNav(attention = {}) {
  return [
    // Authoring — what you make. (Audits live under Quality; going-live under Publishing.)
    { group: 'Content', note: 'pages, media & SEO', items: [
      { id: 'overview', label: 'Overview', type: 'view' },
      { id: 'editor', label: 'Page editor', type: 'editor', need: 'edit' },
      { id: 'pages', label: 'Pages', type: 'view', need: 'edit' },
      { id: 'services', label: 'Services', type: 'view', need: 'edit' },
      { id: 'navigation', label: 'Navigation', type: 'view', need: 'edit' },
      { id: 'search', label: 'Search content', type: 'view', need: 'edit' },
      { id: 'media', label: 'Media library', type: 'view', need: 'edit' },
      { id: 'sections', label: 'Saved sections', type: 'view', need: 'edit' },
      { id: 'templates', label: 'Templates', type: 'view', need: 'edit' },
      { id: 'seo', label: 'SEO & social', type: 'view', need: 'edit' },
      { id: 'background', label: '3D background', type: 'view', need: 'edit' },
    ] },
    // Publishing — going live + the trail of what changed.
    { group: 'Publishing', note: 'going live & history', items: [
      { id: 'releases', label: 'Releases', type: 'view', need: 'edit', badge: attention.releases },
      { id: 'schedule', label: 'Publish schedule', type: 'view', need: 'edit', badge: attention.schedule },
      { id: 'notes', label: 'Editorial notes', type: 'view', need: 'edit', badge: attention.notes },
      { id: 'history', label: 'Version history', type: 'view', need: 'edit' },
      { id: 'activity', label: 'Activity log', type: 'view' },
    ] },
    // Quality — the read-only checks + audits (badges cluster here, not scattered through authoring).
    { group: 'Quality', note: 'checks & audits', items: [
      { id: 'sitehealth', label: 'Site health', type: 'view', need: 'edit', badge: attention.sitehealth },
      { id: 'copy', label: 'Copy coach', type: 'view', need: 'edit', badge: attention.copy },
      { id: 'links', label: 'Link health', type: 'view', need: 'edit', badge: attention.links },
      { id: 'navcheck', label: 'Navigation health', type: 'view', need: 'edit', badge: attention.navcheck },
      { id: 'access', label: 'Accessibility', type: 'view', need: 'edit', badge: attention.access },
      { id: 'outline', label: 'Document outline', type: 'view', need: 'edit', badge: attention.outline },
      { id: 'conversion', label: 'Conversion map', type: 'view', need: 'edit', badge: attention.conversion },
      { id: 'seohealth', label: 'SEO health', type: 'view', need: 'edit', badge: attention.seohealth },
      { id: 'inventory', label: 'Content inventory', type: 'view', need: 'edit', badge: attention.inventory },
      { id: 'blocks', label: 'Block usage', type: 'view', need: 'edit', badge: attention.blocks },
      { id: 'mediausage', label: 'Media usage', type: 'view', need: 'edit', badge: attention.mediausage },
      { id: 'redirects', label: 'Redirects', type: 'view', need: 'edit', badge: attention.redirects },
    ] },
    { group: 'Commerce', commerce: true, items: [
      { id: 'cat-offerings', label: 'Catalogue', type: 'commerce', tab: 'offerings' },
      { id: 'cat-pricing', label: 'Pricing & discounts', type: 'commerce', tab: 'pricing' },
      { id: 'cat-fx', label: 'Currency (FX)', type: 'commerce', tab: 'fx' },
      { id: 'cat-orders', label: 'Orders', type: 'commerce', tab: 'orders' },
      { id: 'cat-quotes', label: 'Quotes', type: 'commerce', tab: 'quotes' },
      { id: 'cat-inquiries', label: 'Service inquiries', type: 'commerce', tab: 'inquiries' },
      { id: 'cat-bulk', label: 'Import / export', type: 'commerce', tab: 'bulk' },
      { id: 'store', label: 'View live store', type: 'link' },
    ] },
    { group: 'People & settings', items: [
      { id: 'gettingstarted', label: 'Getting started', type: 'view', need: 'manage' },
      { id: 'team', label: 'Team & roles', type: 'view', need: 'manage', badge: attention.team },
      { id: 'settings', label: 'Site settings', type: 'view', need: 'manage' },
      { id: 'account', label: 'Customer portal', type: 'link' },
      { id: 'export', label: 'Export site (JSON)', type: 'action', need: 'manage' },
    ] },
  ];
}

const ALL_VIEWS = ['gettingstarted', 'overview', 'sitehealth', 'search', 'pages', 'services', 'navigation', 'releases', 'schedule', 'notes', 'links', 'navcheck', 'copy', 'access', 'outline', 'conversion', 'seohealth', 'inventory', 'blocks', 'redirects', 'sections', 'templates', 'seo', 'background', 'media', 'mediausage', 'history', 'activity', 'team', 'settings'];
const TITLES = { gettingstarted: 'Getting started', overview: 'Overview', sitehealth: 'Site health', search: 'Search content', pages: 'Pages', services: 'Services', navigation: 'Navigation', releases: 'Releases', schedule: 'Publish schedule', notes: 'Editorial notes', links: 'Link health', navcheck: 'Navigation health', copy: 'Copy coach', access: 'Accessibility', outline: 'Document outline', conversion: 'Conversion map', seohealth: 'SEO health', inventory: 'Content inventory', blocks: 'Block usage', redirects: 'Redirects', sections: 'Saved sections', templates: 'Templates', seo: 'SEO & social', background: '3D background', media: 'Media library', mediausage: 'Media usage', history: 'Version history', activity: 'Activity log', team: 'Team & roles', settings: 'Site settings' };

export default function AdminConsole({
  user, canEdit, canManageUsers, attention = {}, section = 'overview',
  panels = {}, order = [], pages = {}, current,
  onSection, onEditor, onEditPage, onSelectPage, onCommerce, onStore, onAccount, onExport, onSignOut, onSite, logo, siteName,
}) {
  const view = ALL_VIEWS.includes(section) ? section : 'overview';
  const allowed = (need) => need === 'manage' ? canManageUsers : need === 'edit' ? canEdit : true;
  const nav = buildNav(attention);
  const groupOf = (id) => nav.find((g) => g.items.some((it) => it.id === id))?.group || 'Content';

  // move focus to the main region when you SWITCH destinations (not on first mount — landing on
  // #admin should leave focus at the top so the skip link + rail come first, mirroring the public side)
  const mainRef = useRef(null);
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    const m = mainRef.current; if (m) try { m.focus({ preventScroll: true }); } catch { m.focus(); }
  }, [view]);

  const activate = (it) => {
    if (it.need && !allowed(it.need)) return;
    if (it.type === 'editor') return onEditor();
    if (it.type === 'commerce') return onCommerce(it.tab);
    if (it.type === 'action' && it.id === 'export') return onExport();
    if (it.type === 'link' && it.id === 'store') return onStore();
    if (it.type === 'link' && it.id === 'account') return onAccount();
    if (it.type === 'view') return onSection(it.id);
  };

  const def = nav.flatMap((g) => g.items).find((it) => it.id === view);
  const perPage = PER_PAGE.has(view) && order.length > 0;
  // gate the BODY by capability the same way the rail gates the item, so a deep-linked
  // #admin/seo can't drive edits when the role can't edit (the rail only disables the button).
  const viewAllowed = allowed(def?.need);
  const bodyContent = !viewAllowed
    ? <p className="ac-locked-note">Your role doesn’t have access to this area.</p>
    : (panels[view] || panels.overview);

  return (
    <div className="ac">
      <header className="ac-topbar">
        <button data-tour="logo" className="ac-logo" onClick={() => onSection('overview')} aria-label="Admin home">
          <picture>
            {!logo && <source type="image/webp" srcSet={LOGO_WEBP} />}
            <img src={logo || LOGO} alt={siteName || 'Greatstone International'} width="800" height="160" decoding="async" />
          </picture>
        </button>
        <span className="ac-topbar-tag">Admin</span>
        <span className="ac-spacer" />
        <span className="ac-whoami" title={(user?.email || '') + ' · ' + (user?.role || '')}>{user?.name} · {user?.role}</span>
        <button className="gs-btn ghost sm" onClick={onSite}>View site</button>
        <button className="gs-btn ghost sm" onClick={onSignOut}>Sign out</button>
      </header>

      <div className="ac-shell">
        <nav className="ac-rail" aria-label="Admin sections">
          {nav.map((g) => (
            <div className="ac-railgroup" key={g.group} data-tour={'group-' + g.group.toLowerCase().split(' ')[0]}>
              <div className="ac-raillabel">{g.group}{g.note ? <span className="ac-railnote"> · {g.note}</span> : null}</div>
              {g.commerce && <div className="ac-railhint">Same sign-in · opens the live catalogue &amp; store</div>}
              <ul className="ac-railitems">
                {g.items.map((it) => {
                  const locked = it.need && !allowed(it.need);
                  const active = it.type === 'view' && it.id === view;
                  return (
                    <li key={it.id}>
                      <button
                        type="button"
                        data-tour={'rail-' + it.id}
                        className={'ac-railitem' + (active ? ' is-active' : '') + (locked ? ' is-locked' : '')}
                        onClick={() => activate(it)}
                        disabled={locked}
                        aria-current={active ? 'page' : undefined}
                        title={locked ? 'Your role doesn’t have access' : undefined}
                      >
                        <span className="ac-railitem-l">{it.label}</span>
                        {it.badge ? <span data-tour="rail-badge" className="ac-railbadge" aria-label={it.badge + ' needing attention'}>{it.badge}</span> : null}
                        {it.type === 'editor' ? <span className="ac-railitem-go" aria-hidden="true">✎</span>
                          : it.type === 'commerce' || it.type === 'link' ? <span className="ac-railitem-go" aria-hidden="true">↗</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <main className="ac-main" id="admin-main" tabIndex={-1} ref={mainRef} aria-label={TITLES[view] || 'Admin'}>
          <header className="ac-head">
            <div className="ac-head-l">
              <span className="st-kicker">{groupOf(view)}</span>
              <h1>{TITLES[view] || 'Admin'}</h1>
            </div>
            {perPage && (
              <div className="ac-pagepick">
                <label className="ac-pagepick-l">
                  <span>Page</span>
                  <select value={current} onChange={(e) => onSelectPage(e.target.value)} aria-label="Choose which page">
                    {order.map((s) => <option key={s} value={s}>{pages[s]?.title || s}</option>)}
                  </select>
                </label>
                {view !== 'activity' && <button className="gs-btn ghost sm" onClick={() => onEditPage(current)}>Edit this page →</button>}
              </div>
            )}
          </header>
          {/* always-mounted live region (a conditionally-mounted one can miss the first announcement) */}
          <p className="gs-sr-only" aria-live="polite">{perPage ? 'Now editing ' + (pages[current]?.title || current) : ''}</p>
          <div className="ac-body">{bodyContent}</div>
        </main>
      </div>
    </div>
  );
}
