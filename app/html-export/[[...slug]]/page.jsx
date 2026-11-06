// GRE-3778: local check of the S4 export. Renders next-proof/data/html-export-release.json (schema 2)
// through the same reader and renderer as a GSAM release, at /html-export/<page path>, so the parity
// captures can compare it with today's render. Development only; production answers 404.
import { createHash } from 'node:crypto';
import { notFound } from 'next/navigation';
import baked from '../../../next-proof/data/release.json';
import exported from '../../../next-proof/data/html-export-release.json';
import { readGsamRelease } from '../../../next-proof/gsam-release.mjs';
import HtmlPage from '../../HtmlPage.jsx';

export const metadata = { title: 'HTML export check', robots: { index: false, follow: false } };

export default async function HtmlExport({ params }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const { slug = [] } = await params;
  const raw = JSON.stringify(exported);
  const current = { release: exported.release, sha256: createHash('sha256').update(raw).digest('hex') };
  const { release, refused } = readGsamRelease(raw, current, { siteId: baked.siteId, orgId: baked.orgId }, baked);
  if (refused) throw new Error(`Export release refused: ${refused.rule} ${refused.message}`);
  const page = release.pages.find((item) => item.path === '/' + slug.join('/'));
  if (!page) notFound();
  return <HtmlPage page={page} release={release} />;
}
