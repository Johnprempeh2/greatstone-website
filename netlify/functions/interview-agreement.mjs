// The client organisation accepts the interview data processing agreement in the client portal (GRE-2794, gate
// GRE-2656): /api/interview/agreement for a signed-in, verified website account of the organisation.
//   POST { op: 'status' }                 any member: the agreement, the summary and labels, and whether it is accepted
//   POST { op: 'accept', ...form }        company admin only: records the acceptance (lib/interview/agreement.mjs)
//   GET  ?copy=<acceptance id>            company admin only: the accepted agreement with its record, as an HTML file
// The caller's organisation and admin role come from customer_users under the site's RLS, never from the request.
// The acceptance is written in the same transaction, as interview_worker with system claims keyed to that organisation.
import { getPool } from './lib/db.mjs';
import { asCustomer } from './lib/customer-store.mjs';
import { authIdentity } from './lib/better-auth.mjs';
import { interviewDbOnClient } from './lib/interview/db.mjs';
import { json, participantFromRequest, interviewEnabled } from './lib/interview/caller.mjs';
import { CURRENT, WORDING, acceptanceCopyHtml, acceptanceHistory, acceptanceView, agreementHtml, agreementState, checkAcceptance,
  copyFilename, recordAcceptance } from './lib/interview/agreement.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clientIp = (req, context) => String(context?.ip || req.headers.get('x-nf-client-connection-ip')
  || (req.headers.get('x-forwarded-for') ?? '').split(',')[0] || 'unknown').trim().slice(0, 64);
// rendered once: the text never changes for a version
const TEXT_HTML = agreementHtml(CURRENT.text);

async function asMember(pool, caller, work) {
  return asCustomer(pool, authIdentity({ id: caller.id, email: caller.email, emailVerified: true }), async (client) => {
    const { rows: [me] } = await client.query(`SELECT cu.id, cu.customer_id, cu.email, coalesce(nullif(btrim(cu.full_name), ''), $2) AS name,
        (cu.role = 'admin' OR cu.is_primary) AS admin, c.name AS organisation_name
      FROM customer_users cu JOIN customers c ON c.id = cu.customer_id
      WHERE cu.auth_subject = $1 AND cu.deleted_at IS NULL AND c.deleted_at IS NULL LIMIT 1`, [caller.id, caller.name || '']);
    if (!me) return { none: true };
    return work(me, interviewDbOnClient(client, { customer_id: me.customer_id }));
  });
}

export function makeAgreementHandler({ pool = getPool, verify, env = process.env, log = console } = {}) {
  return async (req, context) => {
    if (!interviewEnabled(env)) return json({ error: 'Not found' }, 404);
    if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'Use POST.' }, 405);
    let body = null;
    if (req.method === 'POST') {
      if (Number(req.headers.get('content-length')) > 8192) return json({ error: 'Invalid request.' }, 400);
      try { body = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
      if (!body || !['status', 'accept'].includes(body.op)) return json({ error: 'Invalid operation.' }, 400);
    }
    const copyId = req.method === 'GET' ? new URL(req.url).searchParams.get('copy') : null;
    if (req.method === 'GET' && !UUID.test(copyId || '')) return json({ error: 'Invalid request.' }, 400);
    let caller;
    try { caller = await participantFromRequest(req, verify); } catch { caller = null; }
    if (!caller) return json({ error: 'Sign in required.' }, 401);
    if (caller.unverified) return json({ error: 'Please verify your email first.', unverified: true }, 403);
    const p = pool();
    if (!p) return json({ error: 'Unavailable. Please try again.' }, 503);
    try {
      if (copyId) {
        const out = await asMember(p, caller, async (me, db) => {
          if (!me.admin) return { denied: true };
          const row = (await acceptanceHistory(db, me.customer_id)).find((r) => r.id === copyId.toLowerCase());
          return row ? { row } : { missing: true };
        });
        if (out.none || out.denied) return json({ error: 'Only a company admin can download the agreement.' }, 403);
        const html = out.row && acceptanceCopyHtml(out.row);
        if (!html) return json({ error: 'Not found' }, 404);
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
          'x-content-type-options': 'nosniff', 'content-disposition': `attachment; filename="${copyFilename(out.row)}"` } });
      }
      const { op, ...form } = body;
      if (op === 'status') {
        const out = await asMember(p, caller, async (me, db) => ({ me, state: await agreementState(db, me.customer_id),
          history: me.admin ? (await acceptanceHistory(db, me.customer_id)).map(acceptanceView) : [] }));
        if (out.none) return json({ error: 'Your account is not linked to an organisation.' }, 403);
        return json({ data: {
          agreement: { key: CURRENT.key, version: CURRENT.version, contentSha256: CURRENT.sha256, html: TEXT_HTML },
          wording: WORDING, isAdmin: out.me.admin, organisationName: out.me.organisation_name, defaultName: out.me.name,
          accepted: out.state.accepted, acceptance: out.state.acceptance, history: out.history,
        } });
      }
      const checked = checkAcceptance(form);
      if (checked.error) return json({ error: checked.error, stale: checked.stale === true }, checked.stale ? 409 : 400);
      const out = await asMember(p, caller, async (me, db) => {
        if (!me.admin) return { denied: true };
        return recordAcceptance(db, { customerId: me.customer_id,
          who: { userId: caller.id, customerUserId: me.id, email: caller.email }, form: checked.value,
          ip: clientIp(req, context), userAgent: req.headers.get('user-agent') });
      });
      if (out.none || out.denied) return json({ error: 'Only a company admin can accept the agreement for your organisation.' }, 403);
      return json({ data: { accepted: true, created: out.created, acceptance: acceptanceView(out.row) } }, out.created ? 201 : 200);
    } catch (error) {
      log.error(`interview-agreement: failed (${error?.code || error?.name || 'error'})`);
      return json({ error: 'Something went wrong on our side. Please try again.' }, 500);
    }
  };
}

export default makeAgreementHandler();
export const config = { path: '/api/interview/agreement' };
