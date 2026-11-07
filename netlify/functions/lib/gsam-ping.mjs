// Tells GSAM something new arrived so it pulls this site now instead of polling it (GSAM PR 1094). The ping
// carries no data and no key: GSAM fetches over its own signed bridge. GSAM_PING_URL unset: no ping.
export async function pingGsam(env = process.env, fetchImpl = (...a) => fetch(...a)) {
  const url = env.GSAM_PING_URL;
  if (!url) return false;
  try {
    await fetchImpl(url, { method: 'POST', signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false; // the twice-daily pull still picks it up
  }
}
