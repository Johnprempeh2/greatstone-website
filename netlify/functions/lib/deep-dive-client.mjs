// Shared Deep Dive projection. The website stores a whole snapshot per GSAM tenant;
// customer access is resolved only from the verified session inside an RLS transaction.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const itemId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 200;
const plain = (value) => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 2000) => typeof value === 'string' && value.length <= max;
const iso = (value) => text(value, 40) && !Number.isNaN(Date.parse(value));

export function validateSnapshot(tenantId, body) {
  if (!UUID.test(tenantId) || !plain(body) || body.schema !== 'gs-deep-dive-sync-v1' || body.tenantId !== tenantId ||
      !text(body.tenantName, 300) || !iso(body.generatedAt) ||
      !['items', 'files', 'documentRequests', 'deliverables'].every((key) => Array.isArray(body[key]) && body[key].length <= 1000)) {
    throw new TypeError('Invalid Deep Dive snapshot');
  }
  const ids = new Set();
  for (const item of body.items) {
    if (!plain(item) || 'visibility' in item || !itemId(item.id) || ids.has(item.id) ||
        !['deep_dive', 'deep_dive_stream', 'agent_team_blueprint'].includes(item.type) ||
        !text(item.title, 500) || !text(item.status, 100) || !plain(item.fields) || !iso(item.updatedAt)) {
      throw new TypeError('Invalid Shared item');
    }
    ids.add(item.id);
  }
  for (const item of body.items) if (item.parentId !== null && !ids.has(item.parentId)) throw new TypeError('Invalid parent');
  for (const file of body.files) if (!plain(file) || !itemId(file.id) || !ids.has(file.itemId) ||
      !text(file.title, 500) || !['held', 'missing'].includes(file.status)) throw new TypeError('Invalid Shared file');
  for (const request of body.documentRequests) if (!plain(request) || !itemId(request.id) ||
      !text(request.title, 500) || !Array.isArray(request.itemIds) || !request.itemIds.length ||
      !request.itemIds.every((id) => ids.has(id)) || !['open', 'received'].includes(request.status)) {
    throw new TypeError('Invalid Shared request');
  }
  for (const deliverable of body.deliverables) if (!plain(deliverable) || !itemId(deliverable.id) ||
      !text(deliverable.title, 500) || !['published', 'accepted'].includes(deliverable.status) || !iso(deliverable.publishedAt)) {
    throw new TypeError('Invalid published deliverable');
  }
  return body;
}

const READ = `SELECT s.tenant_id,s.snapshot FROM deep_dive_snapshots s
  JOIN deep_dive_tenant_links l ON l.tenant_id=s.tenant_id AND l.org_id=s.org_id
  WHERE l.customer_id=app_customer_id() AND l.customer_id IS NOT NULL LIMIT 1`;

export async function clientSnapshot(client) {
  const { rows } = await client.query(READ, []);
  return rows[0]?.snapshot || null;
}

export async function answerForClient(client, requestId) {
  if (!UUID.test(requestId)) return null;
  const { rows } = await client.query(READ, []);
  const row = rows[0];
  if (!row) return null;
  const request = row.snapshot.documentRequests.find((r) => r.id === requestId && r.status === 'open');
  return request ? { tenantId: row.tenant_id, request } : null;
}
