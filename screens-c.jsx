// FlowMate - Screens part C: Workload, KPI, Team Settings
const { useState: useStateC, useEffect: useEffectC } = React;

/* ============================================================
   WORKLOAD VIEW
   ============================================================ */
function WorkloadScreen({ onOpen }) {
  const WORKLOAD_TEAM_FILTERS = ["All", "Operations", "Marketing", "Esport"];
  const localRows = MEMBERS.map(m => {
    const mine = WORK.filter(w => w.assignee === m.id);
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
    };
  });
  const [rows, setRows] = useStateC(localRows);
  const [queuedEffort, setQueuedEffort] = useStateC(WORK.filter(w => w.status === "queued").reduce((s, w) => s + (w.effort || 0), 0));
  const [loadState, setLoadState] = useStateC({ status: "loading", message: "Loading Supabase data..." });
  const [workloadTab, setWorkloadTab] = useStateC("standard");
  const [teamFilter, setTeamFilter] = useStateC("All");

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
        setLoadState({ status: "error", message: `Live data unavailable: ${error.message || "Supabase query failed."}` });
      }
    }

    loadRows();
    return () => { alive = false; };
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
  }));
  const tabRows = safeRows.filter(r => {
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
    return totals;
  }, { assigned: 0, in_progress: 0, review: 0, blocked: 0, delivered: 0 });
  const totals = {
    capacity: visibleRows.reduce((s, r) => s + r.window, 0),
    assigned: visibleRows.reduce((s, r) => s + r.assignedEffort, 0),
    queued: queuedEffort,
    overdue: visibleRows.reduce((s, r) => s + r.overdue, 0),
  };
  totals.available = totals.capacity - totals.assigned;

  const [expanded, setExpanded] = useStateC(new Set());
  function toggle(id) {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  }

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Workload</h1>
          <div className="page__sub">Per-member effort across the next 5 working days - {loadState.message}</div>
        </div>
        <div className="page__actions">
          <select className="select" style={{ width: 160, height: 32, padding: "0 28px 0 10px", fontSize: 13 }} disabled title="Workload date range selector is planned for MVP 1.1"><option>This week (5d) - MVP 1.1</option><option>Next week</option><option>Custom range</option></select>
          <button className="btn btn--secondary" disabled title="Workload export is planned for MVP 1.1"><Icon name="download" /> Export (MVP 1.1)</button>
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
          <div className="stat-strip" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
            <div className="stat"><div className="stat__num mono">{statusTotals.assigned}</div><div className="stat__lbl">Assigned</div></div>
            <div className="stat stat--info"><div className="stat__num mono">{statusTotals.in_progress}</div><div className="stat__lbl">In progress</div></div>
            <div className="stat"><div className="stat__num mono">{statusTotals.review}</div><div className="stat__lbl">Review</div></div>
            <div className="stat stat--accent"><div className="stat__num mono">{statusTotals.blocked}</div><div className="stat__lbl">Blocked</div></div>
            <div className="stat stat--ok"><div className="stat__num mono">{statusTotals.delivered}</div><div className="stat__lbl">Delivered</div></div>
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
                  </tr>
                ))}
                {visibleRows.length === 0 && (
                  <tr><td colSpan="6" className="muted">No Non GD/VE workload rows loaded.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="stat-strip" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
            <div className="stat"><div className="stat__num mono">{totals.capacity}</div><div className="stat__lbl">Total capacity (pt)</div><div className="stat__delta">across {visibleRows.length} members - 5 working days</div></div>
            <div className="stat stat--info"><div className="stat__num mono">{totals.assigned}</div><div className="stat__lbl">Assigned effort</div></div>
            <div className="stat stat--ok"><div className="stat__num mono">{totals.available}</div><div className="stat__lbl">Available</div></div>
            <div className="stat stat--warn"><div className="stat__num mono">{totals.queued}</div><div className="stat__lbl">Queued effort</div></div>
            <div className="stat stat--accent"><div className="stat__num mono">{totals.overdue}</div><div className="stat__lbl">Overdue</div></div>
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
              <th style={{ width: 200 }}>Load (5d)</th>
              <th>WIP</th>
              <th>Due soon</th>
              <th>Overdue</th>
              <th>Blocked</th>
              <th>Review</th>
              <th>Quick</th>
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
                      <td colSpan="13" style={{ padding: "12px 14px" }}>
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
                  <tr><td colSpan="14" className="muted">No GD/VE workload rows loaded.</td></tr>
                )}
          </tbody>
        </table>
      </div>
        </>
      )}

      <Source>{loadState.status === "live" ? "Supabase member_workload_v" : "No local fallback data"} - 5-day window - {TODAY}</Source>
    </div>
  );
}

