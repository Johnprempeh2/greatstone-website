import assert from 'node:assert/strict';
import test from 'node:test';
import release from './data/release.json' with { type: 'json' };
import { LEGAL_REPLACEMENTS, LEGAL_UPDATED, applyLegalWording } from './legal-wording.mjs';

const text = (page) => page.data.content.map((block) => block.props.body || '').join('\n');
const page = (path) => release.pages.find((entry) => entry.path === path);

test('GRE-3831: the Next release carries the GRE-1980 revision 2 privacy wording', () => {
  const body = text(page('/privacy'));
  assert.equal(page('/privacy').data.content[0].props.body, LEGAL_UPDATED);
  assert.match(body, /<strong>When you browse\.<\/strong>[^]*We never send your name or email to Google Analytics\. Google Tag Manager and Google Analytics do not load until you accept analytics cookies\. If you do not accept, we do not set analytics cookies\.<br><br>/);
  assert.ok(body.includes('<strong>Google</strong> runs Tag Manager and Analytics. They do not load until you accept analytics cookies.<br><br>'));
});

test('GRE-3831: the Next release carries the GRE-1980 revision 2 cookie wording', () => {
  const content = page('/cookies').data.content;
  assert.equal(content[0].props.body, LEGAL_UPDATED);
  assert.ok(content[4].props.body.includes('If you decline, or later change your mind in <strong>Cookie settings</strong>, we remove Greatstone’s optional browser storage. Google’s analytics cookies may remain until you clear them in your browser settings.<br>'));
  assert.ok(content[4].props.body.endsWith('<br><br>Google Tag Manager and Google Analytics do not load until you accept analytics cookies. If you accept and later decline in Cookie settings, we withdraw permission for analytics cookies straight away. Google Tag Manager remains loaded until you reload the page; it will not load again unless you accept.'));
  assert.ok(content[6].props.body.includes('<a href="/privacy">Privacy policy</a>'));
});

test('GRE-3831: no old consent sentence, old date or #go/ link is left on either page', () => {
  for (const path of ['/privacy', '/cookies']) {
    const body = JSON.stringify(page(path).data);
    assert.ok(!body.includes('basic signals'), path);
    assert.ok(!body.includes('we remove the ones we set'), path);
    assert.ok(!body.includes('6 October 2026'), path);
    assert.ok(!body.includes('#go/'), path);
  }
});

test('GRE-3831: the swap changes only the listed sentences and fails loudly if one is missing', () => {
  const before = { pages: [{ path: '/cookies', data: { content: [{ props: { body: LEGAL_REPLACEMENTS['/cookies'].map(([from]) => from).join(' | ') } }] } }, { path: '/terms', data: { x: 'Last updated 6 October 2026.' } }] };
  const after = applyLegalWording(before);
  assert.equal(after.pages[0].data.content[0].props.body, LEGAL_REPLACEMENTS['/cookies'].map(([, to]) => to).join(' | '));
  assert.deepEqual(after.pages[1], before.pages[1]);
  assert.throws(() => applyLegalWording(after), /expected one/);
});
