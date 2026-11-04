// The runner for the one-time owner importer (GRE-2578, netlify/functions/owner-import.mjs). It prints statuses and
// counts only, never row values. Needs NETLIFY_AUTH_TOKEN. Keep the export in run scratch and remove it after.
//
//   prepare --site <name> [--minutes 45] [--mode proof --input <payload.json>]
//                                          snapshot the database, set OWNER_IMPORT_SITE and OWNER_IMPORT_UNTIL
//                                          (at most 60 minutes). Netlify bakes env values into a deploy, so deploy
//                                          and publish the site next.
//   submit --site <name> --mode identities|tables|proof|mcp-token|mcp-token-revoke|approver --action dry-run|apply --input <file.json>
//                                          write the payload, then wait for the scheduled tick's result (every
//                                          five minutes; Netlify picks the minute) until the window ends. If no tick
//                                          ran, it removes the payload: nothing was applied. A table apply is
//                                          recounted through the read-only connection.
//   clear --site <name>                    remove both settings, the payload and the run state; print the last result.
//
// mcp-token takes the payload file from scripts/mcp-token-new.mjs ({ label, customerIds, tokenSha256 }); the token
// itself never goes in it. mcp-token-revoke takes { "tokenId": "<uuid>" } from the register result. approver takes
// { "email": "<staff sign-in email, lower case>", "label": "John" }, only as John names himself on the card (GRE-3964).
//
// Order: prepare, deploy, submit dry-run, submit apply, clear. A window that ends unused leaves the function inert;
// run clear, then prepare and deploy again.
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { getStore } from '@netlify/blobs';
import pg from 'pg';
import { validateImport } from '../netlify/database/migrations/052_better_auth/import-users.mjs';
import { claimProofHash, clearProofRecords } from './owner-proof-state.mjs';
import {
  SITES, STORE, MAX_WINDOW_MS, TABLES, buildTablesData, payloadHash, recountTables, targetColumns, validateProof,
  validateMcpToken, validateMcpTokenRevoke, validateApprover,
} from '../netlify/functions/lib/owner-import.mjs';

const API = 'https://api.netlify.com/api/v1';
const KEYS = ['OWNER_IMPORT_SITE', 'OWNER_IMPORT_UNTIL'];
const POLL_MS = 20_000;

async function netlify(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.NETLIFY_AUTH_TOKEN}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok && !(method === 'DELETE' && response.status === 404))
    throw new Error(`${method} ${path.split('?')[0]}: ${response.status}`);
  return response.status === 204 || method === 'DELETE' ? null : response.json();
}

async function target(name) {
  if (!Object.hasOwn(SITES, name || '')) throw new Error(`Site ${name} is not in the importer allow-list`);
  const site = await netlify('GET', `/sites/${SITES[name].id}`);
  if (site.name !== name) throw new Error('Site id and name differ');
  const store = getStore({ name: STORE, siteID: site.id, token: process.env.NETLIFY_AUTH_TOKEN });
  return { name, id: site.id, account: site.account_id, store };
}

async function setEnv(site, key, value) {
  await netlify('DELETE', `/accounts/${site.account}/env/${key}?site_id=${site.id}`);
  await netlify('POST', `/accounts/${site.account}/env?site_id=${site.id}`,
    [{ key, scopes: ['functions'], values: [{ context: 'production', value }] }]);
}

async function prepare(site, minutes, mode, input) {
  if (!(minutes > 0 && minutes * 60_000 <= MAX_WINDOW_MS)) throw new Error('--minutes must be 1 to 60');
  if (mode && mode !== 'proof') throw new Error('Only proof mode can be pinned at prepare time');
  if (!!mode !== !!input) throw new Error('Proof prepare requires both --mode proof and --input');
  if (mode === 'proof' && site.name !== 'gre1795-website-db-staging') throw new Error('Proof is staging only');
  const proofHash = mode === 'proof' ? payloadHash('proof', validateProof(JSON.parse(readFileSync(input, 'utf8')))) : undefined;
  if (await site.store.get('runner/state', { type: 'json' })) throw new Error('A window already exists; run clear first');
  if (await site.store.get('payload', { type: 'json' })) throw new Error('A payload is already waiting; run clear first');
  const snapshot = await netlify('POST', `/sites/${site.id}/database/snapshot`,
    { name: `owner-import-${new Date().toISOString().replace(/[:.]/g, '-')}`, metadata: { source: 'owner-import GRE-2578' } });
  const { snapshots = [] } = await netlify('GET', `/sites/${site.id}/database/snapshots`);
  if (!snapshot?.id || !snapshots.some((s) => s.id === snapshot.id)) throw new Error('Snapshot not confirmed; stopping');
  const until = new Date(Date.now() + minutes * 60_000).toISOString();
  await setEnv(site, 'OWNER_IMPORT_SITE', site.name);
  await setEnv(site, 'OWNER_IMPORT_UNTIL', until);
  await site.store.setJSON('runner/state', { snapshotId: snapshot.id, until, ...(proofHash ? { proofHash } : {}) });
  console.log(`Snapshot ${snapshot.id} confirmed. Window set until ${until}.`);
  console.log('Next: deploy and publish this site (env values reach functions only through a new deploy), then submit.');
}

async function readonlyColumns(site) {
  const { connection_strings: c = {} } = await netlify('GET', `/sites/${site.id}/database`);
  if (!c.netlifydb_readonly) throw new Error('No read-only connection for this site');
  const client = new pg.Client({ connectionString: c.netlifydb_readonly });
  await client.connect();
  return { client, columns: await targetColumns(client) };
}

