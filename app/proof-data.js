import baked from '../next-proof/data/release.json';
import { resolveMediaRefs } from '../next-proof/release-media.mjs';
import { publicPath, releasePagePath } from '../next-proof/case-studies-path.mjs';

// A page is presented at its public address: a release that publishes Case Studies as /proof still serves it at
// /case-studies, and its canonical, behaviours and links say so.
const present = (page, release) => page && { ...resolveMediaRefs(page, release.media), path: publicPath(page.path), orgId: release.orgId };

export function pageFor(slug, release = baked) {
  return present(release.pages.find((item) => item.slug === slug), release);
}
/** The release page that serves a public path, as the release stores it (no media resolution). */
export function releasePageForPath(path, release) {
  const target = releasePagePath(path, release.pages.map((item) => item.path));
  return release.pages.find((item) => item.path === target);
}
export function pageForPath(path, release) {
  return present(releasePageForPath(path, release), release);
}
