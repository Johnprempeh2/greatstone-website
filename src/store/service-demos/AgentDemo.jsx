// AI Agents & Assistants archetype: a working chat console the visitor can actually drive.
// Pick a question, watch the answer stream in, see the sources it was grounded in. That is the whole
// pitch for private AI in one interaction: it answers from YOUR documents, and it shows its working.
//
// Honest by construction: the panel is labelled a prototype, every answer comes from agent-content.mjs
// (reviewed copy, never invented at runtime), and no network call is made. Nothing here implies a live
// customer integration.
//
// A11y: the thread is an aria-live log so a screen reader hears each answer as it lands; streaming is
// skipped entirely under prefers-reduced-motion (the full answer appears at once); prompts are real
// buttons; the reset control returns focus to the first prompt.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { scriptFor } from './agent-content.mjs';

const prefersReduced = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function AgentDemo({ svc }) {
  const script = useMemo(() => scriptFor(svc), [svc]);
  const [turns, setTurns] = useState([]);       // [{ role:'user'|'agent', text, sources?, streaming? }]
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState([]);       // indexes already used, so a prompt is not re-offered
  const timers = useRef([]);
  const firstPromptRef = useRef(null);
  const threadRef = useRef(null);

  // every scheduled tick is tracked so unmount (or reset) cannot leave a stray timer writing state
  const clearTimers = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = []; }, []);
  useEffect(() => clearTimers, [clearTimers]);

  if (!script) return null;

  const remaining = script.prompts.map((p, i) => i).filter((i) => !asked.includes(i));

  const ask = (i) => {
    if (busy) return;
    const p = script.prompts[i];
    if (!p) return;
    setBusy(true);
    setAsked((a) => [...a, i]);
    setTurns((t) => [...t, { role: 'user', text: p.q }]);

    const reduced = prefersReduced();
    // a beat of "thinking" so the answer feels considered rather than pre-baked, then the answer itself
    const think = reduced ? 0 : 620;
    timers.current.push(setTimeout(() => {
      if (reduced) {
        setTurns((t) => [...t, { role: 'agent', text: p.a, sources: p.sources }]);
        setBusy(false);
        return;
      }
      // stream word by word: cheap, and it reads as a real assistant composing an answer
      const words = p.a.split(' ');
      setTurns((t) => [...t, { role: 'agent', text: '', sources: null, streaming: true }]);
      words.forEach((w, wi) => {
        timers.current.push(setTimeout(() => {
          setTurns((t) => {
            const next = t.slice();
            const last = next[next.length - 1];
            if (!last || last.role !== 'agent') return t;
            next[next.length - 1] = {
              ...last,
              text: (last.text ? last.text + ' ' : '') + w,
              streaming: wi < words.length - 1,
              sources: wi === words.length - 1 ? p.sources : null,
            };
            return next;
          });
          if (wi === words.length - 1) setBusy(false);
        }, wi * 26));
      });
    }, think));
  };

  const reset = () => {
    clearTimers();
    setTurns([]); setAsked([]); setBusy(false);
    // hand focus back so a keyboard user is not stranded after the thread empties
    requestAnimationFrame(() => firstPromptRef.current && firstPromptRef.current.focus());
  };

  // keep the newest turn in view without yanking the whole page around
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  return (
    <div className="sdemo-agent">
      <div className="sdemo-console">
        <div className="sdemo-bar">
          <span className="sdemo-dot" aria-hidden="true" />
          <span className="sdemo-name">{script.assistant}</span>
          <span className="sdemo-chan">{script.channel}</span>
        </div>

        <div className="sdemo-thread" ref={threadRef} role="log" aria-live="polite" aria-label="Assistant conversation">
          <div className="sdemo-msg is-agent sdemo-greet">
            <p>{script.greeting}</p>
          </div>
          {turns.map((t, i) => (
            <div key={i} className={'sdemo-msg is-' + t.role}>
              <p>
                {t.text}
                {t.streaming ? <span className="sdemo-caret" aria-hidden="true" /> : null}
              </p>
              {t.sources && t.sources.length ? (
                <div className="sdemo-srcs">
                  <span className="sdemo-srcs-l">Sources</span>
                  {t.sources.map((s) => (
                    <span key={s} className="sdemo-src">
                      <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M14 3v5h5M8 2h7l5 5v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
                      </svg>
                      {s}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {busy && !turns.some((t) => t.streaming) ? (
            <div className="sdemo-msg is-agent sdemo-think" aria-hidden="true">
              <span className="sdemo-tdot" /><span className="sdemo-tdot" /><span className="sdemo-tdot" />
            </div>
          ) : null}
        </div>

        <div className="sdemo-ask">
          {remaining.length ? (
            <>
              <span className="sdemo-ask-l">Try asking</span>
              <div className="sdemo-chips">
                {remaining.map((i, n) => (
                  <button
                    key={i}
                    type="button"
                    className="sdemo-chip"
                    disabled={busy}
                    ref={n === 0 ? firstPromptRef : null}
                    onClick={() => ask(i)}
                  >
                    {script.prompts[i].q}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="sdemo-done">
              <span>That is the pattern: grounded answers, cited every time.</span>
              <button type="button" className="sdemo-reset" onClick={reset}>Start over</button>
            </div>
          )}
        </div>
      </div>

      <p className="sdemo-privacy">
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        {script.privacy}
      </p>
    </div>
  );
}
