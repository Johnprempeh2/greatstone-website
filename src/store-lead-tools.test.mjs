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
    assert.deepEqual(next.pages['dx-consultancy'].data.content.map((b) => b.type), ['DxConsultancyMethod', 'AiBaselineSurvey', 'AiCostCalculator']);
    assert.deepEqual(next.pages['dx-consultancy'].published.content.map((b) => b.type), ['DxConsultancyMethod', 'AiBaselineSurvey', 'AiCostCalculator']);
    assert.equal(load().pages['dx-consultancy'].data.content.length, 3);
  } finally {
    await vite.close();
    globalThis.localStorage = previous.localStorage;
    globalThis.window = previous.window;
    globalThis.document = previous.document;
  }
});

test('method migration preserves both existing tool anchors and editor content', async () => {
  const dom = new Window({ url: 'http://localhost/' });
  const previous = { localStorage: globalThis.localStorage, window: globalThis.window, document: globalThis.document };
  globalThis.localStorage = dom.localStorage;
  globalThis.window = dom;
  globalThis.document = dom.document;
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { seedState, load } = await vite.ssrLoadModule('/src/store.js');
    const saved = seedState();
    saved._dxConsultancyMethodPlaced = false;
    for (const projection of ['data', 'published']) {
      saved.pages['dx-consultancy'][projection] = structuredClone(saved.pages['dx-consultancy'][projection]);
      const blocks = saved.pages['dx-consultancy'][projection].content;
      blocks.shift();
      blocks[0].props.headingLevel = 'h1';
      blocks[0].props.heading = 'Saved tool heading';
    }
    dom.localStorage.setItem('gs-studio', JSON.stringify(saved));
    const page = load().pages['dx-consultancy'];
    for (const projection of ['data', 'published']) {
      const blocks = page[projection].content;
      assert.deepEqual(blocks.map((block) => block.type), ['DxConsultancyMethod', 'AiBaselineSurvey', 'AiCostCalculator']);
      assert.equal(blocks[1].props.anchorId, 'ai-readiness');
      assert.equal(blocks[1].props.headingLevel, 'h2');
      assert.equal(blocks[1].props.heading, 'Saved tool heading');
      assert.equal(blocks[2].props.anchorId, 'ai-cost-calculator');
    }
    assert.equal(load().pages['dx-consultancy'].data.content.length, 3);
  } finally {
    await vite.close();
    globalThis.localStorage = previous.localStorage;
    globalThis.window = previous.window;
    globalThis.document = previous.document;
  }
});

test('saved How We Work pages adopt the four-step method and keep a recovery version', async () => {
  const dom = new Window({ url: 'http://localhost/' });
  const previous = { localStorage: globalThis.localStorage, window: globalThis.window, document: globalThis.document };
  globalThis.localStorage = dom.localStorage;
  globalThis.window = dom;
  globalThis.document = dom.document;
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { seedState, load } = await vite.ssrLoadModule('/src/store.js');
    const saved = seedState();
    saved._howWeWorkFourSteps = false;
    for (const projection of ['data', 'published']) saved.pages.method[projection].content = [{ type: 'Steps', props: { items: Array(6).fill({ title: 'Old step' }) } }];
    dom.localStorage.setItem('gs-studio', JSON.stringify(saved));
    const page = load().pages.method;
    assert.deepEqual(page.data.content.map((block) => block.type), ['DxConsultancyMethod']);
    assert.deepEqual(page.published.content.map((block) => block.type), ['DxConsultancyMethod']);
    assert.ok(page.versions.some((version) => version.label === 'Before four-step method'));
    assert.equal(load().pages.method.versions.length, page.versions.length);
  } finally {
    await vite.close();
    globalThis.localStorage = previous.localStorage;
    globalThis.window = previous.window;
    globalThis.document = previous.document;
  }
});

test('missing home story and proof are inserted after the doors in both projections', async () => {
  const dom = new Window({ url: 'http://localhost/' });
  const previous = { localStorage: globalThis.localStorage, window: globalThis.window, document: globalThis.document };
  globalThis.localStorage = dom.localStorage;
  globalThis.window = dom;
  globalThis.document = dom.document;
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
  try {
    const { seedState, load } = await vite.ssrLoadModule('/src/store.js');
    const saved = seedState();
    saved._homeRoutesAndPlaceholders = false;
    for (const projection of ['data', 'published']) {
      saved.pages.home[projection] = structuredClone(saved.pages.home[projection]);
      saved.pages.home[projection].content = saved.pages.home[projection].content.filter((block) => !['TwoDoorsStory', 'TwoDoorsProof'].includes(block.type));
    }
    dom.localStorage.setItem('gs-studio', JSON.stringify(saved));
    const home = load().pages.home;
    for (const projection of ['data', 'published']) {
      assert.deepEqual(home[projection].content.slice(0, 4).map((block) => block.type), ['TwoDoors', 'TwoDoorsStory', 'TwoDoorsProof', 'TwoDoorsTools']);
      assert.equal(home[projection].content.at(-1).type, 'TwoDoorsBottom');
    }
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
    saved._homeRoutesAndPlaceholders = false;
    for (const projection of ['data', 'published']) {
      const blocks = saved.pages.home[projection].content;
      blocks[0].props.heading = 'Keep this hero';
      blocks.find((block) => block.type === 'TwoDoorsStory').props.storyHeading = 'Making change work.';
      blocks.find((block) => block.type === 'TwoDoorsProof').props.proofHeading = 'What changed for our clients';
    }
    dom.localStorage.setItem('gs-studio', JSON.stringify(saved));
    const next = load().pages.home;
    for (const projection of ['data', 'published']) {
      const blocks = next[projection].content;
      assert.equal(blocks[0].props.heading, 'Keep this hero');
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

test('saved home moves appended story blocks below the doors without changing editor copy', async () => {
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
    saved._homeRoutesAndPlaceholders = true;
    for (const projection of ['data', 'published']) {
      const blocks = saved.pages.home[projection].content;
      blocks.push(blocks.splice(1, 1)[0], blocks.splice(1, 1)[0]);
      blocks.at(-2).props.storyHeading = `${projection} editor story`;
      blocks.at(-1).props.proofHeading = `${projection} editor proof`;
    }
    dom.localStorage.setItem('gs-studio', JSON.stringify(saved));
    const next = load().pages.home;
    for (const projection of ['data', 'published']) {
      const blocks = next[projection].content;
      assert.deepEqual(blocks.slice(0, 3).map((block) => block.type), ['TwoDoors', 'TwoDoorsStory', 'TwoDoorsProof']);
      assert.equal(blocks[1].props.storyHeading, `${projection} editor story`);
      assert.equal(blocks[2].props.proofHeading, `${projection} editor proof`);
      assert.equal(blocks.at(-1).type, 'TwoDoorsBottom');
    }
  } finally {
    await vite.close();
    globalThis.localStorage = previous.localStorage;
    globalThis.window = previous.window;
    globalThis.document = previous.document;
  }
});
