// Port of SOURCE src/lib/voice/openai-wire.ts @505ba6a. Chunk shapes, [DONE] sentinel and SSE headers
// unchanged. Port: types stripped (`as const` dropped from SSE_HEADERS), `import 'server-only'` removed.

/**
 * The OpenAI Chat Completions wire format, which is what Deepgram's Voice
 * Agent speaks to a bring-your-own-LLM endpoint.
 *
 * `agent.think.provider.type` selects the PROTOCOL Deepgram uses, not just a
 * label. We declare `open_ai` because it is the best-tested path and the only
 * shape with a Deepgram-authored reference server, then translate to Anthropic
 * inside our own route. So this module is the adapter's vocabulary: Deepgram
 * believes it is talking to OpenAI, and Claude never sees any of it.
 */

/**
 * What Deepgram POSTs to us. Tolerate unknown fields: the schema is unpublished.
 * @typedef {{ model?: string, messages?: Array<{ role: string, content?: string | null }>, stream?: boolean,
 *   temperature?: number, [k: string]: unknown }} ChatCompletionsRequest
 */

/**
 * The newest participant utterance. Deepgram sends the accumulated history on
 * every call, but OUR turn table is the evidentiary record, so we take only
 * the latest user message and rebuild context from our own state. Deepgram's
 * history is a cross-check, never the source of truth.
 *
 * @param {ChatCompletionsRequest} body
 * @returns {string}
 */
export function latestUserMessage(body) {
  const msgs = Array.isArray(body?.messages) ? body.messages : [];
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    const m = msgs[i];
    if (m?.role === 'user' && typeof m.content === 'string' && m.content.trim()) {
      return m.content.trim();
    }
  }
  return '';
}

const enc = new TextEncoder();

/** One SSE frame. The blank line terminator is required. @returns {Uint8Array} */
function frame(payload) {
  return enc.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * Emit `chat.completion.chunk` deltas. Deepgram parses these to drive TTS, so
 * the shape has to be right or the agent simply never speaks.
 */
export function chunkOpener(id, model) {
  return frame({
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
  });
}

export function chunkText(id, model, text) {
  return frame({
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
  });
}

export function chunkClose(id, model) {
  return frame({
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
  });
}

/**
 * The terminating sentinel. Deepgram publishes a warning code for a provider
 * that "failed to send a final done message", so omitting this hangs the turn
 * until a timeout: the agent goes silent mid-conversation.
 */
export function chunkDone() {
  return enc.encode('data: [DONE]\n\n');
}

/** Headers that keep the stream unbuffered end to end. */
export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  // Defeats proxy buffering, which would otherwise hold the first token and
  // silently add seconds to time-to-first-audio.
  'X-Accel-Buffering': 'no',
};
