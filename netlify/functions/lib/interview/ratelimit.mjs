// Port of SOURCE src/lib/ratelimit.ts @505ba6a. Fail-open behaviour unchanged.
// Port: `supabaseService()` replaced by an injected `db` (interviewDb) as the FIRST parameter:
// withinRate(db, key, windowSecs, limit). `import 'server-only'` removed.

/**
 * Rate limiting backed by the bump_rate() SQL function (migration 0007).
 *
 * Fixed-window counter: each call increments a per-key counter for the current
 * window and returns whether the request is still within the limit. The
 * increment-and-check is atomic in one upsert, so it is correct across the
 * many short-lived serverless invocations a Vercel deployment spreads work
 * over (an in-process counter would not be).
 *
 * Fails OPEN: if the limiter itself errors, a real participant must never be
 * blocked mid-interview, so we allow the request and log. The limiter is a
 * cost/abuse backstop, not a correctness gate.
 *
 * @param {any} db interviewDb client
 * @param {string} key
 * @param {number} windowSecs
 * @param {number} limit
 * @returns {Promise<boolean>}
 */
export async function withinRate(db, key, windowSecs, limit) {
  try {
    const { data, error } = await db.rpc('bump_rate', {
      p_key: key,
      p_window_secs: windowSecs,
      p_limit: limit,
    });
    if (error) {
      console.warn(`rate check failed (${key}): ${error.message}`);
      return true; // fail open
    }
    return data !== false;
  } catch (e) {
    console.warn(`rate check threw (${key}):`, e);
    return true; // fail open
  }
}
