import ProofPage from '../ProofPage.jsx';
import { pageFor } from '../proof-data.js';

export const metadata = { title: pageFor('dev-tools').seo.title, description: pageFor('dev-tools').seo.description };
export default function DevToolsPage() { return <ProofPage slug="dev-tools" />; }
