import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import baked from './data/release.json' with { type: 'json' };
import { releaseReport } from '../app/release-observation.mjs';
import { helloAckPayload } from './frame-editor.mjs';
import { FRAME_PROTOCOL } from './frame-protocol.mjs';

const ajv = new Ajv({ strict: false });
addFormats(ajv);
function matches(name, value) {
  const schema = JSON.parse(readFileSync(new URL(`../contracts/site-contract/schemas/${name}.schema.json`, import.meta.url)));
  const validate = ajv.compile(schema);
  assert.equal(validate(value), true, JSON.stringify(validate.errors));
}

test('the real editor hello-ack payload speaks the shared schema', () => {
  const payload = helloAckPayload({ protocol: FRAME_PROTOCOL, nonce: 'test-nonce', siteId: baked.siteId,
    engine: baked.release.engine, mode: 'editor', liveData: baked.pages[0].data, editorMessages: [],
    motion: { blocks: [{ type: 'Hero', label: 'Hero' }] } });
  matches('editor-hello-ack', payload);
  assert.equal(payload.siteContract, 1);
});

test('the real /_release response builder speaks the shared schema', () => {
  const payload = releaseReport({ release: baked, source: 'baked', refused: null }, baked.release.engine, [1]);
  matches('release-answer', payload);
  assert.equal(payload.siteContract, 1);
});
