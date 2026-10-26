// GSAM's side door into the interview engine (GRE-2612, contract contracts/gs-interview-v1). The admin-bridge function
// checks the signature, opens its audited transaction and calls a route here; every statement then runs as
// interview_worker with system claims plus the key's org and the round's organisation (interviewDbOnClient), so a
// round's writes commit with the bridge audit row. Every path is keyed by the website organisation id (customers.id,
// John's rule 2, 25 Oct): …/interview/organisations/{organisationId}/rounds/{roundId}. RLS limits each call to that
// organisation's rows, so a round under another organisation, or another tenant's key, gets not_found.
// Emails and the synthesis start are side effects: a route queues them on `after`, and admin-bridge runs them only
// once the transaction has committed (never on a replay).
import { randomBytes } from 'node:crypto';
import { BridgeRequestError } from '../admin-bridge-store.mjs';
import { interviewDbOnClient } from './db.mjs';
import { closeOutOpenSessions } from './lifecycle.mjs';
import { getLatestSynthesis, getReleasedSynthesis, releaseSynthesis, withdrawRelease } from './synthesis/release.mjs';
import { getInterview, listInterviews, pushReleasedSynthesis } from './bridge-interviews.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_IN = { draft: 'draft', open: 'active', closed: 'closed' };
const STATUS_OUT = { draft: 'draft', active: 'open', closed: 'closed' };
const PACK_TEXT = ['company_background', 'org_summary', 'systems', 'scope', 'glossary', 'do_not_discuss',
  'working_pattern', 'priority_questions'];
const ROLES = ['employee', 'team_leader', 'client_admin'];

const bad = (what) => { throw new BridgeRequestError('bad_request', what); };
const notFound = () => { throw new BridgeRequestError('not_found', 'no such round'); };
const must = ({ data, error }) => { if (error) throw Object.assign(new Error(error.message), { code: error.code }); return data; };
const str = (x, max, k, { nullable = false } = {}) => {
  if (x == null && nullable) return null;
  return typeof x === 'string' && x.length <= max && x.trim() ? x.trim() : bad(k);
};
const int = (x, min, max, k, { nullable = false } = {}) => {
  if (x == null && nullable) return null;
  return Number.isInteger(x) && x >= min && x <= max ? x : bad(k);
};
const only = (obj, keys, k) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) bad(k);
  for (const key of Object.keys(obj)) if (!keys.includes(key)) bad(`${k}.${key}`);
  return obj;
};

export function siteOrigin(env = process.env) {
  return String(env.APP_SITE_ORIGIN || env.BETTER_AUTH_URL || env.URL || 'https://greatstoneint.com').replace(/\/+$/, '');
}
export const joinUrl = (token, env) => (token ? `${siteOrigin(env)}/#join/${token}` : null);

// ── checks ───────────────────────────────────────────────────────────────────────────────────────

