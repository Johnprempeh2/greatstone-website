import { SiteFrame } from '../ProofPage.jsx';
import { activeRelease } from '../release-source.js';
import IntelHubClient from './IntelHubClient.jsx';

// Ported from the Vite site's code page (Next cutover gap 1): not a Website module page.
export const metadata = { title: 'AI Market Intelligence · Greatstone International' };

export default async function AiMarketIntelligencePage() {
  const { release } = await activeRelease();
  return <SiteFrame release={release}><IntelHubClient /></SiteFrame>;
}
