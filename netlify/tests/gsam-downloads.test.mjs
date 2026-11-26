import test from 'node:test';
import assert from 'node:assert/strict';
import { GSAM_DOWNLOADS } from '../functions/gsam-account.mjs';

test('My GSAM downloads default to the newest GSAM release on GitHub', () => {
  const base = 'https://github.com/Johnprempeh2/gs-agentic-manager/releases/latest/download/';
  assert.deepEqual(GSAM_DOWNLOADS, { mac: `${base}GSAM-Installer.dmg`, windows: `${base}GSAM-Setup.exe` });
});