export function checkRound(body) {
  only(body, ['schema', 'clientName', 'sponsor', 'mode', 'targetMinutes', 'status', 'voice', 'seatTotal',
    'costEnvelopePence', 'endDate', 'retentionDeleteAfter', 'enrol', 'units', 'contextPack'], 'body');
  if (body.schema !== 'gs-interview-round-v1') bad('schema');
  const enrol = only(body.enrol ?? {}, ['enabled', 'expiresAt', 'allowedEmailDomains', 'defaultUnitId', 'rotateToken'], 'enrol');
  const domains = enrol.allowedEmailDomains ?? [];
  if (!Array.isArray(domains) || domains.length > 50) bad('enrol.allowedEmailDomains');
  const units = body.units ?? [];
  if (!Array.isArray(units) || units.length > 500) bad('units');
  const unitIds = new Set();
  const round = {
    clientName: str(body.clientName, 200, 'clientName'),
    sponsor: str(body.sponsor, 200, 'sponsor', { nullable: true }),
    mode: ['team', 'person'].includes(body.mode) ? body.mode : bad('mode'),
    targetMinutes: int(body.targetMinutes ?? 20, 5, 90, 'targetMinutes'),
    status: STATUS_IN[body.status] || bad('status'),
    // the request-time voice switch: false takes voice away from this round at once (VOICE_ENABLED=0 needs a redeploy)
    voice: body.voice == null ? true : typeof body.voice === 'boolean' ? body.voice : bad('voice'),
    seatTotal: int(body.seatTotal, 0, 10000, 'seatTotal'),
    costEnvelopePence: int(body.costEnvelopePence ?? 0, 0, 100_000_000, 'costEnvelopePence'),
    endDate: body.endDate == null ? null : DATE.test(body.endDate) ? body.endDate : bad('endDate'),
    retentionDeleteAfter: body.retentionDeleteAfter == null ? null
      : DATE.test(body.retentionDeleteAfter) ? body.retentionDeleteAfter : bad('retentionDeleteAfter'),
    enrol: {
      enabled: enrol.enabled === true,
      expiresAt: enrol.expiresAt == null ? null : !Number.isNaN(Date.parse(enrol.expiresAt)) ? new Date(enrol.expiresAt).toISOString() : bad('enrol.expiresAt'),
      domains: [...new Set(domains.map((d) => (typeof d === 'string' ? d.trim().toLowerCase().replace(/^@/, '') : bad('enrol.allowedEmailDomains'))))]
        .map((d) => (DOMAIN.test(d) ? d : bad('enrol.allowedEmailDomains'))),
      defaultUnitId: enrol.defaultUnitId == null ? null : UUID.test(enrol.defaultUnitId) ? enrol.defaultUnitId : bad('enrol.defaultUnitId'),
      rotateToken: enrol.rotateToken === true,
    },
    units: units.map((u, i) => {
      only(u, ['id', 'parentId', 'name', 'kind', 'seatAllocation'], `units[${i}]`);
      if (!UUID.test(u.id || '') || unitIds.has(u.id)) bad(`units[${i}].id`);
      unitIds.add(u.id);
      return { id: u.id, parentId: u.parentId == null ? null : UUID.test(u.parentId) ? u.parentId : bad(`units[${i}].parentId`),
        name: str(u.name, 200, `units[${i}].name`), kind: str(u.kind ?? 'team', 50, `units[${i}].kind`),
        seatAllocation: int(u.seatAllocation, 0, 10000, `units[${i}].seatAllocation`, { nullable: true }) };
    }),
    contextPack: null,
  };
  for (const u of round.units) if (u.parentId && !unitIds.has(u.parentId)) bad('units.parentId');
  if (round.enrol.defaultUnitId && !unitIds.has(round.enrol.defaultUnitId)) bad('enrol.defaultUnitId');
  if (body.contextPack != null) {
    const pack = only(body.contextPack, [...PACK_TEXT, 'units', 'people'], 'contextPack');
    const out = {};
    for (const key of PACK_TEXT) if (pack[key] != null) out[key] = str(pack[key], 20000, `contextPack.${key}`);
    for (const key of ['units', 'people']) {
      if (pack[key] == null) continue;
      only(pack[key], Object.keys(pack[key]), `contextPack.${key}`);
      const map = {};
      for (const [k, v] of Object.entries(pack[key])) {
        if (key === 'units' && !UUID.test(k)) bad('contextPack.units');
        // people: the employee id from invites (preferred), or a lower-case email before the person is invited
        if (key === 'people' && !EMAIL.test(k) && !UUID.test(k)) bad('contextPack.people');
        map[key === 'people' ? k.toLowerCase() : k] = str(v, 20000, `contextPack.${key}`);
      }
      if (Object.keys(map).length > 1000) bad(`contextPack.${key}`);
      out[key] = map;
    }
    round.contextPack = out;
  }
  if (round.status === 'active' && (round.seatTotal < 1 || !round.enrol.domains.length || !round.contextPack)) bad('open needs seats, domains and a context pack');
  return round;
}

export function checkInvites(body) {
  only(body, ['people', 'send'], 'body');
  if (!Array.isArray(body.people) || !body.people.length || body.people.length > 200) bad('people');
  const seen = new Set();
  return {
    send: body.send === true,
    people: body.people.map((p, i) => {
      only(p, ['email', 'name', 'roleTitle', 'unitId', 'portalRole'], `people[${i}]`);
      const email = typeof p.email === 'string' ? p.email.trim().toLowerCase() : '';
      if (!EMAIL.test(email) || email.length > 254 || seen.has(email)) bad(`people[${i}].email`);
      seen.add(email);
      return { email, name: str(p.name, 200, `people[${i}].name`), roleTitle: str(p.roleTitle, 200, `people[${i}].roleTitle`, { nullable: true }),
        unitId: p.unitId == null ? null : UUID.test(p.unitId) ? p.unitId : bad(`people[${i}].unitId`),
        portalRole: p.portalRole == null ? 'employee' : ROLES.includes(p.portalRole) ? p.portalRole : bad(`people[${i}].portalRole`) };
    }),
  };
}

