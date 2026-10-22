import { notFound } from 'next/navigation';
import ProofPage from '../ProofPage.jsx';
import { pageForPath } from '../proof-data.js';
import { pageMetadata } from '../page-metadata.mjs';
import { activeRelease } from '../release-source.js';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const path = '/' + slug.join('/');
  const { release } = await activeRelease();
  const page = pageForPath(path, release);
  if (!page) notFound();
  return pageMetadata(page, release.release.number);
}

export default async function PublishedPage({ params }) {
  const { slug } = await params;
  const path = '/' + slug.join('/');
  const { release } = await activeRelease();
  if (!pageForPath(path, release)) notFound();
  return <ProofPage path={path} release={release} />;
}
