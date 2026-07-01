/* AUTO-GENERATED from screens-b.jsx by build-github.cjs. Do not edit; edit the .jsx and re-run `npm run build:github`. */
const {
  useState: useStateB,
  useEffect: useEffectB
} = React;
const FLOWMATE_LIST_VIEW_STATE_KEY = "flowmate:list:viewState:v1";
const FLOWMATE_DETAIL_BACK_CONTEXT_KEY = "flowmate:detail:backContext:v1";
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
Object.assign(window, {
  readFlowMateListViewState,
  saveFlowMateListViewState,
  saveFlowMateDetailBackContext,
  readFlowMateDetailBackContext
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
  const LIST_STATUS_FILTER_KEYS = ["queued", "assigned", "in_progress", "review", "blocked", "delivered", "cancelled"];
  const savedListState = readFlowMateListViewState();
  const [filterStatus, setFilterStatus] = useStateB(savedListState.filterStatus || "all");
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
  const rows = sourceRows.filter(w => {
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
  }, w.title), React.createElement("td", null, React.createElement(TypePill, {
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
  }, "Needs split"), w.reviewRound > 0 && React.createElement("span", {
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
  onOpen
}) {
  const columns = [{
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
  }, {
    key: "delivered",
    label: "Delivered"
  }];
  const [sourceRows, setSourceRows] = useStateB(WORK);
  const [loadState, setLoadState] = useStateB({
    status: "loading",
    message: "Loading Supabase data..."
  });
  const [draggingId, setDraggingId] = useStateB(null);
  const [hoverCol, setHoverCol] = useStateB(null);
  const [busy, setBusy] = useStateB(false);
  const [flash, setFlash] = useStateB(null);
  async function loadRows(isAlive = () => true) {
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
      if (!isAlive()) return;
      setSourceRows(rows);
      setLoadState({
        status: "live",
        message: "Live Supabase data"
      });
    } catch (error) {
      if (!isAlive()) return;
      console.error("[FlowMate Board] Supabase load failed:", error);
      setSourceRows([]);
      setLoadState({
        status: "error",
        message: `Live data unavailable: ${window.flowmateUserError(error, "Supabase query failed.")}`
      });
    }
  }
  useEffectB(() => {
    let alive = true;
    loadRows(() => alive);
    const cleanup = window.attachFlowMateLiveRefresh ? window.attachFlowMateLiveRefresh(() => loadRows(() => alive)) : () => {};
    return () => {
      alive = false;
      cleanup();
    };
  }, []);
  const byCol = Object.fromEntries(columns.map(c => [c.key, sourceRows.filter(w => w.status === c.key)]));
  function handleDragStart(e, w) {
    if (!w.isSupabaseRow) {
      e.preventDefault();
      setFlash({
        tone: "warn",
        text: "Drag-drop only works on live Supabase data."
      });
      return;
    }
    setDraggingId(w.id);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      try {
        e.dataTransfer.setData("text/plain", w.id);
      } catch (err) {}
    }
  }
  function handleDragEnd() {
    setDraggingId(null);
    setHoverCol(null);
  }
  function handleDragOver(e, colKey) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    if (hoverCol !== colKey) setHoverCol(colKey);
  }
  function handleDragLeave(colKey) {
    if (hoverCol === colKey) setHoverCol(null);
  }
  async function handleDrop(e, targetStatus) {
    e.preventDefault();
    setHoverCol(null);
    const id = draggingId || e.dataTransfer && e.dataTransfer.getData("text/plain");
    setDraggingId(null);
    if (!id) return;
    const row = sourceRows.find(r => r.id === id);
    if (!row) return;
    if (row.status === targetStatus) return;
    if (!row.isSupabaseRow) {
      setFlash({
        tone: "warn",
        text: "Drag-drop only works on live Supabase data."
      });
      return;
    }
    if (row.type === "quick") {
      if (targetStatus === "delivered") {
        const completeQuickTask = window.FLOWMATE_CURRENT_USER && window.FLOWMATE_CURRENT_USER.role === "admin" ? () => window.transitionFlowMateWorkStatus(row.id, targetStatus, {}) : () => window.completeFlowMateQuickTask(row.id);
        await runMutate(completeQuickTask, `${row.id} marked done.`);
      } else if (targetStatus === "cancelled") {
        const reason = await window.flowmatePrompt({
          title: "Cancel work",
          label: "Cancel reason",
          multiline: true,
          required: true
        });
        if (!reason) return;
        await runMutate(() => window.cancelFlowMateWorkItem(row, reason), `${row.id} cancelled.`);
      } else {
        setFlash({
          tone: "warn",
          text: "Quick tasks can only be moved to Delivered or Cancelled on the board."
        });
      }
      return;
    }
    const options = {};
    if (targetStatus === "review") {
      const link = await window.flowmatePrompt({
        title: "Submit for review",
        label: "Delivery link",
        placeholder: "https://drive.google.com/…",
        required: true,
        validate: value => window.flowmateSafeHttpUrl(value) ? null : "Enter a valid http(s) link."
      });
      if (!link) return;
      options.deliveryLink = link;
    }
    if (targetStatus === "blocked") {
      const reason = await window.flowmatePrompt({
        title: "Block work",
        label: "Blocked reason",
        multiline: true,
        required: true
      });
      if (!reason) return;
      options.blockedReason = reason;
    }
    if (targetStatus === "cancelled") {
      const reason = await window.flowmatePrompt({
        title: "Cancel work",
        label: "Cancel reason",
        multiline: true,
        required: true
      });
      if (!reason) return;
      options.cancelReason = reason;
    }
    await runMutate(() => window.transitionFlowMateWorkStatus(row.id, targetStatus, options), `${row.id} → ${STATUS_LABEL[targetStatus] || targetStatus}`);
  }
  async function runMutate(fn, successText) {
    setBusy(true);
    try {
      await fn();
      await loadRows();
      setFlash({
        tone: "ok",
        text: successText
      });
    } catch (error) {
      console.error("[FlowMate Board] transition failed:", error);
      setFlash({
        tone: "bad",
        text: window.flowmateUserError(error, "Transition rejected by backend.")
      });
    } finally {
      setBusy(false);
    }
  }
  return React.createElement("div", {
    className: "page"
  }, React.createElement("div", {
    className: "page__header"
  }, React.createElement("div", null, React.createElement("h1", {
    className: "page__title"
  }, "Board"), React.createElement("div", {
    className: "page__sub"
  }, "Drag a card to a new column to change status — backend validates each transition.", React.createElement("span", {
    style: {
      marginLeft: 8,
      opacity: 0.75
    }
  }, loadState.message))), React.createElement("div", {
    className: "page__actions"
  }, React.createElement("button", {
    className: "btn btn--secondary",
    onClick: () => loadRows(),
    disabled: busy
  }, React.createElement(Icon, {
    name: "rerun"
  }), " Refresh"))), flash && React.createElement("div", {
    className: `reason-box ${flash.tone === "bad" ? "reason-box--need" : flash.tone === "warn" ? "reason-box--queued" : ""}`,
    style: {
      marginBottom: 12
    }
  }, flash.text, React.createElement("button", {
    className: "btn btn--xs btn--ghost",
    style: {
      marginLeft: 8
    },
    onClick: () => setFlash(null)
  }, "Dismiss")), React.createElement("div", {
    className: "kanban"
  }, columns.map(c => {
    const isHover = hoverCol === c.key;
    return React.createElement("div", {
      className: "kcol",
      key: c.key,
      onDragOver: e => handleDragOver(e, c.key),
      onDragLeave: () => handleDragLeave(c.key),
      onDrop: e => handleDrop(e, c.key),
      style: isHover ? {
        outline: "2px dashed var(--garena-deep-blue, #2E546D)",
        outlineOffset: -4,
        background: "rgba(46, 84, 109, 0.04)",
        transition: "outline 80ms, background 80ms"
      } : {
        transition: "outline 80ms, background 80ms"
      }
    }, React.createElement("div", {
      className: "kcol__head"
    }, React.createElement("span", {
      className: "kcol__title"
    }, c.label), React.createElement("span", {
      className: "kcol__count"
    }, byCol[c.key].length)), React.createElement("div", {
      className: "kcol__body"
    }, byCol[c.key].map(w => {
      const isDragging = draggingId === w.id;
      const draggable = Boolean(w.isSupabaseRow) && !busy;
      return React.createElement("div", {
        key: w.id,
        className: "kcard",
        draggable: draggable,
        onDragStart: e => handleDragStart(e, w),
        onDragEnd: handleDragEnd,
        onClick: () => {
          if (isDragging) return;
          window.flowmateSelectedWorkItem = w;
          onOpen(w.id);
        },
        style: {
          cursor: draggable ? isDragging ? "grabbing" : "grab" : "pointer",
          opacity: isDragging ? 0.4 : 1,
          transition: "opacity 120ms, transform 120ms",
          transform: isDragging ? "scale(0.98)" : "none"
        },
        title: draggable ? "Drag to a column to change status" : "Live data only — connect to Supabase to drag"
      }, React.createElement("div", {
        className: "row",
        style: {
          justifyContent: "space-between"
        }
      }, React.createElement("span", {
        className: "kcard__id mono"
      }, w.id), React.createElement(PriorityBadge, {
        level: w.priority
      })), React.createElement("div", {
        className: "kcard__title"
      }, w.title), React.createElement("div", {
        className: "kcard__row"
      }, React.createElement(Avatar, {
        memberId: w.assignee
      }), React.createElement(Effort, {
        value: w.effort
      }), React.createElement(Progress, w.checklist || {
        done: 0,
        total: 0
      }), React.createElement("span", {
        className: "spacer"
      }), React.createElement(DueBadge, {
        delta: w.dueDelta,
        label: w.dueLabel,
        status: w.status
      })), w.blockReason && React.createElement("div", {
        className: "kcard__row kcard__row--meta",
        style: {
          color: "var(--garena-red)"
        }
      }, React.createElement(Icon, {
        name: "alert",
        size: 11
      }), " ", w.blockReason));
    }), byCol[c.key].length === 0 && React.createElement("div", {
      className: "muted",
      style: {
        fontSize: 12,
        padding: 12,
        textAlign: "center"
      }
    }, isHover ? "Drop to move here" : c.key === "blocked" ? "No blocked items." : "Empty.")));
  })));
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
          message: "Live data unavailable: Supabase queue loader is not ready."
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
        console.error("[FlowMate Queue] Supabase load failed:", error);
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
  const queued = sourceRows.filter(w => {
    if (!window.matchesFlowMateSearch(w, searchQuery)) return false;
    return w.status === "queued" && !w.needsSplit;
  });
  const byReason = {
    capacity: queued
  };
  return React.createElement("div", {
    className: "page"
  }, React.createElement("div", {
    className: "page__header"
  }, React.createElement("div", null, React.createElement("h1", {
    className: "page__title"
  }, "Central queue"), React.createElement("div", {
    className: "page__sub"
  }, "Requests the engine could not assign - ", loadState.message)), React.createElement("div", {
    className: "page__actions"
  }, React.createElement("button", {
    className: "btn btn--secondary",
    onClick: async () => {
      const targets = queued.filter(w => w.isSupabaseRow && w.status === "queued" && !w.needsSplit);
      if (!targets.length) {
        window.alert("Nothing to rerun.");
        return;
      }
      let failed = 0;
      for (const w of targets) {
        try {
          await window.rerunFlowMateAssignment(w.id);
        } catch (error) {
          failed += 1;
          console.error("[FlowMate Queue] rerun failed for", w.id, error);
        }
      }
      if (failed > 0) window.alert(`${failed} of ${targets.length} reruns failed. Check the console.`);
    }
  }, React.createElement(Icon, {
    name: "rerun"
  }), " Rerun all"))), React.createElement("div", {
    className: "stat-strip",
    style: {
      gridTemplateColumns: "repeat(2, 1fr)"
    }
  }, React.createElement("div", {
    className: "stat stat--accent"
  }, React.createElement("div", {
    className: "stat__num"
  }, queued.length), React.createElement("div", {
    className: "stat__lbl"
  }, "Queued total")), React.createElement("div", {
    className: "stat stat--warn"
  }, React.createElement("div", {
    className: "stat__num"
  }, byReason.capacity.length), React.createElement("div", {
    className: "stat__lbl"
  }, "Capacity"))), React.createElement(QueueGroup, {
    title: "Capacity-blocked",
    tone: "warn",
    items: byReason.capacity,
    onOpen: onOpen,
    hint: "No eligible owner with remaining capacity before the due date."
  }));
}
function QueueGroup({
  title,
  items,
  hint,
  onOpen,
  tone
}) {
  if (items.length === 0) return null;
  return React.createElement("div", {
    className: "section"
  }, React.createElement("div", {
    className: "section__head"
  }, React.createElement("span", {
    className: "section__title"
  }, title), React.createElement("span", {
    className: "section__count"
  }, items.length), React.createElement("span", {
    className: "spacer"
  }), React.createElement("span", {
    className: "muted",
    style: {
      fontSize: 12
    }
  }, hint)), React.createElement("table", {
    className: "tbl"
  }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", {
    className: "col-id"
  }, "ID"), React.createElement("th", null, "Title"), React.createElement("th", null, "Requester team"), React.createElement("th", null, "Asset"), React.createElement("th", null, "Effort"), React.createElement("th", null, "Due"), React.createElement("th", {
    style: {
      width: "32%"
    }
  }, "Queue reason"), React.createElement("th", null, "Last run"), React.createElement("th", {
    className: "col-right"
  }, "Action"))), React.createElement("tbody", null, items.map(w => React.createElement("tr", {
    key: w.id,
    onClick: () => {
      window.flowmateSelectedWorkItem = w;
      onOpen(w.id);
    }
  }, React.createElement("td", {
    className: "col-id mono"
  }, w.id), React.createElement("td", {
    className: "col-title"
  }, React.createElement("div", null, w.title)), React.createElement("td", null, React.createElement("span", {
    className: "muted"
  }, w.requesterTeam)), React.createElement("td", null, ASSET_LABEL[w.assetType]), React.createElement("td", null, React.createElement(Effort, {
    value: w.effort
  })), React.createElement("td", null, React.createElement(DueBadge, {
    delta: w.dueDelta,
    label: w.dueLabel,
    status: w.status
  })), React.createElement("td", null, React.createElement("div", {
    className: "reason-box reason-box--queued",
    style: {
      padding: "6px 10px",
      fontSize: 12
    }
  }, w.queueReason)), React.createElement("td", {
    className: "mono muted",
    style: {
      fontSize: 11
    }
  }, w.lastRunLabel || "-"), React.createElement("td", {
    className: "col-right",
    onClick: e => e.stopPropagation()
  }, React.createElement("div", {
    style: {
      display: "inline-flex",
      gap: 4
    }
  }, w.status === "queued" && !w.needsSplit && w.isSupabaseRow && React.createElement("button", {
    className: "btn btn--xs btn--secondary",
    onClick: async () => {
      try {
        await window.rerunFlowMateAssignment(w.id);
      } catch (error) {
        window.alert(window.flowmateUserError(error, "Rerun failed."));
      }
    }
  }, React.createElement(Icon, {
    name: "rerun",
    size: 11
  }), " Rerun"))))))));
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