// ── round view ───────────────────────────────────────────────────────────────────────────────────

// RLS already hides another organisation's round; the check here is the second lock.
async function ownedRound(db, ctx, roundId) {
  if (!UUID.test(roundId || '')) notFound();
  const row = must(await db.from('engagement').select('*').eq('id', roundId).maybeSingle());
  if (!row || row.org_id !== ctx.org || row.customer_id !== ctx.customerId) notFound();
  return row;
}

export async function roundView(db, eng) {
  const counts = must(await db.sql(`SELECT e.status::text AS status, count(*)::int AS n FROM employee e
    WHERE e.engagement_id = $1 GROUP BY 1`, [eng.id]));
  const abandoned = must(await db.sql(`SELECT count(*)::int AS n FROM session s JOIN employee e ON e.id = s.employee_id
    WHERE e.engagement_id = $1 AND s.ended_at IS NOT NULL AND e.status = 'started'`, [eng.id]));
  const spend = await db.rpc('engagement_spend', { p_ids: [eng.id] });
  const spendRow = Array.isArray(spend.data) ? spend.data[0] : null;
  const c = Object.fromEntries(counts.map((r) => [r.status, r.n]));
  return {
    id: eng.id, clientName: eng.client_name, organisationId: eng.customer_id, sponsor: eng.sponsor ?? null,
    mode: eng.mode, status: STATUS_OUT[eng.status] || eng.status, voice: eng.branding_config?.voice !== false, targetMinutes: eng.target_minutes,
    seatTotal: eng.seat_total, costEnvelopePence: Number(eng.cost_envelope_pence),
    spendPence: Number(spendRow?.spent_pence ?? spendRow?.spend_pence ?? spendRow?.cost_pence ?? 0),
    endDate: eng.end_date, retentionDeleteAfter: eng.retention_delete_after,
    joinUrl: joinUrl(eng.enrol_token),
    enrol: { enabled: eng.enrol_enabled, expiresAt: eng.enrol_expires_at, allowedEmailDomains: eng.allowed_email_domains,
      defaultUnitId: eng.default_unit_id },
    contextPackVersion: eng.context_pack_version,
    counts: { invited: c.invited || 0, started: c.started || 0, completed: c.completed || 0, declined: c.declined || 0,
      abandoned: abandoned[0]?.n || 0 },
    released: { synthesisId: eng.released_synthesis_id ?? null, releasedAt: eng.released_at ?? null },
  };
}

// ── writes ───────────────────────────────────────────────────────────────────────────────────────

