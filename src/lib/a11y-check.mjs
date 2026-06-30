import { stripMarks, fieldLabel, buildSnippet } from './content-search.mjs';
import { hasLink } from './link-resolver.mjs';
import { stripTags } from './richtext-normalise.mjs'; // headline/eyebrow can be rich HTML; heading checks want plain text

// Greatstone "A11y coach": a pure, read-only accessibility pre-flight over editor-controlled content,
// BEYOND the publish-time image-alt check (App.findMissingAlt) and distinct from the house-voice Copy
// coach. Two grounded families: vague link text (WCAG 2.4.4) on STANDALONE CTAs, and page-level H1
// structure — missing, duplicate, or empty main heading (2.4.6 / 1.3.1). Advisory + read-only: no React,
// no network, no mutation. Heading detection is grounded — only Hero + TimeCounter render an <h1>.

// vague CTA labels (exact, normalised set — NOT substring): a link whose whole text is one of these tells
// a screen-reader user nothing about where it goes. "Read our 2026 report" is fine; "Read more" is not.
const VAGUE_LABELS = new Set([
  'click here', 'click', 'here', 'read more', 'learn more', 'more', 'this', 'link',
  'details', 'see more', 'find out more', 'go', 'continue', 'this page', 'this link',
]);
// Standalone-anchor label/href pairs — the whole <a> wraps ONLY the label, so the label IS the accessible
// name (a true 2.4.4 surface). Array-item links (PillarCards pillars[], InsightsGrid posts[]) are
// deliberately NOT here: there the whole CARD is the anchor, so its accessible name is far more than the
// item's name/title and a short item label is not actually a vague link.
const LABEL_LINKS = [['ctaLabel', 'ctaHref'], ['ctaLabel2', 'ctaHref2'], ['cardCtaLabel', 'cardCtaHref']];

const normLabel = (s) => stripMarks(String(s == null ? '' : s)).toLowerCase().replace(/[’]/g, "'").replace(/[\s.!?:—–-]+$/g, '').trim();

// GROUNDED: only Hero (Hero.jsx) and TimeCounter render an <h1>; every other block renders <h2>/<h3>.
// headingText reproduces exactly what each renders so blank detection matches the canvas.
const H1_BLOCKS = new Set(['Hero', 'TimeCounter']);
function headingText(block) {
  const p = (block && block.props) || {};
  if (block.type === 'Hero' && Array.isArray(p.lines) && p.lines.length) return p.lines.map((l) => (l && l.text) || '').join(' ').trim();
  return [p.headline, p.highlight, p.headlineSuffix].filter(Boolean).map((x) => stripTags(String(x))).join(' ').trim();
}

const snippetFor = (text) => { const hay = stripMarks(text); return buildSnippet(hay, { start: 0, end: hay.length }); };

// Walk every page; collect link-text + heading issues; group by page (worst offenders first). Pure.
export function checkA11y(state) {
  const pages = (state && state.pages) || {};
  const order = (state && state.order) || Object.keys(pages);
  const groups = [];
  let total = 0, errors = 0, warnings = 0;

  order.forEach((slug) => {
    const page = pages[slug];
    if (!page || !page.data) return;
    const title = (page.data.root && page.data.root.props && page.data.root.props.title) || page.title || slug;
    const issues = [];
    const content = page.data.content || [];

    // --- vague link text (2.4.4): only standalone CTAs whose href is a real destination ---
    content.forEach((block) => {
      const props = (block && block.props) || {};
      const blockType = (block && block.type) || 'Block';
      for (const [labelKey, hrefKey] of LABEL_LINKS) {
        const label = props[labelKey];
        if (!label || !(hrefKey in props) || !hasLink(props[hrefKey])) continue; // dead/empty CTAs are Link-health's job
        if (VAGUE_LABELS.has(normLabel(label))) {
          issues.push({ ruleId: 'link-text', severity: 'warn', wcag: '2.4.4', blockType, field: labelKey, fieldLabel: fieldLabel(blockType, labelKey), label: 'Vague link text', suggestion: 'say where it goes (e.g. “See the eight pillars”) — screen-reader users navigate by link text', snippet: snippetFor(String(label)) });
        }
      }
    });

    // --- page-level H1 structure (2.4.6 / 1.3.1) ---
    const h1Blocks = content.filter((b) => b && H1_BLOCKS.has(b.type));
    const nonEmpty = h1Blocks.filter((b) => headingText(b));
    const empties = h1Blocks.filter((b) => !headingText(b));
    if (empties.length) {
      empties.forEach((b) => issues.push({ ruleId: 'empty-h1', severity: 'error', wcag: '2.4.6', blockType: b.type, field: 'headline', fieldLabel: 'Headline', label: 'Empty main heading', suggestion: 'this block is the page’s main heading (H1) but has no text — add a headline' }));
    }
    if (nonEmpty.length === 0 && empties.length === 0) {
      issues.push({ ruleId: 'no-h1', severity: 'error', wcag: '2.4.6', blockType: '(page)', field: '', fieldLabel: 'Page structure', label: 'No main heading', suggestion: 'no block on this page sets a main heading (H1) — add a Hero so the page has one' });
    } else if (nonEmpty.length > 1) {
      nonEmpty.slice(1).forEach((b) => issues.push({ ruleId: 'multi-h1', severity: 'error', wcag: '1.3.1', blockType: b.type, field: 'headline', fieldLabel: 'Headline', label: 'Duplicate main heading', suggestion: 'a page should have one H1; this is an extra main heading — change it to a Chapter (H2)' }));
    }

    if (issues.length) {
      issues.sort((a, b) => (a.severity === 'error' ? 0 : 1) - (b.severity === 'error' ? 0 : 1));
      total += issues.length;
      errors += issues.filter((i) => i.severity === 'error').length;
      warnings += issues.filter((i) => i.severity === 'warn').length;
      groups.push({ pageSlug: slug, title, count: issues.length, issues });
    }
  });

  groups.sort((a, b) => b.count - a.count);
  return { total, errors, warnings, groups };
}

// Surfaced (additive, no behaviour change) so the cycle-20/21 document-outline shares ONE source of truth
// for the H1 vocabulary + heading-text logic — the two surfaces can never drift on "what is an H1".
export { H1_BLOCKS, headingText };
