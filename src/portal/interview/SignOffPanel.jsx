/**
 * The interactive half of the sign-off read-back (mockup screen 3):
 *
 *   - "Add or correct something": a ghost button revealing a textarea whose
 *     text goes through the real extraction path as one more user turn.
 *   - The two consent moments as conversational cards, asked by Everest with
 *     the stone avatar: quotes (GRE-2687: the three QUOTE_OPTIONS as radio
 *     buttons, none pre-selected; only a choice already confirmed comes back)
 *     and memory (remember / start fresh, safe default: start fresh). Leaving
 *     without a quote choice means No quotes (effectiveQuoteChoice on the server).
 *   - "Confirm and finish" persists everything via the confirm-signoff op,
 *     then reveals the warm completion card. Choices stay editable
 *     afterwards — changing one brings back a "Save your change" button.
 *
 * Port: source components/SignOffPanel.tsx. The two server actions became portal ops with the same
 * arguments and the same `{ ok, error?, insightsAdded? }` result: confirmSignOff → 'confirm-signoff',
 * submitCorrection → 'submit-correction'.
 */

import { useRef, useState } from 'react';
import { GlassCard } from './Card.jsx';
import { Button } from './Button.jsx';
import { AgentAvatar } from './ChatMessage.jsx';
import { ConsentTiles } from './ConsentTiles.jsx';
import { CompletionCard } from './CompletionCard.jsx';
import { DotDivider } from './Footer.jsx';
import { portalOp } from './api.mjs';
import { selectionSummary as summarise } from './model.mjs';
import { QUOTE_OPTIONS } from '../interview-notice.mjs';

// Port: a server action resolved to its result or threw; a portal op resolves to { data } or { error }.
// This keeps the source's call sites (`const result = await confirmSignOff(...)`, try/catch) unchanged.
async function callOp(op, args) {
  const { data, error } = await portalOp(op, args);
  if (error) throw new Error(error);
  return data ?? { ok: false };
}
const confirmSignOff = (input) => callOp('confirm-signoff', input);
const submitCorrection = (input) => callOp('submit-correction', input);

