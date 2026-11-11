// GRE-5013 (acceptance row R6.2, no lost answers): the typed chat, rendered for real under happy-dom against a fake
// /api/interview/chat that is idempotent on clientTurnId, as the real one is. The connection drops after the turn is
// stored, the one auto-retry fails too, the answer goes back in the box, and the person presses Send again. That
// second Send must reuse the first id, so the answer is stored once. Made-up data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runInDom, ROOT } from '../../store/deepdive-dom-harness.mjs';

const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatShell } from '${join(ROOT, 'src/portal/interview/ChatShell.jsx')}';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (ok, what, ms = 4000) => { const end = Date.now() + ms; while (!ok()) { if (Date.now() > end) throw new Error('timed out: ' + what + ' | ' + document.body.textContent.slice(-300)); await sleep(20); } };

// The fake server: stores a user turn once per clientTurnId, like the turn table's unique index.
const stored = [];
const ids = [];
let mode = 'drop-after-meta';
const sse = (events) => events.map((e) => 'data: ' + JSON.stringify(e) + '\\n\\n').join('');

globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(init.body);
  if (mode === 'offline') throw new TypeError('Failed to fetch');
  if (body.content) {
    ids.push(body.clientTurnId);
    if (!stored.some((t) => t.clientTurnId === body.clientTurnId)) stored.push({ clientTurnId: body.clientTurnId, content: body.content });
  }
  const enc = new TextEncoder();
  if (mode === 'drop-after-meta') {
    mode = 'offline';
    let sent = false;
    return { ok: true, status: 200, body: { getReader: () => ({ read: async () => {
      if (!sent) { sent = true; return { done: false, value: enc.encode(sse([{ type: 'meta', phase: 'day_in_life' }])) }; }
      throw new TypeError('network error');
    } }) } };
  }
  let sent = false;
  return { ok: true, status: 200, body: { getReader: () => ({ read: async () => {
    if (sent) return { done: true };
    sent = true;
    return { done: false, value: enc.encode(sse([{ type: 'meta', phase: 'day_in_life' }, { type: 'delta', text: 'Thanks. What comes next?' }, { type: 'done', agentTurnId: 'a2', phase: 'day_in_life' }])) };
  } }) } };
};

const type = (ta, text) => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, text);
  flushSync(() => ta.dispatchEvent(new Event('input', { bubbles: true })));
};

export async function run() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  flushSync(() => root.render(React.createElement(ChatShell, {
    sessionId: 's-test', phase: 'warmup', initialTurns: [{ id: 'a1', role: 'agent', content: 'Tell me about your day.' }],
  })));
  const ta = el.querySelector('textarea');
  const sendBtn = el.querySelector('button.send-btn');
  const out = {};

  type(ta, 'I start with the morning orders.');
  flushSync(() => sendBtn.click());
  // The stream drops, the auto-retry fails, and the answer comes back to the box.
  await until(() => ta.value === 'I start with the morning orders.' && !ta.disabled, 'draft restored');
  out.noteAfterDrop = el.querySelector('.notice-card')?.textContent ?? '';
  out.storedAfterDrop = stored.length;

  mode = 'online';
  await sleep(0);
  flushSync(() => el.querySelector('button.send-btn').click());
  await until(() => el.textContent.includes('Thanks. What comes next?'), 'reply shown');
  out.storedAfterResend = stored.length;
  out.ids = ids.slice();
  out.bubbles = [...el.querySelectorAll('.msg-user')].map((m) => m.textContent);

  // A changed answer is a new message, with a new id.
  type(el.querySelector('textarea'), 'And then I check the stock.');
  flushSync(() => el.querySelector('button.send-btn').click());
  await until(() => ids.length === 3, 'new answer sent');
  await sleep(100);
  out.idsAfterNew = ids.slice();

  root.unmount();
  el.remove();
  return out;
}
`;

test('R6.2: resending after a dropped connection and a failed retry stores the answer once', async () => {
  const out = await runInDom(ENTRY, 'chatresend');
  assert.equal(out.storedAfterDrop, 1, 'the first send stored the turn before the drop');
  assert.equal(out.storedAfterResend, 1, 'Send after the drop reuses the id, so the answer is stored once');
  assert.doesNotMatch(out.noteAfterDrop, /please send that again/, 'the note does not ask for a resend of a saved answer');
  assert.equal(new Set(out.ids).size, 1, `one id for one answer, got ${out.ids.join(', ')}`);
  assert.equal(out.idsAfterNew.length, 3);
  assert.notEqual(out.idsAfterNew[2], out.idsAfterNew[0], 'a new answer gets a new id');
});
