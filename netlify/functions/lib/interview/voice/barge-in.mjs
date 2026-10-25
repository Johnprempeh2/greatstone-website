// Port of SOURCE src/lib/voice/barge-in.ts @505ba6a. Word lists, thresholds and rule order unchanged.
// Port: types stripped (the TS parameter property `private windowMs` becomes an explicit assignment, and
// `private spans` a plain property). Dependency free on purpose: the server and the browser import this
// same file.

/**
 * Deciding whether the participant actually interrupted, or whether we are
 * about to be fooled.
 *
 * Acoustic echo cancellation is a filter, not a guarantee. Three things get
 * past it, and each would break the interview in a different way:
 *
 *   1. THE AGENT HEARS ITSELF. Residual echo of Everest's own speech is
 *      transcribed and read as the participant interrupting, so Everest stops
 *      mid question, hears more of itself, and can loop.
 *   2. A COLLEAGUE TWO DESKS AWAY. In an open plan studio the mic picks up the
 *      room. Their words are not evidence and must never enter the transcript.
 *   3. "MHM." Backchannels are how people show they are listening. Treating
 *      one as an interruption makes Everest stop every time someone agrees
 *      with it, which is maddening.
 *
 * So every candidate interruption is classified before it is allowed to stop
 * playback. This is pure logic over signals the caller supplies, with no audio
 * or browser dependency, so it can be unit tested against fixtures rather than
 * tuned by ear.
 */

