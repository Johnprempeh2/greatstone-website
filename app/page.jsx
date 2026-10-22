import ProofPage from './ProofPage.jsx';
import { pageFor } from './proof-data.js';

export const metadata = { title: pageFor('home').seo.title, description: pageFor('home').seo.description };
export default function Home() { return <ProofPage slug="home" />; }
