import ProofPage from '../ProofPage.jsx';
import { pageFor, releaseNumber } from '../proof-data.js';

export const metadata = { title: pageFor('dev-tools').seo.title, description: pageFor('dev-tools').seo.description, other: { 'gs-release': String(releaseNumber) } };
export default function DevToolsPage() { return <ProofPage slug="dev-tools" />; }
