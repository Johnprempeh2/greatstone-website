// Port of SOURCE src/lib/voice/clause-buffer.ts @505ba6a. Thresholds and cut rules unchanged.
// Port: types stripped (TS `private buf` becomes a plain property, same runtime behaviour). Dependency
// free on purpose: the server and the browser import this same file.

/**
 * Releasing the reply to the synthesiser in units a person would actually say.
 *
 * Claude streams text a token at a time, and forwarding those tokens straight
 * through is what makes a voice agent sound robotic. Speech synthesis plans
 * intonation over a whole phrase: where the pitch rises, where it falls, which
 * word carries the stress. Hand it "Hm", ",", " okay", ".", " So", " what" and
 * it has to invent a contour for each fragment, and the result is flat and
 * clipped, because no fragment ever contained enough context to shape.
 *
 * So we hold tokens just long enough to release a clause, then let go. The
 * whole design is a latency trade: buffer too long and the participant waits in
 * silence, buffer too little and the agent sounds like a machine.
 *
 * The first release is the one that matters for perceived speed, and it is
 * cheap, because a natural spoken reply opens short ("Right." / "Hm, okay.").
 * Those clear the sentence rule almost immediately, so audio still starts fast
 * while everything after it gets to be a proper phrase.
 */

/**
 * Below this, a comma is not worth breaking on: "Hm, okay" would split into two
 * fragments and we would be back to the problem this exists to solve.
 */
const SOFT_MIN = 50;

/**
 * A hard ceiling so a run-on sentence cannot hold the audio hostage. Released
 * at the last word boundary rather than mid-word.
 */
const HARD_MAX = 180;

/**
 * Ends a sentence. The trailing whitespace is REQUIRED, and that is the whole
 * subtlety: tokens arrive a few characters at a time, so a full stop sitting at
 * the end of the buffer might be the end of a sentence or might be the middle
 * of "3.5" with the rest still in flight. We cannot tell yet, so we wait for
 * the character that settles it. The final sentence of a reply has no trailing
 * space, and is released by drain() instead.
 */
const SENTENCE_END = /[.!?]["')\]]?\s/;

export class ClauseBuffer {
  buf = '';

  /** Feed one delta. Returns whatever is ready to be spoken, in order. @returns {string[]} */
  push(text) {
    this.buf += text;
    const out = [];

    for (;;) {
      const cut = this.findCut();
      if (cut <= 0) break;
      const piece = this.buf.slice(0, cut).trim();
      this.buf = this.buf.slice(cut);
      if (piece) out.push(piece);
    }
    return out;
  }

  /**
   * Where to break, or 0 for "hold". Checked in order of how strongly each
   * point implies a pause in speech.
   */
  findCut() {
    // 1. A finished sentence: always the best place to let go.
    const m = SENTENCE_END.exec(this.buf);
    if (m) {
      const end = m.index + m[0].length;
      // Not a decimal or a mid-number stop: "3.5" must not split.
      const before = this.buf[m.index - 1];
      const after = this.buf[end];
      if (!(/\d/.test(before ?? '') && /\d/.test(after ?? ''))) return end;
    }

    // 2. A clause boundary, but only once there is enough to be worth saying.
    if (this.buf.length >= SOFT_MIN) {
      const rel = this.buf.slice(SOFT_MIN).search(/[,;:]\s/);
      if (rel !== -1) return SOFT_MIN + rel + 2;
    }

    // 3. Nothing punctuated and it has run long: break at the last space.
    if (this.buf.length >= HARD_MAX) {
      const sp = this.buf.lastIndexOf(' ', HARD_MAX);
      if (sp > 0) return sp + 1;
      return HARD_MAX;
    }

    return 0;
  }

  /** Everything still held. Call once the model has finished. @returns {string | null} */
  drain() {
    const rest = this.buf.trim();
    this.buf = '';
    return rest || null;
  }
}
