import { useState, useEffect } from 'react';

// Products management (admin): add / edit / remove products and categories from inside the studio.
// Edits are local while you type and commit to the store on blur, so the catalogue doesn't thrash
// localStorage on every keystroke. The Storefront block reads the same catalogue, so changes here
// show on the public Products page immediately. This is content management (data, not styling) — it
// maps onto the dev team's Laravel Products/Categories admin.
function ProductEditor({ product, categories, onUpdate, onRemove }) {
  const [p, setP] = useState(product);
  const [open, setOpen] = useState(false);
  useEffect(() => { setP(product); }, [product.id]); // resync when a different product takes this slot
  const set = (k, v) => setP((prev) => ({ ...prev, [k]: v }));
  const commit = (k, val) => { const v = val === undefined ? p[k] : val; if (v !== product[k]) onUpdate(product.id, { [k]: v }); };
  const commitFeatures = () => {
    const arr = (p.featuresText !== undefined ? p.featuresText : (product.features || []).join('\n')).split('\n').map((s) => s.trim()).filter(Boolean);
    onUpdate(product.id, { features: arr });
  };
  const featuresText = p.featuresText !== undefined ? p.featuresText : (p.features || []).join('\n');

  return (
    <li className="gs-prod">
      <div className="gs-prod-top">
        <button className="gs-prod-name" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className={'gs-prod-caret' + (open ? ' is-open' : '')} aria-hidden="true">▸</span>
          {p.name || 'Untitled product'}
          {p.status === 'legacy' ? <em className="gs-prod-flag">legacy</em> : null}
        </button>
        <button className="gs-prod-del" onClick={() => onRemove(product.id, p.name)} aria-label="Remove product" title="Remove">×</button>
      </div>
      {open && (
        <div className="gs-prod-body">
          <label className="gs-field"><span className="gs-field-label">Name</span>
            <input value={p.name || ''} onChange={(e) => set('name', e.target.value)} onBlur={() => commit('name')} /></label>
          <div className="gs-prod-row">
            <label className="gs-field"><span className="gs-field-label">Category</span>
              <select value={p.category || ''} onChange={(e) => { set('category', e.target.value); commit('category', e.target.value); }}>
                <option value="">Uncategorised</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
            <label className="gs-field"><span className="gs-field-label">Status</span>
              <select value={p.status || 'active'} onChange={(e) => { set('status', e.target.value); commit('status', e.target.value); }}>
                <option value="active">Active</option><option value="legacy">Legacy (still sold)</option><option value="draft">Draft (hidden)</option>
              </select></label>
          </div>
          <div className="gs-prod-row">
            <label className="gs-field"><span className="gs-field-label">Price</span>
              <input value={p.price || ''} onChange={(e) => set('price', e.target.value)} onBlur={() => commit('price')} placeholder="From £…" /></label>
            <label className="gs-field"><span className="gs-field-label">Period</span>
              <input value={p.period || ''} onChange={(e) => set('period', e.target.value)} onBlur={() => commit('period')} placeholder="/year" /></label>
          </div>
          <div className="gs-prod-row">
            <label className="gs-field"><span className="gs-field-label">Licence</span>
              <input value={p.licence || ''} onChange={(e) => set('licence', e.target.value)} onBlur={() => commit('licence')} placeholder="Per-seat" /></label>
            <label className="gs-field"><span className="gs-field-label">Badge</span>
              <input value={p.badge || ''} onChange={(e) => set('badge', e.target.value)} onBlur={() => commit('badge')} placeholder="Popular" /></label>
          </div>
          <label className="gs-field"><span className="gs-field-label">Summary</span>
            <textarea rows={3} value={p.summary || ''} onChange={(e) => set('summary', e.target.value)} onBlur={() => commit('summary')} /></label>
          <label className="gs-field"><span className="gs-field-label">Features (one per line)</span>
            <textarea rows={4} value={featuresText} onChange={(e) => set('featuresText', e.target.value)} onBlur={commitFeatures} /></label>
        </div>
      )}
    </li>
  );
}

export default function ProductsPanel({ products = [], categories = [], onCreate, onUpdate, onRemove, onCreateCategory, onUpdateCategory, onRemoveCategory, onClose }) {
  const [showCats, setShowCats] = useState(false);
  return (
    <aside className="gs-panel" role="dialog" aria-label="Products">
      <div className="gs-panel-head">
        <h3>Products <span className="gs-panel-count">{products.length}</span></h3>
        <button className="gs-x" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="gs-panel-body">
        <p className="gs-field-hint">The catalogue behind the Storefront block. Add, edit and remove products here; changes show on the Products page live. Real licence checkout is a backend handoff — see HANDOVER.</p>
        <ul className="gs-prods">
          {products.map((p) => (
            <ProductEditor key={p.id} product={p} categories={categories} onUpdate={onUpdate} onRemove={onRemove} />
          ))}
          {products.length === 0 && <li className="gs-empty">No products yet. Add your first below.</li>}
        </ul>
        <button className="gs-btn ghost sm gs-prods-add" onClick={onCreate}>+ Add product</button>

        <button className="gs-prods-cats-toggle" onClick={() => setShowCats((s) => !s)} aria-expanded={showCats}>
          {showCats ? '▾' : '▸'} Categories <span className="gs-panel-count">{categories.length}</span>
        </button>
        {showCats && (
          <div className="gs-cats">
            {categories.map((c) => (
              <div className="gs-cat" key={c.id}>
                <input className="gs-cat-name" value={c.name} onChange={(e) => onUpdateCategory(c.id, { name: e.target.value })} aria-label="Category name" />
                <button className="gs-prod-del" onClick={() => onRemoveCategory(c.id, c.name)} aria-label="Remove category" title="Remove">×</button>
              </div>
            ))}
            <button className="gs-btn ghost sm" onClick={onCreateCategory}>+ Add category</button>
          </div>
        )}
      </div>
    </aside>
  );
}
