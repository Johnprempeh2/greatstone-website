// The client portal's Prototypes (John, 14 Nov). GSAM pushes one client's whole list (gs-portal-prototypes-v1) on
// the bridge write key; the portal reads only the signed-in client's rows, through RLS. No prototype id is ever taken
// from a client request, so there is nothing to guess.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[A-Za-z0-9_.:-]{1,100}$/;
const THUMBNAIL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
export const PORTAL_PROTOTYPES_SCHEMA = 'gs-portal-prototypes-v1';
export const PORTAL_PROTOTYPES_MAX = 50;
export const PORTAL_PROTOTYPES_PATH = /^\/api\/admin\/v1\/portal-prototypes\/clients\/[0-9a-f-]{36}$/i;

const text = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.length <= max;
const iso = (value) => text(value, 1, 40) && !Number.isNaN(Date.parse(value));

export function validatePrototypes(customerId, body) {
  if (!UUID.test(customerId) || !body || typeof body !== 'object' || Array.isArray(body) ||
      body.schema !== PORTAL_PROTOTYPES_SCHEMA || body.customerId !== customerId || !iso(body.generatedAt) ||
      !Array.isArray(body.prototypes) || body.prototypes.length > PORTAL_PROTOTYPES_MAX) {
    throw new TypeError('Invalid prototypes list');
  }
  const ids = new Set();
  for (const p of body.prototypes) {
    if (!p || typeof p !== 'object' || !ID.test(p.id || '') || ids.has(p.id) || !text(p.title, 1, 200) ||
        !(p.description === null || text(p.description, 0, 600)) ||
        !text(p.url, 9, 2000) || !/^https:\/\/[^\s/]+/.test(p.url) ||
        !Number.isSafeInteger(p.version) || p.version < 1 || !iso(p.updatedAt) ||
        !(p.thumbnail === null || (typeof p.thumbnail === 'string' && p.thumbnail.length <= 40000 && THUMBNAIL.test(p.thumbnail)))) {
      throw new TypeError('Invalid prototype');
    }
    ids.add(p.id);
  }
  return body;
}

/** Replace the client's list, inside the bridge write transaction (role gsam_bridge_write, its own org only). */
export async function replacePrototypes(client, org, customerId, body) {
  await client.query('DELETE FROM portal_prototypes WHERE customer_id=$1 AND org_id=$2', [customerId, org]);
  for (const p of body.prototypes) {
    await client.query(`INSERT INTO portal_prototypes
      (org_id, customer_id, prototype_id, title, description, url, version, thumbnail, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [org, customerId, p.id, p.title.trim(), p.description, p.url, p.version, p.thumbnail, p.updatedAt]);
  }
  return body.prototypes.length;
}

/** The signed-in client's prototypes, in the client's claims transaction. RLS limits it to their organisation. */
export async function clientPrototypes(client) {
  const { rows } = await client.query(`SELECT prototype_id AS id, title, description, url, version, thumbnail,
      updated_at AS "updatedAt"
    FROM portal_prototypes WHERE customer_id = app_customer_id() ORDER BY updated_at DESC, title`, []);
  return rows;
}
