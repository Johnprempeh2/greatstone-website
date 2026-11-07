// GRE-2653: words for the account's interview data card (spec `retention-rights-regions`, section 4).
export const QUOTE_CHOICE_LABEL = Object.freeze({ none: 'No quotes', anonymous: 'Anonymous quotes', named: 'Quotes with my name' });

export const deleteConfirmText = (engagement) =>
  `This deletes your answers, transcripts and insights from ${engagement}. You will be taken out of the findings. This cannot be undone.`;

export const downloadName = (generatedAt) => `my-interview-data-${String(generatedAt || new Date().toISOString()).slice(0, 10)}.json`;
