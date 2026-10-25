import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createServer } from 'vite';

test('tool placement preserves saved home draft and published projections', async () => {
  const dom = new Window({ url: 'http://localhost/' });
  const previous = { localStorage: globalThis.localStorage, window: globalThis.window, document: globalThis.document };
  globalThis.localStorage = dom.localStorage;
  globalThis.window = dom;
  globalThis.document = dom.document;
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { seedState, load } = await vite.ssrLoadModule('/src/store.js');
    const saved = seedState();
    delete saved.pages['dx-consultancy'];
    saved._aiLeadToolsPlaced = false;
    saved.pages.home.data = structuredClone(saved.pages.home.data);
    saved.pages.home.published = structuredClone(saved.pages.home.published);
    saved.pages.home.data.root.props.title = 'Saved draft';
    saved.pages.home.published.root.props.title = 'Published home';
    saved.pages.home.data.content[0].props.contactHref = '#contact';
    saved.pages.home.published.content[0].props.contactHref = '#contact';
    dom.localStorage.setItem('gs-studio', JSON.stringify(saved));
    const next = load();
    assert.equal(next.pages.home.data.root.props.title, 'Saved draft');
    assert.equal(next.pages.home.published.root.props.title, 'Published home');
    assert.equal(next.pages.home.data.content[0].props.contactHref, '/contact');
    assert.equal(next.pages.home.published.content[0].props.contactHref, '/contact');
    assert.equal(next.pages.home.data.content.find((b) => b.type === 'TwoDoorsBottom').props.consultancyHref, '/dx-consultancy');
    assert.equal(next.pages.home.published.content.find((b) => b.type === 'TwoDoorsBottom').props.consultancyHref, '/dx-consultancy');
    assert.equal(next.pages['dx-consultancy'].orgId, 'org-greatstone');
    assert.deepEqual(next.pages['dx-consultancy'].data.content.map((b) => b.type), ['AiBaselineSurvey', 'AiCostCalculator']);
    assert.deepEqual(next.pages['dx-consultancy'].published.content.map((b) => b.type), ['AiBaselineSurvey', 'AiCostCalculator']);
    assert.equal(load().pages['dx-consultancy'].data.content.length, 2);
  } finally {
    await vite.close();
    globalThis.localStorage = previous.localStorage;
    globalThis.window = previous.window;
    globalThis.document = previous.document;
  }
});

test('review correction restores the enquiry CTA on already placed pages', async () => {
  const dom = new Window({ url: 'http://localhost/' });
  const previous = { localStorage: globalThis.localStorage, window: globalThis.window, document: globalThis.document };
  globalThis.localStorage = dom.localStorage;
  globalThis.window = dom;
  globalThis.document = dom.document;
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { seedState, load } = await vite.ssrLoadModule('/src/store.js');
    const saved = seedState();
    saved._aiLeadToolsPlaced = true;
    saved.pages.home.data = structuredClone(saved.pages.home.data);
    saved.pages.home.published = structuredClone(saved.pages.home.published);
    saved.pages.home.data.content[0].props.contactHref = '#go/dx-consultancy';
    saved.pages.home.published.content[0].props.contactHref = '#go/dx-consultancy';
    for (const data of [saved.pages.home.data, saved.pages.home.published]) {
      data.content.find((b) => b.type === 'TwoDoorsClose').props.contactHref = '#contact';
      data.content.find((b) => b.type === 'TwoDoorsBottom').props.consultancyHref = '#go/dx-consultancy';
    }
    dom.localStorage.setItem('gs-studio', JSON.stringify(saved));
    const next = load();
    assert.equal(next.pages.home.data.content[0].props.contactHref, '/contact');
    assert.equal(next.pages.home.published.content[0].props.contactHref, '/contact');
    assert.equal(next.pages.home.data.content.find((b) => b.type === 'TwoDoorsBottom').props.consultancyHref, '/dx-consultancy');
    assert.equal(next.pages.home.published.content.find((b) => b.type === 'TwoDoorsBottom').props.consultancyHref, '/dx-consultancy');
    assert.equal(next.pages.home.data.content.find((b) => b.type === 'TwoDoorsClose').props.contactHref, '/contact');
    assert.equal(next.pages.home.published.content.find((b) => b.type === 'TwoDoorsClose').props.contactHref, '/contact');
  } finally {
    await vite.close();
    globalThis.localStorage = previous.localStorage;
    globalThis.window = previous.window;
    globalThis.document = previous.document;
  }
});

