// John, 8 Nov: "We should look at real case studies we've done, but hide that page for now." Case Studies was hidden
// here until 26 Nov, when John said "fix everything" on Ben's reviews (GRE-6327 part 2, GRE-6331): the page is public
// again at /case-studies (next-proof/case-studies-path.mjs), with marked placeholders until Ben's case studies arrive.
// Add a path here to hide a page: it then answers with a temporary (302) redirect to DX Consultancy and leaves the
// sitemap, header, footer and search.
export const HIDDEN_ROUTES = [];
// DX Consultancy is /consultancy in GSAM releases and /dx-consultancy in the baked one: send visitors to whichever
// the release publishes, so the redirect never lands on a 404.
export const hiddenTarget = (paths = []) => (paths.includes('/consultancy') || !paths.includes('/dx-consultancy') ? '/consultancy' : '/dx-consultancy');

/** Next redirects for the hidden pages (and anything under them), temporary so search engines keep no move. */
export const hiddenRedirects = (paths) => HIDDEN_ROUTES.flatMap((path) => [path, `${path}/:rest*`])
  .map((source) => ({ source, destination: hiddenTarget(paths), statusCode: 302 }));

export const isHidden = (path) => HIDDEN_ROUTES.some((hidden) => path === hidden || path.startsWith(hidden + '/'));
