// Front door package (GRE-468): the Agent Companies package saved on each lead, and its .zip. `node --test`.
// The sample in docs/front-door-package-sample/ is this builder's output for SAMPLE; it is what Bedrock
// imports into a sandbox company. Regenerate: FRONT_DOOR_PACKAGE_SAMPLE=write node --test <this file>
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAgentPackage, slugify, packageFolder, PACKAGE_SCHEMA } from './front-door-package.mjs';
import { leadRow } from './front-door-leads.mjs';
import { zipFiles, crc32 } from '../../../src/lib/package-zip.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SAMPLE_DIR = join(here, '../../../docs/front-door-package-sample');

// Fictional business and names.
const intake = { industry: 'Property', company: 'Northwind Lettings', words: ['trusted', 'local', 'quick'], teamSize: '11-50' };
const agents = [
  { name: 'Kenji', role: 'Lettings coordinator who keeps every viewing on track', is_lead: false,
    personality: ['Organised', 'Quick', 'Friendly'],
    first_tasks: ['Confirm this week\'s viewings with tenants and landlords', 'Chase missing references', 'Log every enquiry the same day'],
    works_with: 'Hands each confirmed viewing to Sofia and sends the week\'s notes to Amara for a check.' },
  { name: 'Amara', role: 'Brand lead who checks every letter before it goes out', is_lead: true,
    personality: ['Trusted', 'Exacting', 'Warm'],
    first_tasks: ['Write the house style for tenant letters', 'Review Kenji\'s viewing notes', 'Check Sofia\'s listings'],
    works_with: 'Checks what Kenji and Sofia write before it reaches a tenant or landlord.' },
  { name: 'Sofia', role: 'Listings writer for new properties', is_lead: false,
    personality: ['Local', 'Clear', 'Quick'],
    first_tasks: ['Draft listings for three new properties', 'Refresh tired listings', 'Answer listing questions'],
    works_with: 'Takes viewing feedback from Kenji and sends each listing to Amara for sign-off.' },
];
const SAMPLE = { intake, agents };

// Frontmatter the way GS Agentic Manager's importer reads it: between "---\n" and "\n---\n", one
// `key: value` per line. Every value here must be strict JSON, which both YAML and that reader accept.
function parseDoc(md) {
  assert.ok(md.startsWith('---\n'), 'starts with a frontmatter fence');
  const close = md.indexOf('\n---\n', 4);
  assert.ok(close > 0, 'frontmatter closes');
  const fm = {};
  for (const l of md.slice(4, close).split('\n')) {
    const i = l.indexOf(':');
    assert.ok(i > 0 && /^[A-Za-z]+$/.test(l.slice(0, i)), 'plain key: ' + l);
    fm[l.slice(0, i)] = JSON.parse(l.slice(i + 1).trim());
  }
  return { fm, body: md.slice(close + 5).replace(/^\n/, '') };
}

test('COMPANY.md plus one AGENTS.md per employee, lead first', () => {
  const files = buildAgentPackage(SAMPLE);
  assert.deepEqual(Object.keys(files), ['COMPANY.md', 'agents/amara/AGENTS.md', 'agents/kenji/AGENTS.md', 'agents/sofia/AGENTS.md']);
  const { fm } = parseDoc(files['COMPANY.md']);
  assert.deepEqual(fm, { schema: PACKAGE_SCHEMA, kind: 'company', slug: 'northwind-lettings', name: 'Northwind Lettings', description: 'First three employees from the website front door.' });
  assert.equal(PACKAGE_SCHEMA, 'agentcompanies/v1-draft');
});

test('the lead reports to no one; the other two report to the lead', () => {
  const files = buildAgentPackage(SAMPLE);
  const lead = parseDoc(files['agents/amara/AGENTS.md']).fm;
  assert.deepEqual(lead, { name: 'Amara', title: 'Brand lead who checks every letter before it goes out', slug: 'amara', reportsTo: null });
  for (const s of ['kenji', 'sofia']) assert.equal(parseDoc(files['agents/' + s + '/AGENTS.md']).fm.reportsTo, 'amara');
});