test('saved home receives route explanations and placeholders without changing the doors', async () => {
  const dom = new Window({ url: 'http://localhost/' });
  const previous = { localStorage: globalThis.localStorage, window: globalThis.window, document: globalThis.document };
  globalThis.localStorage = dom.localStorage;
  globalThis.window = dom;
  globalThis.document = dom.document;
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
  try {
    const { seedState, load } = await vite.ssrLoadModule('/src/store.js');
    const saved = seedState();
    saved.pages.home.data = structuredClone(saved.pages.home.data);
    saved.pages.home.published = structuredClone(saved.pages.home.published);
    saved._homeRoutesAndPlaceholders = false;
    for (const projection of ['data', 'published']) {
      const blocks = saved.pages.home[projection].content;
      blocks[0].props.heading = 'Keep this hero';
      blocks.find((block) => block.type === 'TwoDoorsStory').props.storyHeading = 'Making change work.';
      blocks.find((block) => block.type === 'TwoDoorsStory').props.storyBody = 'Editor narrative';
      blocks.find((block) => block.type === 'TwoDoorsProof').props.proofHeading = 'What changed for our clients';
      blocks.find((block) => block.type === 'TwoDoorsProof').props.draftCaseLine = 'Editor case note';
    }
    dom.localStorage.setItem('gs-studio', JSON.stringify(saved));
    const next = load().pages.home;
    for (const projection of ['data', 'published']) {
      const blocks = next[projection].content;
      assert.equal(blocks[0].props.heading, 'Keep this hero');
      assert.equal(blocks.find((block) => block.type === 'TwoDoorsStory').props.storyBody, 'Editor narrative');
      assert.equal(blocks.find((block) => block.type === 'TwoDoorsProof').props.draftCaseLine, 'Editor case note');
      assert.deepEqual(blocks.find((block) => block.type === 'TwoDoorsStory').props.range.map((item) => item.href), ['#go/dx-consultancy', '#go/dev-tools']);
      assert.equal(blocks.find((block) => block.type === 'TwoDoorsProof').props.draftItems.length, 3);
    }
  } finally {
    await vite.close();
    globalThis.localStorage = previous.localStorage;
    globalThis.window = previous.window;
    globalThis.document = previous.document;
  }
});

test('saved home places missing and previously appended story blocks below the doors', async () => {
  const dom = new Window({ url: 'http://localhost/' });
  const previous = { localStorage: globalThis.localStorage, window: globalThis.window, document: globalThis.document };
  globalThis.localStorage = dom.localStorage;
  globalThis.window = dom;
  globalThis.document = dom.document;
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
  try {
    const { seedState, load } = await vite.ssrLoadModule('/src/store.js');
    const saved = seedState();
    saved.pages.home.data = structuredClone(saved.pages.home.data);
    saved.pages.home.published = structuredClone(saved.pages.home.published);
    saved._homeRoutesAndPlaceholders = false;
    saved.pages.home.data.content = saved.pages.home.data.content.filter((block) => block.type !== 'TwoDoorsStory');
    saved.pages.home.published.content = saved.pages.home.published.content.filter((block) => block.type !== 'TwoDoorsProof');
    saved.pages.home.data.content.find((block) => block.type === 'TwoDoorsProof').props.proofHeading = 'Editor proof';
    saved.pages.home.published.content.find((block) => block.type === 'TwoDoorsStory').props.storyHeading = 'Editor story';
    dom.localStorage.setItem('gs-studio', JSON.stringify(saved));
    const placed = load().pages.home;
    for (const projection of ['data', 'published']) {
      assert.deepEqual(placed[projection].content.slice(0, 3).map((block) => block.type), ['TwoDoors', 'TwoDoorsStory', 'TwoDoorsProof']);
      assert.equal(placed[projection].content.at(-1).type, 'TwoDoorsBottom');
    }
    assert.equal(placed.data.content[2].props.proofHeading, 'Editor proof');
    assert.equal(placed.published.content[1].props.storyHeading, 'Editor story');

    const appended = seedState();
    appended.pages.home.data = structuredClone(appended.pages.home.data);
    appended.pages.home.published = structuredClone(appended.pages.home.published);
    appended._homeRoutesAndPlaceholders = true;
    for (const projection of ['data', 'published']) {
      const blocks = appended.pages.home[projection].content;
      blocks.push(blocks.splice(1, 1)[0], blocks.splice(1, 1)[0]);
      blocks.at(-2).props.storyHeading = `${projection} editor story`;
      blocks.at(-1).props.proofHeading = `${projection} editor proof`;
    }
    dom.localStorage.setItem('gs-studio', JSON.stringify(appended));
    const repaired = load().pages.home;
    for (const projection of ['data', 'published']) {
      const blocks = repaired[projection].content;
      assert.deepEqual(blocks.slice(0, 3).map((block) => block.type), ['TwoDoors', 'TwoDoorsStory', 'TwoDoorsProof']);
      assert.equal(blocks[1].props.storyHeading, `${projection} editor story`);
      assert.equal(blocks[2].props.proofHeading, `${projection} editor proof`);
    }
  } finally {
    await vite.close();
    globalThis.localStorage = previous.localStorage;
    globalThis.window = previous.window;
    globalThis.document = previous.document;
  }
});
