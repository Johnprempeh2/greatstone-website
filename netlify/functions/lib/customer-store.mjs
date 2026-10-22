// Buyer store queries. The verified Supabase identity is applied only inside this transaction;
// every table read and write still passes through the migrated Postgres RLS policies.
export async function asCustomer(pool, identity, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE authenticated');
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({
      role: 'authenticated', sub: identity.id, email: identity.email,
      email_verified: identity.email_verified === true,
    })]);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* disconnected */ }
    throw error;
  } finally {
    client.release();
  }
}

const orderItems = `(SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'id',i.id,'offering_name',i.offering_name,'variant_name',i.variant_name,'qty',i.qty,
  'unit_price_minor',i.unit_price_minor,'line_total_minor',i.line_total_minor,'variant_id',i.variant_id)
  ORDER BY i.created_at), '[]'::jsonb) FROM order_items i WHERE i.order_id = x.id)`;

export async function customerStore(client, op, args = {}) {
  if (op === 'ensure') {
    const { rows } = await client.query('SELECT * FROM ensure_customer_account($1, $2)', [args.companyName || null, args.fullName || null]);
    return rows[0] || null;
  }
  if (op === 'profile') {
    const { rows } = await client.query(`SELECT cu.id, cu.email, cu.full_name, cu.phone, cu.is_primary, cu.role,
      CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug,
        'domain', c.domain, 'notes', c.notes, 'created_at', c.created_at,
        'tier', CASE WHEN t.id IS NULL THEN NULL ELSE jsonb_build_object('name', t.name, 'rank', t.rank) END) END AS customer
      FROM customer_users cu JOIN customers c ON c.id = cu.customer_id
      LEFT JOIN customer_tiers t ON t.id = c.tier_id
      WHERE cu.auth_subject = $1 AND cu.deleted_at IS NULL AND c.deleted_at IS NULL LIMIT 1`, [args.subject]);
    return rows[0] || null;
  }
  if (op === 'members') {
    const { rows } = await client.query(`SELECT id,email,full_name,is_primary,role,created_at FROM customer_users
      WHERE customer_id = app_customer_id() AND deleted_at IS NULL ORDER BY is_primary DESC, created_at`, []);
    return rows;
  }
  if (op === 'invite-requests') {
    const { rows } = await client.query(`SELECT id,full_name,email,role,status,created_at FROM member_invite_requests
      WHERE customer_id = app_customer_id() ORDER BY created_at DESC`);
    return rows;
  }
  if (op === 'request-invite') {
    const { rows } = await client.query(`INSERT INTO member_invite_requests
      (org_id,customer_id,requested_by,full_name,email,role,note)
      SELECT c.org_id,c.id,cu.id,$1,$2,$3,$4 FROM customers c
      JOIN customer_users cu ON cu.customer_id=c.id AND cu.auth_subject=$5 AND cu.deleted_at IS NULL
      WHERE c.id=app_customer_id() AND c.deleted_at IS NULL RETURNING id`,
      [args.fullName || null, args.email, args.role, args.note || null, args.subject]);
    if (!rows.length) throw new Error('Company not found');
    return rows[0];
  }
  if (op === 'order-keys') {
    const { rows } = await client.query(`SELECT id,offering_name,variant_name,status,order_id,licence_key,expires_at
      FROM licence_keys WHERE customer_id=app_customer_id() AND deleted_at IS NULL AND order_id IS NOT NULL`);
    return rows;
  }
  if (op === 'orders' || op === 'org-orders') {
    const columns = op === 'orders'
      ? `id,reference,status,currency,subtotal_minor,total_minor,refunded_minor,invoice_number,placed_at,created_at,
         ${orderItems} AS order_items`
      : 'id,reference,status,currency,total_minor,placed_at,created_at,customer_user_id,invoice_number';
    const { rows } = await client.query(`SELECT ${columns} FROM orders x
      WHERE customer_id = app_customer_id() AND deleted_at IS NULL ORDER BY created_at DESC LIMIT $1`, [op === 'orders' ? 100 : 50]);
    return rows;
  }
  if (op === 'quotes' || op === 'org-quotes') {
    const columns = op === 'quotes'
      ? `id,reference,status,currency,indicative_total_minor,quoted_total_minor,valid_until,created_at,
         (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',o.id,'invoice_number',o.invoice_number)), '[]'::jsonb)
            FROM orders o WHERE o.quote_id = x.id AND o.deleted_at IS NULL) AS orders`
      : 'id,status';
    const { rows } = await client.query(`SELECT ${columns} FROM quotes x
      WHERE customer_id = app_customer_id() AND deleted_at IS NULL ORDER BY created_at DESC LIMIT $1`, [op === 'quotes' ? 50 : 200]);
    return rows;
  }
  if (op === 'invoice') {
    const { rows } = await client.query(`SELECT x.id,x.reference,x.invoice_number,x.po_reference,x.status,x.currency,
      x.subtotal_minor,x.total_minor,x.refunded_minor,x.placed_at,x.created_at,
      CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('name',c.name,'domain',c.domain) END AS customer,
      ${orderItems} AS order_items
      FROM orders x LEFT JOIN customers c ON c.id = x.customer_id
      WHERE x.id = $1 AND x.deleted_at IS NULL LIMIT 1`, [args.orderId]);
    return rows[0] || null;
  }
  if (op === 'update-profile') {
    const { rows } = await client.query(`UPDATE customer_users SET full_name=$1,phone=$2,updated_at=now()
      WHERE auth_subject=$3 AND deleted_at IS NULL RETURNING id`, [args.fullName, args.phone, args.subject]);
    if (!rows.length) throw new Error('Profile not found');
    return rows[0];
  }
  if (op === 'update-company') {
    const { rows } = await client.query(`UPDATE customers SET name=$1,domain=$2,notes=$3,updated_at=now()
      WHERE id=app_customer_id() AND deleted_at IS NULL RETURNING id`, [args.name, args.domain, args.notes]);
    if (!rows.length) throw new Error('Company not found or update not permitted');
    return rows[0];
  }
  throw new RangeError('Unknown customer operation');
}
