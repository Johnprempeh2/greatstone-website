import { asPublicAnon } from './public-actions.mjs';

// The signed session names the only lead this transaction may see. Keep the claim local to the transaction.
const claims = (id) => JSON.stringify({ role: 'anon', sub: null, email: null, email_verified: false, front_door_lead: id });

export async function asLead(pool, id, work) {
  return asPublicAnon(pool, '', async (client) => {
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [claims(id)]);
    return work(client);
  });
}

export async function takeSlot(pool, hash) {
  return asPublicAnon(pool, '', async (client) =>
    (await client.query('SELECT front_door_take_slot($1, 3) AS id', [hash])).rows[0]?.id);
}

export async function releaseSlot(pool, id) {
  return asPublicAnon(pool, '', (client) => client.query('SELECT front_door_release_slot($1)', [id]));
}

export async function saveLead(pool, id, row) {
  return asLead(pool, id, async (client) => {
    await client.query('SELECT front_door_purge()');
    const fields = ['id', 'industry', 'industry_other', 'team_size', 'brand_words', 'company_name', 'agents',
      'chat_summary', 'chat_turns', 'source', 'agent_package'];
    const values = [id, row.industry, row.industry_other, row.team_size, row.brand_words, row.company_name,
      row.agents, row.chat_summary, row.chat_turns, row.source, row.agent_package];
    const encoded = values.map((value) => typeof value === 'object' && value !== null ? JSON.stringify(value) : value);
    const params = fields.map((_, i) => '$' + (i + 1));
    const result = await client.query(`INSERT INTO front_door_leads (${fields.join(', ')}) VALUES (${params.join(', ')}) RETURNING id`, encoded);
    return result.rows[0]?.id || null;
  });
}

export async function updateContact(pool, id, update) {
  return asLead(pool, id, async (client) => {
    const fields = ['contact_name', 'contact_email', 'contact_role', 'contact_at', 'consent_given', 'consent_at', 'consent_version'];
    const sets = fields.map((key, i) => `${key} = $${i + 2}`);
    const result = await client.query(`UPDATE front_door_leads SET ${sets.join(', ')} WHERE id = $1
      RETURNING id, industry, industry_other, team_size, company_name, agents, source, consent_given, alert_sent_at`,
    [id, ...fields.map((key) => update[key])]);
    return result.rows[0] || null;
  });
}

const STAMPS = new Set(['alert_sent_at', 'pack_sent_at', 'pipedrive_synced_at']);
export async function stamp(pool, id, column, value, onlyIfNull = false) {
  if (!STAMPS.has(column)) throw new RangeError('Invalid stamp');
  return asLead(pool, id, async (client) => {
    const result = await client.query(`UPDATE front_door_leads SET ${column} = $2 WHERE id = $1
      ${onlyIfNull ? `AND ${column} IS NULL` : ''} RETURNING id`, [id, value]);
    return !!result.rows[0];
  });
}

export async function saveCrmIds(pool, id, personId, dealId) {
  return asLead(pool, id, (client) => client.query(
    'UPDATE front_door_leads SET pipedrive_person_id = $2, pipedrive_deal_id = $3 WHERE id = $1',
    [id, personId, dealId]));
}
