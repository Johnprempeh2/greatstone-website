// GRE-6331: the verified case studies a release carries, read from its Case Studies page, so the home carousel and the
// case-studies island fill in from GSAM page drafts with no code change.
//
// Schema 2 (HTML) pages mark each case study as
//   <article class="gs-case-study" data-verified="true"><h3>Outcome headline</h3><p>Problem and baseline</p>
//   <p>What we did</p><p>Measured result</p><img src="…" alt="…"></article>
// The heading is the headline; the paragraphs are problem, work and result in that order (a single paragraph is the
// result); the image is optional. Only data-verified="true" counts: facts and naming permission confirmed (GRE-1852).
// Schema 1 (Puck) pages carry them as the TwoDoorsProof block's verified cases.
import { sanitiseHtml } from './html-sanitiser.mjs';
import { caseStudiesPage } from './case-studies-path.mjs';

export const CASE_STUDY_CLASS = 'gs-case-study';
const MAX_CASES = 6;

const isElement = (node) => node.type === 'element';
const hasClass = (node, name) => (node.attributes.class || '').split(/\s+/).includes(name);
const text = (nodes) => nodes.map((node) => (node.type === 'text' ? node.value : isElement(node) ? text(node.children) : '')).join('').replace(/\s+/g, ' ').trim();
function find(nodes, test) {
  for (const node of nodes) {
    if (!isElement(node)) continue;
    if (test(node)) return node;
    const inside = find(node.children, test);
    if (inside) return inside;
  }
  return null;
}
function collect(nodes, test, out = []) {
  for (const node of nodes) {
    if (!isElement(node)) continue;
    if (test(node)) out.push(node);
    else collect(node.children, test, out);
  }
  return out;
}

function fromArticle(node) {
  const heading = find(node.children, (child) => /^h[1-6]$/.test(child.tag));
  const paragraphs = collect(node.children, (child) => child.tag === 'p').map((p) => text(p.children)).filter(Boolean);
  const image = find(node.children, (child) => child.tag === 'img');
  const [problem, work, result] = paragraphs.length >= 3 ? paragraphs.slice(0, 3)
    : paragraphs.length === 2 ? [paragraphs[0], '', paragraphs[1]] : ['', '', paragraphs[0] || ''];
  return {
    headline: heading ? text(heading.children) : '',
    problem, work, result,
    image: image?.attributes.src || '',
    imageAlt: image?.attributes.alt || '',
    verified: node.attributes['data-verified'] === 'true',
  };
}

export const isVerifiedCase = (study) => Boolean(study && study.verified === true && study.headline && study.result);

/** The verified case studies of the release's Case Studies page, at most six, in page order. */
export function verifiedCaseStudies(release) {
  const page = caseStudiesPage(release);
  if (!page) return [];
  const studies = typeof page.html === 'string'
    ? collect(sanitiseHtml(page.html, { media: release.media || {} }).nodes, (node) => hasClass(node, CASE_STUDY_CLASS)).map(fromArticle)
    : (page.data?.content || []).filter((block) => block.type === 'TwoDoorsProof').flatMap((block) => block.props?.cases || []);
  return studies.filter(isVerifiedCase).slice(0, MAX_CASES);
}
