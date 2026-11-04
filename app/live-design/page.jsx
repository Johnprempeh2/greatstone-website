// GSAM live design (plan GRE-1831 revision 8): GSAM's live editor frames this route on the editor
// host, so John designs on the real engine with every island running. GSAM sends the draft page
// (and its shared parts) after a hello from an allowed origin; nothing is stored here. Impeccable's
// live tools load with the page's nonce and talk to GSAM through window.parent.
import { headers } from 'next/headers';
import { activeRelease } from '../release-source.js';
import { allowedHostOrigins } from '../../next-proof/frame-protocol.mjs';
import LiveDraft from './LiveDraft.jsx';

export const metadata = { title: 'Live design | Greatstone', robots: { index: false, follow: false } };

export default async function LiveDesignPage() {
  const { release } = await activeRelease();
  const nonce = (await headers()).get('x-nonce') || undefined;
  const siteId = process.env.GSAM_EDITOR_SITE_ID || release.siteId;
  // Only what a page needs to render: chrome, stylesheet, media, forms and paths. Drafts replace chrome and stylesheet.
  const base = {
    release: release.release, siteId, orgId: release.orgId, media: release.media, theme: release.theme,
    chrome: release.chrome ?? null, stylesheet: release.stylesheet ?? '',
    collections: release.collections ?? {},
    // The header's site search (GRE-3862) lists pages by title and builds the nav from `site`.
    site: release.site,
    pages: release.pages.map((page) => ({ id: page.id, path: page.path, slug: page.slug, title: page.title })),
  };
  return <>
    <LiveDraft base={base} siteId={siteId} origins={allowedHostOrigins(process.env.GSAM_EDITOR_ORIGINS, process.env.NODE_ENV === 'development')} />
    <script nonce={nonce} src="/live-design/impeccable-live.js" defer />
  </>;
}
