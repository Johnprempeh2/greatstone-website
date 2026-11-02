// Make a portal MCP token on your own computer (GRE-3769). Prints the token once, for your password manager and the
// app's greatstone-portal connection, and writes the owner-import payload, which holds only its SHA-256:
//
//   node scripts/mcp-token-new.mjs --label "<name>" --client <customer uuid> [--client <uuid> ...] --out <payload.json>
//
// Then: node scripts/owner-import-run.mjs submit --site greatstone-home --mode mcp-token --action dry-run --input <payload.json>
// (and apply). Never paste the token into a comment, PR, log or file; it is not stored anywhere else.
import { createHash, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { validateMcpToken } from '../netlify/functions/lib/owner-import.mjs';

/** A fresh token ('gspm_' + 64 hex, the shape portal-mcp accepts) and the payload that registers it. */
export function makeMcpToken(label, customerIds) {
  const token = `gspm_${randomBytes(32).toString('hex')}`;
  const payload = validateMcpToken({ label, customerIds, tokenSha256: createHash('sha256').update(token).digest('hex') });
  return { token, payload };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: {
    label: { type: 'string' }, client: { type: 'string', multiple: true }, out: { type: 'string' },
  } });
  if (!values.label || !values.client?.length || !values.out) throw new Error('Usage: --label <name> --client <uuid> [--client <uuid>] --out <payload.json>');
  const { token, payload } = makeMcpToken(values.label, values.client.map((c) => c.trim().toLowerCase()));
  writeFileSync(values.out, `${JSON.stringify(payload, null, 1)}\n`, { flag: 'wx', mode: 0o600 });
  console.log(`Payload (SHA-256 only) written to ${values.out}.`);
  console.log('Your token, shown once. Put it in your password manager and the greatstone-portal connection only:');
  console.log(token);
}
