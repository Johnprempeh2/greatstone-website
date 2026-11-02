// The engine's model keys (GRE-2612). John set them on the staging site as `PIA_Key` (Anthropic) and
// `PAI_Voice_Key` (Deepgram). The standard names win when set, so either naming works.

/** The Anthropic key, or undefined. */
export const anthropicKey = (env = process.env) => env.ANTHROPIC_API_KEY || env.PIA_Key || undefined;

/** The Deepgram key, or undefined. */
export const deepgramKey = (env = process.env) => env.DEEPGRAM_API_KEY || env.PAI_Voice_Key || undefined;
