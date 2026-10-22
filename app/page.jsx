import ProofPage from './ProofPage.jsx';
import { pageFor, releaseNumber } from './proof-data.js';
import { pageMetadata } from './page-metadata.mjs';

export const metadata = pageMetadata(pageFor('home'), releaseNumber);
export default function Home() { return <ProofPage slug="home" />; }
