import { ProofBlocks } from './ProofBlocks.jsx';
import { pageForPath, navigation } from './proof-data.js';
import { insightBriefings } from './insight-briefings.mjs';
import { resolveMediaRefs } from '../next-proof/release-media.mjs';
import { CookieSettings } from './ConsentAnalytics.jsx';

export function SiteFrame({ children, release }) {
  const site = release.site;
  const legalPages = release.pages.filter((page) => ['privacy', 'cookies', 'terms'].includes(page.slug));
  return <>
    <header className="proof-header">
      <a href="/" aria-label={site.name}><img src={resolveMediaRefs(site.settings.logo, release.media)} alt={site.name} width="170" height="40" /></a>
      <nav className="proof-desktop-nav" aria-label="Main navigation">{navigation(release).map((item) => <a href={item.href} key={item.id}>{item.label}</a>)}</nav>
      <details className="proof-mobile-nav"><summary aria-label="Open navigation"><span aria-hidden="true" /></summary><nav aria-label="Main navigation">{navigation(release).map((item) => <a href={item.href} key={item.id}>{item.label}</a>)}</nav></details>
    </header>
    <main data-org-id={release.orgId} data-release={release.release.number}>{children}</main>
    <footer className="proof-footer"><nav aria-label="Legal pages">{legalPages.map((item) => <a href={item.path} key={item.id}>{item.title}</a>)}<CookieSettings /></nav></footer>
  </>;
}

export default function ProofPage({ path, release }) {
  const page = pageForPath(path, release);
  const briefings = path === '/insights' ? insightBriefings(release) : [];
  return <SiteFrame release={release}>
    <ProofBlocks data={page.data} pageSlug={page.slug} forms={release.collections?.forms} briefings={briefings} />
  </SiteFrame>;
}
