// FlowMate - Screens part C: Workload, KPI, Team Settings
const { useState: useStateC, useEffect: useEffectC } = React;

function exportFlowMateCsvC(filename, columns, rows) {
  const headerLabels = columns.map(column => column.label);
  const dataRows = rows.map(row => columns.map(column => {
    const value = typeof column.value === "function" ? column.value(row) : row[column.value];
    return value == null ? "" : value;
  }));
  window.flowmateDownloadCsv(filename, headerLabels, dataRows);
}

function flowMateMonthOptionsC() {
  if (window.getFlowMateMonthOptions) return window.getFlowMateMonthOptions();
  return Array.from({ length: 24 }, (_, index) => {
    const year = 2026 + Math.floor(index / 12);
    const month = (index % 12) + 1;
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
    return { key, label };
  });
}

function flowMateDefaultExportMonthC() {
  if (window.getFlowMateDefaultExportMonth) return window.getFlowMateDefaultExportMonth();
  const now = new Date();
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return key >= "2026-01" && key <= "2027-12" ? key : "2026-01";
}

function flowMateMonthLabelC(monthKey) {
  if (window.getFlowMateMonthLabel) return window.getFlowMateMonthLabel(monthKey);
  const option = flowMateMonthOptionsC().find(item => item.key === monthKey);
  return option ? option.label : monthKey;
}

function flowMateFilterRowsByMonthC(rows, monthKey, fields) {
  if (window.filterFlowMateRowsByMonth) return window.filterFlowMateRowsByMonth(rows, monthKey, fields);
  return (rows || []).filter(row => {
    const fieldList = fields && fields.length ? fields : ["calendarDate", "dueDate"];
    const rawDate = row && fieldList.map(field => row[field]).find(Boolean);
    return rawDate && String(rawDate).slice(0, 7) === monthKey;
  });
}

function flowMateRowsMonthOptionsC(rows, fields) {
  const monthKeys = new Set();
  const fieldList = fields && fields.length ? fields : ["calendarDate", "dueDate", "launchDate"];
  (rows || []).forEach(row => {
    fieldList.forEach(field => {
      const value = row && row[field];
      if (value && /^\d{4}-\d{2}/.test(String(value))) {
        monthKeys.add(String(value).slice(0, 7));
      }
    });
  });
  return Array.from(monthKeys)
    .sort()
    .map(key => ({ key, label: flowMateMonthLabelC(key) }));
}

function flowMateWorkingDaysInMonthC(monthKey) {
  const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return 0;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  let workingDays = 0;
  for (let day = 1; day <= lastDay; day += 1) {
    const dow = new Date(Date.UTC(year, monthIndex, day)).getUTCDay();
    if (dow >= 1 && dow <= 5) workingDays += 1;
  }
  return workingDays;
}

function flowMateWorkloadMonthOptionsC(rows) {
  const monthKeys = new Set();
  (rows || []).forEach(row => {
    [
      ...((row.allItems || row.items || [])),
      ...((row.requestedItems || [])),
    ].forEach(item => {
      ["calendarDate", "dueDate", "launchDate"].forEach(field => {
        const value = item && item[field];
        if (value && /^\d{4}-\d{2}/.test(String(value))) {
          monthKeys.add(String(value).slice(0, 7));
        }
      });
    });
  });
  return Array.from(monthKeys)
    .sort()
    .map(key => ({ key, label: flowMateMonthLabelC(key) }));
}

const FLOWMATE_PLANNING_CHANNELS_C = ["Facebook", "Instagram", "TikTok", "YouTube", "Website", "In-game", "LINE", "Other"];

function normalizeFlowMatePlanningChannelC(value) {
  const raw = String(value || "").trim();
  const lower = raw.toLowerCase();
  const compact = lower.replace(/\s+/g, "");
  if (!raw) return "Other";
  if (["facebook", "fb", "meta facebook"].includes(lower)) return "Facebook";
  if (["instagram", "ig", "insta", "reels", "instagram reels"].includes(lower)) return "Instagram";
  if (["tiktok", "tik-tok"].includes(compact)) return "TikTok";
  if (["youtube", "yt", "youtube shorts", "shorts"].includes(lower)) return "YouTube";
  if (["website", "web", "landing page", "microsite"].includes(lower)) return "Website";
  if (["in-game", "ingame", "in game", "game", "in-app", "in app"].includes(lower)) return "In-game";
  if (["line", "line oa", "line official", "line official account"].includes(lower)) return "LINE";
  return "Other";
}