/* ============================================================
   KPI VIEW
   ============================================================ */
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
        setLoadState({ status: "error", message: `Live data unavailable: ${error.message || "Supabase query failed."}` });
      }
    }

    loadRows();
    return () => { alive = false; };
  }, []);

  const deliveredRows = rows.filter(w => w.status === "delivered" || w.status === "done");
  const activeRows = rows.filter(w => !["delivered", "done", "cancelled"].includes(w.status));
  const deliveredEffort = deliveredRows.reduce((sum, w) => sum + (w.effort || 0), 0);
  const blockedRows = activeRows.filter(w => w.status === "blocked");
  const queuedRows = activeRows.filter(w => w.status === "queued");
  const needBriefRows = activeRows.filter(w => w.status === "need_brief");
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
    };
    current.delivered += w.effort || 0;
    current.items += 1;
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
    };
    current.blocked += 1;
    ownerMap.set(id, current);
  });
  const ownerRows = Array.from(ownerMap.values()).sort((a, b) => b.delivered - a.delivered || a.name.localeCompare(b.name));
  const maxOwnerDelivered = Math.max(1, ...ownerRows.map(row => row.delivered));

  const teamMap = new Map();
  rows.forEach(w => {
    const team = w.requesterTeam || "No team";
    teamMap.set(team, (teamMap.get(team) || 0) + 1);
  });
  const teamRows = Array.from(teamMap.entries())
    .map(([team, count]) => ({ team, count, share: rows.length ? Math.round((count / rows.length) * 100) : 0 }))
    .sort((a, b) => b.count - a.count || a.team.localeCompare(b.team));
  const maxTeamShare = Math.max(1, ...teamRows.map(row => row.share));

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">KPI</h1>
          <div className="page__sub">Operational health from live Supabase rows - {loadState.message}</div>
        </div>
        <div className="page__actions">
          <select className="select" style={{ width: 160, height: 32, padding: "0 28px 0 10px", fontSize: 13 }} disabled title="KPI date range selector is planned for MVP 1.1"><option>Last 4 weeks - MVP 1.1</option><option>Last 8 weeks</option><option>This quarter</option></select>
          <button className="btn btn--secondary" disabled title="KPI export is planned for MVP 1.1"><Icon name="download" /> Export (MVP 1.1)</button>
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
          <div className="kpi__num mono">{rows.length ? (rows.reduce((sum, w) => sum + (w.reviewRound || 0), 0) / rows.length).toFixed(1) : "0.0"}</div>
          <div className="kpi__delta">Across loaded rows</div>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="kpi"><div className="kpi__lbl">Blocked</div><div className="kpi__num mono">{blockedRows.length}</div><div className="kpi__delta">Active blocked work</div></div>
        <div className="kpi"><div className="kpi__lbl">Queued</div><div className="kpi__num mono">{queuedRows.length}</div><div className="kpi__delta">{queuedRows.reduce((sum, w) => sum + (w.effort || 0), 0)} pt waiting</div></div>
        <div className="kpi"><div className="kpi__lbl">Need brief</div><div className="kpi__num mono">{needBriefRows.length}</div><div className="kpi__delta">Missing required brief fields</div></div>
        <div className="kpi"><div className="kpi__lbl">Quick tasks closed</div><div className="kpi__num mono">{quickClosedRows.length}</div><div className="kpi__delta">Closed quick tasks</div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <div className="card">
          <div className="card__head">
            <span className="card__title">Per member</span>
            <span className="card__sub">delivered effort - delivered items - active blocked</span>
          </div>
          <div className="card__body" style={{ padding: 0 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Delivered effort</th>
                  <th>Distribution</th>
                  <th>Delivered items</th>
                  <th>Blocked</th>
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
                    <td className="mono">{r.blocked}</td>
                  </tr>
                ))}
                {ownerRows.length === 0 && (
                  <tr><td colSpan="5" className="muted">No delivered or blocked rows loaded.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card__head"><span className="card__title">By requester team</span><span className="card__sub">loaded live rows</span></div>
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

      <Source>{loadState.status === "live" ? "Supabase work_items table" : "No local fallback data"} - {TODAY}</Source>
    </div>
  );
}

