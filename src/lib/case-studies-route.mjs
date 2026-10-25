// Move the old Proof page to its public Case Studies route without discarding
// an editor's draft. Both published and draft links must follow the new slug.
const OLD = 'proof';
const NEXT = 'case-studies';

function repoint(value) {
  if (Array.isArray(value)) return value.map(repoint);
  if (value && typeof value === 'object') {
    if (value.kind === 'page' && value.page === OLD) return { ...value, page: NEXT };
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === 'pageSlug' && item === OLD ? NEXT : repoint(item)]));
  }
  if (value === '/proof') return '/case-studies';
  if (value === '#go/proof' || value === '#proof') return '#go/case-studies';
  return value;
}

export function moveProofToCaseStudies(state) {
  if (!state?.pages) return state;
  if (state._caseStudiesRouteV1) return state;
  if (state.pages[OLD] && !state.pages[NEXT]) {
    state.pages[NEXT] = state.pages[OLD];
    delete state.pages[OLD];
  }
  const page = state.pages[NEXT];
  if (page) {
    if (page.title === 'Proof') page.title = 'Case Studies';
    if (page.seo?.title?.startsWith('Proof ·')) page.seo.title = page.seo.title.replace(/^Proof ·/, 'Case Studies ·');
  }
  state.order = (state.order || []).map((slug) => slug === OLD ? NEXT : slug);
  state.navigation = (state.navigation || []).map((item) => repoint(item));
  state.navigation = state.navigation.map((item) => item.pageSlug === NEXT
    ? { ...item, label: 'Case Studies' } : item);
  for (const page of Object.values(state.pages)) {
    for (const key of ['data', 'published']) {
      if (page?.[key]) page[key] = repoint(page[key]);
    }
  }
  state.redirects = [...(state.redirects || []).filter((row) => row.from !== OLD), { from: OLD, to: NEXT }];
  state._caseStudiesRouteV1 = true;
  return state;
}
