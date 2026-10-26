/**
 * Voice mode, from the chat surface's point of view.
 *
 * The hook owns the awkward parts so ChatShell does not have to: asking our
 * server for a credential, loading the audio engine only when it is actually
 * wanted, keeping the transcript in step with what is being said, and tearing
 * everything down cleanly when the tab closes.
 *
 * Two things worth knowing:
 *
 *   THE ENGINE IS LOADED LAZILY. Audio worklets, PCM conversion and the
 *   barge-in classifier are dead weight for the many participants who will
 *   just type, so the import happens on the first click rather than at page
 *   load.
 *
 *   TURNS RENDER OPTIMISTICALLY. In voice the transcript is written server
 *   side by the think endpoint, which the browser never calls and so never
 *   hears back from. Rather than poll, we render what Deepgram tells us was
 *   said. The database stays authoritative: a refresh shows the persisted
 *   transcript, and any drift resolves in its favour.
 *
 * Port: source src/components/useVoice.ts, types dropped. `/api/voice/start` → `/api/interview/voice/start`
 * (same body `{ sessionId }`, same `{ deepgramToken, settings }` reply), sent with the session cookie.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { VOICE_START_URL } from '../api.mjs';

export function useVoice({ sessionId, onTurn }) {
  const [state, setState] = useState('idle');
  const [error, setError] = useState(null);
  const [muted, setMutedState] = useState(false);
  const clientRef = useRef(null);

  // Handlers are called from audio callbacks that outlive a render, so they
  // read through a ref rather than closing over a stale onTurn.
  const onTurnRef = useRef(onTurn);
  useEffect(() => {
    onTurnRef.current = onTurn;
  }, [onTurn]);

  const stop = useCallback(async () => {
    const c = clientRef.current;
    clientRef.current = null;
    if (c) await c.stop();
    setState('idle');
  }, []);

  const start = useCallback(async () => {
    if (clientRef.current) return;
    setError(null);
    setState('connecting');

    try {
      // Credential and Settings are both minted server side: the browser is
      // never trusted with the Deepgram key, nor with composing the Settings
      // that point at the endpoint driving a real interview.
      const res = await fetch(VOICE_START_URL, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'Voice is not available right now');
      }
      const { deepgramToken, settings } = await res.json();

      const { VoiceClient } = await import('./browser-client.mjs');
      const client = new VoiceClient();
      clientRef.current = client;

      await client.start({
        deepgramToken,
        settings,
        handlers: {
          onState: (s) => setState(s),
          onAgentText: (t) => onTurnRef.current('agent', t),
          onUserText: (t) => onTurnRef.current('user', t),
          onError: (m) => setError(m),
          onClosed: () => {
            clientRef.current = null;
            setState('idle');
          },
        },
      });
    } catch (e) {
      clientRef.current = null;
      setState('idle');
      setError(
        e instanceof Error
          ? // The browser's own permission message is jargon; say what to do.
            /permission|denied|NotAllowed/i.test(e.message)
            ? 'Microphone access was blocked. Allow it in your browser settings, then try again.'
            : e.message
          : 'Could not start voice mode',
      );
    }
  }, [sessionId]);

  const toggleMute = useCallback(() => {
    setMutedState((m) => {
      const next = !m;
      clientRef.current?.setMuted(next);
      return next;
    });
  }, []);

  // A live microphone and a billed socket must not survive the page. Voice
  // Agent bills on connection time, so a leaked session costs money silently.
  // Port: in the single-page site, leaving the session view unmounts ChatShell without a pagehide, so the
  // unmount cleanup below (already in the source) is what releases the mic on a hash change.
  useEffect(() => {
    const bail = () => {
      void clientRef.current?.stop();
      clientRef.current = null;
    };
    window.addEventListener('pagehide', bail);
    return () => {
      window.removeEventListener('pagehide', bail);
      bail();
    };
  }, []);

  return {
    state,
    error,
    muted,
    active: state !== 'idle' && state !== 'ended',
    start,
    stop,
    toggleMute,
    clearError: () => setError(null),
  };
}
