import { applyOp, normalisePlan } from '../../../src/data/deepdive-schema.mjs';

export async function deepdivePlan(client, op, args) {
  if (op === 'capability') {
    const { rows } = await client.query('SELECT app_staff_org() AS org_id');
    return { can: !!rows[0]?.org_id, via: rows[0]?.org_id ? 'netlify' : null };
  }
  if (op === 'client-name') {
    const { rows } = await client.query('SELECT name FROM customers WHERE slug=$1 AND deleted_at IS NULL LIMIT 1', [args.slug]);
    return rows[0]?.name || null;
  }
  if (op === 'plan') {
    const { rows } = await client.query('SELECT plan,row_version FROM deepdive_plans WHERE slug=$1', [args.slug]);
    return rows[0] ? { plan: rows[0].plan, version: rows[0].row_version } : null;
  }
  if (op === 'engagements') {
    const { rows } = await client.query('SELECT slug,client,title,stage FROM deepdive_plans ORDER BY client,slug');
    return rows;
  }
  if (op === 'summaries') {
    const { rows } = await client.query('SELECT slug,summary FROM deepdive_plans');
    return Object.fromEntries(rows.map((row) => [row.slug, row.summary || {}]));
  }
  if (op === 'create' || op === 'edit') {
    const { rows } = await client.query('SELECT app_staff_org() AS org_id');
    if (!rows[0]?.org_id) return { forbidden: true };
  }
  if (op === 'create') {
    const plan = normalisePlan(args.plan);
    if (plan.engagement.slug !== args.slug || !plan.engagement.client || !plan.engagement.title ||
        !plan.engagement.stage || !plan.engagement.access) throw new RangeError('Invalid record');
    const { rows } = await client.query(
      'INSERT INTO deepdive_plans (slug,plan,row_version) VALUES ($1,$2::jsonb,1) RETURNING plan,row_version',
      [args.slug, JSON.stringify(plan)],
    );
    return { plan: rows[0].plan, version: rows[0].row_version };
  }
  if (op === 'edit') {
    const { rows } = await client.query('SELECT plan,row_version FROM deepdive_plans WHERE slug=$1 FOR UPDATE', [args.slug]);
    if (!rows.length) return null;
    if (rows[0].row_version !== args.version) return { conflict: true };
    let plan;
    try { plan = applyOp(rows[0].plan, args.operation, args.id || args.operation.id); }
    catch (error) { throw new RangeError(error.message); }
    plan._provenance = { lastEditedBy: 'portal', at: new Date().toISOString() };
    const updated = await client.query(
      'UPDATE deepdive_plans SET plan=$2::jsonb,row_version=row_version+1 WHERE slug=$1 RETURNING plan,row_version',
      [args.slug, JSON.stringify(plan)],
    );
    return { plan: updated.rows[0].plan, version: updated.rows[0].row_version };
  }
  throw new RangeError('Unknown operation');
}
