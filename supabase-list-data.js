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
  "work_item_ai_tags",
  "assignment_runs",
  "flowmate_capacity_allocations",
  "work_item_events",
  "notifications",
  "leave_requests",
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
  // O-2/O-3: self-scheduling poller that
  //  - pauses entirely while the tab is hidden (no background polling storm),
  //  - refreshes immediately when the tab regains focus,
  //  - backs off exponentially (up to 8x) when a refresh fails, resetting on
  //    success, so a backend outage doesn't turn into a fixed retry storm.
  // Event-driven refreshes (mutations / realtime via flowmate:refresh-request)
  // still fire immediately regardless of the timer.
  const baseMs = options.intervalMs || FLOWMATE_REFRESH_POLL_MS;
  const maxMs = baseMs * 8;
  let running = false;
  let queued = false;
  let stopped = false;
  let timer = null;
  let delay = baseMs;

  function schedule() {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(tick, delay);
  }

  async function tick() {
    timer = null;
    // Don't poll a hidden/background tab — just wait for it to become visible.
    if (typeof document !== "undefined" && document.hidden) {
      schedule();
      return;
    }
    await runRefresh();
    schedule();
  }

  async function runRefresh() {
    if (stopped) return;
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      await refreshFn();
      delay = baseMs;
    } catch (error) {
      delay = Math.min(delay * 2, maxMs);
      console.warn("[FlowMate LiveRefresh] refresh failed; backing off to", delay, "ms:", error && error.message);
    } finally {
      running = false;
      if (queued) {
        queued = false;
        runRefresh();
      }
    }
  }

  function onVisibility() {
    if (typeof document !== "undefined" && !document.hidden) {
      delay = baseMs;
      runRefresh();
    }
  }

  window.addEventListener("flowmate:refresh-request", runRefresh);
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", onVisibility);
  }
  schedule();

  return () => {
    stopped = true;
    window.removeEventListener("flowmate:refresh-request", runRefresh);
    if (typeof document !== "undefined" && typeof document.removeEventListener === "function") {
      document.removeEventListener("visibilitychange", onVisibility);
    }
    if (timer) clearTimeout(timer);
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

function flowmateDateTimeWithOptionalTimeLabel(dateValue, timeValue) {
  const dateLabel = flowmateDateFullLabel(dateValue);
  const timeLabel = String(timeValue || "").slice(0, 5);
  return dateLabel && timeLabel ? `${dateLabel} ${timeLabel}` : dateLabel;
}

function flowmateDateTimeBangkokLabel(dateValue) {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return flowmateDateFullLabel(dateValue);
  const dateLabel = date.toLocaleDateString("en-US", {
    timeZone: "Asia/Bangkok",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeLabel = date.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${dateLabel} ${timeLabel}`;
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

// O-5: prefer the deduped latest_assignment_run_v view (one row per work item)
// over transferring the entire assignment_runs history. Falls back to the raw
// table if the view isn't deployed yet, so frontend/SQL upload order is safe.
async function loadFlowMateLatestAssignmentRuns() {
  let res = await window.flowmateSupabase
    .from("latest_assignment_run_v")
    .select("work_item_id,capacity_snapshot,reason,result,final_owner_member_id,ran_at");
  if (res.error) {
    res = await window.flowmateSupabase
      .from("assignment_runs")
      .select("work_item_id,capacity_snapshot,reason,result,final_owner_member_id,ran_at")
      .order("ran_at", { ascending: false });
  }
  return res;
}

function parseFlowMateAssignmentWarnings(capacitySnapshot) {
  let snapshot = capacitySnapshot;
  if (typeof snapshot === "string") {
    try {
      snapshot = JSON.parse(snapshot);
    } catch (error) {
      return [];
    }
  }
  const rawWarnings = Array.isArray(snapshot)
    ? snapshot
    : (snapshot && Array.isArray(snapshot.warnings) ? snapshot.warnings : []);
  return rawWarnings.flatMap((warning) => {
    if (typeof warning === "string") {
      const code = warning.trim().toLowerCase();
      return code ? [{ code, severity: "warning", message: code.replace(/_/g, " ") }] : [];
    }
    if (!warning || typeof warning !== "object") return [];
    const code = String(warning.code || "").trim().toLowerCase();
    if (!code) return [];
    return [{
      code,
      severity: String(warning.severity || "warning").trim().toLowerCase(),
      message: String(warning.message || code.replace(/_/g, " ")).trim(),
    }];
  });
}

async function loadFlowMateAiTagRowsForList() {
  const res = await window.flowmateSupabase
    .from("work_item_ai_tags")
    .select("id,work_item_id,tag,created_by_user_id,created_at")
    .order("created_at", { ascending: true });

  if (res.error) {
    // Older deployments may not have ai_tags.sql yet. Keep the list/KPI usable
    // and let the dedicated AI Tag UI surface direct RPC errors.
    console.warn("[FlowMate AI Tags] list preload skipped:", res.error.message);
    return { data: [], error: null };
  }
  return res;
}

async function loadFlowMateWorkItemsForList() {
  const baseColumns = "id,display_id,title,description,work_type,status,priority,urgent_reason,due_date,launch_date,publish_date,publish_time,effort_point,project_name,campaign_name,requester_user_id,requester_team,assignee_user_id,assignee_other_name,final_owner_member_id,needs_split,assignment_reason,review_round,blocked_reason,cancel_reason,archived_at,created_at,delivered_at";
  const activeTeam = window.getFlowMateActiveTeam ? window.getFlowMateActiveTeam() : "";
  const isGdveCreativeWorkspace = activeTeam === "gdve";
  let query = window.flowmateSupabase
    .from("work_items")
    .select(`${baseColumns},owning_team_code`)
    .is("archived_at", null)
    .order("due_date", { ascending: true });
  if (isGdveCreativeWorkspace) {
    query = query.eq("work_type", "creative_request");
  } else if (activeTeam) {
    query = query.eq("owning_team_code", activeTeam);
  }
  let result = await query;

  // Allow the frontend bundle to be uploaded before the SQL migration.
  if (result.error && /owning_team_code|column/i.test(result.error.message || "")) {
    result = await window.flowmateSupabase
      .from("work_items")
      .select(baseColumns)
      .is("archived_at", null)
      .order("due_date", { ascending: true });
    if (!result.error && activeTeam) {
      result.data = (result.data || []).filter((item) => {
        if (isGdveCreativeWorkspace) {
          return item.work_type === "creative_request";
        }
        const itemTeam = window.normalizeFlowMateWorkspaceTeam
          ? window.normalizeFlowMateWorkspaceTeam(item.requester_team)
          : "";
        return itemTeam === activeTeam;
      });
    }
  }
  return result;
}

const FLOWMATE_LIST_ROWS_CACHE_TTL_MS = 30_000;
const flowMateListRowsCacheByWorkspace = new Map();

function getFlowMateListRowsWorkspaceKey() {
  const activeTeam = window.getFlowMateActiveTeam
    ? window.getFlowMateActiveTeam()
    : window.FLOWMATE_ACTIVE_TEAM;
  const workspace = String(activeTeam || "").trim().toLowerCase() || "no-workspace";
  const userId = String(window.FLOWMATE_CURRENT_USER?.id || "signed-out").trim() || "signed-out";
  return `${userId}:${workspace}`;
}

function invalidateFlowMateListRowsCache(options = {}) {
  const workspaceKey = options.workspaceKey || null;
  const keys = workspaceKey ? [workspaceKey] : Array.from(flowMateListRowsCacheByWorkspace.keys());
  keys.forEach((key) => flowMateListRowsCacheByWorkspace.delete(key));
}

function cloneFlowMateListData(value) {
  if (Array.isArray(value)) return value.map(cloneFlowMateListData);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [key, cloneFlowMateListData(nestedValue)]));
  }
  return value;
}

async function loadFlowMateListRowsUncached() {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }

  const [workItemsResult, flagsResult, usersResult, membersResult, detailsResult, checklistResult, commentsResult, linksResult, watchersResult, aiTagsResult, eventsResult, assignmentRunsResult, marketingSubPicResult] = await Promise.all([
    loadFlowMateWorkItemsForList(),
    window.flowmateSupabase
      .from("work_item_flags_v")
      .select("work_item_id,is_overdue,is_due_soon,is_queued,is_blocked"),
    window.flowmateSupabase
      .from("users")
      .select("id,email,display_name,requester_team,is_active"),
    window.flowmateSupabase
      .from("team_members")
      .select("id,user_id,member_code,display_name,initials,color,discipline,discipline_short,active,availability,capacity_per_day,capacity_override_per_day,wip_limit"),
    window.flowmateSupabase
      .from("creative_request_details")
      .select("work_item_id,asset_type,asset_subtype,asset_count,asset_type_2,asset_subtype_2,asset_count_2,platforms,size_format,brief_link,reference_link,brief_missing_reason"),
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
    loadFlowMateAiTagRowsForList(),
    window.flowmateSupabase
      .from("work_item_events")
      .select("id,work_item_id,actor_user_id,event_type,from_status,to_status,metadata,created_at")
      .order("created_at", { ascending: false }),
    loadFlowMateLatestAssignmentRuns(),
    window.flowmateSupabase
      .from("marketing_content_items")
      .select("flowmate_work_item_id,sub_pic_user_id,brief_link")
      .not("sub_pic_user_id", "is", null),
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
    aiTagsResult.error ||
    eventsResult.error ||
    assignmentRunsResult.error ||
    marketingSubPicResult.error;

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
  const aiTagsByWorkItemId = {};
  (aiTagsResult.data || []).forEach((tag) => {
    if (!aiTagsByWorkItemId[tag.work_item_id]) aiTagsByWorkItemId[tag.work_item_id] = [];
    aiTagsByWorkItemId[tag.work_item_id].push({
      id: tag.id,
      workItemId: tag.work_item_id,
      tag: tag.tag,
      createdByUserId: tag.created_by_user_id,
      createdAt: tag.created_at,
    });
  });
  const eventsByWorkItemId = {};
  (eventsResult.data || []).forEach((event) => {
    if (!eventsByWorkItemId[event.work_item_id]) eventsByWorkItemId[event.work_item_id] = [];
    eventsByWorkItemId[event.work_item_id].push({
      ...event,
      actorName: usersById[event.actor_user_id]?.display_name || "System",
      createdLabel: flowmateDateTimeFullLabel(event.created_at),
    });
  });
  const assignmentRunByWorkItemId = {};
  (assignmentRunsResult.data || []).forEach((run) => {
    if (!assignmentRunByWorkItemId[run.work_item_id]) assignmentRunByWorkItemId[run.work_item_id] = run;
  });
  const marketingSubPicByWorkItemId = Object.fromEntries(
    (marketingSubPicResult.data || []).flatMap((row) => {
      const keys = row.flowmate_work_item_id ? [row.flowmate_work_item_id] : [];
      const match = String(row.brief_link || "").match(/#detail\/([^/?#]+)/i);
      if (match && match[1]) keys.push(match[1].toUpperCase());
      return keys.map((key) => [key, row.sub_pic_user_id]);
    }),
  );

  syncFlowMateMembers(membersResult.data || []);
  syncFlowMateMentionUsers(usersResult.data || []);

  const activeWorkItems = (workItemsResult.data || []).filter((item) => !item.archived_at);

  const rows = activeWorkItems.map((item) => {
    const flags = flagsByWorkItemId[item.id] || {};
    const requester = usersById[item.requester_user_id] || {};
    const details = detailsByWorkItemId[item.id] || {};
    const assignmentRun = assignmentRunByWorkItemId[item.id] || null;
    const activityEvents = eventsByWorkItemId[item.id] || [];
    const chronologicalEvents = activityEvents.slice().sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
    const startedEvent = chronologicalEvents.find((event) => event.to_status === "in_progress");
    const assignedEvent = chronologicalEvents.find((event) => event.to_status === "assigned" || event.event_type === "assigned");
    const assignmentOwnerMemberId = item.final_owner_member_id || assignmentRun?.final_owner_member_id || null;
    const owner =
      (assignmentOwnerMemberId && membersById[assignmentOwnerMemberId]) ||
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
      workItemId: item.id,
      id: item.display_id,
      type: item.work_type === "quick_task" ? "quick" : "creative",
      title: item.title,
      note: item.description || "",
      briefNote: item.description || "",
      status: item.status,
      priority: item.priority,
      effort: item.work_type === "quick_task" ? null : item.effort_point,
      dueDate: item.due_date,
      dueLabel: flowmateDateLabel(item.due_date),
      dueFullLabel: flowmateDateFullLabel(item.due_date),
      dueDelta: flowmateDueDelta(item.due_date),
      launchDate: item.launch_date,
      launchLabel: flowmateDateLabel(item.launch_date),
      launchFullLabel: flowmateDateTimeWithOptionalTimeLabel(item.launch_date, item.publish_time),
      publishDate: item.publish_date,
      publishTime: item.publish_time,
      publishLabel: flowmateDateLabel(item.publish_date),
      publishFullLabel: flowmateDateFullLabel(item.publish_date),
      planningDate: item.publish_date || item.launch_date,
      planningLabel: flowmateDateLabel(item.publish_date || item.launch_date),
      planningFullLabel: flowmateDateFullLabel(item.publish_date || item.launch_date),
      createdAt: item.created_at,
      assignedAt: assignedEvent?.created_at || assignmentRun?.ran_at || null,
      startedAt: startedEvent?.created_at || null,
      createdLabel: flowmateDateTimeBangkokLabel(item.created_at),
      deliveredAt: item.delivered_at,
      deliveredLabel: flowmateDateTimeFullLabel(item.delivered_at),
      urgentReason: item.urgent_reason || "",
      assetType: flowmateToKebab(details.asset_type),
      subtype: details.asset_subtype || "",
      assetCount: details.asset_count || 1,
      assetType2: flowmateToKebab(details.asset_type_2),
      subtype2: details.asset_subtype_2 || "",
      assetCount2: details.asset_count_2 || null,
      platforms: details.platforms || [],
      platform: (details.platforms || []).join(", "),
      channel: (details.platforms || []).join(", "),
      size: details.size_format || "",
      briefLink: details.brief_link || "",
      referenceLink: details.reference_link || "",
      missingBriefReason: details.brief_missing_reason || item.assignment_reason || "",
      campaign: item.campaign_name || item.project_name || "",
      owningTeamKey: item.owning_team_code || (window.normalizeFlowMateWorkspaceTeam ? window.normalizeFlowMateWorkspaceTeam(item.requester_team) : ""),
      requesterTeam: requesterTeam || "No team",
      requesterUserId: item.requester_user_id,
      assigneeUserId: item.assignee_user_id,
      assignee: owner ? owner.id : otherAssigneeId,
      assigneeOtherName,
      requester: requester.display_name || "-",
      reviewRound: item.review_round || 0,
      needsSplit: Boolean(item.needs_split),
      assignmentWarnings: parseFlowMateAssignmentWarnings(assignmentRun?.capacity_snapshot),
      assignmentResult: assignmentRun?.result || item.status || "",
      assignmentReason: assignmentRun?.reason || item.assignment_reason || "",
      queueReason: assignmentRun?.reason || item.assignment_reason || (item.status === "need_brief" ? "Required brief fields are missing." : "Assignment context is not available."),
      lastRunLabel: flowmateDateTimeLabel(assignmentRun?.ran_at),
      blockReason: item.blocked_reason,
      cancelReason: item.cancel_reason || "",
      archivedAt: item.archived_at || null,
      checklistItems: checklistByWorkItemId[item.id] || [],
      checklist: {
        done: (checklistByWorkItemId[item.id] || []).filter((checklistItem) => checklistItem.is_done).length,
        total: (checklistByWorkItemId[item.id] || []).length,
      },
      comments: commentsByWorkItemId[item.id] || [],
      links: linksByWorkItemId[item.id] || [],
      watchers: watchersByWorkItemId[item.id] || [],
      aiTags: aiTagsByWorkItemId[item.id] || [],
      activityEvents,
      overdue: Boolean(flags.is_overdue),
      dueSoon: Boolean(flags.is_due_soon),
      isSupabaseRow: true,
      marketingPlanSubPicUserId: marketingSubPicByWorkItemId[item.id] || marketingSubPicByWorkItemId[item.display_id] || null,
    };
  });
  emitFlowMateSynced("work_items");
  return rows;
}

function loadFlowMateListRows(options = {}) {
  if (!window.flowmateSupabase) {
    return Promise.reject(new Error("Supabase client is not ready."));
  }

  const workspaceKey = getFlowMateListRowsWorkspaceKey();
  const force = options.force === true;
  const now = Date.now();
  const cached = flowMateListRowsCacheByWorkspace.get(workspaceKey);
  if (cached?.promise) return cached.promise.then(cloneFlowMateListData);
  if (!force && cached?.rows && cached.expiresAt > now) return Promise.resolve(cloneFlowMateListData(cached.rows));

  const entry = { rows: null, expiresAt: 0, promise: null };
  const request = loadFlowMateListRowsUncached();
  const tracked = request
    .then((rows) => {
      const cachedRows = cloneFlowMateListData(rows);
      if (flowMateListRowsCacheByWorkspace.get(workspaceKey) === entry) {
        entry.rows = cachedRows;
        entry.expiresAt = Date.now() + FLOWMATE_LIST_ROWS_CACHE_TTL_MS;
      }
      return cachedRows;
    })
    .catch((error) => {
      if (flowMateListRowsCacheByWorkspace.get(workspaceKey) === entry) {
        entry.rows = null;
        entry.expiresAt = 0;
      }
      throw error;
    })
    .finally(() => {
      if (flowMateListRowsCacheByWorkspace.get(workspaceKey) !== entry) return;
      entry.promise = null;
      if (!entry.rows) flowMateListRowsCacheByWorkspace.delete(workspaceKey);
    });
  entry.promise = tracked;
  flowMateListRowsCacheByWorkspace.set(workspaceKey, entry);
  return tracked.then(cloneFlowMateListData);
}

if (typeof window.addEventListener === "function") {
  window.addEventListener("flowmate:team-workspace-changed", () => invalidateFlowMateListRowsCache());
  window.addEventListener("flowmate:refresh-request", () => invalidateFlowMateListRowsCache());
  window.addEventListener("flowmate:signed-out", () => invalidateFlowMateListRowsCache());
}

// ---------------------------------------------------------------------------
// Active Board and Delivered history loaders.
// These are intentionally additive: List/Calendar/Attention continue to use
// loadFlowMateListRows() with its original default contract.
// ---------------------------------------------------------------------------
const FLOWMATE_ACTIVE_BOARD_STATUSES = ["unassigned", "assigned", "in_progress", "review", "blocked"];
const FLOWMATE_BOARD_WORK_ITEM_COLUMNS = "id,display_id,title,description,work_type,status,priority,urgent_reason,due_date,launch_date,publish_date,publish_time,effort_point,project_name,campaign_name,requester_user_id,requester_team,assignee_user_id,assignee_other_name,final_owner_member_id,needs_split,assignment_reason,review_round,blocked_reason,cancel_reason,created_at,delivered_at,archived_at,archive_reason,owning_team_code";

function flowMateClampPageSize(value, fallback = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(100, Math.trunc(parsed)));
}

function flowMateApplyWorkspaceScope(query) {
  const activeTeam = window.getFlowMateActiveTeam ? window.getFlowMateActiveTeam() : "";
  if (activeTeam === "gdve") return query.eq("work_type", "creative_request");
  if (activeTeam) return query.eq("owning_team_code", activeTeam);
  return query;
}

function flowMateApplyBoardCursor(query, cursor) {
  if (!cursor) return query;
  const launchDate = cursor.launchDate || cursor.launch_date || null;
  const dueDate = cursor.dueDate || cursor.due_date || null;
  const createdAt = cursor.createdAt || cursor.created_at || null;
  const displayId = cursor.displayId || cursor.display_id || cursor.id || null;
  if (!createdAt || !displayId) return query;
  const quotedCreatedAt = `"${String(createdAt).replace(/\\"/g, '\\\\"')}"`;
  const sameTupleAfter = (prefix) => [
    `and(${prefix},created_at.gt.${quotedCreatedAt})`,
    `and(${prefix},created_at.eq.${quotedCreatedAt},display_id.gt.${displayId})`,
  ];
  if (launchDate) {
    if (dueDate) {
      return query.or([
        `launch_date.gt.${launchDate}`,
        "launch_date.is.null",
        `and(launch_date.eq.${launchDate},due_date.gt.${dueDate})`,
        `and(launch_date.eq.${launchDate},due_date.is.null)`,
        ...sameTupleAfter(`launch_date.eq.${launchDate},due_date.eq.${dueDate}`),
      ].join(","));
    }
    return query.or([
      `launch_date.gt.${launchDate}`,
      "launch_date.is.null",
      ...sameTupleAfter(`launch_date.eq.${launchDate},due_date.is.null`),
    ].join(","));
  }
  if (dueDate) {
    return query.or([
      `and(launch_date.is.null,due_date.gt.${dueDate})`,
      "and(launch_date.is.null,due_date.is.null)",
      ...sameTupleAfter(`launch_date.is.null,due_date.eq.${dueDate}`),
    ].join(","));
  }
  return query.or(sameTupleAfter("launch_date.is.null,due_date.is.null").join(","));
}

function flowMateBoardCursorFromRow(row) {
  if (!row) return null;
  return {
    launchDate: row.launch_date || null,
    dueDate: row.due_date || null,
    createdAt: row.created_at,
    displayId: row.display_id,
  };
}

async function flowMateQueryBoardLane(status, cursor, limit) {
  let query = window.flowmateSupabase
    .from("work_items")
    .select(FLOWMATE_BOARD_WORK_ITEM_COLUMNS)
    .is("archived_at", null)
    .eq("status", status);
  query = flowMateApplyWorkspaceScope(query);
  query = flowMateApplyBoardCursor(query, cursor);
  return query
    .order("launch_date", { ascending: true, nullsFirst: false })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .order("display_id", { ascending: true })
    .limit(limit);
}

function flowMateGroupByWorkItemId(rows) {
  return (rows || []).reduce((grouped, row) => {
    if (!grouped[row.work_item_id]) grouped[row.work_item_id] = [];
    grouped[row.work_item_id].push(row);
    return grouped;
  }, {});
}

async function loadFlowMateBoardRelatedData(items, options = {}) {
  const ids = (items || []).map(item => item.id).filter(Boolean);
  if (!ids.length) return {
    flagsById: {}, usersById: {}, membersById: {}, membersByUserId: {}, detailsById: {}, checklistById: {},
    commentsById: {}, linksById: {}, watchersById: {}, aiTagsById: {}, eventsById: {}, assignmentRunById: {},
  };
  const userIds = Array.from(new Set(items.flatMap(item => [item.requester_user_id, item.assignee_user_id]).filter(Boolean)));
  const memberIds = Array.from(new Set(items.map(item => item.final_owner_member_id).filter(Boolean)));
  const baseQueries = [
    window.flowmateSupabase.from("work_item_flags_v").select("work_item_id,is_overdue,is_due_soon,is_queued,is_blocked").in("work_item_id", ids),
    userIds.length
      ? window.flowmateSupabase.from("users").select("id,email,display_name,requester_team,is_active").in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
    memberIds.length
      ? window.flowmateSupabase.from("team_members").select("id,user_id,member_code,display_name,initials,color,discipline,discipline_short,active,availability,wip_limit").in("id", memberIds)
      : Promise.resolve({ data: [], error: null }),
    window.flowmateSupabase.from("creative_request_details").select("work_item_id,asset_type,asset_subtype,asset_count,asset_type_2,asset_subtype_2,asset_count_2,platforms,size_format,brief_link,reference_link,brief_missing_reason").in("work_item_id", ids),
    window.flowmateSupabase.from("checklist_items").select("id,work_item_id,title,is_done,sort_order").in("work_item_id", ids).order("sort_order", { ascending: true }),
  ];
  const detailQueries = options.includeDetail ? [
    window.flowmateSupabase.from("comments").select("id,work_item_id,author_user_id,body,created_at,updated_at,deleted_at").in("work_item_id", ids).is("deleted_at", null).order("created_at", { ascending: true }),
    window.flowmateSupabase.from("work_item_links").select("id,work_item_id,url,description,created_by_user_id,created_at,deleted_at").in("work_item_id", ids).is("deleted_at", null).order("created_at", { ascending: true }),
    window.flowmateSupabase.from("work_item_watchers").select("id,work_item_id,watcher_user_id,added_by_user_id,created_at,removed_at").in("work_item_id", ids).is("removed_at", null).order("created_at", { ascending: true }),
    window.flowmateSupabase.from("work_item_ai_tags").select("id,work_item_id,tag,created_by_user_id,created_at").in("work_item_id", ids).order("created_at", { ascending: true }),
    window.flowmateSupabase.from("work_item_events").select("id,work_item_id,actor_user_id,event_type,from_status,to_status,metadata,created_at").in("work_item_id", ids).order("created_at", { ascending: false }),
    window.flowmateSupabase.from("assignment_runs").select("work_item_id,capacity_snapshot,reason,result,final_owner_member_id,ran_at").in("work_item_id", ids).order("ran_at", { ascending: false }),
  ] : [];
  const results = await Promise.all([...baseQueries, ...detailQueries]);
  const firstError = results.find(result => result && result.error)?.error;
  if (firstError) throw firstError;
  const [flagsResult, usersResult, membersResult, detailsResult, checklistResult, commentsResult, linksResult, watchersResult, aiTagsResult, eventsResult, assignmentRunsResult] = results;
  const usersById = Object.fromEntries((usersResult.data || []).map(user => [user.id, user]));
  const membersById = Object.fromEntries((membersResult.data || []).map(member => [member.id, member]));
  const membersByUserId = Object.fromEntries((membersResult.data || []).filter(member => member.user_id).map(member => [member.user_id, member]));
  syncFlowMateMembers(membersResult.data || []);
  syncFlowMateMentionUsers(usersResult.data || []);
  const assignmentRunById = {};
  (assignmentRunsResult?.data || []).forEach(run => {
    if (!assignmentRunById[run.work_item_id]) assignmentRunById[run.work_item_id] = run;
  });
  return {
    flagsById: Object.fromEntries((flagsResult.data || []).map(row => [row.work_item_id, row])),
    usersById,
    membersById,
    membersByUserId,
    detailsById: Object.fromEntries((detailsResult.data || []).map(row => [row.work_item_id, row])),
    checklistById: flowMateGroupByWorkItemId(checklistResult.data || []),
    commentsById: flowMateGroupByWorkItemId(commentsResult?.data || []),
    linksById: flowMateGroupByWorkItemId(linksResult?.data || []),
    watchersById: flowMateGroupByWorkItemId(watchersResult?.data || []),
    aiTagsById: flowMateGroupByWorkItemId(aiTagsResult?.data || []),
    eventsById: flowMateGroupByWorkItemId(eventsResult?.data || []),
    assignmentRunById,
  };
}

function normalizeFlowMateBoardWorkItem(item, related = {}) {
  const flags = related.flagsById?.[item.id] || {};
  const requester = related.usersById?.[item.requester_user_id] || {};
  const details = related.detailsById?.[item.id] || {};
  const owner = related.membersById?.[item.final_owner_member_id]
    || related.membersByUserId?.[item.assignee_user_id]
    || null;
  const assigneeUser = related.usersById?.[item.assignee_user_id] || null;
  const assigneeOtherName = String(item.assignee_other_name || "").trim();
  const otherAssigneeId = assigneeOtherName ? `other:${assigneeOtherName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : null;
  const checklistItems = related.checklistById?.[item.id] || [];
  const events = (related.eventsById?.[item.id] || []).map(event => ({
    ...event,
    actorName: related.usersById?.[event.actor_user_id]?.display_name || "System",
    createdLabel: flowmateDateTimeFullLabel(event.created_at),
  }));
  const assignmentRun = related.assignmentRunById?.[item.id] || null;
  return {
    workItemId: item.id,
    id: item.display_id,
    type: item.work_type === "quick_task" ? "quick" : "creative",
    title: item.title || "",
    note: item.description || "",
    briefNote: item.description || "",
    status: item.status,
    priority: item.priority || "normal",
    urgentReason: item.urgent_reason || "",
    effort: item.work_type === "quick_task" ? null : item.effort_point,
    dueDate: item.due_date,
    dueLabel: flowmateDateLabel(item.due_date),
    dueFullLabel: flowmateDateFullLabel(item.due_date),
    dueDelta: flowmateDueDelta(item.due_date),
    launchDate: item.launch_date,
    launchLabel: flowmateDateLabel(item.launch_date),
    launchFullLabel: flowmateDateTimeWithOptionalTimeLabel(item.launch_date, item.publish_time),
    publishDate: item.publish_date,
    publishTime: item.publish_time,
    publishLabel: flowmateDateLabel(item.publish_date),
    publishFullLabel: flowmateDateFullLabel(item.publish_date),
    createdAt: item.created_at,
    createdLabel: flowmateDateTimeBangkokLabel(item.created_at),
    deliveredAt: item.delivered_at,
    deliveredLabel: flowmateDateTimeFullLabel(item.delivered_at),
    archivedAt: item.archived_at || null,
    archiveReason: item.archive_reason || "",
    campaign: item.campaign_name || item.project_name || "",
    owningTeamKey: item.owning_team_code || "",
    requesterUserId: item.requester_user_id,
    requesterTeam: normalizeFlowMateRequesterTeam(item.requester_team || requester.requester_team) || "No team",
    requester: requester.display_name || "-",
    assigneeUserId: item.assignee_user_id,
    assignee: owner ? owner.id : (assigneeUser?.id || otherAssigneeId),
    ownerName: owner?.display_name || assigneeUser?.display_name || assigneeOtherName || "Unassigned",
    assigneeOtherName,
    assetType: flowmateToKebab(details.asset_type),
    subtype: details.asset_subtype || "",
    assetCount: details.asset_count || 1,
    platforms: details.platforms || [],
    platform: (details.platforms || []).join(", "),
    channel: (details.platforms || []).join(", "),
    size: details.size_format || "",
    briefLink: details.brief_link || "",
    referenceLink: details.reference_link || "",
    reviewRound: item.review_round || 0,
    needsSplit: Boolean(item.needs_split),
    assignmentWarnings: parseFlowMateAssignmentWarnings(assignmentRun?.capacity_snapshot),
    assignmentResult: assignmentRun?.result || item.status || "",
    assignmentReason: assignmentRun?.reason || item.assignment_reason || "",
    blockReason: item.blocked_reason || "",
    cancelReason: item.cancel_reason || "",
    checklistItems,
    checklist: { done: checklistItems.filter(entry => entry.is_done).length, total: checklistItems.length },
    comments: (related.commentsById?.[item.id] || []).map(comment => ({ ...comment, authorName: related.usersById?.[comment.author_user_id]?.display_name || "Unknown", createdLabel: flowmateDateTimeFullLabel(comment.created_at) })),
    links: (related.linksById?.[item.id] || []).map(link => ({ ...link, createdByName: related.usersById?.[link.created_by_user_id]?.display_name || "Unknown", createdLabel: flowmateDateTimeLabel(link.created_at) })),
    watchers: related.watchersById?.[item.id] || [],
    aiTags: (related.aiTagsById?.[item.id] || []).map(tag => ({ id: tag.id, workItemId: tag.work_item_id, tag: tag.tag, createdByUserId: tag.created_by_user_id, createdAt: tag.created_at })),
    activityEvents: events,
    overdue: Boolean(flags.is_overdue),
    dueSoon: Boolean(flags.is_due_soon),
    isSupabaseRow: true,
  };
}

async function loadFlowMateBoardLane({ status, cursor = null, limit = 50 } = {}) {
  if (!window.flowmateSupabase) throw new Error("Supabase client is not ready.");
  if (!FLOWMATE_ACTIVE_BOARD_STATUSES.includes(status)) {
    throw new Error("Active Board status must be one of: " + FLOWMATE_ACTIVE_BOARD_STATUSES.join(", ") + ".");
  }
  const pageSize = flowMateClampPageSize(limit);
  let countQuery = window.flowmateSupabase.from("work_items").select("id", { count: "exact", head: true }).is("archived_at", null).eq("status", status);
  countQuery = flowMateApplyWorkspaceScope(countQuery);
  const countPromise = countQuery;
  const laneResult = await flowMateQueryBoardLane(status, cursor, pageSize + 1);
  if (laneResult.error) throw laneResult.error;
  const rawRows = laneResult.data || [];
  const loaded = rawRows.slice(0, pageSize);
  const nextCursor = rawRows.length > pageSize
    ? flowMateBoardCursorFromRow(loaded[loaded.length - 1])
    : null;

  const countResult = await countPromise;
  if (countResult.error) throw countResult.error;
  const total = Number(countResult.count || 0);
  const related = await loadFlowMateBoardRelatedData(loaded);
  return {
    rows: loaded.map(item => normalizeFlowMateBoardWorkItem(item, related)),
    total,
    nextCursor,
    hasMore: Boolean(nextCursor),
    asOf: new Date().toISOString(),
  };
}

async function loadFlowMateBoardSummary() {
  if (!window.flowmateSupabase) throw new Error("Supabase client is not ready.");
  const result = await window.flowmateSupabase.rpc("flowmate_board_summary");
  if (result.error) throw result.error;
  const payload = Array.isArray(result.data) ? (result.data[0] || {}) : (result.data || {});
  const rawCounts = payload.counts || {};
  const counts = Object.fromEntries(FLOWMATE_ACTIVE_BOARD_STATUSES.map(status => [status, Number(rawCounts[status] || 0)]));
  const rawWip = payload.wip || {};
  const rawOwners = rawWip.in_progress_by_owner || rawWip.inProgressByOwner || {};
  const ownerEntries = Array.isArray(rawOwners)
    ? rawOwners.map(owner => [owner?.owner_member_id || owner?.ownerMemberId, owner]).filter(([ownerId]) => ownerId)
    : Object.entries(rawOwners);
  const inProgressByOwner = Object.fromEntries(ownerEntries.map(([ownerId, owner]) => [ownerId, {
    name: owner?.name || owner?.display_name || owner?.owner_name || "Owner",
    count: Number(owner?.count ?? owner?.current_wip ?? 0),
    limit: Number(owner?.limit ?? owner?.wip_limit ?? 0),
  }]));
  return {
    counts,
    wip: {
      inProgressByOwner,
      reviewTeamCount: Number(rawWip.review_team_count ?? rawWip.reviewTeamCount ?? counts.review ?? 0),
      reviewTeamLimit: Number(rawWip.review_team_limit ?? rawWip.reviewTeamLimit ?? 8),
    },
    asOf: payload.as_of || payload.asOf || new Date().toISOString(),
  };
}

function normalizeFlowMateDeliveredRow(row) {
  return {
    workItemId: row.id,
    id: row.display_id,
    title: row.title || "",
    type: row.work_type === "quick_task" ? "quick" : "creative",
    status: "delivered",
    campaign: row.campaign_name || "",
    assignee: row.owner_member_id || null,
    ownerName: row.owner_name || "Unassigned",
    effort: row.work_type === "quick_task" ? null : row.effort_point,
    dueDate: row.due_date || null,
    dueLabel: flowmateDateLabel(row.due_date),
    dueFullLabel: flowmateDateFullLabel(row.due_date),
    launchDate: row.launch_date || null,
    deliveredAt: row.delivered_at || null,
    deliveredLabel: flowmateDateTimeFullLabel(row.delivered_at),
    archivedAt: row.archived_at || null,
    archiveReason: row.archive_reason || "",
    dueResult: row.delivery_result || "",
    legacyMissingDeliveredAt: Boolean(row.legacy_missing_delivered_at),
    isSupabaseRow: true,
  };
}

function flowMateNormalizeDeliveredMonth(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  return /^\d{4}-\d{2}$/.test(text) ? `${text}-01` : text;
}

async function loadFlowMateDeliveredHistory({ scope = "recent", search = "", deliveredMonth = null, campaign = null, ownerId = null, cursor = null, limit = 50 } = {}) {
  if (!window.flowmateSupabase) throw new Error("Supabase client is not ready.");
  if (!["recent", "archived"].includes(scope)) throw new Error("Delivered scope must be recent or archived.");
  const { data, error } = await window.flowmateSupabase.rpc("flowmate_list_delivered_history", {
    p_scope: scope,
    p_search: String(search || "").trim() || null,
    p_delivered_month: flowMateNormalizeDeliveredMonth(deliveredMonth),
    p_campaign: String(campaign || "").trim() || null,
    p_owner_member_id: ownerId || null,
    p_page_size: flowMateClampPageSize(limit),
    p_cursor_delivered_at: cursor?.deliveredAt || cursor?.delivered_at || null,
    p_cursor_id: cursor?.id || null,
  });
  if (error) throw error;
  const payload = data || {};
  const rawRows = payload.rows || payload.items || [];
  const rawCursor = payload.next_cursor || payload.nextCursor || null;
  return {
    rows: rawRows.map(normalizeFlowMateDeliveredRow),
    total: Number(payload.total ?? payload.total_count ?? 0),
    nextCursor: rawCursor ? { deliveredAt: rawCursor.delivered_at || rawCursor.deliveredAt || null, id: rawCursor.id || null } : null,
    hasMore: Boolean(payload.has_more ?? payload.hasMore ?? rawCursor),
    filterOptions: payload.filter_options || payload.filterOptions || {},
    asOf: payload.as_of || payload.asOf || null,
  };
}

function normalizeFlowMateKpiRow(row) {
  return {
    workItemId: row.id,
    id: row.display_id,
    title: row.title || "",
    type: row.work_type === "quick_task" ? "quick" : "creative",
    status: row.status,
    priority: row.priority || "normal",
    effort: row.work_type === "quick_task" ? null : row.effort_point,
    dueDate: row.due_date || null,
    dueLabel: flowmateDateLabel(row.due_date),
    dueFullLabel: flowmateDateFullLabel(row.due_date),
    launchDate: row.launch_date || null,
    launchLabel: flowmateDateLabel(row.launch_date),
    createdAt: row.created_at || null,
    assignedAt: row.assigned_at || null,
    deliveredAt: row.delivered_at || null,
    archivedAt: row.archived_at || null,
    assignee: row.final_owner_member_id || row.owner_member_id || null,
    ownerName: row.owner_name || row.final_owner_name || "Unassigned",
    assigneeOtherName: row.assignee_other_name || "",
    requester: row.requester_name || "-",
    requesterTeam: normalizeFlowMateRequesterTeam(row.requester_team) || row.requester_team || "No team",
    reviewRound: Number(row.review_round || 0),
    campaign: row.campaign_name || row.project_name || "",
    platform: row.platform || "",
    size: row.size_format || "",
    aiTags: Array.isArray(row.ai_tags) ? row.ai_tags : [],
    isSupabaseRow: true,
  };
}

async function loadFlowMateKpiRows({ month } = {}) {
  if (!window.flowmateSupabase) throw new Error("Supabase client is not ready.");
  const normalizedMonth = String(month || "").trim();
  if (normalizedMonth && !/^\d{4}-(0[1-9]|1[0-2])$/.test(normalizedMonth)) {
    throw new Error("KPI month must use YYYY-MM format.");
  }
  let query = window.flowmateSupabase
    .from("flowmate_kpi_work_items_v")
    .select("id,display_id,title,work_type,status,priority,effort_point,due_date,launch_date,created_at,assigned_at,delivered_at,archived_at,final_owner_member_id,owner_member_id,owner_name,final_owner_name,assignee_other_name,requester_name,requester_team,review_round,campaign_name,project_name,platform,size_format,ai_tags");
  if (normalizedMonth) {
    const monthStart = `${normalizedMonth}-01`;
    const nextMonthDate = new Date(`${monthStart}T00:00:00Z`);
    nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth() + 1);
    const nextMonthStart = nextMonthDate.toISOString().slice(0, 10);
    query = query
      .gte("due_date", monthStart)
      .lt("due_date", nextMonthStart);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Archive-inclusive KPI history is unavailable: ${error.message || "flowmate_kpi_work_items_v query failed."}`);
  return (data || []).map(normalizeFlowMateKpiRow);
}

