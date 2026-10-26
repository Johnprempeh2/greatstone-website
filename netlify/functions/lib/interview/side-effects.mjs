// Steps the interview bridge routes queue for after their transaction commits (GRE-2612): invite emails through the
// site's Resend account, and the hand-off to the synthesis background function. Neither ever calls GSAM.
import { sendEmail } from '../../../../supabase/functions/_shared/front-door-leads.mjs';

export function interviewMailer(env = process.env, send = sendEmail) {
  return async ({ to, subject, text }) => {
    if (!env.RESEND_API_KEY || !env.RESEND_FROM) return false;
    const result = await send({ apiKey: env.RESEND_API_KEY, from: env.RESEND_FROM, to, subject, text });
    return result.sent === true;
  };
}

/** Starts interview-synthesis-background for one run. The function checks the shared secret before anything else. */
export async function startSynthesisRun({ runId, engagementId, origin }, env = process.env, fetchImpl = fetch) {
  const secret = env.INTERVIEW_INTERNAL_SECRET;
  if (!secret || secret.length < 32) throw new Error('INTERVIEW_INTERNAL_SECRET is not set');
  const res = await fetchImpl(`${origin}/.netlify/functions/interview-synthesis-background`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-interview-internal': secret },
    body: JSON.stringify({ runId, engagementId }),
  });
  // a background function answers 202 at once
  if (res.status !== 202 && !res.ok) throw new Error(`synthesis start answered ${res.status}`);
}
