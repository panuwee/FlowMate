// Team views share the same task ID. All reads/writes use the authorized RPCs.
const TASK_ASSIGN_REQUEST_LABELS = { pending: "Awaiting acceptance", accepted: "Accepted", need_information: "Needs information", rejected: "Rejected" };
const taskAssignStatusLabel = status => status === "queued" ? "Team queue" : (STATUS_LABEL[status] || status);

function TaskAssignWorkspaceScreen({ onOpen, onNav, personal = false, searchQuery = "" }) {
  const team = window.TaskAssign.sourceTeam();
  const [view, setView] = React.useState(personal ? "mine" : "team");
  const [rows, setRows] = React.useState([]);
  const [status, setStatus] = React.useState("loading");
  const [error, setError] = React.useState("");
  const [teamFilter, setTeamFilter] = React.useState("");
  const [onlyOpen, setOnlyOpen] = React.useState(true);
  const generation = React.useRef(0);
  async function reload() {
    const request = ++generation.current;
    setStatus("loading"); setRows([]); setError("");
    try {
      const data = await window.TaskAssign.list(personal ? null : team, view);
      if (request !== generation.current) return;
      setRows(data || []); setStatus("ready");
    } catch (err) {
      if (request !== generation.current) return;
      setStatus("error"); setError(window.flowmateUserError(err));
    }
  }
  React.useEffect(() => {
    reload();
    const cleanup = window.attachFlowMateLiveRefresh ? window.attachFlowMateLiveRefresh(reload) : () => {
      window.removeEventListener("flowmate:refresh-request", reload);
    };
    if (!window.attachFlowMateLiveRefresh) window.addEventListener("flowmate:refresh-request", reload);
    return () => { ++generation.current; cleanup(); };
  }, [team, view, personal]);
  const visible = rows.filter(row => (!teamFilter || row.owning_team_code === teamFilter)
    && (!onlyOpen || !["delivered", "cancelled"].includes(row.status))
    && (!searchQuery || [row.display_id, row.title, row.description, row.project_name].some(value => String(value || "").toLowerCase().includes(searchQuery.toLowerCase()))));
  const views = personal ? [["mine", "Assigned to me"], ["created", "Created by me"]]
    : [["team", "Team work"], ["incoming", "Incoming requests"], ["outgoing", "Sent to other teams"]];
  return <div className="page" data-testid="task-assign-workspace">
    <div className="page__header"><div><h1 className="page__title">{personal ? "My work" : window.TaskAssign.teamLabel(team) + " Workspace"}</h1>
      <div className="page__sub">{personal ? "Your tasks across all authorized workspaces." : "Your team’s work and shared requests — one task, one record."}</div></div>
      <button className="btn btn--primary" onClick={() => onNav("create")}>Create task</button></div>
    <div className="filterbar" role="group" aria-label="Task views">{views.map(([key, label]) => <button key={key} className={"chip " + (view === key ? "is-active" : "")} aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}
      {personal && <select className="select" aria-label="Filter responsible team" value={teamFilter} onChange={e => setTeamFilter(e.target.value)}><option value="">All teams</option>{window.TaskAssign.teams.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select>}
      <label><input type="checkbox" checked={onlyOpen} onChange={e => setOnlyOpen(e.target.checked)} /> Open work only</label>
      <button className="btn btn--ghost" onClick={reload}>Refresh</button></div>
    <div className="stat-strip"><div className="stat"><div className="stat__num">{visible.length}</div><div className="stat__lbl">Tasks</div></div><div className="stat stat--warn"><div className="stat__num">{visible.filter(row => row.task_request_state === "pending").length}</div><div className="stat__lbl">Awaiting acceptance</div></div><div className="stat stat--info"><div className="stat__num">{visible.filter(row => row.status === "review").length}</div><div className="stat__lbl">Awaiting requester review</div></div></div>
    {error && <div className="reason-box reason-box--need" role="alert">{error}</div>}
    {status === "loading" && <div className="reason-box" role="status">Loading tasks…</div>}
    <div className="card task-assign-table" style={{ overflowX: "auto" }}><table className="tbl"><thead><tr><th>Task</th><th>Requester → Responsible team</th><th>Assignee</th><th>Acceptance / Status</th><th>Requested / Committed</th><th>Priority</th><th></th></tr></thead><tbody>
      {visible.map(row => <tr key={row.id}><td><strong>{row.title}</strong><div className="mono muted">{row.display_id}{row.task_confidential ? " · Confidential" : ""}</div><div className="muted">{row.project_name || "General work"}</div></td>
        <td>{window.TaskAssign.teamLabel(row.requester_team)} → {window.TaskAssign.teamLabel(row.owning_team_code)}</td><td>{row.assignee_name || "Team queue"}</td>
        <td>{TASK_ASSIGN_REQUEST_LABELS[row.task_request_state] || "Accepted"}<div className="muted">{taskAssignStatusLabel(row.status)}</div></td>
        <td>{row.task_requested_deadline || row.launch_date || "—"}<div className="muted">{row.task_committed_deadline || (row.task_request_state === "accepted" ? row.launch_date : null) || "Not committed"}</div></td><td>{row.priority}</td>
        <td><button className="btn btn--sm btn--secondary" onClick={() => onOpen(row.display_id)}>Open</button></td></tr>)}
      {!visible.length && status === "ready" && <tr><td colSpan="7">No tasks in this view.</td></tr>}
    </tbody></table></div>
    {!personal && window.FLOWMATE_CURRENT_USER?.role === "admin" && <TaskAssignDispatcherSettings team={team} />}
  </div>;
}

function TaskAssignDispatcherSettings({ team }) {
  const [members, setMembers] = React.useState([]);
  const [error, setError] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const alive = React.useRef(true);
  React.useEffect(() => { alive.current = true; setMembers([]); window.TaskAssign.members(team).then(data => { if (alive.current) setMembers(data); }).catch(err => { if (alive.current) setError(window.flowmateUserError(err)); }); return () => { alive.current = false; }; }, [team]);
  async function toggle(member) {
    if (pending) return;
    setPending(true); setError("");
    try { await window.TaskAssign.rpc("task_assign_set_dispatcher", { p_team: team, p_user: member.userId, p_enabled: !member.dispatcher }); const data = await window.TaskAssign.members(team); if (alive.current) setMembers(data); }
    catch (err) { if (alive.current) setError(window.flowmateUserError(err)); }
    finally { if (alive.current) setPending(false); }
  }
  return <details className="card" style={{ marginTop: 20 }}><summary className="card__head">Administrators: receiving-team dispatchers</summary><div className="card__body"><p>Dispatchers accept requests and assign team members. They do not automatically gain access to confidential tasks.</p>{error && <div role="alert">{error}</div>}{members.map(member => <label key={member.userId} style={{ display: "block", padding: "6px 0" }}><input type="checkbox" disabled={pending} checked={Boolean(member.dispatcher)} onChange={() => toggle(member)} /> {member.name}</label>)}</div></details>;
}

function TaskAssignDetailScreen({ focusId, onNav, onOpen }) {
  const [work, setWork] = React.useState(null);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [members, setMembers] = React.useState([]);
  const [comments, setComments] = React.useState([]);
  const [events, setEvents] = React.useState([]);
  const [values, setValues] = React.useState({ assignee: "", deadline: "", reason: "", team: "" });
  const [brief, setBrief] = React.useState({ title: "", note: "", project: "" });
  const [editing, setEditing] = React.useState(false);
  const [comment, setComment] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const pendingRef = React.useRef(false);
  const generation = React.useRef(0);
  async function reload() {
    const request = ++generation.current;
    setLoading(true); setError("");
    try {
      const rows = await window.TaskAssign.list(null, "detail", focusId);
      if (request !== generation.current) return;
      const row = rows?.[0];
      if (!row) { setWork(null); setComments([]); setEvents([]); setError("Task is unavailable or you no longer have access."); return; }
      const [people, commentResult, eventResult] = await Promise.all([
        row.can_dispatch ? window.TaskAssign.members(row.owning_team_code) : Promise.resolve([]),
        window.flowmateSupabase.from("comments").select("id,author_user_id,body,created_at").eq("work_item_id", row.id).is("deleted_at", null).order("created_at"),
        window.flowmateSupabase.from("work_item_events").select("id,metadata,created_at,from_status,to_status").eq("work_item_id", row.id).order("created_at"),
      ]);
      if (request !== generation.current) return;
      if (commentResult.error || eventResult.error) throw commentResult.error || eventResult.error;
      setWork(row); setMembers(people); setComments(commentResult.data || []); setEvents(eventResult.data || []);
      setValues({ assignee: row.assignee_user_id || "", deadline: row.task_committed_deadline || row.task_requested_deadline || row.launch_date || "", reason: "", team: "" });
      setBrief({ title: row.title, note: row.description || "", project: row.project_name || "" });
    } catch (err) {
      if (request === generation.current) { setWork(null); setComments([]); setEvents([]); setError(window.flowmateUserError(err)); }
    } finally { if (request === generation.current) setLoading(false); }
  }
  React.useEffect(() => {
    setWork(null); setComments([]); setEvents([]); reload();
    window.addEventListener("flowmate:refresh-request", reload);
    return () => { ++generation.current; window.removeEventListener("flowmate:refresh-request", reload); };
  }, [focusId]);
  async function mutate(operation) {
    if (pendingRef.current) return;
    pendingRef.current = true; setPending(true); setError("");
    try { await operation(); setEditing(false); setComment(""); await reload(); }
    catch (err) { setError(window.flowmateUserError(err)); }
    finally { pendingRef.current = false; setPending(false); }
  }
  function action(key) { mutate(() => window.TaskAssign.action(work, key, values)); }
  function button(key, label, primary = false) { return <button key={key} className={"btn " + (primary ? "btn--primary" : "btn--secondary")} disabled={pending || loading} onClick={() => action(key)}>{label}</button>; }
  const closed = work && ["delivered", "cancelled"].includes(work.status);
  const waiting = work && ["pending", "need_information"].includes(work.task_request_state);
  return <div className="page" data-testid="task-assign-detail">
    <div className="page__header"><div><h1 className="page__title">{work?.title || "Task detail"}</h1><div className="page__sub">{work?.display_id || focusId}</div></div><div className="row"><button className="btn btn--ghost" onClick={() => onNav("workspace")}>Back to Workspace</button><button className="btn btn--ghost" onClick={reload} disabled={pending}>Refresh</button></div></div>
    {error && <div className="reason-box reason-box--need" role="alert">{error}</div>}{loading && <div role="status">Loading task…</div>}
    {work && <>
      <div className="stat-strip"><div className="stat"><div className="stat__lbl">Requester workspace</div><strong>{window.TaskAssign.teamLabel(work.requester_team)}</strong><div>{work.requester_name}</div></div><div className="stat"><div className="stat__lbl">Responsible team / Assignee</div><strong>{window.TaskAssign.teamLabel(work.owning_team_code)}</strong><div>{work.assignee_name || "Team queue"}</div></div><div className="stat"><div className="stat__lbl">Acceptance / Status</div><strong>{TASK_ASSIGN_REQUEST_LABELS[work.task_request_state]}</strong><div>{taskAssignStatusLabel(work.status)}</div></div></div>
      <div className="card"><div className="card__head"><strong>Task brief</strong>{work.is_requester && !closed && <button className="btn btn--sm btn--ghost" onClick={() => setEditing(!editing)} disabled={pending}>{editing ? "Cancel editing" : "Edit brief"}</button>}</div><div className="card__body">
        {editing ? <div className="form-grid"><div className="field field--full"><label htmlFor="edit-task-title">Title</label><input id="edit-task-title" className="input" value={brief.title} onChange={e => setBrief({ ...brief, title: e.target.value })} /></div><div className="field field--full"><label htmlFor="edit-task-note">Note / Expected deliverable</label><textarea id="edit-task-note" className="textarea" value={brief.note} onChange={e => setBrief({ ...brief, note: e.target.value })} /></div><div className="field"><label htmlFor="edit-task-project">Project / Campaign</label><input id="edit-task-project" className="input" value={brief.project} onChange={e => setBrief({ ...brief, project: e.target.value })} /></div><div className="field"><button className="btn btn--primary" disabled={pending} onClick={() => mutate(() => window.TaskAssign.edit(work, brief))}>Save brief</button></div></div>
          : <><p style={{ whiteSpace: "pre-wrap" }}>{work.description || "No note"}</p><p>Project: {work.project_name || "General work"} · Priority: {work.priority}</p>{work.urgent_reason && <p>Urgent reason: {work.urgent_reason}</p>}</>}
        <div className="form-grid"><div>Requested deadline: <strong>{work.task_requested_deadline || work.launch_date || "—"}</strong></div><div>Committed deadline: <strong>{work.task_committed_deadline || (work.task_request_state === "accepted" ? work.launch_date : null) || "Awaiting acceptance"}</strong></div><div>1st review: {work.due_date || "Not required"}</div><div>{work.task_confidential ? "Confidential · selected people only" : "Shared with involved teams"}</div></div>
        {work.parent_display_id && <p>Parent task: <button className="btn btn--ghost" onClick={() => onOpen(work.parent_display_id)}>{work.parent_display_id}</button></p>}
        {(work.task_reference_links || []).map(link => { try { if (!["http:", "https:"].includes(new URL(link).protocol)) return null; } catch { return null; } return <p key={link}><a href={link} target="_blank" rel="noopener noreferrer">{link}</a></p>; })}
      </div></div>
      {!closed && <div className="card" style={{ marginTop: 16 }}><div className="card__head"><strong>Actions</strong></div><div className="card__body"><div className="form-grid">
        {work.can_dispatch && <><div className="field"><label htmlFor="accept-task-assignee">Responsible assignee</label><select id="accept-task-assignee" className="select" value={values.assignee} onChange={e => setValues({ ...values, assignee: e.target.value })}><option value="">Choose a member</option>{members.map(member => <option key={member.userId} value={member.userId}>{member.name}</option>)}</select></div><div className="field"><label htmlFor="accept-task-deadline">Committed deadline</label><input id="accept-task-deadline" className="input" type="date" min={getFlowMateTodayDateKey()} value={values.deadline} onChange={e => setValues({ ...values, deadline: e.target.value })} /></div></>}
        {(work.can_dispatch || work.can_execute || work.is_requester) && <div className="field field--full"><label htmlFor="task-action-reason">Reason / Information needed</label><textarea id="task-action-reason" className="textarea" value={values.reason} onChange={e => setValues({ ...values, reason: e.target.value })} /></div>}
        {(work.can_dispatch || (work.is_requester && work.task_request_state !== "accepted")) && !work.task_confidential && <div className="field"><label htmlFor="task-forward-team">Forward to another team</label><select id="task-forward-team" className="select" value={values.team} onChange={e => setValues({ ...values, team: e.target.value })}><option value="">Choose a team</option>{window.TaskAssign.teams.filter(team => team.key !== work.owning_team_code).map(team => <option key={team.key} value={team.key}>{team.label}</option>)}</select></div>}
      </div><div className="row" style={{ flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        {waiting && work.can_dispatch && [button("accept", "Accept & assign", true), button("need_information", "Request information"), button("reject", "Reject request")]}
        {work.task_request_state === "accepted" && work.can_dispatch && button("reassign", "Update assignee / commitment")}
        {work.can_execute && work.status === "assigned" && button("start", "Start work", true)}
        {work.can_execute && work.status === "in_progress" && button("submit", "Submit for review", true)}
        {work.can_execute && ["assigned", "in_progress"].includes(work.status) && button("block", "Block")}
        {work.can_execute && work.status === "blocked" && button("resume", "Resume")}
        {work.is_requester && work.status === "review" && [button("approve", "Confirm delivery", true), button("request_changes", "Request changes")]}
        {work.is_requester && ["need_information", "rejected"].includes(work.task_request_state) && button("resubmit", "Resubmit request", true)}
        {(work.can_dispatch || (work.is_requester && work.task_request_state !== "accepted")) && !work.task_confidential && button("forward", "Forward request")}
        {work.is_requester && button("cancel", "Cancel task")}
      </div>{!work.can_dispatch && waiting && <p className="muted">Waiting for the receiving team dispatcher to accept and assign this request.</p>}</div></div>}
      {closed && work.is_requester && <div className="card" style={{ marginTop: 16 }}><div className="card__body"><label htmlFor="task-reopen-reason">Reason for reopening</label><textarea id="task-reopen-reason" className="textarea" value={values.reason} onChange={e => setValues({ ...values, reason: e.target.value })} />{button("reopen", "Reopen into team queue")}</div></div>}
      <div className="card" style={{ marginTop: 16 }}><div className="card__head"><strong>Comments</strong></div><div className="card__body">{comments.map(entry => <div key={entry.id} style={{ marginBottom: 12 }}><p style={{ whiteSpace: "pre-wrap" }}>{entry.body}</p><span className="muted">{new Date(entry.created_at).toLocaleString("en-SG", { timeZone: "Asia/Bangkok" })}</span>{entry.author_user_id === window.FLOWMATE_CURRENT_USER?.id && <button className="btn btn--xs btn--ghost" disabled={pending} onClick={() => mutate(() => window.TaskAssign.rpc("task_assign_comment", { p_display_id: work.display_id, p_body: null, p_comment_id: entry.id, p_delete: true }))}>Delete my comment</button>}</div>)}
        <label htmlFor="task-comment">Add comment</label><textarea id="task-comment" className="textarea" value={comment} onChange={e => setComment(e.target.value)} /><button className="btn btn--secondary" disabled={pending || !comment.trim()} onClick={() => mutate(() => window.TaskAssign.rpc("task_assign_comment", { p_display_id: work.display_id, p_body: comment }))}>Add comment</button></div></div>
      <details className="card" style={{ marginTop: 16 }}><summary className="card__head">Task history</summary><div className="card__body">{events.map(event => <div key={event.id} style={{ marginBottom: 8 }}><strong>{event.metadata?.action || event.metadata?.request_state || "Created"}</strong> · {new Date(event.created_at).toLocaleString("en-SG", { timeZone: "Asia/Bangkok" })}{event.metadata?.reason && <p>{event.metadata.reason}</p>}{event.metadata?.committed_deadline && <span>Committed: {event.metadata.committed_deadline}</span>}</div>)}</div></details>
    </>}
  </div>;
}
