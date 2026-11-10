'use client';

// The website guide: a small "Talk to us" button on public pages that opens a panel where a visitor can speak or
// type, read both sides of the conversation, and tap the pages the guide suggests.
// It is mounted once, in the root layout, and only when VOICE_GUIDE_ENABLED is 1. The microphone is never opened
// without a press on Speak. The voice call reuses the interview's browser engine; nothing here knows a key.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './voice-guide.css';
import { addMessage, cleanAction, displayText, historyFor, isPublicPath, micMessage, safePath, STATUS_LABEL, statusFromVoice, voiceSupported } from './guide-client.mjs';

const WHO = { you: 'You', guide: 'Guide' };
const UNREACHABLE = 'Sorry, the guide could not be reached. Please check your connection and try again.';

// What went wrong, in plain words that are safe to show as they are (the server's own, or ours).
const told = (data) => Object.assign(new Error(typeof data?.message === 'string' ? data.message : 'Sorry, something went wrong. Please try again.'),
  { told: true, contactPath: safePath(data?.contactPath) });

async function post(route, body) {
  const response = await fetch(`/api/guide/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    .catch(() => { throw told({ message: UNREACHABLE }); });
  return { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) };
}

export default function VoiceGuide() {
  const pathname = usePathname();
  const shown = isPublicPath(pathname);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('idle');
  const [calling, setCalling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [voiceOff, setVoiceOff] = useState(false);
  const [problem, setProblem] = useState(null);
  const [draft, setDraft] = useState('');

  const session = useRef(null); // { token, expiresAt }: started on the first real action, never on opening the panel
  const call = useRef(null); // the voice engine while a call is on
  const run = useRef(0); // goes up whenever a call starts or ends, so a slow step from an old call does nothing
  const limit = useRef(null);
  const latest = useRef(messages);
  latest.current = messages;
  const wasOpen = useRef(false);
  const launcher = useRef(null);
  const heading = useRef(null);
  const log = useRef(null);

  const say = (role, text, options) => setMessages((list) => addMessage(list, role, text, options));

  function endCall(note) {
    if (!call.current) return;
    run.current += 1;
    clearTimeout(limit.current);
    const engine = call.current === true ? null : call.current;
    call.current = null;
    engine?.stop();
    setCalling(false);
    setStatus('idle');
    if (note) say('note', note);
  }
  const end = useRef(endCall);
  end.current = endCall;

  async function startSession(voice) {
    const { ok, data } = await post('start', { voice });
    if (!ok || typeof data.token !== 'string') throw told(data);
    session.current = { token: data.token, expiresAt: Number(data.expiresAt) || 0 };
    return data;
  }

  async function speak() {
    if (call.current) return;
    setProblem(null);
    if (!voiceSupported(window)) {
      setVoiceOff(true);
      setProblem({ text: 'This browser cannot make a voice call. You can type below instead.' });
      return;
    }
    const mine = ++run.current;
    const stale = () => mine !== run.current;
    call.current = true;
    setCalling(true);
    setStatus('asking');
    try {
      // Ask for the microphone before anything else: a visitor who says no costs no session, and the short-lived
      // voice credential is not left to run out behind the browser's permission prompt.
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      probe.getTracks().forEach((track) => track.stop());
      if (stale()) return;
      const started = await startSession(true);
      if (stale()) return;
      if (!started.voice) {
        call.current = null;
        setCalling(false);
        setStatus('idle');
        setVoiceOff(true);
        setProblem({ text: 'Speaking is not available right now. You can type below instead.' });
        return;
      }
      const { VoiceClient } = await import('../../src/portal/interview/voice/browser-client.mjs');
      if (stale()) return;
      const engine = new VoiceClient();
      call.current = engine;
      await engine.start({
        deepgramToken: started.voice.deepgramToken,
        settings: started.voice.settings,
        handlers: {
          onState: (state) => { if (!stale()) setStatus(statusFromVoice(state)); },
          onAgentText: (text) => { if (!stale()) say('guide', displayText(text), { spoken: true }); },
          onUserText: (text) => { if (!stale()) say('you', text, { spoken: true }); },
          onError: () => { if (!stale()) setProblem({ text: 'The call ran into a problem. You can try again, or type below.' }); },
          onClosed: () => { if (!stale()) end.current('The call has ended.'); },
        },
      });
      if (stale()) {
        engine.stop();
        return;
      }
      limit.current = setTimeout(() => end.current('The call reached its time limit. You can start another, or type below.'), Math.max(0, session.current.expiresAt - Date.now()));
    } catch (error) {
      if (stale()) return;
      const engine = call.current === true ? null : call.current;
      call.current = null;
      engine?.stop();
      setCalling(false);
      setStatus('idle');
      setProblem(error?.told ? { text: error.message, contactPath: error.contactPath } : { text: micMessage(error) });
    }
  }

  async function send(event) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || busy) return;
    // Typing takes over from a call: what was said stays on screen and is sent as the conversation so far.
    endCall('The call has ended.');
    const history = historyFor(latest.current);
    setDraft('');
    setProblem(null);
    setBusy(true);
    setStatus('thinking');
    say('you', message);
    try {
      let reply = null;
      for (let attempt = 0; !reply; attempt += 1) {
        if (!session.current || session.current.expiresAt <= Date.now()) await startSession(false);
        const { ok, status: code, data } = await post('chat', { token: session.current.token, message, path: pathname, history });
        if (ok) reply = data;
        else if (code === 401 && attempt === 0) session.current = null; // the chat ran out: start a new one, once
        else throw told(data);
      }
      say('guide', typeof reply.reply === 'string' ? reply.reply : '', { action: cleanAction(reply.action) });
    } catch (error) {
      setProblem(error?.told ? { text: error.message, contactPath: error.contactPath } : { text: 'Sorry, something went wrong. Please try again.' });
    } finally {
      setBusy(false);
      setStatus((now) => (now === 'thinking' ? 'idle' : now));
    }
  }

  const close = () => {
    endCall('The call has ended.');
    setOpen(false);
  };

  // The call never outlives the page, the component, or a move into a signed-in area.
  useEffect(() => {
    const stop = () => end.current();
    window.addEventListener('pagehide', stop);
    return () => {
      window.removeEventListener('pagehide', stop);
      stop();
    };
  }, []);
  useEffect(() => {
    if (!shown) end.current();
  }, [shown]);

  // Opening moves focus to the panel's heading (not the text box, so a phone keyboard does not jump up);
  // closing hands it back to the button that opened it.
  useEffect(() => {
    if (open) heading.current?.focus();
    else if (wasOpen.current) launcher.current?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, problem, open]);

  if (!shown) return null;
  if (!open) return <div className="gsvg"><button type="button" className="gsvg-launcher" ref={launcher} onClick={() => setOpen(true)}>Talk to us</button></div>;

  return (
    <div className="gsvg">
      <section id="gsvg-panel" className="gsvg-panel" role="dialog" aria-labelledby="gsvg-title" onKeyDown={(event) => { if (event.key === 'Escape') close(); }}>
        <div className="gsvg-head">
          <h2 id="gsvg-title" className="gsvg-title" tabIndex={-1} ref={heading}>Ask about Greatstone</h2>
          <button type="button" className="gsvg-button gsvg-quiet" onClick={close}>Close</button>
        </div>
        {/* While the guide is speaking aloud, a screen reader is not also made to read every word out. */}
        <div className="gsvg-log" role="log" aria-label="Conversation" aria-live={calling ? 'off' : 'polite'} tabIndex={0} ref={log}>
          {messages.length === 0 && <p className="gsvg-intro">Ask what we do, or say what you are looking for and the guide will show you the right page. You can speak or type.</p>}
          {messages.map((message) => (
            <div key={message.id} className="gsvg-msg" data-role={message.role}>
              <p className="gsvg-text">{WHO[message.role] && <span className="gsvg-who">{WHO[message.role]}: </span>}{message.text}</p>
              {message.action && (
                <ul className="gsvg-links">
                  {(message.action.type === 'go' ? [message.action] : message.action.options).map((page) => (
                    <li key={page.path}><Link className="gsvg-link" href={page.path}>{page.title}</Link></li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
        {problem && (
          <p className="gsvg-problem" role="alert">
            {problem.text}
            {problem.contactPath && <> <Link href={problem.contactPath}>Go to the contact page</Link></>}
          </p>
        )}
        <div className="gsvg-call">
          <p className="gsvg-status" role="status" data-status={status}>{STATUS_LABEL[status]}</p>
          {calling
            ? <button type="button" className="gsvg-button gsvg-stop" onClick={() => endCall('The call has ended.')}>Stop</button>
            : !voiceOff && <button type="button" className="gsvg-button gsvg-main" onClick={speak}>Speak</button>}
        </div>
        <form className="gsvg-form" onSubmit={send}>
          <label className="gsvg-hidden" htmlFor="gsvg-input">Type a question</label>
          <input id="gsvg-input" className="gsvg-input" type="text" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={500} placeholder="Type a question"
            autoComplete="off" enterKeyHint="send" />
          <button type="submit" className="gsvg-button gsvg-quiet" disabled={busy}>Send</button>
        </form>
        <p className="gsvg-notice">
          This is an AI guide and it can get things wrong. What you say or type is sent to our AI and speech providers to answer you. Your microphone is on only from when you press
          Speak until you press Stop. Greatstone does not keep a recording or a transcript.
        </p>
      </section>
    </div>
  );
}
