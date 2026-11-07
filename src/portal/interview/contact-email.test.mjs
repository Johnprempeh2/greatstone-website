// GRE-4309: interview participants see one contact address, the legal contact (src/lib/legal-facts.mjs).
// When the mailbox changes, the one constant changes and every interview screen follows.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { LEGAL_CONTACT_EMAIL } from '../../lib/legal-facts.mjs';

const DIR = new URL('./', import.meta.url);
const SCREENS = ['CompletionCard', 'Footer', 'InterviewDiscarded', 'InterviewGoodbye', 'InterviewHome',
  'InterviewResults', 'InterviewSignIn', 'PageStatus'];

let vite;
let InterviewFooter;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  ({ InterviewFooter } = await vite.ssrLoadModule('/src/portal/interview/Footer.jsx'));
});
after(async () => { await vite?.close(); });

test('no interview source file hard-codes an email address', () => {
  const files = readdirSync(DIR).filter((f) => /\.(jsx?|mjs)$/.test(f) && !f.includes('.test.'));
  for (const f of files) {
    // An input's placeholder (the sign-in "you@company.com") is an example, not a contact address.
    const src = readFileSync(new URL(f, DIR), 'utf8').replace(/placeholder="[^"]*"/g, '');
    const addresses = src.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) || [];
    assert.deepEqual(addresses, [], `${f} has a hard-coded address; import LEGAL_CONTACT_EMAIL instead`);
  }
});

test('the eight screens that show a contact address use LEGAL_CONTACT_EMAIL', () => {
  for (const s of SCREENS) {
    const src = readFileSync(new URL(`${s}.jsx`, DIR), 'utf8');
    assert.match(src, /import \{ LEGAL_CONTACT_EMAIL \} from '\.\.\/\.\.\/lib\/legal-facts\.mjs';/, s);
    assert.match(src, /href=\{`mailto:\$\{LEGAL_CONTACT_EMAIL\}`\}/, s);
  }
});

test('the footer every interview screen ends with renders the legal contact', () => {
  const html = renderToStaticMarkup(React.createElement(InterviewFooter));
  assert.ok(html.includes(`href="mailto:${LEGAL_CONTACT_EMAIL}"`));
  assert.ok(html.includes(`>${LEGAL_CONTACT_EMAIL}<`));
});
