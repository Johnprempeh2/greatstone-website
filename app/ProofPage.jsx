import { ProofBlocks } from './ProofBlocks.jsx';
import { site, pageFor } from './proof-data.js';

export default function ProofPage({ slug }) {
  const page = pageFor(slug);
  return <>
    <header className="proof-header">
      <a href="/" aria-label={site.settings.siteName}><img src={site.settings.logo} alt={site.settings.siteName} width="170" height="40" /></a>
      <nav aria-label="Main navigation">{site.navigation.map((item) => <a href={item.pageSlug === 'home' ? '/' : `/${item.pageSlug}`} key={item.id}>{item.label}</a>)}</nav>
    </header>
    <main><ProofBlocks data={page.data} /></main>
  </>;
}
