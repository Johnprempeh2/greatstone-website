// GRE-2653: Deepgram in the EU (GRE-2639, item 5). Deepgram: "a full in-region guarantee requires both a regional
// endpoint and mip_opt_out=true" (settings.mjs keeps mip_opt_out: true). The source engine used the US hosts
// (wss://agent.deepgram.com/v1/agent/converse and https://api.deepgram.com/v1/auth/grant).
// Note: the voice "think" step calls Claude, so voice text still goes to Claude's region (John's region decision).
export const DEEPGRAM_AGENT_URL = 'wss://api.eu.deepgram.com/v1/agent/converse';
export const DEEPGRAM_GRANT_URL = 'https://api.eu.deepgram.com/v1/auth/grant';
export const DEEPGRAM_REGION = 'eu';