async function submit(site, mode, action, input) {
  const state = await site.store.get('runner/state', { type: 'json' });
  if (!state?.until || Date.parse(state.until) <= Date.now()) throw new Error('No open window; run prepare and deploy first');
  if (state.proofHash && mode !== 'proof') throw new Error('This window is reserved for its prepared proof payload');
  if (await site.store.get('payload', { type: 'json' })) throw new Error('A payload is already waiting; run clear first');
  const source = JSON.parse(readFileSync(input, 'utf8'));
  let data;
  let readonly;
  if (mode === 'identities') {
    if (!SITES[site.name].modes.includes(mode)) throw new Error(`${mode} is not allowed on ${site.name}`);
    validateImport(source, SITES[site.name].identityCount); // fail here, before anything is written
    data = source;
  } else if (mode === 'proof') {
    if (site.name !== 'gre1795-website-db-staging') throw new Error('Proof is staging only');
    data = validateProof(source);
  } else if (mode === 'tables') {
    readonly = await readonlyColumns(site);
    const built = buildTablesData(source, readonly.columns);
    for (const [table, cols] of Object.entries(built.dropped)) console.log(`Not imported (not insertable on the target): ${table}: ${cols.join(', ')}`);
    data = built.data;
  } else if (mode === 'mcp-token' || mode === 'mcp-token-revoke' || mode === 'approver') {
    if (!SITES[site.name].modes.includes(mode)) throw new Error(`${mode} is not allowed on ${site.name}`);
    const validate = { 'mcp-token': validateMcpToken, 'mcp-token-revoke': validateMcpTokenRevoke, approver: validateApprover }[mode];
    try { data = validate(source); }
    catch (error) { throw new Error(`Payload refused: ${error.message}`); } // fixed reasons only, never a value
  } else throw new Error('--mode must be identities, tables, proof, mcp-token, mcp-token-revoke or approver');
  if (action !== 'dry-run' && action !== 'apply') throw new Error('--action must be dry-run or apply');

  try {
    const hash = payloadHash(mode, data);
    if (mode === 'proof') claimProofHash(state, hash);
    const submitted = Date.now();
    await site.store.setJSON('payload', { version: 1, mode, action, notAfter: state.until, data });
    console.log(`Payload ${hash.slice(0, 12)} written for ${action}. Waiting for the scheduled run (until ${state.until}).`);
    let result;
    while (!result && Date.now() < Date.parse(state.until)) {
      await sleep(POLL_MS);
      result = await site.store.get(`results/${hash}/${action}`, { type: 'json' });
      if (result && Date.parse(result.at) < submitted - POLL_MS) result = null; // a result from an earlier submit
    }
    if (!result) {
      await site.store.delete('payload');
      const latest = await site.store.get('results/latest', { type: 'json' });
      console.log('No scheduled run took the payload before the window ended. Payload removed; nothing was applied.');
      if (latest) console.log(`Last result: ${latest.status} ${latest.reason || ''} at ${latest.at}`);
      process.exitCode = 1;
      return;
    }
    if (mode === 'proof') await site.store.delete(`results/${hash}/${action}`);
    console.log(JSON.stringify({ status: result.status, reason: result.reason, code: result.code, counts: result.counts }, null, 1));
    if (result.status === 'failed') process.exitCode = 1;
    // A no-op wrote nothing now; its counts are the earlier apply's. Never report it as a success (GRE-2567 H6).
    if (result.status === 'noop') {
      console.log('Nothing was written by this submit: the importer says this payload was applied earlier in this window.');
      process.exitCode = 1;
    }
    if (mode === 'tables' && (result.status === 'applied' || result.status === 'noop')) {
      const { differs, byCount, byStats } = await recountTables(readonly.client, result.counts.tables);
      for (const table of differs) console.log(`Recount differs: ${table}`);
      if (differs.length) process.exitCode = 1;
      else console.log(`Read-only recount matches for all ${TABLES.length} tables: ${byCount} by count, ` +
        `${byStats} by live-row statistics (RLS hides their rows from the read-only role).`);
    }
  } finally { await readonly?.client.end(); }
}

async function clear(site) {
  const state = await site.store.get('runner/state', { type: 'json' });
  for (const key of KEYS) await netlify('DELETE', `/accounts/${site.account}/env/${key}?site_id=${site.id}`);
  await site.store.delete('payload');
  const latest = await site.store.get('results/latest', { type: 'json' });
  await clearProofRecords(site.store, state);
  await site.store.delete('runner/state');
  console.log('Settings, payload and run state removed. The last deploy keeps the old window value, which has ended or will.');
  if (latest) console.log(`Last result: ${latest.status} ${latest.reason || ''} at ${latest.at}`);
}

const { positionals: [command], values } = parseArgs({
  allowPositionals: true,
  options: { site: { type: 'string' }, minutes: { type: 'string', default: '45' }, mode: { type: 'string' },
    action: { type: 'string' }, input: { type: 'string' } },
});
if (!process.env.NETLIFY_AUTH_TOKEN) throw new Error('NETLIFY_AUTH_TOKEN is required');
const site = await target(values.site);
if (command === 'prepare') await prepare(site, Number(values.minutes), values.mode, values.input);
else if (command === 'submit') await submit(site, values.mode, values.action, values.input);
else if (command === 'clear') await clear(site);
else throw new Error('Usage: prepare | submit | clear (see the header of this file)');
