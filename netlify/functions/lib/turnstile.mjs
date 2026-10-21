// Cloudflare Turnstile check for a public form. Returns { ok, reason }:
//   no secret configured → ok (the check is off; the per-IP limit still applies), reason 'off'
//   no or odd token      → not ok
//   Cloudflare says no   → not ok
//   Cloudflare unreachable → ok, reason 'unreachable': an outage there must not cost us a real lead
export async function verifyTurnstile({ secret, token, ip = '', fetchImpl = (...a) => fetch(...a) }) {
  if (!secret) return { ok: true, reason: 'off' };
  if (typeof token !== 'string' || !token || token.length > 4096) return { ok: false, reason: 'missing' };
  let out;
  try {
    const form = new FormData();
    form.append('secret', secret);
    form.append('response', token);
    if (ip) form.append('remoteip', ip);
    const res = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    out = await res.json();
  } catch (e) {
    return { ok: true, reason: 'unreachable' };
  }
  return out && out.success === true ? { ok: true, reason: 'passed' } : { ok: false, reason: 'failed' };
}
