// Authoring a client record from the browser.
//
// A record is never written as raw bytes. The browser submits an OPERATION (add / edit / remove /
// set_engagement) and the shared rules in ../data/deepdive-schema.mjs decide whether it is legal.
// The same rules run again on the receiving side, so the browser's validation is a courtesy to the
// person typing, never the thing that protects the record.
//
// TWO TRANSPORTS, tried in order:
//   1. Supabase (`deepdive_plans`). The production path. Authorisation is row-level security, and a
//      row_version check turns a concurrent write into a visible conflict instead of a silent loss.
//   2. The dev-only middleware in vite.config.js, over the .deepdive files the MCP shares.
// Neither available means authoring is OFF, and the UI says so rather than failing on submit.
import { supabase } from '../lib/supabase.mjs';
import { isAbsentOrForbidden } from '../lib/pg-absent.mjs';
import { applyOp, identityParts, ID_PREFIX, normalisePlan, findItem } from '../data/deepdive-schema.mjs';

const base = () => `${import.meta.env.BASE_URL || '/'}deepdive/`;

// An SPA rewrite answers anything with a 200 and index.html, so a bare res.ok would read a missing
// endpoint as a working one. Every response here has to actually be JSON.
async function asJson(res) {
  if (!res || !res.ok) return null;
  if (!/\bjson\b/i.test(res.headers.get('content-type') || '')) return null;
  try { return await res.json(); } catch { return null; }
}

/** The same 8-hex content hash the MCP mints with node:crypto, computed with the Web Crypto API.
 *  Identity comes from the item's own identifying text, so the two sides agree without coordinating. */
