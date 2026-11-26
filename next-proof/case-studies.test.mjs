import test from 'node:test';
import assert from 'node:assert/strict';
import { CASE_STUDIES_PATH, PROOF_PATH, caseStudiesPage, publicPath, releasePagePath } from './case-studies-path.mjs';
import { verifiedCaseStudies } from './case-studies.mjs';
import { siteChrome } from '../app/site-chrome.mjs';
import { islandProps, ISLANDS } from './islands.mjs';

const site = { settings: { logo: '' }, navigation: [] };
const proofOnly = { orgId: 'org', media: {}, site, pages: [
  { id: 'h', slug: 'home', path: '/', title: 'Home', seo: {}, data: { content: [] } },
  { id: 'p', slug: 'proof', path: '/proof', title: 'Case Studies', seo: { title: 'Case Studies' }, data: { content: [] } },
] };
const both = { ...proofOnly, pages: [...proofOnly.pages, { id: 'c', slug: 'case-studies', path: '/case-studies', title: 'Case Studies', seo: {}, data: { content: [] } }] };

test('GRE-6331: /case-studies is the public address; a release that publishes /proof still serves it there', () => {
  assert.equal(publicPath(PROOF_PATH), CASE_STUDIES_PATH);
  assert.equal(publicPath('/about'), '/about');
  assert.equal(releasePagePath('/case-studies', ['/', '/proof']), '/proof');
  assert.equal(releasePagePath('/case-studies', ['/', '/case-studies', '/proof']), '/case-studies');
  assert.equal(releasePagePath('/case-studies', ['/']), '/case-studies');
  assert.equal(releasePagePath('/proof', ['/', '/proof']), '/proof');
  // app/proof-data.js serves a public path through releasePagePath and presents the page at publicPath (Next-only imports).
  assert.equal(caseStudiesPage(proofOnly).id, 'p');
  assert.equal(caseStudiesPage(both).id, 'c');
  assert.equal(siteChrome(proofOnly).paths.proof, '/case-studies');
});

test('verified case studies come from the Case Studies page: schema 2 articles marked verified, schema 1 TwoDoorsProof cases', () => {
  const html = `<section><h2>Case studies</h2>
    <article class="gs-case-study" data-verified="true"><h3>Four hours a week back</h3><p>A 60-person agency logged time by hand.</p><p>We set up an agent team over eight weeks.</p><p>Four hours back per person each week, measured over a quarter.</p><img src="/media/a.webp" alt="A desk"></article>
    <article class="gs-case-study"><h3>Not yet confirmed</h3><p>Draft.</p><p>Draft.</p><p>Draft result.</p></article>
    <article class="gs-case-study" data-verified="true"><h3>Single paragraph</h3><p>Only the result.</p></article>
    <article class="gs-case-study" data-verified="true"><h3>No result</h3></article>
    <article class="other"><h3>Not a case</h3><p>x</p></article></section>`;
  const release = { releaseSchema: 2, media: {}, pages: [{ path: '/proof', html }] };
  assert.deepEqual(verifiedCaseStudies(release), [
    { headline: 'Four hours a week back', problem: 'A 60-person agency logged time by hand.', work: 'We set up an agent team over eight weeks.',
      result: 'Four hours back per person each week, measured over a quarter.', image: '/media/a.webp', imageAlt: 'A desk', verified: true },
    { headline: 'Single paragraph', problem: '', work: '', result: 'Only the result.', image: '', imageAlt: '', verified: true },
  ]);
  const verified = { headline: 'H', problem: 'P', work: 'W', result: 'R', verified: true };
  const puck = { pages: [{ path: '/case-studies', data: { content: [
    { type: 'Hero', props: {} },
    { type: 'TwoDoorsProof', props: { cases: [verified, { headline: 'Draft', result: 'R', verified: false }, { headline: 'No result', verified: true }] } },
  ] } }] };
  assert.deepEqual(verifiedCaseStudies(puck), [verified]);
  assert.deepEqual(verifiedCaseStudies({ pages: [{ path: '/about', html: '<p>x</p>' }] }), []);
  assert.deepEqual(verifiedCaseStudies({ pages: [{ path: '/proof', html: '' }] }), []);
});

test('the case-studies island is registered for GSAM pages and takes data-copy only', () => {
  assert.equal(ISLANDS['case-studies'].component, 'CaseStudies');
  assert.deepEqual(islandProps('case-studies', [['data-copy', '{"showPlaceholders":false}']]).props, { copy: '{"showPlaceholders":false}' });
  const removed = [];
  assert.deepEqual(islandProps('case-studies', [['data-cases', '[]']], removed).props, {});
  assert.equal(removed.length, 1);
});