async function saveUnits(db, eng, units, defaultUnitId) {
  const existing = must(await db.from('org_unit').select('id, parent_id').eq('engagement_id', eng.id));
  if (!units.length) {
    if (existing.length) return eng.default_unit_id;
    // as the source's create_engagement: a root for the client and an Unassigned team for self-enrolment
    const root = must(await db.from('org_unit').insert({ engagement_id: eng.id, name: eng.client_name, kind: 'organisation' }).select('id').single());
    const other = must(await db.from('org_unit').insert({ engagement_id: eng.id, parent_id: root.id, name: 'Unassigned', kind: 'team' }).select('id').single());
    return other.id;
  }
  const mine = new Set(existing.map((u) => u.id));
  const theirs = must(await db.from('org_unit').select('id').in('id', units.map((u) => u.id)).neq('engagement_id', eng.id));
  if (theirs.length) bad('units.id');
  // parents before children
  const placed = new Set();
  const ordered = [];
  for (let pass = 0; ordered.length < units.length && pass <= units.length; pass++) {
    for (const u of units) if (!placed.has(u.id) && (!u.parentId || placed.has(u.parentId))) { ordered.push(u); placed.add(u.id); }
  }
  if (ordered.length < units.length) bad('units: parent cycle');
  for (const u of ordered) {
    const row = { name: u.name, kind: u.kind, parent_id: u.parentId, seat_allocation: u.seatAllocation };
    if (mine.has(u.id)) must(await db.from('org_unit').update(row).eq('id', u.id).eq('engagement_id', eng.id));
    else must(await db.from('org_unit').insert({ id: u.id, engagement_id: eng.id, ...row }));
  }
  // a unit GSAM left out goes only when nobody sits in it and it has no children (leaves first)
  const keep = new Set(units.map((u) => u.id));
  let gone = existing.filter((u) => !keep.has(u.id) && u.id !== defaultUnitId);
  for (let changed = true; changed && gone.length;) {
    changed = false;
    for (const u of gone) {
      const used = must(await db.sql(`SELECT EXISTS (SELECT 1 FROM employee WHERE unit_id = $1)
        OR EXISTS (SELECT 1 FROM org_unit WHERE parent_id = $1) OR EXISTS (SELECT 1 FROM engagement WHERE default_unit_id = $1 AND id <> $2) AS used`, [u.id, eng.id]));
      if (used[0].used) continue;
      must(await db.from('org_unit').delete().eq('id', u.id));
      gone = gone.filter((x) => x.id !== u.id);
      changed = true;
    }
  }
  return defaultUnitId ?? (units.find((u) => !u.parentId)?.id || eng.default_unit_id);
}

async function savePack(db, eng, content, actor) {
  if (!content) return {};
  if (eng.context_pack_id) {
    // jsonb orders its keys, so compare in the database
    const same = must(await db.sql(`SELECT 1 FROM context_pack WHERE id = $1 AND status = 'approved' AND content = $2::jsonb`,
      [eng.context_pack_id, JSON.stringify(content)]));
    if (same.length) return {};
  }
  const last = must(await db.from('context_pack').select('version').eq('engagement_id', eng.id).order('version', { ascending: false }).limit(1));
  const version = (last[0]?.version || 0) + 1;
  const pack = must(await db.from('context_pack').insert({ engagement_id: eng.id, version, content, status: 'approved',
    approved_by: actor.slice(0, 200) }).select('id').single());
  return { context_pack_id: pack.id, context_pack_version: version };
}

async function audit(db, engagementId, actor, action, summary) {
  await db.from('audit_log').insert({ engagement_id: engagementId, actor_name: actor.slice(0, 200), action, summary });
}

export async function saveRound(db, ctx, roundId, body) {
  if (!UUID.test(roundId || '')) notFound();
  const r = checkRound(body);
  let eng = must(await db.from('engagement').select('*').eq('id', roundId).maybeSingle());
  if (eng && (eng.org_id !== ctx.org || eng.customer_id !== ctx.customerId)) notFound();
  const fields = {
    client_name: r.clientName, sponsor: r.sponsor, mode: r.mode, target_minutes: r.targetMinutes,
    status: r.status, branding_config: { ...(eng?.branding_config ?? {}), voice: r.voice }, seat_total: r.seatTotal, cost_envelope_pence: r.costEnvelopePence, end_date: r.endDate,
    retention_delete_after: r.retentionDeleteAfter, allowed_email_domains: r.enrol.domains,
    enrol_enabled: r.status === 'closed' ? false : r.enrol.enabled, enrol_expires_at: r.enrol.expiresAt,
  };
  const created = !eng;
  if (created) {
    const made = await db.from('engagement').insert({ id: roundId, org_id: ctx.org, customer_id: ctx.customerId, ...fields,
      enrol_token: randomBytes(24).toString('base64url') }).select('*').single();
    // 23505: the id is a round under another organisation (hidden by RLS); 23503: no such organisation for this tenant
    if (made.error?.code === '23505') notFound();
    if (made.error?.code === '23503') bad('organisationId');
    eng = must(made);
  } else {
    eng = must(await db.from('engagement').update({ ...fields,
      ...(r.enrol.rotateToken || !eng.enrol_token ? { enrol_token: randomBytes(24).toString('base64url') } : {}) })
      .eq('id', roundId).select('*').single());
  }
  const defaultUnit = await saveUnits(db, eng, r.units, r.enrol.defaultUnitId);
  const pack = await savePack(db, eng, r.contextPack, ctx.actor);
  if (r.status === 'active' && !pack.context_pack_id && !eng.context_pack_id) bad('open needs a context pack');
  eng = must(await db.from('engagement').update({ default_unit_id: defaultUnit, ...pack }).eq('id', roundId).select('*').single());
  // the allocation check is deferred in the source; run it now so a bad carve-up is a 400, not a failed commit
  const checked = await db.sql('SET CONSTRAINTS ALL IMMEDIATE');
  if (checked.error) bad('units: seat allocations exceed a parent');
  await audit(db, roundId, ctx.actor, created ? 'round.created' : 'round.updated',
    `${created ? 'Created' : 'Updated'} the round through GSAM${pack.context_pack_version ? ` (context pack v${pack.context_pack_version})` : ''}`);
  return { status: 200, body: { round: await roundView(db, eng) }, rowCount: 1, resourceId: roundId };
}

