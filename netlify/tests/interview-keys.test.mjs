import test from 'node:test';
import assert from 'node:assert/strict';
import { anthropicKey, deepgramKey } from '../functions/lib/interview/keys.mjs';
import { voiceEnabled } from '../functions/lib/interview/caller.mjs';

test('the staging names PIA_Key and PAI_Voice_Key are read', () => {
  assert.equal(anthropicKey({ PIA_Key: 'a' }), 'a');
  assert.equal(deepgramKey({ PAI_Voice_Key: 'd' }), 'd');
  assert.equal(voiceEnabled({ PAI_Voice_Key: 'd' }), true);
  assert.equal(voiceEnabled({ PAI_Voice_Key: 'd', VOICE_ENABLED: '0' }), false);
});

test('the standard names win, and no key is undefined', () => {
  assert.equal(anthropicKey({ ANTHROPIC_API_KEY: 's', PIA_Key: 'a' }), 's');
  assert.equal(deepgramKey({ DEEPGRAM_API_KEY: 's', PAI_Voice_Key: 'd' }), 's');
  assert.equal(anthropicKey({}), undefined);
  assert.equal(voiceEnabled({}), false);
});