async function mintId(kind, fields) {
  const parts = identityParts(kind, fields).map((x) => String(x)).join('␟');
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(parts));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${ID_PREFIX[kind]}:${hex.slice(0, 8)}`;
}

// ── can this environment be written to at all? ────────────────────────────────────────────────
let capability = null;
export async function probeCanAuthor() {
  if (capability !== null) return capability;
  if (supabase) {
    const { error } = await supabase.from('deepdive_plans').select('slug').limit(1);
    if (!error) { capability = { can: true, via: 'supabase', why: null }; return capability; }
    if (!isAbsentOrForbidden(error)) { capability = { can: false, via: null, why: error.message }; return capability; }
  }
  const cap = await asJson(await fetch(`${base()}_capabilities.json`, { cache: 'no-store' }).catch(() => null));
  capability = cap?.write
    ? { can: true, via: 'file', why: null }
    : { can: false, via: null, why: 'This build has no record store. Authoring needs the dev server, or the deepdive_plans table.' };
  return capability;
}
export const resetCapability = () => { capability = null; };

// ── the write ─────────────────────────────────────────────────────────────────────────────────
async function viaSupabase(slug, op, id) {
  const { data: row, error } = await supabase
    .from('deepdive_plans').select('plan, row_version').eq('slug', slug).maybeSingle();
  if (error) { if (isAbsentOrForbidden(error)) return null; throw error; }
  if (!row) return null;
  const next = applyOp(row.plan, op, id);
  next._provenance = { lastEditedBy: 'portal', at: new Date().toISOString() };
  const { data, error: wErr } = await supabase
    .from('deepdive_plans')
    .update({ plan: next, row_version: row.row_version + 1 })
    .eq('slug', slug).eq('row_version', row.row_version)
    .select('plan, row_version');
  if (wErr) { if (isAbsentOrForbidden(wErr)) return null; throw wErr; }
  // Zero rows back means the version moved under us: somebody else wrote first.
  if (!data || !data.length) {
    const e = new Error('This record changed while you were typing. Reload before saving again.');
    e.conflict = true; throw e;
  }
  return { plan: data[0].plan, version: data[0].row_version, via: 'supabase' };
}

async function viaFile(slug, op, id, version) {
  const res = await fetch(`${base()}op`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, op, id, ifMatch: version }),
  }).catch(() => null);
  if (res && res.status === 428) throw new Error('This record was not loaded cleanly. Reload before editing.');
  if (res && res.status === 409) {
    const e = new Error('This record changed while you were typing. Reload before saving again.');
    e.conflict = true; throw e;
  }
  // A refusal from the server is the most useful sentence available; discarding it and reporting
  // "run the dev server" told the user to fix something that was not broken. Only a response that is
  // genuinely not JSON means "no endpoint here" (the SPA rewrite case).
  if (res && /\bjson\b/i.test(res.headers.get('content-type') || '')) {
    let out = null;
    try { out = await res.json(); } catch { out = null; }
    if (out && out.error) throw new Error(out.error);
    if (out && out.plan) return { plan: out.plan, version: out.version, via: 'file' };
  }
  return null;
}

/** Apply one authored change. Validates locally first so a mistake is caught before a round trip,
 *  then sends the operation; the receiver validates it again. Returns the new plan. */
export async function applyRecordOp(slug, op, currentPlan = null, version = null) {
  // Identity is minted from the item AS IT WILL BE, looked up from the record here rather than
  // trusted from the caller. An edit that sends only the fields it changed would otherwise hash a
  // fragment and move the item to an id nothing points at. The server already resolves it this
  // way; this is the browser's pre-check agreeing with it instead of guessing.
  let id = null;
  if (op.type === 'add') {
    id = await mintId(op.kind, op.fields || {});
  } else if (op.type === 'edit' && op.fields) {
    const found = currentPlan ? findItem(currentPlan, op.id) : null;
    const kind = op.kind || op.currentKind || found?.kind;
    if (!kind) throw new Error(`Nothing in this record with id "${op.id}".`);
    const stored = found ? { ...found.item, ...(found.pillar ? { pillar: found.pillar } : {}) } : {};
    id = await mintId(kind, { ...stored, ...(op.currentFields || {}), ...(op.fields || {}) });
  }

  // fail fast and locally: the person typing gets the real message, not a 400
  if (currentPlan) applyOp(currentPlan, op, id || op.id);

  // ⚠ RETURN THE MINTED ID. It is computed here, at line 112, from the item as it will be — and it
  // was thrown away, so the caller had to GUESS which item had been re-minted by diffing the new
  // plan against its own stale copy. That guess picked the first id the browser had not seen, which
  // on a record with a second writer is somebody else's item entirely.
  if (supabase) {
    const r = await viaSupabase(slug, op, id).catch((e) => { if (e.conflict) throw e; if (!isAbsentOrForbidden(e)) throw e; return null; });
    if (r) return { ...r, newId: id || op.id || null };
  }
  const f = await viaFile(slug, op, id, version);
  if (f) return { ...f, newId: id || op.id || null };
  throw new Error('Nothing here can store a change. Run the dev server, or apply the deepdive_plans migration.');
}

/** Start a record for a customer that has none. Deliberately separate from applyRecordOp: creating
 *  is the one operation that must not silently overwrite an existing record. */
export async function createRecord({ slug, client, title = 'Client record', ...rest }) {
  const plan = normalisePlan({
    engagement: {
      slug, client, title,
      stage: rest.stage || 'Greatstone Deep Dive',
      access: rest.access || 'Commitment in principle',
      accessNote: rest.accessNote || 'Access is granted before commercial commitment, so the shape of the investigation is visible before it is funded.',
      sponsor: rest.sponsor || '', follows: rest.follows || '', lead: rest.lead || '',
    },
  });
  plan._provenance = { lastEditedBy: 'portal', at: new Date().toISOString() };

  if (supabase) {
    const { data, error } = await supabase
      .from('deepdive_plans').insert({ slug, plan, row_version: 1 }).select('plan, row_version').maybeSingle();
    // The version has to come back with it. Without it the very first edit after "Start this
    // record" sent no ifMatch, was refused, and blamed the load rather than the missing version.
    if (!error && data) return { plan: data.plan, version: data.row_version, via: 'supabase' };
    if (error && !isAbsentOrForbidden(error)) {
      throw new Error(/duplicate|unique/i.test(error.message) ? `A record already exists for "${slug}".` : error.message);
    }
  }
  const res = await fetch(`${base()}op`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, op: { type: 'create' }, plan }),
  }).catch(() => null);
  // Read the body whatever the status: a 409 here means somebody else created it first, and telling
  // the user to start a dev server that is plainly running is worse than saying nothing.
  if (res && /\bjson\b/i.test(res.headers.get('content-type') || '')) {
    let out = null;
    try { out = await res.json(); } catch { out = null; }
    if (out && out.error) throw new Error(out.error);
    if (out && out.plan) return { plan: out.plan, version: out.version, via: 'file' };
  }
  throw new Error('Nothing here can store a record. Run the dev server, or apply the deepdive_plans migration.');
}

/** One row per record for the register, so it costs one request rather than one per customer. */
export async function recordSummaries() {
  if (supabase) {
    const { data, error } = await supabase.from('deepdive_plans').select('slug, summary');
    if (!error && Array.isArray(data)) {
      return Object.fromEntries(data.map((r) => [r.slug, r.summary || {}]));
    }
    if (error && !isAbsentOrForbidden(error)) throw error;
  }
  const out = await asJson(await fetch(`${base()}summary`, { cache: 'no-store' }).catch(() => null));
  return out?.records || {};
}
