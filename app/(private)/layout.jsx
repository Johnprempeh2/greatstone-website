import { SiteFrame } from '../ProofPage.jsx';
import { activeRelease } from '../release-source.js';
import './private.css';

export const metadata = { robots: { index: false, follow: false } };

export default async function PrivateLayout({ children }) {
  const { release } = await activeRelease();
  return <SiteFrame release={release}>{children}</SiteFrame>;
}
