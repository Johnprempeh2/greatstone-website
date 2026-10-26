import test from 'node:test';
import assert from 'node:assert/strict';
import { publicLinkProps, publicPathText } from './public-links.mjs';

test('published structured page links use real paths without changing editor data', () => {
  const props = { links: [{ href: { kind: 'page', page: 'contact' } }, { href: { kind: 'page', page: 'ai-market-intelligence' } }] };
  assert.deepEqual(publicLinkProps(props, ['/contact', '/insights']), { links: [{ href: '/contact' }, { href: '/insights' }] });
  assert.equal(props.links[0].href.kind, 'page');
});

test('legacy targets in saved links and rich text become published paths', () => {
  const paths = ['/dx-consultancy', '/privacy', '/insights'];
  assert.equal(publicPathText('#go/dx-consultancy/ai-readiness', paths), '/dx-consultancy#ai-readiness');
  assert.equal(publicPathText('See <a href="#go/privacy">Privacy</a>.', paths), 'See <a href="/privacy">Privacy</a>.');
  assert.equal(publicPathText('#go/ai-market-intelligence', paths), '/insights');
  assert.equal(publicPathText('#go/missing', paths), '#go/missing');
});
