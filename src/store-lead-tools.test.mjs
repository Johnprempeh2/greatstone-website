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
    assert.equal(next.pages.home.data.content[0].props.contactHref, '#go/dx-consultancy');
    assert.equal(next.pages.home.published.content[0].props.contactHref, '#go/dx-consultancy');
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
