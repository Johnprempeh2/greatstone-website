// The single admin-route parser, pure + unit-tested so the URL, the rendered destination and the
// active rail item can never disagree. App's readAdminHash() and auth's isAdminRoute() both defer to
// this. Anchored ($) and lowercase-only section so a non-canonical hash (#admin/PAGES, #admin/a/b/c,
// #administrators, trailing slash) fails the match and falls through to the public site rather than
// rendering a mislabelled console with a lying URL.
//
// Returns { section, slug } for an admin hash, or null otherwise.
//   #admin                 → { section:'overview', slug:null }
//   #admin/seo             → { section:'seo',      slug:null }
//   #admin/seo/method      → { section:'seo',      slug:'method' }
//   #admin/editor/home     → { section:'editor',   slug:'home' }
const ADMIN_RE = /^#\/?admin(?:\/([a-z]+))?(?:\/([\w-]+))?$/i;

export function parseAdminHash(hash) {
  const m = String(hash || '').match(ADMIN_RE);
  if (!m) return null;
  // section is a fixed keyword → normalise case; slug is a page identifier keyed into state.pages →
  // preserve it verbatim so a shared link like #admin/editor/CaseStudy restores the right page.
  return { section: (m[1] || 'overview').toLowerCase(), slug: m[2] || null };
}

// console destinations that act on one page → their URL carries the page slug (#admin/seo/<slug>)
export const PER_PAGE_SECTIONS = new Set(['seo', 'background', 'history', 'activity']);
