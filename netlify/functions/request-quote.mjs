import { randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { createClient } from '@supabase/supabase-js';
import { getPool } from './lib/db.mjs';
import { basketItems, priceBasket } from './lib/store-pricing.mjs';

const HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (body, status = 200) => Response.json(body, { status, headers: HEADERS });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function verifyToken(token, env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!token || !url || !key || token === key) return null;
  const { data, error } = await createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).auth.getUser(token);
  return error ? null : data.user;
}

async function saveQuote(pool, identity, quoteId, rows, details, document) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${identity ? 'authenticated' : 'anon'}`);
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({
      role: identity ? 'authenticated' : 'anon', sub: identity?.id || null,
      email: identity?.email || null, email_verified: identity?.email_verified === true,
      visitor_quote: quoteId,
    })]);
    let buyer = null;
    if (identity) {
      const staff = await client.query('SELECT id FROM users WHERE auth_subject=$1 AND deleted_at IS NULL', [identity.id]);
      if (!staff.rows.length) {
        const found = await client.query(`SELECT cu.id,cu.customer_id FROM customer_users cu
          WHERE cu.auth_subject=$1 AND cu.deleted_at IS NULL LIMIT 1`, [identity.id]);
        buyer = found.rows[0] || null;
      }
    }
    const columns = ['id', 'contact_name', 'contact_email', 'contact_company', 'contact_phone', 'message',
      'po_reference', 'source', 'currency', 'indicative_total_minor', 'po_document_path', 'po_document_name'];
    const total = rows.reduce((sum, row) => sum + (row.unit || 0) * row.qty, 0);
    if (!Number.isSafeInteger(total)) throw new Error('Invalid quote total');
    const values = [quoteId, details.name || null, details.email, details.company || null, details.phone || null,
      details.message || null, details.poReference || null, 'product_page', 'GBP', total,
      document?.path || null, document?.name || null];
    if (buyer) { columns.push('customer_id', 'customer_user_id'); values.push(buyer.customer_id, buyer.id); }
    const result = await client.query(`INSERT INTO quotes (${columns.join(',')})
      VALUES (${values.map((_, index) => '$' + (index + 1)).join(',')}) RETURNING id,reference`, values);
    for (const row of rows) await client.query(`INSERT INTO quote_items
      (quote_id,offering_id,variant_id,applied_rule_id,offering_name,variant_name,qty,list_price_minor,captured_price_minor,currency)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'GBP')`,
    [quoteId, row.offering_id, row.id, row.ruleId, row.offering_name, row.name, row.qty, row.list, row.unit]);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* disconnected */ }
    throw error;
  } finally { client.release(); }
}

export function makeRequestQuoteHandler({ env = process.env, pool = getPool, verify = verifyToken,
  store = () => getStore('po-documents'), log = console.error } = {}) {
  return async (req) => {
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    let body, basket;
    try {
      if (Number(req.headers.get('content-length')) > 14_500_000) return json({ error: 'Request too large.' }, 413);
      const raw = await req.text();
      if (raw.length > 14_500_000) return json({ error: 'Request too large.' }, 413);
      body = JSON.parse(raw);
      basket = basketItems(body?.items, 1000);
      const contact = body?.contact || {};
      if (typeof contact.email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.email.trim()) || contact.email.length > 320 ||
        [contact.name, contact.company, contact.phone, body.message, body.poReference].some((value) => value != null && (typeof value !== 'string' || value.length > 2000)))
        return json({ error: 'A valid email is required for a quote.' }, 400);
    } catch { return json({ error: 'Invalid quote request.' }, 400); }
    let blobPath;
    try {
      const db = pool();
      if (!db) return json({ error: 'Quote service unavailable. Please try again.' }, 503);
      const token = /^Bearer ([^\s]+)$/.exec(req.headers.get('authorization') || '')?.[1];
      const user = await verify(token, env).catch(() => null);
      const identity = user?.id && UUID.test(user.id)
        ? { id: user.id, email: user.email || null, email_verified: !!user.email_confirmed_at } : null;
      const quoteId = randomUUID();
      const doc = body.poDocument;
      let document = null;
      if (doc?.dataBase64) {
        const b64 = doc.dataBase64;
        if (typeof b64 !== 'string' || b64.length > 13_981_016 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64))
          return json({ error: 'PO document is too large or invalid.' }, 400);
        const bytes = Buffer.from(b64, 'base64');
        if (!bytes.length || bytes.length > 10_485_760) return json({ error: 'PO document is too large or invalid.' }, 400);
        const name = String(doc.name || 'purchase-order').slice(0, 200);
        const safe = name.replace(/[^\w.\-]+/g, '_').replace(/^\.+/, '').slice(-80) || 'purchase-order';
        blobPath = `${quoteId}/${safe}`;
        await store().set(blobPath, bytes);
        document = { path: blobPath, name };
      }
      const rows = await (async () => {
        const client = await db.connect();
        try {
          await client.query('BEGIN');
          await client.query('SET LOCAL ROLE anon');
          await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: 'anon', sub: null, email: null, email_verified: false })]);
          const priced = await priceBasket(client, basket);
          await client.query('COMMIT');
          return priced;
        } catch (error) { try { await client.query('ROLLBACK'); } catch {} throw error; }
        finally { client.release(); }
      })();
      const quotable = rows.filter((row) => !row.unavailable);
      if (!quotable.length) {
        if (blobPath) try { await store().delete(blobPath); } catch { /* best effort */ }
        return json({ error: 'No quotable items.' }, 400);
      }
      const quote = await saveQuote(db, identity, quoteId, quotable, { ...body.contact, email: body.contact.email.trim(),
        message: body.message, poReference: body.poReference }, document);
      return json({ reference: quote.reference, id: quote.id });
    } catch (error) {
      if (blobPath) try { await store().delete(blobPath); } catch { /* best effort */ }
      log('request-quote: failed (' + (error?.code || error?.name || 'error') + ')');
      return json({ error: 'Could not submit the quote request. Please try again.' }, 503);
    }
  };
}

export default makeRequestQuoteHandler();
export const config = { path: '/api/request-quote' };
