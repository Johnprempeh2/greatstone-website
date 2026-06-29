// Composition analytics — a pure, read-only CONTENT-ANALYTICS lens orthogonal to content-stats: not
// "how much prose" but "which COMPONENTS, used where, and which registered blocks are dead". Walks the
// same page shape content-stats walks (pages[slug].data.content[].type), seeds every knownType at 0 so
// UNUSED blocks surface as rows (the whole point — don't only iterate placements), and flags
// placed-but-unregistered types as `extras` (defensive). STORE-FREE: knownTypes + categories are passed
// in by App (which owns puck.config.jsx = JSX that bare node --test can't load); mirrors content-stats /
// schedule-model / notes-model. IMPORTANT: walks the UNION of state.order + Object.keys(state.pages) —
// migrate strips `products` from `order`, but pages.products + its live Storefront block still exist, so
// iterating order alone would FALSELY report Storefront as "unused" (the exact false-positive this avoids).

function categoryIndex(categories) {
  const idx = {};
  for (const key of Object.keys(categories || {})) {
    const cat = categories[key] || {};
    const title = cat.title || key;
    for (const t of (cat.components || [])) idx[t] = title;
  }
  return idx;
}

export function analyzeBlocks(state, knownTypes, categories) {
  const pages = (state && state.pages) || {};
  const order = (state && state.order) || [];
  // union of order + every page key, so non-navigable pages (e.g. products) are counted (their live blocks
  // are real usage; counting only `order` would falsely flag Storefront as unused).
  const slugs = [...new Set([...order, ...Object.keys(pages)])];
  const known = Array.isArray(knownTypes) ? knownTypes : [];
  const knownSet = new Set(known);
  const catOf = categoryIndex(categories);

  const counts = new Map();
  for (const t of known) counts.set(t, { instances: 0, pages: new Set() }); // seed EVERY known type → unused rows
  const extras = new Map(); // placed types NOT in knownSet (defensive)

  for (const slug of slugs) {
    const page = pages[slug];
    if (!page) continue; // ghost slug in order → skip (false-positive guard)
    const content = (page.data && page.data.content) || [];
    for (const block of content) {
      const type = (block && block.type) || '';
      if (!type) continue; // malformed block → skip
      const bucket = knownSet.has(type) ? counts : extras;
      if (!bucket.has(type)) bucket.set(type, { instances: 0, pages: new Set() });
      const c = bucket.get(type);
      c.instances += 1;
      c.pages.add(slug);
    }
  }

  const rows = known.map((type) => {
    const c = counts.get(type);
    return { type, category: catOf[type] || '', instances: c.instances, pageCount: c.pages.size, pages: [...c.pages], unused: c.instances === 0 };
  });
  const extraRows = [...extras.entries()].map(([type, c]) => ({ type, category: '', instances: c.instances, pageCount: c.pages.size, pages: [...c.pages], unused: false, extra: true }));

  const usedRows = rows.filter((r) => !r.unused);
  const totalInstances = rows.reduce((s, r) => s + r.instances, 0) + extraRows.reduce((s, r) => s + r.instances, 0);
  // most/least common AMONG USED known types (ignore 0s + extras); ties → first by knownTypes order (strict > / <).
  let mostCommon = null, leastCommon = null;
  for (const r of usedRows) {
    if (!mostCommon || r.instances > mostCommon.instances) mostCommon = r;
    if (!leastCommon || r.instances < leastCommon.instances) leastCommon = r;
  }

  return {
    rows,                     // one per KNOWN type (incl. unused), in knownTypes order
    extras: extraRows,        // placed-but-unregistered (0 on seed)
    summary: {
      knownTypes: known.length,
      usedTypes: usedRows.length,
      unusedTypes: rows.filter((r) => r.unused).length,
      totalInstances,
      pages: slugs.filter((s) => pages[s]).length,
      mostCommon: mostCommon ? mostCommon.type : '',
      leastCommon: leastCommon ? leastCommon.type : '',
      extraTypes: extraRows.length,
    },
  };
}
