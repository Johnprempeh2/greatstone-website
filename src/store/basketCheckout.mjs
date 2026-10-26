export const basketSignature = (lines, email) => JSON.stringify({
  lines: lines.map((line) => [line.variantId || line.serviceSlug, line.qty]),
  email: email.trim(),
});

export const sentQuoteReference = (pending, lines, email) =>
  pending?.signature === basketSignature(lines, email) ? pending.quoteReference || '' : '';

export const sentBasketQuote = (pending, lines) => {
  if (!pending?.quoteReference) return null;
  try {
    const { email } = JSON.parse(pending.signature);
    if (typeof email !== 'string' || !sentQuoteReference(pending, lines, email)) return null;
    return { reference: pending.quoteReference, email };
  } catch { return null; }
};