async function loadFlowMateWorkItemById(displayId, { includeArchived = false } = {}) {
  if (!window.flowmateSupabase) throw new Error("Supabase client is not ready.");
  const normalizedId = String(displayId || "").trim().toUpperCase();
  if (!normalizedId) throw new Error("Work item ID is required.");
  let query = window.flowmateSupabase.from("work_items").select(FLOWMATE_BOARD_WORK_ITEM_COLUMNS).eq("display_id", normalizedId);
  query = flowMateApplyWorkspaceScope(query);
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const related = await loadFlowMateBoardRelatedData([data], { includeDetail: true });
  return normalizeFlowMateBoardWorkItem(data, related);
}

function normalizeFlowMateMember(member) {
  return {
    id: member.id,
    userId: member.user_id,
    name: member.display_name,
    initials: member.initials,
    color: member.color || "#2E546D",
    memberCode: member.member_code || "",
    discipline: member.discipline || member.discipline_short || "FCO",
    active: member.active !== false,
    availability: member.availability || "available",
    capacityPerDay: Number(member.capacity_per_day || 0),
    capacityOverridePerDay: member.capacity_override_per_day == null
      ? null
      : Number(member.capacity_override_per_day),
    wipLimit: Number(member.wip_limit || 0),
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

function flowmateExpandLeaveDates(startDate, endDate) {
  const rows = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || "") || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || "")) return rows;
  let cursor = startDate;
  while (cursor <= endDate) {
    rows.push(cursor);
    const [y, m, d] = cursor.split("-").map(Number);
    cursor = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  }
  return rows;
}

