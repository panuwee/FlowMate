async function loadFlowMateWorkloadRows() {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }

  const [workloadResult, membersResult, activeItems] = await Promise.all([
    window.flowmateSupabase
      .from("member_workload_v")
      .select("team_member_id,member_code,display_name,discipline_short,skills,backup_skills,availability,effective_capacity_per_day,assigned_effort,current_wip,overdue_count,due_soon_count,blocked_count,review_count,quick_task_count")
      .order("member_code", { ascending: true }),
    window.flowmateSupabase
      .from("team_members")
      .select("id,display_name,initials,color,discipline,skills,backup_skills,capacity_per_day,capacity_override_per_day,wip_limit,availability"),
    window.loadFlowMateListRows ? window.loadFlowMateListRows() : Promise.resolve([]),
  ]);

  const firstError = workloadResult.error || membersResult.error;
  if (firstError) throw firstError;

  const membersById = Object.fromEntries((membersResult.data || []).map((member) => [member.id, member]));

  const queuedEffort = (activeItems || [])
    .filter((item) => item.status === "queued")
    .reduce((sum, item) => sum + (item.effort || 0), 0);

  const rows = (workloadResult.data || []).map((row) => {
    const member = membersById[row.team_member_id] || {};
    const memberItems = (activeItems || []).filter((item) => item.assignee === row.team_member_id);
    const statusCounts = window.getFlowMateWorkloadStatusCounts
      ? window.getFlowMateWorkloadStatusCounts(memberItems)
      : { assigned: 0, in_progress: 0, review: 0, blocked: 0, delivered: 0 };
    const openCreativeItems = memberItems.filter(
      (item) =>
        item.type === "creative" &&
        ["assigned", "in_progress", "review", "blocked"].includes(item.status),
    );
    const effectiveCap = Number(row.effective_capacity_per_day || 0);
    const assignedEffort = Number(row.assigned_effort || 0);
    const windowCapacity = effectiveCap * 5;

    return {
      m: {
        id: row.team_member_id,
        name: row.display_name,
        initials: member.initials || row.member_code,
        color: member.color || "#2E546D",
        discipline: member.discipline || row.discipline_short,
        skills: [
          ...((row.skills || []).map(flowmateToKebab)),
          ...((row.backup_skills || []).map((skill) => `${flowmateToKebab(skill)}-backup`)),
        ],
        capacityPerDay: Number(member.capacity_per_day || effectiveCap),
        capacityOverride: member.capacity_override_per_day,
        wipLimit: Number(member.wip_limit || 0),
        availability: row.availability,
      },
      statusCounts,
      assignedEffort,
      effectiveCap,
      window: windowCapacity,
      available: Math.max(0, windowCapacity - assignedEffort),
      wip: Number(row.current_wip || 0),
      due_soon: Number(row.due_soon_count || 0),
      overdue: Number(row.overdue_count || 0),
      blocked: Number(row.blocked_count || 0),
      review: Number(row.review_count || 0),
      quick: Number(row.quick_task_count || 0),
      items: openCreativeItems,
      isSupabaseRow: true,
    };
  });

  rows.queuedEffort = queuedEffort;
  return rows;
}

window.loadFlowMateWorkloadRows = loadFlowMateWorkloadRows;
