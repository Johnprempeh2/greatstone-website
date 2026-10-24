import { getStore } from '@netlify/blobs';
import baked from '../data/release.json' with { type: 'json' };
import { readGsamRelease, validateCurrent } from '../gsam-release.mjs';
import { writeFile } from 'node:fs/promises';

const siteId = process.env.GSAM_SITE_ID;
if (!siteId) throw new Error('GSAM_SITE_ID is required for a GSAM release build');
const store = getStore({ name: process.env.GSAM_RELEASE_BLOBS_STORE || 'gsam-content', siteID: process.env.NETLIFY_SITE_ID });
const current = await store.get('current', { type: 'json', consistency: 'strong' });
if (!current) throw new Error('Current GSAM release is missing');
const pointerProblem = validateCurrent(current);
if (pointerProblem) throw new Error(pointerProblem.message);
const raw = await store.get(current.key, { type: 'text' });
if (raw === null) throw new Error(`GSAM release ${current.release} is missing`);
const { release, refused } = readGsamRelease(raw, current, { siteId, orgId: process.env.GSAM_ORG_ID || baked.orgId }, baked);
if (refused) throw new Error(`GSAM release ${current.release}: ${refused.rule} ${refused.message}`);
await writeFile(new URL('../data/release.json', import.meta.url), `${JSON.stringify({ ...release, gsamSnapshot: true }, null, 2)}\n`);
console.log(`Exported GSAM release ${current.release} from ${current.key}`);
