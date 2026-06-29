import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInquirySubject, buildInquiryBody, buildInquiryMailto } from './inquiry-email.mjs';

const one = [{ slug: 'a', name: 'Business website build', category: 'Web' }];
const many = [
  { slug: 'a', name: 'Business website build', category: 'Web' },
  { slug: 'b', name: 'Brand refresh', category: '' },
];

test('subject reflects 1 vs N services', () => {
  assert.equal(buildInquirySubject(one), 'Service inquiry · Business website build');
  assert.equal(buildInquirySubject(many), 'Services inquiry · 2 services');
});

test('body uses a numbered list with (category), never a dash', () => {
  const body = buildInquiryBody(many, { name: 'Jane', company: 'Stonewell', email: 'jane@stonewell.co', message: 'Lots' });
  assert.match(body, /1\. Business website build \(Web\)/);
  assert.match(body, /2\. Brand refresh$/m); // empty category => no parens
  assert.match(body, /^Company: Stonewell$/m);
  assert.match(body, /^Name: Jane$/m);
  assert.match(body, /^Work email: jane@stonewell\.co$/m);
  assert.match(body, /What we are trying to solve:/);
  assert.match(body, /Lots/);
});

test('body omits empty contact lines', () => {
  const body = buildInquiryBody(one, {}); // no name/company/email/message
  assert.doesNotMatch(body, /^Company:/m);
  assert.doesNotMatch(body, /^Name:/m);
  assert.doesNotMatch(body, /^Work email:/m);
  assert.match(body, /About us:/); // header still present
});

test('mailto returns # for a blank or invalid target email', () => {
  assert.equal(buildInquiryMailto('', one), '#');
  assert.equal(buildInquiryMailto('not-an-email', one), '#');
  assert.equal(buildInquiryMailto('dx@greatstone.test', []), '#'); // no services
});

test('mailto returns an encoded mailto: for a valid target', () => {
  const href = buildInquiryMailto('dx@greatstone.test', one, { name: 'Jane' });
  assert.match(href, /^mailto:dx@greatstone\.test\?subject=/);
  assert.match(href, /&body=/);
  assert.match(decodeURIComponent(href.split('&body=')[1]), /Business website build/);
});

test('no em-dash or en-dash in subject or body (house style)', () => {
  const body = buildInquiryBody(many, { name: 'Jane', company: 'Stonewell', email: 'jane@stonewell.co', message: 'x' });
  const subj = buildInquirySubject(many);
  for (const out of [body, subj]) {
    assert.equal(out.includes('—'), false, 'em-dash present');
    assert.equal(out.includes('–'), false, 'en-dash present');
  }
});
