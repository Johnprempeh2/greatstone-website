export function saveRequest({ pending, retry, pageId, baseRevisionId, data, createId }) {
  if (retry && pending) return pending;
  return { requestId: createId(), pageId, baseRevisionId, data };
}

export function saveDecision(pending, draft, result) {
  if (!pending || result?.requestId !== pending.requestId) return null;
  if (result.outcome === 'saved' && typeof result.revisionId === 'string') {
    return { kind: 'saved', revisionId: result.revisionId, dirty: JSON.stringify(draft) !== JSON.stringify(pending.data) };
  }
  if (result.outcome === 'conflict' && typeof result.currentRevisionId === 'string' && Array.isArray(result.currentData?.content)) {
    return { kind: 'conflict', revisionId: result.currentRevisionId, data: result.currentData, media: result.currentMedia || {} };
  }
  if (result.outcome === 'failed') return { kind: 'failed', retryable: !!result.retryable, message: String(result.message || 'Save failed. Your changes are still here.') };
  return null;
}
