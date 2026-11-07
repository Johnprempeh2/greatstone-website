import { SiteFrame } from '../ProofPage.jsx';
import { activeRelease } from '../release-source.js';
import IntelDashboardIsland from '../IntelDashboardIsland.jsx';

// The AI Market Intelligence page: the same dashboard as GSAM's Intelligence page (GRE-1861), from the public
// snapshot of its boards and briefing. It replaces the older hub the Vite site showed here (Next cutover).
export const metadata = {
  title: 'AI Market Intelligence · Greatstone International',
  description: 'The AI landscape, read for you: leaderboards, model comparisons and the day’s briefing.',
};

export default async function AiMarketIntelligencePage() {
  const { release } = await activeRelease();
  return <SiteFrame release={release}>
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '128px clamp(16px, 4vw, 48px) 72px' }}>
      <h1 style={{ margin: '0 0 24px' }}>The AI landscape, read for you.</h1>
      <IntelDashboardIsland />
    </div>
  </SiteFrame>;
}
