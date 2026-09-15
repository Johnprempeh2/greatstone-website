#!/usr/bin/env node
// Move a Deep Dive record from the local file store into Supabase.
//
// The record used to live only as .greatstone-records/<slug>.json on one laptop. This lifts it into
// deepdive_plans / deepdive_item_state / deepdive_findings / deepdive_log (migration 0028).
//
// Runs with the SERVICE ROLE key, so it bypasses RLS. That is right for an import run by hand on
// this machine and wrong for anything else: it must never be imported by app code.
//
//   node scripts/deepdive-import.mjs --check      # how stale is the local snapshot
//   node scripts/deepdive-import.mjs --snapshot   # pull the live record down over the files
//   node scripts/deepdive-import.mjs --write      # first-time import of a file-only record
//
// Refuses to overwrite a record already in Supabase unless --force, because the database copy is
// the one colleagues have been editing and the file may be the stale one.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const env = Object.fromEntries(fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => {
    const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
  }));
const URL_ = env.VITE_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error('Need VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env'); process.exit(1); }

const DIR = process.env.GREATSTONE_RECORDS || path.join(os.homedir(), 'Desktop/Code/.greatstone-records');
const args = process.argv.slice(2);
const WRITE = args.includes('--write'), FORCE = args.includes('--force'),
      CHECK = args.includes('--check'), SNAPSHOT = args.includes('--snapshot');
const only = args.filter((a) => !a.startsWith('--'));

async function rest(method, pathname, body, headers = {}) {
  const res = await fetch(`${URL_}/rest/v1/${pathname}`, {
    method,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${pathname} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// Key order is not content. Sort every object's keys, depth first, before comparing.
const canon = (v) => JSON.stringify(v, (_k, x) =>
  (x && typeof x === 'object' && !Array.isArray(x))
    ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]]))
    : x);

const read = (f, fallback = null) => {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { return fallback; }
};

const [org] = await rest('GET', 'organisations?select=id&limit=1');
if (!org) throw new Error('No organisation row to own these records.');
const customers = await rest('GET', 'customers?select=id,slug&deleted_at=is.null');
const customerBySlug = Object.fromEntries(customers.map((c) => [String(c.slug).toLowerCase(), c.id]));

const files = fs.readdirSync(DIR)
  .filter((f) => f.endsWith('.json') && !f.endsWith('.state.json') && f !== 'index.json')
  .filter((f) => !only.length || only.includes(f.slice(0, -5)));

// ⚠ THIS FLIPPED ON 7 SEP 2026. Supabase is now the ONE store: the portal writes there, and so
// does the Deep Dive MCP. The files in this folder are no longer a second store that can disagree
// with it, they are a LOCAL SNAPSHOT, and they go stale the moment anyone edits the record.
//   --check     how far behind the snapshot is
//   --snapshot  pull the live record back down over it
// Keeping the old "which of these two is right" framing would have made --check cry wolf on every
// normal edit, and a check that cries wolf gets switched off.
if (CHECK || SNAPSHOT) {
  let stale = 0;
  for (const f of files) {
    const slug = f.slice(0, -5);
    const plan = read(f);
    const [row] = await rest('GET', `deepdive_plans?slug=eq.${encodeURIComponent(slug)}&select=plan,updated_at,row_version`);
    if (!row) { console.log(`${slug}: on disk only, never imported`); stale++; continue; }
    if (canon(plan) === canon(row.plan)) { console.log(`${slug}: snapshot current`); continue; }
    stale++;
    if (SNAPSHOT) {
      fs.writeFileSync(path.join(DIR, f), JSON.stringify(row.plan, null, 2) + '\n');
      const st = await rest('GET', `deepdive_item_state?slug=eq.${encodeURIComponent(slug)}&select=item_id,status,visibility,note,agreement,updated_at`);
      const lg = await rest('GET', `deepdive_log?slug=eq.${encodeURIComponent(slug)}&select=at,item_id,label,by,actor,finding_id,changed&order=at.asc`);
      const fd = await rest('GET', `deepdive_findings?slug=eq.${encodeURIComponent(slug)}&select=*`);
      const items = {};
      for (const r of st || []) items[r.item_id] = { status: r.status, visibility: r.visibility,
        note: r.note || '', agreement: r.agreement ?? null, updated: r.updated_at };
      fs.writeFileSync(path.join(DIR, `${slug}.state.json`), JSON.stringify({
        items,
        log: (lg || []).map((r) => ({ at: r.at, id: r.item_id, label: r.label, by: r.by,
          actor: r.actor || null, ...(r.finding_id ? { findingId: r.finding_id } : {}), changed: r.changed || {} })),
        findings: (fd || []).map((x) => ({ id: x.id, questionId: x.question_id, sessionId: x.session_id,
          text: x.text, source: x.source, sourceId: x.source_id, confidence: x.confidence, state: x.state,
          supersedes: x.supersedes, by: x.by, at: x.at, validatedAt: x.validated_at, note: x.note })),
      }, null, 2) + '\n');
      console.log(`${slug}: snapshot refreshed from the live record (v${row.row_version}, ${row.updated_at})`);
    } else {
      console.log(`${slug}: snapshot BEHIND the live record (v${row.row_version}, changed ${row.updated_at}). --snapshot to refresh.`);
    }
  }
  console.log(stale ? `\n${stale} record(s) ${SNAPSHOT ? 'refreshed' : 'behind'}.` : '\nevery snapshot is current.');
  process.exit(0);
}

