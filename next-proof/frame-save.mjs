export function frameSaveData(data) {
  if (data?.zones && Object.keys(data.zones).length) {
    throw new Error('This page contains legacy DropZone blocks. Remove them before saving.');
  }
  return { root: { props: data.root.props }, content: data.content };
}

export function saveRequest({ pending, retry, pageId, baseRevisionId, data, createId }) {
  const safeData = frameSaveData(data);
  if (retry && pending) return pending;
  return { requestId: createId(), pageId, baseRevisionId, data: safeData };
}

export function saveDecision(pending, draft, result) {
  if (!pending || result?.requestId !== pending.requestId) return null;
  if (result.outcome === 'saved' && typeof result.revisionId === 'string') {
    let dirty = true;
    try { dirty = JSON.stringify(frameSaveData(draft)) !== JSON.stringify(pending.data); } catch { /* Keep unsupported edits unsaved. */ }
    return { kind: 'saved', revisionId: result.revisionId, dirty };
  }
  if (result.outcome === 'conflict' && typeof result.currentRevisionId === 'string' && Array.isArray(result.currentData?.content)) {
    return { kind: 'conflict', revisionId: result.currentRevisionId, data: result.currentData, media: result.currentMedia || {} };
  }
  if (result.outcome === 'failed') return { kind: 'failed', retryable: !!result.retryable, message: String(result.message || 'Save failed. Your changes are still here.') };
  return null;
}
