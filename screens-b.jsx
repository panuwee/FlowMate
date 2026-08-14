// FlowMate - Screens part B: List, Board, Central Queue
const { useState: useStateB, useEffect: useEffectB, useRef: useRefB } = React;
const FLOWMATE_LIST_VIEW_STATE_KEY = "flowmate:list:viewState:v1";
const FLOWMATE_DETAIL_BACK_CONTEXT_KEY = "flowmate:detail:backContext:v1";
const FLOWMATE_BOARD_VIEW_STATE_KEY = "flowmate:board:viewState:v1";
const FLOWMATE_BOARD_SNAPSHOT_TTL_MS = 30_000;
const FLOWMATE_BOARD_WORKSPACE_SNAPSHOTS = new Map();
const flowMateBoardRefreshCoordinators = new Map();
const FLOWMATE_BOARD_CACHE_LIFECYCLE_KEY = "__flowMateBoardCacheLifecycle";

function getFlowMateBoardWorkspaceKey() {
  const activeTeam = window.getFlowMateActiveTeam
    ? window.getFlowMateActiveTeam()
    : window.FLOWMATE_ACTIVE_TEAM;
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
  return Object.fromEntries(Object.entries(lanes || {}).map(([status, lane]) => [
    status,
    cloneFlowMateBoardData(lane || {}),
  ]));
}

function cloneFlowMateBoardSummary(summary) {
  const next = summary || {};
  return {
    ...next,
    counts: { ...(next.counts || {}) },
    wip: {
      ...(next.wip || {}),
      inProgressByOwner: { ...(next.wip?.inProgressByOwner || {}) },
    },
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
    summary: cloneFlowMateBoardSummary(snapshot.summary),
  };
}

