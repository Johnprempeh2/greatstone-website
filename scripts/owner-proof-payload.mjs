// Build the one-time GRE-2805 staging proof payload from an approved export.
// All inputs and outputs must be paths inside GSAM_RUN_SCRATCH_DIR; nothing is printed except a count.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { hashSync } from 'bcryptjs';
import { validateImport } from '../netlify/database/migrations/052_better_auth/import-users.mjs';
import { validateProof } from '../netlify/functions/lib/owner-import.mjs';

if (!process.env.GSAM_RUN_SCRATCH_DIR) throw new Error('GSAM_RUN_SCRATCH_DIR is required');
const root = realpathSync(process.env.GSAM_RUN_SCRATCH_DIR);
const { values } = parseArgs({ options: {
  source: { type: 'string' }, payload: { type: 'string' }, credentials: { type: 'string' },
} });
function scratchPath(value) {
  const path = resolve(value || '');
  if (!path.startsWith(root + sep)) throw new Error('Every path must be inside run scratch');
  return path;
}
const sourcePath = scratchPath(values.source);
const payloadPath = scratchPath(values.payload);
const credentialsPath = scratchPath(values.credentials);
const users = validateImport(JSON.parse(readFileSync(sourcePath, 'utf8')));
if (users.some((user) => !/^\$2[aby]\$10\$/.test(user.passwordHash)))
  throw new Error('All source hashes must use bcrypt cost 10');
const digest = (value) => createHash('sha256').update(value).digest('hex');
const id = randomUUID();
const email = `gre2805-${id}@example.test`;
const password = randomBytes(32).toString('base64url');
const payload = validateProof({
  source: users.map((user) => ({
    id: user.id,
    uuidDigest: digest(user.id),
    emailDigest: digest(user.email),
    bcryptDigest: digest(user.passwordHash),
  })),
  fixture: { id, email, passwordHash: hashSync(password, 10) },
});
writeFileSync(payloadPath, JSON.stringify(payload), { mode: 0o600, flag: 'wx' });
writeFileSync(credentialsPath, JSON.stringify({ id, email, password }), { mode: 0o600, flag: 'wx' });
process.stdout.write('Prepared eight source digests and one cost-10 fixture in run scratch.\n');
