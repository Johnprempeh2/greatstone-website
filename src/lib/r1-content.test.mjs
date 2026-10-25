// GRE-659: the Release 1 seed carries the approved copy and none of what plan GRE-638 §3-§4 keeps off launch
// pages. store.js imports JSX (puck.config.jsx), which bare node cannot load, so this reads its source and the
// seed JSON as text. The real-browser render of the same pages is in the PR's screenshots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { legalLaunchGaps, ICO_REGISTRATION_NUMBER, LEGAL_CONTACT_EMAIL, LEGAL_NAME } from './legal-facts.mjs';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const STORE = read('../store.js');
const SEED_TEXT = read('../seed-pages.json');
const SEED = JSON.parse(SEED_TEXT);
const R1 = ['services', 'proof', 'about', 'how-we-help'];
const page = (slug) => SEED.find((p) => p.slug === slug);

// every { ...Label, ...Href } pair with a visible label, wherever it sits in a block's props
function ctas(node, out = []) {
  if (Array.isArray(node)) node.forEach((n) => ctas(n, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      const m = k.match(/^(cta|book)Label(2?)$/);
      if (m && typeof v === 'string' && v.trim()) out.push({ label: v, href: node[m[1] + 'Href' + m[2]] });
      else ctas(v, out);
    }
  }
  return out;
}

test('SEED_VERSION is bumped past the last content release', () => {
  const v = Number((STORE.match(/const SEED_VERSION = (\d+);/) || [])[1]);
  assert.ok(v >= 20261006, String(v));
});

test('no visible CTA on a seed page points at "#"', () => {
  for (const p of SEED) {
    for (const c of ctas(p.blocks)) assert.notEqual(c.href, '#', `${p.slug}: "${c.label}"`);
  }
  // store.js seeds (home, method, contact, legal): a labelled ctaHref: '#' would be a dead button
  assert.doesNotMatch(STORE, /ctaLabel2?: '[^']+', ctaHref2?: '#'/);
});

