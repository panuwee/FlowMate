function flowmateToKebab(value) {
  return value ? value.replaceAll("_", "-") : value;
}

const FLOWMATE_ALLOWED_REQUESTER_TEAMS = ["Operations", "Marketing", "Esport", "GD/VE"];
const FLOWMATE_REALTIME_DEBOUNCE_MS = 700;
const FLOWMATE_REFRESH_POLL_MS = 60000;
const FLOWMATE_REALTIME_TABLES = [
  "work_items",
  "creative_request_details",
  "checklist_items",
  "comments",
  "work_item_links",
  "work_item_watchers",
  "assignment_runs",
  "work_item_events",
  "notifications",
];

let flowmateRealtimeChannel = null;
let flowmateRealtimeRefreshTimer = null;

window.FLOWMATE_REALTIME_STATE = window.FLOWMATE_REALTIME_STATE || {
  status: "idle",
  message: "Realtime not started",
  lastEventAt: null,
};

function setFlowMateRealtimeState(nextState) {
  window.FLOWMATE_REALTIME_STATE = {
    ...window.FLOWMATE_REALTIME_STATE,
    ...nextState,
  };
  window.dispatchEvent(new CustomEvent("flowmate:realtime-state", {
    detail: window.FLOWMATE_REALTIME_STATE,
  }));
}

function emitFlowMateSynced(source) {
  window.dispatchEvent(new CustomEvent("flowmate:synced", { detail: { source } }));
}

function scheduleFlowMateRealtimeRefresh(reason) {
  if (flowmateRealtimeRefreshTimer) clearTimeout(flowmateRealtimeRefreshTimer);
  setFlowMateRealtimeState({
    status: "syncing",
    message: "Realtime update received",
    lastEventAt: Date.now(),
  });
  flowmateRealtimeRefreshTimer = setTimeout(() => {
    flowmateRealtimeRefreshTimer = null;
    window.dispatchEvent(new CustomEvent("flowmate:refresh-request", { detail: { reason } }));
    window.dispatchEvent(new CustomEvent("flowmate:refresh-counts"));
  }, FLOWMATE_REALTIME_DEBOUNCE_MS);
}

function startFlowMateRealtime() {
  if (!window.flowmateSupabase || typeof window.flowmateSupabase.channel !== "function") {
    setFlowMateRealtimeState({ status: "degraded", message: "Realtime degraded - polling fallback active" });
    return null;
  }
  if (!window.FLOWMATE_CURRENT_USER) {
    setFlowMateRealtimeState({ status: "idle", message: "Realtime waits for sign-in" });
    return null;
  }
  if (flowmateRealtimeChannel) return flowmateRealtimeChannel;

  try {
    const channel = window.flowmateSupabase.channel("flowmate-live-updates-v1");
    FLOWMATE_REALTIME_TABLES.forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        scheduleFlowMateRealtimeRefresh(table);
      });
    });
    flowmateRealtimeChannel = channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setFlowMateRealtimeState({ status: "connected", message: "Realtime connected" });
        return;
      }
      if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
        setFlowMateRealtimeState({ status: "degraded", message: "Realtime degraded - polling fallback active" });
      }
    });
    return flowmateRealtimeChannel;
  } catch (error) {
    console.warn("[FlowMate Realtime] setup failed:", error && error.message);
    flowmateRealtimeChannel = null;
    setFlowMateRealtimeState({ status: "degraded", message: "Realtime degraded - polling fallback active" });
    return null;
  }
}

function stopFlowMateRealtime() {
  if (flowmateRealtimeRefreshTimer) {
    clearTimeout(flowmateRealtimeRefreshTimer);
    flowmateRealtimeRefreshTimer = null;
  }
  if (flowmateRealtimeChannel && window.flowmateSupabase && typeof window.flowmateSupabase.removeChannel === "function") {
    window.flowmateSupabase.removeChannel(flowmateRealtimeChannel);
  }
  flowmateRealtimeChannel = null;
  setFlowMateRealtimeState({ status: "idle", message: "Realtime stopped" });
}

function attachFlowMateLiveRefresh(refreshFn, options = {}) {
  const intervalMs = options.intervalMs || FLOWMATE_REFRESH_POLL_MS;
  let running = false;
  let queued = false;

  async function runRefresh() {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      await refreshFn();
    } finally {
      running = false;
      if (queued) {
        queued = false;
        runRefresh();
      }
    }
  }

  window.addEventListener("flowmate:refresh-request", runRefresh);
  const intervalId = setInterval(runRefresh, intervalMs);
  return () => {
    window.removeEventListener("flowmate:refresh-request", runRefresh);
    clearInterval(intervalId);
  };
}