async function loadFlowMateLeaveRows() {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }

  const [leaveResult, membersResult] = await Promise.all([
    window.flowmateSupabase
      .from("leave_requests")
      .select("id,team_member_id,start_date,end_date,start_half,end_half,reason,created_at,cancelled_at")
      .is("cancelled_at", null)
      .order("start_date", { ascending: true }),
    window.flowmateSupabase
      .from("team_members")
      .select("id,user_id,display_name,initials,color,discipline,discipline_short,member_code,active,availability,capacity_per_day,capacity_override_per_day,wip_limit"),
  ]);

  const firstError = leaveResult.error || membersResult.error;
  if (firstError) throw firstError;

  const membersById = Object.fromEntries((membersResult.data || []).map((member) => [member.id, member]));
  syncFlowMateMembers(membersResult.data || []);

  return (leaveResult.data || []).flatMap((leave) => {
    const member = membersById[leave.team_member_id] || {};
    return flowmateExpandLeaveDates(leave.start_date, leave.end_date).map((dateKey) => ({
      ...(() => {
        const startHalf = leave.start_half || "am";
        const endHalf = leave.end_half || "pm";
        const isFirstDay = dateKey === leave.start_date;
        const isLastDay = dateKey === leave.end_date;
        const dayStartHalf = isFirstDay ? startHalf : "am";
        const dayEndHalf = isLastDay ? endHalf : "pm";
        const leaveUnits = dayStartHalf === dayEndHalf ? 0.5 : 1;
        const halfLabel = leaveUnits === 1 ? "AM + PM" : dayStartHalf.toUpperCase();
        return { dayStartHalf, dayEndHalf, leaveUnits, halfLabel };
      })(),
      id: `LV-${String(leave.id).slice(0, 8)}-${dateKey}`,
      leaveRequestId: leave.id,
      type: "leave",
      title: `${member.display_name || "Team member"} on leave`,
      status: "leave",
      priority: "normal",
      dueDate: dateKey,
      dueLabel: flowmateDateLabel(dateKey),
      dueFullLabel: flowmateDateFullLabel(dateKey),
      dueDelta: flowmateDueDelta(dateKey),
      calendarDate: dateKey,
      startDate: leave.start_date,
      endDate: leave.end_date,
      startHalf: leave.start_half || "am",
      endHalf: leave.end_half || "pm",
      leaveReason: leave.reason || "",
      assignee: leave.team_member_id,
      assigneeOtherName: "",
      requester: member.display_name || "-",
      requesterTeam: member.discipline || member.discipline_short || "No team",
      isLeaveRequest: true,
      isSupabaseRow: true,
    }));
  });
}