export function SignOffPanel({ sessionId, initialQuotes = null, initialMemory }) {
  // ── Correction ──
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionText, setCorrectionText] = useState('');
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [correctionNote, setCorrectionNote] = useState(null);
  const [correctionError, setCorrectionError] = useState(null);

  const sendCorrection = async () => {
    const text = correctionText.trim();
    if (!text || correctionBusy) return;
    setCorrectionBusy(true);
    setCorrectionError(null);
    setCorrectionNote(null);
    try {
      const result = await submitCorrection({ sessionId, text });
      if (result.ok) {
        setCorrectionText('');
        setCorrectionOpen(false);
        setCorrectionNote('Got it, thank you. That has been added.');
      } else {
        setCorrectionError(result.error ?? 'Could not take that just now.');
      }
    } catch {
      setCorrectionError('Could not take that just now. Please try again.');
    } finally {
      setCorrectionBusy(false);
    }
  };

  // ── Consent ──
  const [quotes, setQuotes] = useState(QUOTE_OPTIONS.some((o) => o.value === initialQuotes) ? initialQuotes : null);
  const [memory, setMemory] = useState(initialMemory);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState(null);
  const [confirmed, setConfirmed] = useState(null);
  const completeRef = useRef(null);

  const dirty =
    confirmed !== null && (confirmed.quotes !== quotes || confirmed.memory !== memory);
  const showConfirm = confirmed === null || dirty;

  const confirm = async () => {
    if (confirmBusy || !quotes) return;
    setConfirmBusy(true);
    setConfirmError(null);
    try {
      const result = await confirmSignOff({ sessionId, quotes, memory });
      if (result.ok) {
        const first = confirmed === null;
        setConfirmed({ quotes, memory });
        if (first) {
          // Let the completion card render, then bring it into view.
          setTimeout(() => {
            // Port: honour reduced motion for the programmatic scroll (CSS cannot reach scrollIntoView).
            const reduce =
              typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
            completeRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
          }, 80);
        }
      } else {
        setConfirmError(result.error ?? 'Could not save your choices just now.');
      }
    } catch {
      setConfirmError('Could not save your choices just now. Please try again.');
    } finally {
      setConfirmBusy(false);
    }
  };

  const selectionSummary = summarise(quotes, memory);

  return (
    <>
      {/* ── Add or correct something ── */}
      <div className="correct-row anim-up d-4">
        {correctionOpen ? null : (
          <Button
            variant="ghost"
            small
            onClick={() => {
              setCorrectionOpen(true);
              setCorrectionNote(null);
            }}
          >
            <svg viewBox="0 0 24 24">
              <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
            </svg>
            Anything else to add?
          </Button>
        )}
      </div>

      {correctionOpen ? (
        <div className="correction-form">
          <textarea
            rows={3}
            autoFocus
            placeholder="Anything you would like to add before you go, in your own words"
            aria-label="Anything else to add"
            value={correctionText}
            maxLength={2000}
            disabled={correctionBusy}
            onChange={(e) => setCorrectionText(e.target.value)}
          />
          <div className="correction-actions">
            <Button small disabled={correctionBusy || !correctionText.trim()} onClick={() => void sendCorrection()}>
              {correctionBusy ? 'Adding…' : 'Add'}
            </Button>
            <Button
              variant="ghost"
              small
              disabled={correctionBusy}
              onClick={() => {
                setCorrectionOpen(false);
                setCorrectionError(null);
              }}
            >
              Never mind
            </Button>
          </div>
          {correctionError ? (
            <p className="correction-note is-error" role="status">
              {correctionError}
            </p>
          ) : null}
        </div>
      ) : null}

      {correctionNote ? (
        <p className="correction-note" role="status">
          {correctionNote}
        </p>
      ) : null}

      <DotDivider />

      {/* ── Consent moment 1: quotes (GRE-2687, claim C5: a quote is shared only if you agree) ── */}
      <GlassCard className="consent-card anim-up d-5">
        <fieldset className="quote-choice">
          <legend className="consent-q">
            <AgentAvatar />
            <span>Two last things. May we share short quotes from what you said?</span>
          </legend>
          <div className="consent-options is-stacked">
            {QUOTE_OPTIONS.map((option) => (
              <label key={option.value} className={quotes === option.value ? 'consent-opt selected' : 'consent-opt'}>
                <input
                  type="radio"
                  name="quotes"
                  value={option.value}
                  checked={quotes === option.value}
                  disabled={confirmBusy}
                  onChange={() => setQuotes(option.value)}
                />
                <span className="opt-name">
                  <span className="opt-ring" aria-hidden="true"></span>
                  {option.label}
                </span>
                <span className="opt-line">{option.help}</span>
              </label>
            ))}
          </div>
          <p className="quote-choice-note">If you leave without choosing, no quotes are used.</p>
        </fieldset>
      </GlassCard>

      {/* ── Consent moment 2: memory ── */}
      <GlassCard className="consent-card anim-up d-6">
        <div className="consent-q">
          <AgentAvatar />
          <p>And are you happy for me to remember this conversation next time we work together?</p>
        </div>
        <ConsentTiles
          groupLabel="Memory choice"
          selected={memory ? 'yes' : 'no'}
          onSelect={(v) => setMemory(v === 'yes')}
          disabled={confirmBusy}
          options={[
            {
              value: 'yes',
              name: 'Yes, remember it',
              line: 'A short summary is kept for 24 months, never the transcript.',
            },
            {
              value: 'no',
              name: 'No, start fresh',
              line: 'Nothing is carried over, and any earlier memory is deleted.',
            },
          ]}
        />
      </GlassCard>

      {/* ── Confirm ── */}
      <div className="signoff-confirm anim-up d-6">
        <p className="signoff-selection" aria-live="polite">
          {quotes ? (
            <>
              Your choice: <strong>{selectionSummary}</strong>
            </>
          ) : (
            'Choose one of the three quote options to finish.'
          )}
        </p>
        {showConfirm ? (
          <Button disabled={confirmBusy || !quotes} onClick={() => void confirm()}>
            {confirmBusy ? 'Saving…' : confirmed === null ? 'Confirm and finish' : 'Save your change'}
          </Button>
        ) : (
          <p className="signoff-saved" role="status">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Saved. You can change either answer at any time.
          </p>
        )}
        {confirmError ? (
          <p className="correction-note is-error" role="status">
            {confirmError}
          </p>
        ) : null}
      </div>

      {/* ── Completion ── */}
      {confirmed !== null ? (
        <div ref={completeRef}>
          <CompletionCard />
        </div>
      ) : null}
    </>
  );
}