function writeFlowMateBoardSnapshot(workspaceKey, changes = {}) {
  const previous = FLOWMATE_BOARD_WORKSPACE_SNAPSHOTS.get(workspaceKey) || {};
  FLOWMATE_BOARD_WORKSPACE_SNAPSHOTS.set(workspaceKey, {
    lanes: changes.lanes ? cloneFlowMateBoardLanes(changes.lanes) : cloneFlowMateBoardLanes(previous.lanes),
    summary: changes.summary ? cloneFlowMateBoardSummary(changes.summary) : cloneFlowMateBoardSummary(previous.summary),
    expiresAt: Date.now() + FLOWMATE_BOARD_SNAPSHOT_TTL_MS,
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
  window[FLOWMATE_BOARD_CACHE_LIFECYCLE_KEY] = { cleanup };
  return cleanup;
}

function runFlowMateBoardRefresh(workspaceKey, refresh) {
  const existing = flowMateBoardRefreshCoordinators.get(workspaceKey);
  if (existing) {
    existing.queued = true;
    existing.queuedRefresh = refresh;
    return existing.promise;
  }

  const coordinator = { queued: false, queuedRefresh: null, promise: null };
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
    return raw ? JSON.parse(raw) : (window.flowmateListViewState || {});
  } catch {
    return window.flowmateListViewState || {};
  }
}

function saveFlowMateListViewState(state) {
  const next = { ...(state || {}) };
  window.flowmateListViewState = next;
  try {
    if (window.sessionStorage) window.sessionStorage.setItem(FLOWMATE_LIST_VIEW_STATE_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

function saveFlowMateDetailBackContext(context) {
  const next = { ...(context || {}) };
  window.flowmateDetailBackContext = next;
  try {
    if (window.sessionStorage) window.sessionStorage.setItem(FLOWMATE_DETAIL_BACK_CONTEXT_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

function readFlowMateDetailBackContext() {
  try {
    const raw = window.sessionStorage && window.sessionStorage.getItem(FLOWMATE_DETAIL_BACK_CONTEXT_KEY);
    return raw ? JSON.parse(raw) : (window.flowmateDetailBackContext || null);
  } catch {
    return window.flowmateDetailBackContext || null;
  }
}

function readFlowMateBoardViewState() {
  try {
    const raw = window.sessionStorage && window.sessionStorage.getItem(FLOWMATE_BOARD_VIEW_STATE_KEY);
    return raw ? JSON.parse(raw) : (window.flowmateBoardViewState || {});
  } catch {
    return window.flowmateBoardViewState || {};
  }
}

function saveFlowMateBoardViewState(state) {
  const next = { ...(state || {}) };
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
  runFlowMateBoardRefresh,
});

function exportRowsCsv(rows) {
  const columns = ["ID", "Title", "Type", "Status", "Campaign", "Channel", "Publish Date", "Launch Date", "Due / First Draft", "Final / Approved", "Type / Skill", "Asset Count", "Owner", "Requester", "Team", "Asset", "Effort", "Priority"];
  const csvRows = rows.map((w) => [
    w.id,
    w.title,
    w.type,
    STATUS_LABEL[w.status] || w.status,
    w.campaign || "",
    w.channel || w.platform || "",
    w.publishFullLabel || w.publishLabel || w.publishDate || "",
    w.launchFullLabel || w.launchLabel || w.launchDate || "",
    w.dueFullLabel || w.dueLabel || w.dueDate || "",
    w.type === "creative" ? (w.finalApprovedDueFullLabel || w.finalApprovedDueLabel || w.finalApprovedDueDate || "") : "",
    w.subtype && typeof getFlowMateCreativeTypeLabel === "function" ? getFlowMateCreativeTypeLabel(w.subtype) : (ASSET_LABEL[w.assetType] || w.assetType || ""),
    w.assetCount || "",
    w.assignee && MEMBERS_BY_ID[w.assignee] ? MEMBERS_BY_ID[w.assignee].name : "Unassigned",
    w.requester || "",
    w.requesterTeam || "",
    ASSET_LABEL[w.assetType] || w.assetType || "",
    w.effort || "",
    w.priority || "",
  ]);
  window.flowmateDownloadCsv(`flowmate-list-${new Date().toISOString().slice(0, 10)}.csv`, columns, csvRows);
}

/* ============================================================
   LIST VIEW
   ============================================================ */
function ListScreen({ onOpen, searchQuery = "" }) {
  const LIST_STATUS_FILTER_KEYS = ["need_brief", "unassigned", "assigned", "in_progress", "review", "blocked", "queued"];
  const savedListState = readFlowMateListViewState();
  const initialListStatus = LIST_STATUS_FILTER_KEYS.includes(savedListState.filterStatus)
    ? savedListState.filterStatus
    : "all";
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
  const [loadState, setLoadState] = useStateB({ status: "loading", message: "Loading Supabase data..." });

  useEffectB(() => {
    let alive = true;

    async function loadRows() {
      if (!window.loadFlowMateOperationalRows) {
        setSourceRows([]);
        setLoadState({ status: "error", message: "Live data unavailable: Supabase list loader is not ready." });
        return;
      }

      try {
        const rows = await window.loadFlowMateOperationalRows();
        let liveRequesterTeams = [];
        if (window.loadFlowMateRequesterTeams) {
          liveRequesterTeams = await window.loadFlowMateRequesterTeams();
        }
        if (!alive) return;
        setSourceRows(rows);
        if (liveRequesterTeams.length) setRequesterTeamOptions(liveRequesterTeams);
        setLoadState({ status: "live", message: "Live Supabase data" });
      } catch (error) {
        if (!alive) return;
        console.error("[FlowMate List] Supabase load failed:", error);
        setSourceRows([]);
        setLoadState({ status: "error", message: `Live data unavailable: ${window.flowmateUserError(error, "Supabase query failed.")}` });
      }
    }

    loadRows();
    const cleanup = window.attachFlowMateLiveRefresh
      ? window.attachFlowMateLiveRefresh(loadRows)
      : () => {};
    return () => { alive = false; cleanup(); };
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
    return (work && work.campaign) || "No campaign";
  }

  function getListChannelValues(work) {
    const rawValues = Array.isArray(work && work.platforms)
      ? work.platforms
      : String((work && (work.channel || work.platform)) || "")
          .split(",");
    const values = rawValues.map((value) => String(value || "").trim()).filter(Boolean);
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
  const scopedOwnerOptionRows = [
    ...(window.MEMBERS || [])
      .filter(member => filterTeam === "all" || getListMemberTeam(member) === filterTeam)
      .map(member => [member.id, member.name]),
    ...sourceRows
      .filter(w => filterTeam === "all" || getListWorkAssigneeTeam(w) === filterTeam)
      .map(w => {
    const id = w.assignee || "unassigned";
    const label = w.assignee && MEMBERS_BY_ID[w.assignee] ? MEMBERS_BY_ID[w.assignee].name : "Unassigned";
    return [id, label];
      }),
  ];
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

  const currentListViewState = { filterStatus, filterFlag, filterOwner, filterTeam, filterAsset, filterType, filterCampaign, filterChannel };

  useEffectB(() => {
    saveFlowMateListViewState(currentListViewState);
  }, [filterStatus, filterFlag, filterOwner, filterTeam, filterAsset, filterType, filterCampaign, filterChannel]);

  function openListWorkItem(work) {
    saveFlowMateListViewState(currentListViewState);
    saveFlowMateDetailBackContext({
      route: "list",
      label: "Back to List",
      listState: currentListViewState,
    });
    window.flowmateSelectedWorkItem = work;
    onOpen(work.id, { preserveBackContext: true });
  }

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">All work</h1>
          <div className="page__sub">{sourceRows.length} items across all statuses - {loadState.message}</div>
        </div>
        <div className="page__actions">
          <button className="btn btn--secondary" onClick={() => exportRowsCsv(rows)}>
            <Icon name="download" /> Export
          </button>
        </div>
      </div>

      <div className="filterbar">
        <select className="select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {LIST_STATUS_FILTER_KEYS.map(k => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
        </select>
        <select className="select" value={filterTeam} onChange={e => setFilterTeam(e.target.value)}>
          <option value="all">All teams</option>
          {teamOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="select" value={filterOwner} onChange={e => setFilterOwner(e.target.value)}>
          <option value="all">All Assignee</option>
          {ownerOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <select className="select" value={filterCampaign} onChange={e => setFilterCampaign(e.target.value)}>
          <option value="all">All campaigns</option>
          {campaignOptions.map(campaign => <option key={campaign} value={campaign}>{campaign}</option>)}
        </select>
        <select className="select" value={filterChannel} onChange={e => setFilterChannel(e.target.value)}>
          <option value="all">All channels</option>
          {channelOptions.map(channel => <option key={channel} value={channel}>{channel}</option>)}
        </select>
        <select className="select" value={filterAsset} onChange={e => setFilterAsset(e.target.value)}>
          <option value="all">All asset types</option>
          {assetOptions.map(a => <option key={a} value={a}>{ASSET_LABEL[a] || a}</option>)}
        </select>
        <select className="select" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="all">All types</option>
          {typeOptions.map(t => <option key={t} value={t}>{t === "creative" ? "Creative" : "Quick task"}</option>)}
        </select>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className={`chip ${filterFlag === "overdue" ? "is-active" : ""}`} onClick={() => setFilterFlag(filterFlag === "overdue" ? "all" : "overdue")}>
            Overdue only
          </button>
          <button className={`chip ${filterFlag === "duesoon" ? "is-active" : ""}`} onClick={() => setFilterFlag(filterFlag === "duesoon" ? "all" : "duesoon")}>
            Due soon
          </button>
          <button className={`chip ${filterFlag === "blocked" ? "is-active" : ""}`} onClick={() => setFilterFlag(filterFlag === "blocked" ? "all" : "blocked")}>
            Blocked
          </button>
        </span>
      </div>

      <div className="card card__body--flush" style={{ overflow: "hidden" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th className="col-id">ID</th>
              <th>Title</th>
              <th>Type</th>
              <th>Status</th>
              <th>Campaign</th>
              <th>Channel</th>
              <th>Publish Date</th>
              <th>Owner</th>
              <th>Requester / Team</th>
              <th>Asset</th>
              <th>Effort</th>
              <th>Priority</th>
              <th>Due / First Draft</th>
              <th>Final / Approved</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(w => (
              <tr key={w.id} className={w.overdue ? "is-overdue" : ""} onClick={() => openListWorkItem(w)}>
                <td className="col-id mono">{w.id}</td>
                <td className="col-title">
                  <div>{w.title}</div>
                  <AssignmentWarningBadges work={w} limit={2} />
                </td>
                <td><TypePill type={w.type} /></td>
                <td><StatusBadge status={w.status} /></td>
                <td><span className="muted" style={{ fontSize: 12 }}>{w.campaign || "-"}</span></td>
                <td><span className="muted" style={{ fontSize: 12 }}>{w.channel || w.platform || "-"}</span></td>
                <td><span className="mono muted" style={{ fontSize: 12 }}>{w.publishLabel || "-"}</span></td>
                <td>
                  {w.assignee ? (
                    <span className="row" style={{ gap: 6 }}><Avatar memberId={w.assignee} /> <span>{(MEMBERS_BY_ID[w.assignee] && MEMBERS_BY_ID[w.assignee].name) || w.assigneeOtherName || "Unassigned"}</span></span>
                  ) : <span className="muted">{w.assigneeOtherName || "Unassigned"}</span>}
                </td>
                <td><div style={{ fontSize: 12 }}>{w.requester || "-"}</div><div className="muted" style={{ fontSize: 11 }}>{w.requesterTeam}</div></td>
                <td><span className="muted" style={{ fontSize: 12 }}>{ASSET_LABEL[w.assetType] || "-"}</span></td>
                <td><Effort value={w.effort} /></td>
                <td><PriorityBadge level={w.priority} /></td>
                <td><div className="muted" style={{ fontSize: 11 }}>{w.type === "creative" ? "First Draft" : "Due"}</div><DueBadge delta={w.dueDelta} label={w.dueLabel} status={w.status} /></td>
                <td><span className="mono muted" style={{ fontSize: 12 }}>{w.type === "creative" ? (w.finalApprovedDueLabel || "-") : "-"}</span></td>
                <td>
                  <span className="row" style={{ gap: 4 }}>
                    {w.needsSplit && <span className="tag" style={{ background: "#FDEFE0", color: "#8A4A12" }}>Needs split</span>}
                    <AssignmentWarningBadges work={w} limit={3} />
                    {w.reviewRound > 0 && <span className="tag">R{w.reviewRound}</span>}
                    {w.blockReason && <span className="tag" style={{ background: "var(--garena-red-light-2)", color: "var(--garena-red)" }}>Blocked</span>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Source>{loadState.status === "live" ? "Supabase work_items table" : "No local fallback data"} - {TODAY}</Source>
    </div>
  );
}

/* ============================================================
   KANBAN BOARD
   ============================================================ */
function BoardScreen({ onOpen, searchQuery = "" }) {
  const columns = [
    { key: "unassigned",  label: "Unassigned" },
    { key: "assigned", label: "Assigned" },
    { key: "in_progress", label: "In Progress" },
    { key: "review", label: "Review" },
    { key: "blocked", label: "Blocked" },
  ];
  const emptyLane = { status: "idle", rows: [], total: 0, nextCursor: null, hasMore: false, message: "" };
  const savedBoardState = readFlowMateBoardViewState();
  const defaultDeliveredFilters = { scope: "recent", search: "", deliveredMonth: "", campaign: "", ownerId: "" };
  const boardWorkspaceKeyRef = useRefB(null);
  if (!boardWorkspaceKeyRef.current) boardWorkspaceKeyRef.current = getFlowMateBoardWorkspaceKey();
  const [activeTab, setActiveTab] = useStateB(savedBoardState.activeTab === "delivered" ? "delivered" : "active");
  const [lanes, setLanes] = useStateB(() => readFlowMateBoardSnapshot(boardWorkspaceKeyRef.current)?.lanes || Object.fromEntries(columns.map(column => [column.key, { ...emptyLane }])));
  const [summary, setSummary] = useStateB(() => readFlowMateBoardSnapshot(boardWorkspaceKeyRef.current)?.summary || { counts: {}, wip: { inProgressByOwner: {}, reviewTeamCount: 0, reviewTeamLimit: 8 } });
  const [draggingId, setDraggingId] = useStateB(null);
  const [hoverCol, setHoverCol] = useStateB(null);
  const [cardPending, setCardPending] = useStateB({});
  const [cardErrors, setCardErrors] = useStateB({});
  const [refreshing, setRefreshing] = useStateB(false);
  const [loadState, setLoadState] = useStateB({ status: "loading", message: "Loading Active Board..." });
  const [flash, setFlash] = useStateB(null);
  const [deliveredFilters, setDeliveredFilters] = useStateB({ ...defaultDeliveredFilters, ...(savedBoardState.deliveredFilters || {}) });
  const [deliveredCursor, setDeliveredCursor] = useStateB(savedBoardState.deliveredCursor || null);
  const [deliveredCursorStack, setDeliveredCursorStack] = useStateB(Array.isArray(savedBoardState.deliveredCursorStack) ? savedBoardState.deliveredCursorStack : []);
  const [deliveredState, setDeliveredState] = useStateB({ status: "idle", rows: [], total: 0, nextCursor: null, hasMore: false, filterOptions: {}, message: "" });
  const deliveredRequestRef = useRefB(0);
  const summaryRequestRef = useRefB(0);
  const activeBoardRequestRef = useRefB(0);
  const laneRequestRef = useRefB(Object.fromEntries(columns.map(column => [column.key, 0])));
  const laneStateRef = useRefB(lanes);
  const laneBodyRefs = useRefB({});
  const laneLoadedCounts = useRefB(savedBoardState.laneLoadedCounts || {});
  const laneScrollPositions = useRefB(savedBoardState.laneScrollPositions || {});
  const cardPendingRef = useRefB({});
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
    return window.flowmateUserError ? window.flowmateUserError(error, fallback) : (error?.message || fallback);
  }

  function currentBoardViewState(overrides = {}) {
    return {
      activeTab: activeTabRef.current,
      deliveredFilters: deliveredFiltersRef.current,
      deliveredCursor: deliveredCursorRef.current,
      deliveredCursorStack: deliveredCursorStackRef.current,
      laneLoadedCounts: { ...laneLoadedCounts.current },
      laneScrollPositions: { ...laneScrollPositions.current },
      ...overrides,
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

  async function loadLane(status, { append = false, isAlive = () => true, preserveScroll = true, targetCount } = {}) {
    if (!window.loadFlowMateBoardLane) {
      setLanes(current => ({ ...current, [status]: { ...current[status], status: "error", message: "Active Board loader is not ready." } }));
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
    setLanes(current => ({ ...current, [status]: { ...current[status], status: nextStatus, message: "" } }));
    try {
      do {
        const pageSize = Math.min(50, Math.max(1, desiredCount - accumulatedRows.length));
        latestResult = await window.loadFlowMateBoardLane({ status, cursor, limit: pageSize, total: currentLane.total || summary.counts?.[status] || null });
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
          message: "",
        };
        laneStateRef.current = { ...laneStateRef.current, [status]: nextLane };
        writeFlowMateBoardSnapshot(workspaceKey, { lanes: laneStateRef.current });
        return { ...current, [status]: nextLane };
      });
      if (preserveScroll) restoreLaneScroll(status);
      persistBoardViewState();
      return true;
    } catch (error) {
      if (!isAlive() || requestId !== laneRequestRef.current[status] || workspaceKey !== boardWorkspaceKeyRef.current) return false;
      console.error(`[FlowMate Board] ${status} lane load failed:`, error);
      setLanes(current => ({ ...current, [status]: {
        ...current[status],
        status: currentLane.rows.length > 0 ? "stale-error" : "error",
        message: boardError(error, "Could not load this lane."),
      } }));
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
      writeFlowMateBoardSnapshot(boardWorkspaceKeyRef.current, { lanes: laneStateRef.current, summary: next });
      return true;
    } catch (error) {
      if (!isAlive() || requestId !== summaryRequestRef.current || activeBoardRequestId !== activeBoardRequestRef.current) return false;
      console.error("[FlowMate Board] summary load failed:", error);
      setFlash({ tone: "warn", text: boardError(error, "Board counts could not be refreshed.") });
      return false;
    }
  }

  async function loadActiveBoard(isAlive = () => true, { preserveScroll = true } = {}) {
    if (!window.loadFlowMateActiveBoard) {
      setLoadState({ status: "error", message: "Active Board batch loader is not ready." });
      return false;
    }
    const requestId = ++activeBoardRequestRef.current;
    setLanes(current => Object.fromEntries(columns.map(column => {
      const lane = current[column.key] || emptyLane;
      return [column.key, { ...lane, status: lane.rows.length > 0 ? "refreshing" : "loading", message: "" }];
    })));
    try {
      const result = await window.loadFlowMateActiveBoard({
        laneLimits: Object.fromEntries(columns.map(column => [
          column.key,
          Math.max(50, Number(laneLoadedCounts.current[column.key] || laneStateRef.current[column.key]?.rows.length || 0)),
        ])),
      });
      if (!isAlive() || requestId !== activeBoardRequestRef.current) return false;
      laneStateRef.current = result.lanes;
      columns.forEach(column => { laneLoadedCounts.current[column.key] = result.lanes[column.key]?.rows.length || 0; });
      setLanes(result.lanes);
      setSummary(result.summary);
      writeFlowMateBoardSnapshot(boardWorkspaceKeyRef.current, { lanes: result.lanes, summary: result.summary });
      if (preserveScroll) columns.forEach(column => restoreLaneScroll(column.key));
      persistBoardViewState();
      setLoadState({ status: "live", message: "Live Supabase data" });
      return true;
    } catch (error) {
      if (!isAlive() || requestId !== activeBoardRequestRef.current) return false;
      console.error("[FlowMate Board] batch load failed:", error);
      setLanes(current => Object.fromEntries(columns.map(column => {
        const lane = current[column.key] || emptyLane;
        return [column.key, { ...lane, status: lane.rows.length > 0 ? "stale-error" : "error", message: boardError(error, "Could not load Active Board.") }];
      })));
      setLoadState({ status: "error", message: boardError(error, "Could not load Active Board.") });
      return false;
    }
  }

  async function refreshActiveBoardPreservingState(isAlive = () => true) {
    columns.forEach(column => rememberLaneScroll(column.key, laneBodyRefs.current[column.key]));
    return runFlowMateBoardRefresh(boardWorkspaceKeyRef.current, () => loadActiveBoard(isAlive, { preserveScroll: true }));
  }

  async function loadDelivered(cursor = deliveredCursorRef.current, isAlive = () => true, filters = deliveredFiltersRef.current) {
    if (!window.loadFlowMateDeliveredHistory) {
      setDeliveredState(current => ({ ...current, status: "error", message: "Delivered history loader is not ready." }));
      return false;
    }
    const requestId = ++deliveredRequestRef.current;
    setDeliveredState(current => ({ ...current, status: "loading", rows: [], hasMore: false, message: "" }));
    try {
      const result = await window.loadFlowMateDeliveredHistory({ ...filters, cursor, limit: 50 });
      if (!isAlive() || requestId !== deliveredRequestRef.current) return false;
      setDeliveredState({
        status: "live", rows: result.rows || [], total: result.total || 0, nextCursor: result.nextCursor || null,
        hasMore: Boolean(result.hasMore), filterOptions: result.filterOptions || {}, message: "",
      });
      return true;
    } catch (error) {
      if (!isAlive() || requestId !== deliveredRequestRef.current) return false;
      console.error("[FlowMate Delivered] history load failed:", error);
      setDeliveredState(current => ({ ...current, status: "error", rows: [], message: boardError(error, "Delivered history could not be loaded.") }));
      return false;
    }
  }

  useEffectB(() => {
    let alive = true;
    if (activeTab === "active") refreshActiveBoardPreservingState(() => alive);
    return () => { alive = false; };
  }, [activeTab]);

  useEffectB(() => {
    if (activeTab !== "delivered") return undefined;
    let alive = true;
    const filterSnapshot = { ...deliveredFilters };
    const timer = setTimeout(() => loadDelivered(deliveredCursor, () => alive, filterSnapshot), 350);
    return () => { alive = false; clearTimeout(timer); };
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
        const next = { ...current, scope: "archived", search: query };
        deliveredFiltersRef.current = next;
        return next;
      });
      deliveredCursorRef.current = null;
      deliveredCursorStackRef.current = [];
      setDeliveredCursor(null);
      setDeliveredCursorStack([]);
    } catch (error) {
      try { window.sessionStorage?.removeItem("flowmate:board:archiveSearch"); } catch (cleanupError) {}
      console.warn("[FlowMate Board] Archived-search handoff could not be read:", error && error.message);
    }
  }, []);

  useEffectB(() => {
    function openArchivedSearch(event) {
      const query = String(event?.detail?.query || event?.detail?.search || searchQuery || "").trim();
      selectBoardTab("delivered");
      setDeliveredFilters(current => {
        const next = { ...current, scope: "archived", search: query };
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
    function resetDeliveredNavigation({ resetTab = true } = {}) {
      deliveredRequestRef.current += 1;
      deliveredFiltersRef.current = defaultDeliveredFilters;
      deliveredCursorRef.current = null;
      deliveredCursorStackRef.current = [];
      setDeliveredFilters(defaultDeliveredFilters);
      setDeliveredCursor(null);
      setDeliveredCursorStack([]);
      setDeliveredState({ status: "idle", rows: [], total: 0, nextCursor: null, hasMore: false, filterOptions: {}, message: "" });
      if (resetTab) selectBoardTab("active");
    }

    function clearArchivedSearch() {
      if (deliveredFiltersRef.current.scope !== "archived") return;
      resetDeliveredNavigation();
      saveFlowMateBoardViewState(currentBoardViewState({
        activeTab: "active",
        deliveredFilters: defaultDeliveredFilters,
        deliveredCursor: null,
        deliveredCursorStack: [],
      }));
    }

    function resetForWorkspaceChange() {
      clearFlowMateBoardSnapshot(boardWorkspaceKeyRef.current);
      boardWorkspaceKeyRef.current = getFlowMateBoardWorkspaceKey();
      clearFlowMateBoardSnapshot(boardWorkspaceKeyRef.current);
      activeBoardRequestRef.current += 1;
      summaryRequestRef.current += 1;
      Object.keys(laneRequestRef.current).forEach(status => { laneRequestRef.current[status] += 1; });
      laneLoadedCounts.current = {};
      laneScrollPositions.current = {};
      const nextLanes = Object.fromEntries(columns.map(column => [column.key, { ...emptyLane }]));
      laneStateRef.current = nextLanes;
      setLanes(nextLanes);
      setSummary({ counts: {}, wip: { inProgressByOwner: {}, reviewTeamCount: 0, reviewTeamLimit: 8 } });
      resetDeliveredNavigation();
      saveFlowMateBoardViewState({ activeTab: "active", deliveredFilters: defaultDeliveredFilters, deliveredCursor: null, deliveredCursorStack: [], laneLoadedCounts: {}, laneScrollPositions: {} });
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
    const refreshCurrent = () => activeTabRef.current === "active"
      ? refreshActiveBoardPreservingState()
      : loadDelivered(deliveredCursorRef.current, () => true, { ...deliveredFiltersRef.current });
    return window.attachFlowMateLiveRefresh(refreshCurrent, {
      reasons: [
        "work_items", "creative_request_details", "checklist_items", "assignment_runs", "work_item_events",
        "work_status_changed", "admin_work_status_changed", "active_team_changed", "admin_archive", "admin_restore",
        "quick_task_created", "rerun_assignment", "creative_assignee_changed", "capacity_allocation_rescheduled",
        "recheck_brief", "team_settings_admin_update", "team_workspace_changed", "archived_work_item_restored",
        "marketing_plan_creative_request_link", "marketing_plan_working_sheet_row_edited",
      ],
    });
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
    const owner = window.MEMBERS_BY_ID?.[row.assignee];
    if (row.type !== "quick" && window.canFlowMateTransitionWorkItem) {
      return ["in_progress", "review", "delivered", "blocked", "assigned"].some(target =>
        window.canFlowMateTransitionWorkItem(row, target, currentUser, window.MEMBERS_BY_ID || {})
      );
    }
    if (currentUser.role === "admin") return true;
    return Boolean(
      currentUser.id && (
        currentUser.id === row.requesterUserId
        || currentUser.id === row.assigneeUserId
        || currentUser.id === owner?.userId
        || currentUser.id === row.marketingPlanSubPicUserId
        || currentUser.team_member_id === row.assignee
      )
    );
  }

  function canTransitionBoardTarget(row, targetStatus) {
    if (row?.type === "quick") return canTransitionBoardWork(row);
    return Boolean(window.canFlowMateTransitionWorkItem?.(
      row,
      targetStatus,
      window.FLOWMATE_CURRENT_USER || {},
      window.MEMBERS_BY_ID || {},
    ));
  }

  function boardTransitionTargets(row) {
    if (row.type === "quick") return [];
    const targetsByStatus = {
      assigned: ["in_progress", "blocked"],
      in_progress: ["review", "blocked"],
      review: ["in_progress", "blocked"],
      blocked: ["in_progress"],
    };
    return (targetsByStatus[row.status] || []).filter(target => canTransitionBoardTarget(row, target));
  }

  function setDeliveredFilter(key, value) {
    setDeliveredState(current => ({ ...current, status: "loading", rows: [], hasMore: false, message: "" }));
    setDeliveredFilters(current => {
      const next = { ...current, [key]: value };
      deliveredFiltersRef.current = next;
      return next;
    });
    deliveredCursorRef.current = null;
    deliveredCursorStackRef.current = [];
    setDeliveredCursor(null);
    setDeliveredCursorStack([]);
  }

  function resetDeliveredFilters() {
    setDeliveredState(current => ({ ...current, status: "loading", rows: [], hasMore: false, message: "" }));
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
    setDeliveredState(current => ({ ...current, status: "loading", rows: [], hasMore: false, message: "" }));
    setDeliveredCursorStack(stack);
    setDeliveredCursor(previous);
  }

  function showNextDeliveredPage() {
    if (!deliveredState.hasMore || !deliveredState.nextCursor) return;
    const stack = [...deliveredCursorStackRef.current, deliveredCursorRef.current];
    deliveredCursorStackRef.current = stack;
    deliveredCursorRef.current = deliveredState.nextCursor;
    setDeliveredState(current => ({ ...current, status: "loading", rows: [], hasMore: false, message: "" }));
    setDeliveredCursorStack(stack);
    setDeliveredCursor(deliveredState.nextCursor);
  }

  function openListForStatus(status) {
    saveFlowMateListViewState({ ...readFlowMateListViewState(), filterStatus: status });
    window.location.hash = "list";
  }

  function openActiveWork(row) {
    window.flowmateSelectedWorkItem = row;
    const boardViewState = persistBoardViewState({ activeTab: "active" });
    saveFlowMateDetailBackContext({ route: "board", label: "Back to Active Board", boardTab: "active", boardViewState });
    onOpen(row.id);
  }

  function openDeliveredWork(row) {
    // History rows are intentionally partial. DetailScreen performs the
    // RLS-scoped direct read (including archived rows) using the display ID.
    window.flowmateSelectedWorkItem = null;
    const boardViewState = persistBoardViewState({ activeTab: "delivered" });
    saveFlowMateDetailBackContext({ route: "board", label: "Back to Delivered", boardTab: "delivered", deliveredFilters, boardViewState });
    onOpen(row.id);
  }

  async function runCardMutation(row, mutation, successText) {
    if (cardPendingRef.current[row.id]) return false;
    cardPendingRef.current[row.id] = true;
    setCardPending(current => ({ ...current, [row.id]: true }));
    setCardErrors(current => ({ ...current, [row.id]: "" }));
    try {
      await mutation();
      setLanes(current => ({ ...current, [row.status]: { ...current[row.status], rows: current[row.status].rows.filter(item => item.id !== row.id) } }));
      setFlash({ tone: "ok", text: successText });
    } catch (error) {
      console.error("[FlowMate Board] card transition failed:", error);
      const message = boardError(error, "Transition rejected by backend.");
      setCardErrors(current => ({ ...current, [row.id]: message }));
      setFlash({ tone: "bad", text: message });
    } finally {
      cardPendingRef.current[row.id] = false;
      setCardPending(current => ({ ...current, [row.id]: false }));
    }
  }

  async function completeWork(row) {
    const targetStatus = "delivered";
    if (row.type === "quick" ? !canTransitionBoardWork(row) : !canTransitionBoardTarget(row, targetStatus)) {
      setCardErrors(current => ({ ...current, [row.id]: "You do not have permission to change this work item." }));
      return false;
    }
    if (row.type === "quick") {
      const mutation = window.FLOWMATE_CURRENT_USER?.role === "admin"
        ? () => window.transitionFlowMateWorkStatus(row.id, "delivered", { currentStatus: row.status })
        : () => window.completeFlowMateQuickTask(row.id);
      return runCardMutation(row, mutation, `${row.id} marked done.`);
    }
    if (row.status !== "review") {
      setCardErrors(current => ({ ...current, [row.id]: "Creative work can be delivered from Review." }));
      return false;
    }
    const deliveryLink = await window.flowmatePrompt({
      title: "Mark Delivered", label: "Delivery link", placeholder: "https://drive.google.com/...", required: true,
      validate: value => window.flowmateSafeHttpUrl(value) ? null : "Enter a valid http(s) link.",
    });
    if (!deliveryLink) return false;
    return runCardMutation(row, () => window.transitionFlowMateWorkStatus(row.id, "delivered", { deliveryLink, currentStatus: row.status }), `${row.id} marked Delivered.`);
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
    if (!row || row.status === targetStatus || !canTransitionBoardTarget(row, targetStatus)) return false;
    if (targetStatus === "unassigned") {
      setFlash({ tone: "warn", text: "Open Detail to clear or change an assignee." });
      return false;
    }
    if (row.type === "quick") {
      setFlash({ tone: "warn", text: "Use the card action for Quick Task status changes." });
      return false;
    }
    const options = {};
    if (targetStatus === "review") {
      const deliveryLink = await window.flowmatePrompt({ title: "Submit for review", label: "Delivery link", required: true, validate: value => window.flowmateSafeHttpUrl(value) ? null : "Enter a valid http(s) link." });
      if (!deliveryLink) return;
      options.deliveryLink = deliveryLink;
    }
    if (targetStatus === "blocked") {
      const blockedReason = await window.flowmatePrompt({ title: "Block work", label: "Blocked reason", multiline: true, required: true });
      if (!blockedReason) return;
      options.blockedReason = blockedReason;
    }
    await runCardMutation(row, () => window.transitionFlowMateWorkStatus(row.id, targetStatus, { ...options, currentStatus: row.status }), `${row.id} moved to ${STATUS_LABEL[targetStatus]}.`);
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
      return { text: count > limit ? `${count}/${limit} over by ${count - limit}` : `${count}/${limit} team queue`, isWarning: count > limit };
    }
    if (status === "in_progress") {
      const atLimit = Object.values(summary.wip?.inProgressByOwner || {}).filter(owner => owner.limit > 0 && owner.count >= owner.limit);
      if (!atLimit.length) return { text: "Member WIP within limits", isWarning: false };
      return { text: atLimit.map(owner => `${owner.name} ${owner.count}/${owner.limit} ${owner.count > owner.limit ? "over limit" : "at limit"}`).join("; "), isWarning: true };
    }
    return { text: "", isWarning: false };
  }

  async function handleBoardRefresh() {
    setRefreshing(true);
    setFlash(null);
    setLoadState({ status: "loading", message: "Refreshing board data..." });
    try {
      if (activeTab === "active") await refreshActiveBoardPreservingState();
      else await loadDelivered();
      window.dispatchEvent(new CustomEvent("flowmate:refresh-counts"));
      setFlash({ tone: "ok", text: "Board refreshed." });
    } finally {
      setRefreshing(false);
    }
  }

  const campaigns = deliveredState.filterOptions.campaigns || [];
  const owners = deliveredState.filterOptions.owners || [];
  const hasDeliveredFilters = Boolean(deliveredFilters.search || deliveredFilters.deliveredMonth || deliveredFilters.campaign || deliveredFilters.ownerId || deliveredFilters.scope !== "recent");

  return (
    <div className="page board-page">
      <div className="page__header board-page__header">
        <div>
          <h1 className="page__title">Board</h1>
          <div className="page__sub">Five active workflow lanes and a separate Delivered history. Backend permissions remain authoritative. <span className="muted">{loadState.message}</span></div>
        </div>
        <div className="page__actions">
          <button type="button" className="btn btn--secondary" onClick={handleBoardRefresh} disabled={refreshing}>
            <Icon name="rerun" /> {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="board-tabs" role="tablist" aria-label="Board views">
        <button type="button" id="flowmate-board-tab-active" role="tab" aria-selected={activeTab === "active"} aria-controls="flowmate-board-panel-active" tabIndex={activeTab === "active" ? 0 : -1} className={activeTab === "active" ? "is-active" : ""} onKeyDown={handleBoardTabKeyDown} onClick={() => selectBoardTab("active")}>Active Board</button>
        <button type="button" id="flowmate-board-tab-delivered" role="tab" aria-selected={activeTab === "delivered"} aria-controls="flowmate-board-panel-delivered" tabIndex={activeTab === "delivered" ? 0 : -1} className={activeTab === "delivered" ? "is-active" : ""} onKeyDown={handleBoardTabKeyDown} onClick={() => selectBoardTab("delivered")}>Delivered</button>
      </div>

      <div className="board-announcer" aria-live="polite" aria-atomic="true">
        {flash?.text || Object.values(cardErrors).filter(Boolean)[0] || ""}
      </div>
      {flash && <div className={`reason-box board-flash ${flash.tone === "bad" ? "reason-box--need" : flash.tone === "warn" ? "reason-box--queued" : ""}`}>{flash.text}<button type="button" className="btn btn--xs btn--ghost" onClick={() => setFlash(null)}>Dismiss</button></div>}

      {activeTab === "active" ? (
        <div id="flowmate-board-panel-active" className="kanban board-active" role="tabpanel" aria-labelledby="flowmate-board-tab-active" tabIndex="0" aria-label="Active work lanes">
          {columns.map(column => {
            const lane = lanes[column.key] || emptyLane;
            const isHover = hoverCol === column.key;
            const wipSignal = laneWipSignal(column.key);
            return (
              <section
                className={`kcol board-lane ${isHover ? "is-drop-target" : ""}`}
                key={column.key}
                aria-labelledby={`board-lane-${column.key}`}
                onDragOver={event => { event.preventDefault(); setHoverCol(column.key); }}
                onDragLeave={() => setHoverCol(null)}
                onDrop={event => handleDrop(event, column.key)}
              >
                <div className="kcol__head board-lane__head">
                  <div>
                    <h2 id={`board-lane-${column.key}`} className="kcol__title">{column.label}</h2>
                    {wipSignal.text && <div className={`board-wip ${wipSignal.isWarning ? "is-warning" : ""}`}><Icon name="alert" size={11} /> {wipSignal.text}</div>}
                  </div>
                  <span className="kcol__count" aria-label={`${lane.total} ${column.label} tasks`}>{lane.total}</span>
                </div>
                <div className="kcol__body board-lane__body" ref={node => { if (node) laneBodyRefs.current[column.key] = node; }} onScroll={event => { rememberLaneScroll(column.key, event.currentTarget); persistBoardViewState(); }}>
                  {lane.status === "loading" && lane.rows.length === 0 && <div className="board-state" role="status">Loading {column.label}...</div>}
                  {(lane.status === "error" || lane.status === "stale-error") && <div className="board-state board-state--error" role="alert">{lane.message}<button type="button" className="btn btn--xs btn--secondary" onClick={() => loadLane(column.key)}>Retry</button></div>}
                  {lane.rows.map(w => {
                    const row = w;
                    const pending = Boolean(cardPending[row.id]);
                    return (
                      <article
                        key={row.id}
                        className={`kcard board-card ${pending ? "is-pending" : ""}`}
                        draggable={canTransitionBoardWork(row) && row.type !== "quick" && !pending && row.status !== "unassigned"}
                        onDragStart={event => handleDragStart(event, row)}
                        onDragEnd={handleDragEnd}
                        onClick={() => openActiveWork(row)}
                        aria-label={`${row.id}, ${row.title}, ${column.label}${row.priority === "urgent" ? ", Urgent" : ""}${row.blockReason ? `, Blocked reason: ${row.blockReason}` : ""}`}
                      >
                        <div className="board-card__top"><span className="kcard__id mono">{row.id}</span><PriorityBadge level={row.priority} /></div>
                        <div className="kcard__title">{row.title}</div>
                        <AssignmentWarningBadges work={row} limit={2} />
                        <div className="kcard__row"><Avatar memberId={row.assignee} /><span className="board-card__owner">{row.ownerName || "Unassigned"}</span><Effort value={row.effort} /><Progress {...(row.checklist || { done: 0, total: 0 })} /></div>
                        <div className="kcard__row"><DueBadge delta={row.dueDelta} label={row.dueLabel} status={row.status} /></div>
                        {row.blockReason && <div className="kcard__row kcard__row--meta board-card__blocked"><Icon name="alert" size={11} /> Blocked: {row.blockReason}</div>}
                        <div className="board-card__actions" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
                          {row.type === "quick" && canTransitionBoardWork(row) && <button type="button" className="btn btn--xs btn--secondary" disabled={pending} onClick={() => completeWork(row)}>{pending ? "Working..." : "Mark done"}</button>}
                          {row.type === "creative" && row.status === "review" && canTransitionBoardTarget(row, "delivered") && <button type="button" className="btn btn--xs btn--primary" disabled={pending} onClick={() => completeWork(row)}>{pending ? "Working..." : "Mark Delivered"}</button>}
                          <details className="board-card-menu">
                            <summary aria-label={`Actions for ${row.id}`}>Actions</summary>
                            <div className="board-card-menu__items">
                              <button type="button" onClick={() => openActiveWork(row)}>Open detail</button>
                              {boardTransitionTargets(row).map(target => <button type="button" key={target} disabled={pending} onClick={() => moveBoardWork(row, target)}>Move to {STATUS_LABEL[target]}</button>)}
                            </div>
                          </details>
                        </div>
                        {cardErrors[row.id] && <div className="board-card__error" role="alert">{cardErrors[row.id]}</div>}
                      </article>
                    );
                  })}
                  {lane.status === "live" && lane.rows.length === 0 && <div className="board-state">{column.key === "blocked" ? "No blocked items." : `No ${column.label} work.`}</div>}
                  {lane.hasMore && <button type="button" className="btn btn--sm btn--secondary board-load-more" disabled={lane.status === "loading-more"} onClick={() => loadLane(column.key, { append: true })}>{lane.status === "loading-more" ? "Loading..." : `Load more (${lane.rows.length} of ${lane.total})`}</button>}
                  <button type="button" className="board-view-list" onClick={() => openListForStatus(column.key)}>View all in List</button>
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <section id="flowmate-board-panel-delivered" className="delivered-history" role="tabpanel" aria-labelledby="flowmate-board-tab-delivered" tabIndex="0">
          <div className="delivered-history__header">
            <div><h2 id="delivered-history-title">Delivered history</h2><p>{deliveredState.total} items match the current server filters.</p></div>
            {hasDeliveredFilters && <button type="button" className="btn btn--sm btn--secondary" onClick={resetDeliveredFilters}>Reset filters</button>}
          </div>
          <div className="delivered-filters">
            <label>Search<input className="input" type="search" value={deliveredFilters.search} onChange={event => setDeliveredFilter("search", event.target.value)} placeholder="ID, title or campaign" /></label>
            <label>Delivered month<input className="input" type="month" value={deliveredFilters.deliveredMonth} onChange={event => setDeliveredFilter("deliveredMonth", event.target.value)} /></label>
            <label>Campaign<select className="select" value={deliveredFilters.campaign} onChange={event => setDeliveredFilter("campaign", event.target.value)}><option value="">All campaigns</option>{campaigns.map(campaign => <option key={campaign.value || campaign} value={campaign.value || campaign}>{campaign.label || campaign}</option>)}</select></label>
            <label>Owner<select className="select" value={deliveredFilters.ownerId} onChange={event => setDeliveredFilter("ownerId", event.target.value)}><option value="">All owners</option>{owners.map(owner => <option key={owner.id || owner.value} value={owner.id || owner.value}>{owner.name || owner.label}</option>)}</select></label>
            <label>Scope<select className="select" value={deliveredFilters.scope} onChange={event => setDeliveredFilter("scope", event.target.value)}><option value="recent">Last 60 days</option><option value="archived">Archived</option></select></label>
          </div>

          {deliveredState.status === "loading" && <div className="board-state" role="status">Loading Delivered history...</div>}
          {deliveredState.status === "error" && <div className="board-state board-state--error" role="alert">{deliveredState.message}<button type="button" className="btn btn--sm btn--secondary" onClick={() => loadDelivered()}>Retry</button></div>}
          {deliveredState.status === "live" && deliveredState.rows.length === 0 && <div className="board-state">{hasDeliveredFilters ? "No Delivered items match these filters." : "No Delivered items yet."}</div>}
          {deliveredState.rows.length > 0 && <div className="delivered-table-wrap"><table className="tbl delivered-table"><thead><tr><th>ID / Title</th><th>Campaign</th><th>Owner</th><th>Delivered at</th><th>Due result</th><th>Work type</th><th>Action</th></tr></thead><tbody>{deliveredState.rows.map(row => <tr key={row.workItemId || row.id}><td data-label="ID / Title"><strong className="mono">{row.id}</strong><span>{row.title}</span>{row.legacyMissingDeliveredAt && <span className="tag">Legacy date missing</span>}</td><td data-label="Campaign">{row.campaign || "-"}</td><td data-label="Owner">{row.ownerName || "Unassigned"}</td><td data-label="Delivered at">{row.deliveredLabel || "Needs review"}</td><td data-label="Due result"><span className={`delivery-result delivery-result--${row.dueResult || "unknown"}`}>{row.dueResult || "Unknown"}</span></td><td data-label="Work type">{row.type === "quick" ? "Quick task" : "Creative"}</td><td data-label="Action"><button type="button" className="btn btn--sm btn--secondary" onClick={() => openDeliveredWork(row)}>Open detail</button></td></tr>)}</tbody></table></div>}
          <div className="delivered-pagination" aria-label="Delivered history pagination">
            <button type="button" className="btn btn--sm btn--secondary" disabled={!deliveredCursorStack.length || deliveredState.status === "loading"} onClick={showPreviousDeliveredPage}>Previous</button>
            <span>{deliveredCursorStack.length + 1}</span>
            <button type="button" className="btn btn--sm btn--secondary" disabled={!deliveredState.hasMore || deliveredState.status === "loading"} onClick={showNextDeliveredPage}>Next</button>
          </div>
        </section>
      )}
    </div>
  );
}

/* ============================================================
   ATTENTION NEEDED
   ============================================================ */
const FLOWMATE_ATTENTION_CATEGORIES_B = [
  { code: "unassigned", label: "Unassigned", hint: "Choose an active GD/VE owner from the work item detail." },
  { code: "over_capacity", label: "Over capacity", hint: "Owner workload exceeds their normal daily capacity; review priority or reassign the task." },
  { code: "wip_exceeded", label: "WIP exceeded", hint: "Owner has more active production work than their WIP limit." },
  { code: "skill_mismatch", label: "Skill mismatch", hint: "Assigned owner does not have the requested primary skill." },
  { code: "backup_skill", label: "Backup skill", hint: "Assignment used a configured backup skill." },
  { code: "member_partial", label: "Partial availability", hint: "Assigned owner has partial availability." },
  { code: "member_on_leave", label: "Member on leave", hint: "Assigned owner has leave during the production window." },
  { code: "deadline_capacity_gap", label: "Deadline capacity gap", hint: "Available capacity does not fully cover work before 1st Draft." },
  { code: "review_buffer_risk", label: "Review buffer risk", hint: "The review window before Launch is compressed." },
  { code: "review_delay", label: "Review delay", hint: "Requester review is past the at-risk date." },
  { code: "blocked", label: "Blocked", hint: "Resolve the recorded blocker before production can continue." },
  { code: "needs_split", label: "Needs split", hint: "Split the combined deliverables while retaining the assigned owner." },
];

function flowMateAttentionContextB(work, categoryCode) {
  const warning = (window.getFlowMateAssignmentWarnings ? window.getFlowMateAssignmentWarnings(work) : [])
    .find((item) => item.code === categoryCode);
  if (warning && warning.message) return warning.message;
  if (categoryCode === "unassigned") return work.assignmentReason || "Task is ready but needs manual assignment.";
  if (categoryCode === "review_delay") return `Review is delayed${work.dueFullLabel || work.dueLabel ? ` past ${work.dueFullLabel || work.dueLabel}` : ""}.`;
  if (categoryCode === "blocked") return work.blockReason || "Production is blocked.";
  if (categoryCode === "needs_split") return "Combined deliverables need to be split for production tracking.";
  return work.assignmentReason || "Open the detail view for assignment context.";
}

function QueueScreen({ onOpen, searchQuery = "" }) {
  const [sourceRows, setSourceRows] = useStateB(WORK);
  const [loadState, setLoadState] = useStateB({ status: "loading", message: "Loading Supabase data..." });

  useEffectB(() => {
    let alive = true;
    async function loadRows() {
      if (!window.loadFlowMateOperationalRows) {
        setSourceRows([]);
        setLoadState({ status: "error", message: "Live data unavailable: Supabase list loader is not ready." });
        return;
      }
      try {
        const rows = await window.loadFlowMateOperationalRows();
        if (!alive) return;
        setSourceRows(rows);
        setLoadState({ status: "live", message: "Live Supabase data" });
      } catch (error) {
        if (!alive) return;
        console.error("[FlowMate Attention] Supabase load failed:", error);
        setSourceRows([]);
        setLoadState({ status: "error", message: `Live data unavailable: ${window.flowmateUserError(error, "Supabase query failed.")}` });
      }
    }
    loadRows();
    const cleanup = window.attachFlowMateLiveRefresh ? window.attachFlowMateLiveRefresh(loadRows) : () => {};
    return () => { alive = false; cleanup(); };
  }, []);

  const attentionRows = window.getFlowMateAttentionRows
    ? window.getFlowMateAttentionRows(sourceRows, searchQuery)
    : [];
  const attentionGroups = window.getFlowMateAttentionGroups
    ? window.getFlowMateAttentionGroups(sourceRows, searchQuery)
    : {};

  function openAttentionItem(work) {
    window.flowmateSelectedWorkItem = work;
    onOpen(work.id);
  }

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Attention Needed</h1>
          <div className="page__sub">Advisory assignment and delivery risks that need a human decision - {loadState.message}</div>
        </div>
      </div>

      <div className="stat-strip" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <div className="stat stat--accent"><div className="stat__num">{attentionRows.length}</div><div className="stat__lbl">Unique tasks</div><div className="stat__delta">counted once</div></div>
        <div className="stat stat--warn"><div className="stat__num">{(attentionGroups.unassigned || []).length}</div><div className="stat__lbl">Unassigned</div></div>
        <div className="stat stat--warn"><div className="stat__num">{(attentionGroups.over_capacity || []).length + (attentionGroups.deadline_capacity_gap || []).length}</div><div className="stat__lbl">Capacity risk</div></div>
        <div className="stat stat--accent"><div className="stat__num">{(attentionGroups.blocked || []).length + (attentionGroups.review_delay || []).length}</div><div className="stat__lbl">Delivery risk signals</div></div>
      </div>

      {FLOWMATE_ATTENTION_CATEGORIES_B.map((category) => (
        <AttentionGroup
          key={category.code}
          category={category}
          items={attentionGroups[category.code] || []}
          onOpen={openAttentionItem}
        />
      ))}
      {attentionRows.length === 0 && loadState.status !== "loading" && (
        <div className="card"><div className="card__body"><span className="muted">No tasks currently need attention.</span></div></div>
      )}
    </div>
  );
}

function AttentionGroup({ category, items, onOpen }) {
  if (!items.length) return null;
  return (
    <section className="section" aria-labelledby={`attention-${category.code}`}>
      <div className="section__head">
        <span className="section__title" id={`attention-${category.code}`}>{category.label}</span>
        <span className="section__count">{items.length}</span>
        <span className="spacer"></span>
        <span className="muted" style={{ fontSize: 12 }}>{category.hint}</span>
      </div>
      <table className="tbl">
        <thead><tr><th className="col-id">ID</th><th>Title</th><th>Status</th><th>Owner</th><th>Due</th><th style={{ width: "36%" }}>Actionable context</th><th className="col-right">Action</th></tr></thead>
        <tbody>
          {items.map((work) => (
            <tr key={`${category.code}:${work.id}`} onClick={() => onOpen(work)}>
              <td className="col-id mono">{work.id}</td>
              <td className="col-title"><div>{work.title}</div><AssignmentWarningBadges work={work} limit={2} /></td>
              <td><StatusBadge status={work.status} /></td>
              <td>{work.assignee && MEMBERS_BY_ID[work.assignee] ? MEMBERS_BY_ID[work.assignee].name : "Unassigned"}</td>
              <td><DueBadge delta={work.dueDelta} label={work.dueLabel} status={work.status} /></td>
              <td><div className="reason-box reason-box--queued" style={{ padding: "6px 10px", fontSize: 12 }}>{flowMateAttentionContextB(work, category.code)}</div></td>
              <td className="col-right"><button type="button" className="btn btn--xs btn--secondary" onClick={(event) => { event.stopPropagation(); onOpen(work); }}>Open detail</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/* ============================================================
   ADMIN WHITELIST
   ============================================================ */
function AdminWhitelistScreen() {
  const currentUser = window.FLOWMATE_CURRENT_USER || {};
  const [rows, setRows] = useStateB([]);
  const [loadState, setLoadState] = useStateB({ status: "loading", message: "Loading whitelist users..." });
  const [form, setForm] = useStateB({ email: "", displayName: "", role: "member", teamMemberCode: "" });
  const [pending, setPending] = useStateB(false);

  async function loadWhitelist() {
    if (!window.loadFlowMateWhitelistUsers) {
      setRows([]);
      setLoadState({ status: "error", message: "Whitelist loader is not ready." });
      return;
    }

    try {
      const data = await window.loadFlowMateWhitelistUsers();
      setRows(data || []);
      setLoadState({ status: "live", message: `${(data || []).length} whitelisted users` });
    } catch (error) {
      console.error("[FlowMate Admin] Whitelist load failed:", error);
      setRows([]);
      setLoadState({ status: "error", message: window.flowmateUserError(error, "Whitelist RPC failed.") });
    }
  }

  useEffectB(() => { loadWhitelist(); }, []);

  if (currentUser.role !== "admin") {
    return (
      <div className="page" style={{ maxWidth: 720 }}>
        <div className="card">
          <div className="card__head"><span className="card__title">Admin access required.</span></div>
          <div className="card__body">
            <div className="reason-box reason-box--need">Only FlowMate admins can manage the whitelist.</div>
          </div>
        </div>
      </div>
    );
  }

  function updateForm(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submitWhitelistUser(event) {
    event.preventDefault();
    setPending(true);
    setLoadState({ status: "loading", message: "Saving whitelist user..." });
    try {
      await window.upsertFlowMateWhitelistUser(form);
      setForm({ email: "", displayName: "", role: "member", teamMemberCode: "" });
      await loadWhitelist();
    } catch (error) {
      console.error("[FlowMate Admin] Whitelist save failed:", error);
      setLoadState({ status: "error", message: window.flowmateUserError(error, "Whitelist RPC failed.") });
    } finally {
      setPending(false);
    }
  }

  async function deactivateWhitelistUser(row) {
    if (!row || !row.email) return;
    if (row.email === currentUser.email) {
      setLoadState({ status: "error", message: "You cannot deactivate your own admin account from this screen." });
      return;
    }
    if (!window.confirm(`Deactivate ${row.email}? They will lose FlowMate access.`)) return;

    setPending(true);
    setLoadState({ status: "loading", message: `Deactivating ${row.email}...` });
    try {
      await window.deleteFlowMateWhitelistUser(row.email);
      await loadWhitelist();
    } catch (error) {
      console.error("[FlowMate Admin] Whitelist deactivate failed:", error);
      setLoadState({ status: "error", message: window.flowmateUserError(error, "Whitelist RPC failed.") });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Whitelist</h1>
          <div className="page__sub">Manage who can sign in to FlowMate - {loadState.message}</div>
        </div>
        <div className="page__actions">
          <button className="btn btn--secondary" onClick={loadWhitelist} disabled={pending}>
            <Icon name="rerun" /> Refresh
          </button>
        </div>
      </div>

      {loadState.status === "error" && (
        <div className="reason-box reason-box--need" style={{ marginBottom: 12 }}>
          {loadState.message}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card__head">
          <span className="card__title">Add or update user</span>
          <span className="card__sub">Backend RPC validates admin access and @garena.com email.</span>
        </div>
        <div className="card__body">
          <form onSubmit={submitWhitelistUser} style={{ display: "grid", gap: 12 }}>
            <div className="form-grid" style={{ gridTemplateColumns: "1.2fr 1fr 120px 160px" }}>
              <label className="field">
                <span className="field__label">Email *</span>
                <input
                  className="input"
                  value={form.email}
                  onChange={(event) => updateForm("email", event.target.value)}
                  placeholder="name@garena.com"
                  type="email"
                  disabled={pending}
                />
              </label>
              <label className="field">
                <span className="field__label">Display name *</span>
                <input
                  className="input"
                  value={form.displayName}
                  onChange={(event) => updateForm("displayName", event.target.value)}
                  placeholder="Display name"
                  disabled={pending}
                />
              </label>
              <label className="field">
                <span className="field__label">Role</span>
                <select
                  className="select"
                  value={form.role}
                  onChange={(event) => updateForm("role", event.target.value)}
                  disabled={pending}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <label className="field">
                <span className="field__label">Team member code</span>
                <input
                  className="input"
                  value={form.teamMemberCode}
                  onChange={(event) => updateForm("teamMemberCode", event.target.value)}
                  placeholder="optional"
                  disabled={pending}
                />
              </label>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn--primary" type="submit" disabled={pending}>
                <Icon name="plus" /> Add / update
              </button>
              <span className="muted" style={{ fontSize: 12 }}>Deactivate removes the email from whitelist and marks the matching app user inactive.</span>
            </div>
          </form>
        </div>
      </div>

      <div className="card card__body--flush" style={{ overflow: "hidden" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Email</th>
              <th>Display name</th>
              <th>Role</th>
              <th>Team code</th>
              <th>Added</th>
              <th className="col-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isCurrentUser = row.email === currentUser.email;
              return (
                <tr key={row.email}>
                  <td className="mono">{row.email}</td>
                  <td>{row.display_name || "-"}</td>
                  <td>
                    <span className={`badge ${row.role === "admin" ? "badge--progress" : "badge--assigned"}`}>
                      {row.role === "admin" ? "Admin" : "Member"}
                    </span>
                  </td>
                  <td className="mono muted">{row.team_member_code || "-"}</td>
                  <td className="mono muted" style={{ fontSize: 11 }}>
                    {row.created_at ? new Date(row.created_at).toLocaleDateString() : "-"}
                  </td>
                  <td className="col-right" onClick={(event) => event.stopPropagation()}>
                    <button
                      className="btn btn--xs btn--danger"
                      onClick={() => deactivateWhitelistUser(row)}
                      disabled={pending || isCurrentUser}
                      title={isCurrentUser ? "You cannot deactivate your own admin account here." : "Deactivate whitelist access"}
                    >
                      Deactivate
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan="6" style={{ textAlign: "center", color: "var(--garena-grey)", padding: 18 }}>
                  No whitelist users loaded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

Object.assign(window, { ListScreen, BoardScreen, QueueScreen, AdminWhitelistScreen });