export function inviteEmail({ name, clientName, url, targetMinutes }) {
  return {
    subject: `Your discovery interview for ${clientName}`,
    text: [`Hello ${name},`, '',
      `${clientName} is working with Greatstone to understand how work really gets done, and where time goes. You are invited to a short conversation with our interviewer, about ${targetMinutes} minutes, at a time that suits you.`,
      '', `Start here: ${url}`, '',
      'You will create a Greatstone account with this email address (or sign in if you have one). You can pause and come back at any time. Before anything you say is used, you choose whether you are named or anonymous.',
      '', 'Greatstone International'].join('\n'),
  };
}

export async function invitePeople(db, ctx, roundId, body, after) {
  const { people, send } = checkInvites(body);
  const eng = await ownedRound(db, ctx, roundId);
  const units = new Set(must(await db.from('org_unit').select('id').eq('engagement_id', eng.id)).map((u) => u.id));
  const invited = [];
  for (const p of people) {
    if (p.unitId && !units.has(p.unitId)) bad('people.unitId');
    const domain = p.email.split('@')[1];
    if (p.portalRole !== 'client_admin' && !eng.allowed_email_domains.includes(domain)) bad('people.email: domain not allowed');
    const existing = must(await db.from('employee').select('id, status').eq('engagement_id', eng.id).eq('email', p.email).maybeSingle());
    const row = { name: p.name, role_title: p.roleTitle, unit_id: p.unitId ?? eng.default_unit_id, portal_role: p.portalRole };
    let employeeId;
    if (existing) {
      must(await db.from('employee').update(row).eq('id', existing.id));
      employeeId = existing.id;
    } else {
      // person_id and user_id are set when the person joins with a verified website account of this email
      employeeId = must(await db.from('employee').insert({ engagement_id: eng.id, email: p.email,
        status: 'invited', ...row }).select('id').single()).id;
    }
    invited.push({ email: p.email, employeeId, outcome: existing ? 'updated' : 'created', name: p.name });
  }
  await audit(db, eng.id, ctx.actor, 'round.invited', `Invited ${invited.length} people through GSAM`);
  const toSend = send && eng.enrol_token ? invited.filter((i) => i.outcome === 'created') : [];
  const url = joinUrl(eng.enrol_token);
  const result = { emailed: 0 };
  for (const i of toSend) after.push(async (mail) => {
    const sent = await mail({ to: i.email, ...inviteEmail({ name: i.name, clientName: eng.client_name, url, targetMinutes: eng.target_minutes }) });
    if (sent) result.emailed += 1;
  });
  return { status: 200, body: { invited: invited.map(({ name, ...rest }) => rest), emailed: toSend.length }, rowCount: invited.length,
    resourceId: roundId };
}

export async function startSynthesis(db, ctx, roundId, body, after) {
  if (Object.keys(body).length) bad('body');
  const eng = await ownedRound(db, ctx, roundId);
  // a background function lives 15 minutes at most: a run still "running" after 20 never finished
  must(await db.sql(`UPDATE synthesis_run SET status = 'failed', finished_at = now(), error = 'did not finish'
    WHERE engagement_id = $1 AND status = 'running' AND started_at < now() - interval '20 minutes'`, [eng.id]));
  const run = await db.from('synthesis_run').insert({ engagement_id: eng.id, actor: ctx.actor.slice(0, 200) }).select('id').single();
  if (run.error?.code === '23505') throw new BridgeRequestError('conflict', 'a synthesis run is in progress');
  const { id } = must(run);
  await audit(db, eng.id, ctx.actor, 'synthesis.started', 'Started synthesis through GSAM');
  after.push((_mail, start) => start({ runId: id, engagementId: eng.id }));
  return { status: 202, body: { started: true, runId: id }, rowCount: 1, resourceId: roundId };
}

