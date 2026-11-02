import { createHash, createPrivateKey, randomBytes, sign } from 'node:crypto';
import { canonicalString } from './admin-bridge-auth.mjs';

export async function sendDeepDiveAnswer(row, { baseUrl = process.env.GSAM_DEEP_DIVE_BASE_URL,
  keyJson = process.env.GSAM_DEEP_DIVE_SITE_KEY, fetchImpl = fetch, now = Date.now } = {}) {
  if (!baseUrl || !keyJson) return false;
  let credential;
  try { credential = JSON.parse(keyJson); } catch { return false; }
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(credential?.kid || '') || !credential.privateKey) return false;
  const url = new URL(`/api/website-bridge/v1/tenants/${row.tenant_id}/document-requests/${row.request_id}/answer`, baseUrl);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) return false;
  const body = JSON.stringify({ answerId: row.answer_id, answeredBy: {
    customerId: row.customer_id, name: row.name, email: row.email }, note: row.note, fileName: row.file_name || null });
  const time = Math.floor(now() / 1000);
  const nonce = randomBytes(16).toString('base64url');
  const actor = `client:${row.customer_id}`;
  let signature;
  try {
    const privateKey = createPrivateKey(credential.privateKey);
    if (privateKey.asymmetricKeyType !== 'ed25519') return false;
    const canonical = canonicalString({ method: 'POST', host: url.host, path: url.pathname, time, nonce, actor,
      bodySha256: createHash('sha256').update(body).digest('hex') });
    signature = sign(null, Buffer.from(canonical), privateKey).toString('base64url');
  } catch { return false; }
  try {
    const response = await fetchImpl(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { 'content-type': 'application/json', 'x-gs-bridge-key': credential.kid, 'x-gs-bridge-time': String(time),
        'x-gs-bridge-nonce': nonce, 'x-gs-bridge-actor': actor, 'x-gs-bridge-signature': signature }, body });
    if (!response.ok) return false;
    const result = await response.json();
    return result?.ok === true && result.requestId === row.request_id;
  } catch { return false; }
}
