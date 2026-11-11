// The deploy ticket (John, 11 Nov: the lean Deploy). GSAM signs one when John presses Deploy or Roll back, and the
// production workflow passes it to deploy-site.mjs, which refuses greatstone-home without a good one. A ticket is
// `<payload>.<signature>`, both base64url: the payload is JSON, the signature is Ed25519 over the payload text,
// made with a private key only GSAM's server holds. The public half is the GSAM_DEPLOY_PUBLIC_KEY variable of the
// GitHub `production` environment (the 32-byte raw key, base64url, as GSAM shows it). Single use is enforced by
// the caller, which claims `id` once in greatstone-home's Blobs.
import { createPublicKey, verify } from 'node:crypto';

/** A ticket lives 15 minutes; one that claims to live longer is refused, so a leaked ticket dies quickly. */
export const TICKET_MAX_MS = 15 * 60 * 1000;
const SKEW_MS = 60 * 1000;

const refuse = (why) => new Error(`deploy ticket refused: ${why}`);

/** The ticket's payload when the signature is GSAM's and it has not expired; throws otherwise. */
export function verifyTicket(ticket, publicKey, now = Date.now()) {
  if (!ticket) throw refuse('no ticket (Deploy and Roll back start only from GSAM)');
  if (!publicKey) throw refuse('GSAM_DEPLOY_PUBLIC_KEY is not set');
  const [body, signature, extra] = String(ticket).trim().split('.');
  if (!body || !signature || extra !== undefined) throw refuse('malformed');
  let key;
  try { key = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: publicKey.trim() }, format: 'jwk' }); }
  catch { throw refuse('GSAM_DEPLOY_PUBLIC_KEY is not an Ed25519 key'); }
  if (!verify(null, Buffer.from(body, 'utf8'), key, Buffer.from(signature, 'base64url'))) throw refuse('bad signature');
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { throw refuse('unreadable payload'); }
  if (payload?.v !== 1 || !['deploy', 'rollback'].includes(payload.action)) throw refuse('unknown version or action');
  if (typeof payload.id !== 'string' || !/^[0-9a-f-]{36}$/.test(payload.id)) throw refuse('no ticket id');
  if (typeof payload.exp !== 'number' || payload.exp < now) throw refuse('expired');
  if (payload.exp > now + TICKET_MAX_MS + SKEW_MS) throw refuse('lives longer than 15 minutes');
  return payload;
}

// The production workflow's first step: check the ticket with main's copy of this file and print what the next
// steps need, as GITHUB_OUTPUT lines. deploy-site.mjs checks it again and claims it.
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const ticket = verifyTicket(process.env.GSAM_DEPLOY_TICKET, process.env.GSAM_DEPLOY_PUBLIC_KEY);
    if (ticket.action === 'deploy' && !/^[0-9a-f]{40}$/.test(ticket.sha || '')) throw refuse('no commit');
    console.log(`action=${ticket.action}`);
    console.log(`sha=${ticket.action === 'deploy' ? ticket.sha : ''}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
