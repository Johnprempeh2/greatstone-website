/**
 * Interview session: the parent of the Wave 2 seam.
 *
 * The 'session-page' op authorises (verified caller email -> employee row in
 * an active engagement), loads the active resumable session and its persisted
 * turns, and this page hands everything to ChatShell as plain props.
 *
 * Port: source app/(portal)/interview/session/page.tsx. The server component became the 'session-page' op
 * (data: { redirect } | { sessionId, phase, initialTurns: [{ id, role, content, … }], employeeName, voiceEnabled }).
 * The source's redirects ('/interview', '/interview/goodbye', '/interview/complete') arrive as hash redirects,
 * and voiceEnabled() (VOICE_ENABLED kill switch + DEEPGRAM_API_KEY) is decided on the server as before.
 */

import { ChatShell } from './ChatShell.jsx';
import { pageFallback } from './PageStatus.jsx';
import { InterviewSignIn } from './InterviewSignIn.jsx';
import { usePageOp } from './usePageOp.mjs';

export default function InterviewSession() {
  const page = usePageOp('session-page', {});
  const fallback = pageFallback(page, InterviewSignIn);
  if (fallback) return fallback;
  const d = page.data;
  return (
    <ChatShell
      key={d.sessionId}
      sessionId={d.sessionId}
      phase={d.phase}
      initialTurns={d.initialTurns ?? []}
      employeeName={d.employeeName}
      voiceEnabled={Boolean(d.voiceEnabled)}
    />
  );
}
