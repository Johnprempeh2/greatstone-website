// The documents held against one item.
//
// The point is not storage, it is the move from "we were told the chain runs through SPSS" to
// "here is the SPSS work". On an evidence item that is the partial → held transition the whole
// record is organised around, and it shortens the list a practitioner carries into a session.
import React, { useState, useRef } from 'react';
import { uploadFile, downloadFile, deleteFile, filesFor, prettyBytes, ACCEPTED, MAX_FILE_BYTES } from './deepdive-files.mjs';
import { Icon, Labelled } from './DeepDiveIcons.jsx';

const KIND_WORD = {
  'application/x-spss-sav': 'Statistics data (.sav)',
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument': 'Office document',
  'application/x-ole-storage': 'Office document',
  'text/plain': 'Text or CSV',
  'image/png': 'Image', 'image/jpeg': 'Image', 'image/gif': 'Image', 'image/webp': 'Image',
};

export default function Attachments({ slug, itemId, files, staff, canAuthor, busy, onAttach, onDetach }) {
  const mine = filesFor(files, itemId);
  const [staged, setStaged] = useState(null);   // uploaded, not yet named or recorded
  const [label, setLabel] = useState('');
  const [err, setErr] = useState(null);
  const [working, setWorking] = useState(false);
  const input = useRef(null);

  const pick = async (file) => {
    if (!file) return;
    setErr(null); setWorking(true);
    try {
      const up = await uploadFile(slug, file);
      setStaged(up);
      // Seeded from the filename so it is one keystroke, but the practitioner owns what is recorded:
      // the raw name never enters the record.
      setLabel(up.suggestedLabel || file.name || '');
    } catch (e) { setErr(e.message); }
    setWorking(false);
    if (input.current) input.current.value = '';
  };

  const commit = async () => {
    setErr(null); setWorking(true);
    try {
      await onAttach({ id: staged.id, label, mime: staged.mime, bytes: staged.bytes, attachedTo: [itemId] });
      setStaged(null); setLabel('');
    } catch (e) { setErr(e.message); }
    setWorking(false);
  };

  const get = async (f) => {
    setErr(null);
    try { await downloadFile(slug, f.id, f.label); } catch (e) { setErr(e.message); }
  };

  const drop = async (f) => {
    setErr(null); setWorking(true);
    // ⚠ The bytes go ONLY when nothing points at them any more. This used to delete them on every
    // detach, so taking a document off one item destroyed it for the other item still holding it.
    try {
      const r = await onDetach(f.id, itemId);
      if (r?.blobUnused !== false) await deleteFile(slug, f.id).catch(() => {});
    }
    catch (e) { setErr(e.message); }
    setWorking(false);
  };

  return (
    <section className="org-sec dd-sec dd-att">
      <h2><Labelled icon="evidence">Documents</Labelled></h2>
      {/* ⚠ HALF OF THIS WAS ABOUT WHERE THE BYTES LIVE, on every page that can hold a document:
          evidence, process, source and build all carried the same seventeen words. The distinction
          worth making is held versus told, and that is worth making once per page. Where the file
          is stored is an answer to a question nobody reading a record is asking; it is documented
          in the module that does the storing. */}
      <p className="org-sec-sub">What we actually hold, rather than what we were told.</p>

      {mine.length > 0 && (
        <ul className="dd-att-list">
          {mine.map((f) => (
            <li key={f.id} className="dd-att-row">
              <span className="dd-att-i" aria-hidden="true">{Icon.evidence({ size: 18 })}</span>
              <div className="dd-att-main">
                <h3>{f.label}</h3>
                <p>{KIND_WORD[f.mime] || 'Document'} · {prettyBytes(f.bytes || 0)}</p>
              </div>
              <button type="button" className="gs-btn ghost sm" disabled={busy || working}
                onClick={() => get(f)}>Download</button>
              {staff && (
                <button type="button" className="dd-ans-x" disabled={busy || working}
                  onClick={() => drop(f)}>Remove</button>
              )}
            </li>
          ))}
        </ul>
      )}

      {staff && canAuthor?.can && (staged ? (
        <div className="dd-att-name">
          <label>
            What is this document?
            <input value={label} autoFocus disabled={working}
              placeholder="e.g. the analysis syntax for the last wave"
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && label.trim()) { e.preventDefault(); commit(); } }} />
          </label>
          <p className="ca-note">
            {KIND_WORD[staged.mime] || 'Document'} · {prettyBytes(staged.bytes)}. The name you give it is
            what the record shows; the original filename is not stored in the record.
          </p>
          <div className="dd-att-foot">
            <button type="button" className="gs-btn ghost sm" disabled={working}
              onClick={() => { setStaged(null); setLabel(''); }}>Cancel</button>
            <button type="button" className="gs-btn primary sm" disabled={working || !label.trim()}
              onClick={commit}>{working ? 'Saving…' : 'Attach it'}</button>
          </div>
        </div>
      ) : (
        <div className="dd-att-add">
          <input ref={input} type="file" accept={ACCEPTED} className="gs-sr-only" id={`att-${itemId}`}
            disabled={busy || working} onChange={(e) => pick(e.target.files?.[0])} />
          <label htmlFor={`att-${itemId}`} className="dd-att-btn">
            {Icon.add({ size: 15 })}<span>{working ? 'Uploading…' : 'Attach a document'}</span>
          </label>
          <span className="dd-att-hint">
            Statistics data, spreadsheets, documents, PDFs, images or CSV. Up to {prettyBytes(MAX_FILE_BYTES)}.
          </span>
        </div>
      ))}

      {err && <p className="rd-err" role="alert">{err}</p>}
    </section>
  );
}