async function loadFlowMateCalendarRows() {
  const [workRows, leaveRows] = await Promise.all([
    loadFlowMateListRows(),
    loadFlowMateLeaveRows(),
  ]);
  return [...workRows, ...leaveRows];
}

async function loadFlowMateTeamScheduleRows() {
  if (!window.flowmateSupabase) throw new Error("Supabase client is not ready.");
  const { data, error } = await window.flowmateSupabase
    .from("flowmate_team_schedule_v")
    .select("work_item_id,display_id,title,status,priority,effort_point,owner_member_id,first_draft_date,launch_date,first_assigned_at,actual_started_at,suggested_start_date,asset_type,asset_subtype")
    .order("first_draft_date", { ascending: true });
  if (error && ["42P01", "PGRST205"].includes(error.code)) return loadFlowMateCalendarRows();
  if (error) throw error;
  const leaveRows = await loadFlowMateLeaveRows();
  const workRows = (data || []).map(row => ({
    workItemId: row.work_item_id,
    id: row.display_id,
    type: "creative",
    title: row.title,
    status: row.status,
    priority: row.priority,
    effort: Number(row.effort_point || 0),
    assignee: row.owner_member_id,
    dueDate: row.first_draft_date,
    launchDate: row.launch_date,
    assignedAt: row.first_assigned_at,
    startedAt: row.actual_started_at,
    suggestedStartDate: row.suggested_start_date,
    assetType: flowmateToKebab(row.asset_type),
    subtype: row.asset_subtype || "",
    isSupabaseRow: true,
  }));
  return [...workRows, ...leaveRows];
}

