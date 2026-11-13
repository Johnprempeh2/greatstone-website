import { SiteFrame } from './ProofPage.jsx';
import { activeRelease } from './release-source.js';

export const metadata = { title: 'Page not found · Greatstone International', robots: { index: false } };

// The site's own 404: header, footer and a way on, instead of the bare framework page.
export default async function NotFound() {
  const body = <section className="gs-rhythm"><div className="wrap" style={{ paddingBlock: 'clamp(64px, 12vw, 160px)' }}>
    <span className="kicker">Page not found</span>
    <h1>We could not find that page.</h1>
    <p className="lead">It may have moved, or the link may be out of date.</p>
    <div className="b-cta-row"><a className="b-cta" href="/">Go to the home page</a> <a className="b-cta ghost" href="/contact">Begin the Conversation</a></div>
  </div></section>;
  try {
    const { release } = await activeRelease();
    return <SiteFrame release={release}>{body}</SiteFrame>;
  } catch {
    return <main className="gs-public" id="gs-main">{body}</main>;
  }
}