/* ============================================================
   TEAM SETTINGS
   ============================================================ */
function SettingsScreen() {
  const [members, setMembers] = useStateC(MEMBERS);
  const [loadState, setLoadState] = useStateC({ status: "loading", message: "Loading Supabase members..." });

  useEffectC(() => {
    let alive = true;

    async function loadMembers() {
      if (!window.loadFlowMateWorkloadRows) {
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
        setLoadState({ status: "error", message: `Live data unavailable: ${error.message || "Supabase query failed."}` });
      }
    }

    loadMembers();
    return () => { alive = false; };
  }, []);

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Team settings</h1>
          <div className="page__sub">Members, skills, capacity, and WIP limits used by the assignment engine. {loadState.message}</div>
        </div>
        <div className="page__actions">
          <button className="btn btn--secondary" disabled title="Team member editing is planned for MVP 1.1"><Icon name="plus" /> Add member (MVP 1.1)</button>
        </div>
      </div>

      <div className="filterbar">
        <button className="chip is-active" disabled title="Team settings filters are planned for MVP 1.1">All members (MVP 1.1)</button>
        <button className="chip" disabled title="Team settings filters are planned for MVP 1.1">Active (MVP 1.1)</button>
        <button className="chip" disabled title="Team settings filters are planned for MVP 1.1">Partial (MVP 1.1)</button>
        <button className="chip" disabled title="Team settings filters are planned for MVP 1.1">On leave (MVP 1.1)</button>
        <span className="spacer"></span>
        <span className="muted" style={{ fontSize: 12 }}>{members.length} members</span>
      </div>

      <div className="col" style={{ gap: 12 }}>
        {members.map(m => (
          <div key={m.id} className="member-card">
            <div className="member-card__head">
              <Avatar memberId={m.id} size="avatar--xl" />
              <div>
                <div className="member-card__name">{m.name}</div>
                <div className="member-card__discipline">{m.discipline}</div>
                <div className={`avail avail--${m.availability}`} style={{ marginTop: 4 }}>
                  <span className="avail__dot"></span>
                  {m.availability === "available" && "Available"}
                  {m.availability === "partial" && (m.capacityOverride ? `Partial - ${m.capacityOverride} pt/d override` : "Partial - no override")}
                  {m.availability === "leave" && "On leave"}
                </div>
              </div>
            </div>

            <div className="col" style={{ gap: 6 }}>
              <div className="muted" style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>Skills</div>
              <div className="skill-tags">
                {(m.skills || []).map(s => <span key={s} className="tag">{ASSET_LABEL[s.replace("-backup","")] || s}{s.endsWith("backup") && " (backup)"}</span>)}
                <button className="btn btn--xs btn--ghost" disabled title="Skill editing is planned for MVP 1.1"><Icon name="plus" size={11} /> Add skill (MVP 1.1)</button>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Team member ID: <span className="strong mono" style={{ color: "var(--garena-iron)" }}>{m.id}</span>
              </div>
            </div>

            <div className="member-card__cap">
              <div className="row" style={{ justifyContent: "flex-end", gap: 16 }}>
                <div>
                  <div className="member-card__cap-num mono">{m.capacityPerDay || 0}</div>
                  <div className="member-card__cap-lbl">cap pt/day</div>
                </div>
                <div>
                  <div className="member-card__cap-num mono">{m.wipLimit || 0}</div>
                  <div className="member-card__cap-lbl">WIP limit</div>
                </div>
                <button className="btn btn--xs btn--secondary" disabled title="Capacity editing is planned for MVP 1.1"><Icon name="pencil" /> Edit (MVP 1.1)</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="reason-box" style={{ marginTop: 16 }}>
        <strong>Routing rules</strong> are configured at the team level - not per member. Edits here change skill eligibility and capacity inputs to the assignment engine. Changing capacity reruns assignment for queued items in the background.
      </div>
    </div>
  );
}

Object.assign(window, { WorkloadScreen, KpiScreen, SettingsScreen });
