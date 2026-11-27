// My GSAM: the picker's running total and the plain-English subscription status.

/** The total for the picked item ids on one interval, or null when nothing priced is picked or currencies differ. */
export function gsamTotal(catalogue, ids, interval) {
  const prices = ids.map((id) => catalogue.find((item) => item.id === id)?.prices?.[interval]).filter(Boolean);
  if (!prices.length || prices.length !== ids.length || new Set(prices.map((p) => p.currency)).size > 1) return null;
  return { amount: prices.reduce((sum, p) => sum + p.amount, 0), currency: prices[0].currency.toUpperCase() };
}

const LABEL = { active: 'Active', trialing: 'Active (trial)', past_due: 'Payment failed: update your card', unpaid: 'Payment failed: update your card',
  incomplete: 'Waiting for payment', canceled: 'Ended', incomplete_expired: 'Ended' };

export const gsamStatusLabel = (sub) =>
  sub?.cancelAtPeriodEnd && sub.status === 'active' ? 'Active, ends at the end of the paid period' : LABEL[sub?.status] || 'Not known yet';

/**
 * Which download to offer first: 'windows', 'mac', or null when the browser does not say (a phone, Linux).
 * userAgentData.platform where the browser has it, else the user agent string.
 */
export function detectGsamPlatform(userAgent = '', uaPlatform = '') {
  const said = `${uaPlatform} ${userAgent}`.toLowerCase();
  if (/iphone|ipad|android/.test(said)) return null;
  if (/windows/.test(said)) return 'windows';
  if (/mac ?os|macintosh/.test(said)) return 'mac';
  return null;
}