test('each AGENTS.md body carries the card: personality, first tasks, works with', () => {
  const { body } = parseDoc(buildAgentPackage(SAMPLE)['agents/kenji/AGENTS.md']);
  assert.match(body, /^# Kenji\n/);
  assert.match(body, /Kenji is the lettings coordinator who keeps every viewing on track at Northwind Lettings\./);
  assert.match(body, /## Personality\n\n- Organised\n- Quick\n- Friendly/);
  assert.match(body, /## First tasks\n\n- Confirm this week's viewings/);
  assert.match(body, /## Works with the team\n\nHands each confirmed viewing to Sofia/);
});

test('visitor text cannot break the frontmatter or the markdown', () => {
  const files = buildAgentPackage({
    intake: { ...intake, company: 'Acme: "Best" #1\n---\nslug: evil' },
    agents: [{ ...agents[1], name: 'Amara', role: '---\nreportsTo: x' }, { ...agents[0], first_tasks: ['# heading', '- nested', '---'] }],
  });
  const c = parseDoc(files['COMPANY.md']);
  assert.equal(c.fm.name, 'Acme: "Best" #1 --- slug: evil');
  assert.equal(c.fm.slug, 'acme-best-1-slug-evil');
  const a = parseDoc(files['agents/amara/AGENTS.md']);
  assert.equal(a.fm.title, 'reportsTo: x');
  const k = parseDoc(files['agents/kenji/AGENTS.md']).body;
  assert.ok(!/^#{1,6} heading/m.test(k) && !/^---$/m.test(k), 'no injected heading or fence');
});

test('slugs: accents folded, duplicates numbered, empty names fall back', () => {
  assert.equal(slugify('Zoë', 'x'), 'zoe');
  assert.equal(slugify('', 'x'), 'x');
  const files = buildAgentPackage({ intake, agents: [{ name: 'Ana', is_lead: true }, { name: 'Ana' }, { name: '' }] });
  assert.deepEqual(Object.keys(files).slice(1), ['agents/ana/AGENTS.md', 'agents/ana-2/AGENTS.md', 'agents/employee-3/AGENTS.md']);
  assert.equal(packageFolder('Northwind Lettings'), 'northwind-lettings-team');
});

test('nothing to package: no company or no agents', () => {
  assert.equal(buildAgentPackage({ intake, agents: [] }), null);
  assert.equal(buildAgentPackage({ intake: { ...intake, company: ' ' }, agents }), null);
  assert.equal(buildAgentPackage({ intake: null, agents }), null);
});

test('the S5 lead row carries the package', () => {
  const row = leadRow({ orgId: 'org', intake, proposal: { status: 'ok', agents, chat_summary: [] }, turns: 0, source: {} });
  assert.deepEqual(row.agent_package, buildAgentPackage(SAMPLE));
  assert.ok(JSON.stringify(row.agent_package).length < 65536, 'fits the 0034 size check');
});

// Read a stored .zip back: every entry's name, CRC and bytes.
function readZip(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const eocd = buf.length - 22;
  assert.equal(v.getUint32(eocd, true), 0x06054b50);
  const count = v.getUint16(eocd + 10, true);
  let at = v.getUint32(eocd + 16, true);
  const out = {};
  for (let i = 0; i < count; i++) {
    assert.equal(v.getUint32(at, true), 0x02014b50);
    const crc = v.getUint32(at + 16, true);
    const size = v.getUint32(at + 20, true);
    const nameLen = v.getUint16(at + 28, true);
    const local = v.getUint32(at + 42, true);
    const name = new TextDecoder().decode(buf.subarray(at + 46, at + 46 + nameLen));
    assert.equal(v.getUint32(local, true), 0x04034b50);
    assert.equal(v.getUint16(local + 8, true), 0, 'stored');
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = buf.subarray(start, start + size);
    assert.equal(crc32(data), crc, 'crc for ' + name);
    out[name] = new TextDecoder().decode(data);
    at += 46 + nameLen + v.getUint16(at + 30, true) + v.getUint16(at + 32, true);
  }
  return out;
}

test('the .zip holds the package under one folder, byte for byte', () => {
  const files = buildAgentPackage(SAMPLE);
  const back = readZip(zipFiles(files, 'northwind-lettings-team', new Date(2026, 9, 3, 12, 0, 0)));
  assert.deepEqual(back, Object.fromEntries(Object.entries(files).map(([k, t]) => ['northwind-lettings-team/' + k, t])));
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

test('docs/front-door-package-sample is the builder output for the sample', () => {
  const files = buildAgentPackage(SAMPLE);
  if (process.env.FRONT_DOOR_PACKAGE_SAMPLE === 'write') {
    for (const [p, t] of Object.entries(files)) { mkdirSync(dirname(join(SAMPLE_DIR, p)), { recursive: true }); writeFileSync(join(SAMPLE_DIR, p), t); }
  }
  const onDisk = Object.fromEntries(walk(SAMPLE_DIR).filter((f) => f.endsWith('.md') && !f.endsWith('README.md'))
    .map((f) => [relative(SAMPLE_DIR, f).split('\\').join('/'), readFileSync(f, 'utf8')]));
  assert.deepEqual(onDisk, files);
});
