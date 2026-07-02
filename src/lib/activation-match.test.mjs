import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activationInstructionsFor } from './activation-match.mjs';

// Real Greatstone ranges (subset) + one with no steps authored.
const V = [
  { name: 'Aspose', activation_instructions: 'ASPOSE' },
  { name: 'GroupDocs', activation_instructions: 'GROUPDOCS' },
  { name: 'Iron Software', activation_instructions: 'IRON' },
  { name: 'Apryse', activation_instructions: 'APRYSE' },
  { name: 'ActivePDF', activation_instructions: 'ACTIVEPDF' },
  { name: 'I.R.I.S.', activation_instructions: 'IRIS' },
  { name: 'PDFlib', activation_instructions: 'PDFLIB' },
  { name: 'Conholdate', activation_instructions: null }, // authored nothing yet
];

test('matches by dot-stripped vendor name (exact or prefixed token)', () => {
  assert.equal(activationInstructionsFor('Aspose.Total for .NET', V), 'ASPOSE');
  assert.equal(activationInstructionsFor('GroupDocs.Viewer for .NET', V), 'GROUPDOCS');
  assert.equal(activationInstructionsFor('ActivePDF DocConverter', V), 'ACTIVEPDF');
  assert.equal(activationInstructionsFor('Apryse SDK', V), 'APRYSE');
  assert.equal(activationInstructionsFor('PDFlib+PDI', V), 'PDFLIB');
});

test('dotted acronym vendor matches its products (I.R.I.S. -> IRISPen)', () => {
  assert.equal(activationInstructionsFor('IRISPen Extract', V), 'IRIS');
  assert.equal(activationInstructionsFor('readiris corporate', V), 'IRIS'); // "readiris" starts with... no; contains but token is one word
});

test('multi-word vendor first token extends the product token (Iron Software -> IronPDF)', () => {
  assert.equal(activationInstructionsFor('IronPDF', V), 'IRON');
  assert.equal(activationInstructionsFor('IronOCR for .NET', V), 'IRON');
});

test('no false positive from a standalone short token (Stainless Iron Tools !-> Iron Software)', () => {
  assert.equal(activationInstructionsFor('Stainless Iron Tools', V), null);
});

test('unmatched or empty product returns null', () => {
  assert.equal(activationInstructionsFor('Completely Unrelated Product', V), null);
  assert.equal(activationInstructionsFor('', V), null);
  assert.equal(activationInstructionsFor(null, V), null);
});

test('a range with no authored instructions is skipped, not matched', () => {
  assert.equal(activationInstructionsFor('Conholdate.Total', V), null);
});
