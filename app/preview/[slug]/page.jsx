import { notFound } from 'next/navigation';
import { framePageFor } from '../../../next-proof/frame-page.mjs';
import { activeRelease } from '../../release-source.js';
import { editorHostPolicy } from '../../../next-proof/editor-host-policy.mjs';
import { frameEngine } from '../../../next-proof/frame-engine.mjs';
import Editor from '../../editor/[slug]/Editor.jsx';

export const metadata = { title: 'Page preview | Greatstone Studio', robots: { index: false, follow: false } };
export default async function PreviewPage({ params }) {
  const { slug } = await params;
  const { release } = await activeRelease();
  const page = framePageFor(slug, release);
  if (!page) notFound();
  const policy = editorHostPolicy();
  return <Editor page={page} forms={release.collections?.forms} siteId={policy.siteId || release.siteId} engine={frameEngine(release.release.engine)} origins={policy.origins} mode="preview" />;
}
