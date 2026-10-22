import { notFound } from 'next/navigation';
import ProofPage from '../ProofPage.jsx';
import { pageFor, releaseNumber } from '../proof-data.js';
import { pageMetadata } from '../page-metadata.mjs';
import release from '../../next-proof/data/release.json';

export function generateStaticParams() {
  return release.pages.filter((page) => page.slug !== 'home' && page.slug !== 'dev-tools').map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const page = pageFor(slug);
  if (!page || slug === 'home' || slug === 'dev-tools') notFound();
  return pageMetadata(page, releaseNumber);
}

export default async function PublishedPage({ params }) {
  const { slug } = await params;
  if (!pageFor(slug) || slug === 'home' || slug === 'dev-tools') notFound();
  return <ProofPage slug={slug} />;
}
