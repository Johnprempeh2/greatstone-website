import ProofPage from '../ProofPage.jsx';
import { pageForPath } from '../proof-data.js';
import { activeRelease } from '../release-source.js';
import { pageMetadata } from '../page-metadata.mjs';
import { notFound } from 'next/navigation';

export async function generateMetadata() { const { release } = await activeRelease(); const page = pageForPath('/dev-tools', release); if (!page) notFound(); return pageMetadata(page, release.release.number); }
export default async function DevToolsPage() { const { release } = await activeRelease(); if (!pageForPath('/dev-tools', release)) notFound(); return <ProofPage path="/dev-tools" release={release} />; }