export async function release(db, ctx, roundId, synthesisId, body) {
  if (Object.keys(body).length) bad('body');
  if (!UUID.test(synthesisId || '')) notFound();
  await ownedRound(db, ctx, roundId);
  const done = await releaseSynthesis(db, roundId, synthesisId, ctx.actor);
  if (!done.ok) bad(done.message);
  return { status: 200, body: { round: await roundView(db, await ownedRound(db, ctx, roundId)) }, rowCount: 1, resourceId: roundId };
}

export async function withdraw(db, ctx, roundId, body) {
  if (Object.keys(body).length) bad('body');
  await ownedRound(db, ctx, roundId);
  const done = await withdrawRelease(db, roundId, ctx.actor);
  if (!done.ok) bad(done.message);
  return { status: 200, body: { round: await roundView(db, await ownedRound(db, ctx, roundId)) }, rowCount: 1, resourceId: roundId };
}

export async function closeRound(db, ctx, roundId, body) {
  if (Object.keys(body).length) bad('body');
  await ownedRound(db, ctx, roundId);
  must(await db.from('engagement').update({ status: 'closed', enrol_enabled: false }).eq('id', roundId));
  const closedSessions = await closeOutOpenSessions(db, roundId, ctx.actor);
  await audit(db, roundId, ctx.actor, 'round.closed', `Closed the round through GSAM (${closedSessions} open sessions closed out)`);
  return { status: 200, body: { round: await roundView(db, await ownedRound(db, ctx, roundId)), closedSessions }, rowCount: 1,
    resourceId: roundId };
}

// ── reads ────────────────────────────────────────────────────────────────────────────────────────

export async function listPeople(db, eng) {
  return must(await db.sql(`SELECT e.id AS "employeeId", e.email, e.name, e.role_title AS "roleTitle", e.unit_id AS "unitId",
      e.portal_role::text AS "portalRole", e.status::text AS status, s.started_at AS "sessionStartedAt", s.ended_at AS "sessionEndedAt",
      s.completion_score AS "completionScore", s.phase::text AS phase
    FROM employee e LEFT JOIN LATERAL (SELECT * FROM session x WHERE x.employee_id = e.id ORDER BY x.started_at DESC LIMIT 1) s ON true
    WHERE e.engagement_id = $1 AND e.portal_role <> 'gs_admin' ORDER BY e.name, e.id`, [eng.id]));
}

// the cursor is the last row's id; its (created_at, id) is looked up again, so no timestamp precision is lost
const encode = (row) => Buffer.from(row.id).toString('base64url');
function decode(cursor) {
  if (cursor == null) return null;
  const id = Buffer.from(String(cursor), 'base64url').toString();
  return UUID.test(id) ? id : bad('after');
}

export async function listEvents(db, eng, params) {
  for (const k of params.keys()) if (!['after', 'limit'].includes(k)) bad(k);
  const after = decode(params.get('after'));
  const limit = params.has('limit') ? Number(params.get('limit')) : 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) bad('limit');
  const rows = must(await db.sql(`SELECT o.id, o.created_at, o.payload FROM outbox o WHERE o.engagement_id = $1
    AND ($2::uuid IS NULL OR (o.created_at, o.id) > (SELECT c.created_at, c.id FROM outbox c WHERE c.id = $2 AND c.engagement_id = $1))
    ORDER BY o.created_at, o.id LIMIT $3`, [eng.id, after, limit + 1]));
  const page = rows.slice(0, limit);
  return { items: page.map((r) => ({ cursor: encode(r), event: r.payload?.event ?? null, createdAt: r.created_at, payload: r.payload })),
    nextCursor: rows.length > limit ? encode(page[page.length - 1]) : null };
}

