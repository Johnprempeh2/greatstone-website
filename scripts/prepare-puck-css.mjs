import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(import.meta.resolve('@puckeditor/core/puck.css'));
const original = readFileSync(source, 'utf8');
const remoteFont = '@import "https://rsms.me/inter/inter.css";';
if (!original.startsWith(remoteFont)) throw new Error('Puck CSS font import changed; review editor CSP before building');
const local = `/* Generated from @puckeditor/core/puck.css (MIT). The remote font import is removed for the isolated frame. */\n${original.slice(remoteFont.length).trimStart()}`;
writeFileSync(new URL('../app/editor/puck-local.css', import.meta.url), local);
console.log('Prepared local Puck CSS without the remote font import');
