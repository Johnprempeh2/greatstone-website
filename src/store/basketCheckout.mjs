export const basketSignature = (lines, email) => JSON.stringify({
  lines: lines.map((line) => [line.variantId || line.serviceSlug, line.qty]),
  email: email.trim(),
});

export const sentQuoteReference = (pending, lines, email) =>
  pending?.signature === basketSignature(lines, email) ? pending.quoteReference || '' : '';