/** { customerId, roundId, tail } for interview/organisations/{organisationId}/rounds/{roundId}/…, or null. */
function roundPath(p) {
  if (p[0] !== 'interview' || p[1] !== 'organisations' || !UUID.test(p[2] || '') || p[3] !== 'rounds' || !p[4]) return null;
  return { customerId: p[2].toLowerCase(), roundId: p[4], tail: p.slice(5) };
}

/** The read route for path parts after /api/admin/v1/, or null when it is not an interview path. */
export function interviewReadRoute(p) {
  const at = roundPath(p);
  if (!at) return null;
  const tail = at.tail.join('/');
  const known = ['', 'people', 'events', 'interviews', 'synthesis/latest', 'synthesis/released'];
  const interviewId = at.tail.length === 2 && at.tail[0] === 'interviews' ? at.tail[1] : null;
  if (!known.includes(tail) && !interviewId) return null;
  return {
    resource: 'interview', id: at.roundId,
    async run(client, params) {
      const { rows: [{ org }] } = await client.query(`SELECT current_setting('request.jwt.claims', true)::jsonb->>'org' AS org`);
      const ctx = { org, customerId: at.customerId };
      const db = interviewDbOnClient(client, { org, customer_id: at.customerId });
      const eng = await ownedRound(db, ctx, at.roundId);
      if (tail !== 'events' && [...params.keys()].length) bad('no parameters');
      if (tail === '') return { outcome: 'ok', rowCount: 1, body: { item: await roundView(db, eng) } };
      if (tail === 'people') { const items = await listPeople(db, eng); return { outcome: 'ok', rowCount: items.length, body: { items } }; }
      if (tail === 'events') { const page = await listEvents(db, eng, params); return { outcome: 'ok', rowCount: page.items.length, body: page }; }
      if (tail === 'interviews') { const list = await listInterviews(db, eng); return { outcome: 'ok', rowCount: list.items.length, body: list }; }
      if (interviewId) { const item = await getInterview(db, eng, interviewId); return { outcome: 'ok', rowCount: 1, body: { item } }; }
      const item = tail === 'synthesis/latest' ? await getLatestSynthesis(db, eng.id) : await getReleasedSynthesis(db, eng.id);
      return { outcome: 'ok', rowCount: item ? 1 : 0, body: { item: item ?? null } };
    },
  };
}

/** The released synthesis made in GSAM: stored, re-verified here and released, or refused with nothing written. */
export async function pushSynthesis(db, ctx, roundId, body) {
  const eng = await ownedRound(db, ctx, roundId);
  const pushed = await pushReleasedSynthesis(db, ctx, eng, body);
  return { status: 200, body: { ...pushed, round: await roundView(db, await ownedRound(db, ctx, roundId)) }, rowCount: 1,
    resourceId: roundId };
}

/** The write route (write capability) for a POST under /api/admin/v1/interview/, or null. */
export function interviewWriteRoute(method, p) {
  const at = method === 'POST' ? roundPath(p) : null;
  if (!at) return null;
  const after = [];
  const { roundId, tail } = at;
  const route = (fn) => ({
    capability: 'write', after,
    run: (client, ctx, body) => fn(interviewDbOnClient(client, { org: ctx.org, customer_id: at.customerId }),
      { ...ctx, customerId: at.customerId }, body),
  });
  if (!tail.length) return route((db, ctx, body) => saveRound(db, ctx, roundId, body));
  if (tail.length === 1 && tail[0] === 'invites') return route((db, ctx, body) => invitePeople(db, ctx, roundId, body, after));
  if (tail.length === 1 && tail[0] === 'close') return route((db, ctx, body) => closeRound(db, ctx, roundId, body));
  // synthesis is made in GSAM; the site's own run is the fallback
  if (tail.length === 2 && tail[0] === 'synthesis' && tail[1] === 'released') return route((db, ctx, body) => pushSynthesis(db, ctx, roundId, body));
  if (tail.length === 1 && tail[0] === 'synthesis') return route((db, ctx, body) => startSynthesis(db, ctx, roundId, body, after));
  if (tail.length === 2 && tail[0] === 'synthesis' && tail[1] === 'withdraw') return route((db, ctx, body) => withdraw(db, ctx, roundId, body));
  if (tail.length === 3 && tail[0] === 'synthesis' && tail[2] === 'release') return route((db, ctx, body) => release(db, ctx, roundId, tail[1], body));
  return null;
}
