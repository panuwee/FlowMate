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
      .select("id,display_id,title,work_type,status,priority,due_date,effort_point,requester_user_id,requester_team,assignee_user_id,final_owner_member_id,needs_split,assignment_reason,review_round,blocked_reason")
      .order("due_date", { ascending: true }),
    window.flowmateSupabase
      .from("work_item_flags_v")
      .select("work_item_id,is_overdue,is_due_soon,is_queued,is_blocked"),
    window.flowmateSupabase
      .from("users")
      .select("id,display_name,requester_team"),
    window.flowmateSupabase
      .from("team_members")
      .select("id,user_id,display_name,initials,color"),
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

  (membersResult.data || []).forEach((member) => {
    window.MEMBERS_BY_ID[member.id] = {
      id: member.id,
      name: member.display_name,
      initials: member.initials,
      color: member.color || "#2E546D",
    };
  });

  return (workItemsResult.data || []).map((item) => {
    const flags = flagsByWorkItemId[item.id] || {};
    const requester = usersById[item.requester_user_id] || {};
    const owner =
      (item.final_owner_member_id && membersById[item.final_owner_member_id]) ||
      (item.assignee_user_id && membersByUserId[item.assignee_user_id]) ||
      null;

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
      assignee: owner ? owner.id : null,
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

window.loadFlowMateListRows = loadFlowMateListRows;
