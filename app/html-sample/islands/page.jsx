// GRE-3777: every island on one schema 2 page. Development only; production answers 404.
// ?view=placeholders shows the page as GSAM live design does: each island as its labelled placeholder.
import { notFound } from 'next/navigation';
import HtmlPage from '../../HtmlPage.jsx';
import { sampleRelease } from '../sample-release.mjs';

export const metadata = { title: 'HTML islands sample', robots: { index: false, follow: false } };

export default async function HtmlIslandsSample({ searchParams }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const { view } = await searchParams;
  const release = sampleRelease();
  return <HtmlPage page={release.pages.find((page) => page.path === '/islands')} release={release} placeholders={view === 'placeholders'} />;
}
