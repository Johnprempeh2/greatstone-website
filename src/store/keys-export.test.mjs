import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keysToCsv } from './keys-export.mjs';

test('keysToCsv: header row + one key row, expiry trimmed to date, order reference flattened', () => {
  const csv = keysToCsv([{ offering_name: 'Mortar Connect', variant_name: 'Team', licence_key: 'ABC-123', seats: 5, status: 'issued', expires_at: '2027-05-01T00:00:00Z', order: { reference: 'GS-DEMO-0001' } }]);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'Product,Variant,Licence key,Seats,Status,Expires,Order');
  assert.equal(lines[1], 'Mortar Connect,Team,ABC-123,5,issued,2027-05-01,GS-DEMO-0001');
});

test('keysToCsv: quotes fields containing commas/quotes/newlines and doubles inner quotes', () => {
  const csv = keysToCsv([{ offering_name: 'Bedrock, Platform', variant_name: 'He said "go"', licence_key: 'K\n2', status: 'issued' }]);
  const row = csv.split('\r\n')[1];
  assert.equal(row, '"Bedrock, Platform","He said ""go""","K\n2",,issued,,');
});

test('keysToCsv: missing fields render as empty cells', () => {
  const csv = keysToCsv([{ offering_name: 'X', status: 'expired' }]);
  assert.equal(csv.split('\r\n')[1], 'X,,,,expired,,');
});

test('keysToCsv: empty / null / garbage entries are safe', () => {
  assert.equal(keysToCsv([]), 'Product,Variant,Licence key,Seats,Status,Expires,Order');
  assert.equal(keysToCsv(null), 'Product,Variant,Licence key,Seats,Status,Expires,Order');
  assert.equal(keysToCsv([null, { offering_name: 'Y' }]).split('\r\n').length, 2); // null entry dropped
});
