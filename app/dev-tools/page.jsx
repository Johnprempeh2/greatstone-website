import ProofPage from '../ProofPage.jsx';
import { pageFor, releaseNumber } from '../proof-data.js';
import { pageMetadata } from '../page-metadata.mjs';

export const metadata = pageMetadata(pageFor('dev-tools'), releaseNumber);
export default function DevToolsPage() { return <ProofPage slug="dev-tools" />; }
