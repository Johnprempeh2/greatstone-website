import { notFound } from 'next/navigation';
import ServiceDetailClient from '../../ServiceDetailClient.jsx';
import { SiteFrame } from '../../ProofPage.jsx';
import { activeRelease } from '../../release-source.js';
import frozenBlocks from '../../../next-proof/frozen/form-blocks.json';
import { serviceCatalogueFromRelease } from '../../../next-proof/service-pages.mjs';
import { findService } from '../../../src/store/service-lookup.mjs';

// GRE-1824: How we help links each service to its own page; the Vite site showed it at #service/<slug>.
async function serviceFor(params) {
  const { release } = await activeRelease();
  const { path, ...catalogue } = serviceCatalogueFromRelease(release, frozenBlocks);
  const slug = (await params).slug;
  const service = findService(catalogue.services, slug);
  if (!service) notFound();
  return { release, catalogue, path, slug, service };
}

export async function generateMetadata({ params }) {
  const { release, slug, service } = await serviceFor(params);
  const title = `${service.name} · Greatstone International`;
  const description = service.oneLiner;
  const url = `https://greatstoneint.com/service/${slug}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url }, twitter: { card: 'summary', title, description }, other: { 'gsam-release': String(release.release.number) } };
}

export default async function Service({ params }) {
  const { release, catalogue, path, slug } = await serviceFor(params);
  return <SiteFrame release={release}><ServiceDetailClient slug={slug} catalogue={catalogue} listingPath={path} /></SiteFrame>;
}
