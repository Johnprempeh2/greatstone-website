import Ajv from 'ajv/dist/2020.js';
import { readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import schema from '../release-schema/collections.v1.schema.json' with { type: 'json' };
import { publishedCatalogue } from '../catalogue-source.mjs';
import { toCatalogueCollections } from '../release-adapter.mjs';

const keys = ['vendors', 'categories', 'offerings'];
const ajv = new Ajv({ strict: false });
ajv.addSchema(schema);
const validators = Object.fromEntries(keys.map((key) => [key, ajv.getSchema(`${schema.$id}#/$defs/${key}`)]));

export function buildCatalogueImport(source) {
  const collections = toCatalogueCollections(source);
  const counts = {};
  for (const key of keys) {
    const rows = source[key];
    const entries = collections[key].entries;
    if (!Array.isArray(rows) || entries.length !== rows.length || new Set(entries.map((entry) => entry.id)).size !== rows.length) {
      throw new Error(`${key}: source and imported row counts or identities differ`);
    }
    for (const entry of entries) {
      if (!validators[key](entry.fields)) throw new Error(`${key}: invalid version 1 fields for ${entry.id}: ${ajv.errorsText(validators[key].errors)}`);
    }
    counts[key] = { source: rows.length, imported: entries.length };
  }
  return { collections, counts };
}

export function compareImportedCatalogue(exported, imported) {
  const counts = {};
  for (const key of keys) {
    const sourceIds = exported.collections[key].entries.map((entry) => entry.id).sort();
    const importedIds = imported.collections?.[key]?.entries?.map((entry) => entry.id).sort();
    if (!importedIds || sourceIds.length !== importedIds.length || sourceIds.some((id, index) => id !== importedIds[index])) {
      throw new Error(`${key}: exported and editor-imported rows differ`);
    }
    counts[key] = { source: sourceIds.length, imported: importedIds.length };
  }
  return counts;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const output = process.argv[2];
  if (!output) throw new Error('Usage: node next-proof/scripts/export-catalogue.mjs <output.json> [editor-import.json]');
  const target = resolve(output);
  const insideRepo = relative(resolve(import.meta.dirname, '../..'), target);
  if (!insideRepo.startsWith('..') && insideRepo !== '') throw new Error('Export output must be outside the repository');
  process.env.NEXT_CATALOGUE_REQUIRED = '1';
  const result = buildCatalogueImport(await publishedCatalogue());
  if (process.argv[3]) {
    const imported = JSON.parse(await readFile(process.argv[3], 'utf8'));
    result.counts = compareImportedCatalogue(result, imported);
  }
  await writeFile(target, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(result.counts));
}
