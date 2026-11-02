import { ProofBlocks } from './ProofBlocks.jsx';
import { pageForPath } from './proof-data.js';
import { siteChrome } from './site-chrome.mjs';
import { insightBriefings } from './insight-briefings.mjs';
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
  const page = pageForPath(path, release);
  const briefings = path === '/insights' ? insightBriefings(release) : [];
  return <SiteFrame release={release}>
    <ProofBlocks data={page.data} pageSlug={page.slug} pagePaths={release.pages.map((item) => item.path)} forms={release.collections?.forms} briefings={briefings} />
  </SiteFrame>;
}
