const isVisibleMemberCode = (memberCode) => String(memberCode || "").toLowerCase() !== "gear";
const FLOWMATE_ACTIVE_WORK_STATUS_KEYS = ["assigned", "in_progress", "review", "blocked"];

function flowmateWorkloadBangkokDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function flowmateWorkloadTodayKey(value = new Date()) {
  return flowmateWorkloadBangkokDateKey(value);
}

async function loadFlowMateWorkloadRows() {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }

  const todayKey = flowmateWorkloadTodayKey();
  const [workloadResult, membersResult, leaveResult, activeItems] = await Promise.all([
    window.flowmateSupabase
      .from("member_workload_v")
      .select("team_member_id,member_code,display_name,discipline_short,skills,backup_skills,availability,assigned_count,in_progress_count,review_count,blocked_count,current_wip,overdue_count,due_soon_count,quick_task_count")
      .order("member_code", { ascending: true }),
    window.flowmateSupabase
      .from("team_members")
      .select("id,user_id,member_code,display_name,initials,color,discipline,skills,backup_skills,capacity_per_day,capacity_override_per_day,wip_limit,availability"),
    window.flowmateSupabase
      .from("leave_requests")
      .select("team_member_id,start_date,end_date,start_half,end_half,cancelled_at")
      .is("cancelled_at", null)
      .lte("start_date", todayKey)
      .gte("end_date", todayKey),
    window.loadFlowMateListRows ? window.loadFlowMateListRows() : Promise.resolve([]),
  ]);

  const firstError = workloadResult.error || membersResult.error || leaveResult.error;
  if (firstError) throw firstError;

  const membersById = Object.fromEntries(
    (membersResult.data || [])
      .filter((member) => isVisibleMemberCode(member.member_code))
      .map((member) => [member.id, member]),
  );

  const leaveCapacityByMemberId = new Map();
  (leaveResult.data || []).forEach((leave) => {
    const isStartToday = leave.start_date === todayKey;
    const isEndToday = leave.end_date === todayKey;
    const dayStartHalf = isStartToday ? (leave.start_half || "am") : "am";
    const dayEndHalf = isEndToday ? (leave.end_half || "pm") : "pm";
    const leaveFraction = dayStartHalf === dayEndHalf ? 0.5 : 1;
    leaveCapacityByMemberId.set(
      leave.team_member_id,
      Math.min(1, (leaveCapacityByMemberId.get(leave.team_member_id) || 0) + leaveFraction),
    );
  });

  const rows = (workloadResult.data || []).filter((row) => isVisibleMemberCode(row.member_code)).map((row) => {
    const member = membersById[row.team_member_id] || {};
    const memberItems = (activeItems || []).filter((item) => item.assignee === row.team_member_id);
    const requestedItems = (activeItems || []).filter((item) => item.requesterUserId && item.requesterUserId === member.user_id);
    const statusCounts = window.getFlowMateWorkloadStatusCounts
      ? window.getFlowMateWorkloadStatusCounts(memberItems)
      : { assigned: 0, in_progress: 0, review: 0, blocked: 0, delivered: 0 };
    const openCreativeItems = memberItems.filter(
      (item) =>
        item.type === "creative" &&
        FLOWMATE_ACTIVE_WORK_STATUS_KEYS.includes(item.status),
    );
    const leaveFractionToday = leaveCapacityByMemberId.get(row.team_member_id) || 0;
    return {
      m: {
        id: row.team_member_id,
        name: row.display_name,
        initials: member.initials || row.member_code,
        color: member.color || "#2E546D",
        discipline: member.discipline || row.discipline_short,
        userId: member.user_id || null,
        skills: [
          ...((row.skills || []).map(flowmateToKebab)),
          ...((row.backup_skills || []).map((skill) => `${flowmateToKebab(skill)}-backup`)),
        ],
        capacityPerDay: Number(member.capacity_per_day || 0),
        capacityOverride: member.capacity_override_per_day,
        wipLimit: Number(member.wip_limit || 0),
        availability: leaveFractionToday >= 1 ? "leave" : (leaveFractionToday > 0 ? "partial" : row.availability),
        leaveFractionToday,
      },
      statusCounts,
      assignedCount: Number(row.assigned_count || statusCounts.assigned || 0),
      inProgressCount: Number(row.in_progress_count || statusCounts.in_progress || 0),
      reviewCount: Number(row.review_count || statusCounts.review || 0),
      blockedCount: Number(row.blocked_count || statusCounts.blocked || 0),
      wip: Number(row.current_wip || 0),
      due_soon: Number(row.due_soon_count || 0),
      overdue: Number(row.overdue_count || 0),
      blocked: Number(row.blocked_count || 0),
      review: Number(row.review_count || 0),
      quick: Number(row.quick_task_count || 0),
      items: openCreativeItems,
      allItems: memberItems,
      requestedItems,
      isSupabaseRow: true,
    };
  });

  return rows;
}

window.loadFlowMateWorkloadRows = loadFlowMateWorkloadRows;
