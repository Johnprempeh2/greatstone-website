// The key's mode decides which sessions can confirm: a test key only test sessions, a live key only live ones.
export async function verifiedCheckoutSession(id, key, fetchImpl = fetch) {
  const mode = /^(?:sk|rk)_(test|live)_/.exec(key || '')?.[1];
  if (!mode || !new RegExp(`^cs_${mode}_[A-Za-z0-9]+$`).test(id || '')) return false;
  try {
    const response = await fetchImpl(`https://api.stripe.com/v1/checkout/sessions/${id}`, {
      headers: { authorization: `Bearer ${key}` }, cache: 'no-store',
    });
    if (!response.ok) return false;
    const session = await response.json();
    return session.id === id && session.status === 'complete' && session.payment_status === 'paid'
      && session.livemode === (mode === 'live');
  } catch { return false; }
}
