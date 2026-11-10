// The website guide: a visitor asks what Greatstone does, by voice or by typing, and is shown the right page.
//   POST /api/guide/start   a session (and, when voice is on, what the browser needs to open the voice call)
//   POST /api/guide/chat    one typed message in, one reply out
//   POST /api/guide/think   the voice service's call for the next spoken reply (the same brain as chat)
//   POST /api/guide/action  the page the last spoken reply asked the browser to open, read once
// Off unless VOICE_GUIDE_ENABLED is 1: every route answers 404, so merging this changes nothing.
// Nothing a visitor says is stored. The voice reuses the interview engine's Deepgram setup (lib/interview/voice).
import Anthropic from '@anthropic-ai/sdk';
import { getStore } from '@netlify/blobs';
import { publicIp } from './lib/public-actions.mjs';
import { json, voiceEnabled } from './lib/interview/caller.mjs';
import { interviewDb } from './lib/interview/db.mjs';
import { anthropicKey } from './lib/interview/keys.mjs';
import { ClauseBuffer } from './lib/interview/voice/clause-buffer.mjs';
import { bearerFrom } from './lib/interview/voice/session-token.mjs';
import { buildVoiceSettings } from './lib/interview/voice/settings.mjs';
import { chunkClose, chunkDone, chunkOpener, chunkText, SSE_HEADERS } from './lib/interview/voice/openai-wire.mjs';
import { grantDeepgramToken } from './interview-voice-start.mjs';
import { cleanHistory, GREETING, guideTurn, REFUSAL } from './lib/guide/brain.mjs';
import { mintGuideToken, readGuideToken, SESSION_SECONDS, visitorKey, withinLimit } from './lib/guide/session.mjs';
import { loadSite } from './lib/guide/site.mjs';

const SESSIONS_PER_VISITOR_PER_HOUR = 8;
// Typing is cheap (about a penny a chat), so it gets a generous day. Voice is about 8 cents a minute, so it gets its
// own small day, counted only when a call really starts, and a short call: 20 calls of 5 minutes is about $9 a day.
const DAILY_SESSIONS = 200;
const DAILY_VOICE_CALLS = 20;
const VOICE_CALL_MINUTES = 5;
const VOICE_BUSY = "Voice is busy for today. You can keep typing and I'll answer.";
const TURNS_PER_SESSION = 40;
const MESSAGE_CHARS = 500;
const ACTION_FRESH_MS = 60_000;

let anthropic = null;
const defaultClient = () => (anthropic ??= new Anthropic({ apiKey: anthropicKey() }));
// ponytail: a spoken reply's page action waits here for the browser to collect it. One that is never collected
// stays (a few bytes, at most the daily session cap a day); sweep the store if it ever matters.
const defaultActions = () => getStore({ name: 'voice-guide-actions', consistency: 'strong' });

const wholeNumber = (value, fallback, min, max) => (/^\d+$/.test(value || '') && Number(value) >= min && Number(value) <= max ? Number(value) : fallback);
// Written Greatstone, said as two words, so the voice never says "Greystone".
const spoken = (text) => text.replace(/\bGreatstone\b/g, 'Great Stone');
const refuse = (status, error, message, contactPath) => json({ error, message, ...(contactPath ? { contactPath } : {}) }, status);

function say(message, model) {
  const id = `chatcmpl-${crypto.randomUUID()}`;
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of [chunkOpener(id, model), chunkText(id, model, spoken(message)), chunkClose(id, model), chunkDone()]) controller.enqueue(chunk);
      controller.close();
    },
  }), { headers: SSE_HEADERS });
}

