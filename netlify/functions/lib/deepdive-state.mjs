const json = (value) => JSON.stringify(value ?? null);
const rows = async (client, sql, values) => (await client.query(sql, values)).rows;

async function append(client, slug, entries) {
  for (const entry of entries || []) {
    await client.query(`INSERT INTO deepdive_log
      (slug,item_id,at,label,by,actor,by_user_id,finding_id,changed)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9::jsonb)`,
    [slug, entry.id || null, entry.at || new Date().toISOString(), entry.label || null,
      entry.by || 'portal', json(entry.actor), entry.actor?.id || null, entry.findingId || null,
      json(entry.changed || {})]);
  }
}

export async function deepdiveState(client, op, args) {
  const { slug } = args;
  // The row policy checks org_id, while slug references a plan in another table. Require the
  // caller to see that plan before inserting a row, so a foreign slug cannot acquire a shadow row.
  const plan = await rows(client, 'SELECT slug FROM deepdive_plans WHERE slug=$1', [slug]);
  if (!plan.length) return { forbidden: true };
  if (op === 'load') {
    const items = await rows(client, 'SELECT item_id,status,visibility,note,agreement,updated_at FROM deepdive_item_state WHERE slug=$1', [slug]);
    const log = await rows(client, 'SELECT at,item_id,label,by,actor,finding_id,changed FROM deepdive_log WHERE slug=$1 ORDER BY at DESC LIMIT 500', [slug]);
    const files = await rows(client, 'SELECT id,label,mime,ext,bytes,attached_to,visibility,note,by,actor,at FROM deepdive_files WHERE slug=$1', [slug]);
    const findings = await rows(client, 'SELECT id,question_id,session_id,text,source,source_id,confidence,state,supersedes,by,at,validated_at,note FROM deepdive_findings WHERE slug=$1', [slug]);
    return { items, log: log.reverse(), files, findings };
  }
  if (op === 'items') {
    for (const item of args.items || []) {
      await client.query(`INSERT INTO deepdive_item_state (slug,item_id,status,visibility,note,agreement)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT (slug,item_id) DO UPDATE
        SET status=excluded.status,visibility=excluded.visibility,note=excluded.note,agreement=excluded.agreement`,
      [slug, item.item_id, item.status, item.visibility, item.note, json(item.agreement)]);
    }
    await append(client, slug, args.entries);
    return true;
  }
  if (op === 'release') {
    await client.query('DELETE FROM deepdive_item_state WHERE slug=$1 AND item_id=$2', [slug, args.id]);
    await append(client, slug, args.entries);
    return true;
  }
  if (op === 'replace') {
    if (args.release) await client.query('DELETE FROM deepdive_item_state WHERE slug=$1 AND NOT (item_id = ANY($2::text[]))', [slug, args.keepIds || []]);
    await append(client, slug, args.entries);
    return true;
  }
  if (op === 'findings') {
    for (const f of args.findings || []) {
      await client.query(`INSERT INTO deepdive_findings
        (slug,id,question_id,session_id,text,source,source_id,confidence,state,supersedes,by,at,validated_at,note)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (slug,id) DO UPDATE SET question_id=excluded.question_id,session_id=excluded.session_id,
        text=excluded.text,source=excluded.source,source_id=excluded.source_id,confidence=excluded.confidence,
        state=excluded.state,supersedes=excluded.supersedes,by=excluded.by,at=excluded.at,
        validated_at=excluded.validated_at,note=excluded.note`,
      [slug, f.id, f.questionId || null, f.sessionId || null, f.text || '', f.source || '',
        f.sourceId || null, f.confidence || null, f.state || null, f.supersedes || null,
        f.by === 'mcp' ? 'mcp' : 'portal', f.at || null, f.validatedAt || null, f.note || '']);
    }
    if (args.removedIds?.length) await client.query('DELETE FROM deepdive_findings WHERE slug=$1 AND id=ANY($2::text[])', [slug, args.removedIds]);
    await append(client, slug, args.entries);
    return true;
  }
  if (op === 'attach') {
    const f = args.file;
    await client.query(`INSERT INTO deepdive_files
      (slug,id,label,original_name,mime,ext,bytes,attached_to,visibility,note,by,actor,at,storage_path)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14)
      ON CONFLICT (slug,id) DO UPDATE SET attached_to=excluded.attached_to`,
    [slug, f.id, f.label, f.originalName || null, f.mime || null, f.ext || null,
      f.bytes ?? null, f.attachedTo, f.visibility || 'internal', f.note || '', f.by || 'portal',
      json(f.actor), f.at, `${slug}/${f.id.slice(2)}`]);
    await append(client, slug, args.entries);
    return rows(client, 'SELECT id,label,mime,ext,bytes,attached_to,visibility,note,by,actor,at FROM deepdive_files WHERE slug=$1', [slug]);
  }
  if (op === 'detach') {
    if (args.last) await client.query('DELETE FROM deepdive_files WHERE slug=$1 AND id=$2', [slug, args.id]);
    else await client.query('UPDATE deepdive_files SET attached_to=$3 WHERE slug=$1 AND id=$2', [slug, args.id, args.ties]);
    await append(client, slug, args.entries);
    return true;
  }
  throw new RangeError('Unknown operation');
}
