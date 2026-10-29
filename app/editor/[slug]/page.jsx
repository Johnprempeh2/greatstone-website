import { notFound } from 'next/navigation';
import { framePageFor } from '../../../next-proof/frame-page.mjs';
import { activeRelease } from '../../release-source.js';
import { editorHostPolicy } from '../../../next-proof/editor-host-policy.mjs';
import { frameEngine } from '../../../next-proof/frame-engine.mjs';
import Editor from './Editor.jsx';
import { EDITOR_CONTRACT } from '../../../next-proof/frame-editor.mjs';

export const metadata = { title: 'Page editor | Greatstone Studio', robots: { index: false, follow: false } };
export default async function EditorPage({ params }) {
  const { slug } = await params;
  const { release } = await activeRelease();
  const page = framePageFor(slug, release);
  if (!page) notFound();
  // The live page's own data (GSAM GRE-2394): Edit copy offers to import it into an empty GSAM draft.
  const liveData = release.pages.find((item) => item.id === slug || item.slug === slug)?.data ?? null;
  const siteId = editorHostPolicy().siteId || process.env.GSAM_EDITOR_SITE_ID || release.siteId;
  const engine = frameEngine(release.release.engine);
  return <>
    <meta name="gsam-editor-site-id" content={siteId} />
    <meta name="gsam-editor-contract" content={String(EDITOR_CONTRACT)} />
    <meta name="gsam-editor-engine-commit" content={engine.commit} />
    <Editor page={page} liveData={liveData} forms={release.collections?.forms} siteId={siteId} engine={engine} origins={editorHostPolicy().origins} mode="editor" />
  </>;
}
