import { SiteFrame } from '../ProofPage.jsx';
import { activeRelease } from '../release-source.js';
import { pageMetadata } from '../page-metadata.mjs';
import IntelDashboardIsland from '../IntelDashboardIsland.jsx';

// The AI Market Intelligence page: the same dashboard as GSAM's Intelligence page (GRE-1861), from the public
// snapshot of its boards and briefing. It replaces the older hub the Vite site showed here (Next cutover).
const seo = {
  title: 'AI Market Intelligence · Greatstone International',
  description: 'The AI landscape, read for you: leaderboards, model comparisons and the day’s briefing.',
};
export async function generateMetadata() {
  const { release } = await activeRelease();
  return pageMetadata({ path: '/ai-market-intelligence', seo }, release.release.number);
}

export default async function AiMarketIntelligencePage() {
  const { release } = await activeRelease();
  return <SiteFrame release={release}>
    <div style={{ maxWidth: 'var(--gs-maxw)', margin: '0 auto', padding: '128px var(--gs-gutter) 72px' }}>
      <h1 style={{ margin: '0 0 24px' }}>The AI landscape, read for you.</h1>
      <IntelDashboardIsland />
    </div>
  </SiteFrame>;
}
