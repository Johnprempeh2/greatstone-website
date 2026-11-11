import { releaseServices } from '../next-proof/service-pages.mjs';
import { ProofBlocks } from './ProofBlocks.jsx';
import { pageForPath } from './proof-data.js';
import { siteChrome } from './site-chrome.mjs';
import { insightBriefings } from './insight-briefings.mjs';
import HtmlPage from './HtmlPage.jsx';
import { SiteHeader, SiteFooter } from './SiteShell.jsx';

export function SiteFrame({ children, release }) {
  const chrome = siteChrome(release);
  return <>
    <a className="gs-skip" href="#gs-main">Skip to content</a>
    <SiteHeader {...chrome} />
    <main className="gs-public" id="gs-main" tabIndex={-1} data-org-id={release.orgId} data-release={release.release.number}>{children}</main>
    <SiteFooter {...chrome} />
  </>;
}

export default function ProofPage({ path, release }) {
  // Schema 2 releases carry HTML pages and their own chrome (GRE-3776); schema 1 keeps Puck blocks.
  if (release.releaseSchema === 2) return <HtmlPage page={release.pages.find((item) => item.path === path)} release={release} />;
  const page = pageForPath(path, release);
  const briefings = path === '/insights' ? insightBriefings(release) : [];
  return <SiteFrame release={release}>
    <ProofBlocks data={page.data} pageSlug={page.slug} pagePaths={release.pages.map((item) => item.path)} forms={release.collections?.forms} services={releaseServices(release)} briefings={briefings} />
  </SiteFrame>;
}
