/* AUTO-GENERATED from screens-task-assign.jsx by build-github.cjs. Do not edit; edit the .jsx and re-run `npm run build:github`. */
const TASK_ASSIGN_REQUEST_LABELS = {
  pending: "Awaiting acceptance",
  accepted: "Accepted",
  need_information: "Needs information",
  rejected: "Rejected"
};
const taskAssignStatusLabel = status => status === "queued" ? "Team queue" : STATUS_LABEL[status] || status;
function TaskAssignWorkspaceScreen({
  onOpen,
  onNav,
  personal = false,
  searchQuery = ""
}) {
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
    setStatus("loading");
    setRows([]);
    setError("");
    try {
      const data = await window.TaskAssign.list(personal ? null : team, view);
      if (request !== generation.current) return;
      setRows(data || []);
      setStatus("ready");
    } catch (err) {
      if (request !== generation.current) return;
      setStatus("error");
      setError(window.flowmateUserError(err));
    }
  }
  React.useEffect(() => {
    reload();
    const cleanup = window.attachFlowMateLiveRefresh ? window.attachFlowMateLiveRefresh(reload) : () => {
      window.removeEventListener("flowmate:refresh-request", reload);
    };
    if (!window.attachFlowMateLiveRefresh) window.addEventListener("flowmate:refresh-request", reload);
    return () => {
      ++generation.current;
      cleanup();
    };
  }, [team, view, personal]);
  const visible = rows.filter(row => (!teamFilter || row.owning_team_code === teamFilter) && (!onlyOpen || !["delivered", "cancelled"].includes(row.status)) && (!searchQuery || [row.display_id, row.title, row.description, row.project_name].some(value => String(value || "").toLowerCase().includes(searchQuery.toLowerCase()))));
  const views = personal ? [["mine", "Assigned to me"], ["created", "Created by me"]] : [["team", "Team work"], ["incoming", "Incoming requests"], ["outgoing", "Sent to other teams"]];
  return React.createElement("div", {
    className: "page",
    "data-testid": "task-assign-workspace"
  }, React.createElement("div", {
    className: "page__header"
  }, React.createElement("div", null, React.createElement("h1", {
    className: "page__title"
  }, personal ? "My work" : window.TaskAssign.teamLabel(team) + " Workspace"), React.createElement("div", {
    className: "page__sub"
  }, personal ? "Your tasks across all authorized workspaces." : "Your team’s work and shared requests — one task, one record.")), React.createElement("button", {
    className: "btn btn--primary",
    onClick: () => onNav("create")
  }, "Create task")), React.createElement("div", {
    className: "filterbar",
    role: "group",
    "aria-label": "Task views"
  }, views.map(([key, label]) => React.createElement("button", {
    key: key,
    className: "chip " + (view === key ? "is-active" : ""),
    "aria-pressed": view === key,
    onClick: () => setView(key)
  }, label)), personal && React.createElement("select", {
    className: "select",
    "aria-label": "Filter responsible team",
    value: teamFilter,
    onChange: e => setTeamFilter(e.target.value)
  }, React.createElement("option", {
    value: ""
  }, "All teams"), window.TaskAssign.teams.map(item => React.createElement("option", {
    key: item.key,
    value: item.key
  }, item.label))), React.createElement("label", null, React.createElement("input", {
    type: "checkbox",
    checked: onlyOpen,
    onChange: e => setOnlyOpen(e.target.checked)
  }), " Open work only"), React.createElement("button", {
    className: "btn btn--ghost",
    onClick: reload
  }, "Refresh")), React.createElement("div", {
    className: "stat-strip"
  }, React.createElement("div", {
    className: "stat"
  }, React.createElement("div", {
    className: "stat__num"
  }, visible.length), React.createElement("div", {
    className: "stat__lbl"
  }, "Tasks")), React.createElement("div", {
    className: "stat stat--warn"
  }, React.createElement("div", {
    className: "stat__num"
  }, visible.filter(row => row.task_request_state === "pending").length), React.createElement("div", {
    className: "stat__lbl"
  }, "Awaiting acceptance")), React.createElement("div", {
    className: "stat stat--info"
  }, React.createElement("div", {
    className: "stat__num"
  }, visible.filter(row => row.status === "review").length), React.createElement("div", {
    className: "stat__lbl"
  }, "Awaiting requester review"))), error && React.createElement("div", {
    className: "reason-box reason-box--need",
    role: "alert"
  }, error), status === "loading" && React.createElement("div", {
    className: "reason-box",
    role: "status"
  }, "Loading tasks…"), React.createElement("div", {
    className: "card task-assign-table",
    style: {
      overflowX: "auto"
    }
  }, React.createElement("table", {
    className: "tbl"
  }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "Task"), React.createElement("th", null, "Requester → Responsible team"), React.createElement("th", null, "Assignee"), React.createElement("th", null, "Acceptance / Status"), React.createElement("th", null, "Requested / Committed"), React.createElement("th", null, "Priority"), React.createElement("th", null))), React.createElement("tbody", null, visible.map(row => React.createElement("tr", {
    key: row.id
  }, React.createElement("td", null, React.createElement("strong", null, row.title), React.createElement("div", {
    className: "mono muted"
  }, row.display_id, row.task_confidential ? " · Confidential" : ""), React.createElement("div", {
    className: "muted"
  }, row.project_name || "General work")), React.createElement("td", null, window.TaskAssign.teamLabel(row.requester_team), " → ", window.TaskAssign.teamLabel(row.owning_team_code)), React.createElement("td", null, row.assignee_name || "Team queue"), React.createElement("td", null, TASK_ASSIGN_REQUEST_LABELS[row.task_request_state] || "Accepted", React.createElement("div", {
    className: "muted"
  }, taskAssignStatusLabel(row.status))), React.createElement("td", null, row.task_requested_deadline || row.launch_date || "—", React.createElement("div", {
    className: "muted"
  }, row.task_committed_deadline || (row.task_request_state === "accepted" ? row.launch_date : null) || "Not committed")), React.createElement("td", null, row.priority), React.createElement("td", null, React.createElement("button", {
    className: "btn btn--sm btn--secondary",
    onClick: () => onOpen(row.display_id)
  }, "Open")))), !visible.length && status === "ready" && React.createElement("tr", null, React.createElement("td", {
    colSpan: "7"
  }, "No tasks in this view."))))), !personal && window.FLOWMATE_CURRENT_USER?.role === "admin" && React.createElement(TaskAssignDispatcherSettings, {
    team: team
  }));
}
function TaskAssignDispatcherSettings({
  team
}) {
  const [members, setMembers] = React.useState([]);
  const [error, setError] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    setMembers([]);
    window.TaskAssign.members(team).then(data => {
      if (alive.current) setMembers(data);
    }).catch(err => {
      if (alive.current) setError(window.flowmateUserError(err));
    });
    return () => {
      alive.current = false;
    };
  }, [team]);
  async function toggle(member) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await window.TaskAssign.rpc("task_assign_set_dispatcher", {
        p_team: team,
        p_user: member.userId,
        p_enabled: !member.dispatcher
      });
      const data = await window.TaskAssign.members(team);
      if (alive.current) setMembers(data);
    } catch (err) {
      if (alive.current) setError(window.flowmateUserError(err));
    } finally {
      if (alive.current) setPending(false);
    }
  }
  return React.createElement("details", {
    className: "card",
    style: {
      marginTop: 20
    }
  }, React.createElement("summary", {
    className: "card__head"
  }, "Administrators: receiving-team dispatchers"), React.createElement("div", {
    className: "card__body"
  }, React.createElement("p", null, "Dispatchers accept requests and assign team members. They do not automatically gain access to confidential tasks."), error && React.createElement("div", {
    role: "alert"
  }, error), members.map(member => React.createElement("label", {
    key: member.userId,
    style: {
      display: "block",
      padding: "6px 0"
    }
  }, React.createElement("input", {
    type: "checkbox",
    disabled: pending,
    checked: Boolean(member.dispatcher),
    onChange: () => toggle(member)
  }), " ", member.name))));
}
function TaskAssignDetailScreen({
  focusId,
  onNav,
  onOpen
}) {
  const [work, setWork] = React.useState(null);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [members, setMembers] = React.useState([]);
  const [comments, setComments] = React.useState([]);
  const [events, setEvents] = React.useState([]);
  const [values, setValues] = React.useState({
    assignee: "",
    deadline: "",
    reason: "",
    team: ""
  });
  const [brief, setBrief] = React.useState({
    title: "",
    note: "",
    project: ""
  });
  const [editing, setEditing] = React.useState(false);
  const [comment, setComment] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const pendingRef = React.useRef(false);
  const generation = React.useRef(0);
  async function reload() {
    const request = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const rows = await window.TaskAssign.list(null, "detail", focusId);
      if (request !== generation.current) return;
      const row = rows?.[0];
      if (!row) {
        setWork(null);
        setComments([]);
        setEvents([]);
        setError("Task is unavailable or you no longer have access.");
        return;
      }
      const [people, commentResult, eventResult] = await Promise.all([row.can_dispatch ? window.TaskAssign.members(row.owning_team_code) : Promise.resolve([]), window.flowmateSupabase.from("comments").select("id,author_user_id,body,created_at").eq("work_item_id", row.id).is("deleted_at", null).order("created_at"), window.flowmateSupabase.from("work_item_events").select("id,metadata,created_at,from_status,to_status").eq("work_item_id", row.id).order("created_at")]);
      if (request !== generation.current) return;
      if (commentResult.error || eventResult.error) throw commentResult.error || eventResult.error;
      setWork(row);
      setMembers(people);
      setComments(commentResult.data || []);
      setEvents(eventResult.data || []);
      setValues({
        assignee: row.assignee_user_id || "",
        deadline: row.task_committed_deadline || row.task_requested_deadline || row.launch_date || "",
        reason: "",
        team: ""
      });
      setBrief({
        title: row.title,
        note: row.description || "",
        project: row.project_name || ""
      });
    } catch (err) {
      if (request === generation.current) {
        setWork(null);
        setComments([]);
        setEvents([]);
        setError(window.flowmateUserError(err));
      }
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }
  React.useEffect(() => {
    setWork(null);
    setComments([]);
    setEvents([]);
    reload();
    window.addEventListener("flowmate:refresh-request", reload);
    return () => {
      ++generation.current;
      window.removeEventListener("flowmate:refresh-request", reload);
    };
  }, [focusId]);
  async function mutate(operation) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    try {
      await operation();
      setEditing(false);
      setComment("");
      await reload();
    } catch (err) {
      setError(window.flowmateUserError(err));
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }
  function action(key) {
    mutate(() => window.TaskAssign.action(work, key, values));
  }
  function button(key, label, primary = false) {
    return React.createElement("button", {
      key: key,
      className: "btn " + (primary ? "btn--primary" : "btn--secondary"),
      disabled: pending || loading,
      onClick: () => action(key)
    }, label);
  }
  const closed = work && ["delivered", "cancelled"].includes(work.status);
  const waiting = work && ["pending", "need_information"].includes(work.task_request_state);
  return React.createElement("div", {
    className: "page",
    "data-testid": "task-assign-detail"
  }, React.createElement("div", {
    className: "page__header"
  }, React.createElement("div", null, React.createElement("h1", {
    className: "page__title"
  }, work?.title || "Task detail"), React.createElement("div", {
    className: "page__sub"
  }, work?.display_id || focusId)), React.createElement("div", {
    className: "row"
  }, React.createElement("button", {
    className: "btn btn--ghost",
    onClick: () => onNav("workspace")
  }, "Back to Workspace"), React.createElement("button", {
    className: "btn btn--ghost",
    onClick: reload,
    disabled: pending
  }, "Refresh"))), error && React.createElement("div", {
    className: "reason-box reason-box--need",
    role: "alert"
  }, error), loading && React.createElement("div", {
    role: "status"
  }, "Loading task…"), work && React.createElement(React.Fragment, null, React.createElement("div", {
    className: "stat-strip"
  }, React.createElement("div", {
    className: "stat"
  }, React.createElement("div", {
    className: "stat__lbl"
  }, "Requester workspace"), React.createElement("strong", null, window.TaskAssign.teamLabel(work.requester_team)), React.createElement("div", null, work.requester_name)), React.createElement("div", {
    className: "stat"
  }, React.createElement("div", {
    className: "stat__lbl"
  }, "Responsible team / Assignee"), React.createElement("strong", null, window.TaskAssign.teamLabel(work.owning_team_code)), React.createElement("div", null, work.assignee_name || "Team queue")), React.createElement("div", {
    className: "stat"
  }, React.createElement("div", {
    className: "stat__lbl"
  }, "Acceptance / Status"), React.createElement("strong", null, TASK_ASSIGN_REQUEST_LABELS[work.task_request_state]), React.createElement("div", null, taskAssignStatusLabel(work.status)))), React.createElement("div", {
    className: "card"
  }, React.createElement("div", {
    className: "card__head"
  }, React.createElement("strong", null, "Task brief"), work.is_requester && !closed && React.createElement("button", {
    className: "btn btn--sm btn--ghost",
    onClick: () => setEditing(!editing),
    disabled: pending
  }, editing ? "Cancel editing" : "Edit brief")), React.createElement("div", {
    className: "card__body"
  }, editing ? React.createElement("div", {
    className: "form-grid"
  }, React.createElement("div", {
    className: "field field--full"
  }, React.createElement("label", {
    htmlFor: "edit-task-title"
  }, "Title"), React.createElement("input", {
    id: "edit-task-title",
    className: "input",
    value: brief.title,
    onChange: e => setBrief({
      ...brief,
      title: e.target.value
    })
  })), React.createElement("div", {
    className: "field field--full"
  }, React.createElement("label", {
    htmlFor: "edit-task-note"
  }, "Note / Expected deliverable"), React.createElement("textarea", {
    id: "edit-task-note",
    className: "textarea",
    value: brief.note,
    onChange: e => setBrief({
      ...brief,
      note: e.target.value
    })
  })), React.createElement("div", {
    className: "field"
  }, React.createElement("label", {
    htmlFor: "edit-task-project"
  }, "Project / Campaign"), React.createElement("input", {
    id: "edit-task-project",
    className: "input",
    value: brief.project,
    onChange: e => setBrief({
      ...brief,
      project: e.target.value
    })
  })), React.createElement("div", {
    className: "field"
  }, React.createElement("button", {
    className: "btn btn--primary",
    disabled: pending,
    onClick: () => mutate(() => window.TaskAssign.edit(work, brief))
  }, "Save brief"))) : React.createElement(React.Fragment, null, React.createElement("p", {
    style: {
      whiteSpace: "pre-wrap"
    }
  }, work.description || "No note"), React.createElement("p", null, "Project: ", work.project_name || "General work", " · Priority: ", work.priority), work.urgent_reason && React.createElement("p", null, "Urgent reason: ", work.urgent_reason)), React.createElement("div", {
    className: "form-grid"
  }, React.createElement("div", null, "Requested deadline: ", React.createElement("strong", null, work.task_requested_deadline || work.launch_date || "—")), React.createElement("div", null, "Committed deadline: ", React.createElement("strong", null, work.task_committed_deadline || (work.task_request_state === "accepted" ? work.launch_date : null) || "Awaiting acceptance")), React.createElement("div", null, "1st review: ", work.due_date || "Not required"), React.createElement("div", null, work.task_confidential ? "Confidential · selected people only" : "Shared with involved teams")), work.parent_display_id && React.createElement("p", null, "Parent task: ", React.createElement("button", {
    className: "btn btn--ghost",
    onClick: () => onOpen(work.parent_display_id)
  }, work.parent_display_id)), (work.task_reference_links || []).map(link => {
    try {
      if (!["http:", "https:"].includes(new URL(link).protocol)) return null;
    } catch {
      return null;
    }
    return React.createElement("p", {
      key: link
    }, React.createElement("a", {
      href: link,
      target: "_blank",
      rel: "noopener noreferrer"
    }, link));
  }))), !closed && React.createElement("div", {
    className: "card",
    style: {
      marginTop: 16
    }
  }, React.createElement("div", {
    className: "card__head"
  }, React.createElement("strong", null, "Actions")), React.createElement("div", {
    className: "card__body"
  }, React.createElement("div", {
    className: "form-grid"
  }, work.can_dispatch && React.createElement(React.Fragment, null, React.createElement("div", {
    className: "field"
  }, React.createElement("label", {
    htmlFor: "accept-task-assignee"
  }, "Responsible assignee"), React.createElement("select", {
    id: "accept-task-assignee",
    className: "select",
    value: values.assignee,
    onChange: e => setValues({
      ...values,
      assignee: e.target.value
    })
  }, React.createElement("option", {
    value: ""
  }, "Choose a member"), members.map(member => React.createElement("option", {
    key: member.userId,
    value: member.userId
  }, member.name)))), React.createElement("div", {
    className: "field"
  }, React.createElement("label", {
    htmlFor: "accept-task-deadline"
  }, "Committed deadline"), React.createElement("input", {
    id: "accept-task-deadline",
    className: "input",
    type: "date",
    min: getFlowMateTodayDateKey(),
    value: values.deadline,
    onChange: e => setValues({
      ...values,
      deadline: e.target.value
    })
  }))), (work.can_dispatch || work.can_execute || work.is_requester) && React.createElement("div", {
    className: "field field--full"
  }, React.createElement("label", {
    htmlFor: "task-action-reason"
  }, "Reason / Information needed"), React.createElement("textarea", {
    id: "task-action-reason",
    className: "textarea",
    value: values.reason,
    onChange: e => setValues({
      ...values,
      reason: e.target.value
    })
  })), (work.can_dispatch || work.is_requester && work.task_request_state !== "accepted") && !work.task_confidential && React.createElement("div", {
    className: "field"
  }, React.createElement("label", {
    htmlFor: "task-forward-team"
  }, "Forward to another team"), React.createElement("select", {
    id: "task-forward-team",
    className: "select",
    value: values.team,
    onChange: e => setValues({
      ...values,
      team: e.target.value
    })
  }, React.createElement("option", {
    value: ""
  }, "Choose a team"), window.TaskAssign.teams.filter(team => team.key !== work.owning_team_code).map(team => React.createElement("option", {
    key: team.key,
    value: team.key
  }, team.label))))), React.createElement("div", {
    className: "row",
    style: {
      flexWrap: "wrap",
      gap: 8,
      marginTop: 12
    }
  }, waiting && work.can_dispatch && [button("accept", "Accept & assign", true), button("need_information", "Request information"), button("reject", "Reject request")], work.task_request_state === "accepted" && work.can_dispatch && button("reassign", "Update assignee / commitment"), work.can_execute && work.status === "assigned" && button("start", "Start work", true), work.can_execute && work.status === "in_progress" && button("submit", "Submit for review", true), work.can_execute && ["assigned", "in_progress"].includes(work.status) && button("block", "Block"), work.can_execute && work.status === "blocked" && button("resume", "Resume"), work.is_requester && work.status === "review" && [button("approve", "Confirm delivery", true), button("request_changes", "Request changes")], work.is_requester && ["need_information", "rejected"].includes(work.task_request_state) && button("resubmit", "Resubmit request", true), (work.can_dispatch || work.is_requester && work.task_request_state !== "accepted") && !work.task_confidential && button("forward", "Forward request"), work.is_requester && button("cancel", "Cancel task")), !work.can_dispatch && waiting && React.createElement("p", {
    className: "muted"
  }, "Waiting for the receiving team dispatcher to accept and assign this request."))), closed && work.is_requester && React.createElement("div", {
    className: "card",
    style: {
      marginTop: 16
    }
  }, React.createElement("div", {
    className: "card__body"
  }, React.createElement("label", {
    htmlFor: "task-reopen-reason"
  }, "Reason for reopening"), React.createElement("textarea", {
    id: "task-reopen-reason",
    className: "textarea",
    value: values.reason,
    onChange: e => setValues({
      ...values,
      reason: e.target.value
    })
  }), button("reopen", "Reopen into team queue"))), React.createElement("div", {
    className: "card",
    style: {
      marginTop: 16
    }
  }, React.createElement("div", {
    className: "card__head"
  }, React.createElement("strong", null, "Comments")), React.createElement("div", {
    className: "card__body"
  }, comments.map(entry => React.createElement("div", {
    key: entry.id,
    style: {
      marginBottom: 12
    }
  }, React.createElement("p", {
    style: {
      whiteSpace: "pre-wrap"
    }
  }, entry.body), React.createElement("span", {
    className: "muted"
  }, new Date(entry.created_at).toLocaleString("en-SG", {
    timeZone: "Asia/Bangkok"
  })), entry.author_user_id === window.FLOWMATE_CURRENT_USER?.id && React.createElement("button", {
    className: "btn btn--xs btn--ghost",
    disabled: pending,
    onClick: () => mutate(() => window.TaskAssign.rpc("task_assign_comment", {
      p_display_id: work.display_id,
      p_body: null,
      p_comment_id: entry.id,
      p_delete: true
    }))
  }, "Delete my comment"))), React.createElement("label", {
    htmlFor: "task-comment"
  }, "Add comment"), React.createElement("textarea", {
    id: "task-comment",
    className: "textarea",
    value: comment,
    onChange: e => setComment(e.target.value)
  }), React.createElement("button", {
    className: "btn btn--secondary",
    disabled: pending || !comment.trim(),
    onClick: () => mutate(() => window.TaskAssign.rpc("task_assign_comment", {
      p_display_id: work.display_id,
      p_body: comment
    }))
  }, "Add comment"))), React.createElement("details", {
    className: "card",
    style: {
      marginTop: 16
    }
  }, React.createElement("summary", {
    className: "card__head"
  }, "Task history"), React.createElement("div", {
    className: "card__body"
  }, events.map(event => React.createElement("div", {
    key: event.id,
    style: {
      marginBottom: 8
    }
  }, React.createElement("strong", null, event.metadata?.action || event.metadata?.request_state || "Created"), " · ", new Date(event.created_at).toLocaleString("en-SG", {
    timeZone: "Asia/Bangkok"
  }), event.metadata?.reason && React.createElement("p", null, event.metadata.reason), event.metadata?.committed_deadline && React.createElement("span", null, "Committed: ", event.metadata.committed_deadline)))))));
}
