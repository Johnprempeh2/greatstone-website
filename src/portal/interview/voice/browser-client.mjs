/**
 * The browser half of the spoken interview.
 *
 * Everything here is arranged around one problem: stopping the agent from
 * hearing itself. A voice agent that hears its own speech transcribes it,
 * reads it as the participant interrupting, stops mid question, hears more of
 * itself, and can loop. It is the failure that makes voice agents feel broken.
 *
 * Three decisions do the work, and they are not independent:
 *
 *   1. ONE AUDIO CONTEXT for capture AND playback. Browser echo cancellation
 *      operates within a single audio graph. Playing the agent through a
 *      second context, or through an <audio> element, puts the sound outside
 *      the graph the canceller is watching, and it stops working. This is why
 *      we do not use Deepgram's bundled player: it builds its own context at
 *      24 kHz, and on Firefox a differing rate is by itself enough to make it
 *      a different graph.
 *
 *   2. THE DEVICE RATE, BOTH WAYS. We ask for 48 kHz and Deepgram honours it
 *      (verified against the live socket, see scripts/voice-settings-spike.mjs).
 *      Matching rates keeps capture and playback in the same graph.
 *
 *   3. CLASSIFY BEFORE STOPPING. Cancellation is a filter, not a guarantee, and
 *      residual echo, a colleague across the room, and a polite "mhm" all reach
 *      us looking like interruptions. classifyBargeIn decides which is which.
 *
 * Nothing in this file talks to our own API except through the settings handed
 * to it: the Deepgram credential is minted server side and expires in seconds.
 *
 * Port: source src/lib/voice/browser-client.ts, line for line; TypeScript types and `private` modifiers
 * dropped (the fields keep their names). The pure barge-in classifier is imported from the server-side port
 * (netlify/functions/lib/interview/voice/barge-in.mjs, same exports as the source) rather than duplicated.
 * The capture worklet is bundled from this folder (source: /voice-capture-worklet.js in the Next public folder).
 */

import {
  SpokenWindow,
  classifyBargeIn,
  POST_SPEECH_GATE_MS,
} from '../../../../netlify/functions/lib/interview/voice/barge-in.mjs';
// Port: Vite emits the worklet as its own file and gives us its URL (audio worklets load from a URL). no-inline
// keeps it a real same-origin file, as the source served it, rather than a data: URI a CSP could refuse.
import workletUrl from './voice-capture-worklet.js?url&no-inline';

/** @typedef {'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'ended'} VoiceState */

export const DEEPGRAM_URL = 'wss://agent.deepgram.com/v1/agent/converse';
export const SAMPLE_RATE = 48_000;

export class VoiceClient {
  constructor() {
    this.ws = null;
    this.ctx = null;
    this.stream = null;
    this.node = null;
    this.micSource = null;

    /** Scheduled playback, so a barge-in can cancel what has not been heard yet. */
    this.queued = [];
    this.playHead = 0;

    this.spoken = new SpokenWindow();
    /** @type {VoiceState} */
    this.state = 'idle';
    this.handlers = {};

    /** Live signals from the worklet, read when a barge-in has to be judged. */
    this.rmsDb = -60;
    this.noiseFloorDb = -60;

    this.agentSpeakingSince = null;
    this.agentAudioEndsAt = 0;
    this.isFirstAgentTurn = true;
  }

  async start(opts) {
    this.handlers = opts.handlers ?? {};
    this.setState('connecting');

    try {
      await this.openMic();
      await this.openSocket(opts.deepgramToken, opts.settings);
    } catch (e) {
      this.fail(e instanceof Error ? e.message : 'Could not start voice mode');
      await this.stop();
      throw e;
    }
  }

