/**
 * Microphone capture for the spoken interview.
 *
 * This runs on the audio render thread, which is why it exists at all. The
 * obvious alternative, MediaRecorder, is wrong here for two reasons: it emits
 * a container format (WebM/Opus) rather than the raw PCM Deepgram wants, and
 * it delivers on a timer rather than per render quantum, which adds latency we
 * cannot afford in a conversation.
 *
 * Two jobs:
 *
 *   1. Convert Float32 render quanta to linear16 PCM and hand them up in
 *      chunks big enough to be worth a WebSocket frame but small enough that
 *      nobody hears the delay.
 *   2. Measure loudness. The barge-in classifier needs to know whether a
 *      candidate interruption came from the person at the machine or from a
 *      colleague across an open plan studio, and the only honest way to tell
 *      is how far the speech sits above the room's own noise floor. Measuring
 *      it here is free, because we are already touching every sample.
 */

/** 20ms at 48 kHz. Small enough to feel instant, large enough not to thrash. */
const CHUNK_SAMPLES = 960;

/**
 * How fast the noise floor follows the room. Slow on the way up so a person
 * talking cannot drag the floor up with them and make themselves look
 * far-field, fast on the way down so the floor settles quickly in a quiet room.
 */
const FLOOR_RISE = 0.0005;
const FLOOR_FALL = 0.05;

class VoiceCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Int16Array(CHUNK_SAMPLES);
    this._n = 0;
    // Start pessimistic: assume a quiet room and let the floor rise to meet it,
    // rather than starting loud and gating out the first thing anyone says.
    this._floor = 1e-4;
    this._muted = false;
    this.port.onmessage = (e) => {
      if (e.data?.type === 'mute') this._muted = !!e.data.value;
    };
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;

    // Sum of squares for this quantum, reused for both the floor and the
    // per-chunk level, so we never walk the samples twice.
    let sumSq = 0;
    for (let i = 0; i < channel.length; i += 1) {
      const s = channel[i];
      sumSq += s * s;

      if (this._muted) continue;
      // Clamp before scaling: values outside [-1, 1] are legal in Web Audio
      // and would wrap into loud noise if cast without care.
      const c = s < -1 ? -1 : s > 1 ? 1 : s;
      this._buf[this._n] = c < 0 ? c * 0x8000 : c * 0x7fff;
      this._n += 1;

      if (this._n === CHUNK_SAMPLES) {
        // Transfer rather than copy: this crosses a thread boundary 50 times a
        // second and there is no reason to allocate twice for it.
        const out = this._buf.buffer;
        this.port.postMessage({ type: 'audio', buffer: out }, [out]);
        this._buf = new Int16Array(CHUNK_SAMPLES);
        this._n = 0;
      }
    }

    const rms = Math.sqrt(sumSq / channel.length) || 1e-10;
    this._floor += (rms < this._floor ? FLOOR_FALL : FLOOR_RISE) * (rms - this._floor);

    // Report roughly every 20ms rather than every 2.7ms quantum: the classifier
    // reads these as a level, not as a waveform.
    this._sinceLevel = (this._sinceLevel ?? 0) + channel.length;
    if (this._sinceLevel >= CHUNK_SAMPLES) {
      this._sinceLevel = 0;
      this.port.postMessage({
        type: 'level',
        rmsDb: 20 * Math.log10(rms),
        noiseFloorDb: 20 * Math.log10(Math.max(this._floor, 1e-10)),
      });
    }

    return true;
  }
}

registerProcessor('voice-capture', VoiceCaptureProcessor);