function flowMateDateLabelPlanningC(dateValue) {
  if (!dateValue) return "";
  const date = new Date(`${String(dateValue).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function flowMateDateFullLabelPlanningC(dateValue) {
  if (!dateValue) return "";
  const date = new Date(`${String(dateValue).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getFlowMatePlanningChannelsC(row) {
  if (!row) return ["Other"];
  const source = Array.isArray(row.normalizedChannels)
    ? row.normalizedChannels
    : Array.isArray(row.normalized_channels)
      ? row.normalized_channels
      : Array.isArray(row.channels)
        ? row.channels
        : Array.isArray(row.platforms)
          ? row.platforms
          : Array.isArray(row.raw_platforms)
            ? row.raw_platforms
            : String(row.channel || row.platform || "").split(",");
  const normalized = source
    .map(normalizeFlowMatePlanningChannelC)
    .filter(Boolean);
  const unique = Array.from(new Set(normalized));
  return unique.length ? unique : ["Other"];
}

function getFlowMatePlanningOwnerLabelC(row) {
  if (!row) return "Unassigned";
  if (row.ownerName) return row.ownerName;
  if (row.final_owner_name) return row.final_owner_name;
  if (row.assignee && window.MEMBERS_BY_ID && window.MEMBERS_BY_ID[row.assignee]) return window.MEMBERS_BY_ID[row.assignee].name;
  if (row.assigneeOtherName) return row.assigneeOtherName;
  if (row.assignee_other_name) return row.assignee_other_name;
  return "Unassigned";
}

function getFlowMatePlanningTypeSkillC(row) {
  if (!row) return "";
  const subtype = row.subtype || row.asset_subtype || "";
  if (subtype && typeof getFlowMateCreativeTypeLabel === "function") return getFlowMateCreativeTypeLabel(subtype);
  if (subtype) return ASSET_LABEL[subtype] || subtype;
  return ASSET_LABEL[row.assetType || row.asset_type] || row.assetType || row.asset_type || "";
}

function deriveFlowMatePlanningReadinessC(row, today = new Date()) {
  if (!row) return "Planned";
  if (row.planningReadiness || row.planning_readiness) return row.planningReadiness || row.planning_readiness;
  const status = String(row.status || "").toLowerCase();
  const planningDate = row.planningDate || row.planning_date || row.publishDate || row.publish_date || row.launchDate || row.launch_date || "";
  if (status === "blocked") return "Blocked";
  if (status === "need_brief") return "Need Brief";
  if (status === "cancelled") return "Cancelled";
  if (status === "delivered") {
    const dateKey = String(planningDate).slice(0, 10);
    const todayKey = today.toISOString().slice(0, 10);
    return dateKey && dateKey <= todayKey ? "Published" : "Ready";
  }
  if (planningDate) {
    const [y, m, d] = String(planningDate).slice(0, 10).split("-").map(Number);
    const planUtc = Date.UTC(y, (m || 1) - 1, d || 1);
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const days = Math.round((planUtc - todayUtc) / 86400000);
    if (days <= 7) return "At Risk";
  }
  if (status === "review") return "In Review";
  if (status === "assigned" || status === "in_progress") return "In Production";
  return "Planned";
}

function mapFlowMatePlanningViewRowC(item) {
  const rawPlatforms = item.raw_platforms || [];
  const normalizedChannels = getFlowMatePlanningChannelsC({
    normalizedChannels: item.normalized_channels,
    raw_platforms: rawPlatforms,
  });
  const planningDate = item.planning_date || item.publish_date || item.launch_date || "";
  return {
    id: item.display_id || item.id,
    workItemId: item.id,
    type: "creative",
    title: item.title || "",
    status: item.status || "",
    priority: item.priority || "normal",
    dueDate: item.first_draft_date || "",
    dueLabel: flowMateDateLabelPlanningC(item.first_draft_date),
    dueFullLabel: flowMateDateFullLabelPlanningC(item.first_draft_date),
    launchDate: item.launch_date || "",
    launchLabel: flowMateDateLabelPlanningC(item.launch_date),
    launchFullLabel: flowMateDateFullLabelPlanningC(item.launch_date),
    publishDate: item.publish_date || "",
    publishLabel: flowMateDateLabelPlanningC(item.publish_date),
    publishFullLabel: flowMateDateFullLabelPlanningC(item.publish_date),
    planningDate,
    planningLabel: flowMateDateLabelPlanningC(planningDate),
    planningFullLabel: flowMateDateFullLabelPlanningC(planningDate),
    campaign: item.campaign_name || "",
    requesterUserId: item.requester_user_id || "",
    requesterTeam: item.requester_team || "No team",
    assigneeUserId: item.assignee_user_id || "",
    assignee: item.final_owner_member_id || "",
    ownerName: item.final_owner_name || "",
    assigneeOtherName: item.assignee_other_name || "",
    assetType: item.asset_type || "",
    subtype: item.asset_subtype || "",
    assetCount: item.asset_count || 1,
    platforms: rawPlatforms,
    channel: normalizedChannels.join(", "),
    normalizedChannels,
    planningReadiness: item.planning_readiness || deriveFlowMatePlanningReadinessC({ status: item.status, planningDate }),
    comments: [],
    links: [],
    watchers: [],
    checklistItems: [],
    aiTags: [],
    isSupabaseRow: true,
  };
}

async function loadFlowMatePlanningRowsC() {
  if (!window.flowmateSupabase && !window.loadFlowMateListRows) {
    throw new Error("Planning data loader is not ready.");
  }

  if (window.flowmateSupabase) {
    try {
      const result = await window.flowmateSupabase
        .from("planning_work_items_v")
        .select("*")
        .order("planning_date", { ascending: true });
      if (!result.error) {
        return (result.data || []).map(mapFlowMatePlanningViewRowC);
      }
      console.warn("[FlowMate Planning] planning_work_items_v unavailable; using live list rows:", result.error.message);
    } catch (error) {
      console.warn("[FlowMate Planning] planning_work_items_v query failed; using live list rows:", error && error.message);
    }
  }

  if (!window.loadFlowMateListRows) {
    throw new Error("Planning view is unavailable and live list loader is not ready.");
  }
  const rows = await window.loadFlowMateListRows();
  return (rows || [])
    .filter(row => row && row.type === "creative" && !row.archivedAt)
    .map(row => ({
      ...row,
      planningDate: row.planningDate || row.publishDate || row.launchDate || "",
      planningLabel: row.planningLabel || flowMateDateLabelPlanningC(row.publishDate || row.launchDate),
      planningFullLabel: row.planningFullLabel || flowMateDateFullLabelPlanningC(row.publishDate || row.launchDate),
      normalizedChannels: getFlowMatePlanningChannelsC(row),
      planningReadiness: deriveFlowMatePlanningReadinessC(row),
    }));
}

function filterFlowMatePlanningRowsC(rows, filters) {
  const activeFilters = filters || {};
  return (rows || []).filter(row => {
    if (!row || row.type !== "creative" || row.archivedAt) return false;
    if (activeFilters.month && activeFilters.month !== "all") {
      const planningDate = row.planningDate || row.publishDate || row.launchDate || "";
      if (!planningDate || String(planningDate).slice(0, 7) !== activeFilters.month) return false;
    }
    if (activeFilters.campaign && activeFilters.campaign !== "all" && getFlowMatePlanningCampaignNameC(row) !== activeFilters.campaign) return false;
    if (activeFilters.channel && activeFilters.channel !== "all" && !getFlowMatePlanningChannelsC(row).includes(activeFilters.channel)) return false;
    if (activeFilters.status && activeFilters.status !== "all" && row.status !== activeFilters.status) return false;
    if (activeFilters.requesterTeam && activeFilters.requesterTeam !== "all" && (row.requesterTeam || "No team") !== activeFilters.requesterTeam) return false;
    if (activeFilters.priority && activeFilters.priority !== "all" && row.priority !== activeFilters.priority) return false;
    if (activeFilters.typeSkill && activeFilters.typeSkill !== "all") {
      const typeSkill = row.subtype || row.assetType || "";
      if (typeSkill !== activeFilters.typeSkill) return false;
    }
    return true;
  });
}

function groupFlowMatePlanningRowsByChannelC(rows) {
  const grouped = Object.fromEntries(FLOWMATE_PLANNING_CHANNELS_C.map(channel => [channel, []]));
  (rows || []).forEach(row => {
    getFlowMatePlanningChannelsC(row).forEach(channel => {
      const key = FLOWMATE_PLANNING_CHANNELS_C.includes(channel) ? channel : "Other";
      grouped[key].push(row);
    });
  });
  return grouped;
}

function flowMatePlanningOptionsC(rows, getter) {
  return Array.from(new Set((rows || []).map(getter).filter(Boolean))).sort();
}

function flowMatePlanningChannelPlacementCountC(grouped) {
  return Object.values(grouped || {}).reduce((sum, rows) => sum + rows.length, 0);
}

function getFlowMatePlanningCampaignNameC(row) {
  return (row && (row.campaign || row.campaign_name)) || "No campaign";
}

function getFlowMatePlanningCalendarDateC(row) {
  if (!row) return "";
  return row.publishDate || row.publish_date || row.launchDate || row.launch_date || row.planningDate || row.planning_date || "";
}

function groupFlowMatePlanningRowsByCampaignC(rows) {
  return (rows || []).reduce((grouped, row) => {
    if (!row || row.type !== "creative" || row.archivedAt) return grouped;
    const campaign = getFlowMatePlanningCampaignNameC(row);
    if (!grouped[campaign]) grouped[campaign] = [];
    grouped[campaign].push(row);
    return grouped;
  }, {});
}

function summarizeFlowMatePlanningCampaignC(rows) {
  const channelNames = new Set();
  const safeRows = (rows || []).filter(row => row && row.type === "creative" && !row.archivedAt);
  safeRows.forEach(row => getFlowMatePlanningChannelsC(row).forEach(channel => channelNames.add(channel)));
  return {
    totalAssets: safeRows.length,
    channelsCovered: channelNames.size,
    readyDelivered: safeRows.filter(row => ["Ready", "Published"].includes(deriveFlowMatePlanningReadinessC(row)) || row.status === "delivered").length,
    atRisk: safeRows.filter(row => deriveFlowMatePlanningReadinessC(row) === "At Risk").length,
    blocked: safeRows.filter(row => deriveFlowMatePlanningReadinessC(row) === "Blocked" || row.status === "blocked").length,
    urgent: safeRows.filter(row => row.priority === "urgent").length,
  };
}

Object.assign(window, {
  getFlowMatePlanningChannelsC,
  getFlowMatePlanningCalendarDateC,
  filterFlowMatePlanningRowsC,
  groupFlowMatePlanningRowsByChannelC,
  groupFlowMatePlanningRowsByCampaignC,
  summarizeFlowMatePlanningCampaignC,
  deriveFlowMatePlanningReadinessC,
});

/* ============================================================
   WORKLOAD VIEW
   ============================================================ */
function WorkloadScreen({ onOpen }) {
  const WORKLOAD_TEAM_FILTERS = ["All", "Operations", "Marketing", "Esport"];
  const localRows = MEMBERS.map(m => {
    const mine = WORK.filter(w => w.assignee === m.id);
    const requestedItems = WORK.filter(w => w.requesterUserId && w.requesterUserId === (m.userId || m.id));
    const openCreative = mine.filter(w => w.type === "creative" && ["assigned","in_progress","review","blocked"].includes(w.status));
    const wip = mine.filter(w => w.status === "in_progress" && w.type === "creative").length;
    const assignedEffort = openCreative.reduce((s, w) => s + (w.effort || 0), 0);
    const effectiveCap = m.availability === "partial" ? (m.capacityOverride || 0) : (m.availability === "leave" ? 0 : m.capacityPerDay);
    // Window of 5 working days
    const capacityWindow = effectiveCap * 5;
    return {
      m,
      statusCounts: window.getFlowMateWorkloadStatusCounts ? window.getFlowMateWorkloadStatusCounts(mine) : { assigned: 0, in_progress: 0, review: 0, blocked: 0, delivered: 0 },
      assignedEffort,
      effectiveCap,
      window: capacityWindow,
      available: Math.max(0, capacityWindow - assignedEffort),
      wip,
      due_soon: mine.filter(w => w.dueDelta != null && w.dueDelta >= 0 && w.dueDelta <= 2 && ["assigned","in_progress","review"].includes(w.status)).length,
      overdue: mine.filter(w => w.overdue).length,
      blocked: mine.filter(w => w.status === "blocked").length,
      review: mine.filter(w => w.status === "review").length,
      quick: mine.filter(w => w.type === "quick" && !["delivered","cancelled"].includes(w.status)).length,
      items: openCreative,
      allItems: mine,
      requestedItems,
    };
  });
  const [rows, setRows] = useStateC(localRows);
  const [queuedEffort, setQueuedEffort] = useStateC(WORK.filter(w => w.status === "queued").reduce((s, w) => s + (w.effort || 0), 0));
  const [loadState, setLoadState] = useStateC({ status: "loading", message: "Loading Supabase data..." });
  const [workloadTab, setWorkloadTab] = useStateC("standard");
  const [teamFilter, setTeamFilter] = useStateC("All");
  const [workloadMonth, setWorkloadMonth] = useStateC(flowMateDefaultExportMonthC());

  useEffectC(() => {
    let alive = true;

    async function loadRows() {
      if (!window.loadFlowMateWorkloadRows) {
        setRows([]);
        setQueuedEffort(0);
        setLoadState({ status: "error", message: "Live data unavailable: Supabase workload loader is not ready." });
        return;
      }

      try {
        const liveRows = await window.loadFlowMateWorkloadRows();
        if (!alive) return;
        setRows(liveRows);
        setQueuedEffort(liveRows.queuedEffort || 0);
        setLoadState({ status: "live", message: "Live Supabase data" });
      } catch (error) {
        if (!alive) return;
        console.error("[FlowMate Workload] Supabase load failed:", error);
        setRows([]);
        setQueuedEffort(0);
        setLoadState({ status: "error", message: `Live data unavailable: ${window.flowmateUserError(error, "Supabase query failed.")}` });
      }
    }

    loadRows();
    const cleanup = window.attachFlowMateLiveRefresh
      ? window.attachFlowMateLiveRefresh(loadRows)
      : () => {};
    return () => { alive = false; cleanup(); };
  }, []);

  const safeRows = (rows || []).filter(r => r && r.m).map(r => ({
    ...r,
    m: {
      ...r.m,
      skills: r.m.skills || [],
      availability: r.m.availability || "available",
      wipLimit: r.m.wipLimit || 0,
    },
    statusCounts: r.statusCounts || { assigned: 0, in_progress: 0, review: 0, blocked: 0, delivered: 0 },
    items: r.items || [],
    allItems: r.allItems || r.items || [],
    requestedItems: r.requestedItems || [],
  }));
  const workloadMonthOptions = flowMateWorkloadMonthOptionsC(safeRows);
  const effectiveWorkloadMonthOptions = workloadMonthOptions.length
    ? workloadMonthOptions
    : [{ key: workloadMonth, label: flowMateMonthLabelC(workloadMonth) }];
  const selectedWorkloadMonth = effectiveWorkloadMonthOptions.some(option => option.key === workloadMonth)
    ? workloadMonth
    : effectiveWorkloadMonthOptions[0].key;
  const selectedMonthWorkingDays = flowMateWorkingDaysInMonthC(selectedWorkloadMonth);
  const monthRows = safeRows.map(r => {
    const monthItems = flowMateFilterRowsByMonthC(r.allItems || r.items || [], selectedWorkloadMonth, ["calendarDate", "dueDate", "launchDate"]);
    const monthRequestedItems = flowMateFilterRowsByMonthC(r.requestedItems || [], selectedWorkloadMonth, ["calendarDate", "dueDate", "launchDate"]);
    const monthOpenCreative = monthItems.filter(item =>
      item.type === "creative" && ["assigned", "in_progress", "review", "blocked"].includes(item.status)
    );
    const assignedEffort = monthOpenCreative.reduce((sum, item) => sum + (item.effort || 0), 0);
    const capacityWindow = r.effectiveCap * selectedMonthWorkingDays;
    const urgentAssigned = monthItems.filter(item => item.priority === "urgent").length;
    const urgentRequested = monthRequestedItems.filter(item => item.priority === "urgent").length;
    return {
      ...r,
      statusCounts: window.getFlowMateWorkloadStatusCounts
        ? window.getFlowMateWorkloadStatusCounts(monthItems)
        : r.statusCounts,
      assignedEffort,
      window: capacityWindow,
      available: Math.max(0, capacityWindow - assignedEffort),
      due_soon: monthItems.filter(item => item.dueDelta != null && item.dueDelta >= 0 && item.dueDelta <= 2 && ["assigned","in_progress","review"].includes(item.status)).length,
      overdue: monthItems.filter(item => item.overdue || (item.dueDelta != null && item.dueDelta < 0)).length,
      blocked: monthItems.filter(item => item.status === "blocked").length,
      review: monthItems.filter(item => item.status === "review").length,
      quick: monthItems.filter(item => item.type === "quick" && !["delivered","cancelled"].includes(item.status)).length,
      urgentAssigned,
      urgentRequested,
      items: monthOpenCreative,
      requestedItems: monthRequestedItems,
    };
  });
  const tabRows = monthRows.filter(r => {
    const isGdVe = window.isFlowMateGdVeMember ? window.isFlowMateGdVeMember(r.m) : false;
    return workloadTab === "gdve" ? isGdVe : !isGdVe;
  });
  const teamFilteredRows = tabRows.filter(r => teamFilter === "All" || r.m.discipline === teamFilter);
  const visibleRows = workloadTab === "gdve" ? tabRows : teamFilteredRows;
  const statusTotals = visibleRows.reduce((totals, r) => {
    totals.assigned += r.statusCounts.assigned || 0;
    totals.in_progress += r.statusCounts.in_progress || 0;
    totals.review += r.statusCounts.review || 0;
    totals.blocked += r.statusCounts.blocked || 0;
    totals.delivered += r.statusCounts.delivered || 0;
    totals.urgentAssigned += r.urgentAssigned || 0;
    totals.urgentRequested += r.urgentRequested || 0;
    return totals;
  }, { assigned: 0, in_progress: 0, review: 0, blocked: 0, delivered: 0, urgentAssigned: 0, urgentRequested: 0 });
  const totals = {
    capacity: visibleRows.reduce((s, r) => s + r.window, 0),
    assigned: visibleRows.reduce((s, r) => s + r.assignedEffort, 0),
    queued: queuedEffort,
    overdue: visibleRows.reduce((s, r) => s + r.overdue, 0),
    urgentAssigned: visibleRows.reduce((s, r) => s + (r.urgentAssigned || 0), 0),
    urgentRequested: visibleRows.reduce((s, r) => s + (r.urgentRequested || 0), 0),
  };
  totals.available = totals.capacity - totals.assigned;

  const [expanded, setExpanded] = useStateC(new Set());
  function toggle(id) {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  }

  function exportWorkloadRows() {
    const exportRows = visibleRows.map(row => {
      const monthItems = flowMateFilterRowsByMonthC(row.allItems || row.items || [], selectedWorkloadMonth, ["calendarDate", "dueDate", "launchDate"]);
      const monthRequestedItems = flowMateFilterRowsByMonthC(row.requestedItems || [], selectedWorkloadMonth, ["calendarDate", "dueDate", "launchDate"]);
      const monthOpenCreative = monthItems.filter(item =>
        item.type === "creative" && ["assigned", "in_progress", "review", "blocked"].includes(item.status)
      );
      const assignedEffort = monthOpenCreative.reduce((sum, item) => sum + (item.effort || 0), 0);
      const urgentAssigned = monthItems.filter(item => item.priority === "urgent").length;
      const urgentRequested = monthRequestedItems.filter(item => item.priority === "urgent").length;
      return {
        ...row,
        exportMonthLabel: flowMateMonthLabelC(selectedWorkloadMonth),
        statusCounts: window.getFlowMateWorkloadStatusCounts
          ? window.getFlowMateWorkloadStatusCounts(monthItems)
          : row.statusCounts,
        assignedEffort,
        available: Math.max(0, row.window - assignedEffort),
        wip: monthItems.filter(item => item.status === "in_progress" && item.type === "creative").length,
        due_soon: monthItems.filter(item => item.dueDelta != null && item.dueDelta >= 0 && item.dueDelta <= 2 && ["assigned","in_progress","review"].includes(item.status)).length,
        overdue: monthItems.filter(item => item.overdue || (item.dueDelta != null && item.dueDelta < 0)).length,
        blocked: monthItems.filter(item => item.status === "blocked").length,
        review: monthItems.filter(item => item.status === "review").length,
        quick: monthItems.filter(item => item.type === "quick" && !["delivered","cancelled"].includes(item.status)).length,
        urgentAssigned,
        urgentRequested,
      };
    });
    exportFlowMateCsvC(
      `flowmate-workload-${selectedWorkloadMonth}-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { label: "Export month", value: "exportMonthLabel" },
        { label: "Member", value: row => row.m.name },
        { label: "Team", value: row => row.m.discipline },
        { label: "Capacity", value: "window" },
        { label: "Assigned effort", value: "assignedEffort" },
        { label: "Available", value: "available" },
        { label: "WIP", value: "wip" },
        { label: "Assigned", value: row => row.statusCounts.assigned || 0 },
        { label: "In progress", value: row => row.statusCounts.in_progress || 0 },
        { label: "Review", value: row => row.statusCounts.review || 0 },
        { label: "Blocked", value: row => row.statusCounts.blocked || 0 },
        { label: "Delivered", value: row => row.statusCounts.delivered || 0 },
        { label: "Urgent assigned", value: "urgentAssigned" },
        { label: "Urgent requested", value: "urgentRequested" },
      ],
      exportRows,
    );
  }

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Workload</h1>
          <div className="page__sub">Per-member effort for {flowMateMonthLabelC(selectedWorkloadMonth)} ({selectedMonthWorkingDays} working days) - {loadState.message}</div>
        </div>
        <div className="page__actions">
          <select
            className="select"
            value={selectedWorkloadMonth}
            onChange={event => setWorkloadMonth(event.target.value)}
            data-testid="flowmate-workload-export-month"
            aria-label="Workload month"
            style={{ width: 132, height: 32, padding: "0 28px 0 10px", fontSize: 13 }}
          >
            {effectiveWorkloadMonthOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
          <button className="btn btn--secondary" onClick={exportWorkloadRows}><Icon name="download" /> Export</button>
        </div>
      </div>

      <div className="filterbar">
        <button className={`chip ${workloadTab === "standard" ? "is-active" : ""}`} onClick={() => setWorkloadTab("standard")}>Workload</button>
        <button className={`chip ${workloadTab === "gdve" ? "is-active" : ""}`} onClick={() => setWorkloadTab("gdve")}>Workload - GD/VE</button>
        {workloadTab === "standard" && (
          <>
            <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>Filter by team</span>
            {WORKLOAD_TEAM_FILTERS.map(team => (
              <button key={team} className={`chip ${teamFilter === team ? "is-active" : ""}`} onClick={() => setTeamFilter(team)}>{team}</button>
            ))}
          </>
        )}
      </div>

      {workloadTab === "standard" ? (
        <>
          <div className="stat-strip" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
            <div className="stat"><div className="stat__num mono">{statusTotals.assigned}</div><div className="stat__lbl">Assigned</div></div>
            <div className="stat stat--info"><div className="stat__num mono">{statusTotals.in_progress}</div><div className="stat__lbl">In progress</div></div>
            <div className="stat"><div className="stat__num mono">{statusTotals.review}</div><div className="stat__lbl">Review</div></div>
            <div className="stat stat--accent"><div className="stat__num mono">{statusTotals.blocked}</div><div className="stat__lbl">Blocked</div></div>
            <div className="stat stat--ok"><div className="stat__num mono">{statusTotals.delivered}</div><div className="stat__lbl">Delivered</div></div>
            <div className="stat stat--warn"><div className="stat__num mono">{statusTotals.urgentAssigned}</div><div className="stat__lbl">Urgent assigned</div></div>
            <div className="stat stat--warn"><div className="stat__num mono">{statusTotals.urgentRequested}</div><div className="stat__lbl">Urgent requested</div></div>
          </div>

          <div className="card card__body--flush">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Assigned</th>
                  <th>In Progress</th>
                  <th>Review</th>
                  <th>Blocked</th>
                  <th>Delivered</th>
                  <th>Urgent assigned</th>
                  <th>Urgent requested</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(r => (
                  <tr key={r.m.id}>
                    <td className="col-name">
                      <span className="row" style={{ gap: 8 }}><Avatar memberId={r.m.id} size="avatar--lg" />
                        <span><div>{r.m.name}</div><div className="muted" style={{ fontSize: 11 }}>{r.m.discipline}</div></span>
                      </span>
                    </td>
                    <td className="mono">{r.statusCounts.assigned}</td>
                    <td className="mono">{r.statusCounts.in_progress}</td>
                    <td className="mono">{r.statusCounts.review}</td>
                    <td className="mono">{r.statusCounts.blocked}</td>
                    <td className="mono">{r.statusCounts.delivered}</td>
                    <td className="mono">{r.urgentAssigned}</td>
                    <td className="mono">{r.urgentRequested}</td>
                  </tr>
                ))}
                {visibleRows.length === 0 && (
                  <tr><td colSpan="8" className="muted">No Non GD/VE workload rows loaded.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="stat-strip" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
            <div className="stat"><div className="stat__num mono">{totals.capacity}</div><div className="stat__lbl">Total capacity (pt)</div><div className="stat__delta">across {visibleRows.length} members - {selectedMonthWorkingDays} working days</div></div>
            <div className="stat stat--info"><div className="stat__num mono">{totals.assigned}</div><div className="stat__lbl">Assigned effort</div></div>
            <div className="stat stat--ok"><div className="stat__num mono">{totals.available}</div><div className="stat__lbl">Available</div></div>
            <div className="stat stat--warn"><div className="stat__num mono">{totals.queued}</div><div className="stat__lbl">Queued effort</div></div>
            <div className="stat stat--accent"><div className="stat__num mono">{totals.overdue}</div><div className="stat__lbl">Overdue</div></div>
            <div className="stat stat--warn"><div className="stat__num mono">{totals.urgentAssigned}</div><div className="stat__lbl">Urgent assigned</div></div>
            <div className="stat stat--warn"><div className="stat__num mono">{totals.urgentRequested}</div><div className="stat__lbl">Urgent requested</div></div>
          </div>

          <div className="card card__body--flush">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 28 }}></th>
              <th>Member</th>
              <th>Skills</th>
              <th>Availability</th>
              <th>Cap / day</th>
              <th>Assigned effort</th>
              <th style={{ width: 200 }}>Load ({selectedMonthWorkingDays}wd)</th>
              <th>WIP</th>
              <th>Due soon</th>
              <th>Overdue</th>
              <th>Blocked</th>
              <th>Review</th>
              <th>Quick</th>
              <th>Urgent</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(r => {
              const pct = r.window > 0 ? Math.min(100, (r.assignedEffort / r.window) * 100) : 0;
              const over = r.assignedEffort > r.window;
              const wipFull = r.wip >= r.m.wipLimit;
              const partialNoOverride = r.m.availability === "partial" && !r.m.capacityOverride;
              const isOpen = expanded.has(r.m.id);
              return (
                <React.Fragment key={r.m.id}>
                  <tr className="workload-row" onClick={() => toggle(r.m.id)}>
                    <td>
                      <button className="iconbtn" onClick={(e) => { e.stopPropagation(); toggle(r.m.id); }}><Icon name="chevron" size={12} style={{ transform: isOpen ? "rotate(90deg)" : "none" }} /></button>
                    </td>
                    <td className="col-name">
                      <span className="row" style={{ gap: 8 }}><Avatar memberId={r.m.id} size="avatar--lg" />
                        <span><div>{r.m.name}</div><div className="muted" style={{ fontSize: 11 }}>{r.m.discipline}</div></span>
                      </span>
                    </td>
                    <td>
                      <span className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                        {(r.m.skills || []).map(s => <span key={s} className="tag">{ASSET_LABEL[s.replace("-backup","")] || s}{s.endsWith("backup") && " (backup)"}</span>)}
                      </span>
                    </td>
                    <td>
                      <span className={`avail avail--${r.m.availability}`}><span className="avail__dot"></span>
                        {r.m.availability === "available" && "Available"}
                        {r.m.availability === "partial" && (r.m.capacityOverride ? `Partial - ${r.m.capacityOverride}/d` : "Partial - no override")}
                        {r.m.availability === "leave" && "On leave"}
                      </span>
                    </td>
                    <td className="mono">{r.effectiveCap}</td>
                    <td className="mono"><span className={over ? "cell-bad" : ""}>{r.assignedEffort}</span> <span className="muted">/ {r.window}</span></td>
                    <td>
                      <div className="meter">
                        <div className={`meter__fill ${over ? "meter__fill--over" : pct > 80 ? "meter__fill--warn" : ""}`} style={{ width: `${pct}%` }}></div>
                      </div>
                      <div className="mono muted" style={{ fontSize: 11, marginTop: 4 }}>{r.available} pt available</div>
                    </td>
                    <td><span className={wipFull ? "cell-bad" : ""}>{r.wip}/{r.m.wipLimit}</span></td>
                    <td><span className={r.due_soon > 0 ? "cell-warn" : "cell-grey"}>{r.due_soon}</span></td>
                    <td><span className={r.overdue > 0 ? "cell-bad" : "cell-grey"}>{r.overdue}</span></td>
                    <td><span className={r.blocked > 0 ? "cell-bad" : "cell-grey"}>{r.blocked}</span></td>
                    <td className="cell-grey">{r.review}</td>
                    <td className="cell-grey">{r.quick}</td>
                    <td><span className={r.urgentAssigned > 0 ? "cell-warn" : "cell-grey"}>{r.urgentAssigned}</span></td>
                    <td>
                      <span className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                        {over && <span className="tag" style={{ background: "var(--garena-red-light-2)", color: "var(--garena-red)" }}>Over cap</span>}
                        {wipFull && <span className="tag" style={{ background: "#FDEFE0", color: "#8A4A12" }}>WIP full</span>}
                        {partialNoOverride && <span className="tag" style={{ background: "#FDEFE0", color: "#8A4A12" }}>No override</span>}
                        {r.overdue > 0 && <span className="tag" style={{ background: "var(--garena-red-light-2)", color: "var(--garena-red)" }}>Overdue</span>}
                      </span>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr style={{ background: "#FCFCFC" }}>
                      <td></td>
                      <td colSpan="14" style={{ padding: "12px 14px" }}>
                        <div className="muted" style={{ fontSize: 11, marginBottom: 8, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>
                          Active creative work - {r.items.length}
                        </div>
                        {r.items.length === 0 ? <div className="muted" style={{ fontSize: 12 }}>No assigned creative work.</div> : (
                          <table className="tbl" style={{ fontSize: 12 }}>
                            <tbody>
                              {r.items.map(w => (
                                <tr key={w.id} onClick={() => {
                                  window.flowmateSelectedWorkItem = w;
                                  onOpen(w.id);
                                }}>
                                  <td className="col-id mono" style={{ width: 80 }}>{w.id}</td>
                                  <td className="col-title">{w.title}</td>
                                  <td><StatusBadge status={w.status} /></td>
                                  <td><PriorityBadge level={w.priority} /></td>
                                  <td><Effort value={w.effort} /></td>
                                  <td><DueBadge delta={w.dueDelta} label={w.dueLabel} status={w.status} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
                {visibleRows.length === 0 && (
                  <tr><td colSpan="15" className="muted">No GD/VE workload rows loaded.</td></tr>
                )}
          </tbody>
        </table>
      </div>
        </>
      )}

      <Source>{loadState.status === "live" ? "Supabase member_workload_v" : "No local fallback data"} - {flowMateMonthLabelC(selectedWorkloadMonth)} - {TODAY}</Source>
    </div>
  );
}

/* ============================================================
   PLANNING - CHANNEL VIEW
   ============================================================ */
function PlanningChannelViewScreen({ onOpen }) {
  const [rows, setRows] = useStateC([]);
  const [loadState, setLoadState] = useStateC({ status: "loading", message: "Loading planning rows..." });
  const [filters, setFilters] = useStateC({
    month: "all",
    campaign: "all",
    channel: "all",
    status: "all",
    requesterTeam: "all",
    priority: "all",
    typeSkill: "all",
  });

  useEffectC(() => {
    let alive = true;
    async function loadRows() {
      try {
        const liveRows = await loadFlowMatePlanningRowsC();
        if (!alive) return;
        setRows(liveRows);
        setLoadState({ status: "live", message: "Live Supabase planning data" });
      } catch (error) {
        if (!alive) return;
        console.error("[FlowMate Planning] Load failed:", error);
        setRows([]);
        setLoadState({ status: "error", message: window.flowmateUserError(error, "Planning data load failed.") });
      }
    }

    loadRows();
    const cleanup = window.attachFlowMateLiveRefresh
      ? window.attachFlowMateLiveRefresh(loadRows)
      : () => {};
    return () => { alive = false; cleanup(); };
  }, []);

  function setFilter(key, value) {
    setFilters(current => ({ ...current, [key]: value }));
  }

  function clearFilters() {
    setFilters({
      month: "all",
      campaign: "all",
      channel: "all",
      status: "all",
      requesterTeam: "all",
      priority: "all",
      typeSkill: "all",
    });
  }

  function openPlanningCard(row) {
    if (!row || !row.id) return;
    window.flowmateSelectedWorkItem = row;
    onOpen(row.id);
  }

  const activeRows = (rows || []).filter(row => row && row.type === "creative" && !row.archivedAt);
  const filteredRows = filterFlowMatePlanningRowsC(activeRows, filters);
  const groupedRows = groupFlowMatePlanningRowsByChannelC(filteredRows);
  const channelSections = filters.channel === "all" ? FLOWMATE_PLANNING_CHANNELS_C : [filters.channel];
  const monthOptions = flowMateRowsMonthOptionsC(activeRows, ["planningDate", "publishDate", "launchDate"]);
  const campaignOptions = flowMatePlanningOptionsC(activeRows, row => row.campaign || "No campaign");
  const statusOptions = flowMatePlanningOptionsC(activeRows, row => row.status);
  const requesterTeamOptions = flowMatePlanningOptionsC(activeRows, row => row.requesterTeam || "No team");
  const priorityOptions = flowMatePlanningOptionsC(activeRows, row => row.priority);
  const typeSkillOptions = flowMatePlanningOptionsC(activeRows, row => row.subtype || row.assetType);
  const channelPlacementCount = flowMatePlanningChannelPlacementCountC(groupedRows);
  const atRiskCount = filteredRows.filter(row => deriveFlowMatePlanningReadinessC(row) === "At Risk").length;
  const blockedCount = filteredRows.filter(row => deriveFlowMatePlanningReadinessC(row) === "Blocked").length;
  const readyCount = filteredRows.filter(row => ["Ready", "Published"].includes(deriveFlowMatePlanningReadinessC(row))).length;

  function planningSelect(label, value, key, options, renderLabel) {
    return (
      <label className="planning-filter">
        <span>{label}</span>
        <select className="select" value={value} onChange={event => setFilter(key, event.target.value)}>
          <option value="all">All {label.toLowerCase()}</option>
          {options.map(option => (
            <option key={option.key || option} value={option.key || option}>
              {renderLabel ? renderLabel(option) : (option.label || option)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  function renderPlanningCard(row, channel) {
    const assignee = row.assignee || "";
    const owner = getFlowMatePlanningOwnerLabelC({ ...row, assignee });
    const typeSkill = getFlowMatePlanningTypeSkillC(row) || "-";
    const planningReadiness = deriveFlowMatePlanningReadinessC(row);
    const planningDateLabel = row.planningFullLabel || row.planningLabel || row.planningDate || row.publishFullLabel || row.publishLabel || row.launchFullLabel || row.launchLabel || "-";
    const draftLabel = row.dueFullLabel || row.dueLabel || row.dueDate || "-";

    return (
      <button key={`${channel}-${row.id}`} type="button" className="planning-card" onClick={() => openPlanningCard(row)}>
        <div className="planning-card__top">
          <span className="mono planning-card__id">{row.id}</span>
          <span className={`planning-readiness planning-readiness--${String(planningReadiness).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{planningReadiness}</span>
        </div>
        <div className="planning-card__title">{row.title || "Untitled request"}</div>
        <div className="planning-card__meta">
          <span>Campaign</span><strong>{row.campaign || "No campaign"}</strong>
          <span>Channel</span><strong>{channel}</strong>
          <span>Publish / launch</span><strong>{planningDateLabel}</strong>
          <span>1st Draft</span><strong>{draftLabel}</strong>
          <span>Status</span><strong>{STATUS_LABEL[row.status] || row.status || "-"}</strong>
          <span>Priority</span><strong>{row.priority || "-"}</strong>
          <span>Owner</span><strong>{owner}</strong>
          <span>Type / Skill</span><strong>{typeSkill}</strong>
        </div>
      </button>
    );
  }

  return (
    <div className="page planning-page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Channel View</h1>
          <div className="page__sub">Planning view grouped by normalized publishing channel - {loadState.message}</div>
        </div>
        <div className="page__actions">
          <button className="btn btn--secondary" onClick={clearFilters}>Clear filters</button>
        </div>
      </div>

      <div className="stat-strip planning-metrics" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="stat"><div className="stat__num mono">{filteredRows.length}</div><div className="stat__lbl">Creative requests</div><div className="stat__delta">counted once</div></div>
        <div className="stat stat--info"><div className="stat__num mono">{channelPlacementCount}</div><div className="stat__lbl">Channel placements</div><div className="stat__delta">multi-channel duplicated</div></div>
        <div className="stat stat--warn"><div className="stat__num mono">{atRiskCount}</div><div className="stat__lbl">At risk</div></div>
        <div className="stat stat--accent"><div className="stat__num mono">{blockedCount}</div><div className="stat__lbl">Blocked</div><div className="stat__delta">{readyCount} ready/published</div></div>
      </div>

      <div className="filterbar planning-filterbar">
        {planningSelect("Month", filters.month, "month", monthOptions)}
        {planningSelect("Campaign", filters.campaign, "campaign", campaignOptions)}
        {planningSelect("Channel", filters.channel, "channel", FLOWMATE_PLANNING_CHANNELS_C)}
        {planningSelect("Status", filters.status, "status", statusOptions, option => STATUS_LABEL[option] || option)}
        {planningSelect("Requester team", filters.requesterTeam, "requesterTeam", requesterTeamOptions)}
        {planningSelect("Priority", filters.priority, "priority", priorityOptions)}
        {planningSelect("Type / Skill", filters.typeSkill, "typeSkill", typeSkillOptions, option => getFlowMatePlanningTypeSkillC({ subtype: option, assetType: option }) || option)}
      </div>

      {loadState.status === "error" && (
        <div className="reason-box reason-box--need" style={{ marginBottom: 12 }}>{loadState.message}</div>
      )}

      <div className="planning-channel-board">
        {channelSections.map(channel => {
          const channelRows = groupedRows[channel] || [];
          return (
            <section key={channel} className="planning-channel">
              <div className="planning-channel__head">
                <div>
                  <h2>{channel}</h2>
                  <div className="muted">{channelRows.length} placement{channelRows.length === 1 ? "" : "s"}</div>
                </div>
              </div>
              <div className="planning-channel__body">
                {channelRows.map(row => renderPlanningCard(row, channel))}
                {channelRows.length === 0 && (
                  <div className="planning-channel__empty">No active Creative Requests for this channel.</div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {activeRows.length === 0 && loadState.status !== "loading" && loadState.status !== "error" && (
        <div className="team-settings-empty" style={{ marginTop: 12 }}>No active Creative Requests loaded for Planning.</div>
      )}
      {activeRows.length > 0 && filteredRows.length === 0 && (
        <div className="team-settings-empty" style={{ marginTop: 12 }}>No active Creative Requests match the selected filters.</div>
      )}

      <Source>{loadState.status === "live" ? "Supabase planning_work_items_v or live list rows" : "No static fallback rows"} - publish date with launch date fallback</Source>
    </div>
  );
}

/* ============================================================
   PLANNING - CAMPAIGN VIEW
   ============================================================ */
function PlanningCampaignViewScreen({ onOpen }) {
  const [rows, setRows] = useStateC([]);
  const [loadState, setLoadState] = useStateC({ status: "loading", message: "Loading planning rows..." });
  const [filters, setFilters] = useStateC({ month: "all", campaign: "all", status: "all" });

  useEffectC(() => {
    let alive = true;
    async function loadRows() {
      try {
        const liveRows = await loadFlowMatePlanningRowsC();
        if (!alive) return;
        setRows(liveRows);
        setLoadState({ status: "live", message: "Live Supabase planning data" });
      } catch (error) {
        if (!alive) return;
        console.error("[FlowMate Campaign Planning] Load failed:", error);
        setRows([]);
        setLoadState({ status: "error", message: window.flowmateUserError(error, "Planning data load failed.") });
      }
    }

    loadRows();
    const cleanup = window.attachFlowMateLiveRefresh
      ? window.attachFlowMateLiveRefresh(loadRows)
      : () => {};
    return () => { alive = false; cleanup(); };
  }, []);

  function setFilter(key, value) {
    setFilters(current => ({ ...current, [key]: value }));
  }

  function clearFilters() {
    setFilters({ month: "all", campaign: "all", status: "all" });
  }

  function openPlanningAsset(row) {
    if (!row || !row.id) return;
    window.flowmateSelectedWorkItem = row;
    onOpen(row.id);
  }

  const activeRows = (rows || []).filter(row => row && row.type === "creative" && !row.archivedAt);
  const filteredRows = filterFlowMatePlanningRowsC(activeRows, {
    month: filters.month,
    campaign: filters.campaign,
    channel: "all",
    status: filters.status,
  });
  const groupedRows = groupFlowMatePlanningRowsByCampaignC(filteredRows);
  const campaignNames = Object.keys(groupedRows).sort((a, b) => a.localeCompare(b));
  const monthOptions = flowMateRowsMonthOptionsC(activeRows, ["planningDate", "publishDate", "launchDate"]);
  const campaignOptions = flowMatePlanningOptionsC(activeRows, row => getFlowMatePlanningCampaignNameC(row));
  const statusOptions = flowMatePlanningOptionsC(activeRows, row => row.status);
  const totalSummary = summarizeFlowMatePlanningCampaignC(filteredRows);

  function planningSelect(label, value, key, options, renderLabel) {
    return (
      <label className="planning-filter">
        <span>{label}</span>
        <select className="select" value={value} onChange={event => setFilter(key, event.target.value)}>
          <option value="all">All {label.toLowerCase()}</option>
          {options.map(option => (
            <option key={option.key || option} value={option.key || option}>
              {renderLabel ? renderLabel(option) : (option.label || option)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  function renderCampaignAsset(row) {
    const readiness = deriveFlowMatePlanningReadinessC(row);
    const planningDateLabel = row.planningFullLabel || row.planningLabel || row.planningDate || row.publishFullLabel || row.publishLabel || row.launchFullLabel || row.launchLabel || "-";
    return (
      <button key={row.id} type="button" className="planning-asset-row" onClick={() => openPlanningAsset(row)}>
        <span className="mono planning-card__id">{row.id}</span>
        <span className="planning-asset-row__title">{row.title || "Untitled request"}</span>
        <span>{getFlowMatePlanningChannelsC(row).join(", ")}</span>
        <span>{planningDateLabel}</span>
        <span>{STATUS_LABEL[row.status] || row.status || "-"}</span>
        <span>{getFlowMatePlanningOwnerLabelC(row)}</span>
        <span>{row.priority || "-"}</span>
        <span>{getFlowMatePlanningTypeSkillC(row) || "-"}</span>
        <span className={`planning-readiness planning-readiness--${String(readiness).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{readiness}</span>
      </button>
    );
  }

  return (
    <div className="page planning-page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Campaign View</h1>
          <div className="page__sub">Planning view grouped by campaign - {loadState.message}</div>
        </div>
        <div className="page__actions">
          <button className="btn btn--secondary" onClick={clearFilters}>Clear filters</button>
        </div>
      </div>

      <div className="stat-strip planning-metrics" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
        <div className="stat"><div className="stat__num mono">{totalSummary.totalAssets}</div><div className="stat__lbl">Assets</div></div>
        <div className="stat stat--info"><div className="stat__num mono">{campaignNames.length}</div><div className="stat__lbl">Campaigns</div></div>
        <div className="stat"><div className="stat__num mono">{totalSummary.channelsCovered}</div><div className="stat__lbl">Channels</div></div>
        <div className="stat stat--accent"><div className="stat__num mono">{totalSummary.readyDelivered}</div><div className="stat__lbl">Ready / delivered</div></div>
        <div className="stat stat--warn"><div className="stat__num mono">{totalSummary.atRisk}</div><div className="stat__lbl">At risk</div></div>
        <div className="stat stat--accent"><div className="stat__num mono">{totalSummary.blocked}</div><div className="stat__lbl">Blocked</div><div className="stat__delta">{totalSummary.urgent} urgent</div></div>
      </div>

      <div className="filterbar planning-filterbar">
        {planningSelect("Month", filters.month, "month", monthOptions)}
        {planningSelect("Campaign", filters.campaign, "campaign", campaignOptions)}
        {planningSelect("Status", filters.status, "status", statusOptions, option => STATUS_LABEL[option] || option)}
      </div>

      {loadState.status === "error" && (
        <div className="reason-box reason-box--need" style={{ marginBottom: 12 }}>{loadState.message}</div>
      )}

      <div className="planning-campaign-list">
        {campaignNames.map(campaign => {
          const campaignRows = groupedRows[campaign] || [];
          const summary = summarizeFlowMatePlanningCampaignC(campaignRows);
          return (
            <section key={campaign} className="planning-campaign">
              <div className="planning-campaign__head">
                <div>
                  <h2>{campaign}</h2>
                  <div className="muted">{summary.totalAssets} asset{summary.totalAssets === 1 ? "" : "s"} - {summary.channelsCovered} channel{summary.channelsCovered === 1 ? "" : "s"}</div>
                </div>
                <div className="planning-campaign__summary">
                  <span><strong>{summary.readyDelivered}</strong> ready</span>
                  <span><strong>{summary.atRisk}</strong> at risk</span>
                  <span><strong>{summary.blocked}</strong> blocked</span>
                  <span><strong>{summary.urgent}</strong> urgent</span>
                </div>
              </div>
              <div className="planning-asset-header">
                <span>ID</span><span>Asset</span><span>Channel</span><span>Date</span><span>Status</span><span>Owner</span><span>Priority</span><span>Type / Skill</span><span>Readiness</span>
              </div>
              <div className="planning-asset-list">
                {campaignRows.map(renderCampaignAsset)}
              </div>
            </section>
          );
        })}
      </div>

      {activeRows.length === 0 && loadState.status !== "loading" && loadState.status !== "error" && (
        <div className="team-settings-empty" style={{ marginTop: 12 }}>No active Creative Requests loaded for Planning.</div>
      )}
      {activeRows.length > 0 && filteredRows.length === 0 && (
        <div className="team-settings-empty" style={{ marginTop: 12 }}>No active Creative Requests match the selected filters.</div>
      )}

      <Source>{loadState.status === "live" ? "Supabase planning_work_items_v or live list rows" : "No static fallback rows"} - campaign asset counts exclude archived rows</Source>
    </div>
  );
}

/* ============================================================
   PLANNING - CONTENT CALENDAR
   ============================================================ */
function PlanningContentCalendarScreen({ onOpen }) {
  const todayKey = calendarUtcKeyC(new Date());
  const [rows, setRows] = useStateC([]);
  const [loadState, setLoadState] = useStateC({ status: "loading", message: "Loading planning rows..." });
  const [monthKey, setMonthKey] = useStateC(String(todayKey).slice(0, 7));
  const [filters, setFilters] = useStateC({ month: String(todayKey).slice(0, 7), campaign: "all", channel: "all", status: "all" });

  useEffectC(() => {
    let alive = true;
    async function loadRows() {
      try {
        const liveRows = await loadFlowMatePlanningRowsC();
        if (!alive) return;
        setRows(liveRows);
        setLoadState({ status: "live", message: "Live Supabase planning data" });
      } catch (error) {
        if (!alive) return;
        console.error("[FlowMate Content Calendar] Load failed:", error);
        setRows([]);
        setLoadState({ status: "error", message: window.flowmateUserError(error, "Planning data load failed.") });
      }
    }

    loadRows();
    const cleanup = window.attachFlowMateLiveRefresh
      ? window.attachFlowMateLiveRefresh(loadRows)
      : () => {};
    return () => { alive = false; cleanup(); };
  }, []);

  function setFilter(key, value) {
    setFilters(current => ({ ...current, [key]: value }));
    if (key === "month" && value !== "all") setMonthKey(value);
  }

  function clearFilters() {
    const currentMonth = String(todayKey).slice(0, 7);
    setMonthKey(currentMonth);
    setFilters({ month: currentMonth, campaign: "all", channel: "all", status: "all" });
  }

  function shiftPlanningMonth(delta) {
    const next = calendarShiftMonthC(`${monthKey}-01`, delta).slice(0, 7);
    setMonthKey(next);
    setFilters(current => ({ ...current, month: next }));
  }

  function openPlanningCalendarItem(row) {
    if (!row || !row.id) return;
    window.flowmateSelectedWorkItem = row;
    onOpen(row.id);
  }

  const activeRows = (rows || [])
    .filter(row => row && row.type === "creative" && !row.archivedAt)
    .map(row => ({
      ...row,
      planningDate: getFlowMatePlanningCalendarDateC(row),
      planningLabel: flowMateDateLabelPlanningC(getFlowMatePlanningCalendarDateC(row)),
      planningFullLabel: flowMateDateFullLabelPlanningC(getFlowMatePlanningCalendarDateC(row)),
    }));
  const monthOptions = flowMateRowsMonthOptionsC(activeRows, ["publishDate", "launchDate", "planningDate"]);
  const campaignOptions = flowMatePlanningOptionsC(activeRows, row => getFlowMatePlanningCampaignNameC(row));
  const statusOptions = flowMatePlanningOptionsC(activeRows, row => row.status);
  const filteredRows = filterFlowMatePlanningRowsC(activeRows, filters)
    .filter(row => getFlowMatePlanningCalendarDateC(row));
  const rowsByDate = filteredRows.reduce((map, row) => {
    const dateKey = getFlowMatePlanningCalendarDateC(row).slice(0, 10);
    if (!map[dateKey]) map[dateKey] = [];
    map[dateKey].push(row);
    return map;
  }, {});
  const visibleMonthKey = filters.month !== "all" ? filters.month : monthKey;
  const cells = calendarMonthCellsC(`${visibleMonthKey}-01`);

  function planningSelect(label, value, key, options, renderLabel) {
    return (
      <label className="planning-filter">
        <span>{label}</span>
        <select className="select" value={value} onChange={event => setFilter(key, event.target.value)}>
          <option value="all">All {label.toLowerCase()}</option>
          {options.map(option => (
            <option key={option.key || option} value={option.key || option}>
              {renderLabel ? renderLabel(option) : (option.label || option)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  function renderCalendarItem(row) {
    const channels = getFlowMatePlanningChannelsC(row).join(", ");
    const readiness = deriveFlowMatePlanningReadinessC(row);
    return (
      <button key={row.id} type="button" className="planning-calendar-item" onClick={() => openPlanningCalendarItem(row)}>
        <span className="planning-calendar-item__top"><span className="mono">{row.id}</span><span>{STATUS_LABEL[row.status] || row.status || "-"}</span></span>
        <strong>{getFlowMatePlanningCampaignNameC(row)}</strong>
        <span>{channels}</span>
        <span>{row.title || "Untitled request"}</span>
        <span className={`planning-readiness planning-readiness--${String(readiness).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{readiness}</span>
      </button>
    );
  }

  return (
    <div className="page planning-page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Content Calendar</h1>
          <div className="page__sub">Planning calendar by publish date, with launch date fallback - {loadState.message}</div>
        </div>
        <div className="page__actions">
          <button className="btn btn--secondary" onClick={() => shiftPlanningMonth(-1)}><Icon name="chevron" style={{ transform: "rotate(180deg)" }} /> Prev</button>
          <button className="btn btn--secondary" onClick={clearFilters}>Today</button>
          <button className="btn btn--secondary" onClick={() => shiftPlanningMonth(1)}>Next <Icon name="chevron" /></button>
        </div>
      </div>

      <div className="stat-strip planning-metrics" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="stat"><div className="stat__num mono">{filteredRows.length}</div><div className="stat__lbl">Calendar items</div><div className="stat__delta">{flowMateMonthLabelC(visibleMonthKey)}</div></div>
        <div className="stat stat--info"><div className="stat__num mono">{campaignOptions.length}</div><div className="stat__lbl">Campaign filters</div></div>
        <div className="stat"><div className="stat__num mono">{FLOWMATE_PLANNING_CHANNELS_C.length}</div><div className="stat__lbl">Channel filters</div></div>
        <div className="stat stat--warn"><div className="stat__num mono">{filteredRows.filter(row => deriveFlowMatePlanningReadinessC(row) === "At Risk").length}</div><div className="stat__lbl">At risk</div></div>
      </div>

      <div className="filterbar planning-filterbar">
        {planningSelect("Month", filters.month, "month", monthOptions)}
        {planningSelect("Campaign", filters.campaign, "campaign", campaignOptions)}
        {planningSelect("Channel", filters.channel, "channel", FLOWMATE_PLANNING_CHANNELS_C)}
        {planningSelect("Status", filters.status, "status", statusOptions, option => STATUS_LABEL[option] || option)}
      </div>

      {loadState.status === "error" && (
        <div className="reason-box reason-box--need" style={{ marginBottom: 12 }}>{loadState.message}</div>
      )}

      <div className="planning-calendar">
        <div className="planning-calendar__weekdays">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <span key={day}>{day}</span>)}
        </div>
        <div className="planning-calendar__grid">
          {cells.map(cell => {
            const items = rowsByDate[cell.key] || [];
            return (
              <section key={cell.key} className={`planning-calendar__cell ${cell.inMonth ? "" : "is-muted"}`}>
                <div className="planning-calendar__date">
                  <span className={cell.key === todayKey ? "mono strong" : "mono"}>{cell.day}</span>
                  {items.length > 0 && <span className="tag">{items.length}</span>}
                </div>
                <div className="planning-calendar__items">
                  {items.slice(0, 3).map(renderCalendarItem)}
                  {items.length > 3 && <div className="planning-calendar__more">+{items.length - 3} more</div>}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {activeRows.length === 0 && loadState.status !== "loading" && loadState.status !== "error" && (
        <div className="team-settings-empty" style={{ marginTop: 12 }}>No active Creative Requests loaded for Planning.</div>
      )}
      {activeRows.length > 0 && filteredRows.length === 0 && (
        <div className="team-settings-empty" style={{ marginTop: 12 }}>No active Creative Requests match the selected filters.</div>
      )}

      <Source>{loadState.status === "live" ? "Supabase planning_work_items_v or live list rows" : "No static fallback rows"} - publish date first, launch date fallback; Team Calendar still uses 1st Draft/due date</Source>
    </div>
  );
}

/* ============================================================
   KPI VIEW
   ============================================================ */
function flowMateKpiAiTagsC(row) {
  return Array.isArray(row && row.aiTags) ? row.aiTags : [];
}

function flowMateKpiAiTagTextC(row) {
  return flowMateKpiAiTagsC(row)
    .map(tag => (tag && tag.tag) || tag)
    .filter(Boolean)
    .join(", ");
}

function flowMateKpiOwnerNameC(row) {
  if (row && row.assignee && MEMBERS_BY_ID[row.assignee]) return MEMBERS_BY_ID[row.assignee].name;
  return (row && row.assigneeOtherName) || "Unassigned";
}

function flowMateKpiDateFromValueC(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function flowMateKpiFormatDateTimeC(value) {
  const date = flowMateKpiDateFromValueC(value);
  if (!date) return "";
  return date.toLocaleString("en-GB", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).replace(",", "");
}

function flowMateKpiAssignedAtC(row) {
  const events = Array.isArray(row && row.activityEvents) ? row.activityEvents : [];
  const candidates = events
    .filter(event => {
      const toStatus = String(event.to_status || event.toStatus || "").toLowerCase();
      return toStatus === "assigned" || toStatus === "in_progress";
    })
    .map(event => flowMateKpiDateFromValueC(event.created_at || event.createdAt))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());
  return candidates[0]?.toISOString() || row?.createdAt || "";
}

function flowMateKpiDeliveredAtC(row) {
  if (row && row.deliveredAt) return row.deliveredAt;
  const events = Array.isArray(row && row.activityEvents) ? row.activityEvents : [];
  const deliveredEvent = events
    .filter(event => String(event.to_status || event.toStatus || "").toLowerCase() === "delivered")
    .map(event => flowMateKpiDateFromValueC(event.created_at || event.createdAt))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  return deliveredEvent ? deliveredEvent.toISOString() : "";
}

function flowMateKpiCompletionDaysC(row) {
  const assignedAt = flowMateKpiDateFromValueC(flowMateKpiAssignedAtC(row));
  const deliveredAt = flowMateKpiDateFromValueC(flowMateKpiDeliveredAtC(row));
  if (!assignedAt || !deliveredAt || deliveredAt < assignedAt) return null;
  return (deliveredAt.getTime() - assignedAt.getTime()) / 86400000;
}

function flowMateKpiFormatDaysC(value) {
  return value == null || Number.isNaN(Number(value)) ? "-" : Number(value).toFixed(1);
}

function flowMateKpiIsGdVeOwnerC(row) {
  const member = row && row.assignee ? MEMBERS_BY_ID[row.assignee] : null;
  return window.isFlowMateGdVeMember
    ? window.isFlowMateGdVeMember(member || { id: row && row.assignee, name: flowMateKpiOwnerNameC(row) })
    : false;
}

function flowMateKpiGdVeAiSheets(rows) {
  const grouped = new Map();
  (rows || []).forEach(row => {
    if (!flowMateKpiAiTagsC(row).length || !flowMateKpiIsGdVeOwnerC(row)) return;
    const ownerName = flowMateKpiOwnerNameC(row);
    if (!grouped.has(ownerName)) grouped.set(ownerName, []);
    grouped.get(ownerName).push(row);
  });

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ownerName, memberRows]) => ({
      name: `AI - ${ownerName}`,
      rows: [
        ["Task ID", "Task name", "Status", "Assignee", "Requester", "Requester team", "Type", "Priority", "Effort", "1st Draft / Due", "Launch", "AI Tag", "Campaign / project", "Platform", "Size / format", "Brief link"],
        ...memberRows
          .slice()
          .sort((a, b) => String(a.id || "").localeCompare(String(b.id || "")))
          .map(row => [
            row.id || "",
            row.title || "",
            row.status || "",
            ownerName,
            row.requester || "",
            row.requesterTeam || "",
            row.type || "",
            row.priority || "",
            row.effort || "",
            row.dueFullLabel || row.dueDate || "",
            row.launchFullLabel || row.launchDate || "",
            flowMateKpiAiTagTextC(row),
            row.campaign || "",
            row.platform || "",
            row.size || "",
            row.briefLink || "",
          ]),
      ],
    }));
}

function KpiScreen() {
  function Bar({ value, max, color = "var(--garena-deep-blue)" }) {
    const pct = max ? (value / max) * 100 : 0;
    return (
      <span style={{ display: "inline-block", width: 100, height: 8, background: "var(--garena-light-grey)", borderRadius: 4, position: "relative", overflow: "hidden", verticalAlign: "middle" }}>
        <span style={{ position: "absolute", inset: `0 ${100 - pct}% 0 0`, background: color }}></span>
      </span>
    );
  }

  const [rows, setRows] = useStateC([]);
  const [kpiExportMonth, setKpiExportMonth] = useStateC(flowMateDefaultExportMonthC());
  const [loadState, setLoadState] = useStateC({ status: "loading", message: "Loading Supabase data..." });

  useEffectC(() => {
    let alive = true;

    async function loadRows() {
      if (!window.loadFlowMateListRows) {
        setRows([]);
        setLoadState({ status: "error", message: "Live data unavailable: Supabase list loader is not ready." });
        return;
      }

      try {
        const liveRows = await window.loadFlowMateListRows();
        if (!alive) return;
        setRows(liveRows);
        setLoadState({ status: "live", message: "Live Supabase data" });
      } catch (error) {
        if (!alive) return;
        console.error("[FlowMate KPI] Supabase load failed:", error);
        setRows([]);
        setLoadState({ status: "error", message: `Live data unavailable: ${window.flowmateUserError(error, "Supabase query failed.")}` });
      }
    }

    loadRows();
    const cleanup = window.attachFlowMateLiveRefresh
      ? window.attachFlowMateLiveRefresh(loadRows)
      : () => {};
    return () => { alive = false; cleanup(); };
  }, []);

  const kpiMonthOptions = flowMateRowsMonthOptionsC(rows, ["calendarDate", "dueDate"]);
  const effectiveKpiMonthOptions = kpiMonthOptions.length
    ? kpiMonthOptions
    : [{ key: kpiExportMonth, label: flowMateMonthLabelC(kpiExportMonth) }];
  const selectedKpiExportMonth = effectiveKpiMonthOptions.some(option => option.key === kpiExportMonth)
    ? kpiExportMonth
    : effectiveKpiMonthOptions[effectiveKpiMonthOptions.length - 1]?.key || kpiExportMonth;
  const kpiRows = flowMateFilterRowsByMonthC(rows, selectedKpiExportMonth, ["calendarDate", "dueDate"]);
  const deliveredRows = kpiRows.filter(w => w.status === "delivered" || w.status === "done");
  const activeRows = kpiRows.filter(w => !["delivered", "done", "cancelled"].includes(w.status));
  const deliveredEffort = deliveredRows.reduce((sum, w) => sum + (w.effort || 0), 0);
  const blockedRows = activeRows.filter(w => w.status === "blocked");
  const queuedRows = activeRows.filter(w => w.status === "queued");
  const quickClosedRows = deliveredRows.filter(w => w.type === "quick");

  const ownerMap = new Map();
  deliveredRows.forEach(w => {
    const id = w.assignee || "unassigned";
    const owner = MEMBERS_BY_ID[id];
    const current = ownerMap.get(id) || {
      id,
      name: owner?.name || w.assigneeOtherName || "Unassigned",
      delivered: 0,
      items: 0,
      blocked: 0,
      aiTagged: 0,
      aiTaggedItems: [],
      completionDaysTotal: 0,
      completionDaysCount: 0,
      completionItems: [],
    };
    const completionDays = flowMateKpiCompletionDaysC(w);
    current.delivered += w.effort || 0;
    current.items += 1;
    if (completionDays != null) {
      current.completionDaysTotal += completionDays;
      current.completionDaysCount += 1;
      current.completionItems.push(w);
    }
    ownerMap.set(id, current);
  });
  blockedRows.forEach(w => {
    const id = w.assignee || "unassigned";
    const owner = MEMBERS_BY_ID[id];
    const current = ownerMap.get(id) || {
      id,
      name: owner?.name || w.assigneeOtherName || "Unassigned",
      delivered: 0,
      items: 0,
      blocked: 0,
      aiTagged: 0,
      aiTaggedItems: [],
      completionDaysTotal: 0,
      completionDaysCount: 0,
      completionItems: [],
    };
    current.blocked += 1;
    ownerMap.set(id, current);
  });
  kpiRows.forEach(w => {
    if (!flowMateKpiAiTagsC(w).length) return;
    const id = w.assignee || "unassigned";
    const owner = MEMBERS_BY_ID[id];
    const current = ownerMap.get(id) || {
      id,
      name: owner?.name || w.assigneeOtherName || "Unassigned",
      delivered: 0,
      items: 0,
      blocked: 0,
      aiTagged: 0,
      aiTaggedItems: [],
      completionDaysTotal: 0,
      completionDaysCount: 0,
      completionItems: [],
    };
    current.aiTagged += 1;
    current.aiTaggedItems.push(w);
    ownerMap.set(id, current);
  });
  const ownerRows = Array.from(ownerMap.values())
    .map(row => ({
      ...row,
      avgCompletionDays: row.completionDaysCount ? row.completionDaysTotal / row.completionDaysCount : null,
    }))
    .sort((a, b) => b.delivered - a.delivered || a.name.localeCompare(b.name));
  const maxOwnerDelivered = Math.max(1, ...ownerRows.map(row => row.delivered));
  const completionDetailRows = deliveredRows
    .map(row => ({
      ...row,
      assignedAt: flowMateKpiAssignedAtC(row),
      deliveredAt: flowMateKpiDeliveredAtC(row),
      completionDays: flowMateKpiCompletionDaysC(row),
    }))
    .filter(row => row.completionDays != null);

  const teamMap = new Map();
  kpiRows.forEach(w => {
    const team = w.requesterTeam || "No team";
    teamMap.set(team, (teamMap.get(team) || 0) + 1);
  });
  const teamRows = Array.from(teamMap.entries())
    .map(([team, count]) => ({ team, count, share: kpiRows.length ? Math.round((count / kpiRows.length) * 100) : 0 }))
    .sort((a, b) => b.count - a.count || a.team.localeCompare(b.team));
  const maxTeamShare = Math.max(1, ...teamRows.map(row => row.share));

  function exportKpiRows() {
    const filename = `flowmate-kpi-${selectedKpiExportMonth}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    const allWorkRows = [
      ["Export month", "Task ID", "Task name", "Type", "Status", "Assignee", "Requester", "Requester team", "Effort", "Priority", "1st Draft / Due", "Launch", "Assigned At", "Delivered At", "Completion days", "AI Tag", "Campaign / project", "Platform", "Size / format"],
      ...kpiRows.map(row => [
        flowMateMonthLabelC(selectedKpiExportMonth),
        row.id || "",
        row.title || "",
        row.type || "",
        row.status || "",
        flowMateKpiOwnerNameC(row),
        row.requester || "",
        row.requesterTeam || "",
        row.effort || "",
        row.priority || "",
        row.dueFullLabel || row.dueDate || "",
        row.launchFullLabel || row.launchDate || "",
        flowMateKpiFormatDateTimeC(flowMateKpiAssignedAtC(row)),
        flowMateKpiFormatDateTimeC(flowMateKpiDeliveredAtC(row)),
        flowMateKpiFormatDaysC(flowMateKpiCompletionDaysC(row)),
        flowMateKpiAiTagTextC(row),
        row.campaign || "",
        row.platform || "",
        row.size || "",
      ]),
    ];
    const perMemberRows = [
      ["Member", "Delivered effort", "Delivered items", "Avg days to delivered", "Blocked", "AI Tagged", "AI tagged task IDs"],
      ...ownerRows.map(row => [
        row.name,
        row.delivered,
        row.items,
        flowMateKpiFormatDaysC(row.avgCompletionDays),
        row.blocked,
        row.aiTagged,
        (row.aiTaggedItems || []).map(item => item.id).join(", "),
      ]),
    ];
    const requesterTeamRows = [
      ["Requester team", "Requests", "Share"],
      ...teamRows.map(row => [row.team, row.count, `${row.share}%`]),
    ];
    const summaryRows = [
      ["Metric", "Value"],
      ["Export month", flowMateMonthLabelC(selectedKpiExportMonth)],
      ["Delivered effort", deliveredEffort],
      ["Delivered items", deliveredRows.length],
      ["Active work", activeRows.length],
      ["Blocked", blockedRows.length],
      ["Queued", queuedRows.length],
      ["Quick tasks closed", quickClosedRows.length],
      ["AI tagged tasks", kpiRows.filter(row => flowMateKpiAiTagsC(row).length).length],
      ["Avg days to delivered", flowMateKpiFormatDaysC(completionDetailRows.length ? completionDetailRows.reduce((sum, row) => sum + row.completionDays, 0) / completionDetailRows.length : null)],
    ];
    const completionRows = [
      ["Task ID", "Task name", "Assignee", "Status", "Assigned At", "Delivered At", "Completion days", "Effort", "Campaign / project", "Type", "Priority"],
      ...completionDetailRows.map(row => [
        row.id || "",
        row.title || "",
        flowMateKpiOwnerNameC(row),
        row.status || "",
        flowMateKpiFormatDateTimeC(row.assignedAt),
        flowMateKpiFormatDateTimeC(row.deliveredAt),
        flowMateKpiFormatDaysC(row.completionDays),
        row.effort || "",
        row.campaign || "",
        row.type || "",
        row.priority || "",
      ]),
    ];
    const sheets = [
      { name: "Summary", rows: summaryRows },
      { name: "All work", rows: allWorkRows },
      { name: "Per member", rows: perMemberRows },
      { name: "Completion detail", rows: completionRows },
      { name: "Requester team", rows: requesterTeamRows },
      ...flowMateKpiGdVeAiSheets(kpiRows),
    ];

    if (window.flowmateDownloadWorkbook) {
      window.flowmateDownloadWorkbook(filename, sheets);
      return;
    }

    exportFlowMateCsvC(filename.replace(/\.xlsx$/, ".csv"), [
      { label: "ID", value: "id" },
      { label: "Title", value: "title" },
      { label: "AI Tag", value: row => flowMateKpiAiTagTextC(row) },
    ], kpiRows);
  }

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">KPI</h1>
          <div className="page__sub">Operational health from live Supabase rows - {loadState.message}</div>
        </div>
        <div className="page__actions">
          <select
            className="select"
            value={selectedKpiExportMonth}
            onChange={event => setKpiExportMonth(event.target.value)}
            data-testid="flowmate-kpi-export-month"
            aria-label="KPI export month"
            style={{ width: 132, height: 32, padding: "0 28px 0 10px", fontSize: 13 }}
          >
            {effectiveKpiMonthOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
          <button className="btn btn--secondary" onClick={exportKpiRows}><Icon name="download" /> Export</button>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi__lbl">Delivered effort</div>
          <div className="kpi__num mono">{deliveredEffort}<span style={{ fontSize: 14, color: "var(--garena-grey)", marginLeft: 4, fontWeight: 400 }}>pt</span></div>
          <div className="kpi__delta">{deliveredRows.length} delivered items</div>
        </div>
        <div className="kpi">
          <div className="kpi__lbl">Throughput</div>
          <div className="kpi__num mono">{deliveredRows.length}<span style={{ fontSize: 14, color: "var(--garena-grey)", marginLeft: 4, fontWeight: 400 }}>delivered</span></div>
          <div className="kpi__delta">Creative + quick tasks</div>
        </div>
        <div className="kpi">
          <div className="kpi__lbl">Active work</div>
          <div className="kpi__num mono">{activeRows.length}</div>
          <div className="kpi__delta">Excludes delivered and cancelled</div>
        </div>
        <div className="kpi">
          <div className="kpi__lbl">Avg review rounds</div>
          <div className="kpi__num mono">{kpiRows.length ? (kpiRows.reduce((sum, w) => sum + (w.reviewRound || 0), 0) / kpiRows.length).toFixed(1) : "0.0"}</div>
          <div className="kpi__delta">Across {flowMateMonthLabelC(selectedKpiExportMonth)} rows</div>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="kpi"><div className="kpi__lbl">Blocked</div><div className="kpi__num mono">{blockedRows.length}</div><div className="kpi__delta">Active blocked work</div></div>
        <div className="kpi"><div className="kpi__lbl">Queued</div><div className="kpi__num mono">{queuedRows.length}</div><div className="kpi__delta">{queuedRows.reduce((sum, w) => sum + (w.effort || 0), 0)} pt waiting</div></div>
        <div className="kpi"><div className="kpi__lbl">Quick tasks closed</div><div className="kpi__num mono">{quickClosedRows.length}</div><div className="kpi__delta">Closed quick tasks</div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <div className="card">
          <div className="card__head">
            <span className="card__title">Per member</span>
            <span className="card__sub">delivered effort - delivered items - average delivery days</span>
          </div>
          <div className="card__body" style={{ padding: 0 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Delivered effort</th>
                  <th>Distribution</th>
                  <th>Delivered items</th>
                  <th>Avg days to delivered</th>
                  <th>Blocked</th>
                  <th>AI Tagged</th>
                </tr>
              </thead>
              <tbody>
                {ownerRows.map(r => (
                  <tr key={r.id}>
                    <td className="col-name strong">
                      <span className="row" style={{ gap: 6 }}>
                        <Avatar memberId={r.id} /> {r.name}
                      </span>
                    </td>
                    <td className="mono">{r.delivered} pt</td>
                    <td><Bar value={r.delivered} max={maxOwnerDelivered} /></td>
                    <td className="mono">{r.items}</td>
                    <td className="mono">{flowMateKpiFormatDaysC(r.avgCompletionDays)}</td>
                    <td className="mono">{r.blocked}</td>
                    <td className="mono">{r.aiTagged}</td>
                  </tr>
                ))}
                {ownerRows.length === 0 && (
                  <tr><td colSpan="7" className="muted">No delivered, blocked, or AI-tagged rows loaded.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card__head"><span className="card__title">By requester team</span><span className="card__sub">{flowMateMonthLabelC(selectedKpiExportMonth)} rows</span></div>
          <div className="card__body" style={{ padding: 0 }}>
            <table className="tbl">
              <thead>
                <tr><th>Team</th><th>Requests</th><th>Share</th></tr>
              </thead>
              <tbody>
                {teamRows.map(t => (
                  <tr key={t.team}>
                    <td className="strong">{t.team}</td>
                    <td className="mono">{t.count}</td>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <Bar value={t.share} max={maxTeamShare} color="var(--garena-orange)" />
                        <span className="mono muted" style={{ fontSize: 11 }}>{t.share}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {teamRows.length === 0 && (
                  <tr><td colSpan="3" className="muted">No live rows loaded.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16 }} className="reason-box">
        Productivity index is calculated as <span className="mono">delivered_effort x on_time_factor x rework_factor</span> and is intentionally <strong>not displayed as a personal ranking</strong> in MVP - see PRD section 12.
      </div>

      <Source>{loadState.status === "live" ? "Supabase work_items table" : "No local fallback data"} - {flowMateMonthLabelC(selectedKpiExportMonth)} - {TODAY}</Source>
    </div>
  );
}

/* ============================================================
   TEAM CALENDAR
   ============================================================ */
function calendarUtcKeyC(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function calendarParseKeyC(dateKey) {
  const [y, m, d] = String(dateKey || "").split("-").map(Number);
  return new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1));
}

function calendarAddDaysC(dateKey, days) {
  return calendarUtcKeyC(new Date(calendarParseKeyC(dateKey).getTime() + days * 86400000));
}

function calendarMonthKeyC(dateKey) {
  return `${String(dateKey || calendarUtcKeyC(new Date())).slice(0, 7)}-01`;
}

function calendarShiftMonthC(monthKey, delta) {
  const date = calendarParseKeyC(monthKey);
  return calendarUtcKeyC(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1)));
}

function calendarMonthLabelC(monthKey) {
  return calendarParseKeyC(monthKey).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function calendarDateLabelC(dateKey) {
  return calendarParseKeyC(dateKey).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function calendarWeekLabelC(dateKey) {
  const selected = calendarParseKeyC(dateKey);
  const mondayOffset = (selected.getUTCDay() + 6) % 7;
  const startKey = calendarUtcKeyC(new Date(selected.getTime() - mondayOffset * 86400000));
  const endKey = calendarAddDaysC(startKey, 6);
  return `${calendarDateLabelC(startKey)} - ${calendarDateLabelC(endKey)}`;
}

function calendarMonthCellsC(monthKey) {
  const first = calendarParseKeyC(monthKey);
  const gridStartOffset = first.getUTCDay();
  const start = new Date(first.getTime() - gridStartOffset * 86400000);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getTime() + index * 86400000);
    return {
      key: calendarUtcKeyC(date),
      day: date.getUTCDate(),
      inMonth: date.getUTCMonth() === first.getUTCMonth(),
    };
  });
}

function ganttDateKeyFromRowC(row, fields) {
  if (window.getFlowMateDateKeyFromFields) return window.getFlowMateDateKeyFromFields(row, fields);
  const sourceFields = fields && fields.length ? fields : ["dueDate", "calendarDate"];
  for (const field of sourceFields) {
    const value = row && row[field];
    if (value && /^\d{4}-\d{2}-\d{2}/.test(String(value))) return String(value).slice(0, 10);
  }
  return "";
}

function ganttTimelineWindowC(monthKey) {
  const visibleMonthCount = 2;
  const startKey = `${monthKey}-01`;
  const startDate = calendarParseKeyC(startKey);
  const endDate = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + visibleMonthCount, 0));
  const endKey = calendarUtcKeyC(endDate);
  const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  const dayCells = Array.from({ length: totalDays }, (_, index) => {
    const date = new Date(startDate.getTime() + index * 86400000);
    return {
      day: date.getUTCDate(),
      label: date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }).slice(0, 1),
      monthLabel: date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
      isWeekend: date.getUTCDay() === 0 || date.getUTCDay() === 6,
    };
  });
  const monthGroups = Array.from({ length: visibleMonthCount }, (_, index) => {
    const groupStart = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + index, 1));
    const groupEnd = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + index + 1, 0));
    const startOffset = Math.floor((groupStart.getTime() - startDate.getTime()) / 86400000);
    const days = Math.floor((groupEnd.getTime() - groupStart.getTime()) / 86400000) + 1;
    return {
      key: calendarUtcKeyC(groupStart),
      label: calendarMonthLabelC(calendarUtcKeyC(groupStart)),
      startOffset,
      days,
    };
  });
  return { startKey, endKey, startDate, endDate, totalDays, dayCells, monthGroups };
}

function ganttTaskModelC(row, monthKey, ganttWindow) {
  const dueKey = ganttDateKeyFromRowC(row, ["dueDate", "calendarDate"]);
  if (!dueKey) return null;
  const launchKey = ganttDateKeyFromRowC(row, ["launchDate", "launch_date"]);
  const rawStartKey = launchKey && launchKey > dueKey ? dueKey : dueKey;
  const rawEndKey = launchKey && launchKey > dueKey ? launchKey : dueKey;
  const timeline = ganttWindow || ganttTimelineWindowC(monthKey);
  if (rawEndKey < timeline.startKey || rawStartKey > timeline.endKey) return null;
  const clampedStartKey = rawStartKey < timeline.startKey ? timeline.startKey : rawStartKey;
  const clampedEndKey = rawEndKey > timeline.endKey ? timeline.endKey : rawEndKey;
  const startOffset = Math.floor((calendarParseKeyC(clampedStartKey).getTime() - timeline.startDate.getTime()) / 86400000);
  const endOffset = Math.floor((calendarParseKeyC(clampedEndKey).getTime() - timeline.startDate.getTime()) / 86400000);
  const launchOffset = launchKey && launchKey >= timeline.startKey && launchKey <= timeline.endKey
    ? Math.floor((calendarParseKeyC(launchKey).getTime() - timeline.startDate.getTime()) / 86400000)
    : null;
  return {
    item: row,
    dueKey,
    launchKey,
    startOffset,
    spanDays: Math.max(1, endOffset - startOffset + 1),
    launchOffset,
    spansToLaunch: Boolean(launchKey && launchKey > dueKey),
    priorityClass: row.priority === "urgent" ? "is-urgent" : row.priority === "high" ? "is-high" : row.priority === "low" ? "is-low" : "is-normal",
    statusClass: row.status ? `is-status-${row.status}` : "is-status-unknown",
    displayLabel: row.type === "creative" ? "1st Draft" : "Due",
  };
}

function TeamGanttScreen({ onOpen }) {
  const [sourceRows, setSourceRows] = useStateC(WORK);
  const [loadState, setLoadState] = useStateC({ status: "loading", message: "Loading Supabase data..." });
  const [monthKey, setMonthKey] = useStateC(flowMateDefaultExportMonthC());

  useEffectC(() => {
    let alive = true;

    async function loadRowsIfAlive() {
      const loader = window.loadFlowMateCalendarRows || window.loadFlowMateListRows;
      if (!loader) {
        if (!alive) return;
        setSourceRows([]);
        setLoadState({ status: "error", message: "Live data unavailable: Supabase calendar/list loader is not ready." });
        return;
      }

      try {
        const rows = await loader();
        if (!alive) return;
        setSourceRows(rows);
        setLoadState({ status: "live", message: "Live Supabase data" });
      } catch (error) {
        if (!alive) return;
        console.error("[FlowMate Gantt] Supabase load failed:", error);
        setSourceRows([]);
        setLoadState({ status: "error", message: `Live data unavailable: ${window.flowmateUserError(error, "Supabase query failed.")}` });
      }
    }

    loadRowsIfAlive();
    const cleanup = window.attachFlowMateLiveRefresh
      ? window.attachFlowMateLiveRefresh(loadRowsIfAlive)
      : () => {};
    return () => { alive = false; cleanup(); };
  }, []);

  const ganttMonthOptions = flowMateRowsMonthOptionsC(sourceRows, ["calendarDate", "dueDate", "launchDate"]);
  const effectiveGanttMonthOptions = ganttMonthOptions.length
    ? ganttMonthOptions
    : [{ key: monthKey, label: flowMateMonthLabelC(monthKey) }];
  const selectedGanttMonth = effectiveGanttMonthOptions.some(option => option.key === monthKey)
    ? monthKey
    : effectiveGanttMonthOptions[0].key;

  useEffectC(() => {
    if (!ganttMonthOptions.length) return;
    if (!ganttMonthOptions.some(option => option.key === monthKey)) {
      setMonthKey(ganttMonthOptions[0].key);
    }
  }, [sourceRows, monthKey]);

  const ganttWindow = ganttTimelineWindowC(selectedGanttMonth);
  const todayKey = calendarUtcKeyC(new Date());
  const todayOffset = todayKey >= ganttWindow.startKey && todayKey <= ganttWindow.endKey
    ? Math.floor((calendarParseKeyC(todayKey).getTime() - ganttWindow.startDate.getTime()) / 86400000)
    : null;
  const ganttTasks = (sourceRows || [])
    .filter(row => row && row.type !== "leave" && !["cancelled"].includes(row.status))
    .map(row => ganttTaskModelC(row, selectedGanttMonth, ganttWindow))
    .filter(Boolean)
    .sort((a, b) => a.dueKey.localeCompare(b.dueKey) || String(a.item.id || "").localeCompare(String(b.item.id || "")));

  const teamMap = new Map();
  ganttTasks.forEach(task => {
    const assigneeId = task.item.assignee || "unassigned";
    const member = MEMBERS_BY_ID[assigneeId];
    const assigneeName = member ? member.name : (task.item.assigneeOtherName || "Unassigned");
    const teamName = member ? (member.discipline || "No team") : (task.item.requesterTeam || "No team");
    if (!teamMap.has(teamName)) teamMap.set(teamName, new Map());
    const assigneeMap = teamMap.get(teamName);
    if (!assigneeMap.has(assigneeId)) {
      assigneeMap.set(assigneeId, {
        assigneeId,
        assigneeName,
        member,
        tasks: [],
      });
    }
    assigneeMap.get(assigneeId).tasks.push(task);
  });
  const teamGroups = Array.from(teamMap.entries())
    .map(([teamName, assigneeMap]) => ({
      teamName,
      assignees: Array.from(assigneeMap.values()).sort((a, b) => a.assigneeName.localeCompare(b.assigneeName)),
    }))
    .sort((a, b) => a.teamName.localeCompare(b.teamName));

  function openGanttItem(task) {
    window.flowmateSelectedWorkItem = task.item;
    onOpen(task.item.id);
  }

  return (
    <div className="page" data-testid="flowmate-team-gantt-route" data-flowmate-route="team-gantt">
      <div className="page__header">
        <div>
          <h1 className="page__title">Team Gantt Chart</h1>
          <div className="page__sub">Read-only work timeline grouped by team and assignee - {loadState.message}</div>
        </div>
        <div className="page__actions">
          <select
            className="select"
            value={selectedGanttMonth}
            onChange={event => setMonthKey(event.target.value)}
            data-testid="flowmate-gantt-month"
            aria-label="Gantt month"
            style={{ width: 132, height: 32, padding: "0 28px 0 10px", fontSize: 13 }}
          >
            {effectiveGanttMonthOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        </div>
      </div>

      <div className="gantt__toolbar" aria-label="Gantt read-only controls">
        <div className="gantt__toolbar-group">
          <span className="gantt__chip"><Icon name="chart" size={13} /> Trello Power-Up Lite</span>
          <span className="gantt__chip">Two-month window</span>
          <span className="gantt__chip">Scroll right to see the second month</span>
          <span className="gantt__chip">Grouped by team / assignee</span>
          <span className="gantt__chip">Click bar to open task</span>
        </div>
        <div className="gantt__legend">
          <span><i className="gantt__legend-dot gantt__legend-dot--normal"></i>Normal</span>
          <span><i className="gantt__legend-dot gantt__legend-dot--urgent"></i>Urgent</span>
          <span><i className="gantt__legend-diamond"></i>Launch</span>
          <span><i className="gantt__legend-line"></i>Today</span>
        </div>
      </div>

      <div className="stat-strip" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="stat"><div className="stat__num mono">{ganttTasks.length}</div><div className="stat__lbl">Visible tasks</div></div>
        <div className="stat stat--info"><div className="stat__num mono">{teamGroups.length}</div><div className="stat__lbl">Teams</div></div>
        <div className="stat stat--ok"><div className="stat__num mono">{teamGroups.reduce((sum, team) => sum + team.assignees.length, 0)}</div><div className="stat__lbl">Assignees</div></div>
        <div className="stat stat--warn"><div className="stat__num mono">{ganttTasks.filter(task => task.launchKey).length}</div><div className="stat__lbl">With launch date</div></div>
      </div>

      <div className="gantt" data-testid="flowmate-team-gantt-chart">
        <div className="gantt__header">
          <div className="gantt__owner-head">Team / assignee</div>
          <div className="gantt__timeline-head" style={{ "--gantt-days": ganttWindow.totalDays, "--gantt-today-offset": todayOffset ?? 0 }}>
            <div className="gantt__month-scale" style={{ gridTemplateColumns: `repeat(${ganttWindow.totalDays}, minmax(30px, 1fr))` }}>
              {ganttWindow.monthGroups.map(group => (
                <div
                  key={group.key}
                  className="gantt__month-group"
                  style={{ gridColumn: `${group.startOffset + 1} / span ${group.days}` }}
                  data-testid="flowmate-gantt-month-group"
                >
                  {group.label}
                </div>
              ))}
            </div>
            <div className="gantt__scale" style={{ gridTemplateColumns: `repeat(${ganttWindow.totalDays}, minmax(30px, 1fr))`, "--gantt-days": ganttWindow.totalDays }}>
              {ganttWindow.dayCells.map((cell, index) => (
                <div key={`${cell.monthLabel}-${cell.day}-${index}`} className={`gantt__day ${cell.isWeekend ? "is-weekend" : ""}`}>
                  <span className="mono">{cell.day}</span>
                  <span>{cell.label}</span>
                </div>
              ))}
            </div>
            {todayOffset !== null && <div className="gantt__today-line gantt__today-line--header" aria-hidden="true"></div>}
          </div>
        </div>

        {teamGroups.map(team => (
          <section key={team.teamName} className="gantt__team">
            <div className="gantt__team-title">
              <span>{team.teamName}</span>
              <span className="tag">{team.assignees.reduce((sum, assignee) => sum + assignee.tasks.length, 0)} tasks</span>
            </div>
            {team.assignees.map(assignee => (
              <div key={assignee.assigneeId} className="gantt__row">
                <div className="gantt__owner">
                  <Avatar memberId={assignee.assigneeId} size="avatar--lg" />
                  <span>
                    <span className="gantt__owner-name">{assignee.assigneeName}</span>
                    <span className="muted">{assignee.member ? assignee.member.discipline : "Unassigned"}</span>
                  </span>
                </div>
                <div className="gantt__lane" style={{ gridTemplateColumns: `repeat(${ganttWindow.totalDays}, minmax(30px, 1fr))`, "--gantt-days": ganttWindow.totalDays, "--gantt-today-offset": todayOffset ?? 0 }}>
                  {todayOffset !== null && <div className="gantt__today-line" aria-hidden="true"></div>}
                  {assignee.tasks.map(task => (
                    <button
                      key={task.item.id}
                      type="button"
                      className={`gantt__bar ${task.spansToLaunch ? "gantt__bar--span" : "gantt__bar--marker"} ${task.priorityClass} ${task.statusClass} ${task.item.overdue ? "is-overdue" : ""}`}
                      style={{ gridColumn: `${task.startOffset + 1} / span ${task.spanDays}` }}
                      onClick={() => openGanttItem(task)}
                      title={`${task.item.id} - ${task.item.title} - ${task.displayLabel}: ${calendarDateLabelC(task.dueKey)}`}
                      data-testid="flowmate-gantt-task-bar"
                    >
                      <span className="mono">{task.item.id}</span>
                      <span>{task.item.title}</span>
                      <span className="gantt__bar-date">{task.displayLabel}</span>
                      {task.launchKey && (
                        <span
                          className="gantt__launch-marker"
                          title={`Launch: ${calendarDateLabelC(task.launchKey)}`}
                          data-testid="flowmate-gantt-launch-marker"
                        ></span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}

        {teamGroups.length === 0 && (
          <div className="gantt__empty">No due-date work items found for {flowMateMonthLabelC(selectedGanttMonth)}.</div>
        )}
      </div>

      <div className="reason-box" style={{ marginTop: 16 }}>
        Gantt rule: due date is the bar end. Launch date is shown as a marker; when launch date is after due date, the bar spans due date to launch date. This view shows two months at a time; scroll right to see the second month.
      </div>
      <Source>{loadState.status === "live" ? "Supabase calendar/list loader" : "No local fallback data"} - Team Gantt Chart - {flowMateMonthLabelC(selectedGanttMonth)} plus next month</Source>
    </div>
  );
}

function CalendarScreen({ onOpen }) {
  const todayKey = calendarUtcKeyC(new Date());
  const [sourceRows, setSourceRows] = useStateC(WORK);
  const [loadState, setLoadState] = useStateC({ status: "loading", message: "Loading Supabase data..." });
  const [viewMode, setViewMode] = useStateC("month");
  const [agendaRange, setAgendaRange] = useStateC("day");
  const [selectedDateKey, setSelectedDateKey] = useStateC(todayKey);
  const [monthKey, setMonthKey] = useStateC(calendarMonthKeyC(todayKey));
  const [filterAssignee, setFilterAssignee] = useStateC("all");
  const [filterStatus, setFilterStatus] = useStateC("all");
  const [filterType, setFilterType] = useStateC("all");
  const [filterPriority, setFilterPriority] = useStateC("all");
  const [leaveModalOpen, setLeaveModalOpen] = useStateC(false);
  const [leaveForm, setLeaveForm] = useStateC({ startDate: todayKey, endDate: todayKey, startHalf: "am", endHalf: "pm", reason: "" });
  const [leaveState, setLeaveState] = useStateC({ status: "idle", message: "" });

  async function loadRows() {
    const loader = window.loadFlowMateCalendarRows || window.loadFlowMateListRows;
    if (!loader) {
      setSourceRows([]);
      setLoadState({ status: "error", message: "Live data unavailable: Supabase calendar loader is not ready." });
      return;
    }

    try {
      const rows = await loader();
      setSourceRows(rows);
      setLoadState({ status: "live", message: "Live Supabase data" });
    } catch (error) {
      console.error("[FlowMate Calendar] Supabase load failed:", error);
      setSourceRows([]);
      setLoadState({ status: "error", message: `Live data unavailable: ${window.flowmateUserError(error, "Supabase query failed.")}` });
    }
  }

  useEffectC(() => {
    let alive = true;

    async function loadRowsIfAlive() {
      const loader = window.loadFlowMateCalendarRows || window.loadFlowMateListRows;
      if (!loader) {
        if (!alive) return;
        setSourceRows([]);
        setLoadState({ status: "error", message: "Live data unavailable: Supabase calendar loader is not ready." });
        return;
      }

      try {
        const rows = await loader();
        if (!alive) return;
        setSourceRows(rows);
        setLoadState({ status: "live", message: "Live Supabase data" });
      } catch (error) {
        if (!alive) return;
        console.error("[FlowMate Calendar] Supabase load failed:", error);
        setSourceRows([]);
        setLoadState({ status: "error", message: `Live data unavailable: ${window.flowmateUserError(error, "Supabase query failed.")}` });
      }
    }

    loadRowsIfAlive();
    const cleanup = window.attachFlowMateLiveRefresh
      ? window.attachFlowMateLiveRefresh(loadRowsIfAlive)
      : () => {};
    return () => { alive = false; cleanup(); };
  }, []);

  const calendarRows = (sourceRows || []).map((row) => ({
    ...row,
    calendarDate: window.getFlowMateCalendarDateKey ? window.getFlowMateCalendarDateKey(row) : "",
  })).filter((row) => row.calendarDate && (row.type === "quick" || row.type === "creative" || row.type === "leave"));

  const rowsByDate = calendarRows.reduce((map, row) => {
    if (!map[row.calendarDate]) map[row.calendarDate] = [];
    map[row.calendarDate].push(row);
    return map;
  }, {});

  const ownerOptionRows = [
    ...(window.MEMBERS || []).map(member => [member.id, member.name]),
    ...calendarRows.map(row => {
      const id = row.assignee || "unassigned";
      const label = row.assignee && MEMBERS_BY_ID[row.assignee] ? MEMBERS_BY_ID[row.assignee].name : (row.assigneeOtherName || "Unassigned");
      return [id, label];
    }),
  ];
  const ownerOptions = Array.from(new Map(ownerOptionRows).entries()).sort((a, b) => a[1].localeCompare(b[1]));
  const selectedCalendarRows = window.getFlowMateCalendarAgendaRows
    ? window.getFlowMateCalendarAgendaRows(calendarRows, {
      dateKey: selectedDateKey,
      range: agendaRange,
      assignee: filterAssignee,
      status: filterStatus,
      type: filterType,
      priority: filterPriority,
    })
    : [];
  const agendaRows = selectedCalendarRows;
  const overdueCount = selectedCalendarRows.filter(row => row.overdue || (row.dueDelta != null && row.dueDelta < 0)).length;
  const dueSoonCount = selectedCalendarRows.filter(row => !row.overdue && row.dueDelta != null && row.dueDelta >= 0 && row.dueDelta <= 2).length;

  function openCalendarItem(item) {
    if (item.type === "leave") return;
    window.flowmateSelectedWorkItem = item;
    onOpen(item.id);
  }

  async function submitLeaveRequest(event) {
    event.preventDefault();
    if (!window.createFlowMateLeaveRequest) return;
    setLeaveState({ status: "saving", message: "Saving leave request..." });
    try {
      await window.createFlowMateLeaveRequest(leaveForm);
      await loadRows();
      setLeaveModalOpen(false);
      setLeaveState({ status: "idle", message: "" });
      setLeaveForm({ startDate: todayKey, endDate: todayKey, startHalf: "am", endHalf: "pm", reason: "" });
    } catch (error) {
      console.error("[FlowMate Calendar] Leave request failed:", error);
      setLeaveState({ status: "error", message: window.flowmateUserError(error, "Leave request failed.") });
    }
  }

  function updateLeaveHalf(half, checked) {
    setLeaveForm(current => {
      if (half === "am") {
        if (checked) return { ...current, startHalf: "am" };
        return current.endHalf === "pm" ? { ...current, startHalf: "pm" } : current;
      }
      if (checked) return { ...current, endHalf: "pm" };
      return current.startHalf === "am" ? { ...current, endHalf: "am" } : current;
    });
  }

  function calendarTypePill(item) {
    if (item.type === "leave") return <span className="tag" style={{ background: "#F3F4F6", color: "#4B5563" }}>Leave</span>;
    return <TypePill type={item.type} />;
  }

  function calendarStatusPill(item) {
    if (item.type === "leave") return <span className="avail avail--leave"><span className="avail__dot"></span>{item.leaveUnits === 0.5 ? `${item.halfLabel} leave` : "On leave"}</span>;
    return <StatusBadge status={item.status} />;
  }

  function selectDate(dateKey) {
    setSelectedDateKey(dateKey);
    setMonthKey(calendarMonthKeyC(dateKey));
  }

  function shiftCalendarWindow(direction) {
    const deltaDays = agendaRange === "week" ? 7 : 1;
    const nextDateKey = calendarAddDaysC(selectedDateKey, direction * deltaDays);
    setSelectedDateKey(nextDateKey);
    setMonthKey(calendarMonthKeyC(nextDateKey));
  }

  function goToToday() {
    setMonthKey(calendarMonthKeyC(todayKey));
    setSelectedDateKey(todayKey);
  }

  function openCalendarOverflow(event, dateKey) {
    event.stopPropagation();
    selectDate(dateKey);
    setAgendaRange("day");
    setViewMode("agenda");
  }

  function calendarItem(item, compact = false) {
    const owner = item.assignee && MEMBERS_BY_ID[item.assignee] ? MEMBERS_BY_ID[item.assignee].name : (item.assigneeOtherName || "Unassigned");
    const textClampStyle = compact ? {
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
      overflowWrap: "anywhere",
      wordBreak: "break-word",
    } : {
      overflowWrap: "anywhere",
      wordBreak: "break-word",
    };
    return (
      <button
        key={item.id}
        type="button"
        className="btn btn--ghost"
        onClick={() => openCalendarItem(item)}
        style={{
          width: "100%",
          minWidth: 0,
          justifyContent: "flex-start",
          textAlign: "left",
          height: "auto",
          padding: compact ? "6px 8px" : "10px 12px",
          borderColor: item.overdue || (item.dueDelta != null && item.dueDelta < 0) ? "var(--garena-red)" : "var(--garena-light-grey)",
          background: item.overdue || (item.dueDelta != null && item.dueDelta < 0) ? "var(--garena-red-light-2)" : "#fff",
          overflow: "hidden",
        }}
      >
        <span style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%", minWidth: 0 }}>
          <span className="row" style={{ justifyContent: "space-between", gap: 8, minWidth: 0 }}>
            <span className="mono strong" style={{ fontSize: 11, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{item.id}</span>
            {!compact && calendarTypePill(item)}
          </span>
          <span className="strong" style={{ fontSize: compact ? 12 : 13, lineHeight: 1.3, minWidth: 0, ...textClampStyle }}>{item.title}</span>
          <span className="muted" style={{ fontSize: 11, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{owner} - {item.type === "leave" ? (item.leaveUnits === 0.5 ? `${item.halfLabel} leave` : "AM + PM leave") : (STATUS_LABEL[item.status] || item.status)}</span>
          {!compact && item.launchLabel && <span className="muted" style={{ fontSize: 11 }}>Launch date: {item.launchFullLabel || item.launchLabel}</span>}
          {!compact && item.type === "leave" && item.leaveReason && <span className="muted" style={{ fontSize: 11 }}>{item.leaveReason}</span>}
        </span>
      </button>
    );
  }

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Team calendar</h1>
          <div className="page__sub">Quick Tasks and Creative Requests placed by due date. {loadState.message}</div>
        </div>
        <div className="page__actions">
          <button className="btn btn--secondary" onClick={() => setLeaveModalOpen(true)}><Icon name="plus" /> Create Leave Request</button>
          <button className={`btn ${viewMode === "month" ? "btn--primary" : "btn--secondary"}`} onClick={() => setViewMode("month")}><Icon name="calendar" /> Month</button>
          <button className={`btn ${viewMode === "agenda" ? "btn--primary" : "btn--secondary"}`} onClick={() => setViewMode("agenda")}><Icon name="list" /> Agenda</button>
        </div>
      </div>

      <div className="calendar-metrics">
        <div className="stat"><div className="stat__num mono">{selectedCalendarRows.length}</div><div className="stat__lbl">Scheduled items</div></div>
        <div className="stat stat--accent"><div className="stat__num mono">{selectedCalendarRows.filter(row => row.type === "quick").length}</div><div className="stat__lbl">Quick Tasks</div></div>
        <div className="stat stat--warn"><div className="stat__num mono">{dueSoonCount}</div><div className="stat__lbl">Due soon</div></div>
        <div className="stat stat--accent"><div className="stat__num mono">{overdueCount}</div><div className="stat__lbl">Overdue</div></div>
      </div>

      <div className="filterbar">
        <select className="select" value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}>
          <option value="all">All assignees</option>
          {ownerOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <select className="select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <select className="select" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="all">All types</option>
          <option value="creative">Creative requests</option>
          <option value="quick">Quick tasks</option>
          <option value="leave">Leave</option>
        </select>
        <select className="select" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
          <option value="all">All priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
        <span className="spacer"></span>
        <select className="select" value={agendaRange} onChange={e => setAgendaRange(e.target.value)}>
          <option value="day">Selected day</option>
          <option value="week">Selected week</option>
        </select>
      </div>

      <div className="row" style={{ justifyContent: "space-between", margin: "0 0 12px", gap: 12 }}>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn--secondary" onClick={() => shiftCalendarWindow(-1)}><Icon name="chevron" style={{ transform: "rotate(180deg)" }} /> Prev</button>
          <button className="btn btn--secondary" onClick={goToToday}>Today</button>
          <button className="btn btn--secondary" onClick={() => shiftCalendarWindow(1)}>Next <Icon name="chevron" /></button>
        </div>
        <div>
          <div className="strong" style={{ textAlign: "right" }}>{calendarMonthLabelC(monthKey)}</div>
          <div className="muted" style={{ fontSize: 12 }}>{agendaRange === "week" ? calendarWeekLabelC(selectedDateKey) : calendarDateLabelC(selectedDateKey)}</div>
        </div>
      </div>

      {viewMode === "month" && (
        <div style={{ overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(128px, 1fr))", gap: 8, minWidth: 900 }}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
              <div key={day} className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>{day}</div>
            ))}
            {calendarMonthCellsC(monthKey).map(cell => {
              const items = (rowsByDate[cell.key] || []).filter(item => window.getFlowMateCalendarAgendaRows
                ? window.getFlowMateCalendarAgendaRows([item], {
                  dateKey: cell.key,
                  range: "day",
                  assignee: filterAssignee,
                  status: filterStatus,
                  type: filterType,
                  priority: filterPriority,
                }).length > 0
                : true);
              return (
                <div
                  key={cell.key}
                  onClick={() => selectDate(cell.key)}
                  style={{
                    minHeight: 132,
                    padding: 8,
                    border: cell.key === selectedDateKey ? "2px solid var(--garena-red)" : "1px solid var(--garena-light-grey)",
                    background: cell.inMonth ? "#fff" : "var(--garena-bg)",
                    opacity: cell.inMonth ? 1 : 0.72,
                    cursor: "pointer",
                  }}
                >
                  <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                    <span className={`mono ${cell.key === todayKey ? "strong" : ""}`}>{cell.day}</span>
                    {items.length > 0 && <span className="tag">{items.length}</span>}
                  </div>
                  <div className="col" style={{ gap: 6 }}>
                    {items.slice(0, 3).map(item => calendarItem(item, true))}
                    {items.length > 3 && (
                      <button
                        type="button"
                        className="btn btn--xs btn--ghost"
                        onClick={(event) => openCalendarOverflow(event, cell.key)}
                        style={{ width: "100%", justifyContent: "flex-start", minWidth: 0 }}
                      >
                        Open all +{items.length - 3} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {viewMode === "agenda" && (
        <div className="card card__body--flush" style={{ overflow: "hidden" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Due date</th>
                <th>ID</th>
                <th>Title</th>
                <th>Type</th>
                <th>Status</th>
                <th>Assignee</th>
                <th>Priority</th>
                <th>Launch date</th>
              </tr>
            </thead>
            <tbody>
              {agendaRows.map(item => (
                <tr key={item.id} className={item.overdue ? "is-overdue" : ""} onClick={() => openCalendarItem(item)}>
                  <td><DueBadge delta={item.dueDelta} label={item.dueLabel} status={item.status} /></td>
                  <td className="mono">{item.id}</td>
                  <td className="col-title">{item.title}</td>
                  <td>{calendarTypePill(item)}</td>
                  <td>{calendarStatusPill(item)}</td>
                  <td>{item.assignee && MEMBERS_BY_ID[item.assignee] ? MEMBERS_BY_ID[item.assignee].name : (item.assigneeOtherName || "Unassigned")}</td>
                  <td><PriorityBadge level={item.priority} /></td>
                  <td><span className="muted">{item.launchFullLabel || item.launchLabel || "-"}</span></td>
                </tr>
              ))}
              {agendaRows.length === 0 && (
                <tr><td colSpan="8"><span className="muted">No work items match this calendar selection.</span></td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Source>{loadState.status === "live" ? "Supabase work_items and leave_requests tables" : "No local fallback data"} - due date calendar placement</Source>

      {leaveModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal modal--settings" onSubmit={submitLeaveRequest}>
            <div className="modal__head">
              <div>
                <h2>Create Leave Request</h2>
                <div className="muted" style={{ fontSize: 12 }}>Applies to your linked team member.</div>
              </div>
              <button type="button" className="iconbtn" onClick={() => setLeaveModalOpen(false)} aria-label="Close"><Icon name="x" /></button>
            </div>
            <div className="form-grid">
              <label className="field">
                <span className="field__label">Start date</span>
                <input className="input" type="date" value={leaveForm.startDate} onChange={event => setLeaveForm(current => ({ ...current, startDate: event.target.value }))} />
              </label>
              <label className="field">
                <span className="field__label">End date</span>
                <input className="input" type="date" value={leaveForm.endDate} onChange={event => setLeaveForm(current => ({ ...current, endDate: event.target.value }))} />
              </label>
              <div className="field field--full">
                <span className="field__label">Leave period</span>
                <div className="check-row">
                  <label className="check-pill">
                    <input type="checkbox" checked={leaveForm.startHalf === "am"} onChange={event => updateLeaveHalf("am", event.target.checked)} />
                    <span>AM</span>
                  </label>
                  <label className="check-pill">
                    <input type="checkbox" checked={leaveForm.endHalf === "pm"} onChange={event => updateLeaveHalf("pm", event.target.checked)} />
                    <span>PM</span>
                  </label>
                </div>
                <span className="field__hint">AM + PM is full day. AM only or PM only counts as half-day capacity.</span>
              </div>
              <label className="field field--full">
                <span className="field__label">Reason</span>
                <textarea className="textarea" value={leaveForm.reason} onChange={event => setLeaveForm(current => ({ ...current, reason: event.target.value }))} rows="3"></textarea>
              </label>
            </div>
            {leaveState.status === "error" && <div className="reason-box reason-box--need" style={{ marginTop: 12 }}>{leaveState.message}</div>}
            <div className="modal__actions">
              <button type="button" className="btn btn--secondary" onClick={() => setLeaveModalOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn--primary" disabled={leaveState.status === "saving"}>{leaveState.status === "saving" ? "Saving..." : "Save leave"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   TEAM SETTINGS
   ============================================================ */
function SettingsScreen() {
  const [members, setMembers] = useStateC(MEMBERS);
  const [filter, setFilter] = useStateC("all");
  const [editMember, setEditMember] = useStateC(null);
  const [editForm, setEditForm] = useStateC({ capacityPerDay: 8, wipLimit: 3 });
  const [saveState, setSaveState] = useStateC({ status: "idle", message: "" });
  const [loadState, setLoadState] = useStateC({ status: "loading", message: "Loading Supabase members..." });

  async function loadMembers() {
    if (!window.loadFlowMateWorkloadRows) {
      setMembers(window.MEMBERS || []);
      setLoadState({ status: "error", message: "Live data unavailable: Supabase workload loader is not ready." });
      return;
    }

    try {
      const liveRows = await window.loadFlowMateWorkloadRows();
      setMembers(liveRows.map(row => row.m));
      setLoadState({ status: "live", message: "Live Supabase data" });
    } catch (error) {
      console.error("[FlowMate Settings] Supabase load failed:", error);
      setMembers([]);
      setLoadState({ status: "error", message: `Live data unavailable: ${window.flowmateUserError(error, "Supabase query failed.")}` });
    }
  }

  useEffectC(() => {
    let alive = true;

    async function loadMembersIfAlive() {
      if (!window.loadFlowMateWorkloadRows) {
        if (!alive) return;
        setMembers(window.MEMBERS || []);
        setLoadState({ status: "error", message: "Live data unavailable: Supabase workload loader is not ready." });
        return;
      }

      try {
        const liveRows = await window.loadFlowMateWorkloadRows();
        if (!alive) return;
        setMembers(liveRows.map(row => row.m));
        setLoadState({ status: "live", message: "Live Supabase data" });
      } catch (error) {
        if (!alive) return;
        console.error("[FlowMate Settings] Supabase load failed:", error);
        setMembers([]);
        setLoadState({ status: "error", message: `Live data unavailable: ${window.flowmateUserError(error, "Supabase query failed.")}` });
      }
    }

    loadMembersIfAlive();
    const cleanup = window.attachFlowMateLiveRefresh
      ? window.attachFlowMateLiveRefresh(loadMembersIfAlive)
      : () => {};
    return () => { alive = false; cleanup(); };
  }, []);

  const uiModel = window.getFlowMateTeamSettingsUiModel
    ? window.getFlowMateTeamSettingsUiModel(window.FLOWMATE_CURRENT_USER)
    : { canEditMembers: window.FLOWMATE_CURRENT_USER?.role === "admin", showAdminActions: window.FLOWMATE_CURRENT_USER?.role === "admin" };
  const filterOptions = window.FLOWMATE_TEAM_SETTINGS_FILTERS || [
    { key: "all", label: "All members" },
    { key: "active", label: "Active" },
    { key: "partial", label: "Partial" },
    { key: "leave", label: "On leave" },
  ];
  const safeMembers = (members || []).map(m => ({
    ...m,
    name: m.name || m.display_name || "Unnamed member",
    discipline: m.discipline || m.discipline_short || "",
    skills: m.skills || [],
    availability: m.availability || "available",
    capacityPerDay: Number(m.capacityPerDay ?? m.capacity_per_day ?? 0),
    capacityOverride: m.capacityOverride ?? m.capacity_override_per_day ?? null,
    wipLimit: Number(m.wipLimit ?? m.wip_limit ?? 0),
  }));
  const board = window.getFlowMateTeamSettingsBoard
    ? window.getFlowMateTeamSettingsBoard(safeMembers, filter)
    : [{ title: "Operation", members: safeMembers, unknownCount: 0 }, { title: "Marketing", members: [], unknownCount: 0 }, { title: "GD/VE", members: [], unknownCount: 0 }, { title: "Esport", members: [], unknownCount: 0 }];
  const visibleCount = board.reduce((sum, column) => sum + column.members.length, 0);

  function openEditMember(member) {
    const skills = window.getFlowMateTeamSettingsEditableSkills
      ? window.getFlowMateTeamSettingsEditableSkills(member)
      : (member.skills || []);
    setEditMember(member);
    setEditForm({
      capacityPerDay: member.capacityPerDay ?? 0,
      wipLimit: member.wipLimit ?? 0,
      skills,
    });
    setSaveState({ status: "idle", message: "" });
  }

  function updateEditForm(field, value) {
    setEditForm(current => ({ ...current, [field]: value }));
  }

  function toggleEditSkill(skillKey) {
    setEditForm(current => {
      const values = new Set(current.skills || []);
      if (values.has(skillKey)) values.delete(skillKey);
      else values.add(skillKey);
      return { ...current, skills: Array.from(values) };
    });
  }

  async function saveMemberEdit(event) {
    event.preventDefault();
    if (!editMember || !window.adminUpdateFlowMateTeamMember) return;

    setSaveState({ status: "saving", message: "Saving member settings..." });
    try {
      await window.adminUpdateFlowMateTeamMember(editMember.id, editForm);
      await loadMembers();
      setEditMember(null);
      setSaveState({ status: "idle", message: "" });
    } catch (error) {
      console.error("[FlowMate Settings] Admin member update failed:", error);
      setSaveState({ status: "error", message: window.flowmateUserError(error, "Team member update failed.") });
    }
  }

  function availabilityLabel(member) {
    if (member.availability === "partial") {
      return member.capacityOverride ? `Partial - ${member.capacityOverride} pt/d` : "Partial - no override";
    }
    if (member.availability === "leave") return "On leave";
    return "Available";
  }

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Team settings</h1>
          <div className="page__sub">Members, skills, capacity, and WIP limits used by the assignment engine. {loadState.message}</div>
        </div>
        <div className="page__actions">
          <button className="btn btn--secondary" disabled title="Add member is planned after MVP 1.2"><Icon name="plus" /> Add member (post-MVP 1.2)</button>
        </div>
      </div>

      <div className="filterbar">
        {filterOptions.map(option => (
          <button
            key={option.key}
            className={`chip ${filter === option.key ? "is-active" : ""}`}
            onClick={() => setFilter(option.key)}
          >
            {option.label}
          </button>
        ))}
        <span className="spacer"></span>
        <span className="muted" style={{ fontSize: 12 }}>{visibleCount} members</span>
      </div>

      <div className="team-settings-board">
        {board.map(column => (
          <section key={column.title} className="team-settings-column">
            <div className="team-settings-column__head">
              <div>
                <h2>{column.title}</h2>
                {column.unknownCount > 0 && (
                  <div className="muted" style={{ fontSize: 11 }}>{column.unknownCount} unknown discipline fallback</div>
                )}
              </div>
              <span className="team-settings-column__count">{column.members.length}</span>
            </div>
            <div className="team-settings-column__list">
              {column.members.map(m => (
                (() => {
                  const memberUi = window.getFlowMateTeamSettingsMemberUi
                    ? window.getFlowMateTeamSettingsMemberUi(m, window.FLOWMATE_CURRENT_USER)
                    : { isGdVe: m.discipline === "GD/VE", showCapacityControls: m.discipline === "GD/VE", canEdit: uiModel.showAdminActions && m.discipline === "GD/VE" };
                  return (
                    <div key={m.id || m.name} className="member-card member-card--compact">
                      <div className="member-card__head">
                        <span className="avatar" style={{ background: m.color || "var(--garena-deep-blue)" }}>{m.initials || String(m.name || "?").slice(0, 2).toUpperCase()}</span>
                        <div className="member-card__main">
                          <div className="member-card__name">{m.name}</div>
                          <div className="member-card__discipline">{m.discipline || "Unknown discipline"}</div>
                        </div>
                      </div>
                      <div className={`avail avail--${m.availability}`}>
                        <span className="avail__dot"></span>
                        {availabilityLabel(m)}
                      </div>
                      {memberUi.showCapacityControls && (
                        <>
                          <div className="skill-tags skill-tags--compact">
                            {(m.skills || []).slice(0, 4).map(s => <span key={s} className="tag">{ASSET_LABEL[s.replace("-backup","")] || s}{s.endsWith("backup") && " (backup)"}</span>)}
                            {(m.skills || []).length === 0 && <span className="muted" style={{ fontSize: 12 }}>No skills</span>}
                            {(m.skills || []).length > 4 && <span className="tag">+{m.skills.length - 4}</span>}
                          </div>
                          <div className="member-card__metrics">
                            <div>
                              <div className="member-card__cap-num mono">{m.capacityPerDay || 0}</div>
                              <div className="member-card__cap-lbl">cap pt/day</div>
                            </div>
                            <div>
                              <div className="member-card__cap-num mono">{m.wipLimit || 0}</div>
                              <div className="member-card__cap-lbl">WIP limit</div>
                            </div>
                            {memberUi.canEdit && (
                              <button className="btn btn--xs btn--secondary" onClick={() => openEditMember(m)}><Icon name="pencil" /> Edit</button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()
              ))}
              {column.members.length === 0 && (
                <div className="team-settings-empty">No members match this filter.</div>
              )}
            </div>
          </section>
        ))}
      </div>

      <div className="reason-box" style={{ marginTop: 16 }}>
        <strong>Routing rules</strong> are configured at the team level - not per member. Edits here change GD/VE capacity inputs used by the assignment engine. Leave requests control On leave status by date.
      </div>

      {editMember && uiModel.canEditMembers && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal modal--settings" onSubmit={saveMemberEdit}>
            <div className="modal__head">
              <div>
                <h2>Edit member</h2>
                <div className="muted" style={{ fontSize: 12 }}>{editMember.name}</div>
              </div>
              <button type="button" className="iconbtn" onClick={() => setEditMember(null)} aria-label="Close"><Icon name="x" /></button>
            </div>
            <div className="form-grid">
              <label className="field">
                <span className="field__label">Capacity pt/day</span>
                <input className="input" type="number" min="0" max="24" step="0.25" value={editForm.capacityPerDay} onChange={event => updateEditForm("capacityPerDay", event.target.value)} />
                <span className="field__hint">Normal points this person can handle per day.</span>
              </label>
              <label className="field">
                <span className="field__label">WIP limit</span>
                <input className="input" type="number" min="0" max="20" step="1" value={editForm.wipLimit} onChange={event => updateEditForm("wipLimit", event.target.value)} />
                <span className="field__hint">Maximum active jobs this person should hold at once.</span>
              </label>
              <div className="field field--full">
                <span className="field__label">Skills</span>
                <div className="skill-edit-grid">
                  {(window.FLOWMATE_TEAM_SETTINGS_SKILL_OPTIONS || []).map(option => (
                    <label key={option.key} className="skill-check">
                      <input
                        type="checkbox"
                        checked={(editForm.skills || []).includes(option.key)}
                        onChange={() => toggleEditSkill(option.key)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
                <span className="field__hint">Select the production types this GD/VE member can own. These skills drive auto assignment.</span>
              </div>
            </div>
            {saveState.status === "error" && <div className="reason-box reason-box--need" style={{ marginTop: 12 }}>{saveState.message}</div>}
            <div className="modal__actions">
              <button type="button" className="btn btn--secondary" onClick={() => setEditMember(null)}>Cancel</button>
              <button type="submit" className="btn btn--primary" disabled={saveState.status === "saving"}>{saveState.status === "saving" ? "Saving..." : "Save changes"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { WorkloadScreen, PlanningChannelViewScreen, PlanningCampaignViewScreen, PlanningContentCalendarScreen, KpiScreen, CalendarScreen, TeamGanttScreen, SettingsScreen });