let touched = 0;
for (const f of files) {
  const slug = f.slice(0, -5);
  const plan = read(f);
  if (!plan?.engagement?.slug) { console.log(`skip ${slug}: no engagement.slug`); continue; }
  const state = read(`${slug}.state.json`, { items: {}, log: [], findings: [] });
  const items = state.items || {}, log = state.log || [], findings = state.findings || [];

  const existing = await rest('GET', `deepdive_plans?slug=eq.${encodeURIComponent(slug)}&select=slug,row_version`);
  if (existing.length && !FORCE) {
    console.log(`skip ${slug}: already in Supabase (row_version ${existing[0].row_version}). --force to overwrite.`);
    continue;
  }

  const counts = { items: Object.keys(items).length, log: log.length, findings: findings.length,
    shared: Object.values(items).filter((i) => i.visibility === 'shared').length };
  console.log(`${WRITE ? 'importing' : 'would import'} ${slug} (${plan.engagement.client}): ` +
    `${(JSON.stringify(plan).length / 1024).toFixed(0)}KB plan, ${counts.items} item states ` +
    `(${counts.shared} shared), ${counts.findings} findings, ${counts.log} log entries` +
    `${customerBySlug[slug] ? ', linked to its customer row' : ', NO matching customer row'}`);
  if (!WRITE) continue;

  await rest('POST', 'deepdive_plans', {
    slug, org_id: org.id, customer_id: customerBySlug[slug] || null, plan, row_version: 1,
  }, { Prefer: 'resolution=merge-duplicates' });

  const itemRows = Object.entries(items).map(([item_id, v]) => ({
    slug, item_id, org_id: org.id,
    status: v.status || 'open', visibility: v.visibility || 'internal', note: v.note || '',
    agreement: v.agreement ?? null, updated_at: v.updated || new Date().toISOString(),
  }));
  if (itemRows.length) await rest('POST', 'deepdive_item_state', itemRows, { Prefer: 'resolution=merge-duplicates' });

  const findingRows = findings.map((x) => ({
    slug, id: x.id, org_id: org.id, question_id: x.questionId || null, session_id: x.sessionId || null,
    text: x.text || '', source: x.source || '', source_id: x.sourceId || null,
    confidence: x.confidence || null, state: x.state || null, supersedes: x.supersedes || null,
    by: x.by === 'mcp' ? 'mcp' : 'portal', at: x.at || null, validated_at: x.validatedAt || null,
    note: x.note || '',
  }));
  if (findingRows.length) await rest('POST', 'deepdive_findings', findingRows, { Prefer: 'resolution=merge-duplicates' });

  // The trail is append-only, so a re-run must not double it: clear this record's rows first.
  await rest('DELETE', `deepdive_log?slug=eq.${encodeURIComponent(slug)}`);
  const logRows = log.map((e) => ({
    slug, org_id: org.id, at: e.at || null, item_id: e.id || null, label: e.label || null,
    by: e.by || null, finding_id: e.findingId || null, changed: e.changed || {},
  }));
  if (logRows.length) await rest('POST', 'deepdive_log', logRows);
  touched++;
}
console.log(WRITE ? `\ndone: ${touched} record(s) written.` : `\ndry run. Add --write to import.`);
