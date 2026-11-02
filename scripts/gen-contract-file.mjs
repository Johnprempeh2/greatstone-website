import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { SITE_CONTRACT } from '../next-proof/site-contract.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

export async function contractFile(rootDir = root) {
  const pin = JSON.parse(await readFile(resolve(rootDir, 'contracts/VENDORED.json'), 'utf8'));
  const schema = JSON.parse(await readFile(resolve(rootDir, 'contracts/site-contract/schemas/contract-file.schema.json'), 'utf8'));
  const payload = { siteContract: SITE_CONTRACT, contractsCommit: pin.commit };
  const ajv = new Ajv();
  const validate = ajv.compile(schema);
  if (!validate(payload)) throw new Error(`Invalid /_contract.json: ${ajv.errorsText(validate.errors)}`);
  return payload;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await writeFile(resolve(root, 'public/_contract.json'), `${JSON.stringify(await contractFile())}\n`);
}
