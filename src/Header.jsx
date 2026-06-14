import { STAGE_OPTIONS } from './Stage.jsx';
import { Search } from './blocks/icons.jsx';

const LOGO = 'https://greatstone-home.netlify.app/assets/greatstone-logo-web.png';

// Site chrome (view mode). For a signed-out visitor this is a normal public site header:
// logo, nav, search, and a discreet sign-in. The editing affordances (3D picker, new page,
// edit) only appear once signed in — modelling admin-only editing. Real enforcement is
// server-side; here it is a prototype gate.
export default function Header({ order, pages, current, query, onSearch, onNavigate, onNewPage, onEdit, bg, onSetBg, onCommand, authed, onSignIn, onSignOut }) {
  const q = query.trim().toLowerCase();
  const visible = q ? order.filter((s) => (pages[s].title || s).toLowerCase().includes(q) || s.includes(q)) : order;

  return (
    <header className="gs-header">
      <a className="gs-logo" href="#" onClick={(e) => { e.preventDefault(); onNavigate(order[0]); }}>
        <img src={LOGO} alt="Greatstone International" />
      </a>

      <nav className="gs-nav">
        {visible.map((slug) => (
          <button key={slug} className={'gs-navlink' + (slug === current ? ' is-active' : '')} onClick={() => onNavigate(slug)}>
            {pages[slug].title}
          </button>
        ))}
        {visible.length === 0 && <span className="gs-nomatch">no pages match “{query}”</span>}
      </nav>

      <div className="gs-tools">
        <button className="gs-cmdbtn" onClick={onCommand} title="Command palette (⌘K)" aria-label="Command palette">
          <Search /><kbd>⌘K</kbd>
        </button>
        <div className="gs-search">
          <Search />
          <input value={query} onChange={(e) => onSearch(e.target.value)} placeholder="Search pages" aria-label="Search pages" />
        </div>

        {authed ? (
          <>
            <label className="gs-bg">
              <span>3D</span>
              <select value={bg} onChange={(e) => onSetBg(e.target.value)}>
                {STAGE_OPTIONS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </label>
            <button className="gs-btn ghost" onClick={onNewPage}>+ New page</button>
            <button className="gs-btn primary" onClick={onEdit}>Edit page</button>
            <button className="gs-signout" onClick={onSignOut} title="Sign out">Sign out</button>
          </>
        ) : (
          <button className="gs-btn ghost" onClick={onSignIn}>Sign in</button>
        )}
      </div>
    </header>
  );
}
