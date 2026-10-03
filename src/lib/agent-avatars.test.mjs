// The cap-v1 avatar exports in public/avatars/cap-v1 (GRE-465).
//
// The front door cards and the team pack email read filenames from index.json, so every palette it
// lists must have both files, and the MIT notice must ship beside them: ClipLab's licence asks that
// the notice go with every copy, and a copy without it is the one thing this folder must never be.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../../public/avatars/cap-v1');
const index = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8'));

test('the MIT notice ships with the avatars', () => {
  const licence = readFileSync(join(DIR, 'LICENSE'), 'utf8');
  assert.match(licence, /^MIT License/);
  assert.match(licence, /Cliplab/);
  assert.match(licence, /The above copyright notice and this permission notice shall be included/);
});

test('every listed palette has an SVG and a 512 px PNG', () => {
  assert.equal(index.characterVersion, 'cap-v1');
  assert.ok(index.palettes.length >= 3, 'a proposal shows three cards');
  for (const id of index.palettes) {
    assert.match(readFileSync(join(DIR, `${id}.svg`), 'utf8'), /^<svg[^>]*viewBox=/);
    const png = readFileSync(join(DIR, `${id}.png`));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), index.png.width);
    assert.equal(png.readUInt32BE(20), index.png.height);
  }
});

test('no image ships that index.json does not list', () => {
  const listed = new Set(index.palettes.flatMap(id => [`${id}.svg`, `${id}.png`]));
  const images = readdirSync(DIR).filter(f => /\.(svg|png)$/.test(f));
  assert.deepEqual(images.filter(f => !listed.has(f)), []);
});
