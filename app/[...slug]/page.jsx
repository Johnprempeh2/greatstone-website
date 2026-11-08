import { notFound, permanentRedirect } from 'next/navigation';
import ProofPage from '../ProofPage.jsx';
import { pageForPath } from '../proof-data.js';
import { pageMetadata } from '../page-metadata.mjs';
import { activeRelease } from '../release-source.js';
import { publishedAlias } from '../../next-proof/release-1-sync.mjs';

// A live path the release publishes under its GSAM slug (or the reverse) redirects there.
function redirectIfMoved(path, release) {
  const moved = publishedAlias(path, release.pages.map((page) => page.path));
  if (moved) permanentRedirect(moved);
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const path = '/' + slug.join('/');
  const { release } = await activeRelease();
  const page = pageForPath(path, release);
  if (!page) { redirectIfMoved(path, release); notFound(); }
  return pageMetadata(page, release.release.number);
}

export default async function PublishedPage({ params }) {
  const { slug } = await params;
  const path = '/' + slug.join('/');
  const { release } = await activeRelease();
  if (!pageForPath(path, release)) { redirectIfMoved(path, release); notFound(); }
  return <ProofPage path={path} release={release} />;
}

// Rendered on first visit, then kept like the static pages (Next cutover gap 6): no build-time list needed.
export async function generateStaticParams() {
  return [];
}
