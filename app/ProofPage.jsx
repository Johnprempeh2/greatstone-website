import { ProofBlocks } from './ProofBlocks.jsx';
import { site, pageFor, navigation, releaseNumber, legalPages } from './proof-data.js';

export function SiteFrame({ children }) {
  return <>
    <header className="proof-header">
      <a href="/" aria-label={site.name}><img src={site.settings.logo} alt={site.name} width="170" height="40" /></a>
      <nav className="proof-desktop-nav" aria-label="Main navigation">{navigation().map((item) => <a href={item.href} key={item.id}>{item.label}</a>)}</nav>
      <details className="proof-mobile-nav"><summary aria-label="Open navigation"><span aria-hidden="true" /></summary><nav aria-label="Main navigation">{navigation().map((item) => <a href={item.href} key={item.id}>{item.label}</a>)}</nav></details>
    </header>
    <main data-org-id={pageFor('home').orgId} data-release={releaseNumber}>{children}</main>
    <footer className="proof-footer"><nav aria-label="Legal pages">{legalPages.map((item) => <a href={item.path} key={item.id}>{item.title}</a>)}</nav></footer>
  </>;
}

export default function ProofPage({ slug }) {
  const page = pageFor(slug);
  return <SiteFrame><ProofBlocks data={page.data} /></SiteFrame>;
}