function normalizeFlowMateRequesterTeam(value) {
  const team = String(value || "").trim();
  if (team === "Operation") return "Operations";
  if (team === "GD/VE Internal") return "GD/VE";
  if (team === "Esport Ops") return "Esport";
  if (team === "PM") return "Operations";
  return FLOWMATE_ALLOWED_REQUESTER_TEAMS.includes(team) ? team : "";
}

function flowmateDateLabel(dateValue) {
  if (!dateValue) return "";
  const dueDate = new Date(`${dateValue}T00:00:00`);
  return dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function flowmateDateFullLabel(dateValue) {
  if (!dateValue) return "";
  const dueDate = dateValue.includes("T") ? new Date(dateValue) : new Date(`${dateValue}T00:00:00`);
  return dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function flowmateDateTimeLabel(dateValue) {
  if (!dateValue) return "";
  return new Date(dateValue).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function flowmateDateTimeFullLabel(dateValue) {
  if (!dateValue) return "";
  return new Date(dateValue)
    .toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(/\b(am|pm)\b/i, (match) => match.toUpperCase());
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

  const [workItemsResult, flagsResult, usersResult, membersResult, detailsResult, checklistResult, commentsResult, linksResult, watchersResult, assignmentRunsResult] = await Promise.all([
    window.flowmateSupabase
      .from("work_items")
      .select("id,display_id,title,description,work_type,status,priority,urgent_reason,due_date,launch_date,effort_point,project_name,campaign_name,requester_user_id,requester_team,assignee_user_id,assignee_other_name,final_owner_member_id,needs_split,assignment_reason,review_round,blocked_reason,created_at")
      .order("due_date", { ascending: true }),
    window.flowmateSupabase
      .from("work_item_flags_v")
      .select("work_item_id,is_overdue,is_due_soon,is_queued,is_blocked"),
    window.flowmateSupabase
      .from("users")
      .select("id,email,display_name,requester_team,is_active"),
    window.flowmateSupabase
      .from("team_members")
      .select("id,user_id,display_name,initials,color,discipline_short,active"),
    window.flowmateSupabase
      .from("creative_request_details")
      .select("work_item_id,asset_type,asset_subtype,platforms,size_format,brief_link,reference_link"),
    window.flowmateSupabase
      .from("checklist_items")
      .select("id,work_item_id,title,is_done,sort_order")
      .order("sort_order", { ascending: true }),
    window.flowmateSupabase
      .from("comments")
      .select("id,work_item_id,author_user_id,body,created_at,updated_at,deleted_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    window.flowmateSupabase
      .from("work_item_links")
      .select("id,work_item_id,url,description,created_by_user_id,created_at,deleted_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    window.flowmateSupabase
      .from("work_item_watchers")
      .select("id,work_item_id,watcher_user_id,added_by_user_id,created_at,removed_at")
      .is("removed_at", null)
      .order("created_at", { ascending: true }),
    window.flowmateSupabase
      .from("assignment_runs")
      .select("work_item_id,ran_at")
      .order("ran_at", { ascending: false }),
  ]);

  const firstError =
    workItemsResult.error ||
    flagsResult.error ||
    usersResult.error ||
    membersResult.error ||
    detailsResult.error ||
    checklistResult.error ||
    commentsResult.error ||
    linksResult.error ||
    watchersResult.error ||
    assignmentRunsResult.error;

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
      createdLabel: flowmateDateTimeFullLabel(comment.created_at),
    });
  });
  const linksByWorkItemId = {};
  (linksResult.data || []).forEach((link) => {
    if (!linksByWorkItemId[link.work_item_id]) linksByWorkItemId[link.work_item_id] = [];
    linksByWorkItemId[link.work_item_id].push({
      ...link,
      createdByName: usersById[link.created_by_user_id]?.display_name || "Unknown",
      createdLabel: flowmateDateTimeLabel(link.created_at),
    });
  });
  const watchersByWorkItemId = {};
  (watchersResult.data || []).forEach((watcher) => {
    if (!watchersByWorkItemId[watcher.work_item_id]) watchersByWorkItemId[watcher.work_item_id] = [];
    watchersByWorkItemId[watcher.work_item_id].push({
      ...watcher,
      watcherName: usersById[watcher.watcher_user_id]?.display_name || membersByUserId[watcher.watcher_user_id]?.display_name || "Unknown",
      addedByName: usersById[watcher.added_by_user_id]?.display_name || "Unknown",
      createdLabel: flowmateDateTimeLabel(watcher.created_at),
    });
  });
  const assignmentRunByWorkItemId = {};
  (assignmentRunsResult.data || []).forEach((run) => {
    if (!assignmentRunByWorkItemId[run.work_item_id]) assignmentRunByWorkItemId[run.work_item_id] = run;
  });

  syncFlowMateMembers(membersResult.data || []);
  syncFlowMateMentionUsers(usersResult.data || []);

  const rows = (workItemsResult.data || []).map((item) => {
    const flags = flagsByWorkItemId[item.id] || {};
    const requester = usersById[item.requester_user_id] || {};
    const details = detailsByWorkItemId[item.id] || {};
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

    const requesterTeam = normalizeFlowMateRequesterTeam(item.requester_team || requester.requester_team);

    return {
      id: item.display_id,
      type: item.work_type === "quick_task" ? "quick" : "creative",
      title: item.title,
      note: item.description || "",
      briefNote: item.description || "",
      status: item.status,
      priority: item.priority,
      effort: item.work_type === "quick_task" ? null : item.effort_point,
      dueLabel: flowmateDateLabel(item.due_date),
      dueFullLabel: flowmateDateFullLabel(item.due_date),
      dueDelta: flowmateDueDelta(item.due_date),
      launchDate: item.launch_date,
      launchLabel: flowmateDateLabel(item.launch_date),
      launchFullLabel: flowmateDateFullLabel(item.launch_date),
      createdLabel: flowmateDateFullLabel(item.created_at),
      urgentReason: item.urgent_reason || "",
      assetType: flowmateToKebab(details.asset_type),
      subtype: details.asset_subtype || "",
      platforms: details.platforms || [],
      platform: (details.platforms || []).join(", "),
      size: details.size_format || "",
      briefLink: details.brief_link || "",
      referenceLink: details.reference_link || "",
      campaign: item.campaign_name || item.project_name || "",
      requesterTeam: requesterTeam || "No team",
      requesterUserId: item.requester_user_id,
      assigneeUserId: item.assignee_user_id,
      assignee: owner ? owner.id : otherAssigneeId,
      assigneeOtherName,
      requester: requester.display_name || "-",
      reviewRound: item.review_round || 0,
      needsSplit: Boolean(item.needs_split),
      queueReason: item.assignment_reason || (item.status === "need_brief" ? "Required brief fields are missing." : "Assignment engine queued this request."),
      lastRunLabel: flowmateDateTimeLabel(assignmentRunByWorkItemId[item.id]?.ran_at),
      blockReason: item.blocked_reason,
      checklistItems: checklistByWorkItemId[item.id] || [],
      checklist: {
        done: (checklistByWorkItemId[item.id] || []).filter((checklistItem) => checklistItem.is_done).length,
        total: (checklistByWorkItemId[item.id] || []).length,
      },
      comments: commentsByWorkItemId[item.id] || [],
      links: linksByWorkItemId[item.id] || [],
      watchers: watchersByWorkItemId[item.id] || [],
      overdue: Boolean(flags.is_overdue),
      dueSoon: Boolean(flags.is_due_soon),
      isSupabaseRow: true,
    };
  });
  emitFlowMateSynced("work_items");
  return rows;
}

function normalizeFlowMateMember(member) {
  return {
    id: member.id,
    userId: member.user_id,
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

function normalizeFlowMateMentionUser(user) {
  return {
    id: user.id,
    name: user.display_name || user.email || "Unknown",
    email: user.email || "",
  };
}

function syncFlowMateMentionUsers(users) {
  window.FLOWMATE_MENTION_USERS = (users || [])
    .filter((user) => user && user.id && user.is_active !== false)
    .map(normalizeFlowMateMentionUser)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function loadFlowMateMentionUsers() {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }

  const { data, error } = await window.flowmateSupabase
    .from("users")
    .select("id,email,display_name,is_active")
    .eq("is_active", true)
    .order("display_name", { ascending: true });

  if (error) throw error;
  syncFlowMateMentionUsers(data || []);
  return window.FLOWMATE_MENTION_USERS || [];
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
window.loadFlowMateMentionUsers = loadFlowMateMentionUsers;
window.startFlowMateRealtime = startFlowMateRealtime;
window.stopFlowMateRealtime = stopFlowMateRealtime;
window.attachFlowMateLiveRefresh = attachFlowMateLiveRefresh;

async function loadFlowMateRequesterTeams() {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }

  const { data, error } = await window.flowmateSupabase
    .from("users")
    .select("requester_team")
    .not("requester_team", "is", null)
    .eq("is_active", true)
    .order("requester_team", { ascending: true });

  if (error) throw error;

  const fallback = (window.TEAMS || []).map(normalizeFlowMateRequesterTeam).filter(Boolean);
  const liveTeams = (data || [])
    .map((row) => normalizeFlowMateRequesterTeam(row.requester_team))
    .filter(Boolean);
  const availableTeams = new Set([...fallback, ...liveTeams]);
  return FLOWMATE_ALLOWED_REQUESTER_TEAMS.filter((team) => availableTeams.has(team));
}

window.loadFlowMateRequesterTeams = loadFlowMateRequesterTeams;
window.normalizeFlowMateRequesterTeam = normalizeFlowMateRequesterTeam;
