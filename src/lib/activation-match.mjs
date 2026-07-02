// Match a licence's product name to its vendor (product range), so the range's activation instructions
// (vendors.activation_instructions, migration 0025) can be shown on the account + injected into the email.
//
// No vendor_id is stored on the licence, so we match by name. A bare substring test is wrong twice: it misses
// dotted acronyms (I.R.I.S.) and mis-matches short tokens ("iron" inside an unrelated word). This is
// token-anchored instead: tokenise the product name on non-alphanumerics, then a vendor matches when a token
//   (a) contains the vendor's dot-stripped name  ("iris" -> "IRISPen"/"ReadIRIS"; "aspose" -> "Aspose.Total"), or
//   (b) strictly EXTENDS the vendor's first 3+ char token  ("iron" -> "IronPDF", but NOT a standalone "iron").
// The dot-stripped full names here (iris, aspose, apryse, groupdocs, activepdf, …) are specific enough that a
// substring test won't hit unrelated products; the short first token needs the stricter prefix-and-longer test.
// Pure + framework-free so it is unit-tested. Vendors without instructions are skipped.
export function activationInstructionsFor(offeringName, vendors) {
  const toks = String(offeringName || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (!toks.length) return null;
  for (const v of vendors || []) {
    if (!v || !v.activation_instructions) continue;
    const dotless = String(v.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const first = String(v.name || '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3)[0] || '';
    const matched = toks.some((t) =>
      (dotless.length >= 3 && t.includes(dotless)) ||
      (first && t.startsWith(first) && t.length > first.length)
    );
    if (matched) return v.activation_instructions;
  }
  return null;
}

export default activationInstructionsFor;
