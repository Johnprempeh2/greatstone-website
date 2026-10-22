import ProofPage from './ProofPage.jsx';
import { pageFor, releaseNumber } from './proof-data.js';

export const metadata = { title: pageFor('home').seo.title, description: pageFor('home').seo.description, other: { 'gs-release': String(releaseNumber) } };
export default function Home() { return <ProofPage slug="home" />; }
