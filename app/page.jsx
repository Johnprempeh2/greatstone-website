import ProofPage from './ProofPage.jsx';
import { pageForPath } from './proof-data.js';
import { activeRelease } from './release-source.js';
import { pageMetadata } from './page-metadata.mjs';

export async function generateMetadata() { const { release } = await activeRelease(); return pageMetadata(pageForPath('/', release), release.release.number); }
export default async function Home() { const { release } = await activeRelease(); return <ProofPage path="/" release={release} />; }
