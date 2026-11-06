// Port of src/lib/synthesis/hotspots.ts @505ba6a.
// Changed: types stripped. Arithmetic and ranking unchanged.
//
// Hot spots: computed entirely in code, never by the model, because the arithmetic is mechanical and
// the no-blending rule (contract 7.2.3, renderer invariant 7) must hold structurally:
//
//   - first_hand_hours_per_week sums time_per_week_hours over first-hand task and pain insights only
//     (the DB enum has no dependency type yet; automation_candidate hours are excluded to avoid double
//     counting the task they would automate).
//   - on_behalf_hours_per_week is the team-leader estimate, summed separately and shown as a
//     comparison line; null when none exists.
//   - The two are NEVER added together, anywhere.
//
// One row per unit with eligible sessions attached directly to it, ranked by first-hand hours lost.
// Same-team (team_local) themes are attached to their unit's row by the pipeline, per contract open
// choice 8.

const HOURS_TYPES = new Set(['task', 'pain', 'tooling_gap', 'dependency']);

export function computeHotSpots(params) {
  const { units, employees, eligible, insights } = params;

  const unitIdsWithSessions = new Set(
    eligible.map((e) => e.employee.unit_id).filter((u) => u !== null)
  );

  const hotSpots = [];
  for (const unit of units) {
    if (!unitIdsWithSessions.has(unit.id)) continue;

    const unitInsights = insights.filter((i) => i.unitId === unit.id);
    const quantified = unitInsights.filter(
      (i) => i.row.time_per_week_hours !== null && HOURS_TYPES.has(i.row.type)
    );

    const firstHand = quantified.filter((i) => !i.secondHand);
    const onBehalf = quantified.filter((i) => i.secondHand);

    const firstHandHours =
      Math.round(firstHand.reduce((s, i) => s + Number(i.row.time_per_week_hours), 0) * 10) / 10;
    const onBehalfHours = onBehalf.length
      ? Math.round(onBehalf.reduce((s, i) => s + Number(i.row.time_per_week_hours), 0) * 10) / 10
      : null;

    const respondents = new Set(
      eligible
        .filter((e) => e.employee.unit_id === unit.id && e.employee.leader_track !== 'on_behalf')
        .map((e) => e.employee.person_id ?? e.employee.id)
    ).size;
    const invited = employees.filter(
      (e) => e.unit_id === unit.id && e.status !== 'declined'
    ).length;

    const topDrivers = [...firstHand]
      .sort((a, b) => Number(b.row.time_per_week_hours) - Number(a.row.time_per_week_hours))
      .slice(0, 3)
      .map((i) => ({
        insight_id: i.row.id,
        label: i.row.label,
        hours_per_week: Number(i.row.time_per_week_hours),
      }));

    hotSpots.push({
      team: unit.name,
      unit_id: unit.id,
      first_hand_hours_per_week: firstHandHours,
      on_behalf_hours_per_week: onBehalfHours,
      respondents,
      team_size_interviewed: `${respondents} of ${invited} invited`,
      top_drivers: topDrivers,
      local_themes: [],
    });
  }

  return hotSpots.sort(
    (a, b) => b.first_hand_hours_per_week - a.first_hand_hours_per_week
  );
}