/** Normalise for comparison: lowercase, strip punctuation, collapse spaces. */
function norm(s) {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Word n-grams. Shingles beat string equality because the echo comes back mangled. @returns {Set<string>} */
function shingles(s, n = 3) {
  const w = norm(s).split(' ').filter(Boolean);
  const out = new Set();
  if (!w.length) return out;
  if (w.length < n) {
    out.add(w.join(' '));
    return out;
  }
  for (let i = 0; i + n <= w.length; i += 1) out.add(w.slice(i, i + n).join(' '));
  return out;
}

/**
 * What Everest has said recently, so we can recognise our own words coming
 * back. Deepgram gives us this for free on every assistant ConversationText.
 */
export class SpokenWindow {
  /** @type {Array<{ text: string, at: number }>} */
  spans = [];

  constructor(windowMs = 12_000) {
    this.windowMs = windowMs;
  }

  /** Record something the agent has just said. */
  note(text, now = Date.now()) {
    if (!text?.trim()) return;
    this.spans.push({ text, at: now });
    this.gc(now);
  }

  gc(now) {
    const cut = now - this.windowMs;
    this.spans = this.spans.filter((s) => s.at > cut);
  }

  /**
   * How much of `candidate` is made of words the agent just said, 0 to 1.
   * A participant genuinely answering shares topic words but almost never
   * shares three-word runs, which is why this discriminates so cleanly.
   */
  overlap(candidate, now = Date.now()) {
    this.gc(now);
    const cand = shingles(candidate);
    if (!cand.size) return 0;
    const mine = new Set();
    for (const s of this.spans) for (const g of shingles(s.text)) mine.add(g);
    if (!mine.size) return 0;
    let hit = 0;
    for (const g of cand) if (mine.has(g)) hit += 1;
    return hit / cand.size;
  }

  clear() {
    this.spans = [];
  }
}

/**
 * Words that show someone is listening, not that they want the floor. Kept
 * deliberately short: a false negative here just means Everest pauses when it
 * did not need to, which is far cheaper than the alternative.
 */
const BACKCHANNEL = new Set([
  'mm', 'mmm', 'mhm', 'mmhmm', 'uh huh', 'uhhuh', 'yeah', 'yep', 'yup', 'yes',
  'right', 'okay', 'ok', 'sure', 'gotcha', 'true', 'exactly', 'oh', 'hmm',
  'cool', 'nice', 'i see', 'got it',
]);

/**
 * Words that ALWAYS mean stop, checked before every other rule including the
 * grace window. Misreading "no, wait" as echo or as a backchannel is the worst
 * failure available here: the participant is actively trying to correct
 * something and the agent talks over them.
 */
const HARD_INTERRUPT = new Set([
  'no', 'wait', 'stop', 'sorry', 'actually', 'hold', 'hang', 'but',
  'pardon', 'what', 'repeat',
]);

/**
 * @typedef {'interrupt' | 'echo' | 'backchannel' | 'far-field' | 'ignore'} BargeInVerdict
 * interrupt: genuine, stop speaking and listen. echo: our own voice coming back. backchannel: "mhm",
 * they are listening. far-field: someone or something else in the room. ignore: too early, or too little.
 */

/**
 * @typedef {{ text: string, durationMs: number, rmsDb: number, noiseFloorDb: number,
 *   agentSpeakingForMs: number, echoOverlap: number, isFirstAgentTurn?: boolean }} BargeInSignals
 * text: interim transcript of the candidate speech. durationMs: how long it lasted. rmsDb: loudness,
 * dBFS. noiseFloorDb: rolling room-noise floor, dBFS. agentSpeakingForMs: how long the agent has been
 * speaking this turn. echoOverlap: 0 to 1 from SpokenWindow.overlap. isFirstAgentTurn: true for the
 * agent's first turn, when cancellation has never converged.
 */

/**
 * Cancellation is adaptive: it learns the room only once audio is flowing, so
 * the opening moments of a turn are when the agent is most likely to hear
 * itself. We stay deaf briefly rather than trust a filter that has not settled.
 * Longer on the very first turn, when it has never run at all. (This is also
 * why the agent should open with a greeting: it warms the canceller up before
 * the participant ever speaks.)
 */
const GRACE_MS = 700;
const FIRST_TURN_GRACE_MS = 1500;

/** Above the room by this much to count as the person at the machine. */
const NEAR_FIELD_DB = 12;

/** Enough of our own words, over enough words, to call it echo. */
const ECHO_OVERLAP = 0.6;
const ECHO_MIN_WORDS = 3;

/** Longer than this and it is not a backchannel, whatever the words. */
const BACKCHANNEL_MAX_MS = 600;

/** @param {BargeInSignals} s @returns {BargeInVerdict} */
export function classifyBargeIn(s) {
  const words = norm(s.text).split(' ').filter(Boolean);

  // 1. Always let a correction through, before any other test.
  if (words.some((w) => HARD_INTERRUPT.has(w))) return 'interrupt';

  // 2. Too early in the turn to trust the canceller.
  const grace = s.isFirstAgentTurn ? FIRST_TURN_GRACE_MS : GRACE_MS;
  if (s.agentSpeakingForMs < grace) return 'ignore';

  // 3. Our own voice. Needs enough words to form trigrams, so very short
  //    utterances fall through to the loudness and backchannel tests instead.
  if (s.echoOverlap >= ECHO_OVERLAP && words.length >= ECHO_MIN_WORDS) return 'echo';

  // 4. Not near the microphone: the room, or a colleague.
  if (s.rmsDb - s.noiseFloorDb < NEAR_FIELD_DB) return 'far-field';

  // 5. Listening noises, not a bid for the floor.
  if (
    words.length > 0 &&
    words.length <= 2 &&
    s.durationMs < BACKCHANNEL_MAX_MS &&
    words.every((w) => BACKCHANNEL.has(w))
  ) {
    return 'backchannel';
  }

  // 6. A single stray word with nothing else to recommend it.
  if (words.length < 2) return 'ignore';

  return 'interrupt';
}

/**
 * How long to wait, after cutting the agent off, before deciding nobody
 * actually spoke and resuming. Without this a cough silently costs the
 * participant a question: the agent stops, hears nothing, and just sits there.
 */
export const FALSE_INTERRUPTION_TIMEOUT_MS = 2_000;

/**
 * How long after the agent's audio finishes to keep discounting the
 * microphone. Room reverberation outlives the audio itself, and this tail is
 * where most self triggering actually happens.
 */
export const POST_SPEECH_GATE_MS = 800;
