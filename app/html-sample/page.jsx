// GRE-3776: local check of the schema 2 renderer. Development only; production answers 404.
import { notFound } from 'next/navigation';
import HtmlPage from '../HtmlPage.jsx';
import { sampleRelease } from './sample-release.mjs';

export const metadata = { title: 'HTML engine sample', robots: { index: false, follow: false } };

export default function HtmlSample() {
  if (process.env.NODE_ENV !== 'development') notFound();
  const release = sampleRelease();
  return <HtmlPage page={release.pages.find((page) => page.path === '/')} release={release} />;
}
