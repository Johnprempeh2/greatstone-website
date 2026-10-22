import { notFound } from 'next/navigation';
import { pageFor } from '../../proof-data.js';
import Editor from './Editor.jsx';

export const metadata = { title: 'Page editor proof', robots: { index: false, follow: false } };
export default async function EditorPage({ params }) {
  const { slug } = await params;
  const page = pageFor(slug);
  if (!page) notFound();
  return <Editor page={page} slug={slug} />;
}