async function loadFlowMateCapacityAllocationRows(startDate, endDate) {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }

  let query = window.flowmateSupabase
    .from("flowmate_capacity_allocations")
    .select("work_item_id,team_member_id,bucket_date,bucket_half,capacity_point")
    .order("bucket_date", { ascending: true })
    .order("bucket_half", { ascending: true });

  if (/^\d{4}-\d{2}-\d{2}$/.test(startDate || "")) {
    query = query.gte("bucket_date", startDate);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(endDate || "")) {
    query = query.lte("bucket_date", endDate);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((allocation) => ({
    workItemId: allocation.work_item_id,
    assignee: allocation.team_member_id,
    bucketDate: allocation.bucket_date,
    bucketHalf: allocation.bucket_half === "pm" ? "pm" : "am",
    capacityPoint: Number(allocation.capacity_point || 0),
  }));
}

async function loadFlowMateNonWorkingDays(startDate, endDate) {
  if (!window.flowmateSupabase) throw new Error("Supabase client is not ready.");
  let query = window.flowmateSupabase
    .from("flowmate_non_working_days")
    .select("day,name,scope,active")
    .eq("active", true)
    .order("day", { ascending: true });
  if (/^\d{4}-\d{2}-\d{2}$/.test(startDate || "")) query = query.gte("day", startDate);
  if (/^\d{4}-\d{2}-\d{2}$/.test(endDate || "")) query = query.lte("day", endDate);
  const { data, error } = await query;
  if (error && ["42P01", "PGRST205"].includes(error.code)) return [];
  if (error) throw error;
  return (data || []).map(row => ({ date: row.day, name: row.name, scope: row.scope, active: row.active !== false }));
}

