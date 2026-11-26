// Case Studies has one public address, /case-studies (John, 25 Oct, GRE-2565: Proof renamed, /proof redirects there).
// GSAM imported the page as /proof (GRE-2389) and a release may still publish it under that slug, so the page serves
// at /case-studies either way and /proof always moves there (next.config.mjs).
export const CASE_STUDIES_PATH = '/case-studies';
export const PROOF_PATH = '/proof';

/** The address visitors see for a release page path. */
export const publicPath = (path) => (path === PROOF_PATH ? CASE_STUDIES_PATH : path);

/** The release page that serves a public path: /case-studies falls back to the /proof page when only that is published. */
export const releasePagePath = (path, pagePaths) =>
  (path === CASE_STUDIES_PATH && !pagePaths.includes(CASE_STUDIES_PATH) && pagePaths.includes(PROOF_PATH) ? PROOF_PATH : path);

/** The release's Case Studies page under either address, or undefined. */
export const caseStudiesPage = (release) =>
  release.pages.find((page) => page.path === CASE_STUDIES_PATH) || release.pages.find((page) => page.path === PROOF_PATH);
