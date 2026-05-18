// FlowMate โ€” Screens part C: Workload, KPI, Team Settings
const { useState: useStateC, useEffect: useEffectC } = React;

/* ============================================================
   WORKLOAD VIEW
   ============================================================ */
function WorkloadScreen({ onOpen }) {
  // Compute per-member rollups from WORK
  const mockRows = MEMBERS.map(m => {
    const mine = WORK.filter(w => w.assignee === m.id);
    const openCreative = mine.filter(w => w.type === "creative" && ["assigned","in_progress","review","blocked"].includes(w.status));
    const wip = mine.filter(w => w.status === "in_progress" && w.type === "creative").length;
    const assignedEffort = openCreative.reduce((s, w) => s + (w.effort || 0), 0);
    const effectiveCap = m.availability === "partial" ? (m.capacityOverride || 0) : (m.availability === "leave" ? 0 : m.capacityPerDay);
    // Window of 5 working days
    const window = effectiveCap * 5;
    return {
      m,
      assignedEffort,
      effectiveCap,
      window,
      available: Math.max(0, window - assignedEffort),
      wip,
      due_soon: mine.filter(w => w.dueDelta != null && w.dueDelta >= 0 && w.dueDelta <= 2 && ["assigned","in_progress","review"].includes(w.status)).length,
      overdue: mine.filter(w => w.overdue).length,
      blocked: mine.filter(w => w.status === "blocked").length,
      review: mine.filter(w => w.status === "review").length,
      quick: mine.filter(w => w.type === "quick" && !["delivered","cancelled"].includes(w.status)).length,
      items: openCreative,
    };
  });
  const [rows, setRows] = useStateC(mockRows);
  const [queuedEffort, setQueuedEffort] = useStateC(WORK.filter(w => w.status === "queued").reduce((s, w) => s + (w.effort || 0), 0));
  const [loadState, setLoadState] = useStateC({ status: "loading", message: "Loading Supabase data..." });

  useEffectC(() => {
    let alive = true;

    async function loadRows() {
      if (!window.loadFlowMateWorkloadRows) {
        setLoadState({ status: "fallback", message: "Using mock data: Supabase workload loader is not ready." });
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
        setRows(mockRows);
        setQueuedEffort(WORK.filter(w => w.status === "queued").reduce((s, w) => s + (w.effort || 0), 0));
        setLoadState({ status: "fallback", message: `Using mock data: ${error.message || "Supabase query failed."}` });
      }
    }

    loadRows();
    return () => { alive = false; };
  }, []);

  const totals = {
    capacity: rows.reduce((s, r) => s + r.window, 0),
    assigned: rows.reduce((s, r) => s + r.assignedEffort, 0),
    queued: queuedEffort,
    overdue: rows.reduce((s, r) => s + r.overdue, 0),
  };
  totals.available = totals.capacity - totals.assigned;

  const [expanded, setExpanded] = useStateC(new Set(["m-pond"]));
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
          <select className="select" style={{ width: 160, height: 32, padding: "0 28px 0 10px", fontSize: 13 }}><option>This week (5d)</option><option>Next week</option><option>Custom range</option></select>
          <button className="btn btn--secondary"><Icon name="download" /> Export</button>
        </div>
      </div>

      <div className="stat-strip" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        <div className="stat"><div className="stat__num mono">{totals.capacity}</div><div className="stat__lbl">Total capacity (pt)</div><div className="stat__delta">across {rows.length} members - 5 working days</div></div>
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
            {rows.map(r => {
              const pct = r.window > 0 ? Math.min(100, (r.assignedEffort / r.window) * 100) : 0;
              const over = r.assignedEffort > r.window;
              const wipFull = r.wip >= r.m.wipLimit;
              const partialNoOverride = r.m.availability === "partial" && !r.m.capacityOverride;
              const isOpen = expanded.has(r.m.id);
              return (
                <React.Fragment key={r.m.id}>
                  <tr className="workload-row" onClick={() => toggle(r.m.id)}>
                    <td>
                      <button className="iconbtn"><Icon name="chevron" size={12} style={{ transform: isOpen ? "rotate(90deg)" : "none" }} /></button>
                    </td>
                    <td className="col-name">
                      <span className="row" style={{ gap: 8 }}><Avatar memberId={r.m.id} size="avatar--lg" />
                        <span><div>{r.m.name}</div><div className="muted" style={{ fontSize: 11 }}>{r.m.discipline}</div></span>
                      </span>
                    </td>
                    <td>
                      <span className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                        {r.m.skills.map(s => <span key={s} className="tag">{ASSET_LABEL[s.replace("-backup","")] || s}{s.endsWith("backup") && " (backup)"}</span>)}
                      </span>
                    </td>
                    <td>
                      <span className={`avail avail--${r.m.availability}`}><span className="avail__dot"></span>
                        {r.m.availability === "available" && "Available"}
                        {r.m.availability === "partial" && (r.m.capacityOverride ? `Partial ยท ${r.m.capacityOverride}/d` : "Partial ยท no override")}
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
                          Active creative work ยท {r.items.length}
                        </div>
                        {r.items.length === 0 ? <div className="muted" style={{ fontSize: 12 }}>No assigned creative work.</div> : (
                          <table className="tbl" style={{ fontSize: 12 }}>
                            <tbody>
                              {r.items.map(w => (
                                <tr key={w.id} onClick={() => !w.isSupabaseRow && onOpen(w.id)}>
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
          </tbody>
        </table>
      </div>

      <Source>{loadState.status === "live" ? "Supabase member_workload_v" : "Prototype mock data"} - 5-day window - {TODAY} 2026</Source>
    </div>
  );
}

/* ============================================================
   KPI VIEW
   ============================================================ */
function KpiScreen() {
  function Spark({ data, color = "var(--garena-deep-blue)" }) {
    const max = Math.max(...data);
    const min = Math.min(...data);
    const w = 120, h = 28, pad = 2;
    const pts = data.map((v, i) => {
      const x = pad + (i / (data.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    return (
      <svg width={w} height={h} aria-hidden="true">
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    );
  }

  function Bar({ value, max, color = "var(--garena-deep-blue)" }) {
    const pct = max ? (value / max) * 100 : 0;
    return (
      <span style={{ display: "inline-block", width: 100, height: 8, background: "var(--garena-light-grey)", borderRadius: 4, position: "relative", overflow: "hidden", verticalAlign: "middle" }}>
        <span style={{ position: "absolute", inset: `0 ${100 - pct}% 0 0`, background: color }}></span>
      </span>
    );
  }

  const memberKpi = [
    { name: "Pond", delivered: 22, onTime: 91, avgReview: 1.2, blocked: 0 },
    { name: "Jo",   delivered: 18, onTime: 89, avgReview: 1.4, blocked: 1 },
    { name: "Tong", delivered: 11, onTime: 82, avgReview: 1.6, blocked: 0 },
    { name: "Eye",  delivered: 19, onTime: 95, avgReview: 0.9, blocked: 1 },
    { name: "Vee",  delivered: 14, onTime: 86, avgReview: 1.3, blocked: 0 },
  ];
  const teamKpi = [
    { team: "Marketing",  count: 28, share: 38 },
    { team: "Esport Ops", count: 19, share: 26 },
    { team: "Community",  count: 11, share: 15 },
    { team: "Sales",      count: 8,  share: 11 },
    { team: "Product",    count: 5,  share: 7 },
    { team: "Operations", count: 3,  share: 4 },
  ];

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">KPI</h1>
          <div className="page__sub">Operational health ยท rolling 4 weeks ยท Apr 19โ€“May 15, 2026</div>
        </div>
        <div className="page__actions">
          <select className="select" style={{ width: 160, height: 32, padding: "0 28px 0 10px", fontSize: 13 }}><option>Last 4 weeks</option><option>Last 8 weeks</option><option>This quarter</option></select>
          <button className="btn btn--secondary"><Icon name="download" /> Export</button>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi__lbl">Delivered effort</div>
          <div className="kpi__num mono">312<span style={{ fontSize: 14, color: "var(--garena-grey)", marginLeft: 4, fontWeight: 400 }}>pt</span></div>
          <div className="kpi__delta kpi__delta--up">โ–ฒ 8% vs prior 4w</div>
          <div style={{ marginTop: 8 }}><Spark data={[55,62,71,69,74,78,82,84]} /></div>
        </div>
        <div className="kpi">
          <div className="kpi__lbl">Throughput</div>
          <div className="kpi__num mono">74<span style={{ fontSize: 14, color: "var(--garena-grey)", marginLeft: 4, fontWeight: 400 }}>delivered</span></div>
          <div className="kpi__delta kpi__delta--up">โ–ฒ 6 vs prior</div>
          <div style={{ marginTop: 8 }}><Spark data={[12,16,18,15,17,19,18,20]} /></div>
        </div>
        <div className="kpi">
          <div className="kpi__lbl">On-time rate</div>
          <div className="kpi__num mono">88<span style={{ fontSize: 14, color: "var(--garena-grey)", marginLeft: 4, fontWeight: 400 }}>%</span></div>
          <div className="kpi__delta kpi__delta--down">โ–ผ 2pp vs prior</div>
          <div style={{ marginTop: 8 }}><Spark data={[92,91,90,89,87,88,89,88]} color="var(--garena-orange)" /></div>
        </div>
        <div className="kpi">
          <div className="kpi__lbl">Avg review rounds</div>
          <div className="kpi__num mono">1.3</div>
          <div className="kpi__delta">flat vs prior</div>
          <div style={{ marginTop: 8 }}><Spark data={[1.4,1.3,1.4,1.3,1.2,1.3,1.4,1.3]} /></div>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="kpi"><div className="kpi__lbl">Blocked</div><div className="kpi__num mono">{4}</div><div className="kpi__delta">2 over 3 days</div></div>
        <div className="kpi"><div className="kpi__lbl">Queued</div><div className="kpi__num mono">{4}</div><div className="kpi__delta">18 pt waiting</div></div>
        <div className="kpi"><div className="kpi__lbl">Need brief</div><div className="kpi__num mono">{1}</div><div className="kpi__delta">Community AMA ยท 3d</div></div>
        <div className="kpi"><div className="kpi__lbl">Quick tasks closed</div><div className="kpi__num mono">31</div><div className="kpi__delta kpi__delta--up">โ–ฒ 12 vs prior</div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <div className="card">
          <div className="card__head">
            <span className="card__title">Per member</span>
            <span className="card__sub">delivered effort ยท on-time ยท avg review</span>
          </div>
          <div className="card__body" style={{ padding: 0 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Delivered effort</th>
                  <th>Distribution</th>
                  <th>On-time</th>
                  <th>Avg review</th>
                  <th>Blocked</th>
                </tr>
              </thead>
              <tbody>
                {memberKpi.map(r => (
                  <tr key={r.name}>
                    <td className="col-name strong">
                      <span className="row" style={{ gap: 6 }}>
                        <Avatar memberId={"m-" + r.name.toLowerCase()} /> {r.name}
                      </span>
                    </td>
                    <td className="mono">{r.delivered} pt</td>
                    <td><Bar value={r.delivered} max={22} /></td>
                    <td><span className={r.onTime >= 90 ? "cell-ok" : r.onTime >= 80 ? "cell-warn" : "cell-bad"}>{r.onTime}%</span></td>
                    <td className="mono">{r.avgReview}</td>
                    <td className="mono">{r.blocked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card__head"><span className="card__title">By requester team</span><span className="card__sub">last 4 weeks</span></div>
          <div className="card__body" style={{ padding: 0 }}>
            <table className="tbl">
              <thead>
                <tr><th>Team</th><th>Requests</th><th>Share</th></tr>
              </thead>
              <tbody>
                {teamKpi.map(t => (
                  <tr key={t.team}>
                    <td className="strong">{t.team}</td>
                    <td className="mono">{t.count}</td>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <Bar value={t.share} max={40} color="var(--garena-orange)" />
                        <span className="mono muted" style={{ fontSize: 11 }}>{t.share}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16 }} className="reason-box">
        Productivity index is calculated as <span className="mono">delivered_effort ร— on_time_factor ร— rework_factor</span> and is intentionally <strong>not displayed as a personal ranking</strong> in MVP โ€” see PRD ยง12.
      </div>

      <Source>FlowMate audit_events &amp; work_items ยท rolling 4 weeks ยท May 15, 2026</Source>
    </div>
  );
}

/* ============================================================
   TEAM SETTINGS
   ============================================================ */
function SettingsScreen() {
  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Team settings</h1>
          <div className="page__sub">Members, skills, capacity, and WIP limits used by the assignment engine.</div>
        </div>
        <div className="page__actions">
          <button className="btn btn--secondary"><Icon name="plus" /> Add member</button>
        </div>
      </div>

      <div className="filterbar">
        <button className="chip is-active">All members</button>
        <button className="chip">Active</button>
        <button className="chip">Partial</button>
        <button className="chip">On leave</button>
        <span className="spacer"></span>
        <span className="muted" style={{ fontSize: 12 }}>{MEMBERS.length} members</span>
      </div>

      <div className="col" style={{ gap: 12 }}>
        {MEMBERS.map(m => (
          <div key={m.id} className="member-card">
            <div className="member-card__head">
              <Avatar memberId={m.id} size="avatar--xl" />
              <div>
                <div className="member-card__name">{m.name}</div>
                <div className="member-card__discipline">{m.discipline}</div>
                <div className={`avail avail--${m.availability}`} style={{ marginTop: 4 }}>
                  <span className="avail__dot"></span>
                  {m.availability === "available" && "Available"}
                  {m.availability === "partial" && (m.capacityOverride ? `Partial ยท ${m.capacityOverride} pt/d override` : "Partial ยท no override")}
                  {m.availability === "leave" && "On leave"}
                </div>
              </div>
            </div>

            <div className="col" style={{ gap: 6 }}>
              <div className="muted" style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>Skills</div>
              <div className="skill-tags">
                {m.skills.map(s => <span key={s} className="tag">{ASSET_LABEL[s.replace("-backup","")] || s}{s.endsWith("backup") && " (backup)"}</span>)}
                <button className="btn btn--xs btn--ghost"><Icon name="plus" size={11} /> Add skill</button>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Linked user: <span className="strong" style={{ color: "var(--garena-iron)" }}>{m.name.toLowerCase()}@garena.com</span>
              </div>
            </div>

            <div className="member-card__cap">
              <div className="row" style={{ justifyContent: "flex-end", gap: 16 }}>
                <div>
                  <div className="member-card__cap-num mono">{m.capacityPerDay}</div>
                  <div className="member-card__cap-lbl">cap pt/day</div>
                </div>
                <div>
                  <div className="member-card__cap-num mono">{m.wipLimit}</div>
                  <div className="member-card__cap-lbl">WIP limit</div>
                </div>
                <button className="iconbtn"><Icon name="pencil" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="reason-box" style={{ marginTop: 16 }}>
        <strong>Routing rules</strong> are configured at the team level โ€” not per member. Edits here change skill eligibility and capacity inputs to the assignment engine. Changing capacity reruns assignment for queued items in the background.
      </div>
    </div>
  );
}

Object.assign(window, { WorkloadScreen, KpiScreen, SettingsScreen });