  /**
   * Microphone first, socket second. If permission is refused we want to fail
   * before opening a billed connection, and Voice Agent bills on connection
   * time whether or not anyone is speaking.
   */
  async openMic() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // The whole echo strategy rests on these three. They are requests, not
        // guarantees, which is exactly why public/echo-probe.html exists: it
        // measures on a real device whether cancellation actually engaged.
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: SAMPLE_RATE,
      },
      video: false,
    });

    // One context for both directions. See note 1 at the top of this file.
    this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    await this.ctx.audioWorklet.addModule(workletUrl);
    this.micSource = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, 'voice-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
    });

    this.node.port.onmessage = (e) => {
      const d = e.data;
      if (d?.type === 'audio') {
        // Raw linear16 straight to Deepgram. No container, no re-encode.
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(d.buffer);
      } else if (d?.type === 'level') {
        this.rmsDb = d.rmsDb;
        this.noiseFloorDb = d.noiseFloorDb;
      }
    };

    this.micSource.connect(this.node);
  }

  openSocket(token, settings) {
    return new Promise((resolve, reject) => {
      // Browsers cannot set an Authorization header on a WebSocket, so the
      // credential travels as a subprotocol. A short-lived grant MUST use
      // 'bearer'; 'token' is for the long-lived API key and is rejected here.
      // (Both verified against the live socket.)
      const ws = new WebSocket(DEEPGRAM_URL, ['bearer', token]);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;

      const failFast = () => reject(new Error('Could not reach the voice service'));

      ws.addEventListener('open', () => {
        ws.send(JSON.stringify(settings));
      });

      ws.addEventListener('message', (ev) => {
        if (ev.data instanceof ArrayBuffer) {
          this.enqueueAgentAudio(ev.data);
          return;
        }
        let msg;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        this.onServerMessage(msg, resolve);
      });

      ws.addEventListener('error', failFast);
      ws.addEventListener('close', () => {
        this.setState('ended');
        this.handlers.onClosed?.();
      });
    });
  }

  onServerMessage(msg, ready) {
    switch (msg.type) {
      case 'SettingsApplied':
        this.setState('listening');
        ready?.();
        break;

      case 'ConversationText': {
        const role = String(msg.role ?? '');
        const content = String(msg.content ?? '');
        if (role === 'assistant') {
          // Remember what we said so we can recognise it coming back at us.
          this.spoken.note(content);
          this.handlers.onAgentText?.(content);
        } else if (role === 'user') {
          this.handlers.onUserText?.(content);
        }
        break;
      }

      case 'UserStartedSpeaking':
        this.judgeBargeIn(String(msg.transcript ?? ''));
        break;

      case 'AgentThinking':
        this.setState('thinking');
        break;

      case 'AgentStartedSpeaking':
        this.agentSpeakingSince = Date.now();
        this.setState('speaking');
        break;

      case 'AgentAudioDone':
        // The agent has stopped producing audio, but scheduled buffers are
        // still playing and the room is still ringing. The gate below is why
        // the tail of a turn does not trigger a false interruption.
        this.isFirstAgentTurn = false;
        this.agentSpeakingSince = null;
        this.setState('listening');
        break;

      case 'Error':
        this.fail(String(msg.description ?? 'Voice service error'));
        break;

      default:
        break;
    }
  }

  /**
   * Decide whether that was really the participant. Deepgram will tell us
   * somebody spoke; it cannot tell us whether the somebody was our own
   * loudspeaker, a colleague two desks away, or a person saying "mhm" to show
   * they are listening. Getting this wrong in the permissive direction makes
   * the agent stutter and loop; getting it wrong in the strict direction talks
   * over someone trying to correct themselves, which is worse. The classifier
   * is deliberately biased toward letting corrections through.
   */
  judgeBargeIn(transcript) {
    const now = Date.now();

    // Still inside the tail of our own audio: reverberation outlives the
    // waveform, and this window is where most self-triggering happens.
    if (now < this.agentAudioEndsAt + POST_SPEECH_GATE_MS && !transcript) {
      this.handlers.onBargeIn?.('ignore', transcript);
      return;
    }

    const verdict = classifyBargeIn({
      text: transcript,
      durationMs: 800, // Deepgram signals onset, not duration; assume mid-length
      rmsDb: this.rmsDb,
      noiseFloorDb: this.noiseFloorDb,
      agentSpeakingForMs: this.agentSpeakingSince ? now - this.agentSpeakingSince : 10_000,
      echoOverlap: transcript ? this.spoken.overlap(transcript) : 0,
      isFirstAgentTurn: this.isFirstAgentTurn,
    });

    this.handlers.onBargeIn?.(verdict, transcript);

    if (verdict === 'interrupt') {
      this.flushPlayback();
      this.setState('listening');
    }
    // echo, backchannel, far-field and ignore all leave the agent talking,
    // which is the point: none of them is a person asking for the floor.
  }

  /** Convert, schedule, and remember so it can be cancelled. */
  enqueueAgentAudio(data) {
    const ctx = this.ctx;
    if (!ctx) return;

    const pcm = new Int16Array(data);
    if (!pcm.length) return;
    const f32 = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i += 1) f32[i] = pcm[i] / 0x8000;

    const buf = ctx.createBuffer(1, f32.length, SAMPLE_RATE);
    buf.copyToChannel(f32, 0);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);

    // Schedule back to back. Falling behind means the queue drained while we
    // were waiting on the network, so restart from now rather than in the past,
    // which would drop the chunk entirely.
    const startAt = Math.max(this.playHead, ctx.currentTime);
    src.start(startAt);
    this.playHead = startAt + buf.duration;
    this.agentAudioEndsAt = Date.now() + (this.playHead - ctx.currentTime) * 1000;

    this.queued.push(src);
    src.onended = () => {
      this.queued = this.queued.filter((s) => s !== src);
    };
  }

  /**
   * Stop talking, now. Called when someone genuinely interrupts: everything
   * already scheduled but not yet heard is discarded, because continuing to
   * speak over a person who has taken the floor is the rudest thing the agent
   * can do.
   */
  flushPlayback() {
    for (const src of this.queued) {
      try {
        src.stop();
      } catch {
        // Already finished; nothing to stop.
      }
    }
    this.queued = [];
    this.playHead = this.ctx?.currentTime ?? 0;
    this.agentAudioEndsAt = Date.now();

    // Tell Deepgram too, so it stops generating the rest of the reply and
    // stops billing for speech nobody will hear. AgentCancel is the message
    // that does this: verified by probing the live socket, which rejects a
    // bare InjectUserMessage outright and would have errored on every single
    // interruption.
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'AgentCancel' }));
    }
  }

  /** Mute the microphone without tearing the session down. */
  setMuted(muted) {
    this.node?.port.postMessage({ type: 'mute', value: muted });
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.handlers.onState?.(s);
  }

  fail(message) {
    this.handlers.onError?.(message);
  }

  /** Release everything. Safe to call twice. */
  async stop() {
    this.flushPlayback();
    try {
      this.ws?.close();
    } catch {
      // Already closing.
    }
    this.ws = null;

    this.micSource?.disconnect();
    this.node?.disconnect();
    this.micSource = null;
    this.node = null;

    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;

    if (this.ctx && this.ctx.state !== 'closed') {
      try {
        await this.ctx.close();
      } catch {
        // Context already gone.
      }
    }
    this.ctx = null;
    this.spoken.clear();
    this.setState('ended');
  }
}
