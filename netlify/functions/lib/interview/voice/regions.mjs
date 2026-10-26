// GRE-2653: Deepgram hosts. John's region decision (GRE-2639, 25 Oct): keep everything in the US, with safeguards,
// so the voice agent stays on the source engine's US hosts. settings.mjs keeps mip_opt_out: true (Deepgram does not
// store audio, text or transcripts). The voice "think" step calls Claude, also in the US.
export const DEEPGRAM_AGENT_URL = 'wss://agent.deepgram.com/v1/agent/converse';
export const DEEPGRAM_GRANT_URL = 'https://api.deepgram.com/v1/auth/grant';
export const DEEPGRAM_REGION = 'us';
