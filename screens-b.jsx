// FlowMate โ€” Screens part B: List, Board, Central Queue
const { useState: useStateB, useEffect: useEffectB } = React;

/* ============================================================
   LIST VIEW
   ============================================================ */
function ListScreen({ onOpen, searchQuery = "" }) {
  const [filterStatus, setFilterStatus] = useStateB("all");
  const [filterFlag, setFilterFlag] = useStateB("all");
  const [sourceRows, setSourceRows] = useStateB(WORK);
  const [loadState, setLoadState] = useStateB({ status: "loading", message: "Loading Supabase data..." });

  useEffectB(() => {
    let alive = true;

    async function loadRows() {
      if (!window.loadFlowMateListRows) {
        setLoadState({ status: "fallback", message: "Using mock data: Supabase list loader is not ready." });
        return;
      }

      try {
        const rows = await window.loadFlowMateListRows();
        if (!alive) return;
        setSourceRows(rows);
        setLoadState({ status: "live", message: "Live Supabase data" });
      } catch (error) {
        if (!alive) return;
        console.error("[FlowMate List] Supabase load failed:", error);
        setSourceRows(WORK);
        setLoadState({ status: "fallback", message: `Using mock data: ${error.message || "Supabase query failed."}` });
      }
    }

    loadRows();
    return () => { alive = false; };
  }, []);

  const rows = sourceRows.filter(w => {
    if (!window.matchesFlowMateSearch(w, searchQuery)) return false;
    if (filterStatus !== "all" && w.status !== filterStatus) return false;
    if (filterFlag === "overdue" && !w.overdue) return false;
    if (filterFlag === "duesoon" && !(w.dueDelta != null && w.dueDelta >= 0 && w.dueDelta <= 2)) return false;
    if (filterFlag === "blocked" && w.status !== "blocked") return false;
    return true;
  });

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">All work</h1>
          <div className="page__sub">{sourceRows.length} items across all statuses - {loadState.message}</div>
        </div>
        <div className="page__actions">
          <button className="btn btn--secondary"><Icon name="filter" /> Saved views</button>
          <button className="btn btn--secondary"><Icon name="download" /> Export</button>
        </div>
      </div>

      <div className="filterbar">
        <select className="select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="select"><option>All owners</option>{MEMBERS.map(m => <option key={m.id}>{m.name}</option>)}</select>
        <select className="select"><option>All teams</option>{TEAMS.map(t => <option key={t}>{t}</option>)}</select>
        <select className="select"><option>All asset types</option><option>Static</option><option>General video</option><option>Motion</option><option>Esport video</option><option>Hybrid</option></select>
        <select className="select"><option>All types</option><option>Creative</option><option>Quick task</option></select>
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
              <th>Owner</th>
              <th>Requester / Team</th>
              <th>Asset</th>
              <th>Effort</th>
              <th>Priority</th>
              <th>Due</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(w => (
              <tr key={w.id} className={w.overdue ? "is-overdue" : ""} onClick={() => !w.isSupabaseRow && onOpen(w.id)}>
                <td className="col-id mono">{w.id}</td>
                <td className="col-title">{w.title}</td>
                <td><TypePill type={w.type} /></td>
                <td><StatusBadge status={w.status} /></td>
                <td>
                  {w.assignee ? (
                    <span className="row" style={{ gap: 6 }}><Avatar memberId={w.assignee} /> <span>{MEMBERS_BY_ID[w.assignee].name}</span></span>
                  ) : <span className="muted">Unassigned</span>}
                </td>
                <td><div style={{ fontSize: 12 }}>{w.requester || "โ€”"}</div><div className="muted" style={{ fontSize: 11 }}>{w.requesterTeam}</div></td>
                <td><span className="muted" style={{ fontSize: 12 }}>{ASSET_LABEL[w.assetType] || "โ€”"}</span></td>
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

      <Source>{loadState.status === "live" ? "Supabase work_items table" : "Prototype mock data"} - {TODAY} 2026</Source>
    </div>
  );
}

/* ============================================================
   KANBAN BOARD
   ============================================================ */
function BoardScreen({ onOpen }) {
  const columns = [
    { key: "assigned",    label: "Assigned" },
    { key: "in_progress", label: "In Progress" },
    { key: "review",      label: "Review" },
    { key: "blocked",     label: "Blocked" },
    { key: "delivered",   label: "Delivered" },
  ];
  const byCol = Object.fromEntries(columns.map(c => [c.key, WORK.filter(w => w.status === c.key)]));

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Board</h1>
          <div className="page__sub">Drag to change status โ€” backend validates each transition.</div>
        </div>
        <div className="page__actions">
          <select className="select" style={{ width: 160, height: 32, padding: "0 28px 0 10px", fontSize: 13 }}><option>All members</option>{MEMBERS.map(m => <option key={m.id}>{m.name}</option>)}</select>
          <button className="btn btn--secondary"><Icon name="filter" /> Filters</button>
        </div>
      </div>

      <div className="filterbar">
        <button className="chip is-active">My items</button>
        <button className="chip">Static</button>
        <button className="chip">Motion</button>
        <button className="chip">Esport video</button>
        <button className="chip">Due soon</button>
        <button className="chip">Overdue</button>
      </div>

      <div className="kanban">
        {columns.map(c => (
          <div className="kcol" key={c.key}>
            <div className="kcol__head">
              <span className="kcol__title">{c.label}</span>
              <span className="kcol__count">{byCol[c.key].length}</span>
            </div>
            <div className="kcol__body">
              {byCol[c.key].map(w => (
                <div key={w.id} className="kcard" onClick={() => onOpen(w.id)}>
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
                </div>
              ))}
              {byCol[c.key].length === 0 && (
                <div className="muted" style={{ fontSize: 12, padding: 12, textAlign: "center" }}>
                  {c.key === "blocked" ? "No blocked items." : "Empty."}
                </div>
              )}
            </div>
          </div>
        ))}
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
        setLoadState({ status: "fallback", message: "Using mock data: Supabase queue loader is not ready." });
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
        setSourceRows(WORK);
        setLoadState({ status: "fallback", message: `Using mock data: ${error.message || "Supabase query failed."}` });
      }
    }

    loadRows();
    return () => { alive = false; };
  }, []);

  const queued = sourceRows.filter(w => {
    if (!window.matchesFlowMateSearch(w, searchQuery)) return false;
    return w.status === "queued" || w.status === "need_brief";
  });
  const byReason = {
    hybrid: queued.filter(w => w.needsSplit),
    capacity: queued.filter(w => w.status === "queued" && !w.needsSplit),
    brief: queued.filter(w => w.status === "need_brief"),
  };

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Central queue</h1>
          <div className="page__sub">Requests the engine could not assign - {loadState.message}</div>
        </div>
        <div className="page__actions">
          <button className="btn btn--secondary"><Icon name="rerun" /> Rerun all</button>
        </div>
      </div>

      <div className="stat-strip" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="stat stat--accent"><div className="stat__num">{queued.length}</div><div className="stat__lbl">Queued total</div></div>
        <div className="stat stat--warn"><div className="stat__num">{byReason.capacity.length}</div><div className="stat__lbl">Capacity</div></div>
        <div className="stat stat--warn"><div className="stat__num">{byReason.hybrid.length}</div><div className="stat__lbl">Needs split</div></div>
        <div className="stat"><div className="stat__num">{byReason.brief.length}</div><div className="stat__lbl">Need brief</div></div>
      </div>

      <QueueGroup title="Needs split (hybrid)" tone="warn" items={byReason.hybrid} onOpen={onOpen}
                  hint="Hybrid requests need to be split into separate static + video requests. The engine will not auto-route hybrid." />
      <QueueGroup title="Capacity-blocked" tone="warn" items={byReason.capacity} onOpen={onOpen}
                  hint="No eligible owner with remaining capacity before the due date." />
      <QueueGroup title="Need brief" tone="brand" items={byReason.brief} onOpen={onOpen}
                  hint="Required brief fields are missing - engine will not run until brief is complete." />
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
            <tr key={w.id} onClick={() => !w.isSupabaseRow && onOpen(w.id)}>
              <td className="col-id mono">{w.id}</td>
              <td className="col-title">
                <div>{w.title}</div>
                {w.needsSplit && <span className="tag" style={{ background: "#FDEFE0", color: "#8A4A12", marginTop: 4 }}>Needs split</span>}
              </td>
              <td><span className="muted">{w.requesterTeam}</span></td>
              <td>{ASSET_LABEL[w.assetType]}</td>
              <td><Effort value={w.effort} /></td>
              <td><DueBadge delta={w.dueDelta} label={w.dueLabel} status={w.status} /></td>
              <td>
                <div className={`reason-box ${w.status === "need_brief" ? "reason-box--need" : "reason-box--queued"}`} style={{ padding: "6px 10px", fontSize: 12 }}>
                  {w.queueReason}
                </div>
              </td>
              <td className="mono muted" style={{ fontSize: 11 }}>{w.status === "need_brief" ? "โ€”" : "May 15, 09:00"}</td>
              <td className="col-right" onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "inline-flex", gap: 4 }}>
                  {w.needsSplit && <button className="btn btn--xs btn--secondary">Create split</button>}
                  {w.status === "need_brief" && <button className="btn btn--xs btn--primary">Request brief</button>}
                  {w.status === "queued" && !w.needsSplit && <button className="btn btn--xs btn--secondary"><Icon name="rerun" size={11} /> Rerun</button>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

Object.assign(window, { ListScreen, BoardScreen, QueueScreen });
