// GRE-1986: one sample portal document for the dedicated Netlify staging site.
// This privileged setup runs once outside visitor requests; the application always uses RLS roles.
import { getDatabase } from '@netlify/database';

const STAGING_SITE_ID = '8c1135a6-6f8e-43f4-b9b2-3c4d5b6a36cb';
export const SAMPLE_DOCUMENT_ID = '20010000-0000-4000-8000-000000000001';

export async function seedStagingPortal({ siteId = process.env.SITE_ID, pool } = {}) {
  if (siteId !== STAGING_SITE_ID) throw new Error('Portal fixture is restricted to the dedicated staging site');
  pool ||= getDatabase().pool;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO auth.users (id, email, email_confirmed_at)
      VALUES ('d814b01d-8064-4588-aa94-fb369918817e', 'admin@greatstone.dev', now())
      ON CONFLICT (id) DO NOTHING`);
    await client.query(`
      INSERT INTO public.users (org_id, email, full_name, role, auth_subject, is_active)
      VALUES ('11111111-1111-4111-8111-111111111111', 'admin@greatstone.dev',
        'Studio Admin (staging fixture)', 'admin', 'd814b01d-8064-4588-aa94-fb369918817e', true)
      ON CONFLICT (org_id, email) DO UPDATE
      SET role = 'admin', auth_subject = EXCLUDED.auth_subject, is_active = true, deleted_at = NULL`);
    await client.query(`
      INSERT INTO public.portal_approvers (auth_user_id, label)
      VALUES ('d814b01d-8064-4588-aa94-fb369918817e', 'Staging fixture approver')
      ON CONFLICT (auth_user_id) DO NOTHING`);
    const { rows } = await client.query(`
      SELECT customer_id FROM public.customer_users
      WHERE auth_subject = '7a0c5d8e-f835-494a-8e85-7044b8f6bc72' LIMIT 1`);
    if (!rows[0]) throw new Error('Staging demo membership is missing');
    const customerId = rows[0].customer_id;
    await client.query(`
      INSERT INTO public.portal_documents
        (id, org_id, customer_id, kind, title, summary, body, action, confirmation_text, created_by)
      VALUES ($1, '11111111-1111-4111-8111-111111111111', $2, 'pre_read',
        'Staging sample pre-read', 'Sample document for staging checks only.',
        '{"sections":[{"id":"s1","title":"Sample","html":"<p>Sample text for staging checks only.</p>"}]}',
        'accept', 'I confirm I have read this sample document.',
        'd814b01d-8064-4588-aa94-fb369918817e')
      ON CONFLICT (id) DO NOTHING`, [SAMPLE_DOCUMENT_ID, customerId]);
    const { rows: current } = await client.query('SELECT status FROM public.portal_documents WHERE id = $1', [SAMPLE_DOCUMENT_ID]);
    if (current[0]?.status === 'draft') {
      await client.query("UPDATE public.portal_documents SET status = 'pending_approval' WHERE id = $1", [SAMPLE_DOCUMENT_ID]);
    }
    if (['draft', 'pending_approval'].includes(current[0]?.status)) {
      const { rows: pending } = await client.query('SELECT content_sha256 FROM public.portal_documents WHERE id = $1', [SAMPLE_DOCUMENT_ID]);
      await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({
        sub: 'd814b01d-8064-4588-aa94-fb369918817e', email: 'admin@greatstone.dev', email_verified: true,
      })]);
      await client.query('SELECT portal_approve_and_publish($1::uuid, $2::text, $3::text)',
        [SAMPLE_DOCUMENT_ID, pending[0].content_sha256, 'GRE-1986 staging fixture']);
    }
    const { rows: result } = await client.query('SELECT id, status FROM public.portal_documents WHERE id = $1', [SAMPLE_DOCUMENT_ID]);
    if (result[0]?.status !== 'published') throw new Error('Staging sample document did not publish');
    await client.query('COMMIT');
    return result[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  seedStagingPortal().then((document) => {
    process.stdout.write(`Published staging document ${document.id}\n`);
  }).catch((error) => {
    process.stderr.write(`Staging fixture failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
