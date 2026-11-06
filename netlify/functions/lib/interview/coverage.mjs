// Port of SOURCE src/lib/coverage.ts @505ba6a. Selected columns (the privacy contract) unchanged.
// Port: `supabaseService()` replaced by an injected `db` (interviewDb) as the FIRST parameter:
// getLeaderCoverage(db, ctx). `import 'server-only'` removed.

/**
 * Team coverage for a delegating team_leader's OWN SUB-TREE.
 *
 * HARD PRIVACY INVARIANT: this returns status + counts ONLY — never a
 * transcript, answer, insight or quote. It is a purpose-built no-text query
 * over `employee` and `org_unit`, NOT a filter over the interview data, so a
 * bug here cannot leak an individual's answers to their team lead. This upholds
 * the interviewee trust promise ("Managers see themes and quotes, not
 * transcripts"). The columns selected below are the whole contract — if you add
 * a field, it must never be answer/turn/insight content.
 */

/** @typedef {'invited' | 'started' | 'completed' | 'declined'} CoverageStatus */
/** @typedef {{ id: string, name: string, roleTitle: string | null, unitName: string, status: CoverageStatus, isLead: boolean }} CoveragePerson */
/** @typedef {{ id: string, name: string }} CoverageUnit */
/**
 * @typedef {{ people: CoveragePerson[], counts: { invited: number, started: number, completed: number,
 *   declined: number, total: number }, units: CoverageUnit[] }} LeaderCoverage
 * units: the leader's own sub-tree units — for a scoped invite picker.
 */

/**
 * @param {any} db interviewDb client
 * @param {import('./employee.mjs').EmployeeContext} ctx
 * @returns {Promise<LeaderCoverage>}
 */
export async function getLeaderCoverage(db, ctx) {
  const rootPath = ctx.orgUnit?.path ?? null;

  const { data: unitRows, error: unitErr } = await db
    .from('org_unit')
    .select('id, name, path')
    .eq('engagement_id', ctx.engagement.id);
  if (unitErr) throw new Error(`coverage unit lookup failed: ${unitErr.message}`);

  const units = unitRows ?? [];
  const inSubtree = (p) =>
    rootPath !== null && (p === rootPath || p.startsWith(`${rootPath}.`));
  const subtreeUnits = units.filter((u) => inSubtree(u.path));
  const subtreeUnitIds = new Set(subtreeUnits.map((u) => u.id));
  const unitName = new Map(units.map((u) => [u.id, u.name]));

  // Interviewees only (never admin rows). NOTE the select list — status/name/
  // unit/role only, NO answer/turn/insight content, ever.
  const { data: empRows, error: empErr } = await db
    .from('employee')
    .select('id, name, role_title, unit_id, status, portal_role')
    .eq('engagement_id', ctx.engagement.id);
  if (empErr) throw new Error(`coverage people lookup failed: ${empErr.message}`);

  const people = (empRows ?? [])
    .filter((e) => e.unit_id !== null && subtreeUnitIds.has(e.unit_id))
    .filter((e) => e.portal_role === 'employee' || e.portal_role === 'team_leader')
    .map((e) => ({
      id: e.id,
      name: e.name,
      roleTitle: e.role_title,
      unitName: (e.unit_id && unitName.get(e.unit_id)) || '',
      status: e.status,
      isLead: e.portal_role === 'team_leader',
    }));

  const counts = { invited: 0, started: 0, completed: 0, declined: 0, total: people.length };
  for (const p of people) counts[p.status] += 1;

  return { people, counts, units: subtreeUnits.map((u) => ({ id: u.id, name: u.name })) };
}