export function makeGuideHandler({ env = process.env, db = () => interviewDb('system'), model = defaultClient, site = loadSite, grant = grantDeepgramToken,
  actions = defaultActions, now = Date.now, log = console } = {}) {
  const modelId = env.VOICE_INTERVIEW_MODEL ?? 'claude-haiku-4-5';
  const turnAllowed = (sid) => withinLimit(db, `guide:turns:${sid}`, 900, TURNS_PER_SESSION);

  async function start(req, context, body) {
    const knowledge = await site();
    const unavailable = (status, error, message) => refuse(status, error, message, knowledge.contactPath);
    const visitor = visitorKey(env, publicIp(req, context));
    if (!visitor) return unavailable(503, 'unavailable', 'The guide is not available right now.');
    if (!(await withinLimit(db, `guide:ip:${visitor}`, 3600, SESSIONS_PER_VISITOR_PER_HOUR))) {
      return unavailable(429, 'busy', 'You have started several chats in the last hour. Please try again later.');
    }
    const day = new Date(now()).toISOString().slice(0, 10);
    if (!(await withinLimit(db, `guide:day:${day}`, 86400, wholeNumber(env.VOICE_GUIDE_DAILY_SESSIONS, DAILY_SESSIONS, 0, 100000)))) {
      return unavailable(429, 'busy', 'The guide has reached its limit for today. Please try again tomorrow.');
    }
    // Voice: only when asked for and switched on, and only within the day's voice calls. A refusal leaves typing open.
    let deepgramToken = null;
    let voiceNote = null;
    if (body.voice === true && voiceEnabled(env)) {
      deepgramToken = await grant(env);
      if (deepgramToken && !(await withinLimit(db, `guide:voice:${day}`, 86400, wholeNumber(env.VOICE_GUIDE_DAILY_VOICE_CALLS, DAILY_VOICE_CALLS, 0, 10000)))) {
        deepgramToken = null; // never used, it lapses in 30 seconds
        voiceNote = VOICE_BUSY;
      }
    }
    // A call's session ends when the call must: the browser hangs up then, and the think route stops answering.
    const seconds = deepgramToken ? 60 * wholeNumber(env.VOICE_GUIDE_CALL_MINUTES, VOICE_CALL_MINUTES, 1, 30) : SESSION_SECONDS;
    const session = mintGuideToken(env, now(), seconds);
    let voice = null;
    if (deepgramToken) {
      const base = (env.VOICE_THINK_BASE_URL || new URL(req.url).origin).replace(/\/+$/, '');
      const settings = buildVoiceSettings({ thinkEndpointUrl: `${base}/api/guide/think`, sessionToken: session.token, greeting: spoken(GREETING) });
      // How long a pause ends the visitor's turn. The interview waits 2 seconds for people thinking aloud.
      settings.agent.listen.provider.endpointing = wholeNumber(env.VOICE_GUIDE_ENDPOINT_MS, 2000, 300, 5000);
      voice = { deepgramToken, settings };
    }
    return json({ token: session.token, expiresAt: session.expiresAt, greeting: GREETING, voice, ...(voiceNote ? { voiceNote } : {}) });
  }

  async function chat(body) {
    const session = readGuideToken(body.token, env, now());
    if (!session || session.expired) return refuse(401, 'expired', 'This chat has ended. Send your message again to start a new one.');
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message || message.length > MESSAGE_CHARS) return refuse(400, 'message', `Please write a message of up to ${MESSAGE_CHARS} characters.`);
    if (!(await turnAllowed(session.sid))) return refuse(429, 'busy', 'This chat has reached its limit. Please start a new one in a few minutes.');
    try {
      const knowledge = await site();
      const turn = await guideTurn({ client: model(), modelId, knowledge, mode: 'text', path: body.path, maxTokens: 500,
        messages: cleanHistory([...(Array.isArray(body.history) ? body.history : []), { role: 'user', content: message }]) });
      return json({ reply: turn.text, action: turn.action });
    } catch (error) {
      log.error('guide chat failed:', error?.name || 'error');
      return refuse(502, 'failed', 'Sorry, something went wrong. Please try again.');
    }
  }

  async function think(req) {
    const session = readGuideToken(bearerFrom(req.headers.get('authorization')), env, now());
    if (!session) return json({ error: 'Unauthorised' }, 401);
    if (session.expired) return say("That is the end of the voice call. You can keep typing and I'll answer.", modelId);
    const body = await req.json().catch(() => null);
    const messages = cleanHistory(body?.messages);
    if (!messages.length) return say('Sorry, could you say that again?', modelId);
    if (!(await turnAllowed(session.sid))) return say('This call has reached its limit. You can start a new one in a few minutes.', modelId);

    const id = `chatcmpl-${crypto.randomUUID()}`;
    const stream = new ReadableStream({
      async start(controller) {
        const clauses = new ClauseBuffer();
        const send = (text) => controller.enqueue(chunkText(id, modelId, `${spoken(text)} `));
        let turn = null;
        try {
          controller.enqueue(chunkOpener(id, modelId));
          const knowledge = await site();
          turn = await guideTurn({ client: model(), modelId, knowledge, mode: 'voice', maxTokens: 300, messages,
            onText: (text) => clauses.push(text).forEach(send) });
          // What was already said cannot be unsaid; what was about to be is dropped.
          if (turn.leaked) { clauses.drain(); send(REFUSAL); }
        } catch (error) {
          log.error('guide think failed:', error?.name || 'error');
          clauses.drain();
          send('Sorry, could you say that again?');
        } finally {
          const tail = clauses.drain();
          if (tail) send(tail);
          controller.enqueue(chunkClose(id, modelId));
          controller.enqueue(chunkDone());
        }
        // Before the stream closes: the function may be frozen once it does.
        try {
          if (turn?.action) await actions().setJSON(session.sid, { action: turn.action, at: now() });
        } catch (error) {
          log.error('guide action not kept:', error?.name || 'error');
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: SSE_HEADERS });
  }

  async function action(body) {
    const session = readGuideToken(body.token, env, now());
    if (!session || session.expired) return refuse(401, 'expired', 'This call has ended.');
    const store = actions();
    const waiting = await store.get(session.sid, { type: 'json' });
    if (!waiting) return json({ action: null });
    await store.delete(session.sid);
    return json({ action: now() - waiting.at < ACTION_FRESH_MS ? waiting.action : null });
  }

  return async function handler(req, context) {
    if (env.VOICE_GUIDE_ENABLED !== '1') return json({ error: 'Not found' }, 404);
    const route = new URL(req.url).pathname.replace(/^\/api\/guide\//, '');
    if (!['start', 'chat', 'think', 'action'].includes(route)) return json({ error: 'Not found' }, 404);
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { allow: 'POST' });
    if (route === 'think') return think(req);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return refuse(400, 'body', 'That request could not be read.');
    try {
      if (route === 'start') return await start(req, context, body);
      if (route === 'chat') return await chat(body);
      return await action(body);
    } catch (error) {
      log.error(`guide ${route} failed:`, error?.name || 'error');
      return refuse(500, 'failed', 'Sorry, something went wrong. Please try again.');
    }
  };
}

export default makeGuideHandler();
export const config = { path: '/api/guide/*' };
