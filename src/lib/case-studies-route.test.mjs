import test from 'node:test';
import assert from 'node:assert/strict';
import { moveProofToCaseStudies } from './case-studies-route.mjs';
import { auditLinks, resolveRedirect } from './link-audit.mjs';

test('moves a saved Proof page and repoints draft, published and navigation links', () => {
  const state = {
    pages: {
      proof: { title: 'Proof', seo: { title: 'Proof · Greatstone International' }, data: { content: [] }, published: { content: [] } },
      home: {
        data: { content: [{ type: 'Chapter', props: { ctaLabel: 'Read', ctaHref: { kind: 'page', page: 'proof' }, proofHref: '/proof' } }] },
        published: { content: [{ type: 'Chapter', props: { ctaLabel: 'Read', ctaHref: '#go/proof' } }] },
      },
    },
    order: ['home', 'proof'],
    navigation: [{ type: 'page', pageSlug: 'proof', label: 'Proof' }],
    redirects: [],
  };
  moveProofToCaseStudies(state);
  assert.equal(state.pages.proof, undefined);
  assert.equal(state.pages['case-studies'].title, 'Case Studies');
  assert.deepEqual(state.order, ['home', 'case-studies']);
  assert.deepEqual(state.navigation, [{ type: 'page', pageSlug: 'case-studies', label: 'Case Studies' }]);
  assert.equal(state.pages.home.data.content[0].props.ctaHref.page, 'case-studies');
  assert.equal(state.pages.home.data.content[0].props.proofHref, '/case-studies');
  assert.equal(state.pages.home.published.content[0].props.ctaHref, '#go/case-studies');
  assert.equal(resolveRedirect(state, 'proof'), 'case-studies');
  assert.equal(auditLinks(state).broken, 0);
  const once = JSON.stringify(state);
  moveProofToCaseStudies(state);
  assert.equal(JSON.stringify(state), once);
});
