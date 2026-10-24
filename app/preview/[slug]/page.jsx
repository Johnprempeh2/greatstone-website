import { notFound } from 'next/navigation';
import { framePageFor } from '../../../next-proof/frame-page.mjs';
import { activeRelease } from '../../release-source.js';
import { allowedHostOrigins } from '../../../next-proof/frame-protocol.mjs';
import { frameEngine } from '../../../next-proof/frame-engine.mjs';
import Editor from '../../editor/[slug]/Editor.jsx';

export const metadata = { title: 'Page preview | Greatstone Studio', robots: { index: false, follow: false } };
export default async function PreviewPage({ params }) {
  const { slug } = await params;
  const { release } = await activeRelease();
  const page = framePageFor(slug, release);
  if (!page) notFound();
  return <Editor page={page} forms={release.collections?.forms} siteId={release.siteId} engine={frameEngine(release.release.engine)} origins={allowedHostOrigins(process.env.GSAM_EDITOR_ORIGINS, process.env.NODE_ENV === 'development')} mode="preview" />;
}