test('no FrontDoor block and no "first three employees" on any R1 page', () => {
  for (const p of SEED) for (const b of p.blocks) assert.notEqual(b.type, 'FrontDoor', p.slug);
  assert.doesNotMatch(STORE, /blk\('FrontDoor'/);
  assert.doesNotMatch(SEED_TEXT + STORE, /first three employees/i);
});

test('the unverified claims (C10 to C19, C21, C22, C26) are off the R1 pages', () => {
  const r1Text = JSON.stringify(R1.map(page)) + STORE.slice(STORE.indexOf('export function seedState'), STORE.indexOf('function productsPage'));
  for (const gone of [/3\.4×/, /12 hrs/i, /3\.5 months/, /90% adoption/i, /national real-estate group/i, /benchmark against your peers/i,
    /transformation partner, not a software house/i, /weeks, not quarters/i, /Illustrative targets/i]) {
    assert.doesNotMatch(r1Text, gone, String(gone));
  }
  for (const t of ['StatStrip', 'CaseStudy', 'RoiBar', 'Quote', 'TimeSavingsCalculator', 'ComparisonMatrix']) {
    for (const s of ['services', 'proof']) assert.ok(!page(s).blocks.some((b) => b.type === t), `${s} has ${t}`);
  }
});

test('Home and Service state the agreed position (plan GRE-638 §5 acceptance test)', () => {
  assert.match(STORE, /practical digital transformation and AI-enabled automation/);
  assert.match(JSON.stringify(page('services')), /a digital office/);
  assert.equal(page('services').title, 'GS Agentic Manager');
});

// GRE-660 / GRE-1373: the copy follows the GRE-1358 offer journey and packaging v9, not the superseded GRE-652 offer
test('no superseded offer, size tier, AI-route promise or "run it for you" on the seeded pages', () => {
  const site = SEED_TEXT + STORE.slice(STORE.indexOf('export function seedState'), STORE.indexOf('function productsPage')).replace(/^\s*\/\/.*$/gm, '') + read('../../index.html');
  for (const gone of [/Manage Plus/, /Managed Automation/, /managed service/i, /run(s|ning)? it for you/i, /run for you/i, /size of your organisation/i,
    /pay (them|the AI providers) directly/i, /resell AI model usage/i, /accounts you own/i, /\bDiagnostic\b/, /\bGITA\b/, /\bGDXP\b/, /Explore Managed/]) {
    assert.doesNotMatch(site, gone, String(gone));
  }
});

test('How We Work and the service page tell the six-step journey; their CTAs open the enquiry with the package chosen', () => {
  const method = STORE.slice(STORE.indexOf("method: seedPage("), STORE.indexOf("contact: seedPage("));
  const titles = [...method.matchAll(/\{ title: '([^']+)', text:/g)].map((m) => m[1]);
  assert.deepEqual(titles, ['Executive Discovery', 'Initial assessment', 'Agreement', 'Deep Dive', 'Actionable blueprint', 'Digital office, where it fits']);
  const svc = ctas(page('services').blocks).filter((c) => c.label === 'Ask about GS Agentic Manager');
  assert.equal(svc.length, 2);
  for (const c of svc) assert.equal(c.href, '#enquire/gs-agentic-manager');
  assert.match(STORE, /interests: INTEREST_OPTIONS\.map/);
});

test('the legal pages are published with the approved facts, and no drafting marker is left', () => {
  const legal = STORE.slice(STORE.indexOf('export const LEGAL_SCAFFOLDS'), STORE.indexOf('function buildLegalPage'));
  for (const slug of ['privacy', 'cookies', 'terms']) assert.match(legal, new RegExp(`slug: '${slug}', title: '[^']+', publish: true`), slug);
  assert.doesNotMatch(legal.slice(0, legal.indexOf("slug: 'refunds'")), /\[GAP|\[IF |Draft placeholder|\[publish date\]/);
  assert.match(legal, /title: 'Website terms of use'/);
  assert.equal(LEGAL_NAME, 'Greatstone International Limited');
  assert.equal(LEGAL_CONTACT_EMAIL, 'dx@greatstonesoftware.co.uk');
  assert.doesNotMatch(SEED_TEXT + STORE, /Greatstone Software Ltd/);
});

test('the Cookie page lists every storage entry the browser check found (GRE-968, legal doc v3)', () => {
  const cookies = STORE.slice(STORE.indexOf("slug: 'cookies'"), STORE.indexOf("slug: 'terms'"));
  for (const key of ['gs-studio', 'gs-consent', 'gs_service_inquiry_v1', 'gs-studio-session', 'sb-…-auth-token',
    '_ga', 'gs-attr-first, gs-attr-last', 'gs-intel-profile', 'gs_service_pop_v1', 'gs_service_pop_seen_v1']) {
    assert.ok(cookies.includes('<strong>' + key + '</strong>'), key);
  }
  assert.match(cookies, /h: 'Analytics and preference cookies \(only if you accept\)'/);
  assert.match(cookies, /If you decline, or later change your mind in <strong>Cookie settings<\/strong>, we remove the ones we set\./);
});

test('launch:check fails until the ICO number is set, then passes', () => {
  if (!ICO_REGISTRATION_NUMBER) assert.equal(legalLaunchGaps().length, 1);
  assert.deepEqual(legalLaunchGaps({ ico: 'ZA123456' }), []);
  assert.deepEqual(legalLaunchGaps({ ico: 'Z1234567' }), []);
  assert.equal(legalLaunchGaps({ ico: '[GAP 4]' }).length, 1);
});

test('Two Doors navigation follows the approved six-page order and keeps service routes in its dropdown', () => {
  const nav = STORE.slice(STORE.indexOf('export function DEFAULT_NAVIGATION'), STORE.indexOf('const blk ='));
  const slugs = [...nav.matchAll(/pageSlug: '([\w-]+)'/g)].map((m) => m[1]);
  assert.deepEqual(slugs, ['dx-consultancy', 'dev-tools', 'services', 'method', 'how-we-help', 'case-studies', 'about', 'insights']);
  assert.match(nav, /pageSlug: 'dx-consultancy', label: 'DX Consultancy'/);
  assert.match(nav, /pageSlug: 'dev-tools', label: 'DX Dev Tools'/);
  assert.match(nav, /label: 'Transformation Services', children:/);
  assert.match(nav, /pageSlug: 'case-studies', label: 'Case Studies'/);
  assert.match(nav, /pageSlug: 'about', label: 'About'/);
  assert.match(nav, /pageSlug: 'services', label: 'GS Agentic Manager'/);
  assert.doesNotMatch(nav, /label: 'Sign in', href: '#portal'/);
});

test('store-only customers can reach orders from the portal and the account button stays active', () => {
  const portal = read('../portal/Portal.jsx');
  const noClient = portal.slice(portal.indexOf("if (!isCustomer(profile))"), portal.indexOf("if (route.view === 'deep-dive')"));
  assert.match(noClient, /<a href="#account">Your account and orders/);
  const app = read('../App.jsx');
  assert.match(app, /accountActive=\{!!\(portalRoute \|\| accountRoute\)\}/);
});

// GRE-970: the contact form carries GRE-652 §4.6, reconciled with GRE-1358 (interest choice kept, size band is
// qualification only), and no reply-time promise until decision D6 (claim C23).
test('the contact enquiry form follows GRE-652 §4.6 and makes no reply-time promise', () => {
  const contact = STORE.slice(STORE.indexOf('contact: seedPage('), STORE.indexOf('// fold in the rest of the site'));
  for (const s of ["nameLabel: 'Your name (required)'", "emailLabel: 'Work email (required)'", "companyLabel: 'Organisation'",
    "sizeLabel: 'How many people work there?'", 'sizes: SIZE_BANDS.map', 'showSector: false', "submitLabel: 'Send enquiry'",
    "messageLabel: 'Which work would you most like to get time back from?'",
    "messagePlaceholder: 'For example: weekly reporting, proposals, social content, research'",
    'consent: CONSENT', "sentHeading: 'Thank you. Your enquiry has reached us.'", "failedHeading: 'Your message did not reach us.'",
    "sentLinkHref: '#go/method'", 'interests: INTEREST_OPTIONS.map']) {
    assert.ok(contact.includes(s), s);
  }
  const code = contact.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /working day|within (one|a|24)|hours?\b.*reply/i, 'D6 is open');
  assert.doesNotMatch(read('../blocks/BookDeepDive.jsx').replace(/^\s*\/\/.*$/gm, ''), /working day/i, 'D6 is open');
});
