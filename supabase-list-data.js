function flowmateToKebab(value) {
  return value ? value.replaceAll("_", "-") : value;
}

function flowmateDateLabel(dateValue) {
  if (!dateValue) return "";
  const dueDate = new Date(`${dateValue}T00:00:00`);
  return dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function flowmateDueDelta(dateValue) {
  if (!dateValue) return null;
  // Compare in UTC to keep behaviour identical to the database's `current_date`
  // (which is in the server's timezone) — both treat the date as a calendar day.
  const [y, m, d] = dateValue.split("-").map(Number);
  const dueUtc = Date.UTC(y, (m || 1) - 1, d || 1);
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((dueUtc - todayUtc) / 86400000);
}

async function loadFlowMateListRows() {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }

  const [workItemsResult, flagsResult, usersResult, membersResult, detailsResult, checklistResult, commentsResult] = await Promise.all([
    window.flowmateSupabase
      .from("work_items")
      .select("id,display_id,title,work_type,status,priority,due_date,effort_point,requester_user_id,requester_team,assignee_user_id,assignee_other_name,final_owner_member_id,needs_split,assignment_reason,review_round,blocked_reason")
      .order("due_date", { ascending: true }),
    window.flowmateSupabase
      .from("work_item_flags_v")
      .select("work_item_id,is_overdue,is_due_soon,is_queued,is_blocked"),
    window.flowmateSupabase
      .from("users")
      .select("id,display_name,requester_team"),
    window.flowmateSupabase
      .from("team_members")
      .select("id,user_id,display_name,initials,color,discipline_short,active"),
    window.flowmateSupabase
      .from("creative_request_details")
      .select("work_item_id,asset_type,platforms,size_format"),
    window.flowmateSupabase
      .from("checklist_items")
      .select("id,work_item_id,title,is_done,sort_order")
      .order("sort_order", { ascending: true }),
    window.flowmateSupabase
      .from("comments")
      .select("id,work_item_id,author_user_id,body,created_at,updated_at,deleted_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
  ]);

  const firstError =
    workItemsResult.error ||
    flagsResult.error ||
    usersResult.error ||
    membersResult.error ||
    detailsResult.error ||
    checklistResult.error ||
    commentsResult.error;

  if (firstError) throw firstError;

  const flagsByWorkItemId = Object.fromEntries(
    (flagsResult.data || []).map((flag) => [flag.work_item_id, flag]),
  );
  const usersById = Object.fromEntries((usersResult.data || []).map((user) => [user.id, user]));
  const membersById = Object.fromEntries(
    (membersResult.data || []).map((member) => [member.id, member]),
  );
  const membersByUserId = Object.fromEntries(
    (membersResult.data || [])
      .filter((member) => member.user_id)
      .map((member) => [member.user_id, member]),
  );
  const detailsByWorkItemId = Object.fromEntries(
    (detailsResult.data || []).map((detail) => [detail.work_item_id, detail]),
  );
  const checklistByWorkItemId = {};
  (checklistResult.data || []).forEach((item) => {
    if (!checklistByWorkItemId[item.work_item_id]) checklistByWorkItemId[item.work_item_id] = [];
    checklistByWorkItemId[item.work_item_id].push(item);
  });
  const commentsByWorkItemId = {};
  (commentsResult.data || []).forEach((comment) => {
    if (!commentsByWorkItemId[comment.work_item_id]) commentsByWorkItemId[comment.work_item_id] = [];
    commentsByWorkItemId[comment.work_item_id].push({
      ...comment,
      authorName: usersById[comment.author_user_id]?.display_name || "Unknown",
    });
  });

  syncFlowMateMembers(membersResult.data || []);

  return (workItemsResult.data || []).map((item) => {
    const flags = flagsByWorkItemId[item.id] || {};
    const requester = usersById[item.requester_user_id] || {};
    const owner =
      (item.final_owner_member_id && membersById[item.final_owner_member_id]) ||
      (item.assignee_user_id && membersByUserId[item.assignee_user_id]) ||
      null;
    const assigneeOtherName = (item.assignee_other_name || "").trim();
    const otherAssigneeId = assigneeOtherName ? `other:${assigneeOtherName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : null;
    if (otherAssigneeId && !window.MEMBERS_BY_ID[otherAssigneeId]) {
      window.MEMBERS_BY_ID[otherAssigneeId] = {
        id: otherAssigneeId,
        name: assigneeOtherName,
        initials: assigneeOtherName
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((part) => part[0])
          .join("")
          .toUpperCase() || "?",
        color: "#6B7280",
      };
    }

    return {
      id: item.display_id,
      type: item.work_type === "quick_task" ? "quick" : "creative",
      title: item.title,
      status: item.status,
      priority: item.priority,
      effort: item.work_type === "quick_task" ? null : item.effort_point,
      dueLabel: flowmateDateLabel(item.due_date),
      dueDelta: flowmateDueDelta(item.due_date),
      assetType: flowmateToKebab(detailsByWorkItemId[item.id]?.asset_type),
      platforms: detailsByWorkItemId[item.id]?.platforms || [],
      platform: (detailsByWorkItemId[item.id]?.platforms || []).join(", "),
      size: detailsByWorkItemId[item.id]?.size_format || "",
      requesterTeam: item.requester_team || requester.requester_team || "No team",
      assignee: owner ? owner.id : otherAssigneeId,
      assigneeOtherName,
      requester: requester.display_name || "-",
      reviewRound: item.review_round || 0,
      needsSplit: Boolean(item.needs_split),
      queueReason: item.assignment_reason || (item.status === "need_brief" ? "Required brief fields are missing." : "Assignment engine queued this request."),
      blockReason: item.blocked_reason,
      checklistItems: checklistByWorkItemId[item.id] || [],
      checklist: {
        done: (checklistByWorkItemId[item.id] || []).filter((checklistItem) => checklistItem.is_done).length,
        total: (checklistByWorkItemId[item.id] || []).length,
      },
      comments: commentsByWorkItemId[item.id] || [],
      overdue: Boolean(flags.is_overdue),
      dueSoon: Boolean(flags.is_due_soon),
      isSupabaseRow: true,
    };
  });
}

function normalizeFlowMateMember(member) {
  return {
    id: member.id,
    name: member.display_name,
    initials: member.initials,
    color: member.color || "#2E546D",
    discipline: member.discipline_short || "FCO",
  };
}

function syncFlowMateMembers(members) {
  window.MEMBERS_BY_ID = window.MEMBERS_BY_ID || {};
  const liveMembersById = {};

  (members || []).forEach((member) => {
    const normalized = normalizeFlowMateMember(member);
    window.MEMBERS_BY_ID[normalized.id] = normalized;
    liveMembersById[normalized.id] = normalized;
  });

  if (Array.isArray(window.MEMBERS)) {
    const merged = new Map(window.MEMBERS.map((member) => [member.id, member]));
    Object.values(liveMembersById).forEach((member) => {
      merged.set(member.id, { ...(merged.get(member.id) || {}), ...member });
    });
    window.MEMBERS.splice(
      0,
      window.MEMBERS.length,
      ...Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name)),
    );
  }
}

async function loadFlowMateAssignees() {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }

  const { data, error } = await window.flowmateSupabase
    .from("team_members")
    .select("id,user_id,display_name,initials,color,discipline_short,active")
    .eq("active", true)
    .not("user_id", "is", null)
    .order("display_name", { ascending: true });

  if (error) throw error;

  syncFlowMateMembers(data || []);
  return (data || [])
    .filter((member) => member.user_id)
    .map((member) => ({
      userId: member.user_id,
      memberId: member.id,
      name: member.display_name,
      initials: member.initials,
      color: member.color || "#2E546D",
    }));
}

window.loadFlowMateListRows = loadFlowMateListRows;
window.loadFlowMateAssignees = loadFlowMateAssignees;
