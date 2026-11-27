import { SiteFrame } from '../ProofPage.jsx';
import { activeRelease } from '../release-source.js';
import { pageMetadata } from '../page-metadata.mjs';
import './ai-market-intelligence.css';
import IntelDashboardIsland from '../IntelDashboardIsland.jsx';
import { hiddenTarget } from '../../next-proof/hidden-routes.mjs';

// The AI Market Intelligence page: the same dashboard as GSAM's Intelligence page (GRE-1861), from the public
// snapshot of its boards and briefing. It replaces the older hub the Vite site showed here (Next cutover).
// Since 27 Nov it is also where Insights opens (18 Nov copy pass): fewer words, more links. The topics are plain
// text until briefings have topic pages to link to.
const TOPICS = ['Frontier models', 'Agents', 'AI security', 'Regulation', 'Enterprise'];
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
  const consultancy = hiddenTarget(release.pages.map((page) => page.path));
  const next = [
    ['Is your business ready for AI? Take the free check →', `${consultancy}#ai-readiness`],
    ['How much could AI save you? →', `${consultancy}#ai-cost-calculator`],
    ['Begin the Conversation →', '/contact'],
  ];
  return <SiteFrame release={release}>
    <div className="gs-amia">
      <header className="gs-amia-head">
        <p className="kicker">Insights</p>
        <h1>AI Market Intelligence</h1>
        <p className="gs-amia-line">What is changing in AI, why it matters to your business, and what to consider next. Short briefings for leaders.</p>
        <ul className="gs-amia-topics" aria-label="Topics">{TOPICS.map((topic) => <li key={topic}>{topic}</li>)}</ul>
      </header>
      <IntelDashboardIsland />
      <nav className="gs-amia-next" aria-label="Next steps">{next.map(([label, href]) => <a key={href} href={href}>{label}</a>)}</nav>
    </div>
  </SiteFrame>;
}

