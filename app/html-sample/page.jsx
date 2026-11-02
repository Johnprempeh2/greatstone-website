// GRE-3776: local check of the schema 2 renderer. Development only; production answers 404.
// The sample release goes through the same reader as a GSAM release before it renders.
import { createHash } from 'node:crypto';
import { notFound } from 'next/navigation';
import baked from '../../next-proof/data/release.json';
import sample from '../../next-proof/fixtures/html-release-sample.json';
import { readGsamRelease } from '../../next-proof/gsam-release.mjs';
import HtmlPage from '../HtmlPage.jsx';

export const metadata = { title: 'HTML engine sample', robots: { index: false, follow: false } };

export default function HtmlSample() {
  if (process.env.NODE_ENV !== 'development') notFound();
  const raw = JSON.stringify({ ...sample, siteId: baked.siteId });
  const current = { release: sample.release, sha256: createHash('sha256').update(raw).digest('hex') };
  const { release, refused } = readGsamRelease(raw, current, { siteId: baked.siteId, orgId: baked.orgId }, baked);
  if (refused) throw new Error(`Sample release refused: ${refused.rule} ${refused.message}`);
  return <HtmlPage page={release.pages[0]} release={release} />;
}