async function loadFlowMateCapacityAllocationsForWorkItem(workItemId) {
  if (!window.flowmateSupabase) throw new Error("Supabase client is not ready.");
  if (!workItemId) return [];
  const { data, error } = await window.flowmateSupabase
    .from("flowmate_capacity_allocations")
    .select("work_item_id,team_member_id,bucket_date,bucket_half,capacity_point")
    .eq("work_item_id", workItemId)
    .order("bucket_date", { ascending: true })
    .order("bucket_half", { ascending: true });
  if (error) throw error;
  return (data || []).map((allocation) => ({
    workItemId: allocation.work_item_id,
    assignee: allocation.team_member_id,
    bucketDate: allocation.bucket_date,
    bucketHalf: allocation.bucket_half === "pm" ? "pm" : "am",
    capacityPoint: Number(allocation.capacity_point || 0),
  }));
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

async function loadFlowMateActiveCreativeMembers() {
  if (!window.flowmateSupabase) throw new Error("Supabase client is not ready.");
  const { data, error } = await window.flowmateSupabase
    .from("team_members")
    .select("id,user_id,member_code,display_name,initials,color,discipline,discipline_short,active,availability,capacity_per_day,capacity_override_per_day,wip_limit")
    .eq("active", true)
    .not("user_id", "is", null)
    .order("display_name", { ascending: true });
  if (error) throw error;
  syncFlowMateMembers(data || []);
  return (data || [])
    .map(normalizeFlowMateMember)
    .filter((member) => window.isFlowMateGdVeMember ? window.isFlowMateGdVeMember(member) : /gd\/?ve/i.test(member.discipline || ""));
}

window.loadFlowMateListRows = loadFlowMateListRows;
window.invalidateFlowMateListRowsCache = invalidateFlowMateListRowsCache;
window.loadFlowMateBoardLane = loadFlowMateBoardLane;
window.loadFlowMateBoardSummary = loadFlowMateBoardSummary;
window.loadFlowMateDeliveredHistory = loadFlowMateDeliveredHistory;
window.loadFlowMateKpiRows = loadFlowMateKpiRows;
window.loadFlowMateWorkItemById = loadFlowMateWorkItemById;
window.loadFlowMateLeaveRows = loadFlowMateLeaveRows;
window.loadFlowMateCalendarRows = loadFlowMateCalendarRows;
window.loadFlowMateTeamScheduleRows = loadFlowMateTeamScheduleRows;
window.loadFlowMateCapacityAllocationRows = loadFlowMateCapacityAllocationRows;
window.loadFlowMateCapacityAllocationsForWorkItem = loadFlowMateCapacityAllocationsForWorkItem;
window.loadFlowMateNonWorkingDays = loadFlowMateNonWorkingDays;
window.loadFlowMateAssignees = loadFlowMateAssignees;
window.loadFlowMateActiveCreativeMembers = loadFlowMateActiveCreativeMembers;
window.loadFlowMateMentionUsers = loadFlowMateMentionUsers;
window.parseFlowMateAssignmentWarnings = parseFlowMateAssignmentWarnings;
window.startFlowMateRealtime = startFlowMateRealtime;
window.stopFlowMateRealtime = stopFlowMateRealtime;
window.attachFlowMateLiveRefresh = attachFlowMateLiveRefresh;

async function loadFlowMateRequesterTeams() {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }
  const accessibleKeys = window.getFlowMateAccessibleTeamKeys
    ? window.getFlowMateAccessibleTeamKeys()
    : [];
  if (accessibleKeys.length) {
    const labelsByKey = {
      gdve: "GD/VE",
      ops: "Operations",
      mkt: "Marketing",
      esport: "Esport",
    };
    return accessibleKeys.map((key) => labelsByKey[key]).filter(Boolean);
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
