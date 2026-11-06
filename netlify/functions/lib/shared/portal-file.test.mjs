// Portal PDF download (GRE-1257). Made-up data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handlePortalFile, pdfDownloadName, SIGNED_URL_SECONDS } from './portal-file.mjs';

const ID = 'd0000000-0000-4000-8000-0000000000a1';
const DOC = { id: ID, title: 'Test GITA: Client A', version: 2, pdf_path: 'c0000000-0000-4000-8000-000000000001/' + ID + '/ab12-gita.pdf' };

function deps({ doc = DOC, readError = null, signError = null, throwRead = false } = {}) {
  const calls = { read: [], sign: [] };
  return {
    calls,
    readDocument: async (id) => { calls.read.push(id); if (throwRead) throw new Error('network'); return { data: doc, error: readError }; },
    signUrl: async (path, seconds, name) => {
      calls.sign.push({ path, seconds, name });
      return signError ? { data: null, error: signError } : { data: { signedUrl: 'https://files.example.test/signed?token=made-up' }, error: null };
    },
  };
}

test('signed in, own published document with a PDF: a one-minute signed link for the stored path', async () => {
  const d = deps();
  const out = await handlePortalFile({ signedIn: true, documentId: ID, deps: d });
  assert.equal(out.status, 200);
  assert.equal(out.body.url, 'https://files.example.test/signed?token=made-up');
  assert.equal(out.body.name, 'test-gita-client-a-v2.pdf');
  assert.deepEqual(d.calls.sign, [{ path: DOC.pdf_path, seconds: SIGNED_URL_SECONDS, name: 'test-gita-client-a-v2.pdf' }]);
  assert.equal(SIGNED_URL_SECONDS, 60);
});

test('not signed in: refused before anything is read', async () => {
  const d = deps();
  const out = await handlePortalFile({ signedIn: false, documentId: ID, deps: d });
  assert.equal(out.status, 401);
  assert.equal(d.calls.read.length, 0);
});

test('a link that is not a document id: refused before anything is read', async () => {
  for (const bad of ['', 'abc', ID + "' or 1=1", null]) {
    const d = deps();
    assert.equal((await handlePortalFile({ signedIn: true, documentId: bad, deps: d })).status, 400);
    assert.equal(d.calls.read.length, 0);
  }
});

test('RLS hides the document (another company, a draft, withdrawn): 404 and nothing is signed', async () => {
  const d = deps({ doc: null });
  const out = await handlePortalFile({ signedIn: true, documentId: ID, deps: d });
  assert.equal(out.status, 404);
  assert.equal(d.calls.sign.length, 0);
  assert.doesNotMatch(JSON.stringify(out.body), /c0000000|\.pdf/);
});

test('a document with no PDF: 404 and nothing is signed', async () => {
  const d = deps({ doc: { ...DOC, pdf_path: null } });
  assert.equal((await handlePortalFile({ signedIn: true, documentId: ID, deps: d })).status, 404);
  assert.equal(d.calls.sign.length, 0);
});

test('read or signing fails: 502 with a next step, no path in the message', async () => {
  for (const o of [{ readError: { message: 'boom' } }, { throwRead: true }, { signError: { message: 'Object not found ' + DOC.pdf_path } }]) {
    const out = await handlePortalFile({ signedIn: true, documentId: ID, deps: deps(o) });
    assert.equal(out.status, 502);
    assert.match(out.body.error, /Try again/);
    assert.doesNotMatch(out.body.error, /c0000000|boom/);
  }
});

test('download name: safe characters, version, .pdf', () => {
  assert.equal(pdfDownloadName({ title: '../GITA <x>', version: 3 }), 'gita-x-v3.pdf');
  assert.equal(pdfDownloadName({}), 'document-v1.pdf');
});
