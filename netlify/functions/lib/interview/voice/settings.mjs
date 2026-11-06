// Port of SOURCE src/lib/voice/settings.ts @505ba6a. Settings message unchanged (mip_opt_out, 48 kHz both
// ways, 2 s endpointing, open_ai think wire, aura-2-draco-en). Port: types stripped, `import 'server-only'`
// removed.

/**
 * The Settings message: the first frame we send Deepgram after the socket opens,
 * and the only chance to configure the session.
 *
 * Four decisions here are load bearing, and each one was expensive to learn.
 *
 * 1. MIP_OPT_OUT. Deepgram's Model Improvement Partnership is opt OUT, not opt
 *    in. Left alone, audio and transcripts of confidential staff interviews can
 *    be retained to train their models. The entire premise of this product is
 *    that someone will say something to Everest they would not say to their
 *    manager, so this is not a preference, it is the product. Set here on every
 *    session so it holds even if the account level setting is ever wrong.
 *
 * 2. 48 kHz BOTH WAYS. Not a quality choice. Browsers run their audio graph at
 *    the device rate, typically 48 kHz, and echo cancellation only works inside
 *    a single graph. Firefox keys its graph on {window, sampleRate, device}, so
 *    a 24 kHz playback context against a 48 kHz mic graph is a DIFFERENT graph
 *    and cancellation silently never engages. The agent then hears itself.
 *    (This is why we do not use Deepgram's bundled player: it hardcodes 24 kHz.)
 *
 * 3. THE THINK ENDPOINT IS PUBLIC. Voice inverts who calls whom: Deepgram calls
 *    us, from their infrastructure, so the URL cannot sit behind our session
 *    cookie. It is bearer authed per session instead, against a hash stored on
 *    the session row. The token is minted once and never leaves the server.
 *
 * 4. LONG ENDPOINTING. The defaults are tuned for support bots answering "what
 *    is my balance". We are asking people to reflect on how their work actually
 *    goes, and the useful part of that answer usually arrives AFTER a pause.
 *    Cutting someone off mid thought is the single most damaging thing a voice
 *    interviewer can do, so we wait a lot longer than a support bot would.
 */

/** Both directions. See note 2: this must match the browser's graph rate. */
export const VOICE_SAMPLE_RATE = 48_000;

/**
 * How long a silence is allowed to run before we treat the turn as finished.
 * Deliberately far above the ~1s a support bot uses. A thoughtful pause mid
 * answer is routine, and the reflective part of an answer lives on the far side
 * of it.
 */
export const ENDPOINT_SILENCE_MS = 2_000;

/**
 * @typedef {{ thinkEndpointUrl: string, sessionToken: string, greeting: string, speakModel?: string,
 *   listenModel?: string }} VoiceSettingsInput
 * thinkEndpointUrl: absolute, publicly reachable URL of our think endpoint.
 * sessionToken: per session bearer, the plaintext half of session.voice_token_hash.
 * greeting: spoken first so cancellation converges before the participant talks.
 * speakModel: Deepgram TTS voice. listenModel: STT model.
 */

/** @param {VoiceSettingsInput} input */
export function buildVoiceSettings(input) {
  return {
    type: 'Settings',

    // Note 1. Confidentiality, per session, belt and braces with the account.
    mip_opt_out: true,

    audio: {
      // Note 2. Raw PCM both ways at the browser's own graph rate.
      input: {
        encoding: 'linear16',
        sample_rate: VOICE_SAMPLE_RATE,
      },
      output: {
        encoding: 'linear16',
        sample_rate: VOICE_SAMPLE_RATE,
        container: 'none',
      },
    },

    agent: {
      language: 'en',

      listen: {
        provider: {
          type: 'deepgram',
          model: input.listenModel ?? 'nova-3',
          // Note 4. Let people finish thinking.
          endpointing: ENDPOINT_SILENCE_MS,
        },
      },

      think: {
        // 'open_ai' selects the WIRE PROTOCOL, not the vendor. It means
        // "speak Chat Completions at this URL". Claude sits behind it.
        provider: {
          type: 'open_ai',
          model: process.env.VOICE_INTERVIEW_MODEL ?? 'claude-haiku-4-5',
        },
        endpoint: {
          // Note 3. Public URL, bearer authed per session.
          url: input.thinkEndpointUrl,
          headers: {
            authorization: `Bearer ${input.sessionToken}`,
          },
        },
      },

      speak: {
        provider: {
          type: 'deepgram',
          // British, masculine, warm. Chosen by ear from a blind-ish A/B rather
          // than from the tag list, which is the only way to pick a voice.
          //
          // The generation matters more than the character: an earlier build
          // used aura-athena-en, which reads as the right brief on paper
          // (British, calm, professional) but runs on the previous engine, and
          // it landed as flat and synthetic. Everything in the aura-2 family
          // has noticeably better prosody, so prefer it even when a v1 voice
          // looks like a closer match.
          model: input.speakModel ?? 'aura-2-draco-en',
        },
      },

      // Spoken immediately. Doubles as the warm up pass for echo cancellation,
      // which is adaptive and has converged on nothing until audio has flowed.
      greeting: input.greeting,
    },
  };
}
