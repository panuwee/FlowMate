/* AUTO-GENERATED from screens-b.jsx by build-github.cjs. Do not edit; edit the .jsx and re-run `npm run build:github`. */
const {
  useState: useStateB,
  useEffect: useEffectB,
  useRef: useRefB
} = React;
const FLOWMATE_LIST_VIEW_STATE_KEY = "flowmate:list:viewState:v1";
const FLOWMATE_DETAIL_BACK_CONTEXT_KEY = "flowmate:detail:backContext:v1";
const FLOWMATE_BOARD_VIEW_STATE_KEY = "flowmate:board:viewState:v1";
const FLOWMATE_BOARD_SNAPSHOT_TTL_MS = 30_000;
const FLOWMATE_BOARD_WORKSPACE_SNAPSHOTS = new Map();
const flowMateBoardRefreshCoordinators = new Map();
const FLOWMATE_BOARD_CACHE_LIFECYCLE_KEY = "__flowMateBoardCacheLifecycle";
function getFlowMateBoardWorkspaceKey() {
  const activeTeam = window.getFlowMateActiveTeam ? window.getFlowMateActiveTeam() : window.FLOWMATE_ACTIVE_TEAM;
  const workspace = String(activeTeam || "").trim().toLowerCase() || "no-workspace";
  const userId = String(window.FLOWMATE_CURRENT_USER?.id || "signed-out").trim() || "signed-out";
  return `${userId}:${workspace}`;
}
function cloneFlowMateBoardData(value) {
  if (Array.isArray(value)) return value.map(cloneFlowMateBoardData);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneFlowMateBoardData(item)]));
  }
  return value;
}
function cloneFlowMateBoardLanes(lanes) {
  return Object.fromEntries(Object.entries(lanes || {}).map(([status, lane]) => [status, cloneFlowMateBoardData(lane || {})]));
}
function cloneFlowMateBoardSummary(summary) {
  const next = summary || {};
  return {
    ...next,
    counts: {
      ...(next.counts || {})
    },
    wip: {
      ...(next.wip || {}),
      inProgressByOwner: {
        ...(next.wip?.inProgressByOwner || {})
      }
    }
  };
}
function readFlowMateBoardSnapshot(workspaceKey = getFlowMateBoardWorkspaceKey()) {
  const snapshot = FLOWMATE_BOARD_WORKSPACE_SNAPSHOTS.get(workspaceKey);
  if (!snapshot) return null;
  if (snapshot.expiresAt <= Date.now()) {
    FLOWMATE_BOARD_WORKSPACE_SNAPSHOTS.delete(workspaceKey);
    return null;
  }
  return {
    lanes: cloneFlowMateBoardLanes(snapshot.lanes),
    summary: cloneFlowMateBoardSummary(snapshot.summary)
  };
}
function writeFlowMateBoardSnapshot(workspaceKey, changes = {}) {
  const previous = FLOWMATE_BOARD_WORKSPACE_SNAPSHOTS.get(workspaceKey) || {};
  FLOWMATE_BOARD_WORKSPACE_SNAPSHOTS.set(workspaceKey, {
    lanes: changes.lanes ? cloneFlowMateBoardLanes(changes.lanes) : cloneFlowMateBoardLanes(previous.lanes),
    summary: changes.summary ? cloneFlowMateBoardSummary(changes.summary) : cloneFlowMateBoardSummary(previous.summary),
    expiresAt: Date.now() + FLOWMATE_BOARD_SNAPSHOT_TTL_MS
  });
}
function clearFlowMateBoardSnapshot(workspaceKey = getFlowMateBoardWorkspaceKey()) {
  FLOWMATE_BOARD_WORKSPACE_SNAPSHOTS.delete(workspaceKey);
  flowMateBoardRefreshCoordinators.delete(workspaceKey);
}
function clearFlowMateBoardSnapshots() {
  FLOWMATE_BOARD_WORKSPACE_SNAPSHOTS.clear();
  flowMateBoardRefreshCoordinators.clear();
}
function ensureFlowMateBoardCacheLifecycleListeners() {
  const existing = window[FLOWMATE_BOARD_CACHE_LIFECYCLE_KEY];
  if (existing?.cleanup) return existing.cleanup;
  const clearForWorkspaceChange = () => clearFlowMateBoardSnapshots();
  const clearForSignOut = () => clearFlowMateBoardSnapshots();
  window.addEventListener("flowmate:team-workspace-changed", clearForWorkspaceChange);
  window.addEventListener("flowmate:signed-out", clearForSignOut);
  const cleanup = () => {
    window.removeEventListener("flowmate:team-workspace-changed", clearForWorkspaceChange);
    window.removeEventListener("flowmate:signed-out", clearForSignOut);
    if (window[FLOWMATE_BOARD_CACHE_LIFECYCLE_KEY]?.cleanup === cleanup) {
      delete window[FLOWMATE_BOARD_CACHE_LIFECYCLE_KEY];
    }
  };
  window[FLOWMATE_BOARD_CACHE_LIFECYCLE_KEY] = {
    cleanup
  };
  return cleanup;
}
function runFlowMateBoardRefresh(workspaceKey, refresh) {
  const existing = flowMateBoardRefreshCoordinators.get(workspaceKey);
  if (existing) {
    existing.queued = true;
    existing.queuedRefresh = refresh;
    return existing.promise;
  }
  const coordinator = {
    queued: false,
    queuedRefresh: null,
    promise: null
  };
  coordinator.promise = Promise.resolve().then(async () => {
    let activeRefresh = refresh;
    while (activeRefresh) {
      const queuedBeforeActiveRefresh = coordinator.queued ? coordinator.queuedRefresh : null;
      coordinator.queued = false;
      coordinator.queuedRefresh = null;
      await activeRefresh();
      const queuedDuringActiveRefresh = coordinator.queued ? coordinator.queuedRefresh : null;
      coordinator.queued = false;
      coordinator.queuedRefresh = null;
      activeRefresh = queuedDuringActiveRefresh || queuedBeforeActiveRefresh;
    }
  }).finally(() => {
    if (flowMateBoardRefreshCoordinators.get(workspaceKey) === coordinator) {
      flowMateBoardRefreshCoordinators.delete(workspaceKey);
    }
  });
  flowMateBoardRefreshCoordinators.set(workspaceKey, coordinator);
  return coordinator.promise;
}
ensureFlowMateBoardCacheLifecycleListeners();
function readFlowMateListViewState() {
  try {
    const raw = window.sessionStorage && window.sessionStorage.getItem(FLOWMATE_LIST_VIEW_STATE_KEY);
    return raw ? JSON.parse(raw) : window.flowmateListViewState || {};
  } catch {
    return window.flowmateListViewState || {};
  }
}
function saveFlowMateListViewState(state) {
  const next = {
    ...(state || {})
  };
  window.flowmateListViewState = next;
  try {
    if (window.sessionStorage) window.sessionStorage.setItem(FLOWMATE_LIST_VIEW_STATE_KEY, JSON.stringify(next));
  } catch {}
  return next;
}
function saveFlowMateDetailBackContext(context) {
  const next = {
    ...(context || {})
  };
  window.flowmateDetailBackContext = next;
  try {
    if (window.sessionStorage) window.sessionStorage.setItem(FLOWMATE_DETAIL_BACK_CONTEXT_KEY, JSON.stringify(next));
  } catch {}
  return next;
}
function readFlowMateDetailBackContext() {
  try {
    const raw = window.sessionStorage && window.sessionStorage.getItem(FLOWMATE_DETAIL_BACK_CONTEXT_KEY);
    return raw ? JSON.parse(raw) : window.flowmateDetailBackContext || null;
  } catch {
    return window.flowmateDetailBackContext || null;
  }
}
function readFlowMateBoardViewState() {
  try {
    const raw = window.sessionStorage && window.sessionStorage.getItem(FLOWMATE_BOARD_VIEW_STATE_KEY);
    return raw ? JSON.parse(raw) : window.flowmateBoardViewState || {};
  } catch {
    return window.flowmateBoardViewState || {};
  }
}
function saveFlowMateBoardViewState(state) {
  const next = {
    ...(state || {})
  };
  window.flowmateBoardViewState = next;
  try {
    if (window.sessionStorage) window.sessionStorage.setItem(FLOWMATE_BOARD_VIEW_STATE_KEY, JSON.stringify(next));
  } catch {}
  return next;
}
Object.assign(window, {
  readFlowMateListViewState,
  saveFlowMateListViewState,
  saveFlowMateDetailBackContext,
  readFlowMateDetailBackContext,
  readFlowMateBoardViewState,
  saveFlowMateBoardViewState,
  readFlowMateBoardSnapshot,
  writeFlowMateBoardSnapshot,
  clearFlowMateBoardSnapshots,
  ensureFlowMateBoardCacheLifecycleListeners,
  runFlowMateBoardRefresh
});
function exportRowsCsv(rows) {
  const columns = ["ID", "Title", "Type", "Status", "Campaign", "Channel", "Publish Date", "Launch Date", "1st Draft", "Type / Skill", "Asset Count", "Owner", "Requester", "Team", "Asset", "Effort", "Priority"];
  const csvRows = rows.map(w => [w.id, w.title, w.type, STATUS_LABEL[w.status] || w.status, w.campaign || "", w.channel || w.platform || "", w.publishFullLabel || w.publishLabel || w.publishDate || "", w.launchFullLabel || w.launchLabel || w.launchDate || "", w.dueFullLabel || w.dueLabel || w.dueDate || "", w.subtype && typeof getFlowMateCreativeTypeLabel === "function" ? getFlowMateCreativeTypeLabel(w.subtype) : ASSET_LABEL[w.assetType] || w.assetType || "", w.assetCount || "", w.assignee && MEMBERS_BY_ID[w.assignee] ? MEMBERS_BY_ID[w.assignee].name : "Unassigned", w.requester || "", w.requesterTeam || "", ASSET_LABEL[w.assetType] || w.assetType || "", w.effort || "", w.priority || ""]);
  window.flowmateDownloadCsv(`flowmate-list-${new Date().toISOString().slice(0, 10)}.csv`, columns, csvRows);
}
function ListScreen({
  onOpen,
  searchQuery = ""
}) {
  const LIST_STATUS_FILTER_KEYS = ["need_brief", "unassigned", "assigned", "in_progress", "review", "blocked", "queued"];
  const savedListState = readFlowMateListViewState();
  const initialListStatus = LIST_STATUS_FILTER_KEYS.includes(savedListState.filterStatus) ? savedListState.filterStatus : "all";
  const [filterStatus, setFilterStatus] = useStateB(initialListStatus);
  const [filterFlag, setFilterFlag] = useStateB(savedListState.filterFlag || "all");
  const [filterOwner, setFilterOwner] = useStateB(savedListState.filterOwner || "all");
  const [filterTeam, setFilterTeam] = useStateB(savedListState.filterTeam || "all");
  const [filterAsset, setFilterAsset] = useStateB(savedListState.filterAsset || "all");
  const [filterType, setFilterType] = useStateB(savedListState.filterType || "all");
  const [filterCampaign, setFilterCampaign] = useStateB(savedListState.filterCampaign || "all");
  const [filterChannel, setFilterChannel] = useStateB(savedListState.filterChannel || "all");
  const [sourceRows, setSourceRows] = useStateB(WORK);
  const [requesterTeamOptions, setRequesterTeamOptions] = useStateB(TEAMS);
  const [loadState, setLoadState] = useStateB({
    status: "loading",
    message: "Loading Supabase data..."
  });
  useEffectB(() => {
    let alive = true;
    async function loadRows() {
      if (!window.loadFlowMateListRows) {
        setSourceRows([]);
        setLoadState({
          status: "error",
          message: "Live data unavailable: Supabase list loader is not ready."
        });
        return;
      }
      try {
        const rows = await window.loadFlowMateListRows();
        let liveRequesterTeams = [];
        if (window.loadFlowMateRequesterTeams) {
          liveRequesterTeams = await window.loadFlowMateRequesterTeams();
        }
        if (!alive) return;
        setSourceRows(rows);
        if (liveRequesterTeams.length) setRequesterTeamOptions(liveRequesterTeams);
        setLoadState({
          status: "live",
          message: "Live Supabase data"
        });
      } catch (error) {
        if (!alive) return;
        console.error("[FlowMate List] Supabase load failed:", error);
        setSourceRows([]);
        setLoadState({
          status: "error",
          message: `Live data unavailable: ${window.flowmateUserError(error, "Supabase query failed.")}`
        });
      }
    }
    loadRows();
    const cleanup = window.attachFlowMateLiveRefresh ? window.attachFlowMateLiveRefresh(loadRows) : () => {};
    return () => {
      alive = false;
      cleanup();
    };
  }, []);
  function normalizeListTeam(value) {
    const raw = String(value || "").trim();
    if (window.normalizeFlowMateRequesterTeam) {
      const normalized = window.normalizeFlowMateRequesterTeam(value);
      if (normalized) return normalized;
    }
    if (["Operations", "Operation", "OP", "Ops"].includes(raw)) return "Operations";
    if (["Marketing", "MKT"].includes(raw)) return "Marketing";
    if (["GD/VE", "GD", "VE", "Design", "Video"].includes(raw)) return "GD/VE";
    if (["Esport", "eSport", "ES"].includes(raw)) return "Esport";
    return raw;
  }
  function getListMemberTeam(member) {
    return normalizeListTeam(member && (member.discipline || member.discipline_short || member.requesterTeam));
  }
  const memberTeamById = Object.fromEntries((window.MEMBERS || []).map(member => [member.id, getListMemberTeam(member)]));
  function getListWorkAssigneeTeam(work) {
    return memberTeamById[work.assignee] || "";
  }
  function getListCampaignValue(work) {
    return work && work.campaign || "No campaign";
  }
  function getListChannelValues(work) {
    const rawValues = Array.isArray(work && work.platforms) ? work.platforms : String(work && (work.channel || work.platform) || "").split(",");
    const values = rawValues.map(value => String(value || "").trim()).filter(Boolean);
    return values.length ? values : ["No channel"];
  }
  const listVisibleRows = window.getFlowMateListVisibleRows(sourceRows, filterStatus);
  const rows = listVisibleRows.filter(w => {
    if (!window.matchesFlowMateSearch(w, searchQuery)) return false;
    if (filterStatus !== "all" && w.status !== filterStatus) return false;
    if (filterOwner !== "all" && (w.assignee || "unassigned") !== filterOwner) return false;
    if (filterTeam !== "all" && getListWorkAssigneeTeam(w) !== filterTeam) return false;
    if (filterCampaign !== "all" && getListCampaignValue(w) !== filterCampaign) return false;
    if (filterChannel !== "all" && !getListChannelValues(w).includes(filterChannel)) return false;
    if (filterAsset !== "all" && (w.assetType || "none") !== filterAsset) return false;
    if (filterType !== "all" && w.type !== filterType) return false;
    if (filterFlag === "overdue" && !w.overdue) return false;
    if (filterFlag === "duesoon" && !(w.dueDelta != null && w.dueDelta >= 0 && w.dueDelta <= 2)) return false;
    if (filterFlag === "blocked" && w.status !== "blocked") return false;
    return true;
  });
  const scopedOwnerOptionRows = [...(window.MEMBERS || []).filter(member => filterTeam === "all" || getListMemberTeam(member) === filterTeam).map(member => [member.id, member.name]), ...sourceRows.filter(w => filterTeam === "all" || getListWorkAssigneeTeam(w) === filterTeam).map(w => {
    const id = w.assignee || "unassigned";
    const label = w.assignee && MEMBERS_BY_ID[w.assignee] ? MEMBERS_BY_ID[w.assignee].name : "Unassigned";
    return [id, label];
  })];
  const ownerOptions = Array.from(new Map(scopedOwnerOptionRows).entries()).sort((a, b) => a[1].localeCompare(b[1]));
  const teamOptions = requesterTeamOptions;
  const campaignOptions = Array.from(new Set(sourceRows.map(getListCampaignValue))).sort();
  const channelOptions = Array.from(new Set(sourceRows.flatMap(getListChannelValues))).sort();
  const assetOptions = Array.from(new Set(sourceRows.map(w => w.assetType || "none"))).sort();
  const typeOptions = Array.from(new Set(sourceRows.map(w => w.type))).sort();
  useEffectB(() => {
    if (filterOwner !== "all" && !ownerOptions.some(([id]) => id === filterOwner)) {
      setFilterOwner("all");
    }
  }, [filterTeam, filterOwner, sourceRows.length]);
  const currentListViewState = {
    filterStatus,
    filterFlag,
    filterOwner,
    filterTeam,
    filterAsset,
    filterType,
    filterCampaign,
    filterChannel
  };
  useEffectB(() => {
    saveFlowMateListViewState(currentListViewState);
  }, [filterStatus, filterFlag, filterOwner, filterTeam, filterAsset, filterType, filterCampaign, filterChannel]);
  function openListWorkItem(work) {
    saveFlowMateListViewState(currentListViewState);
    saveFlowMateDetailBackContext({
      route: "list",
      label: "Back to List",
      listState: currentListViewState
    });
    window.flowmateSelectedWorkItem = work;
    onOpen(work.id, {
      preserveBackContext: true
    });
  }
  return React.createElement("div", {
    className: "page"
  }, React.createElement("div", {
    className: "page__header"
  }, React.createElement("div", null, React.createElement("h1", {
    className: "page__title"
  }, "All work"), React.createElement("div", {
    className: "page__sub"
  }, sourceRows.length, " items across all statuses - ", loadState.message)), React.createElement("div", {
    className: "page__actions"
  }, React.createElement("button", {
    className: "btn btn--secondary",
    onClick: () => exportRowsCsv(rows)
  }, React.createElement(Icon, {
    name: "download"
  }), " Export"))), React.createElement("div", {
    className: "filterbar"
  }, React.createElement("select", {
    className: "select",
    value: filterStatus,
    onChange: e => setFilterStatus(e.target.value)
  }, React.createElement("option", {
    value: "all"
  }, "All statuses"), LIST_STATUS_FILTER_KEYS.map(k => React.createElement("option", {
    key: k,
    value: k
  }, STATUS_LABEL[k]))), React.createElement("select", {
    className: "select",
    value: filterTeam,
    onChange: e => setFilterTeam(e.target.value)
  }, React.createElement("option", {
    value: "all"
  }, "All teams"), teamOptions.map(t => React.createElement("option", {
    key: t,
    value: t
  }, t))), React.createElement("select", {
    className: "select",
    value: filterOwner,
    onChange: e => setFilterOwner(e.target.value)
  }, React.createElement("option", {
    value: "all"
  }, "All Assignee"), ownerOptions.map(([id, label]) => React.createElement("option", {
    key: id,
    value: id
  }, label))), React.createElement("select", {
    className: "select",
    value: filterCampaign,
    onChange: e => setFilterCampaign(e.target.value)
  }, React.createElement("option", {
    value: "all"
  }, "All campaigns"), campaignOptions.map(campaign => React.createElement("option", {
    key: campaign,
    value: campaign
  }, campaign))), React.createElement("select", {
    className: "select",
    value: filterChannel,
    onChange: e => setFilterChannel(e.target.value)
  }, React.createElement("option", {
    value: "all"
  }, "All channels"), channelOptions.map(channel => React.createElement("option", {
    key: channel,
    value: channel
  }, channel))), React.createElement("select", {
    className: "select",
    value: filterAsset,
    onChange: e => setFilterAsset(e.target.value)
  }, React.createElement("option", {
    value: "all"
  }, "All asset types"), assetOptions.map(a => React.createElement("option", {
    key: a,
    value: a
  }, ASSET_LABEL[a] || a))), React.createElement("select", {
    className: "select",
    value: filterType,
    onChange: e => setFilterType(e.target.value)
  }, React.createElement("option", {
    value: "all"
  }, "All types"), typeOptions.map(t => React.createElement("option", {
    key: t,
    value: t
  }, t === "creative" ? "Creative" : "Quick task"))), React.createElement("span", {
    style: {
      marginLeft: "auto",
      display: "flex",
      gap: 8
    }
  }, React.createElement("button", {
    className: `chip ${filterFlag === "overdue" ? "is-active" : ""}`,
    onClick: () => setFilterFlag(filterFlag === "overdue" ? "all" : "overdue")
  }, "Overdue only"), React.createElement("button", {
    className: `chip ${filterFlag === "duesoon" ? "is-active" : ""}`,
    onClick: () => setFilterFlag(filterFlag === "duesoon" ? "all" : "duesoon")
  }, "Due soon"), React.createElement("button", {
    className: `chip ${filterFlag === "blocked" ? "is-active" : ""}`,
    onClick: () => setFilterFlag(filterFlag === "blocked" ? "all" : "blocked")
  }, "Blocked"))), React.createElement("div", {
    className: "card card__body--flush",
    style: {
      overflow: "hidden"
    }
  }, React.createElement("table", {
    className: "tbl"
  }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", {
    className: "col-id"
  }, "ID"), React.createElement("th", null, "Title"), React.createElement("th", null, "Type"), React.createElement("th", null, "Status"), React.createElement("th", null, "Campaign"), React.createElement("th", null, "Channel"), React.createElement("th", null, "Publish Date"), React.createElement("th", null, "Owner"), React.createElement("th", null, "Requester / Team"), React.createElement("th", null, "Asset"), React.createElement("th", null, "Effort"), React.createElement("th", null, "Priority"), React.createElement("th", null, "1st Draft"), React.createElement("th", null, "Flags"))), React.createElement("tbody", null, rows.map(w => React.createElement("tr", {
    key: w.id,
    className: w.overdue ? "is-overdue" : "",
    onClick: () => openListWorkItem(w)
  }, React.createElement("td", {
    className: "col-id mono"
  }, w.id), React.createElement("td", {
    className: "col-title"
  }, React.createElement("div", null, w.title), React.createElement(AssignmentWarningBadges, {
    work: w,
    limit: 2
  })), React.createElement("td", null, React.createElement(TypePill, {
    type: w.type
  })), React.createElement("td", null, React.createElement(StatusBadge, {
    status: w.status
  })), React.createElement("td", null, React.createElement("span", {
    className: "muted",
    style: {
      fontSize: 12
    }
  }, w.campaign || "-")), React.createElement("td", null, React.createElement("span", {
    className: "muted",
    style: {
      fontSize: 12
    }
  }, w.channel || w.platform || "-")), React.createElement("td", null, React.createElement("span", {
    className: "mono muted",
    style: {
      fontSize: 12
    }
  }, w.publishLabel || "-")), React.createElement("td", null, w.assignee ? React.createElement("span", {
    className: "row",
    style: {
      gap: 6
    }
  }, React.createElement(Avatar, {
    memberId: w.assignee
  }), " ", React.createElement("span", null, MEMBERS_BY_ID[w.assignee] && MEMBERS_BY_ID[w.assignee].name || w.assigneeOtherName || "Unassigned")) : React.createElement("span", {
    className: "muted"
  }, w.assigneeOtherName || "Unassigned")), React.createElement("td", null, React.createElement("div", {
    style: {
      fontSize: 12
    }
  }, w.requester || "-"), React.createElement("div", {
    className: "muted",
    style: {
      fontSize: 11
    }
  }, w.requesterTeam)), React.createElement("td", null, React.createElement("span", {
    className: "muted",
    style: {
      fontSize: 12
    }
  }, ASSET_LABEL[w.assetType] || "-")), React.createElement("td", null, React.createElement(Effort, {
    value: w.effort
  })), React.createElement("td", null, React.createElement(PriorityBadge, {
    level: w.priority
  })), React.createElement("td", null, React.createElement(DueBadge, {
    delta: w.dueDelta,
    label: w.dueLabel,
    status: w.status
  })), React.createElement("td", null, React.createElement("span", {
    className: "row",
    style: {
      gap: 4
    }
  }, w.needsSplit && React.createElement("span", {
    className: "tag",
    style: {
      background: "#FDEFE0",
      color: "#8A4A12"
    }
  }, "Needs split"), React.createElement(AssignmentWarningBadges, {
    work: w,
    limit: 3
  }), w.reviewRound > 0 && React.createElement("span", {
    className: "tag"
  }, "R", w.reviewRound), w.blockReason && React.createElement("span", {
    className: "tag",
    style: {
      background: "var(--garena-red-light-2)",
      color: "var(--garena-red)"
    }
  }, "Blocked")))))))), React.createElement(Source, null, loadState.status === "live" ? "Supabase work_items table" : "No local fallback data", " - ", TODAY));
}
function BoardScreen({
  onOpen,
  searchQuery = ""
}) {
  const columns = [{
    key: "unassigned",
    label: "Unassigned"
  }, {
    key: "assigned",
    label: "Assigned"
  }, {
    key: "in_progress",
    label: "In Progress"
  }, {
    key: "review",
    label: "Review"
  }, {
    key: "blocked",
    label: "Blocked"
  }];
  const emptyLane = {
    status: "idle",
    rows: [],
    total: 0,
    nextCursor: null,
    hasMore: false,
    message: ""
  };
  const savedBoardState = readFlowMateBoardViewState();
  const defaultDeliveredFilters = {
    scope: "recent",
    search: "",
    deliveredMonth: "",
    campaign: "",
    ownerId: ""
  };
  const boardWorkspaceKeyRef = useRefB(null);
  if (!boardWorkspaceKeyRef.current) boardWorkspaceKeyRef.current = getFlowMateBoardWorkspaceKey();
  const [activeTab, setActiveTab] = useStateB(savedBoardState.activeTab === "delivered" ? "delivered" : "active");
  const [lanes, setLanes] = useStateB(() => readFlowMateBoardSnapshot(boardWorkspaceKeyRef.current)?.lanes || Object.fromEntries(columns.map(column => [column.key, {
    ...emptyLane
  }])));
  const [summary, setSummary] = useStateB(() => readFlowMateBoardSnapshot(boardWorkspaceKeyRef.current)?.summary || {
    counts: {},
    wip: {
      inProgressByOwner: {},
      reviewTeamCount: 0,
      reviewTeamLimit: 8
    }
  });
  const [draggingId, setDraggingId] = useStateB(null);
  const [hoverCol, setHoverCol] = useStateB(null);
  const [cardPending, setCardPending] = useStateB({});
  const [cardErrors, setCardErrors] = useStateB({});
  const [refreshing, setRefreshing] = useStateB(false);
  const [loadState, setLoadState] = useStateB({
    status: "loading",
    message: "Loading Active Board..."
  });
  const [flash, setFlash] = useStateB(null);
  const [deliveredFilters, setDeliveredFilters] = useStateB({
    ...defaultDeliveredFilters,
    ...(savedBoardState.deliveredFilters || {})
  });
  const [deliveredCursor, setDeliveredCursor] = useStateB(savedBoardState.deliveredCursor || null);
  const [deliveredCursorStack, setDeliveredCursorStack] = useStateB(Array.isArray(savedBoardState.deliveredCursorStack) ? savedBoardState.deliveredCursorStack : []);
  const [deliveredState, setDeliveredState] = useStateB({
    status: "idle",
    rows: [],
    total: 0,
    nextCursor: null,
    hasMore: false,
    filterOptions: {},
    message: ""
  });
  const deliveredRequestRef = useRefB(0);
  const summaryRequestRef = useRefB(0);
  const activeBoardRequestRef = useRefB(0);
  const laneRequestRef = useRefB(Object.fromEntries(columns.map(column => [column.key, 0])));
  const laneStateRef = useRefB(lanes);
  const laneBodyRefs = useRefB({});
  const laneLoadedCounts = useRefB(savedBoardState.laneLoadedCounts || {});
  const laneScrollPositions = useRefB(savedBoardState.laneScrollPositions || {});
  const activeTabRef = useRefB(activeTab);
  const deliveredFiltersRef = useRefB(deliveredFilters);
  const deliveredCursorRef = useRefB(deliveredCursor);
  const deliveredCursorStackRef = useRefB(deliveredCursorStack);
  laneStateRef.current = lanes;
  activeTabRef.current = activeTab;
  deliveredFiltersRef.current = deliveredFilters;
  deliveredCursorRef.current = deliveredCursor;
  deliveredCursorStackRef.current = deliveredCursorStack;
  function boardError(error, fallback) {
    return window.flowmateUserError ? window.flowmateUserError(error, fallback) : error?.message || fallback;
  }
  function currentBoardViewState(overrides = {}) {
    return {
      activeTab: activeTabRef.current,
      deliveredFilters: deliveredFiltersRef.current,
      deliveredCursor: deliveredCursorRef.current,
      deliveredCursorStack: deliveredCursorStackRef.current,
      laneLoadedCounts: {
        ...laneLoadedCounts.current
      },
      laneScrollPositions: {
        ...laneScrollPositions.current
      },
      ...overrides
    };
  }
  function persistBoardViewState(overrides = {}) {
    return saveFlowMateBoardViewState(currentBoardViewState(overrides));
  }
  function rememberLaneScroll(status, node) {
    if (!node) return;
    laneBodyRefs.current[status] = node;
    laneScrollPositions.current[status] = node.scrollTop || 0;
  }
  function restoreLaneScroll(status) {
    const scrollTop = Number(laneScrollPositions.current[status] || 0);
    window.requestAnimationFrame?.(() => {
      const node = laneBodyRefs.current[status];
      if (node) node.scrollTop = scrollTop;
    });
  }
  async function loadLane(status, {
    append = false,
    isAlive = () => true,
    preserveScroll = true,
    targetCount
  } = {}) {
    if (!window.loadFlowMateBoardLane) {
      setLanes(current => ({
        ...current,
        [status]: {
          ...current[status],
          status: "error",
          message: "Active Board loader is not ready."
        }
      }));
      return false;
    }
    const requestId = ++laneRequestRef.current[status];
    const workspaceKey = boardWorkspaceKeyRef.current;
    const currentLane = laneStateRef.current[status] || emptyLane;
    let cursor = append ? currentLane.nextCursor : null;
    const desiredCount = append ? currentLane.rows.length + 50 : Math.max(50, Number(targetCount || laneLoadedCounts.current[status] || currentLane.rows.length || 0));
    let accumulatedRows = append ? [...currentLane.rows] : [];
    let latestResult = null;
    const nextStatus = append ? "loading-more" : currentLane.rows.length > 0 ? "refreshing" : "loading";
    setLanes(current => ({
      ...current,
      [status]: {
        ...current[status],
        status: nextStatus,
        message: ""
      }
    }));
    try {
      do {
        const pageSize = Math.min(50, Math.max(1, desiredCount - accumulatedRows.length));
        latestResult = await window.loadFlowMateBoardLane({
          status,
          cursor,
          limit: pageSize
        });
        if (!isAlive() || requestId !== laneRequestRef.current[status] || workspaceKey !== boardWorkspaceKeyRef.current) return false;
        accumulatedRows = Array.from(new Map([...accumulatedRows, ...(latestResult.rows || [])].map(row => [row.id, row])).values());
        cursor = latestResult.nextCursor || null;
      } while (cursor && accumulatedRows.length < desiredCount);
      laneLoadedCounts.current[status] = accumulatedRows.length;
      setLanes(current => {
        const nextLane = {
          status: "live",
          rows: accumulatedRows,
          total: latestResult?.total || 0,
          nextCursor: cursor,
          hasMore: Boolean(cursor),
          message: ""
        };
        laneStateRef.current = {
          ...laneStateRef.current,
          [status]: nextLane
        };
        writeFlowMateBoardSnapshot(workspaceKey, {
          lanes: laneStateRef.current
        });
        return {
          ...current,
          [status]: nextLane
        };
      });
      if (preserveScroll) restoreLaneScroll(status);
      persistBoardViewState();
      return true;
    } catch (error) {
      if (!isAlive() || requestId !== laneRequestRef.current[status] || workspaceKey !== boardWorkspaceKeyRef.current) return false;
      console.error(`[FlowMate Board] ${status} lane load failed:`, error);
      setLanes(current => ({
        ...current,
        [status]: {
          ...current[status],
          status: currentLane.rows.length > 0 ? "stale-error" : "error",
          message: boardError(error, "Could not load this lane.")
        }
      }));
      return false;
    }
  }
  async function loadSummary(isAlive = () => true, activeBoardRequestId = activeBoardRequestRef.current) {
    if (!window.loadFlowMateBoardSummary) return false;
    const requestId = ++summaryRequestRef.current;
    try {
      const next = await window.loadFlowMateBoardSummary();
      if (!isAlive() || requestId !== summaryRequestRef.current || activeBoardRequestId !== activeBoardRequestRef.current) return false;
      setSummary(next);
      writeFlowMateBoardSnapshot(boardWorkspaceKeyRef.current, {
        lanes: laneStateRef.current,
        summary: next
      });
      return true;
    } catch (error) {
      if (!isAlive() || requestId !== summaryRequestRef.current || activeBoardRequestId !== activeBoardRequestRef.current) return false;
      console.error("[FlowMate Board] summary load failed:", error);
      setFlash({
        tone: "warn",
        text: boardError(error, "Board counts could not be refreshed.")
      });
      return false;
    }
  }
  async function loadActiveBoard(isAlive = () => true, {
    preserveScroll = true
  } = {}) {
    const requestId = ++activeBoardRequestRef.current;
    const results = await Promise.all([...columns.map(column => loadLane(column.key, {
      isAlive,
      preserveScroll,
      targetCount: Math.max(50, Number(laneLoadedCounts.current[column.key] || laneStateRef.current[column.key]?.rows.length || 0))
    })), loadSummary(isAlive, requestId)]);
    if (isAlive() && requestId === activeBoardRequestRef.current) {
      setLoadState({
        status: results.every(Boolean) ? "live" : "error",
        message: results.every(Boolean) ? "Live Supabase data" : "One or more Board lanes could not be loaded."
      });
    }
  }
  async function refreshActiveBoardPreservingState(isAlive = () => true) {
    columns.forEach(column => rememberLaneScroll(column.key, laneBodyRefs.current[column.key]));
    return runFlowMateBoardRefresh(boardWorkspaceKeyRef.current, () => loadActiveBoard(isAlive, {
      preserveScroll: true
    }));
  }
  async function loadDelivered(cursor = deliveredCursorRef.current, isAlive = () => true, filters = deliveredFiltersRef.current) {
    if (!window.loadFlowMateDeliveredHistory) {
      setDeliveredState(current => ({
        ...current,
        status: "error",
        message: "Delivered history loader is not ready."
      }));
      return false;
    }
    const requestId = ++deliveredRequestRef.current;
    setDeliveredState(current => ({
      ...current,
      status: "loading",
      rows: [],
      hasMore: false,
      message: ""
    }));
    try {
      const result = await window.loadFlowMateDeliveredHistory({
        ...filters,
        cursor,
        limit: 50
      });
      if (!isAlive() || requestId !== deliveredRequestRef.current) return false;
      setDeliveredState({
        status: "live",
        rows: result.rows || [],
        total: result.total || 0,
        nextCursor: result.nextCursor || null,
        hasMore: Boolean(result.hasMore),
        filterOptions: result.filterOptions || {},
        message: ""
      });
      return true;
    } catch (error) {
      if (!isAlive() || requestId !== deliveredRequestRef.current) return false;
      console.error("[FlowMate Delivered] history load failed:", error);
      setDeliveredState(current => ({
        ...current,
        status: "error",
        rows: [],
        message: boardError(error, "Delivered history could not be loaded.")
      }));
      return false;
    }
  }
  useEffectB(() => {
    let alive = true;
    if (activeTab === "active") refreshActiveBoardPreservingState(() => alive);
    return () => {
      alive = false;
    };
  }, [activeTab]);
  useEffectB(() => {
    if (activeTab !== "delivered") return undefined;
    let alive = true;
    const filterSnapshot = {
      ...deliveredFilters
    };
    const timer = setTimeout(() => loadDelivered(deliveredCursor, () => alive, filterSnapshot), 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [activeTab, deliveredFilters.scope, deliveredFilters.search, deliveredFilters.deliveredMonth, deliveredFilters.campaign, deliveredFilters.ownerId, deliveredCursor]);
  useEffectB(() => {
    try {
      const archivedSearchHandoff = window.sessionStorage?.getItem("flowmate:board:archiveSearch");
      if (!archivedSearchHandoff) return;
      window.sessionStorage?.removeItem("flowmate:board:archiveSearch");
      const handoff = JSON.parse(archivedSearchHandoff);
      const query = String(handoff?.query || "").trim();
      selectBoardTab("delivered");
      setDeliveredFilters(current => {
        const next = {
          ...current,
          scope: "archived",
          search: query
        };
        deliveredFiltersRef.current = next;
        return next;
      });
      deliveredCursorRef.current = null;
      deliveredCursorStackRef.current = [];
      setDeliveredCursor(null);
      setDeliveredCursorStack([]);
    } catch (error) {
      try {
        window.sessionStorage?.removeItem("flowmate:board:archiveSearch");
      } catch (cleanupError) {}
      console.warn("[FlowMate Board] Archived-search handoff could not be read:", error && error.message);
    }
  }, []);
  useEffectB(() => {
    function openArchivedSearch(event) {
      const query = String(event?.detail?.query || event?.detail?.search || searchQuery || "").trim();
      selectBoardTab("delivered");
      setDeliveredFilters(current => {
        const next = {
          ...current,
          scope: "archived",
          search: query
        };
        deliveredFiltersRef.current = next;
        return next;
      });
      deliveredCursorRef.current = null;
      deliveredCursorStackRef.current = [];
      setDeliveredCursor(null);
      setDeliveredCursorStack([]);
    }
    window.addEventListener("flowmate:search-archived", openArchivedSearch);
    return () => window.removeEventListener("flowmate:search-archived", openArchivedSearch);
  }, [searchQuery]);
  useEffectB(() => {
    function resetDeliveredNavigation({
      resetTab = true
    } = {}) {
      deliveredRequestRef.current += 1;
      deliveredFiltersRef.current = defaultDeliveredFilters;
      deliveredCursorRef.current = null;
      deliveredCursorStackRef.current = [];
      setDeliveredFilters(defaultDeliveredFilters);
      setDeliveredCursor(null);
      setDeliveredCursorStack([]);
      setDeliveredState({
        status: "idle",
        rows: [],
        total: 0,
        nextCursor: null,
        hasMore: false,
        filterOptions: {},
        message: ""
      });
      if (resetTab) selectBoardTab("active");
    }
    function clearArchivedSearch() {
      if (deliveredFiltersRef.current.scope !== "archived") return;
      resetDeliveredNavigation();
      saveFlowMateBoardViewState(currentBoardViewState({
        activeTab: "active",
        deliveredFilters: defaultDeliveredFilters,
        deliveredCursor: null,
        deliveredCursorStack: []
      }));
    }
    function resetForWorkspaceChange() {
      clearFlowMateBoardSnapshot(boardWorkspaceKeyRef.current);
      boardWorkspaceKeyRef.current = getFlowMateBoardWorkspaceKey();
      clearFlowMateBoardSnapshot(boardWorkspaceKeyRef.current);
      activeBoardRequestRef.current += 1;
      summaryRequestRef.current += 1;
      Object.keys(laneRequestRef.current).forEach(status => {
        laneRequestRef.current[status] += 1;
      });
      laneLoadedCounts.current = {};
      laneScrollPositions.current = {};
      const nextLanes = Object.fromEntries(columns.map(column => [column.key, {
        ...emptyLane
      }]));
      laneStateRef.current = nextLanes;
      setLanes(nextLanes);
      setSummary({
        counts: {},
        wip: {
          inProgressByOwner: {},
          reviewTeamCount: 0,
          reviewTeamLimit: 8
        }
      });
      resetDeliveredNavigation();
      saveFlowMateBoardViewState({
        activeTab: "active",
        deliveredFilters: defaultDeliveredFilters,
        deliveredCursor: null,
        deliveredCursorStack: [],
        laneLoadedCounts: {},
        laneScrollPositions: {}
      });
    }
    function resetForSignedOut() {
      clearFlowMateBoardSnapshots();
      resetForWorkspaceChange();
    }
    window.addEventListener("flowmate:search-cleared", clearArchivedSearch);
    window.addEventListener("flowmate:team-workspace-changed", resetForWorkspaceChange);
    window.addEventListener("flowmate:signed-out", resetForSignedOut);
    return () => {
      window.removeEventListener("flowmate:search-cleared", clearArchivedSearch);
      window.removeEventListener("flowmate:team-workspace-changed", resetForWorkspaceChange);
      window.removeEventListener("flowmate:signed-out", resetForSignedOut);
    };
  }, []);
  useEffectB(() => {
    if (!window.attachFlowMateLiveRefresh) return undefined;
    const refreshCurrent = () => activeTabRef.current === "active" ? refreshActiveBoardPreservingState() : loadDelivered(deliveredCursorRef.current, () => true, {
      ...deliveredFiltersRef.current
    });
    return window.attachFlowMateLiveRefresh(refreshCurrent);
  }, []);
  useEffectB(() => {
    persistBoardViewState();
  }, [activeTab, deliveredFilters.scope, deliveredFilters.search, deliveredFilters.deliveredMonth, deliveredFilters.campaign, deliveredFilters.ownerId, deliveredCursor, deliveredCursorStack]);
  function allActiveRows() {
    return columns.flatMap(column => lanes[column.key]?.rows || []);
  }
  function selectBoardTab(tab) {
    activeTabRef.current = tab;
    setActiveTab(tab);
  }
  function handleBoardTabKeyDown(event) {
    const orderedTabs = ["active", "delivered"];
    const currentIndex = orderedTabs.indexOf(activeTabRef.current);
    let nextTab = null;
    if (event.key === "ArrowRight") nextTab = orderedTabs[(currentIndex + 1) % orderedTabs.length];
    if (event.key === "ArrowLeft") nextTab = orderedTabs[(currentIndex - 1 + orderedTabs.length) % orderedTabs.length];
    if (event.key === "Home") nextTab = orderedTabs[0];
    if (event.key === "End") nextTab = orderedTabs[orderedTabs.length - 1];
    if (!nextTab) return;
    event.preventDefault();
    selectBoardTab(nextTab);
    window.requestAnimationFrame?.(() => window.document?.getElementById(`flowmate-board-tab-${nextTab}`)?.focus());
  }
  function canTransitionBoardWork(row) {
    if (!row?.isSupabaseRow || row.archivedAt) return false;
    const currentUser = window.FLOWMATE_CURRENT_USER || {};
    if (currentUser.role === "admin") return true;
    const owner = window.MEMBERS_BY_ID?.[row.assignee];
    return Boolean(currentUser.id && (currentUser.id === row.requesterUserId || currentUser.id === row.assigneeUserId || currentUser.id === owner?.userId || currentUser.id === row.marketingPlanSubPicUserId || currentUser.team_member_id === row.assignee));
  }
  function boardTransitionTargets(row) {
    if (!canTransitionBoardWork(row) || row.type === "quick") return [];
    const targetsByStatus = {
      assigned: ["in_progress", "blocked"],
      in_progress: ["review", "blocked"],
      review: ["in_progress", "blocked"],
      blocked: ["in_progress"]
    };
    return targetsByStatus[row.status] || [];
  }
  function setDeliveredFilter(key, value) {
    setDeliveredState(current => ({
      ...current,
      status: "loading",
      rows: [],
      hasMore: false,
      message: ""
    }));
    setDeliveredFilters(current => {
      const next = {
        ...current,
        [key]: value
      };
      deliveredFiltersRef.current = next;
      return next;
    });
    deliveredCursorRef.current = null;
    deliveredCursorStackRef.current = [];
    setDeliveredCursor(null);
    setDeliveredCursorStack([]);
  }
  function resetDeliveredFilters() {
    setDeliveredState(current => ({
      ...current,
      status: "loading",
      rows: [],
      hasMore: false,
      message: ""
    }));
    deliveredFiltersRef.current = defaultDeliveredFilters;
    deliveredCursorRef.current = null;
    deliveredCursorStackRef.current = [];
    setDeliveredFilters(defaultDeliveredFilters);
    setDeliveredCursor(null);
    setDeliveredCursorStack([]);
  }
  function showPreviousDeliveredPage() {
    const stack = [...deliveredCursorStackRef.current];
    const previous = stack.pop() || null;
    deliveredCursorStackRef.current = stack;
    deliveredCursorRef.current = previous;
    setDeliveredState(current => ({
      ...current,
      status: "loading",
      rows: [],
      hasMore: false,
      message: ""
    }));
    setDeliveredCursorStack(stack);
    setDeliveredCursor(previous);
  }
  function showNextDeliveredPage() {
    if (!deliveredState.hasMore || !deliveredState.nextCursor) return;
    const stack = [...deliveredCursorStackRef.current, deliveredCursorRef.current];
    deliveredCursorStackRef.current = stack;
    deliveredCursorRef.current = deliveredState.nextCursor;
    setDeliveredState(current => ({
      ...current,
      status: "loading",
      rows: [],
      hasMore: false,
      message: ""
    }));
    setDeliveredCursorStack(stack);
    setDeliveredCursor(deliveredState.nextCursor);
  }
  function openListForStatus(status) {
    saveFlowMateListViewState({
      ...readFlowMateListViewState(),
      filterStatus: status
    });
    window.location.hash = "list";
  }
  function openActiveWork(row) {
    window.flowmateSelectedWorkItem = row;
    const boardViewState = persistBoardViewState({
      activeTab: "active"
    });
    saveFlowMateDetailBackContext({
      route: "board",
      label: "Back to Active Board",
      boardTab: "active",
      boardViewState
    });
    onOpen(row.id);
  }
  function openDeliveredWork(row) {
    window.flowmateSelectedWorkItem = null;
    const boardViewState = persistBoardViewState({
      activeTab: "delivered"
    });
    saveFlowMateDetailBackContext({
      route: "board",
      label: "Back to Delivered",
      boardTab: "delivered",
      deliveredFilters,
      boardViewState
    });
    onOpen(row.id);
  }
  async function runCardMutation(row, mutation, successText) {
    setCardPending(current => ({
      ...current,
      [row.id]: true
    }));
    setCardErrors(current => ({
      ...current,
      [row.id]: ""
    }));
    try {
      await mutation();
      setLanes(current => ({
        ...current,
        [row.status]: {
          ...current[row.status],
          rows: current[row.status].rows.filter(item => item.id !== row.id)
        }
      }));
      setFlash({
        tone: "ok",
        text: successText
      });
      await refreshActiveBoardPreservingState();
    } catch (error) {
      console.error("[FlowMate Board] card transition failed:", error);
      const message = boardError(error, "Transition rejected by backend.");
      setCardErrors(current => ({
        ...current,
        [row.id]: message
      }));
      setFlash({
        tone: "bad",
        text: message
      });
      await refreshActiveBoardPreservingState();
    } finally {
      setCardPending(current => ({
        ...current,
        [row.id]: false
      }));
    }
  }
  async function completeWork(row) {
    if (!canTransitionBoardWork(row)) {
      setCardErrors(current => ({
        ...current,
        [row.id]: "You do not have permission to change this work item."
      }));
      return false;
    }
    if (row.type === "quick") {
      const mutation = window.FLOWMATE_CURRENT_USER?.role === "admin" ? () => window.transitionFlowMateWorkStatus(row.id, "delivered", {}) : () => window.completeFlowMateQuickTask(row.id);
      return runCardMutation(row, mutation, `${row.id} marked done.`);
    }
    if (row.status !== "review") {
      setCardErrors(current => ({
        ...current,
        [row.id]: "Creative work can be delivered from Review."
      }));
      return false;
    }
    const deliveryLink = await window.flowmatePrompt({
      title: "Mark Delivered",
      label: "Delivery link",
      placeholder: "https://drive.google.com/...",
      required: true,
      validate: value => window.flowmateSafeHttpUrl(value) ? null : "Enter a valid http(s) link."
    });
    if (!deliveryLink) return false;
    return runCardMutation(row, () => window.transitionFlowMateWorkStatus(row.id, "delivered", {
      deliveryLink
    }), `${row.id} marked Delivered.`);
  }
  function handleDragStart(event, row) {
    if (!canTransitionBoardWork(row) || row.type === "quick" || cardPending[row.id]) return event.preventDefault();
    setDraggingId(row.id);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", row.id);
    }
  }
  function handleDragEnd() {
    setDraggingId(null);
    setHoverCol(null);
  }
  async function moveBoardWork(row, targetStatus) {
    if (!row || row.status === targetStatus || !canTransitionBoardWork(row)) return false;
    if (targetStatus === "unassigned") {
      setFlash({
        tone: "warn",
        text: "Open Detail to clear or change an assignee."
      });
      return false;
    }
    if (row.type === "quick") {
      setFlash({
        tone: "warn",
        text: "Use the card action for Quick Task status changes."
      });
      return false;
    }
    const options = {};
    if (targetStatus === "review") {
      const deliveryLink = await window.flowmatePrompt({
        title: "Submit for review",
        label: "Delivery link",
        required: true,
        validate: value => window.flowmateSafeHttpUrl(value) ? null : "Enter a valid http(s) link."
      });
      if (!deliveryLink) return;
      options.deliveryLink = deliveryLink;
    }
    if (targetStatus === "blocked") {
      const blockedReason = await window.flowmatePrompt({
        title: "Block work",
        label: "Blocked reason",
        multiline: true,
        required: true
      });
      if (!blockedReason) return;
      options.blockedReason = blockedReason;
    }
    await runCardMutation(row, () => window.transitionFlowMateWorkStatus(row.id, targetStatus, options), `${row.id} moved to ${STATUS_LABEL[targetStatus]}.`);
    return true;
  }
  async function handleDrop(event, targetStatus) {
    event.preventDefault();
    setHoverCol(null);
    const id = draggingId || event.dataTransfer?.getData("text/plain");
    setDraggingId(null);
    const row = allActiveRows().find(item => item.id === id);
    return moveBoardWork(row, targetStatus);
  }
  function laneWipSignal(status) {
    if (status === "review") {
      const count = Number(summary.wip?.reviewTeamCount || 0);
      const limit = Number(summary.wip?.reviewTeamLimit || 8);
      return {
        text: count > limit ? `${count}/${limit} over by ${count - limit}` : `${count}/${limit} team queue`,
        isWarning: count > limit
      };
    }
    if (status === "in_progress") {
      const atLimit = Object.values(summary.wip?.inProgressByOwner || {}).filter(owner => owner.limit > 0 && owner.count >= owner.limit);
      if (!atLimit.length) return {
        text: "Member WIP within limits",
        isWarning: false
      };
      return {
        text: atLimit.map(owner => `${owner.name} ${owner.count}/${owner.limit} ${owner.count > owner.limit ? "over limit" : "at limit"}`).join("; "),
        isWarning: true
      };
    }
    return {
      text: "",
      isWarning: false
    };
  }
  async function handleBoardRefresh() {
    setRefreshing(true);
    setFlash(null);
    setLoadState({
      status: "loading",
      message: "Refreshing board data..."
    });
    try {
      if (activeTab === "active") await refreshActiveBoardPreservingState();else await loadDelivered();
      window.dispatchEvent(new CustomEvent("flowmate:refresh-counts"));
      setFlash({
        tone: "ok",
        text: "Board refreshed."
      });
    } finally {
      setRefreshing(false);
    }
  }
  const campaigns = deliveredState.filterOptions.campaigns || [];
  const owners = deliveredState.filterOptions.owners || [];
  const hasDeliveredFilters = Boolean(deliveredFilters.search || deliveredFilters.deliveredMonth || deliveredFilters.campaign || deliveredFilters.ownerId || deliveredFilters.scope !== "recent");
  return React.createElement("div", {
    className: "page board-page"
  }, React.createElement("div", {
    className: "page__header board-page__header"
  }, React.createElement("div", null, React.createElement("h1", {
    className: "page__title"
  }, "Board"), React.createElement("div", {
    className: "page__sub"
  }, "Five active workflow lanes and a separate Delivered history. Backend permissions remain authoritative. ", React.createElement("span", {
    className: "muted"
  }, loadState.message))), React.createElement("div", {
    className: "page__actions"
  }, React.createElement("button", {
    type: "button",
    className: "btn btn--secondary",
    onClick: handleBoardRefresh,
    disabled: refreshing
  }, React.createElement(Icon, {
    name: "rerun"
  }), " ", refreshing ? "Refreshing..." : "Refresh"))), React.createElement("div", {
    className: "board-tabs",
    role: "tablist",
    "aria-label": "Board views"
  }, React.createElement("button", {
    type: "button",
    id: "flowmate-board-tab-active",
    role: "tab",
    "aria-selected": activeTab === "active",
    "aria-controls": "flowmate-board-panel-active",
    tabIndex: activeTab === "active" ? 0 : -1,
    className: activeTab === "active" ? "is-active" : "",
    onKeyDown: handleBoardTabKeyDown,
    onClick: () => selectBoardTab("active")
  }, "Active Board"), React.createElement("button", {
    type: "button",
    id: "flowmate-board-tab-delivered",
    role: "tab",
    "aria-selected": activeTab === "delivered",
    "aria-controls": "flowmate-board-panel-delivered",
    tabIndex: activeTab === "delivered" ? 0 : -1,
    className: activeTab === "delivered" ? "is-active" : "",
    onKeyDown: handleBoardTabKeyDown,
    onClick: () => selectBoardTab("delivered")
  }, "Delivered")), React.createElement("div", {
    className: "board-announcer",
    "aria-live": "polite",
    "aria-atomic": "true"
  }, flash?.text || Object.values(cardErrors).filter(Boolean)[0] || ""), flash && React.createElement("div", {
    className: `reason-box board-flash ${flash.tone === "bad" ? "reason-box--need" : flash.tone === "warn" ? "reason-box--queued" : ""}`
  }, flash.text, React.createElement("button", {
    type: "button",
    className: "btn btn--xs btn--ghost",
    onClick: () => setFlash(null)
  }, "Dismiss")), activeTab === "active" ? React.createElement("div", {
    id: "flowmate-board-panel-active",
    className: "kanban board-active",
    role: "tabpanel",
    "aria-labelledby": "flowmate-board-tab-active",
    tabIndex: "0",
    "aria-label": "Active work lanes"
  }, columns.map(column => {
    const lane = lanes[column.key] || emptyLane;
    const isHover = hoverCol === column.key;
    const wipSignal = laneWipSignal(column.key);
    return React.createElement("section", {
      className: `kcol board-lane ${isHover ? "is-drop-target" : ""}`,
      key: column.key,
      "aria-labelledby": `board-lane-${column.key}`,
      onDragOver: event => {
        event.preventDefault();
        setHoverCol(column.key);
      },
      onDragLeave: () => setHoverCol(null),
      onDrop: event => handleDrop(event, column.key)
    }, React.createElement("div", {
      className: "kcol__head board-lane__head"
    }, React.createElement("div", null, React.createElement("h2", {
      id: `board-lane-${column.key}`,
      className: "kcol__title"
    }, column.label), wipSignal.text && React.createElement("div", {
      className: `board-wip ${wipSignal.isWarning ? "is-warning" : ""}`
    }, React.createElement(Icon, {
      name: "alert",
      size: 11
    }), " ", wipSignal.text)), React.createElement("span", {
      className: "kcol__count",
      "aria-label": `${lane.total} ${column.label} tasks`
    }, lane.total)), React.createElement("div", {
      className: "kcol__body board-lane__body",
      ref: node => {
        if (node) laneBodyRefs.current[column.key] = node;
      },
      onScroll: event => {
        rememberLaneScroll(column.key, event.currentTarget);
        persistBoardViewState();
      }
    }, lane.status === "loading" && lane.rows.length === 0 && React.createElement("div", {
      className: "board-state",
      role: "status"
    }, "Loading ", column.label, "..."), (lane.status === "error" || lane.status === "stale-error") && React.createElement("div", {
      className: "board-state board-state--error",
      role: "alert"
    }, lane.message, React.createElement("button", {
      type: "button",
      className: "btn btn--xs btn--secondary",
      onClick: () => loadLane(column.key)
    }, "Retry")), lane.rows.map(w => {
      const row = w;
      const pending = Boolean(cardPending[row.id]);
      return React.createElement("article", {
        key: row.id,
        className: `kcard board-card ${pending ? "is-pending" : ""}`,
        draggable: canTransitionBoardWork(row) && row.type !== "quick" && !pending && row.status !== "unassigned",
        onDragStart: event => handleDragStart(event, row),
        onDragEnd: handleDragEnd,
        onClick: () => openActiveWork(row),
        "aria-label": `${row.id}, ${row.title}, ${column.label}${row.priority === "urgent" ? ", Urgent" : ""}${row.blockReason ? `, Blocked reason: ${row.blockReason}` : ""}`
      }, React.createElement("div", {
        className: "board-card__top"
      }, React.createElement("span", {
        className: "kcard__id mono"
      }, row.id), React.createElement(PriorityBadge, {
        level: row.priority
      })), React.createElement("div", {
        className: "kcard__title"
      }, row.title), React.createElement(AssignmentWarningBadges, {
        work: row,
        limit: 2
      }), React.createElement("div", {
        className: "kcard__row"
      }, React.createElement(Avatar, {
        memberId: row.assignee
      }), React.createElement("span", {
        className: "board-card__owner"
      }, row.ownerName || "Unassigned"), React.createElement(Effort, {
        value: row.effort
      }), React.createElement(Progress, row.checklist || {
        done: 0,
        total: 0
      })), React.createElement("div", {
        className: "kcard__row"
      }, React.createElement(DueBadge, {
        delta: row.dueDelta,
        label: row.dueLabel,
        status: row.status
      })), row.blockReason && React.createElement("div", {
        className: "kcard__row kcard__row--meta board-card__blocked"
      }, React.createElement(Icon, {
        name: "alert",
        size: 11
      }), " Blocked: ", row.blockReason), React.createElement("div", {
        className: "board-card__actions",
        onClick: event => event.stopPropagation(),
        onKeyDown: event => event.stopPropagation()
      }, row.type === "quick" && canTransitionBoardWork(row) && React.createElement("button", {
        type: "button",
        className: "btn btn--xs btn--secondary",
        disabled: pending,
        onClick: () => completeWork(row)
      }, pending ? "Working..." : "Mark done"), row.type === "creative" && row.status === "review" && canTransitionBoardWork(row) && React.createElement("button", {
        type: "button",
        className: "btn btn--xs btn--primary",
        disabled: pending,
        onClick: () => completeWork(row)
      }, pending ? "Working..." : "Mark Delivered"), React.createElement("details", {
        className: "board-card-menu"
      }, React.createElement("summary", {
        "aria-label": `Actions for ${row.id}`
      }, "Actions"), React.createElement("div", {
        className: "board-card-menu__items"
      }, React.createElement("button", {
        type: "button",
        onClick: () => openActiveWork(row)
      }, "Open detail"), boardTransitionTargets(row).map(target => React.createElement("button", {
        type: "button",
        key: target,
        disabled: pending,
        onClick: () => moveBoardWork(row, target)
      }, "Move to ", STATUS_LABEL[target]))))), cardErrors[row.id] && React.createElement("div", {
        className: "board-card__error",
        role: "alert"
      }, cardErrors[row.id]));
    }), lane.status === "live" && lane.rows.length === 0 && React.createElement("div", {
      className: "board-state"
    }, column.key === "blocked" ? "No blocked items." : `No ${column.label} work.`), lane.hasMore && React.createElement("button", {
      type: "button",
      className: "btn btn--sm btn--secondary board-load-more",
      disabled: lane.status === "loading-more",
      onClick: () => loadLane(column.key, {
        append: true
      })
    }, lane.status === "loading-more" ? "Loading..." : `Load more (${lane.rows.length} of ${lane.total})`), React.createElement("button", {
      type: "button",
      className: "board-view-list",
      onClick: () => openListForStatus(column.key)
    }, "View all in List")));
  })) : React.createElement("section", {
    id: "flowmate-board-panel-delivered",
    className: "delivered-history",
    role: "tabpanel",
    "aria-labelledby": "flowmate-board-tab-delivered",
    tabIndex: "0"
  }, React.createElement("div", {
    className: "delivered-history__header"
  }, React.createElement("div", null, React.createElement("h2", {
    id: "delivered-history-title"
  }, "Delivered history"), React.createElement("p", null, deliveredState.total, " items match the current server filters.")), hasDeliveredFilters && React.createElement("button", {
    type: "button",
    className: "btn btn--sm btn--secondary",
    onClick: resetDeliveredFilters
  }, "Reset filters")), React.createElement("div", {
    className: "delivered-filters"
  }, React.createElement("label", null, "Search", React.createElement("input", {
    className: "input",
    type: "search",
    value: deliveredFilters.search,
    onChange: event => setDeliveredFilter("search", event.target.value),
    placeholder: "ID, title or campaign"
  })), React.createElement("label", null, "Delivered month", React.createElement("input", {
    className: "input",
    type: "month",
    value: deliveredFilters.deliveredMonth,
    onChange: event => setDeliveredFilter("deliveredMonth", event.target.value)
  })), React.createElement("label", null, "Campaign", React.createElement("select", {
    className: "select",
    value: deliveredFilters.campaign,
    onChange: event => setDeliveredFilter("campaign", event.target.value)
  }, React.createElement("option", {
    value: ""
  }, "All campaigns"), campaigns.map(campaign => React.createElement("option", {
    key: campaign.value || campaign,
    value: campaign.value || campaign
  }, campaign.label || campaign)))), React.createElement("label", null, "Owner", React.createElement("select", {
    className: "select",
    value: deliveredFilters.ownerId,
    onChange: event => setDeliveredFilter("ownerId", event.target.value)
  }, React.createElement("option", {
    value: ""
  }, "All owners"), owners.map(owner => React.createElement("option", {
    key: owner.id || owner.value,
    value: owner.id || owner.value
  }, owner.name || owner.label)))), React.createElement("label", null, "Scope", React.createElement("select", {
    className: "select",
    value: deliveredFilters.scope,
    onChange: event => setDeliveredFilter("scope", event.target.value)
  }, React.createElement("option", {
    value: "recent"
  }, "Last 60 days"), React.createElement("option", {
    value: "archived"
  }, "Archived")))), deliveredState.status === "loading" && React.createElement("div", {
    className: "board-state",
    role: "status"
  }, "Loading Delivered history..."), deliveredState.status === "error" && React.createElement("div", {
    className: "board-state board-state--error",
    role: "alert"
  }, deliveredState.message, React.createElement("button", {
    type: "button",
    className: "btn btn--sm btn--secondary",
    onClick: () => loadDelivered()
  }, "Retry")), deliveredState.status === "live" && deliveredState.rows.length === 0 && React.createElement("div", {
    className: "board-state"
  }, hasDeliveredFilters ? "No Delivered items match these filters." : "No Delivered items yet."), deliveredState.rows.length > 0 && React.createElement("div", {
    className: "delivered-table-wrap"
  }, React.createElement("table", {
    className: "tbl delivered-table"
  }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "ID / Title"), React.createElement("th", null, "Campaign"), React.createElement("th", null, "Owner"), React.createElement("th", null, "Delivered at"), React.createElement("th", null, "Due result"), React.createElement("th", null, "Work type"), React.createElement("th", null, "Action"))), React.createElement("tbody", null, deliveredState.rows.map(row => React.createElement("tr", {
    key: row.workItemId || row.id
  }, React.createElement("td", {
    "data-label": "ID / Title"
  }, React.createElement("strong", {
    className: "mono"
  }, row.id), React.createElement("span", null, row.title), row.legacyMissingDeliveredAt && React.createElement("span", {
    className: "tag"
  }, "Legacy date missing")), React.createElement("td", {
    "data-label": "Campaign"
  }, row.campaign || "-"), React.createElement("td", {
    "data-label": "Owner"
  }, row.ownerName || "Unassigned"), React.createElement("td", {
    "data-label": "Delivered at"
  }, row.deliveredLabel || "Needs review"), React.createElement("td", {
    "data-label": "Due result"
  }, React.createElement("span", {
    className: `delivery-result delivery-result--${row.dueResult || "unknown"}`
  }, row.dueResult || "Unknown")), React.createElement("td", {
    "data-label": "Work type"
  }, row.type === "quick" ? "Quick task" : "Creative"), React.createElement("td", {
    "data-label": "Action"
  }, React.createElement("button", {
    type: "button",
    className: "btn btn--sm btn--secondary",
    onClick: () => openDeliveredWork(row)
  }, "Open detail"))))))), React.createElement("div", {
    className: "delivered-pagination",
    "aria-label": "Delivered history pagination"
  }, React.createElement("button", {
    type: "button",
    className: "btn btn--sm btn--secondary",
    disabled: !deliveredCursorStack.length || deliveredState.status === "loading",
    onClick: showPreviousDeliveredPage
  }, "Previous"), React.createElement("span", null, deliveredCursorStack.length + 1), React.createElement("button", {
    type: "button",
    className: "btn btn--sm btn--secondary",
    disabled: !deliveredState.hasMore || deliveredState.status === "loading",
    onClick: showNextDeliveredPage
  }, "Next"))));
}
const FLOWMATE_ATTENTION_CATEGORIES_B = [{
  code: "unassigned",
  label: "Unassigned",
  hint: "Choose an active GD/VE owner from the work item detail."
}, {
  code: "over_capacity",
  label: "Over capacity",
  hint: "Owner workload exceeds their normal daily capacity; review priority or reassign the task."
}, {
  code: "wip_exceeded",
  label: "WIP exceeded",
  hint: "Owner has more active production work than their WIP limit."
}, {
  code: "skill_mismatch",
  label: "Skill mismatch",
  hint: "Assigned owner does not have the requested primary skill."
}, {
  code: "backup_skill",
  label: "Backup skill",
  hint: "Assignment used a configured backup skill."
}, {
  code: "member_partial",
  label: "Partial availability",
  hint: "Assigned owner has partial availability."
}, {
  code: "member_on_leave",
  label: "Member on leave",
  hint: "Assigned owner has leave during the production window."
}, {
  code: "deadline_capacity_gap",
  label: "Deadline capacity gap",
  hint: "Available capacity does not fully cover work before 1st Draft."
}, {
  code: "review_buffer_risk",
  label: "Review buffer risk",
  hint: "The review window before Launch is compressed."
}, {
  code: "review_delay",
  label: "Review delay",
  hint: "Requester review is past the at-risk date."
}, {
  code: "blocked",
  label: "Blocked",
  hint: "Resolve the recorded blocker before production can continue."
}, {
  code: "needs_split",
  label: "Needs split",
  hint: "Split the combined deliverables while retaining the assigned owner."
}];
function flowMateAttentionContextB(work, categoryCode) {
  const warning = (window.getFlowMateAssignmentWarnings ? window.getFlowMateAssignmentWarnings(work) : []).find(item => item.code === categoryCode);
  if (warning && warning.message) return warning.message;
  if (categoryCode === "unassigned") return work.assignmentReason || "Task is ready but needs manual assignment.";
  if (categoryCode === "review_delay") return `Review is delayed${work.dueFullLabel || work.dueLabel ? ` past ${work.dueFullLabel || work.dueLabel}` : ""}.`;
  if (categoryCode === "blocked") return work.blockReason || "Production is blocked.";
  if (categoryCode === "needs_split") return "Combined deliverables need to be split for production tracking.";
  return work.assignmentReason || "Open the detail view for assignment context.";
}
function QueueScreen({
  onOpen,
  searchQuery = ""
}) {
  const [sourceRows, setSourceRows] = useStateB(WORK);
  const [loadState, setLoadState] = useStateB({
    status: "loading",
    message: "Loading Supabase data..."
  });
  useEffectB(() => {
    let alive = true;
    async function loadRows() {
      if (!window.loadFlowMateListRows) {
        setSourceRows([]);
        setLoadState({
          status: "error",
          message: "Live data unavailable: Supabase list loader is not ready."
        });
        return;
      }
      try {
        const rows = await window.loadFlowMateListRows();
        if (!alive) return;
        setSourceRows(rows);
        setLoadState({
          status: "live",
          message: "Live Supabase data"
        });
      } catch (error) {
        if (!alive) return;
        console.error("[FlowMate Attention] Supabase load failed:", error);
        setSourceRows([]);
        setLoadState({
          status: "error",
          message: `Live data unavailable: ${window.flowmateUserError(error, "Supabase query failed.")}`
        });
      }
    }
    loadRows();
    const cleanup = window.attachFlowMateLiveRefresh ? window.attachFlowMateLiveRefresh(loadRows) : () => {};
    return () => {
      alive = false;
      cleanup();
    };
  }, []);
  const attentionRows = window.getFlowMateAttentionRows ? window.getFlowMateAttentionRows(sourceRows, searchQuery) : [];
  const attentionGroups = window.getFlowMateAttentionGroups ? window.getFlowMateAttentionGroups(sourceRows, searchQuery) : {};
  function openAttentionItem(work) {
    window.flowmateSelectedWorkItem = work;
    onOpen(work.id);
  }
  return React.createElement("div", {
    className: "page"
  }, React.createElement("div", {
    className: "page__header"
  }, React.createElement("div", null, React.createElement("h1", {
    className: "page__title"
  }, "Attention Needed"), React.createElement("div", {
    className: "page__sub"
  }, "Advisory assignment and delivery risks that need a human decision - ", loadState.message))), React.createElement("div", {
    className: "stat-strip",
    style: {
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))"
    }
  }, React.createElement("div", {
    className: "stat stat--accent"
  }, React.createElement("div", {
    className: "stat__num"
  }, attentionRows.length), React.createElement("div", {
    className: "stat__lbl"
  }, "Unique tasks"), React.createElement("div", {
    className: "stat__delta"
  }, "counted once")), React.createElement("div", {
    className: "stat stat--warn"
  }, React.createElement("div", {
    className: "stat__num"
  }, (attentionGroups.unassigned || []).length), React.createElement("div", {
    className: "stat__lbl"
  }, "Unassigned")), React.createElement("div", {
    className: "stat stat--warn"
  }, React.createElement("div", {
    className: "stat__num"
  }, (attentionGroups.over_capacity || []).length + (attentionGroups.deadline_capacity_gap || []).length), React.createElement("div", {
    className: "stat__lbl"
  }, "Capacity risk")), React.createElement("div", {
    className: "stat stat--accent"
  }, React.createElement("div", {
    className: "stat__num"
  }, (attentionGroups.blocked || []).length + (attentionGroups.review_delay || []).length), React.createElement("div", {
    className: "stat__lbl"
  }, "Delivery risk signals"))), FLOWMATE_ATTENTION_CATEGORIES_B.map(category => React.createElement(AttentionGroup, {
    key: category.code,
    category: category,
    items: attentionGroups[category.code] || [],
    onOpen: openAttentionItem
  })), attentionRows.length === 0 && loadState.status !== "loading" && React.createElement("div", {
    className: "card"
  }, React.createElement("div", {
    className: "card__body"
  }, React.createElement("span", {
    className: "muted"
  }, "No tasks currently need attention."))));
}
function AttentionGroup({
  category,
  items,
  onOpen
}) {
  if (!items.length) return null;
  return React.createElement("section", {
    className: "section",
    "aria-labelledby": `attention-${category.code}`
  }, React.createElement("div", {
    className: "section__head"
  }, React.createElement("span", {
    className: "section__title",
    id: `attention-${category.code}`
  }, category.label), React.createElement("span", {
    className: "section__count"
  }, items.length), React.createElement("span", {
    className: "spacer"
  }), React.createElement("span", {
    className: "muted",
    style: {
      fontSize: 12
    }
  }, category.hint)), React.createElement("table", {
    className: "tbl"
  }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", {
    className: "col-id"
  }, "ID"), React.createElement("th", null, "Title"), React.createElement("th", null, "Status"), React.createElement("th", null, "Owner"), React.createElement("th", null, "Due"), React.createElement("th", {
    style: {
      width: "36%"
    }
  }, "Actionable context"), React.createElement("th", {
    className: "col-right"
  }, "Action"))), React.createElement("tbody", null, items.map(work => React.createElement("tr", {
    key: `${category.code}:${work.id}`,
    onClick: () => onOpen(work)
  }, React.createElement("td", {
    className: "col-id mono"
  }, work.id), React.createElement("td", {
    className: "col-title"
  }, React.createElement("div", null, work.title), React.createElement(AssignmentWarningBadges, {
    work: work,
    limit: 2
  })), React.createElement("td", null, React.createElement(StatusBadge, {
    status: work.status
  })), React.createElement("td", null, work.assignee && MEMBERS_BY_ID[work.assignee] ? MEMBERS_BY_ID[work.assignee].name : "Unassigned"), React.createElement("td", null, React.createElement(DueBadge, {
    delta: work.dueDelta,
    label: work.dueLabel,
    status: work.status
  })), React.createElement("td", null, React.createElement("div", {
    className: "reason-box reason-box--queued",
    style: {
      padding: "6px 10px",
      fontSize: 12
    }
  }, flowMateAttentionContextB(work, category.code))), React.createElement("td", {
    className: "col-right"
  }, React.createElement("button", {
    type: "button",
    className: "btn btn--xs btn--secondary",
    onClick: event => {
      event.stopPropagation();
      onOpen(work);
    }
  }, "Open detail")))))));
}
function AdminWhitelistScreen() {
  const currentUser = window.FLOWMATE_CURRENT_USER || {};
  const [rows, setRows] = useStateB([]);
  const [loadState, setLoadState] = useStateB({
    status: "loading",
    message: "Loading whitelist users..."
  });
  const [form, setForm] = useStateB({
    email: "",
    displayName: "",
    role: "member",
    teamMemberCode: ""
  });
  const [pending, setPending] = useStateB(false);
  async function loadWhitelist() {
    if (!window.loadFlowMateWhitelistUsers) {
      setRows([]);
      setLoadState({
        status: "error",
        message: "Whitelist loader is not ready."
      });
      return;
    }
    try {
      const data = await window.loadFlowMateWhitelistUsers();
      setRows(data || []);
      setLoadState({
        status: "live",
        message: `${(data || []).length} whitelisted users`
      });
    } catch (error) {
      console.error("[FlowMate Admin] Whitelist load failed:", error);
      setRows([]);
      setLoadState({
        status: "error",
        message: window.flowmateUserError(error, "Whitelist RPC failed.")
      });
    }
  }
  useEffectB(() => {
    loadWhitelist();
  }, []);
  if (currentUser.role !== "admin") {
    return React.createElement("div", {
      className: "page",
      style: {
        maxWidth: 720
      }
    }, React.createElement("div", {
      className: "card"
    }, React.createElement("div", {
      className: "card__head"
    }, React.createElement("span", {
      className: "card__title"
    }, "Admin access required.")), React.createElement("div", {
      className: "card__body"
    }, React.createElement("div", {
      className: "reason-box reason-box--need"
    }, "Only FlowMate admins can manage the whitelist."))));
  }
  function updateForm(key, value) {
    setForm(prev => ({
      ...prev,
      [key]: value
    }));
  }
  async function submitWhitelistUser(event) {
    event.preventDefault();
    setPending(true);
    setLoadState({
      status: "loading",
      message: "Saving whitelist user..."
    });
    try {
      await window.upsertFlowMateWhitelistUser(form);
      setForm({
        email: "",
        displayName: "",
        role: "member",
        teamMemberCode: ""
      });
      await loadWhitelist();
    } catch (error) {
      console.error("[FlowMate Admin] Whitelist save failed:", error);
      setLoadState({
        status: "error",
        message: window.flowmateUserError(error, "Whitelist RPC failed.")
      });
    } finally {
      setPending(false);
    }
  }
  async function deactivateWhitelistUser(row) {
    if (!row || !row.email) return;
    if (row.email === currentUser.email) {
      setLoadState({
        status: "error",
        message: "You cannot deactivate your own admin account from this screen."
      });
      return;
    }
    if (!window.confirm(`Deactivate ${row.email}? They will lose FlowMate access.`)) return;
    setPending(true);
    setLoadState({
      status: "loading",
      message: `Deactivating ${row.email}...`
    });
    try {
      await window.deleteFlowMateWhitelistUser(row.email);
      await loadWhitelist();
    } catch (error) {
      console.error("[FlowMate Admin] Whitelist deactivate failed:", error);
      setLoadState({
        status: "error",
        message: window.flowmateUserError(error, "Whitelist RPC failed.")
      });
    } finally {
      setPending(false);
    }
  }
  return React.createElement("div", {
    className: "page"
  }, React.createElement("div", {
    className: "page__header"
  }, React.createElement("div", null, React.createElement("h1", {
    className: "page__title"
  }, "Whitelist"), React.createElement("div", {
    className: "page__sub"
  }, "Manage who can sign in to FlowMate - ", loadState.message)), React.createElement("div", {
    className: "page__actions"
  }, React.createElement("button", {
    className: "btn btn--secondary",
    onClick: loadWhitelist,
    disabled: pending
  }, React.createElement(Icon, {
    name: "rerun"
  }), " Refresh"))), loadState.status === "error" && React.createElement("div", {
    className: "reason-box reason-box--need",
    style: {
      marginBottom: 12
    }
  }, loadState.message), React.createElement("div", {
    className: "card",
    style: {
      marginBottom: 16
    }
  }, React.createElement("div", {
    className: "card__head"
  }, React.createElement("span", {
    className: "card__title"
  }, "Add or update user"), React.createElement("span", {
    className: "card__sub"
  }, "Backend RPC validates admin access and @garena.com email.")), React.createElement("div", {
    className: "card__body"
  }, React.createElement("form", {
    onSubmit: submitWhitelistUser,
    style: {
      display: "grid",
      gap: 12
    }
  }, React.createElement("div", {
    className: "form-grid",
    style: {
      gridTemplateColumns: "1.2fr 1fr 120px 160px"
    }
  }, React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Email *"), React.createElement("input", {
    className: "input",
    value: form.email,
    onChange: event => updateForm("email", event.target.value),
    placeholder: "name@garena.com",
    type: "email",
    disabled: pending
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Display name *"), React.createElement("input", {
    className: "input",
    value: form.displayName,
    onChange: event => updateForm("displayName", event.target.value),
    placeholder: "Display name",
    disabled: pending
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Role"), React.createElement("select", {
    className: "select",
    value: form.role,
    onChange: event => updateForm("role", event.target.value),
    disabled: pending
  }, React.createElement("option", {
    value: "member"
  }, "Member"), React.createElement("option", {
    value: "admin"
  }, "Admin"))), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Team member code"), React.createElement("input", {
    className: "input",
    value: form.teamMemberCode,
    onChange: event => updateForm("teamMemberCode", event.target.value),
    placeholder: "optional",
    disabled: pending
  }))), React.createElement("div", {
    className: "row",
    style: {
      gap: 8
    }
  }, React.createElement("button", {
    className: "btn btn--primary",
    type: "submit",
    disabled: pending
  }, React.createElement(Icon, {
    name: "plus"
  }), " Add / update"), React.createElement("span", {
    className: "muted",
    style: {
      fontSize: 12
    }
  }, "Deactivate removes the email from whitelist and marks the matching app user inactive."))))), React.createElement("div", {
    className: "card card__body--flush",
    style: {
      overflow: "hidden"
    }
  }, React.createElement("table", {
    className: "tbl"
  }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "Email"), React.createElement("th", null, "Display name"), React.createElement("th", null, "Role"), React.createElement("th", null, "Team code"), React.createElement("th", null, "Added"), React.createElement("th", {
    className: "col-right"
  }, "Action"))), React.createElement("tbody", null, rows.map(row => {
    const isCurrentUser = row.email === currentUser.email;
    return React.createElement("tr", {
      key: row.email
    }, React.createElement("td", {
      className: "mono"
    }, row.email), React.createElement("td", null, row.display_name || "-"), React.createElement("td", null, React.createElement("span", {
      className: `badge ${row.role === "admin" ? "badge--progress" : "badge--assigned"}`
    }, row.role === "admin" ? "Admin" : "Member")), React.createElement("td", {
      className: "mono muted"
    }, row.team_member_code || "-"), React.createElement("td", {
      className: "mono muted",
      style: {
        fontSize: 11
      }
    }, row.created_at ? new Date(row.created_at).toLocaleDateString() : "-"), React.createElement("td", {
      className: "col-right",
      onClick: event => event.stopPropagation()
    }, React.createElement("button", {
      className: "btn btn--xs btn--danger",
      onClick: () => deactivateWhitelistUser(row),
      disabled: pending || isCurrentUser,
      title: isCurrentUser ? "You cannot deactivate your own admin account here." : "Deactivate whitelist access"
    }, "Deactivate")));
  }), rows.length === 0 && React.createElement("tr", null, React.createElement("td", {
    colSpan: "6",
    style: {
      textAlign: "center",
      color: "var(--garena-grey)",
      padding: 18
    }
  }, "No whitelist users loaded."))))));
}
Object.assign(window, {
  ListScreen,
  BoardScreen,
  QueueScreen,
  AdminWhitelistScreen
});
