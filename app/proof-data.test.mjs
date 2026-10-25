import test from 'node:test';
import assert from 'node:assert/strict';
import { insightBriefings } from './insight-briefings.mjs';

test('Insights lists only released article pages with working article paths', () => {
  const release = { pages: [
    { id: 'index', path: '/insights', seo: { description: 'Index' } },
    { id: 'first', path: '/insights/first-briefing', title: 'First briefing', seo: { description: 'First summary' }, data: { content: ['large article body'] } },
    { id: 'second', path: '/insights/second-briefing', title: 'Second briefing', seo: { description: 'Second summary' } },
    { id: 'nested', path: '/insights/archive/older', seo: { description: 'Older' } },
    { id: 'other', path: '/about', seo: { description: 'About' } },
  ] };
  assert.deepEqual(insightBriefings(release), [
    { id: 'first', path: '/insights/first-briefing', title: 'First briefing', description: 'First summary' },
    { id: 'second', path: '/insights/second-briefing', title: 'Second briefing', description: 'Second summary' },
  ]);
});
