import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import Ajv from 'ajv';
import { SITE_CONTRACT } from '../next-proof/site-contract.mjs';
import { contractFile } from './gen-contract-file.mjs';

const root = new URL('../', import.meta.url);

test('generated static contract matches the pinned source and canonical schema', async () => {
  const pin = JSON.parse(await readFile(new URL('contracts/VENDORED.json', root)));
  const schema = JSON.parse(await readFile(new URL('contracts/site-contract/schemas/contract-file.schema.json', root)));
  const validate = new Ajv().compile(schema);
  execFileSync(process.execPath, [new URL('./gen-contract-file.mjs', import.meta.url).pathname]);
  const served = JSON.parse(await readFile(new URL('public/_contract.json', root)));

  assert.deepEqual(served, await contractFile());
  assert.deepEqual(served, { siteContract: SITE_CONTRACT, contractsCommit: pin.commit });
  assert.equal(validate(served), true);
  assert.equal(validate({ ...served, contractsCommit: 'invalid' }), false);
});
