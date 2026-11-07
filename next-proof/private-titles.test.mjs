import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Next cutover gap 5: the signed-in pages keep the tab titles the Vite site gave them.
const titles = { account: 'Your account', org: 'Your organisation', portal: 'Client portal', catalogue: 'Catalogue admin',
  'order-confirmed': 'Order confirmed', invoice: 'Invoice', join: 'Join the conversation', 'privacy/interviews': 'Interview privacy notice' };

test('every signed-in page sets its Vite title with the site suffix', () => {
  for (const [dir, title] of Object.entries(titles)) {
    const file = dir === 'privacy/interviews' ? 'page.jsx' : 'layout.jsx';
    const source = readFileSync(new URL(`../app/(private)/${dir}/${file}`, import.meta.url), 'utf8');
    assert.match(source, new RegExp(`title: '${title} · Greatstone International'`), dir);
  }
});
