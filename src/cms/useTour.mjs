import { useState, useCallback, useRef, useEffect } from 'react';
import { markSeen, resetGuide, autoStartTour } from '../lib/tour-model.mjs';

// Runtime for the guided tours: the active tour id + the ONLY localStorage IO (the per-user seen-map). Kept
// under its own namespaced key, separate from the store.js content payload, and keyed by user email so a
// shared machine never suppresses a colleague's first run. All branch logic lives in the pure tour-model.mjs.
//
// The email arrives LATE and can change (public → signed-in, or the catalogue reporting its staff after mount).
// So every callback reads the current identity from a ref and is itself STABLE (empty deps): a changing email
// must not give close/abort/replay/maybeAutoStart new identities, or the Tour effects that close over them would
// fire against a stale closure (marking the wrong guide seen, or jumping focus mid-tour). When the identity
// actually resolves/changes we re-read the persisted seen-map so a guide seen elsewhere is still respected.
const KEY = 'gs.tours.seen.v1';
function readSeen() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } }
function writeSeen(m) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* quota / private mode: tours simply re-offer */ } }

export function useTour(email) {
  const [active, setActive] = useState(null);
  const seenRef = useRef(readSeen());
  const emailRef = useRef(email);
  useEffect(() => {
    if (emailRef.current === email) return;
    emailRef.current = email;
    seenRef.current = readSeen(); // identity just resolved/changed: refresh from storage (another tab, late sign-in)
  }, [email]);

  // finishing OR skipping marks the guide seen, so it auto-fires exactly once; replaying clears just its flag.
  const close = useCallback(() => {
    setActive((id) => { if (id) { seenRef.current = markSeen(seenRef.current, emailRef.current, id); writeSeen(seenRef.current); } return null; });
  }, []);

  // the surface never mounted in time: close WITHOUT marking seen, so the guide re-offers on the next visit.
  const abort = useCallback(() => setActive(null), []);

  const startTour = useCallback((id) => setActive(id), []);
  const replayTour = useCallback((id) => {
    seenRef.current = resetGuide(seenRef.current, emailRef.current, id); writeSeen(seenRef.current); setActive(id);
  }, []);

  // auto-start a surface's tour the first time that user enters it (call from an effect; guarded so it never
  // interrupts a tour already running and never re-fires once seen).
  const maybeAutoStart = useCallback((id) => {
    setActive((cur) => (cur ? cur : (autoStartTour(seenRef.current, emailRef.current, id) || null)));
  }, []);

  return { active, startTour, replayTour, close, abort, maybeAutoStart };
}
