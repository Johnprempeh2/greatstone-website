// Client portal queries run under the verified customer identity. RLS limits every row.
export async function portalStore(client, op, args = {}) {
  if (op === 'overview') {
    const [documents, acceptances, jobs, members] = await Promise.all([
      client.query(`SELECT id,customer_id,kind,series,version,title,summary,body,demos,action,
        confirmation_text,signatory_email,status,content_sha256,published_at,pdf_path
        FROM portal_documents WHERE status='published' ORDER BY published_at DESC`),
      client.query('SELECT * FROM portal_acceptances ORDER BY accepted_at DESC'),
      client.query(`SELECT id,acceptance_id,status,attempts,next_attempt_at,sent_at
        FROM portal_receipt_jobs`),
      client.query(`SELECT id,email,full_name FROM customer_users
        WHERE deleted_at IS NULL AND customer_id=app_customer_id()`),
    ]);
    return { documents: documents.rows, acceptances: acceptances.rows, jobs: jobs.rows, members: members.rows };
  }
  if (op === 'accept') {
    const { rows } = await client.query('SELECT portal_accept($1::uuid,$2::text,$3::text,$4::boolean) AS id',
      [args.documentId, args.name, args.title, args.confirmed]);
    const id = rows[0].id;
    const acceptance = await client.query('SELECT * FROM portal_acceptances WHERE id=$1', [id]);
    return acceptance.rows[0] || { id };
  }
  if (op === 'job') {
    const { rows } = await client.query(`SELECT id,acceptance_id,status,attempts,next_attempt_at,sent_at
      FROM portal_receipt_jobs WHERE acceptance_id=$1`, [args.acceptanceId]);
    return rows[0] || null;
  }
  if (op === 'receipt-document') {
    const { rows } = await client.query('SELECT * FROM portal_receipt_document($1::uuid)', [args.acceptanceId]);
    return rows[0] || null;
  }
  throw new RangeError('Unknown portal operation');
}
