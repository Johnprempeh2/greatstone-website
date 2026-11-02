// GRE-3776, GRE-3777: the local sample release for the schema 2 renderer. Development only.
// It goes through the same reader as a GSAM release; the product list reads the public catalogue fixture.
import { createHash } from 'node:crypto';
import baked from '../../next-proof/data/release.json';
import sample from '../../next-proof/fixtures/html-release-sample.json';
import catalogue from '../../next-proof/fixtures/public-catalogue-2026-10-22.json';
import { readGsamRelease } from '../../next-proof/gsam-release.mjs';

const entries = (rows) => rows.map((row) => ({ id: row.id, fields: { data: row } }));

export function sampleRelease() {
  const collections = { vendors: entries(catalogue.vendors), categories: entries(catalogue.categories), offerings: entries(catalogue.offerings) };
  const raw = JSON.stringify({ ...sample, siteId: baked.siteId, collections });
  const current = { release: sample.release, sha256: createHash('sha256').update(raw).digest('hex') };
  const { release, refused } = readGsamRelease(raw, current, { siteId: baked.siteId, orgId: baked.orgId }, baked);
  if (refused) throw new Error(`Sample release refused: ${refused.rule} ${refused.message}`);
  return release;
}
