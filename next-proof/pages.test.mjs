import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pages = JSON.parse(await readFile(process.env.PROOF_PAGES_PATH || new URL('./data/pages.json', import.meta.url), 'utf8')).pages;

test('the proof uses published Puck pages with complete SEO and stable block identities', () => {
  for (const slug of ['home', 'dev-tools']) {
    const page = pages[slug];
    assert.ok(page.seo.title && page.seo.description, `${slug} SEO metadata`);
    assert.ok(page.data.content.length, `${slug} blocks`);
    assert.equal(new Set(page.data.content.map((block) => block.props.id)).size, page.data.content.length, `${slug} unique block IDs`);
  }
  assert.deepEqual(pages.home.data.content.map((block) => block.type), ['TwoDoors', 'TwoDoorsStory', 'TwoDoorsProof', 'TwoDoorsTools']);
  assert.deepEqual(pages['dev-tools'].data.content.map((block) => block.type), ['DevTools']);
});
