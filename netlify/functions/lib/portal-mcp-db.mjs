// Every MCP call uses its own transaction as anon without a person subject.
// The SECURITY DEFINER tools enforce token scope; callers never receive table access.
const SIGNATURES = Object.freeze({
  mcp_portal_list_clients: ['p_token_sha256:text'],
  mcp_portal_list_documents: ['p_token_sha256:text', 'p_customer_id:uuid'],
  mcp_portal_get_document: ['p_token_sha256:text', 'p_document_id:uuid'],
  mcp_portal_client_activity: ['p_token_sha256:text', 'p_customer_id:uuid'],
  mcp_portal_create_draft: ['p_token_sha256:text', 'p_run_id:uuid', 'p_agent_id:uuid', 'p_customer_id:uuid', 'p_fields:jsonb'],
  mcp_portal_update_draft: ['p_token_sha256:text', 'p_run_id:uuid', 'p_agent_id:uuid', 'p_document_id:uuid', 'p_expected_row_version:integer', 'p_fields:jsonb'],
  mcp_portal_set_file: ['p_token_sha256:text', 'p_run_id:uuid', 'p_agent_id:uuid', 'p_document_id:uuid', 'p_path:text', 'p_sha256:text'],
  mcp_portal_request_publish: ['p_token_sha256:text', 'p_run_id:uuid', 'p_agent_id:uuid', 'p_document_id:uuid', 'p_expected_row_version:integer'],
});

export async function portalMcpRpc(pool, name, params) {
  const signature = SIGNATURES[name];
  if (!signature || !params || Object.keys(params).length !== signature.length ||
      signature.some((part) => !Object.hasOwn(params, part.split(':')[0]))) {
    throw new RangeError('Invalid MCP call');
  }
  const values = signature.map((part) => {
    const [key, type] = part.split(':');
    return type === 'jsonb' ? JSON.stringify(params[key]) : params[key];
  });
  const args = signature.map((part, index) => {
    const [key, type] = part.split(':');
    return `${key} => $${index + 1}::${type}`;
  }).join(', ');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE anon');
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: 'anon' })]);
    const { rows } = await client.query(`SELECT ${name}(${args}) AS data`, values);
    await client.query('COMMIT');
    return { data: rows[0]?.data ?? null, error: null };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* disconnected */ }
    return { data: null, error: { code: error.code, message: error.message } };
  } finally {
    client.release();
  }
}
