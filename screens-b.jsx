// FlowMate - Screens part B: List, Board, Central Queue
const { useState: useStateB, useEffect: useEffectB } = React;
const FLOWMATE_LIST_VIEW_STATE_KEY = "flowmate:list:viewState:v1";
const FLOWMATE_DETAIL_BACK_CONTEXT_KEY = "flowmate:detail:backContext:v1";

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

Object.assign(window, {
  readFlowMateListViewState,
  saveFlowMateListViewState,
  saveFlowMateDetailBackContext,
  readFlowMateDetailBackContext,
});

function exportRowsCsv(rows) {
  const columns = ["ID", "Title", "Type", "Status", "Campaign", "Channel", "Publish Date", "Launch Date", "1st Draft", "Type / Skill", "Asset Count", "Owner", "Requester", "Team", "Asset", "Effort", "Priority"];
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
  const LIST_STATUS_FILTER_KEYS = ["need_brief", "queued", "assigned", "in_progress", "review", "blocked", "delivered", "cancelled"];
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
  const [loadState, setLoadState] = useStateB({ status: "loading", message: "Loading Supabase data..." });

  useEffectB(() => {
    let alive = true;

    async function loadRows() {
      if (!window.loadFlowMateListRows) {
        setSourceRows([]);
        setLoadState({ status: "error", message: "Live data unavailable: Supabase list loader is not ready." });
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
              <th>1st Draft</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(w => (
              <tr key={w.id} className={w.overdue ? "is-overdue" : ""} onClick={() => openListWorkItem(w)}>
                <td className="col-id mono">{w.id}</td>
                <td className="col-title">{w.title}</td>
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
                <td><DueBadge delta={w.dueDelta} label={w.dueLabel} status={w.status} /></td>
                <td>
                  <span className="row" style={{ gap: 4 }}>
                    {w.needsSplit && <span className="tag" style={{ background: "#FDEFE0", color: "#8A4A12" }}>Needs split</span>}
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
function BoardScreen({ onOpen }) {
  const columns = [
    { key: "need_brief", label: "Need Brief" },
    { key: "assigned",    label: "Assigned" },
    { key: "in_progress", label: "In Progress" },
    { key: "review",      label: "Review" },
    { key: "blocked",     label: "Blocked" },
    { key: "delivered",   label: "Delivered" },
  ];
  const [sourceRows, setSourceRows] = useStateB(WORK);
  const [loadState, setLoadState] = useStateB({ status: "loading", message: "Loading Supabase data..." });
  const [draggingId, setDraggingId] = useStateB(null);
  const [hoverCol, setHoverCol] = useStateB(null);
  const [busy, setBusy] = useStateB(false);
  const [flash, setFlash] = useStateB(null);

  async function loadRows(isAlive = () => true) {
    if (!window.loadFlowMateListRows) {
      setSourceRows([]);
      setLoadState({ status: "error", message: "Live data unavailable: Supabase list loader is not ready." });
      return;
    }
    try {
      const rows = await window.loadFlowMateListRows();
      if (!isAlive()) return;
      setSourceRows(rows);
      setLoadState({ status: "live", message: "Live Supabase data" });
    } catch (error) {
      if (!isAlive()) return;
      console.error("[FlowMate Board] Supabase load failed:", error);
      setSourceRows([]);
      setLoadState({ status: "error", message: `Live data unavailable: ${window.flowmateUserError(error, "Supabase query failed.")}` });
    }
  }

  useEffectB(() => {
    let alive = true;
    loadRows(() => alive);
    const cleanup = window.attachFlowMateLiveRefresh
      ? window.attachFlowMateLiveRefresh(() => loadRows(() => alive))
      : () => {};
    return () => { alive = false; cleanup(); };
  }, []);

  const byCol = Object.fromEntries(columns.map(c => [c.key, sourceRows.filter(w => w.status === c.key)]));

  function handleDragStart(e, w) {
    if (!w.isSupabaseRow) {
      // Rows without a Supabase backing record cannot be mutated.
      e.preventDefault();
      setFlash({ tone: "warn", text: "Drag-drop only works on live Supabase data." });
      return;
    }
    setDraggingId(w.id);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", w.id); } catch (err) {}
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
    const id = draggingId || (e.dataTransfer && e.dataTransfer.getData("text/plain"));
    setDraggingId(null);
    if (!id) return;

    const row = sourceRows.find(r => r.id === id);
    if (!row) return;
    if (row.status === targetStatus) return;
    if (!row.isSupabaseRow) {
      setFlash({ tone: "warn", text: "Drag-drop only works on live Supabase data." });
      return;
    }

    // Quick tasks: only a couple of board transitions make sense in MVP.
    if (row.type === "quick") {
      if (targetStatus === "delivered") {
        const completeQuickTask = window.FLOWMATE_CURRENT_USER && window.FLOWMATE_CURRENT_USER.role === "admin"
          ? () => window.transitionFlowMateWorkStatus(row.id, targetStatus, {})
          : () => window.completeFlowMateQuickTask(row.id);
        await runMutate(completeQuickTask,
                        `${row.id} marked done.`);
      } else if (targetStatus === "cancelled") {
        const reason = await window.flowmatePrompt({
          title: "Cancel work", label: "Cancel reason", multiline: true, required: true,
        });
        if (!reason) return;
        await runMutate(() => window.cancelFlowMateWorkItem(row, reason),
                        `${row.id} cancelled.`);
      } else {
        setFlash({ tone: "warn", text: "Quick tasks can only be moved to Delivered or Cancelled on the board." });
      }
      return;
    }

    // Creative requests — collect required reason / link based on target.
    const options = {};
    if (targetStatus === "review") {
      const link = await window.flowmatePrompt({
        title: "Submit for review",
        label: "Delivery link",
        placeholder: "https://drive.google.com/…",
        required: true,
        validate: (value) => (window.flowmateSafeHttpUrl(value) ? null : "Enter a valid http(s) link."),
      });
      if (!link) return;
      options.deliveryLink = link;
    }
    if (targetStatus === "blocked") {
      const reason = await window.flowmatePrompt({
        title: "Block work", label: "Blocked reason", multiline: true, required: true,
      });
      if (!reason) return;
      options.blockedReason = reason;
    }
    if (targetStatus === "cancelled") {
      const reason = await window.flowmatePrompt({
        title: "Cancel work", label: "Cancel reason", multiline: true, required: true,
      });
      if (!reason) return;
      options.cancelReason = reason;
    }

    await runMutate(
      () => window.transitionFlowMateWorkStatus(row.id, targetStatus, options),
      `${row.id} → ${STATUS_LABEL[targetStatus] || targetStatus}`,
    );
  }

  async function runMutate(fn, successText) {
    setBusy(true);
    try {
      await fn();
      await loadRows();
      setFlash({ tone: "ok", text: successText });
    } catch (error) {
      console.error("[FlowMate Board] transition failed:", error);
      setFlash({ tone: "bad", text: window.flowmateUserError(error, "Transition rejected by backend.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Board</h1>
          <div className="page__sub">
            Drag a card to a new column to change status — backend validates each transition.
            <span style={{ marginLeft: 8, opacity: 0.75 }}>{loadState.message}</span>
          </div>
        </div>
        <div className="page__actions">
          <button className="btn btn--secondary" onClick={() => loadRows()} disabled={busy}>
            <Icon name="rerun" /> Refresh
          </button>
        </div>
      </div>

      {flash && (
        <div className={`reason-box ${flash.tone === "bad" ? "reason-box--need" : flash.tone === "warn" ? "reason-box--queued" : ""}`}
             style={{ marginBottom: 12 }}>
          {flash.text}
          <button className="btn btn--xs btn--ghost" style={{ marginLeft: 8 }} onClick={() => setFlash(null)}>Dismiss</button>
        </div>
      )}

      <div className="kanban">
        {columns.map(c => {
          const isHover = hoverCol === c.key;
          return (
            <div
              className="kcol"
              key={c.key}
              onDragOver={(e) => handleDragOver(e, c.key)}
              onDragLeave={() => handleDragLeave(c.key)}
              onDrop={(e) => handleDrop(e, c.key)}
              style={isHover ? {
                outline: "2px dashed var(--garena-deep-blue, #2E546D)",
                outlineOffset: -4,
                background: "rgba(46, 84, 109, 0.04)",
                transition: "outline 80ms, background 80ms",
              } : { transition: "outline 80ms, background 80ms" }}
            >
              <div className="kcol__head">
                <span className="kcol__title">{c.label}</span>
                <span className="kcol__count">{byCol[c.key].length}</span>
              </div>
              <div className="kcol__body">
                {byCol[c.key].map(w => {
                  const isDragging = draggingId === w.id;
                  const draggable = Boolean(w.isSupabaseRow) && !busy;
                  return (
                    <div
                      key={w.id}
                      className="kcard"
                      draggable={draggable}
                      onDragStart={(e) => handleDragStart(e, w)}
                      onDragEnd={handleDragEnd}
                      onClick={() => {
                        if (isDragging) return;
                        // Pass the full row through the global so DetailScreen
                        // can render Supabase-only items that aren't in the
                        // static WORK_BY_ID fallback.
                        window.flowmateSelectedWorkItem = w;
                        onOpen(w.id);
                      }}
                      style={{
                        cursor: draggable ? (isDragging ? "grabbing" : "grab") : "pointer",
                        opacity: isDragging ? 0.4 : 1,
                        transition: "opacity 120ms, transform 120ms",
                        transform: isDragging ? "scale(0.98)" : "none",
                      }}
                      title={draggable ? "Drag to a column to change status" : "Live data only — connect to Supabase to drag"}
                    >
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <span className="kcard__id mono">{w.id}</span>
                        <PriorityBadge level={w.priority} />
                      </div>
                      <div className="kcard__title">{w.title}</div>
                      <div className="kcard__row">
                        <Avatar memberId={w.assignee} />
                        <Effort value={w.effort} />
                        <Progress {...(w.checklist || { done: 0, total: 0 })} />
                        <span className="spacer"></span>
                        <DueBadge delta={w.dueDelta} label={w.dueLabel} status={w.status} />
                      </div>
                      {w.blockReason && (
                        <div className="kcard__row kcard__row--meta" style={{ color: "var(--garena-red)" }}>
                          <Icon name="alert" size={11} /> {w.blockReason}
                        </div>
                      )}
                      {w.status === "need_brief" && (
                        <div className="kcard__row kcard__row--meta">
                          <Icon name="alert" size={11} /> {w.missingBriefReason || w.queueReason || "Need Brief follow-up"}
                        </div>
                      )}
                    </div>
                  );
                })}
                {byCol[c.key].length === 0 && (
                  <div className="muted" style={{ fontSize: 12, padding: 12, textAlign: "center" }}>
                    {isHover ? "Drop to move here" : (c.key === "blocked" ? "No blocked items." : "Empty.")}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   CENTRAL QUEUE
   ============================================================ */
function QueueScreen({ onOpen, searchQuery = "" }) {
  const [sourceRows, setSourceRows] = useStateB(WORK);
  const [loadState, setLoadState] = useStateB({ status: "loading", message: "Loading Supabase data..." });

  useEffectB(() => {
    let alive = true;

    async function loadRows() {
      if (!window.loadFlowMateListRows) {
        setSourceRows([]);
        setLoadState({ status: "error", message: "Live data unavailable: Supabase queue loader is not ready." });
        return;
      }

      try {
        const rows = await window.loadFlowMateListRows();
        if (!alive) return;
        setSourceRows(rows);
        setLoadState({ status: "live", message: "Live Supabase data" });
      } catch (error) {
        if (!alive) return;
        console.error("[FlowMate Queue] Supabase load failed:", error);
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

  const queued = sourceRows.filter(w => {
    if (!window.matchesFlowMateSearch(w, searchQuery)) return false;
    return w.status === "queued" && !w.needsSplit;
  });
  const needBriefRows = sourceRows.filter(w => {
    if (!window.matchesFlowMateSearch(w, searchQuery)) return false;
    return w.status === "need_brief" && !w.needsSplit;
  });
  const byReason = {
    brief: needBriefRows,
    capacity: queued,
  };

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Central queue</h1>
          <div className="page__sub">Requests the engine could not assign - {loadState.message}</div>
        </div>
        <div className="page__actions">
          <button className="btn btn--secondary" onClick={async () => {
            const targets = queued.filter(w => w.isSupabaseRow && w.status === "queued" && !w.needsSplit);
            if (!targets.length) { window.alert("Nothing to rerun."); return; }
            let failed = 0;
            for (const w of targets) {
              try {
                await window.rerunFlowMateAssignment(w.id);
              } catch (error) { failed += 1; console.error("[FlowMate Queue] rerun failed for", w.id, error); }
            }
            // O-4: rerunFlowMateAssignment dispatches a live refresh per call;
            // no full-page reload needed. Surface any failures.
            if (failed > 0) window.alert(`${failed} of ${targets.length} reruns failed. Check the console.`);
          }}>
            <Icon name="rerun" /> Rerun all
          </button>
        </div>
      </div>

      <div className="stat-strip" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        <div className="stat stat--accent"><div className="stat__num">{queued.length}</div><div className="stat__lbl">Queued total</div></div>
        <div className="stat stat--warn"><div className="stat__num">{byReason.capacity.length}</div><div className="stat__lbl">Capacity</div></div>
      </div>

      <QueueGroup title="Need Brief follow-up" tone="warn" items={byReason.brief} onOpen={onOpen}
                  hint="PIC/requester must complete required brief fields before assignment can run." />
      <QueueGroup title="Capacity-blocked" tone="warn" items={byReason.capacity} onOpen={onOpen}
                  hint="No eligible owner with remaining capacity before the due date." />
    </div>
  );
}

function QueueGroup({ title, items, hint, onOpen, tone }) {
  if (items.length === 0) return null;
  return (
    <div className="section">
      <div className="section__head">
        <span className="section__title">{title}</span>
        <span className="section__count">{items.length}</span>
        <span className="spacer"></span>
        <span className="muted" style={{ fontSize: 12 }}>{hint}</span>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th className="col-id">ID</th>
            <th>Title</th>
            <th>Requester team</th>
            <th>Asset</th>
            <th>Effort</th>
            <th>Due</th>
            <th style={{ width: "32%" }}>Queue reason</th>
            <th>Last run</th>
            <th className="col-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map(w => (
            <tr key={w.id} onClick={() => {
              window.flowmateSelectedWorkItem = w;
              onOpen(w.id);
            }}>
              <td className="col-id mono">{w.id}</td>
              <td className="col-title">
                <div>{w.title}</div>
              </td>
              <td><span className="muted">{w.requesterTeam}</span></td>
              <td>{ASSET_LABEL[w.assetType]}</td>
              <td><Effort value={w.effort} /></td>
              <td><DueBadge delta={w.dueDelta} label={w.dueLabel} status={w.status} /></td>
              <td>
                <div className="reason-box reason-box--queued" style={{ padding: "6px 10px", fontSize: 12 }}>
                  {w.queueReason}
                </div>
              </td>
              <td className="mono muted" style={{ fontSize: 11 }}>{w.lastRunLabel || "-"}</td>
              <td className="col-right" onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "inline-flex", gap: 4 }}>
                  {w.status === "queued" && !w.needsSplit && w.isSupabaseRow && (
                    <button className="btn btn--xs btn--secondary" onClick={async () => {
                      try { await window.rerunFlowMateAssignment(w.id); }
                      catch (error) { window.alert(window.flowmateUserError(error, "Rerun failed.")); }
                    }}>
                      <Icon name="rerun" size={11} /> Rerun
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
