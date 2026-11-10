// The parts of the website guide's panel that are not React, kept apart so node can test them.

// Where the guide never appears: signed-in areas, the editor's frames and internal tools.
const NOT_PUBLIC = /^\/(account|org|portal|catalogue|invoice|join|order-confirmed|privacy\/interviews|editor|preview|live-design|effect-preview|html-export|html-sample|media|api|_release|_islands)(\/|$)/;
export const isPublicPath = (pathname) => typeof pathname === 'string' && pathname.startsWith('/') && !NOT_PUBLIC.test(pathname);

// A page the guide may open: a plain path on this site. The server only ever sends paths from its own list; this
// is the second lock, so nothing that could leave the site ("//host", "https:", "/\host") is ever followed.
export const safePath = (path) => (typeof path === 'string' && /^\/(?!\/)[A-Za-z0-9/_%.~-]*$/.test(path) ? path : null);

const title = (value) => (typeof value === 'string' ? value.trim().slice(0, 120) : '');

/** What a reply asked the screen to do, checked again in the browser. Anything odd is dropped. */
export function cleanAction(action) {
  if (action?.type === 'go') {
    const path = safePath(action.path);
    return path && title(action.title) ? { type: 'go', path, title: title(action.title) } : null;
  }
  if (action?.type === 'options' && Array.isArray(action.options)) {
    const options = action.options.map((option) => ({ path: safePath(option?.path), title: title(option?.title) }))
      .filter((option) => option.path && option.title).slice(0, 4);
    return options.length ? { type: 'options', options } : null;
  }
  return null;
}

// The voice is sent "Great Stone" so it says the name properly. On screen the name is one word.
export const displayText = (text) => String(text ?? '').replace(/\bGreat Stone\b/g, 'Greatstone');

const KEPT = 60;
/**
 * The conversation with one more entry. `role` is 'you', 'guide' or 'note' (a line from the panel itself).
 * Speech arrives in pieces: with `spoken`, a piece joins the spoken entry before it when the speaker is the same.
 */
export function addMessage(messages, role, text, { spoken = false, action = null } = {}) {
  const words = String(text ?? '').trim();
  if (!words) return messages;
  const last = messages.at(-1);
  if (spoken && last?.spoken && last.role === role && !last.action) return [...messages.slice(0, -1), { ...last, text: `${last.text} ${words}` }];
  return [...messages, { id: (last?.id ?? 0) + 1, role, text: words, ...(spoken ? { spoken } : {}), ...(action ? { action } : {}) }].slice(-KEPT);
}

/** Puts a page action on the guide's latest line (a spoken reply's action arrives after its words). */
export function attachAction(messages, action) {
  const index = messages.findLastIndex((message) => message.role === 'guide');
  if (!action || index < 0) return messages;
  return messages.map((message, i) => (i === index ? { ...message, action } : message));
}

/**
 * The conversation as the browser tab kept it, so it survives a full page load. Checked again on the way back in:
 * only the three kinds of line, text only, and every page link through the same lock as a fresh one.
 */
export function restore(raw, now = Date.now()) {
  let kept = null;
  try { kept = JSON.parse(raw); } catch { return null; }
  if (!Array.isArray(kept?.messages)) return null;
  const messages = kept.messages.filter((message) => ['you', 'guide', 'note'].includes(message?.role) && typeof message.text === 'string' && message.text.trim())
    .slice(-KEPT).map((message, index) => {
      const action = cleanAction(message.action);
      return { id: index + 1, role: message.role, text: message.text.slice(0, 4000), ...(action ? { action } : {}) };
    });
  const session = typeof kept.session?.token === 'string' && Number(kept.session.expiresAt) > now ? { token: kept.session.token, expiresAt: Number(kept.session.expiresAt) } : null;
  return { messages, session, open: kept.open === true, calling: kept.calling === true };
}

/** What the server is sent as the conversation so far: the two speakers only, most recent last. */
export const historyFor = (messages) => messages.filter((message) => message.role === 'you' || message.role === 'guide').slice(-12)
  .map((message) => ({ role: message.role === 'you' ? 'user' : 'assistant', content: message.text }));

export const STATUS_LABEL = { idle: '', asking: 'Asking for the microphone', listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking', error: '' };
export const statusFromVoice = (state) => ({ connecting: 'asking', listening: 'listening', thinking: 'thinking', speaking: 'speaking' })[state] || 'idle';

export const voiceSupported = (win) => Boolean(win?.navigator?.mediaDevices?.getUserMedia && win.AudioContext && win.AudioWorkletNode && win.WebSocket);

/** A plain sentence for a call that would not start. The browser's own wording is jargon. */
export function micMessage(error) {
  const reason = `${error?.name || ''} ${error?.message || ''}`;
  if (/NotAllowed|Security|permission|denied/i.test(reason)) return 'Microphone access was blocked. Allow it in your browser settings, then try again. You can also type below.';
  if (/NotFound|Overconstrained|NotReadable/i.test(reason)) return 'No working microphone was found. You can type below instead.';
  return 'The call could not start. You can try again, or type below.';
}

/** A microphone level in decibels (the voice engine's -60 to 0) as 0 to 1. */
export const micLevel = (db) => (Number.isFinite(db) ? Math.max(0, Math.min(1, (db + 55) / 40)) : 0);

/**
 * How the stone sits at time `t` (seconds) in each state. `speak` and `mic` are levels from 0 to 1.
 * idle: a gentle float. listening: a slower breath that swells a little with the visitor's voice.
 * thinking (and asking): a slow turn. speaking: the slabs open, the stone grows and glows with the guide's voice.
 * `turn` is the stone's turn about its upright, `lift` its float, `spread` how far each slab moves out.
 */
export function stonePose(status, { speak = 0, mic = 0 } = {}, t = 0) {
  const sway = Math.sin(t * 0.5) * 0.22;
  if (status === 'speaking') return { scale: 1 + speak * 0.16, spread: 0.03 + speak * 0.3, glow: 0.45 + speak * 1.4, turn: sway * 0.6, lift: Math.sin(t * 1.4) * 0.04 };
  if (status === 'listening') return { scale: 1 + Math.sin(t * 1.3) * 0.025 + mic * 0.06, spread: mic * 0.14, glow: 0.35 + mic * 0.5, turn: sway * 0.5, lift: Math.sin(t * 0.9) * 0.04 };
  if (status === 'thinking' || status === 'asking') return { scale: 1, spread: 0.06, glow: 0.4, turn: t * 0.7, lift: 0 };
  return { scale: 1, spread: 0, glow: 0.3, turn: sway, lift: Math.sin(t * 1.1) * 0.08 };
}
