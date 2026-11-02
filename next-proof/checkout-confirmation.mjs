export async function verifiedCheckoutSession(id, key, fetchImpl = fetch) {
  if (!/^cs_test_[A-Za-z0-9]+$/.test(id || '') || !key?.startsWith('sk_test_')) return false;
  try {
    const response = await fetchImpl(`https://api.stripe.com/v1/checkout/sessions/${id}`, {
      headers: { authorization: `Bearer ${key}` }, cache: 'no-store',
    });
    if (!response.ok) return false;
    const session = await response.json();
    return session.id === id && session.status === 'complete' && session.payment_status === 'paid' && session.livemode === false;
  } catch { return false; }
}
