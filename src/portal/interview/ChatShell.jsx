/**
 * ChatShell: the interview chat surface, replicated from screen 2 of the
 * signed-off mockup — now carrying the Wave 2 live engine.
 *
 * The engine speaks to /api/interview/chat: one short streaming request per turn.
 * The composer sends the user's message (rendered optimistically), the agent
 * reply streams in behind TypingDots, the phase dots advance live on the
 * stream's phase event, and a `complete` signal moves on to
 * #portal/interview/complete. Resume is free: state lives in the database, so a
 * reopened session re-renders the persisted transcript, and if the last
 * persisted turn is from the user (a crash mid-stream), mount fires a
 * recovery turn that asks the agent to carry on.
 *
 * Port: source components/ChatShell.tsx. Next plumbing replaced, nothing else:
 *   - router.push('/interview/complete') → location.hash '#portal/interview/complete';
 *     router.push('/') and <Link href="/"> → the portal home hash.
 *   - /api/chat → /api/interview/chat (same body, same SSE events), with the session cookie.
 *   - pauseSession(sessionId) / discardSession() server actions → the 'pause' / 'discard' portal ops; the
 *     discard op answers with the redirect the action used to issue.
 *   - The SSE frame parsing moved verbatim into api.mjs (parseSseFrames) so it is unit tested.
 *   - Accessibility: the streaming reply sits in an aria-live region (the source had none on the stream).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { GsLogo } from './GsLogo.jsx';
import { PhaseDots, PHASE_LABELS } from './PhaseDots.jsx';
import { ChatMessage, TypingDots, AgentAvatar } from './ChatMessage.jsx';
import { ConfirmDialog } from './ConfirmDialog.jsx';
import { useVoice } from './voice/useVoice.mjs';
import { CHAT_URL, portalOp, followRedirect, navigate, parseSseFrames } from './api.mjs';
import { interviewHref, PORTAL_HOME_HASH } from './route.mjs';
import { VOICE_HINT, lastAgentTurnId as findLastAgentTurnId, needsKickoff, newClientTurnId } from './model.mjs';

const COMPLETE_HASH = interviewHref('complete');

// Port: the source's `router` object, as hash navigation.
const router = {
  push: (hash) => navigate(hash),
};

export function ChatShell({ sessionId, phase: initialPhase, initialTurns, voiceEnabled = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [whoSeesOpen, setWhoSeesOpen] = useState(false);
  const [phase, setPhase] = useState(initialPhase);
  const [turns, setTurns] = useState(initialTurns.map((t) => ({ id: t.id, role: t.role, content: t.content })));
  const [draft, setDraft] = useState('');
  const [streamText, setStreamText] = useState(null); // null = not streaming
  const [busy, setBusy] = useState(false);
  const [errorNote, setErrorNote] = useState(null);

  const streamRef = useRef(null);
  // Monotonic, so spoken turns get stable React keys without reaching for
  // randomness (two utterances can land in the same millisecond).
  const voiceSeq = useRef(0);
  const textareaRef = useRef(null);
  const kickoffFired = useRef(false);

  // Close the kebab menu on any outside click, like the mockup.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuOpen]);

  // Open on the latest message; follow the stream as it grows.
  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, streamText]);

  // Put an un-saved message back: drop its optimistic bubble and restore the
  // draft (only when the composer is empty, so a freshly-typed message is kept).
  const restoreUnsent = useCallback((content, clientTurnId) => {
    if (clientTurnId) setTurns((prev) => prev.filter((t) => t.id !== `local-${clientTurnId}`));
    if (content !== undefined) setDraft((d) => (d.trim() ? d : content));
  }, []);

  /**
   * A spoken turn, from either side. In voice the transcript is written server
   * side by the think endpoint, so the browser never sees a response to render
   * from. We show what was actually said and let the database stay
   * authoritative: a refresh re-renders the persisted transcript.
   */
  const handleVoiceTurn = useCallback((role, content) => {
    if (!content.trim()) return;
    voiceSeq.current += 1;
    setTurns((prev) => [...prev, { id: `voice-${voiceSeq.current}`, role, content }]);
  }, []);

  const voice = useVoice({ sessionId, onTurn: handleVoiceTurn });

  /**
   * One round-trip to /api/interview/chat. `content` undefined means kickoff/recovery:
   * no user turn is persisted; the agent simply produces its next message.
   */
  const requestTurn = useCallback(
    async (content, clientTurnId, isRetry = false) => {
      setBusy(true);
      setErrorNote(null);
      setStreamText(''); // typing indicator from the first moment

      try {
        const res = await fetch(CHAT_URL, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, content, clientTurnId }),
        });

        if (!res.ok || !res.body) {
          let payload = null;
          try {
            payload = await res.json();
          } catch {
            // non-JSON error body; fall through to status handling
          }
          // Session genuinely finished (this tab or another): move on.
          if (payload?.complete) {
            router.push(COMPLETE_HASH);
            return;
          }
          // The original request is still saving this turn (a concurrent
          // duplicate): retry ONCE with the same id, by which point the reply
          // is ready to replay.
          if (res.status === 409 && payload?.retry) {
            if (!isRetry && content !== undefined && clientTurnId) {
              await new Promise((r) => setTimeout(r, 1000));
              return requestTurn(content, clientTurnId, true);
            }
            setStreamText(null);
            setErrorNote('Just a moment while your last message saves — please send it again.');
            restoreUnsent(content, clientTurnId);
            return;
          }
          // A bare 409 = the session ended elsewhere.
          if (res.status === 409) {
            router.push(COMPLETE_HASH);
            return;
          }
          if (res.status === 429) {
            // Rate limited / length cap: nothing was saved. Surface it and put
            // the message back so it is never silently lost from the transcript.
            setStreamText(null);
            setErrorNote(payload?.error ?? 'That came through very fast — give it a few seconds and try again.');
            restoreUnsent(content, clientTurnId);
            return;
          }
          throw new Error(`Request failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let agentText = '';

        const handle = (event) => {
          switch (event.type) {
            case 'meta':
              if (event.phase) setPhase(event.phase);
              break;
            case 'delta':
              agentText += event.text ?? '';
              setStreamText(agentText);
              break;
            case 'reset':
              // The server hit a transient overload and is re-streaming this
              // turn: drop the partial so the retry does not concatenate.
              // Empty string (not null) keeps the bare typing indicator up
              // through the backoff until the fresh reply arrives.
              agentText = '';
              setStreamText('');
              break;
            case 'done':
              setTurns((prev) => [
                ...prev,
                {
                  id: event.agentTurnId ?? `local-${Date.now()}`,
                  role: 'agent',
                  content: agentText,
                },
              ]);
              setStreamText(null);
              if (event.phase) setPhase(event.phase);
              if (event.complete) {
                // Sign-off finished: the read-back screen takes over —
                // insights read back for checking, then the two consent
                // moments are confirmed properly.
                setTimeout(() => router.push(COMPLETE_HASH), 1800);
              }
              break;
            case 'error':
              setStreamText(null);
              setErrorNote(event.message ?? 'Something went wrong. Your words are safe — try again.');
              break;
          }
        };

        // Parse the SSE frames ("data: {json}\n\n") off the byte stream.
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { events, rest } = parseSseFrames(buffer);
          buffer = rest;
          for (const event of events) handle(event);
        }
      } catch (e) {
        // Network/5xx blip: auto-retry ONCE with the SAME clientTurnId so the
        // server collapses the duplicate turn and simply re-streams the reply.
        if (!isRetry && content !== undefined && clientTurnId) {
          await new Promise((r) => setTimeout(r, 800));
          return requestTurn(content, clientTurnId, true);
        }
        console.error('turn failed:', e);
        setStreamText(null);
        setErrorNote('The connection hiccupped. Nothing you said was lost — please send that again.');
        restoreUnsent(content, clientTurnId);
      } finally {
        setBusy(false);
      }
    },
    [sessionId, restoreUnsent]
  );

  // Kickoff and crash recovery: a fresh session has no turns (the agent owes
  // the opening message); a session whose last persisted turn is from the
  // user lost the agent reply mid-stream. Both resolve with one contentless
  // request on mount.
  useEffect(() => {
    if (kickoffFired.current) return;
    if (needsKickoff(turns)) {
      kickoffFired.current = true;
      void requestTurn();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = () => {
    const content = draft.trim();
    if (!content || busy) return;
    setDraft('');
    // A stable id for this message: reused on auto-retry so a stutter never
    // writes the turn twice. Optimistic bubble; server insert confirmed via stream.
    const clientTurnId = newClientTurnId();
    setTurns((prev) => [...prev, { id: `local-${clientTurnId}`, role: 'user', content }]);
    void requestTurn(content, clientTurnId);
  };

  // Branded confirmation dialogs (never the native browser confirm()).
  const [dialog, setDialog] = useState(null);
  const [discarding, setDiscarding] = useState(false);

  const confirmPause = () => {
    setDialog(null);
    // Snapshot progress to the outbox first (the pause op enqueues a
    // session_paused event), THEN return the person to their portal — NOT sign
    // them out. The session stays resumable (status 'started', ended_at null).
    // A pause that cannot enqueue must never trap anyone, so failures are
    // swallowed and we navigate home regardless.
    void portalOp('pause', { sessionId })
      .catch(() => {})
      .then(() => router.push(PORTAL_HOME_HASH));
  };

  const confirmDiscard = () => {
    setDiscarding(true);
    // Hard delete + withdrawal consent + status reset, then the redirect to
    // the "nothing was kept" page.
    void portalOp('discard', {}).then(({ data, error }) => {
      if (error || !followRedirect(data)) {
        setDiscarding(false);
        setDialog(null);
      }
    });
  };

  const lastAgentTurnId = findLastAgentTurnId(turns);
  const streaming = streamText !== null;

  return (
    <main className="screen is-chat" aria-label="Interview conversation" data-session-id={sessionId}>
      <header className="chat-bar">
        <div className="chat-bar-inner">
          {/* Quiet route home: no confirm needed, state persists by design. */}
          <a
            href={PORTAL_HOME_HASH}
            title="Back to your portal"
            aria-label="Back to your portal"
            style={{ flexShrink: 0, lineHeight: 0, textDecoration: 'none' }}
          >
            <GsLogo />
          </a>
          <div className="chat-bar-actions">
            {/* Pure navigation home — no confirm, no sign-out; the session stays
                resumable so nothing is lost. This is the labelled counterpart to
                the logo link, answering "how do I get back to my dashboard?". */}
            <a
              href={PORTAL_HOME_HASH}
              className="btn btn-ghost btn-sm"
              title="Back to your dashboard"
              aria-label="Back to your dashboard"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M19 12H5" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              <span className="save-label">Dashboard</span>
            </a>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setDialog('pause')}>
              <svg viewBox="0 0 24 24">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              <span className="save-label">Save and finish later</span>
            </button>
            <div className={menuOpen ? 'overflow-wrap open' : 'overflow-wrap'}>
              <button
                className="icon-btn"
                type="button"
                aria-label="More options"
                aria-expanded={menuOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((open) => !open);
                }}
              >
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="5" r="1" />
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="12" cy="19" r="1" />
                </svg>
              </button>
              <div className="overflow-menu" role="menu">
                <button className="overflow-item" type="button" role="menuitem" onClick={() => setWhoSeesOpen(true)}>
                  <svg viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" />
                    <line x1="12" y1="8" x2="12" y2="13" />
                    <circle cx="12" cy="16.5" r="0.5" />
                  </svg>
                  <span>
                    <span className="oi-name">How this works</span>{' '}
                    <span className="oi-sub">What happens to what you say</span>
                  </span>
                </button>
                <button
                  className="overflow-item danger"
                  type="button"
                  role="menuitem"
                  disabled={discarding}
                  onClick={() => setDialog('discard')}
                >
                  <svg viewBox="0 0 24 24">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                  <span>
                    <span className="oi-name">{discarding ? 'Discarding…' : 'Stop and discard everything'}</span>{' '}
                    <span className="oi-sub">Ends now. Nothing you said is kept.</span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="phase-strip">
          <PhaseDots phase={phase} showLabel />
          <button
            className="who-sees-btn"
            type="button"
            aria-expanded={whoSeesOpen}
            onClick={() => setWhoSeesOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24">
              <path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z" />
            </svg>
            Who sees this?
          </button>
        </div>

        <div className={whoSeesOpen ? 'who-sees-panel open' : 'who-sees-panel'}>
          <div>
            <div className="who-sees-card">
              <strong>Only themes and quotes are shared, never this transcript.</strong> Your manager will see the
              patterns across the whole team and short quotes. You choose at the end whether your name appears
              next to your words. Skip anything you like, and if you stop the conversation, nothing is kept.
            </div>
          </div>
        </div>
      </header>

      <div className="chat-stream" ref={streamRef}>
        <div className="chat-stream-inner">
          <div className="chat-divider">
            <span>{PHASE_LABELS[phase]}</span>
          </div>

          {turns.map((turn) => (
            <ChatMessage key={turn.id} role={turn.role} isQuestion={!streaming && turn.id === lastAgentTurnId}>
              {turn.content}
            </ChatMessage>
          ))}

          {/* Port: screen readers hear each reply once it has finished streaming, not every delta. */}
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {!streaming && turns.length && turns[turns.length - 1].role === 'agent'
              ? `Everest: ${turns[turns.length - 1].content}`
              : ''}
          </div>

          {streaming ? (
            streamText ? (
              <ChatMessage role="agent" typing>
                {streamText}
              </ChatMessage>
            ) : (
              // Reply not started yet: bare typing indicator bubble.
              <div className="msg msg-agent">
                <AgentAvatar />
                <div>
                  <div className="bubble">
                    <TypingDots />
                  </div>
                  <div className="msg-meta">Everest · typing</div>
                </div>
              </div>
            )
          ) : null}

          {errorNote ? (
            <div className="notice-card" role="status">
              <strong>One moment.</strong> {errorNote}
            </div>
          ) : null}
        </div>
      </div>

      <div className="composer-zone">
        <div className="composer-inner">
          {/* WAVE 2 live engine: wired composer. */}
          <div className="composer">
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder="Type your answer, take your time"
              aria-label="Your answer"
              value={draft}
              disabled={busy && !streaming}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button className="icon-btn is-soon" type="button" aria-label="Attach a file, coming soon" aria-disabled="true">
              <svg viewBox="0 0 24 24">
                <path d="M21.4 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <button
              className={`icon-btn${voiceEnabled ? (voice.active ? ' is-live' : '') : ' is-soon'}`}
              type="button"
              aria-label={!voiceEnabled ? 'Voice note, coming soon' : voice.active ? 'End voice mode' : 'Answer out loud'}
              aria-pressed={voiceEnabled ? voice.active : undefined}
              aria-disabled={voiceEnabled ? undefined : 'true'}
              disabled={voiceEnabled ? busy || voice.state === 'connecting' : false}
              onClick={() => {
                if (!voiceEnabled) return;
                if (voice.active) void voice.stop();
                else void voice.start();
              }}
            >
              <svg viewBox="0 0 24 24">
                <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
                <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                <line x1="12" y1="18" x2="12" y2="22" />
              </svg>
              {!voiceEnabled && <span className="soon-flag">Soon</span>}
            </button>
            <button className="send-btn" type="button" aria-label="Send" disabled={busy || !draft.trim()} onClick={send}>
              <svg viewBox="0 0 24 24">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
          <div className="composer-hint" aria-live="polite">
            {voice.error ? (
              <span className="voice-error">{voice.error}</span>
            ) : voice.active ? (
              VOICE_HINT[voice.state]
            ) : (
              'Short answers are fine. There are no wrong answers here.'
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={dialog === 'pause'}
        title="Pause here?"
        confirmLabel="Save and finish"
        cancelLabel="Keep going"
        onConfirm={confirmPause}
        onCancel={() => setDialog(null)}
      >
        Everything so far is saved. The conversation will be waiting exactly where you left it next time you open
        your link.
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'discard'}
        title="Stop and discard everything?"
        confirmLabel={discarding ? 'Discarding…' : 'Discard everything'}
        cancelLabel="Go back"
        danger
        busy={discarding}
        onConfirm={confirmDiscard}
        onCancel={() => setDialog(null)}
      >
        Every answer in this conversation will be permanently deleted and nothing will be kept. This cannot be
        undone, though you can always start fresh later.
      </ConfirmDialog>
    </main>
  );
}
