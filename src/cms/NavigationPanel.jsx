import PanelFrame from './PanelFrame.jsx';
import { rid } from '../store.js';

// Navigation builder: edit the header nav bar as a tree of page links, custom/external links, and
// one-level dropdown groups. Controlled by state.navigation — App owns the tree; every edit computes a
// new tree and calls onChange, which persists immediately (global chrome, no draft→publish gate).
//
// NOTE: the rows are produced by render FUNCTIONS (not nested components) so the <input>s stay mounted
// across keystrokes and never lose focus (a nested component would get a new identity each render).

const newPageItem = () => ({ id: rid('nav'), type: 'page', pageSlug: '', visible: true });
const newLinkItem = () => ({ id: rid('nav'), type: 'link', label: '', href: '', newTab: false, visible: true });
const newGroupItem = () => ({ id: rid('nav'), type: 'group', label: 'New group', visible: true, children: [] });

function updateById(tree, id, patch) {
  return tree.map((it) => (it.id === id ? { ...it, ...patch } : (it.children ? { ...it, children: updateById(it.children, id, patch) } : it)));
}
function removeById(tree, id) {
  return tree.filter((it) => it.id !== id).map((it) => (it.children ? { ...it, children: removeById(it.children, id) } : it));
}
function moveById(tree, id, dir) {
  const i = tree.findIndex((it) => it.id === id);
  if (i >= 0) { const j = i + dir; if (j < 0 || j >= tree.length) return tree; const n = tree.slice(); [n[i], n[j]] = [n[j], n[i]]; return n; }
  return tree.map((it) => (it.children ? { ...it, children: moveById(it.children, id, dir) } : it));
}
function addUnder(tree, parentId, item) {
  if (!parentId) return [...tree, item];
  return tree.map((it) => (it.id === parentId ? { ...it, children: [...(it.children || []), item] } : it));
}

export default function NavigationPanel({ navigation = [], pages = {}, order = [], onChange, onClose, embedded }) {
  const tree = Array.isArray(navigation) ? navigation : [];
  const patch = (id, p) => onChange(updateById(tree, id, p));
  const remove = (id) => onChange(removeById(tree, id));
  const move = (id, dir) => onChange(moveById(tree, id, dir));
  const add = (parentId, item) => onChange(addUnder(tree, parentId, item));

  const acts = (id, i, len) => (
    <div className="gs-page-acts gs-navedit-acts">
      <button onClick={() => move(id, -1)} disabled={i === 0} title="Move up" aria-label="Move up">↑</button>
      <button onClick={() => move(id, 1)} disabled={i === len - 1} title="Move down" aria-label="Move down">↓</button>
      <button onClick={() => remove(id)} title="Remove" aria-label="Remove" className="gs-page-del">×</button>
    </div>
  );

  // a page or custom-link leaf row
  const leaf = (it, i, len) => (
    <li key={it.id} className="gs-navedit-row">
      <div className="gs-navedit-main">
        {it.type === 'link' ? (
          <>
            <input className="gs-navedit-in" value={it.label || ''} onChange={(e) => patch(it.id, { label: e.target.value })} placeholder="Link label" aria-label="Link label" />
            <input className="gs-navedit-in gs-navedit-href" value={it.href || ''} onChange={(e) => patch(it.id, { href: e.target.value })} placeholder="https://…  ·  /page  ·  #book" aria-label="Link URL or target" />
            <label className="gs-navedit-flag" title="Open in a new tab"><input type="checkbox" checked={!!it.newTab} onChange={(e) => patch(it.id, { newTab: e.target.checked })} /> New tab</label>
          </>
        ) : (
          <>
            <select className="gs-navedit-in gs-navedit-page" value={it.pageSlug || ''} onChange={(e) => patch(it.id, { pageSlug: e.target.value })} aria-label="Linked page">
              <option value="">Choose a page…</option>
              {order.map((slug) => <option key={slug} value={slug}>{(pages[slug] && pages[slug].title) || slug}</option>)}
            </select>
            <input className="gs-navedit-in" value={it.label || ''} onChange={(e) => patch(it.id, { label: e.target.value })} placeholder={'Label: ' + ((pages[it.pageSlug] && pages[it.pageSlug].title) || 'page title')} aria-label="Nav label (blank uses the page title)" />
          </>
        )}
        <label className="gs-navedit-flag" title="Show this item in the header"><input type="checkbox" checked={it.visible !== false} onChange={(e) => patch(it.id, { visible: e.target.checked })} /> Show</label>
      </div>
      {acts(it.id, i, len)}
    </li>
  );

  return (
    <PanelFrame embedded={embedded} label={<>Navigation <span className="gs-panel-count">{tree.length}</span></>} name="Navigation" onClose={onClose}>
      <div className="gs-panel-body">
        <p className="gs-field-hint" style={{ marginTop: 0 }}>The header navigation bar. Add pages, external links and dropdown groups, reorder them, rename their labels, and nest pages inside a group. Changes apply across the site immediately. (The Products link and the main call-to-action button are added automatically.)</p>
        <ul className="gs-navedit">
          {tree.map((it, i) => it.type === 'group' ? (
            <li key={it.id} className="gs-navedit-group">
              <div className="gs-navedit-row is-group">
                <div className="gs-navedit-main">
                  <span className="gs-navedit-gtag">Dropdown</span>
                  <input className="gs-navedit-in" value={it.label || ''} onChange={(e) => patch(it.id, { label: e.target.value })} placeholder="Dropdown label (e.g. Who We Are)" aria-label="Dropdown label" />
                  <label className="gs-navedit-flag"><input type="checkbox" checked={it.visible !== false} onChange={(e) => patch(it.id, { visible: e.target.checked })} /> Show</label>
                </div>
                {acts(it.id, i, tree.length)}
              </div>
              <ul className="gs-navedit-children">
                {(it.children || []).map((c, j) => leaf(c, j, (it.children || []).length))}
                {(it.children || []).length === 0 && <li className="gs-navedit-empty">Empty dropdown — add a page or link.</li>}
              </ul>
              <div className="gs-navedit-add is-sub">
                <button className="gs-btn ghost sm" onClick={() => add(it.id, newPageItem())}>+ Page</button>
                <button className="gs-btn ghost sm" onClick={() => add(it.id, newLinkItem())}>+ Link</button>
              </div>
            </li>
          ) : leaf(it, i, tree.length))}
          {tree.length === 0 && <li className="gs-navedit-empty">No nav items yet. Add one below.</li>}
        </ul>
        <div className="gs-navedit-add">
          <button className="gs-btn ghost sm" onClick={() => add(null, newPageItem())}>+ Page</button>
          <button className="gs-btn ghost sm" onClick={() => add(null, newLinkItem())}>+ Link</button>
          <button className="gs-btn ghost sm" onClick={() => add(null, newGroupItem())}>+ Dropdown</button>
        </div>
      </div>
    </PanelFrame>
  );
}
