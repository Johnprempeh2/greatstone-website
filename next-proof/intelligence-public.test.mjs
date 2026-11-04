import test from 'node:test';
import assert from 'node:assert/strict';
import { publicIntelligence } from './intelligence-public.mjs';
import snapshot from './data/intelligence-snapshot.json' with { type: 'json' };

const boards = {
  boards: [
    { board: 'ai_systems', snapshotDate: '2026-11-04', comparedTo: '2026-10-28', entries: [
      { rank: 1, name: 'Alpha', maker: 'Alpha Labs', score: 100, url: 'https://alpha.example/pricing', domain: 'alpha.example', verdict: 'Holds first place.', movement: { rankDelta: 0, scoreDelta: 0, isNew: false } },
      { rank: 2, name: 'Beta', score: 90, url: 'javascript:alert(1)', verdict: 'GSAM uses this one.' },
    ] },
    { board: 'frontier_models', snapshotDate: '2026-11-04', entries: [
      { rank: 1, name: 'Gamma', score: 60, specs: { speed: 88.2, context: '1M', priceIn: 4, hle: null, secret: 'x' } },
    ] },
    { board: 'internal_board', snapshotDate: '2026-11-04', entries: [{ rank: 1, name: 'Hidden' }] },
  ],
};

const briefing = {
  reportDate: '2026-11-04', status: 'published', headline: 'Alpha ships a thing',
  sections: {
    news: [
      { headline: 'Alpha ships', url: 'https://alpha.example/news', sourceName: 'Alpha', tag: 'Models', date: '2026-11-03', lead: true,
        verdict: 'A real change.', points: ['One.', 'Greatstone should look at this.'], lens: 'Our lens.', take: 'Our take.', action: 'Ask Keystone to act.' },
      { headline: 'No link', url: 'http://plain.example' },
    ],
    radar: { movers: [{ name: 'Gamma', direction: 'up', note: 'Index 59 to 60.' }, { name: 'Delta', direction: 'sideways' }], emerging: [{ name: 'E' }] },
  },
};

test('keeps only public fields and drops internal text', () => {
  const out = publicIntelligence({ boards, briefing });
  assert.equal(out.date, '2026-11-04');
  assert.deepEqual(out.boards.map((view) => view.board), ['ai_systems', 'frontier_models']);
  const [alpha, beta] = out.boards[0].entries;
  assert.equal(alpha.url, 'https://alpha.example/pricing');
  assert.equal(beta.url, undefined, 'non-https links are dropped');
  assert.equal(beta.verdict, undefined, 'text naming GSAM is dropped');
  assert.deepEqual(out.boards[1].entries[0].specs, { speed: 88.2, context: '1M', priceIn: 4 });
  const [lead] = out.news;
  assert.equal(out.news.length, 1, 'news without an https link is dropped');
  assert.deepEqual(lead.points, ['One.']);
  for (const key of ['lens', 'take', 'action']) assert.equal(key in lead, false);
  assert.deepEqual(out.movers.map((item) => item.name), ['Gamma']);
  assert.equal('emerging' in out, false);
});

test('an unpublished briefing contributes nothing', () => {
  const out = publicIntelligence({ boards, briefing: { ...briefing, status: 'draft' } });
  assert.equal(out.headline, null);
  assert.deepEqual(out.news, []);
  assert.equal(out.boards.length, 2);
});

test('the committed snapshot is public-safe', () => {
  const raw = JSON.stringify(snapshot);
  assert.doesNotMatch(raw, /greatstone|gsam|lodestone|keystone|"lens"|"take"|"action"/i);
  assert.ok(snapshot.boards.length >= 1 && snapshot.news.length >= 1);
  assert.deepEqual(publicIntelligence({ boards: { boards: snapshot.boards.map((view) => ({ ...view, snapshotDate: view.date })) }, briefing: null }).boards, snapshot.boards);
});
