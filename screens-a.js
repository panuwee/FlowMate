/* AUTO-GENERATED from screens-a.jsx by build-github.cjs. Do not edit; edit the .jsx and re-run `npm run build:github`. */
const {
  useState,
  useEffect
} = React;
function MyWorkScreen({
  onOpen,
  onNav,
  searchQuery = ""
}) {
  const currentUser = window.FLOWMATE_CURRENT_USER || {};
  const myMember = (window.MEMBERS || []).find(m => m.id === currentUser.team_member_id) || (window.MEMBERS || []).find(m => m.name && currentUser.name && m.name.toLowerCase() === currentUser.name.toLowerCase());
  const meIds = [currentUser.team_member_id, currentUser.id, myMember && myMember.id].filter(Boolean);
  const [sourceRows, setSourceRows] = useState(WORK);
  const [loadState, setLoadState] = useState({
    status: "loading",
    message: "Loading Supabase data..."
  });
  const [filterStatus, setFilterStatus] = useState("all");
  const [showThisWeek, setShowThisWeek] = useState(false);
  async function loadMyWorkRows(isAlive = () => true) {
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
      window.dispatchEvent(new CustomEvent("flowmate:refresh-counts"));
    } catch (error) {
      if (!isAlive()) return;
      console.error("[FlowMate My Work] Supabase load failed:", error);
      setSourceRows([]);
      setLoadState({
        status: "error",
        message: `Live data unavailable: ${window.flowmateUserError(error, "Supabase query failed.")}`
      });
    }
  }
  useEffect(() => {
    let alive = true;
    loadMyWorkRows(() => alive);
    const cleanup = window.attachFlowMateLiveRefresh ? window.attachFlowMateLiveRefresh(() => loadMyWorkRows(() => alive)) : () => {};
    return () => {
      alive = false;
      cleanup();
    };
  }, []);
  async function handleQuickDone(work) {
    if (!work.isSupabaseRow) return;
    try {
      await window.completeFlowMateQuickTask(work.id);
      await loadMyWorkRows();
      window.dispatchEvent(new CustomEvent("flowmate:refresh-counts"));
      setLoadState({
        status: "live",
        message: `Completed ${work.id}`
      });
    } catch (error) {
      console.error("[FlowMate My Work] Complete quick task failed:", error);
      setLoadState({
        status: "error",
        message: `Could not complete ${work.id}: ${window.flowmateUserError(error, "RPC failed.")}`
      });
    }
  }
  async function handleChecklistAdd(work, title) {
    if (!work.isSupabaseRow) return;
    try {
      await window.addFlowMateQuickTaskChecklistItem(work.id, title);
      await loadMyWorkRows();
      setLoadState({
        status: "live",
        message: `Added checklist item to ${work.id}`
      });
    } catch (error) {
      console.error("[FlowMate My Work] Add checklist item failed:", error);
      setLoadState({
        status: "error",
        message: `Could not add checklist item: ${window.flowmateUserError(error, "RPC failed.")}`
      });
    }
  }
  async function handleChecklistToggle(item, isDone) {
    try {
      await window.toggleFlowMateQuickTaskChecklistItem(item.id, isDone);
      await loadMyWorkRows();
      setLoadState({
        status: "live",
        message: "Checklist updated"
      });
    } catch (error) {
      console.error("[FlowMate My Work] Toggle checklist item failed:", error);
      setLoadState({
        status: "error",
        message: `Could not update checklist: ${window.flowmateUserError(error, "RPC failed.")}`
      });
    }
  }
  async function handleCommentAdd(work, body) {
    if (!work.isSupabaseRow) return;
    try {
      await window.addFlowMateWorkItemComment(work.id, body);
      await loadMyWorkRows();
      setLoadState({
        status: "live",
        message: `Added comment to ${work.id}`
      });
    } catch (error) {
      console.error("[FlowMate My Work] Add comment failed:", error);
      setLoadState({
        status: "error",
        message: `Could not add comment: ${window.flowmateUserError(error, "RPC failed.")}`
      });
    }
  }
  async function handleCommentEdit(comment) {
    const nextBody = await window.flowmatePrompt({
      title: "Edit comment",
      label: "Comment",
      defaultValue: comment.body,
      multiline: true,
      required: true
    });
    if (nextBody == null) return;
    try {
      await window.updateFlowMateOwnComment(comment.id, nextBody);
      await loadMyWorkRows();
      setLoadState({
        status: "live",
        message: "Comment updated"
      });
    } catch (error) {
      console.error("[FlowMate My Work] Edit comment failed:", error);
      setLoadState({
        status: "error",
        message: `Could not edit comment: ${window.flowmateUserError(error, "RPC failed.")}`
      });
    }
  }
  async function handleCommentDelete(comment) {
    if (!window.confirm("Delete this comment?")) return;
    try {
      await window.deleteFlowMateOwnComment(comment.id);
      await loadMyWorkRows();
      setLoadState({
        status: "live",
        message: "Comment deleted"
      });
    } catch (error) {
      console.error("[FlowMate My Work] Delete comment failed:", error);
      setLoadState({
        status: "error",
        message: `Could not delete comment: ${window.flowmateUserError(error, "RPC failed.")}`
      });
    }
  }
  async function handleCreativeTransition(work, nextStatus) {
    if (!work.isSupabaseRow) return;
    const options = {};
    if (nextStatus === "review") {
      const deliveryLink = await window.flowmatePrompt({
        title: "Submit for review",
        label: "Delivery link",
        placeholder: "https://drive.google.com/…",
        required: true,
        validate: value => window.flowmateSafeHttpUrl(value) ? null : "Enter a valid http(s) link."
      });
      if (!deliveryLink) return;
      options.deliveryLink = deliveryLink;
    }
    if (nextStatus === "blocked") {
      const blockedReason = await window.flowmatePrompt({
        title: "Block work",
        label: "Blocked reason",
        multiline: true,
        required: true
      });
      if (!blockedReason) return;
      options.blockedReason = blockedReason;
    }
    try {
      await window.transitionFlowMateWorkStatus(work.id, nextStatus, options);
      await loadMyWorkRows();
      setLoadState({
        status: "live",
        message: `${work.id} moved to ${STATUS_LABEL[nextStatus] || nextStatus}`
      });
    } catch (error) {
      console.error("[FlowMate My Work] Creative status transition failed:", error);
      setLoadState({
        status: "error",
        message: `Could not update ${work.id}: ${window.flowmateUserError(error, "RPC failed.")}`
      });
    }
  }
  const rawMine = window.getFlowMateMyWorkRows ? window.getFlowMateMyWorkRows(sourceRows, currentUser, window.MEMBERS || [], searchQuery) : sourceRows.filter(w => meIds.includes(w.assignee) && !["delivered", "cancelled", "done"].includes(w.status) && window.matchesFlowMateSearch(w, searchQuery));
  const weekMine = showThisWeek ? rawMine.filter(w => w.dueDelta != null && w.dueDelta >= 0 && w.dueDelta <= 6) : rawMine;
  const mine = window.sortFlowMateMyWorkRows ? window.sortFlowMateMyWorkRows(window.filterFlowMateMyWorkByStatus(weekMine, filterStatus)) : weekMine;
  const overdue = window.sortFlowMateMyWorkRows(mine.filter(w => w.overdue || w.dueDelta != null && w.dueDelta < 0));
  const dueToday = window.sortFlowMateMyWorkRows(mine.filter(w => !w.overdue && w.dueDelta === 0 && ["assigned", "in_progress", "review"].includes(w.status)));
  const dueSoon = window.sortFlowMateMyWorkRows(mine.filter(w => !w.overdue && w.dueDelta != null && w.dueDelta > 0 && w.dueDelta <= 2 && ["assigned", "in_progress", "review"].includes(w.status)));
  const dueTodayIds = new Set(dueToday.map(w => w.id));
  const dueSoonIds = new Set(dueSoon.map(w => w.id));
  const inProgress = mine.filter(w => w.status === "in_progress" && !w.overdue && !dueTodayIds.has(w.id) && !dueSoonIds.has(w.id));
  const assigned = mine.filter(w => w.status === "assigned" && !w.overdue && !dueTodayIds.has(w.id) && !dueSoonIds.has(w.id));
  const review = mine.filter(w => w.status === "review" && !w.overdue && !dueTodayIds.has(w.id) && !dueSoonIds.has(w.id));
  const blocked = mine.filter(w => w.status === "blocked" && !w.overdue);
  const activeGroupIds = new Set([...overdue, ...dueToday, ...dueSoon, ...inProgress, ...assigned, ...review, ...blocked].map(w => w.id));
  const quick = mine.filter(w => w.type === "quick" && !activeGroupIds.has(w.id));
  function scrollToOverdue() {
    document.getElementById("my-work-overdue")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
  return React.createElement("div", {
    className: "page"
  }, overdue.length > 0 && React.createElement("div", {
    className: "overdue-banner"
  }, React.createElement(Icon, {
    name: "alert",
    size: 18
  }), React.createElement("span", null, React.createElement("strong", null, overdue.length, " overdue ", overdue.length === 1 ? "item" : "items"), " \xA0needs your attention before new work is assigned."), React.createElement("span", {
    className: "overdue-banner__spacer"
  }), React.createElement("button", {
    className: "btn btn--sm btn--danger",
    onClick: scrollToOverdue
  }, "View overdue")), React.createElement("div", {
    className: "page__header"
  }, React.createElement("div", null, React.createElement("h1", {
    className: "page__title"
  }, "My work"), React.createElement("div", {
    className: "page__sub"
  }, loadState.message), React.createElement("div", {
    className: "page__sub"
  }, currentUser.name ? `Hi ${currentUser.name} - ` : "", "Open work as of ", new Date().toLocaleString("en-SG", {
    timeZone: "Asia/Singapore",
    dateStyle: "medium",
    timeStyle: "short"
  }), " SGT.")), React.createElement("div", {
    className: "page__actions"
  }, React.createElement("button", {
    className: `btn btn--secondary ${showThisWeek ? "is-active" : ""}`,
    onClick: () => setShowThisWeek(current => !current),
    title: "Show work due in the next 7 days"
  }, React.createElement(Icon, {
    name: "calendar"
  }), " This week"), React.createElement("button", {
    className: "btn btn--primary",
    onClick: () => onNav("create")
  }, React.createElement(Icon, {
    name: "plus"
  }), " New"))), React.createElement("div", {
    className: "stat-strip"
  }, React.createElement("div", {
    className: "stat stat--accent"
  }, React.createElement("div", {
    className: "stat__num"
  }, overdue.length), React.createElement("div", {
    className: "stat__lbl"
  }, "Overdue")), React.createElement("div", {
    className: "stat stat--warn"
  }, React.createElement("div", {
    className: "stat__num"
  }, dueToday.length), React.createElement("div", {
    className: "stat__lbl"
  }, "Due today")), React.createElement("div", {
    className: "stat stat--info"
  }, React.createElement("div", {
    className: "stat__num"
  }, inProgress.length + dueSoon.filter(d => d.status === "in_progress").length + dueToday.filter(d => d.status === "in_progress").length), React.createElement("div", {
    className: "stat__lbl"
  }, "In progress")), React.createElement("div", {
    className: "stat"
  }, React.createElement("div", {
    className: "stat__num"
  }, review.length + dueSoon.filter(d => d.status === "review").length + dueToday.filter(d => d.status === "review").length), React.createElement("div", {
    className: "stat__lbl"
  }, "Review")), React.createElement("div", {
    className: "stat"
  }, React.createElement("div", {
    className: "stat__num"
  }, blocked.length), React.createElement("div", {
    className: "stat__lbl"
  }, "Blocked"))), React.createElement("div", {
    className: "filterbar"
  }, React.createElement("button", {
    className: `chip ${filterStatus === "all" ? "is-active" : ""}`,
    onClick: () => setFilterStatus("all")
  }, "All"), React.createElement("button", {
    className: `chip ${filterStatus === "due_today" ? "is-active" : ""}`,
    onClick: () => setFilterStatus("due_today")
  }, "Due today"), React.createElement("button", {
    className: `chip ${filterStatus === "overdue" ? "is-active" : ""}`,
    onClick: () => setFilterStatus("overdue")
  }, "Overdue"), React.createElement("select", {
    className: "select",
    value: filterStatus,
    onChange: e => setFilterStatus(e.target.value)
  }, React.createElement("option", {
    value: "all"
  }, "All statuses"), React.createElement("option", {
    value: "assigned"
  }, "Assigned"), React.createElement("option", {
    value: "in_progress"
  }, "In progress"), React.createElement("option", {
    value: "review"
  }, "Review"), React.createElement("option", {
    value: "blocked"
  }, "Blocked"), React.createElement("option", {
    value: "quick"
  }, "Quick tasks"), React.createElement("option", {
    value: "creative"
  }, "Creative requests"))), React.createElement(MyWorkGroup, {
    title: "Overdue",
    tone: "overdue",
    items: overdue,
    onOpen: onOpen,
    onQuickDone: handleQuickDone,
    onCreativeTransition: handleCreativeTransition
  }), React.createElement(MyWorkGroup, {
    title: "Due today",
    items: dueToday,
    onOpen: onOpen,
    onQuickDone: handleQuickDone,
    onCreativeTransition: handleCreativeTransition
  }), React.createElement(MyWorkGroup, {
    title: "Due soon",
    items: dueSoon,
    onOpen: onOpen,
    onQuickDone: handleQuickDone,
    onCreativeTransition: handleCreativeTransition
  }), React.createElement(MyWorkGroup, {
    title: "In progress",
    items: inProgress,
    onOpen: onOpen,
    onQuickDone: handleQuickDone,
    onCreativeTransition: handleCreativeTransition
  }), React.createElement(MyWorkGroup, {
    title: "Assigned",
    items: assigned,
    onOpen: onOpen,
    onQuickDone: handleQuickDone,
    onCreativeTransition: handleCreativeTransition
  }), React.createElement(MyWorkGroup, {
    title: "In review by requester",
    items: review,
    onOpen: onOpen,
    onQuickDone: handleQuickDone,
    onCreativeTransition: handleCreativeTransition
  }), React.createElement(MyWorkGroup, {
    title: "Quick tasks",
    items: quick,
    onOpen: onOpen,
    onQuickDone: handleQuickDone,
    onChecklistAdd: handleChecklistAdd,
    onChecklistToggle: handleChecklistToggle,
    onCommentAdd: handleCommentAdd,
    onCommentEdit: handleCommentEdit,
    onCommentDelete: handleCommentDelete,
    compact: true
  }));
}
function MyWorkGroup({
  title,
  items,
  onOpen,
  onQuickDone,
  onCreativeTransition,
  onChecklistAdd,
  onChecklistToggle,
  onCommentAdd,
  onCommentEdit,
  onCommentDelete,
  tone,
  compact
}) {
  if (!items.length) return null;
  return React.createElement("div", {
    className: "section",
    id: tone === "overdue" ? "my-work-overdue" : undefined
  }, React.createElement("div", {
    className: `section__head${tone === "overdue" ? " section__head--overdue" : ""}`
  }, React.createElement("span", {
    className: "section__title"
  }, title), React.createElement("span", {
    className: "section__count"
  }, items.length)), React.createElement("table", {
    className: "tbl"
  }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", {
    className: "col-id"
  }, "ID"), React.createElement("th", null, "Title"), React.createElement("th", null, "Type"), React.createElement("th", null, "Status"), React.createElement("th", null, "Priority"), React.createElement("th", null, "Effort"), React.createElement("th", null, "Checklist"), React.createElement("th", null, "Due"), React.createElement("th", {
    className: "col-right"
  }, "Action"))), React.createElement("tbody", null, items.map(w => React.createElement("tr", {
    key: w.id,
    className: w.overdue ? "is-overdue" : "",
    onClick: () => {
      window.flowmateSelectedWorkItem = w;
      onOpen(w.id);
    }
  }, React.createElement("td", {
    className: "col-id mono"
  }, w.id), React.createElement("td", {
    className: "col-title"
  }, w.title), React.createElement("td", null, React.createElement(TypePill, {
    type: w.type
  })), React.createElement("td", null, React.createElement(StatusBadge, {
    status: w.status
  })), React.createElement("td", null, React.createElement(PriorityBadge, {
    level: w.priority
  })), React.createElement("td", null, React.createElement(Effort, {
    value: w.effort
  })), React.createElement("td", null, React.createElement(Progress, w.checklist || {
    done: 0,
    total: 0
  })), React.createElement("td", null, React.createElement(DueBadge, {
    delta: w.dueDelta,
    label: w.dueLabel,
    status: w.status
  })), React.createElement("td", {
    className: "col-right",
    onClick: e => e.stopPropagation()
  }, React.createElement("div", {
    className: "my-work-actions"
  }, w.type === "quick" && w.status !== "delivered" && React.createElement("button", {
    className: "btn btn--xs btn--secondary",
    onClick: () => onQuickDone && onQuickDone(w)
  }, "Mark done"), w.type !== "quick" && w.status === "assigned" && React.createElement("button", {
    className: "btn btn--xs btn--secondary",
    onClick: () => onCreativeTransition && onCreativeTransition(w, "in_progress")
  }, React.createElement(Icon, {
    name: "play",
    size: 11
  }), " Start"), w.type !== "quick" && w.status === "in_progress" && React.createElement("button", {
    className: "btn btn--xs btn--primary",
    onClick: () => onCreativeTransition && onCreativeTransition(w, "review")
  }, React.createElement(Icon, {
    name: "send",
    size: 11
  }), " Submit review"), w.type !== "quick" && w.status === "review" && React.createElement("button", {
    className: "btn btn--xs btn--ghost",
    disabled: true
  }, "Awaiting requester"), w.type !== "quick" && ["assigned", "in_progress", "review"].includes(w.status) && React.createElement("button", {
    className: "btn btn--xs btn--danger",
    onClick: () => onCreativeTransition && onCreativeTransition(w, "blocked")
  }, React.createElement(Icon, {
    name: "block",
    size: 11
  }), " Block"), w.type !== "quick" && w.status === "blocked" && React.createElement("button", {
    className: "btn btn--xs btn--secondary",
    onClick: () => onCreativeTransition && onCreativeTransition(w, "in_progress")
  }, React.createElement(Icon, {
    name: "play",
    size: 11
  }), " Resume"))))))), compact && items.some(w => w.isSupabaseRow) && React.createElement("div", {
    className: "checklist",
    style: {
      borderTop: "1px solid var(--garena-light-grey)"
    }
  }, items.map(w => React.createElement(QuickTaskChecklist, {
    key: `${w.id}-checklist`,
    work: w,
    onAdd: onChecklistAdd,
    onToggle: onChecklistToggle,
    onCommentAdd: onCommentAdd,
    onCommentEdit: onCommentEdit,
    onCommentDelete: onCommentDelete
  }))));
}
function QuickTaskChecklist({
  work,
  onAdd,
  onToggle,
  onCommentAdd,
  onCommentEdit,
  onCommentDelete
}) {
  const [title, setTitle] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const items = work.checklistItems || [];
  const comments = work.comments || [];
  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    await onAdd(work, title);
    setTitle("");
  }
  async function submitComment(e) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    await onCommentAdd(work, commentBody);
    setCommentBody("");
  }
  return React.createElement("div", {
    style: {
      padding: "12px 16px",
      display: "grid",
      gap: 8
    }
  }, React.createElement("div", {
    className: "row",
    style: {
      gap: 8
    }
  }, React.createElement("span", {
    className: "mono muted",
    style: {
      width: 76
    }
  }, work.id), React.createElement("span", {
    className: "strong"
  }, work.title)), items.length === 0 ? React.createElement("div", {
    className: "muted",
    style: {
      fontSize: 12
    }
  }, "No checklist items.") : React.createElement("div", {
    className: "checklist"
  }, items.map(item => React.createElement("label", {
    key: item.id,
    className: "row",
    style: {
      gap: 8,
      fontSize: 12
    }
  }, React.createElement("input", {
    type: "checkbox",
    checked: item.is_done,
    onChange: e => onToggle(item, e.target.checked)
  }), React.createElement("span", {
    className: item.is_done ? "muted" : ""
  }, item.title)))), React.createElement("form", {
    className: "row",
    style: {
      gap: 8
    },
    onSubmit: submit
  }, React.createElement("input", {
    className: "input",
    value: title,
    onChange: e => setTitle(e.target.value),
    placeholder: "Add checklist item",
    style: {
      height: 30,
      maxWidth: 320
    }
  }), React.createElement("button", {
    className: "btn btn--xs btn--secondary",
    type: "submit"
  }, "Add")), React.createElement("div", {
    style: {
      display: "grid",
      gap: 8,
      marginTop: 4
    }
  }, React.createElement("div", {
    className: "muted",
    style: {
      fontSize: 11,
      fontWeight: 700,
      textTransform: "uppercase"
    }
  }, "Comments (", comments.length, ")"), comments.length === 0 ? React.createElement("div", {
    className: "muted",
    style: {
      fontSize: 12
    }
  }, "No comments.") : comments.map(comment => React.createElement("div", {
    key: comment.id,
    className: "reason-box",
    style: {
      padding: "8px 10px"
    }
  }, React.createElement("div", {
    className: "row",
    style: {
      gap: 8,
      marginBottom: 4
    }
  }, React.createElement("strong", {
    style: {
      fontSize: 12
    }
  }, comment.authorName), React.createElement("span", {
    className: "mono muted",
    style: {
      fontSize: 11
    }
  }, new Date(comment.created_at).toLocaleString()), React.createElement("span", {
    className: "spacer"
  }), comment.author_user_id === window.FLOWMATE_CURRENT_USER?.id && React.createElement(React.Fragment, null, React.createElement("button", {
    className: "btn btn--xs btn--ghost",
    type: "button",
    onClick: () => onCommentEdit(comment)
  }, "Edit"), React.createElement("button", {
    className: "btn btn--xs btn--ghost",
    type: "button",
    onClick: () => onCommentDelete(comment)
  }, "Delete"))), React.createElement("div", {
    style: {
      fontSize: 12
    }
  }, comment.body))), React.createElement("form", {
    className: "row",
    style: {
      gap: 8
    },
    onSubmit: submitComment
  }, React.createElement("input", {
    className: "input",
    value: commentBody,
    onChange: e => setCommentBody(e.target.value),
    placeholder: "Add comment",
    style: {
      height: 30,
      maxWidth: 420
    }
  }), React.createElement("button", {
    className: "btn btn--xs btn--secondary",
    type: "submit"
  }, "Comment"))));
}
const FLOWMATE_ASSIGNEE_FALLBACK = [{
  userId: "00000000-0000-0000-0000-000000001001",
  name: "Gear"
}, {
  userId: "00000000-0000-0000-0000-000000001002",
  name: "Panu"
}, {
  userId: "00000000-0000-0000-0000-000000001003",
  name: "Big"
}, {
  userId: "00000000-0000-0000-0000-000000001004",
  name: "Mark"
}, {
  userId: "00000000-0000-0000-0000-000000001005",
  name: "Po"
}, {
  userId: "00000000-0000-0000-0000-000000001006",
  name: "Aof"
}, {
  userId: "00000000-0000-0000-0000-000000001007",
  name: "Folk"
}, {
  userId: "00000000-0000-0000-0000-000000001008",
  name: "Mac"
}, {
  userId: "00000000-0000-0000-0000-000000001009",
  name: "No"
}, {
  userId: "00000000-0000-0000-0000-000000001010",
  name: "May"
}, {
  userId: "00000000-0000-0000-0000-000000001011",
  name: "Boss"
}, {
  userId: "00000000-0000-0000-0000-000000001012",
  name: "Mag"
}, {
  userId: "00000000-0000-0000-0000-000000001013",
  name: "Real"
}, {
  userId: "00000000-0000-0000-0000-000000001014",
  name: "Pointer"
}, {
  userId: "00000000-0000-0000-0000-000000001015",
  name: "Pond"
}, {
  userId: "00000000-0000-0000-0000-000000001016",
  name: "Joe"
}, {
  userId: "00000000-0000-0000-0000-000000001017",
  name: "Tong"
}, {
  userId: "00000000-0000-0000-0000-000000001018",
  name: "Eye"
}, {
  userId: "00000000-0000-0000-0000-000000001019",
  name: "Vee"
}, {
  userId: "00000000-0000-0000-0000-000000001024",
  name: "Ploy"
}, {
  userId: "00000000-0000-0000-0000-000000001020",
  name: "Pluem"
}, {
  userId: "00000000-0000-0000-0000-000000001021",
  name: "Net"
}, {
  userId: "00000000-0000-0000-0000-000000001022",
  name: "Ben"
}, {
  userId: "00000000-0000-0000-0000-000000001023",
  name: "Peak"
}];
const FLOWMATE_CREATE_DRAFT_KEYS = {
  quick: "flowmate:create:quickDraft:v1",
  creative: "flowmate:create:creativeDraft:v1"
};
const FLOWMATE_CREATIVE_TYPE_OPTIONS = [{
  key: "banner",
  label: "Banner",
  assetType: "static-graphic"
}, {
  key: "hero-album",
  label: "Hero Album (Banner x8)",
  assetType: "static-graphic"
}, {
  key: "logo",
  label: "Logo",
  assetType: "static-graphic"
}, {
  key: "web-reskin",
  label: "Web Reskin",
  assetType: "static-graphic"
}, {
  key: "new-web",
  label: "New Web",
  assetType: "static-graphic"
}, {
  key: "cdn-design",
  label: "CDN Design",
  assetType: "static-graphic"
}, {
  key: "resize",
  label: "Resize",
  assetType: "static-graphic"
}, {
  key: "graphic-pack",
  label: "Graphic Pack",
  assetType: "static-graphic"
}, {
  key: "kv-design",
  label: "KV Design",
  assetType: "static-graphic"
}, {
  key: "jersey-design",
  label: "Jersey Design",
  assetType: "static-graphic"
}, {
  key: "jersey-in-game",
  label: "Jersey In-game",
  assetType: "static-graphic"
}, {
  key: "merchandise-design",
  label: "Merchandise Design",
  assetType: "static-graphic"
}, {
  key: "video-standard",
  label: "Video Standard",
  assetType: "general-video"
}, {
  key: "video-under-1-min",
  label: "Video Under 1 Min",
  assetType: "general-video"
}, {
  key: "motion",
  label: "Motion",
  assetType: "motion"
}];
const FLOWMATE_CREATIVE_CHANNEL_OPTIONS = [{
  key: "facebook",
  label: "Facebook"
}, {
  key: "tiktok",
  label: "TikTok"
}, {
  key: "instagram",
  label: "Instagram"
}, {
  key: "in_game",
  label: "In-game"
}, {
  key: "youtube",
  label: "YouTube"
}, {
  key: "other",
  label: "Other"
}];
function getFlowMateCreativeTypeOption(typeKey) {
  return FLOWMATE_CREATIVE_TYPE_OPTIONS.find(option => option.key === typeKey) || FLOWMATE_CREATIVE_TYPE_OPTIONS[0];
}
function getFlowMateCreativeTypeLabel(typeKey) {
  const option = FLOWMATE_CREATIVE_TYPE_OPTIONS.find(item => item.key === typeKey);
  return option ? option.label : typeKey;
}
function normalizeFlowMateCreativeChannels(value) {
  const rawValues = Array.isArray(value) ? value : String(value || "").split(",").map(item => item.trim()).filter(Boolean);
  const normalizedLabels = rawValues.map(item => {
    const match = FLOWMATE_CREATIVE_CHANNEL_OPTIONS.find(option => option.key.toLowerCase() === String(item).toLowerCase() || option.label.toLowerCase() === String(item).toLowerCase());
    return match ? match.label : String(item).trim();
  }).filter(Boolean);
  return Array.from(new Set(normalizedLabels));
}
function formatFlowMateCreativeChannels(value) {
  return normalizeFlowMateCreativeChannels(value).join(", ");
}
const FLOWMATE_NORMAL_CREATIVE_CAPACITY_PER_DAY = 8;
const FLOWMATE_CREATIVE_UNIT_EFFORT = {
  banner: 2,
  "hero-album": 16,
  logo: 2,
  "web-reskin": 24,
  "new-web": 24,
  "cdn-design": 1,
  resize: 0.25,
  "graphic-pack": 0.5,
  "kv-design": 3,
  "jersey-design": 2,
  "jersey-in-game": 1,
  "merchandise-design": 1,
  "video-standard": 4,
  "video-under-1-min": 2,
  motion: 2
};
function subtractFlowMateWorkingDays(dateValue, workingDays) {
  if (!dateValue) return "";
  const parts = String(dateValue).split("-").map(part => Number(part));
  if (parts.length !== 3 || parts.some(part => !Number.isFinite(part))) return "";
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (Number.isNaN(date.getTime())) return "";
  let remaining = workingDays;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() - 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return date.toISOString().slice(0, 10);
}
function addFlowMateCalendarDays(dateValue, days) {
  const parts = String(dateValue || "").slice(0, 10).split("-").map(part => Number(part));
  if (parts.length !== 3 || parts.some(part => !Number.isFinite(part))) return "";
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function getFlowMateTodayDateKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function clampFlowMateDateToToday(dateValue) {
  const todayDate = getFlowMateTodayDateKey();
  const value = String(dateValue || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return todayDate;
  return value < todayDate ? todayDate : value;
}
function getFlowMateDraftDateForLaunchDate(launchDate) {
  const nextLaunchDate = clampFlowMateDateToToday(launchDate);
  const draftDate = subtractFlowMateWorkingDays(nextLaunchDate, 5);
  return clampFlowMateDateToToday(draftDate);
}
function countFlowMateWorkingDaysInclusive(startDate, endDate) {
  const startValue = clampFlowMateDateToToday(startDate);
  const endValue = String(endDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endValue) || endValue < startValue) return 0;
  const startParts = startValue.split("-").map(part => Number(part));
  const endParts = endValue.split("-").map(part => Number(part));
  const cursor = new Date(Date.UTC(startParts[0], startParts[1] - 1, startParts[2]));
  const end = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2]));
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return 0;
  let workingDays = 0;
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day >= 1 && day <= 5) workingDays += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return workingDays;
}
function getFlowMateCreativeEffortEstimate(draft) {
  const typeKey = getFlowMateCreativeTypeOption(draft?.assetSubtype).key;
  const unitEffort = FLOWMATE_CREATIVE_UNIT_EFFORT[typeKey] || 4;
  const assetCount = Math.max(1, Number(draft?.assetCount || 1));
  return Math.max(1, Math.ceil(unitEffort * assetCount));
}
function getFlowMateCreativeTimePressure(draft) {
  const launchDate = clampFlowMateDateToToday(draft?.launchDate);
  const lastWorkDate = addFlowMateCalendarDays(launchDate, -1);
  const workingDays = countFlowMateWorkingDaysInclusive(getFlowMateTodayDateKey(), lastWorkDate);
  const normalCapacity = workingDays * FLOWMATE_NORMAL_CREATIVE_CAPACITY_PER_DAY;
  const effort = getFlowMateCreativeEffortEstimate(draft);
  const assetCount = Math.max(1, Number(draft?.assetCount || 1));
  const skillLabel = getFlowMateCreativeTypeLabel(draft?.assetSubtype);
  return {
    effort,
    workingDays,
    normalCapacity,
    assetCount,
    skillLabel,
    launchDate,
    isInsufficient: effort > normalCapacity
  };
}
function getFlowMateAutoUrgentReason(timePressure) {
  return `Auto urgent: ${timePressure.skillLabel} x${timePressure.assetCount} requires ${timePressure.effort} pt but only ${timePressure.workingDays} working day(s) / ${timePressure.normalCapacity} pt remain before launch.`;
}
function normalizeFlowMateQuickDraft(draft) {
  const nextDraft = {
    ...getDefaultQuickDraft(),
    ...(draft || {})
  };
  return {
    ...nextDraft,
    dueDate: clampFlowMateDateToToday(nextDraft.dueDate),
    launchDate: clampFlowMateDateToToday(nextDraft.launchDate)
  };
}
function normalizeFlowMateCreativeDraft(draft) {
  const nextDraft = {
    ...getDefaultCreativeDraft(),
    ...(draft || {})
  };
  const creativeType = getFlowMateCreativeTypeOption(nextDraft.assetSubtype);
  const launchDate = clampFlowMateDateToToday(nextDraft.launchDate);
  const publishDate = clampFlowMateDateToToday(nextDraft.publishDate || launchDate);
  const assetCountNumber = Number(nextDraft.assetCount);
  const assetCount = Number.isInteger(assetCountNumber) && assetCountNumber >= 1 ? String(assetCountNumber) : "1";
  return {
    ...nextDraft,
    requesterTeam: getDefaultRequesterTeam(),
    assetType: creativeType.assetType,
    assetSubtype: creativeType.key,
    assetCount,
    launchDate,
    publishDate,
    dueDate: getFlowMateDraftDateForLaunchDate(launchDate)
  };
}
const FLOWMATE_CREATE_DRAFT_FIELDS = {
  quick: ["title", "note", "requesterTeam", "projectName", "assigneeUserId", "assigneeOtherName", "dueDate", "launchDate", "priority"],
  creative: ["title", "requesterTeam", "campaignName", "productEvent", "assetType", "assetSubtype", "assetCount", "platforms", "sizeFormat", "briefLink", "briefNote", "referenceLink", "priority", "urgentReason", "dueDate", "launchDate", "publishDate"]
};
function getDefaultQuickDraft() {
  const requesterTeam = getDefaultRequesterTeam();
  const todayDate = getFlowMateTodayDateKey();
  return {
    title: "",
    note: "",
    requesterTeam,
    projectName: "",
    assigneeUserId: getDefaultQuickAssignee().userId,
    assigneeOtherName: "",
    dueDate: todayDate,
    launchDate: todayDate,
    priority: "normal"
  };
}
function getDefaultCreativeDraft() {
  const requesterTeam = getDefaultRequesterTeam();
  const todayDate = getFlowMateTodayDateKey();
  return {
    title: "",
    requesterTeam,
    campaignName: "",
    productEvent: "",
    assetType: "static-graphic",
    assetSubtype: FLOWMATE_CREATIVE_TYPE_OPTIONS[0].key,
    assetCount: "1",
    platforms: "Instagram",
    sizeFormat: "1080x1080",
    briefLink: "",
    briefNote: "",
    referenceLink: "",
    priority: "normal",
    urgentReason: "",
    dueDate: getFlowMateDraftDateForLaunchDate(todayDate),
    launchDate: todayDate,
    publishDate: todayDate
  };
}
function getDefaultRequesterTeam() {
  return window.normalizeFlowMateRequesterTeam?.(window.FLOWMATE_CURRENT_USER?.requester_team) || TEAMS[0];
}
function getFlowMateCreateDraftPayload(kind, draft, fallback = {}) {
  const fields = FLOWMATE_CREATE_DRAFT_FIELDS[kind] || [];
  return fields.reduce((payload, field) => {
    const value = Object.prototype.hasOwnProperty.call(draft || {}, field) ? draft[field] : fallback[field];
    payload[field] = typeof value === "string" ? value : "";
    return payload;
  }, {});
}
function getFlowMateCreateValidationErrors(mode, draft) {
  const errors = {};
  const row = draft || {};
  function requireField(field, message) {
    if (!String(row[field] || "").trim()) {
      errors[field] = message;
    }
  }
  function requireNotPast(field, message) {
    const value = String(row[field] || "").slice(0, 10);
    if (value && value < getFlowMateTodayDateKey()) {
      errors[field] = message;
    }
  }
  function requirePositiveInteger(field, message) {
    const value = Number(row[field]);
    if (!Number.isInteger(value) || value < 1) {
      errors[field] = message;
    }
  }
  if (mode === "quick") {
    requireField("requesterTeam", "Requester team is required.");
    requireField("projectName", "Project / campaign is required.");
    requireField("dueDate", "1st Review / Draft is required.");
    requireField("launchDate", "Launch date is required.");
    requireNotPast("dueDate", "1st Review / Draft cannot be before today.");
    requireNotPast("launchDate", "Launch date cannot be before today.");
    return errors;
  }
  requireField("campaignName", "Campaign is required.");
  requireField("productEvent", "Product / Event is required.");
  requireField("assetSubtype", "Type / Skill is required.");
  requirePositiveInteger("assetCount", "Asset Count must be at least 1.");
  requireField("platforms", "Channel Tag is required.");
  requireField("sizeFormat", "Size / format is required.");
  requireField("briefLink", "Brief link is required.");
  requireField("priority", "Priority is required.");
  requireField("dueDate", "1st Draft is required.");
  requireField("launchDate", "Launch date is required.");
  requireField("publishDate", "Publish Date is required.");
  requireNotPast("launchDate", "Launch date cannot be before today.");
  requireNotPast("publishDate", "Publish Date cannot be before today.");
  if (row.priority === "urgent") {
    requireField("urgentReason", "Urgent reason is required.");
  }
  return errors;
}
function readFlowMateCreateDraft(kind, fallback) {
  if (!window.localStorage) return fallback;
  try {
    const raw = window.localStorage.getItem(FLOWMATE_CREATE_DRAFT_KEYS[kind]);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
    return getFlowMateCreateDraftPayload(kind, parsed, fallback);
  } catch (error) {
    console.warn("[FlowMate Create] draft restore failed:", error);
    return fallback;
  }
}
function saveFlowMateCreateDraft(kind, draft) {
  if (!window.localStorage) return;
  try {
    window.localStorage.setItem(FLOWMATE_CREATE_DRAFT_KEYS[kind], JSON.stringify(getFlowMateCreateDraftPayload(kind, draft)));
  } catch (error) {
    console.warn("[FlowMate Create] draft save failed:", error);
  }
}
function clearFlowMateCreateDraft(kind) {
  if (!window.localStorage) return;
  try {
    window.localStorage.removeItem(FLOWMATE_CREATE_DRAFT_KEYS[kind]);
  } catch (error) {
    console.warn("[FlowMate Create] draft clear failed:", error);
  }
}
function getDefaultQuickAssignee(options = FLOWMATE_ASSIGNEE_FALLBACK) {
  const currentUserId = window.FLOWMATE_CURRENT_USER && window.FLOWMATE_CURRENT_USER.id;
  return options.find(option => option.userId === currentUserId) || options.find(option => option.name === "Pond") || options[0];
}
function CreateScreen({
  onNav,
  onOpen,
  initialMode = "creative"
}) {
  const [mode, setMode] = useState(() => initialMode === "quick" ? "quick" : "creative");
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [createAlert, setCreateAlert] = useState("");
  const [assigneeOptions, setAssigneeOptions] = useState(FLOWMATE_ASSIGNEE_FALLBACK);
  const [requesterTeamOptions, setRequesterTeamOptions] = useState(TEAMS);
  const [quickDraft, setQuickDraft] = useState(() => {
    const draft = normalizeFlowMateQuickDraft(readFlowMateCreateDraft("quick", getDefaultQuickDraft()));
    return {
      ...draft,
      title: window.buildFlowMateTemplateTitle({
        launchDate: draft.launchDate,
        requesterTeam: draft.requesterTeam,
        projectName: draft.projectName
      })
    };
  });
  const [creativeDraft, setCreativeDraft] = useState(() => {
    const draft = normalizeFlowMateCreativeDraft(readFlowMateCreateDraft("creative", getDefaultCreativeDraft()));
    return {
      ...draft,
      title: window.buildFlowMateTemplateTitle({
        launchDate: draft.launchDate,
        requesterTeam: draft.requesterTeam,
        projectName: draft.campaignName,
        productEvent: draft.productEvent
      })
    };
  });
  useEffect(() => {
    let alive = true;
    if (!window.loadFlowMateAssignees) return () => {};
    window.loadFlowMateAssignees().then(options => {
      if (!alive || !options.length) return;
      setAssigneeOptions(options);
      setQuickDraft(draft => {
        if (options.some(option => option.userId === draft.assigneeUserId)) return draft;
        const nextQuickDraft = {
          ...draft,
          assigneeUserId: getDefaultQuickAssignee(options).userId,
          assigneeOtherName: ""
        };
        saveFlowMateCreateDraft("quick", nextQuickDraft);
        return nextQuickDraft;
      });
    }).catch(error => {
      console.warn("[FlowMate Create] assignee load failed:", error);
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (initialMode === "quick" || initialMode === "creative") {
      switchCreateMode(initialMode);
    }
  }, [initialMode]);
  useEffect(() => {
    let alive = true;
    if (!window.loadFlowMateRequesterTeams) return () => {};
    window.loadFlowMateRequesterTeams().then(options => {
      if (!alive || !options.length) return;
      setRequesterTeamOptions(options);
    }).catch(error => {
      console.warn("[FlowMate Create] requester team load failed:", error);
    });
    return () => {
      alive = false;
    };
  }, []);
  async function openCreatedDetail(created, id) {
    const detailId = id || window.getFlowMateCreatedDisplayId(created);
    if (!detailId) {
      throw new Error("Create succeeded, but the response did not include a work item ID.");
    }
    if (!window.loadFlowMateListRows) {
      throw new Error(`Create succeeded for ${detailId}, but the detail loader is not ready.`);
    }
    if (typeof onOpen !== "function") {
      throw new Error(`Create succeeded for ${detailId}, but detail navigation is not ready.`);
    }
    const rows = await window.loadFlowMateListRows();
    const createdRow = window.findFlowMateWorkItemById(rows, detailId);
    if (!createdRow) {
      throw new Error(`Create succeeded for ${detailId}, but the detail row could not be loaded.`);
    }
    window.flowmateSelectedWorkItem = createdRow;
    onOpen(detailId);
  }
  async function handleSubmit() {
    if (isSubmitting) return;
    const activeDraft = mode === "quick" ? quickDraft : creativeDraft;
    let submissionDraft = activeDraft;
    const nextValidationErrors = getFlowMateCreateValidationErrors(mode, activeDraft);
    if (Object.keys(nextValidationErrors).length > 0) {
      setValidationErrors(nextValidationErrors);
      setCreateAlert("Please complete the highlighted required fields.");
      return;
    }
    const timePressure = mode === "creative" ? getFlowMateCreativeTimePressure(submissionDraft) : null;
    if (timePressure && timePressure.isInsufficient && submissionDraft.priority !== "urgent") {
      const autoUrgentReason = getFlowMateAutoUrgentReason(timePressure);
      const confirmed = window.flowmatePrompt ? await window.flowmatePrompt({
        title: "เวลาไม่เพียงพอ",
        hideInput: true,
        note: `This request needs ${timePressure.effort} pt, but only ${timePressure.normalCapacity} pt (${timePressure.workingDays} working day(s)) remain before Launch Date. Priority will be set to Urgent.`,
        confirmText: "Set Urgent and submit"
      }) : "";
      if (confirmed === null) {
        setCreateAlert("Submit cancelled. Please adjust Launch date, Asset Count, or Priority.");
        return;
      }
      const urgentDraft = {
        ...submissionDraft,
        priority: "urgent",
        urgentReason: submissionDraft.urgentReason || autoUrgentReason
      };
      submissionDraft = urgentDraft;
      setCreativeDraft(urgentDraft);
      saveFlowMateCreateDraft("creative", urgentDraft);
    }
    setValidationErrors({});
    setCreateAlert("");
    setIsSubmitting(true);
    let shouldShowResult = true;
    try {
      let created;
      let nextResult;
      if (mode === "quick") {
        created = await window.createFlowMateQuickTask(submissionDraft);
        nextResult = {
          kind: "quick_created",
          id: window.getFlowMateCreatedDisplayId(created)
        };
      } else {
        created = await window.createFlowMateCreativeRequest(submissionDraft);
        const assignment = created.assignment || {};
        const result = assignment.result || "queued";
        nextResult = {
          kind: result === "assigned" ? "assigned" : result === "need_brief" ? "need_brief" : "queued",
          id: window.getFlowMateCreatedDisplayId(created),
          owner: assignment.owner_code ? `m-${assignment.owner_code}` : null,
          effort: assignment.effort || null,
          reason: assignment.reason || ""
        };
      }
      clearFlowMateCreateDraft(mode);
      try {
        await openCreatedDetail(created, nextResult.id);
        shouldShowResult = false;
      } catch (openError) {
        console.error("[FlowMate Create] open created detail failed:", openError);
        setResult({
          kind: "open_failed",
          id: nextResult.id || "Saved",
          message: openError.message || "Saved, but could not open the detail view."
        });
      }
    } catch (error) {
      console.error("[FlowMate Create] submit failed:", error);
      setResult({
        kind: "error",
        id: "Not saved",
        message: window.flowmateUserError(error, "Submit failed.")
      });
    } finally {
      if (shouldShowResult) {
        setIsSubmitting(false);
        setSubmitted(true);
      }
    }
  }
  if (submitted) return React.createElement(CreateResultScreen, {
    result: result,
    onAgain: () => {
      setSubmitted(false);
      setResult(null);
    },
    onNav: onNav
  });
  function updateCreativeDraft(nextDraft) {
    setValidationErrors({});
    setCreateAlert("");
    const normalizedDraft = normalizeFlowMateCreativeDraft(nextDraft);
    const title = window.buildFlowMateTemplateTitle({
      launchDate: normalizedDraft.launchDate,
      requesterTeam: normalizedDraft.requesterTeam,
      projectName: normalizedDraft.campaignName,
      productEvent: normalizedDraft.productEvent
    });
    const nextCreativeDraft = {
      ...normalizedDraft,
      title
    };
    setCreativeDraft(nextCreativeDraft);
    saveFlowMateCreateDraft("creative", nextCreativeDraft);
  }
  function updateQuickDraft(nextDraft) {
    setValidationErrors({});
    setCreateAlert("");
    const title = window.buildFlowMateTemplateTitle({
      launchDate: nextDraft.launchDate,
      requesterTeam: nextDraft.requesterTeam,
      projectName: nextDraft.projectName
    });
    const nextQuickDraft = {
      ...nextDraft,
      title
    };
    setQuickDraft(nextQuickDraft);
    saveFlowMateCreateDraft("quick", nextQuickDraft);
  }
  function switchCreateMode(nextMode) {
    setMode(nextMode);
    setValidationErrors({});
    setCreateAlert("");
  }
  return React.createElement("div", {
    className: "page",
    style: {
      maxWidth: 1100
    }
  }, React.createElement("div", {
    className: "page__header"
  }, React.createElement("div", null, React.createElement("h1", {
    className: "page__title"
  }, "Create"), React.createElement("div", {
    className: "page__sub"
  }, "Pick the right entry point - Quick task is notebook-style, Creative request enters the assignment engine."))), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 16,
      marginBottom: 24
    }
  }, React.createElement("button", {
    className: `choice-card ${mode === "quick" ? "is-active" : ""}`,
    onClick: () => switchCreateMode("quick")
  }, React.createElement("div", {
    className: "choice-card__title"
  }, React.createElement(Icon, {
    name: "zap"
  }), " Quick task"), React.createElement("div", {
    className: "choice-card__sub"
  }, "Small internal task, follow-up, or reminder. Stays in your team's quick-task list."), React.createElement("ul", {
    className: "choice-card__list"
  }, React.createElement("li", null, "No effort calculation, no auto-assignment"), React.createElement("li", null, "Self-assign or pick a teammate"), React.createElement("li", null, "Counted separately from creative capacity"))), React.createElement("button", {
    className: `choice-card ${mode === "creative" ? "is-active" : ""}`,
    onClick: () => switchCreateMode("creative")
  }, React.createElement("div", {
    className: "choice-card__title"
  }, React.createElement(Icon, {
    name: "layers"
  }), " Creative request"), React.createElement("div", {
    className: "choice-card__sub"
  }, "Structured request for production creative - banner, video, motion, esport pack."), React.createElement("ul", {
    className: "choice-card__list"
  }, React.createElement("li", null, "Brief validation, auto effort point, auto routing"), React.createElement("li", null, "Owner is decided by the engine - no preferred owner")))), React.createElement("div", {
    className: "card"
  }, React.createElement("div", {
    className: "card__head"
  }, React.createElement("span", {
    className: "card__title"
  }, mode === "quick" ? "New quick task" : "New creative request"), React.createElement("span", {
    className: "card__sub"
  }, mode === "creative" ? "All fields with * are required for assignment." : "All fields with * are required")), React.createElement("div", {
    className: "card__body"
  }, createAlert && React.createElement("div", {
    className: "reason-box reason-box--need",
    style: {
      marginBottom: 16
    }
  }, createAlert), mode === "quick" ? React.createElement(QuickTaskForm, {
    value: quickDraft,
    onChange: updateQuickDraft,
    assigneeOptions: assigneeOptions,
    requesterTeamOptions: requesterTeamOptions,
    errors: validationErrors
  }) : React.createElement(CreativeRequestForm, {
    value: creativeDraft,
    onChange: updateCreativeDraft,
    errors: validationErrors
  }))), React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      justifyContent: "flex-end",
      marginTop: 16
    }
  }, React.createElement("button", {
    className: "btn btn--ghost",
    onClick: () => onNav("my-work")
  }, "Cancel"), React.createElement("button", {
    className: "btn btn--primary",
    onClick: handleSubmit,
    disabled: isSubmitting
  }, React.createElement(Icon, {
    name: "send"
  }), " ", isSubmitting ? "Saving..." : mode === "quick" ? "Create quick task" : "Submit request")));
}
function QuickTaskForm({
  value,
  onChange,
  assigneeOptions,
  requesterTeamOptions = TEAMS,
  errors = {}
}) {
  const options = assigneeOptions || FLOWMATE_ASSIGNEE_FALLBACK;
  const selectedAssignee = options.find(option => option.userId === value.assigneeUserId) || null;
  const [assigneeQuery, setAssigneeQuery] = useState(selectedAssignee ? selectedAssignee.name : "");
  const [assigneeFocused, setAssigneeFocused] = useState(false);
  const assigneeMatches = window.filterFlowMateAssigneeOptions ? window.filterFlowMateAssigneeOptions(options, assigneeQuery) : options.filter(option => option.name.toLowerCase().startsWith((assigneeQuery || "").trim().toLowerCase()));
  const exactAssignee = selectedAssignee && assigneeQuery.trim().toLowerCase() === selectedAssignee.name.toLowerCase();
  const todayDate = getFlowMateTodayDateKey();
  useEffect(() => {
    setAssigneeQuery(selectedAssignee ? selectedAssignee.name : "");
  }, [selectedAssignee && selectedAssignee.userId]);
  function update(field, nextValue) {
    const normalizedValue = field === "dueDate" || field === "launchDate" ? clampFlowMateDateToToday(nextValue) : nextValue;
    const next = {
      ...value,
      [field]: normalizedValue
    };
    if (field === "assigneeUserId") next.assigneeOtherName = "";
    onChange(next);
  }
  function updateAssigneeQuery(nextQuery) {
    setAssigneeQuery(nextQuery);
    const exactMatch = options.find(option => option.name.toLowerCase() === nextQuery.trim().toLowerCase());
    update("assigneeUserId", exactMatch ? exactMatch.userId : "");
  }
  function selectAssignee(option) {
    setAssigneeQuery(option.name);
    setAssigneeFocused(false);
    update("assigneeUserId", option.userId);
  }
  return React.createElement("div", {
    className: "form-grid"
  }, React.createElement("div", {
    className: "field field--full"
  }, React.createElement("label", {
    className: "field__label"
  }, "Title ", React.createElement("span", {
    className: "req"
  }, "*")), React.createElement("input", {
    className: "input",
    value: value.title,
    readOnly: true,
    placeholder: "[3 Jul 2026][Function][Project Name]",
    title: "Auto-filled from Launch Date, Requester Team / Function, and Project / campaign."
  }), React.createElement("div", {
    className: "muted",
    style: {
      fontSize: 12,
      marginTop: 6
    }
  }, "Auto-filled from Launch Date, Requester Team / Function, and Project / campaign.")), React.createElement("div", {
    className: "field field--full"
  }, React.createElement("label", {
    className: "field__label"
  }, "Note"), React.createElement("textarea", {
    className: "textarea",
    value: value.note,
    onChange: e => update("note", e.target.value),
    placeholder: "Short description - what needs doing, any context, link to the doc."
  })), React.createElement("div", {
    className: `field ${errors.requesterTeam ? "field--error" : ""}`
  }, React.createElement("label", {
    className: "field__label"
  }, "Requester Team / Function ", React.createElement("span", {
    className: "req"
  }, "*")), React.createElement("select", {
    className: "select",
    value: value.requesterTeam,
    onChange: e => update("requesterTeam", e.target.value)
  }, requesterTeamOptions.map(team => React.createElement("option", {
    key: team,
    value: team
  }, team))), errors.requesterTeam && React.createElement("div", {
    className: "field__error"
  }, errors.requesterTeam)), React.createElement("div", {
    className: `field ${errors.projectName ? "field--error" : ""}`
  }, React.createElement("label", {
    className: "field__label"
  }, "Project / campaign ", React.createElement("span", {
    className: "req"
  }, "*")), React.createElement("input", {
    className: "input",
    value: value.projectName,
    onChange: e => update("projectName", e.target.value),
    placeholder: "e.g. FCO S24 Launch"
  }), errors.projectName && React.createElement("div", {
    className: "field__error"
  }, errors.projectName)), React.createElement("div", {
    className: "field"
  }, React.createElement("label", {
    className: "field__label"
  }, "Assignee"), React.createElement("div", {
    style: {
      position: "relative"
    }
  }, React.createElement("input", {
    className: "input",
    value: assigneeQuery,
    onChange: e => updateAssigneeQuery(e.target.value),
    onFocus: () => setAssigneeFocused(true),
    onBlur: () => window.setTimeout(() => setAssigneeFocused(false), 120),
    placeholder: "Type a name, e.g. P",
    autoComplete: "off"
  }), assigneeFocused && assigneeMatches.length > 0 && !exactAssignee && React.createElement("div", {
    className: "card",
    style: {
      position: "absolute",
      zIndex: 20,
      top: "calc(100% + 4px)",
      left: 0,
      right: 0,
      maxHeight: 220,
      overflowY: "auto",
      padding: 4
    }
  }, assigneeMatches.map(option => React.createElement("button", {
    key: option.userId,
    className: "btn btn--ghost",
    type: "button",
    onMouseDown: e => {
      e.preventDefault();
      selectAssignee(option);
    },
    style: {
      width: "100%",
      justifyContent: "flex-start"
    }
  }, option.name))))), React.createElement("div", {
    className: `field ${errors.dueDate ? "field--error" : ""}`
  }, React.createElement("label", {
    className: "field__label"
  }, "1st Review / Draft ", React.createElement("span", {
    className: "req"
  }, "*")), React.createElement("input", {
    className: "input",
    value: value.dueDate,
    onChange: e => update("dueDate", e.target.value),
    type: "date",
    min: todayDate
  }), errors.dueDate && React.createElement("div", {
    className: "field__error"
  }, errors.dueDate)), React.createElement("div", {
    className: `field ${errors.launchDate ? "field--error" : ""}`
  }, React.createElement("label", {
    className: "field__label"
  }, "Launch date ", React.createElement("span", {
    className: "req"
  }, "*")), React.createElement("input", {
    className: "input",
    value: value.launchDate,
    onChange: e => update("launchDate", e.target.value),
    type: "date",
    min: todayDate
  }), errors.launchDate && React.createElement("div", {
    className: "field__error"
  }, errors.launchDate)), React.createElement("div", {
    className: "field"
  }, React.createElement("label", {
    className: "field__label"
  }, "Priority"), React.createElement("select", {
    className: "select",
    value: value.priority,
    onChange: e => update("priority", e.target.value)
  }, React.createElement("option", {
    value: "low"
  }, "Low"), React.createElement("option", {
    value: "normal"
  }, "Normal"), React.createElement("option", {
    value: "high"
  }, "High"))));
}
function CreativeRequestForm({
  value,
  onChange,
  errors = {}
}) {
  const selectedCreativeType = getFlowMateCreativeTypeOption(value.assetSubtype);
  const todayDate = getFlowMateTodayDateKey();
  const [campaignOptions, setCampaignOptions] = useState(() => window.FLOWMATE_MARKETING_CAMPAIGNS || []);
  const selectedChannels = normalizeFlowMateCreativeChannels(value.platforms);
  useEffect(() => {
    let alive = true;
    function syncCampaignOptions(event) {
      const campaigns = event && event.detail && event.detail.campaigns ? event.detail.campaigns : window.FLOWMATE_MARKETING_CAMPAIGNS || [];
      if (alive) setCampaignOptions(campaigns);
    }
    window.addEventListener("flowmate:marketing-campaigns-updated", syncCampaignOptions);
    if (window.loadFlowMateMarketingCampaignOptions) {
      window.loadFlowMateMarketingCampaignOptions().then(campaigns => {
        if (alive) setCampaignOptions(campaigns || []);
      }).catch(error => console.warn("[FlowMate Create] campaign options load failed:", error && error.message));
    }
    return () => {
      alive = false;
      window.removeEventListener("flowmate:marketing-campaigns-updated", syncCampaignOptions);
    };
  }, []);
  function update(field, next) {
    if (field === "assetSubtype") {
      const nextType = getFlowMateCreativeTypeOption(next);
      onChange({
        ...value,
        assetType: nextType.assetType,
        assetSubtype: nextType.key
      });
      return;
    }
    if (field === "launchDate") {
      const nextLaunchDate = clampFlowMateDateToToday(next);
      const shouldSyncPublishDate = !value.publishDate || value.publishDate === value.launchDate;
      onChange({
        ...value,
        launchDate: nextLaunchDate,
        publishDate: shouldSyncPublishDate ? nextLaunchDate : value.publishDate,
        dueDate: getFlowMateDraftDateForLaunchDate(nextLaunchDate)
      });
      return;
    }
    if (field === "publishDate") {
      onChange({
        ...value,
        publishDate: clampFlowMateDateToToday(next)
      });
      return;
    }
    onChange({
      ...value,
      [field]: next
    });
  }
  function toggleChannel(channelLabel) {
    const currentChannels = normalizeFlowMateCreativeChannels(value.platforms);
    const nextChannels = currentChannels.includes(channelLabel) ? currentChannels.filter(channel => channel !== channelLabel) : [...currentChannels, channelLabel];
    update("platforms", nextChannels.length ? nextChannels.join(", ") : channelLabel);
  }
  return React.createElement("div", null, React.createElement("div", {
    className: "form-grid"
  }, React.createElement("div", {
    className: "field field--full"
  }, React.createElement("label", {
    className: "field__label"
  }, "Title ", React.createElement("span", {
    className: "req"
  }, "*")), React.createElement("input", {
    className: "input",
    value: value.title,
    readOnly: true,
    placeholder: "[3 Jul 2026][Function][Campaign][Product / Event]",
    title: "Auto-filled from Launch Date, your account team, Campaign, and Product / Event."
  }), React.createElement("div", {
    className: "muted",
    style: {
      fontSize: 12,
      marginTop: 6
    }
  }, "Auto-filled from Launch Date, your account team, Campaign, and Product / Event.")), React.createElement("div", {
    className: `field ${errors.campaignName ? "field--error" : ""}`
  }, React.createElement("label", {
    className: "field__label"
  }, "Campaign ", React.createElement("span", {
    className: "req"
  }, "*")), React.createElement("input", {
    className: "input",
    list: "flowmate-campaign-tags",
    value: value.campaignName,
    onChange: e => update("campaignName", e.target.value),
    placeholder: "e.g. FCO S24 Launch"
  }), React.createElement("datalist", {
    id: "flowmate-campaign-tags"
  }, campaignOptions.map(campaign => React.createElement("option", {
    key: campaign.id || campaign.name,
    value: campaign.name
  }))), errors.campaignName && React.createElement("div", {
    className: "field__error"
  }, errors.campaignName)), React.createElement("div", {
    className: `field ${errors.productEvent ? "field--error" : ""}`
  }, React.createElement("label", {
    className: "field__label"
  }, "Product / Event ", React.createElement("span", {
    className: "req"
  }, "*")), React.createElement("input", {
    className: "input",
    value: value.productEvent,
    onChange: e => update("productEvent", e.target.value),
    placeholder: "e.g. DAU, Hero Post Teaser"
  }), errors.productEvent && React.createElement("div", {
    className: "field__error"
  }, errors.productEvent)), React.createElement("div", {
    className: `field ${errors.assetSubtype ? "field--error" : ""}`
  }, React.createElement("label", {
    className: "field__label"
  }, "Type / Skill ", React.createElement("span", {
    className: "req"
  }, "*")), React.createElement("select", {
    className: "select",
    value: selectedCreativeType.key,
    onChange: e => update("assetSubtype", e.target.value)
  }, FLOWMATE_CREATIVE_TYPE_OPTIONS.map(option => React.createElement("option", {
    key: option.key,
    value: option.key
  }, option.label))), errors.assetSubtype && React.createElement("div", {
    className: "field__error"
  }, errors.assetSubtype)), React.createElement("div", {
    className: `field ${errors.assetCount ? "field--error" : ""}`
  }, React.createElement("label", {
    className: "field__label"
  }, "Asset Count ", React.createElement("span", {
    className: "req"
  }, "*")), React.createElement("input", {
    className: "input",
    type: "number",
    min: "1",
    step: "1",
    value: value.assetCount,
    onChange: e => update("assetCount", e.target.value),
    placeholder: "1"
  }), errors.assetCount && React.createElement("div", {
    className: "field__error"
  }, errors.assetCount)), React.createElement("div", {
    className: `field ${errors.platforms ? "field--error" : ""}`
  }, React.createElement("label", {
    className: "field__label"
  }, "Channel Tag ", React.createElement("span", {
    className: "req"
  }, "*")), React.createElement("div", {
    className: "check-row"
  }, FLOWMATE_CREATIVE_CHANNEL_OPTIONS.map(channel => React.createElement("label", {
    key: channel.key,
    className: "check-pill"
  }, React.createElement("input", {
    type: "checkbox",
    checked: selectedChannels.includes(channel.label),
    onChange: () => toggleChannel(channel.label)
  }), React.createElement("span", null, channel.label)))), errors.platforms && React.createElement("div", {
    className: "field__error"
  }, errors.platforms)), React.createElement("div", {
    className: `field ${errors.sizeFormat ? "field--error" : ""}`
  }, React.createElement("label", {
    className: "field__label"
  }, "Size / format ", React.createElement("span", {
    className: "req"
  }, "*")), React.createElement("input", {
    className: "input",
    value: value.sizeFormat,
    onChange: e => update("sizeFormat", e.target.value),
    placeholder: "e.g. 1080x1350, 1080x1920"
  }), errors.sizeFormat && React.createElement("div", {
    className: "field__error"
  }, errors.sizeFormat)), React.createElement("div", {
    className: `field ${errors.briefLink ? "field--error" : ""}`
  }, React.createElement("label", {
    className: "field__label"
  }, "Brief link ", React.createElement("span", {
    className: "req"
  }, "*")), React.createElement("input", {
    className: "input",
    value: value.briefLink,
    onChange: e => update("briefLink", e.target.value),
    placeholder: "https://docs.google.com/..."
  }), errors.briefLink && React.createElement("div", {
    className: "field__error"
  }, errors.briefLink)), React.createElement("div", {
    className: "field field--full"
  }, React.createElement("label", {
    className: "field__label"
  }, "Brief Note"), React.createElement("textarea", {
    className: "textarea",
    value: value.briefNote,
    onChange: e => update("briefNote", e.target.value),
    placeholder: "Short brief context, key message, references, or special instructions."
  })), React.createElement("div", {
    className: "field"
  }, React.createElement("label", {
    className: "field__label"
  }, "Reference link"), React.createElement("input", {
    className: "input",
    value: value.referenceLink,
    onChange: e => update("referenceLink", e.target.value),
    placeholder: "Optional - Figma / mood board / past asset"
  })), React.createElement("div", {
    className: `field ${errors.priority ? "field--error" : ""}`
  }, React.createElement("label", {
    className: "field__label"
  }, "Priority ", React.createElement("span", {
    className: "req"
  }, "*")), React.createElement("select", {
    className: "select",
    value: value.priority,
    onChange: e => update("priority", e.target.value)
  }, React.createElement("option", {
    value: "low"
  }, "Low"), React.createElement("option", {
    value: "normal"
  }, "Normal"), React.createElement("option", {
    value: "high"
  }, "High"), React.createElement("option", {
    value: "urgent"
  }, "Urgent")), errors.priority && React.createElement("div", {
    className: "field__error"
  }, errors.priority)), React.createElement("div", {
    className: `field ${errors.urgentReason ? "field--error" : ""}`
  }, React.createElement("label", {
    className: "field__label"
  }, "Urgent reason ", value.priority === "urgent" && React.createElement("span", {
    className: "req"
  }, "*")), React.createElement("input", {
    className: "input",
    value: value.urgentReason,
    onChange: e => update("urgentReason", e.target.value),
    disabled: value.priority !== "urgent",
    placeholder: value.priority === "urgent" ? "Why urgent? (visible to supervisor)" : "Only required when priority is Urgent"
  }), errors.urgentReason && React.createElement("div", {
    className: "field__error"
  }, errors.urgentReason)), React.createElement("div", {
    className: `field ${errors.publishDate ? "field--error" : ""}`
  }, React.createElement("label", {
    className: "field__label"
  }, "Publish Date ", React.createElement("span", {
    className: "req"
  }, "*")), React.createElement("input", {
    className: "input",
    type: "date",
    value: value.publishDate,
    onChange: e => update("publishDate", e.target.value),
    min: todayDate
  }), errors.publishDate && React.createElement("div", {
    className: "field__error"
  }, errors.publishDate)), React.createElement("div", {
    className: `field ${errors.dueDate ? "field--error" : ""}`
  }, React.createElement("label", {
    className: "field__label"
  }, "1st Draft ", React.createElement("span", {
    className: "req"
  }, "*")), React.createElement("input", {
    className: "input",
    type: "date",
    value: value.dueDate,
    readOnly: true,
    disabled: true,
    min: todayDate
  }), React.createElement("div", {
    className: "muted",
    style: {
      fontSize: 12,
      marginTop: 6
    }
  }, "Generated from Launch Date minus 5 working days."), errors.dueDate && React.createElement("div", {
    className: "field__error"
  }, errors.dueDate)), React.createElement("div", {
    className: `field ${errors.launchDate ? "field--error" : ""}`
  }, React.createElement("label", {
    className: "field__label"
  }, "Launch date ", React.createElement("span", {
    className: "req"
  }, "*")), React.createElement("input", {
    className: "input",
    type: "date",
    value: value.launchDate,
    onChange: e => update("launchDate", e.target.value),
    min: todayDate
  }), errors.launchDate && React.createElement("div", {
    className: "field__error"
  }, errors.launchDate)), React.createElement("div", {
    className: "field field--full"
  }, React.createElement("div", {
    className: "reason-box"
  }, React.createElement("strong", null, "Note - fields not collected:"), " preferred owner, manual effort, complexity. The engine sets effort and owner based on skill, capacity, WIP, and fairness rules."))));
}
function CreateResultScreen({
  result,
  onAgain,
  onNav
}) {
  const m = result.kind === "assigned" && result.owner ? MEMBERS_BY_ID[result.owner] : null;
  return React.createElement("div", {
    className: "page",
    style: {
      maxWidth: 760
    }
  }, React.createElement("div", {
    className: "card"
  }, React.createElement("div", {
    className: "card__head"
  }, React.createElement("span", {
    className: "card__title"
  }, result.kind === "assigned" && "Request submitted - assigned", result.kind === "queued" && "Request submitted - queued", result.kind === "need_brief" && "Request submitted - needs brief", result.kind === "quick_created" && "Quick task created", result.kind === "open_failed" && "Saved - detail did not open", result.kind === "error" && "Could not save"), React.createElement("span", {
    className: "card__sub mono"
  }, result.id)), React.createElement("div", {
    className: "card__body"
  }, result.kind === "assigned" && m && React.createElement("div", {
    className: "col",
    style: {
      gap: 12
    }
  }, React.createElement("div", {
    className: "row",
    style: {
      gap: 12
    }
  }, React.createElement(Avatar, {
    memberId: result.owner,
    size: "avatar--xl"
  }), React.createElement("div", null, React.createElement("div", {
    className: "strong",
    style: {
      fontSize: 16
    }
  }, m.name), React.createElement("div", {
    className: "muted",
    style: {
      fontSize: 12
    }
  }, m.discipline, " - capacity ", m.capacityPerDay, " pt/day")), React.createElement("div", {
    className: "spacer"
  }), React.createElement(Effort, {
    value: result.effort,
    lg: true
  }), React.createElement("span", {
    className: "muted",
    style: {
      fontSize: 12
    }
  }, "effort points")), React.createElement("div", {
    className: "reason-box"
  }, result.reason)), result.kind === "queued" && React.createElement("div", {
    className: "col",
    style: {
      gap: 12
    }
  }, React.createElement("div", {
    className: "muted"
  }, "No eligible owner right now — request sits in the Central queue until capacity opens."), result.effort != null && React.createElement("div", {
    className: "row",
    style: {
      gap: 6,
      alignItems: "center"
    }
  }, React.createElement(Effort, {
    value: result.effort,
    lg: true
  }), React.createElement("span", {
    className: "muted",
    style: {
      fontSize: 12
    }
  }, "effort points")), React.createElement("div", {
    className: "reason-box reason-box--queued"
  }, result.reason)), result.kind === "need_brief" && React.createElement("div", {
    className: "col",
    style: {
      gap: 12
    }
  }, React.createElement("div", {
    className: "muted"
  }, "Required brief fields are missing. Engine will not run until brief is complete."), React.createElement("div", {
    className: "reason-box reason-box--need"
  }, result.reason)), result.kind === "quick_created" && React.createElement("div", {
    className: "muted"
  }, "Quick task saved to your team's list. It will appear under ", React.createElement("strong", null, "Quick tasks"), " in My Work."), result.kind === "error" && React.createElement("div", {
    className: "reason-box reason-box--need"
  }, result.message), result.kind === "open_failed" && React.createElement("div", {
    className: "reason-box reason-box--need"
  }, result.message, " Open the list view and search for ", React.createElement("span", {
    className: "mono"
  }, result.id), "."))), React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginTop: 16
    }
  }, React.createElement("button", {
    className: "btn btn--secondary",
    onClick: onAgain
  }, "Create another"), React.createElement("button", {
    className: "btn btn--ghost",
    onClick: () => onNav("list")
  }, "Open list view"), React.createElement("span", {
    className: "spacer"
  }), React.createElement("button", {
    className: "btn btn--primary",
    disabled: true,
    title: "Opening the newly created detail directly is planned for MVP 1.1"
  }, "Open detail (MVP 1.1) ", React.createElement(Icon, {
    name: "arrow"
  }))));
}
function DetailScreen({
  onNav,
  onOpen,
  focusId
}) {
  const id = focusId || "";
  const detailBackContext = window.readFlowMateDetailBackContext ? window.readFlowMateDetailBackContext() : null;
  const detailBackRoute = detailBackContext && detailBackContext.route ? detailBackContext.route : "my-work";
  const detailBackLabel = detailBackContext && detailBackContext.label ? detailBackContext.label : "My work";
  function goDetailBack() {
    if (detailBackContext && detailBackContext.listState && window.saveFlowMateListViewState) {
      window.saveFlowMateListViewState(detailBackContext.listState);
    }
    onNav(detailBackRoute);
  }
  const selected = window.flowmateSelectedWorkItem && window.flowmateSelectedWorkItem.id === id ? window.flowmateSelectedWorkItem : null;
  const w = selected || WORK_BY_ID[id] || null;
  const [actionMsg, setActionMsg] = useState(null);
  const [pending, setPending] = useState(false);
  const [detailRefreshTick, setDetailRefreshTick] = useState(0);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkDescription, setLinkDescription] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [mentionUsers, setMentionUsers] = useState(window.FLOWMATE_MENTION_USERS || []);
  const [watcherUserId, setWatcherUserId] = useState("");
  const [detailLinks, setDetailLinks] = useState(w && w.links || []);
  const [detailComments, setDetailComments] = useState(w && w.comments || []);
  const [detailWatchers, setDetailWatchers] = useState(w && w.watchers || []);
  const [detailAiTags, setDetailAiTags] = useState(w && w.aiTags || []);
  useEffect(() => {
    if (!w) return;
    setDetailLinks(w.links || []);
    setDetailComments(w.comments || []);
    setDetailWatchers(w.watchers || []);
    setDetailAiTags(w.aiTags || []);
  }, [w && w.id, w && w.links, w && w.comments, w && w.watchers, w && w.aiTags]);
  useEffect(() => {
    let alive = true;
    if (!w || !w.isSupabaseRow || !window.loadFlowMateAiTags) return () => {
      alive = false;
    };
    window.loadFlowMateAiTags({
      displayId: w.id
    }).then(tags => {
      if (!alive) return;
      setDetailAiTags(tags || []);
      w.aiTags = tags || [];
      if (window.flowmateSelectedWorkItem && window.flowmateSelectedWorkItem.id === w.id) {
        window.flowmateSelectedWorkItem.aiTags = tags || [];
      }
    }).catch(error => {
      console.warn("[FlowMate AI Tags] Load failed:", error && error.message);
    });
    return () => {
      alive = false;
    };
  }, [w && w.id, w && w.isSupabaseRow]);
  useEffect(() => {
    let alive = true;
    if (window.FLOWMATE_MENTION_USERS && window.FLOWMATE_MENTION_USERS.length > 0) {
      setMentionUsers(window.FLOWMATE_MENTION_USERS);
    }
    if (!window.loadFlowMateMentionUsers) return () => {
      alive = false;
    };
    window.loadFlowMateMentionUsers().then(users => {
      if (alive) setMentionUsers(users || []);
    }).catch(error => {
      console.warn("[FlowMate Mentions] Load failed:", error && error.message);
    });
    return () => {
      alive = false;
    };
  }, [w && w.id]);
  if (!w) {
    return React.createElement("div", {
      className: "page",
      style: {
        maxWidth: 640
      }
    }, React.createElement("div", {
      className: "row",
      style: {
        marginBottom: 12,
        fontSize: 12
      }
    }, React.createElement("button", {
      className: "btn btn--ghost btn--xs",
      onClick: goDetailBack
    }, React.createElement(Icon, {
      name: "chevron",
      size: 11,
      style: {
        transform: "rotate(180deg)"
      }
    }), " ", detailBackLabel), React.createElement("span", {
      className: "muted"
    }, "/"), React.createElement("span", {
      className: "mono muted"
    }, id)), React.createElement("div", {
      className: "card"
    }, React.createElement("div", {
      className: "card__head"
    }, React.createElement("span", {
      className: "card__title"
    }, "Work item not loaded")), React.createElement("div", {
      className: "card__body"
    }, React.createElement("div", {
      className: "reason-box reason-box--need"
    }, "We could not find ", React.createElement("span", {
      className: "mono"
    }, id), " in the current view. Open it from ", React.createElement("strong", null, "My work"), ", ", React.createElement("strong", null, "List"), ", ", React.createElement("strong", null, "Board"), ", or ", React.createElement("strong", null, "Central queue"), " so the full row is fetched from Supabase."), React.createElement("div", {
      style: {
        marginTop: 12
      }
    }, React.createElement("button", {
      className: "btn btn--secondary",
      onClick: () => onNav("list")
    }, React.createElement(Icon, {
      name: "list"
    }), " Open list view")))));
  }
  const owner = MEMBERS_BY_ID[w.assignee];
  const isLiveDetail = Boolean(w.isSupabaseRow);
  const visibleBriefNote = w.briefNote || w.note || "";
  const visibleChecklistItems = w.checklistItems || [];
  const watcherOptions = (window.MEMBERS || []).filter(member => member.userId);
  const hasCreativeDetails = w.type !== "quick" && Boolean(w.assetType || w.subtype || w.platform || w.channel || w.size || w.campaign || w.publishLabel || w.launchLabel);
  const currentUserId = window.FLOWMATE_CURRENT_USER?.id || null;
  const isAdminUser = window.FLOWMATE_CURRENT_USER?.role === "admin";
  const canStatusTransition = Boolean(w.isSupabaseRow && w.type !== "quick" && (isAdminUser || currentUserId === w.requesterUserId || currentUserId === w.assigneeUserId || owner?.userId === currentUserId));
  const visibleLinks = detailLinks;
  const visibleComments = detailComments;
  const visibleWatchers = detailWatchers;
  const visibleAiTags = detailAiTags;
  const mentionQueryMatch = commentBody.match(/(^|\s)@([^\s@]*)$/);
  const mentionQuery = mentionQueryMatch ? mentionQueryMatch[2].toLowerCase() : null;
  const mentionSuggestions = mentionQuery == null ? [] : mentionUsers.filter(user => user.id !== currentUserId).filter(user => {
    const name = (user.name || "").toLowerCase();
    const email = (user.email || "").toLowerCase();
    return !mentionQuery || name.includes(mentionQuery) || email.includes(mentionQuery);
  }).slice(0, 6);
  function flowmateFormatCommentTime(dateValue) {
    if (!dateValue) return "";
    return new Date(dateValue).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    }).replace(/\b(am|pm)\b/i, match => match.toUpperCase());
  }
  function extractFlowMateMentionedUserIds(body) {
    const lowerBody = (body || "").toLowerCase();
    const ids = new Set();
    mentionUsers.forEach(user => {
      const mentionText = `@${(user.name || "").toLowerCase()}`;
      if (user.id && mentionText.length > 1 && lowerBody.includes(mentionText)) {
        ids.add(user.id);
      }
    });
    return Array.from(ids);
  }
  function insertMentionUser(user) {
    if (!user || !user.id) return;
    setCommentBody(body => {
      const next = body.match(/(^|\s)@([^\s@]*)$/) ? body.replace(/(^|\s)@([^\s@]*)$/, `$1@${user.name} `) : `${body}${body.endsWith(" ") || body.length === 0 ? "" : " "}@${user.name} `;
      return next;
    });
  }
  async function refreshDetailItem() {
    if (!w || !window.loadFlowMateListRows) return;
    try {
      const rows = await window.loadFlowMateListRows();
      const updated = (rows || []).find(row => row.id === w.id);
      if (updated) {
        window.flowmateSelectedWorkItem = updated;
        setDetailRefreshTick(tick => tick + 1);
      }
    } catch (error) {
      console.warn("[FlowMate Detail] refresh after mutation failed:", error && error.message);
    }
  }
  async function runCreativeTransition(nextStatus) {
    if (!w.isSupabaseRow) {
      setActionMsg({
        tone: "warn",
        text: "This item is not loaded from Supabase, so status changes are disabled."
      });
      return;
    }
    const options = {};
    if (nextStatus === "review") {
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
    if (nextStatus === "blocked") {
      const reason = await window.flowmatePrompt({
        title: "Block work",
        label: "Blocked reason",
        multiline: true,
        required: true
      });
      if (!reason) return;
      options.blockedReason = reason;
    }
    setPending(true);
    try {
      await window.transitionFlowMateWorkStatus(w.id, nextStatus, options);
      await refreshDetailItem();
      setActionMsg({
        tone: "ok",
        text: `${w.id} moved to ${STATUS_LABEL[nextStatus] || nextStatus}.`
      });
    } catch (error) {
      setActionMsg({
        tone: "bad",
        text: window.flowmateUserError(error, "Status change failed.")
      });
    } finally {
      setPending(false);
    }
  }
  async function submitLink(event) {
    event.preventDefault();
    if (!w.isSupabaseRow) {
      setActionMsg({
        tone: "warn",
        text: "This item is not loaded from Supabase, so links are disabled."
      });
      return;
    }
    setPending(true);
    try {
      const data = await window.addFlowMateWorkItemLink(w.id, linkUrl, linkDescription);
      const addedLink = {
        id: data?.id || `local-link-${Date.now()}`,
        work_item_id: data?.work_item_id,
        url: data?.url || linkUrl.trim(),
        description: data?.description || linkDescription.trim(),
        created_by_user_id: data?.created_by_user_id || window.FLOWMATE_CURRENT_USER?.id,
        createdByName: window.FLOWMATE_CURRENT_USER?.name || "You",
        created_at: data?.created_at,
        createdLabel: "Just now"
      };
      setDetailLinks(current => {
        if (current.some(link => link.id === addedLink.id)) return current;
        const next = [...current, addedLink];
        w.links = next;
        if (window.flowmateSelectedWorkItem && window.flowmateSelectedWorkItem.id === w.id) {
          window.flowmateSelectedWorkItem.links = next;
        }
        return next;
      });
      setLinkUrl("");
      setLinkDescription("");
      setActionMsg({
        tone: "ok",
        text: "Link added."
      });
      window.dispatchEvent(new CustomEvent("flowmate:refresh-request", {
        detail: {
          reason: "work_item_links"
        }
      }));
    } catch (error) {
      setActionMsg({
        tone: "bad",
        text: window.flowmateUserError(error, "Add link failed.")
      });
    } finally {
      setPending(false);
    }
  }
  async function submitComment(event) {
    event.preventDefault();
    if (!w.isSupabaseRow) {
      setActionMsg({
        tone: "warn",
        text: "This item is not loaded from Supabase, so comments are disabled."
      });
      return;
    }
    setPending(true);
    try {
      const mentionedUserIds = extractFlowMateMentionedUserIds(commentBody);
      const data = await window.addFlowMateWorkItemComment(w.id, commentBody, mentionedUserIds);
      const addedComment = {
        id: data?.id || `local-comment-${Date.now()}`,
        work_item_id: data?.work_item_id,
        author_user_id: data?.author_user_id || window.FLOWMATE_CURRENT_USER?.id,
        body: data?.body || commentBody.trim(),
        mentioned_user_ids: data?.mentioned_user_ids || mentionedUserIds,
        authorName: window.FLOWMATE_CURRENT_USER?.name || "You",
        created_at: data?.created_at || new Date().toISOString(),
        createdLabel: flowmateFormatCommentTime(data?.created_at || new Date().toISOString())
      };
      setDetailComments(current => {
        if (current.some(comment => comment.id === addedComment.id)) return current;
        const next = [...current, addedComment];
        w.comments = next;
        if (window.flowmateSelectedWorkItem && window.flowmateSelectedWorkItem.id === w.id) {
          window.flowmateSelectedWorkItem.comments = next;
        }
        return next;
      });
      setCommentBody("");
      setActionMsg({
        tone: "ok",
        text: "Comment added."
      });
      window.dispatchEvent(new CustomEvent("flowmate:refresh-request", {
        detail: {
          reason: "comments"
        }
      }));
    } catch (error) {
      setActionMsg({
        tone: "bad",
        text: window.flowmateUserError(error, "Add comment failed.")
      });
    } finally {
      setPending(false);
    }
  }
  async function submitWatcher(event) {
    event.preventDefault();
    if (!w.isSupabaseRow) {
      setActionMsg({
        tone: "warn",
        text: "This item is not loaded from Supabase, so watchers are disabled."
      });
      return;
    }
    setPending(true);
    try {
      const selectedWatcher = watcherOptions.find(member => member.userId === watcherUserId);
      const data = await window.addFlowMateWorkItemWatcher(w.id, watcherUserId);
      const addedWatcher = {
        id: data?.id || `local-watcher-${watcherUserId}`,
        work_item_id: data?.work_item_id,
        watcher_user_id: data?.watcher_user_id || watcherUserId,
        added_by_user_id: data?.added_by_user_id || window.FLOWMATE_CURRENT_USER?.id,
        watcherName: selectedWatcher?.name || "Watcher",
        addedByName: window.FLOWMATE_CURRENT_USER?.name || "You",
        created_at: data?.created_at,
        createdLabel: "Just now"
      };
      setDetailWatchers(current => {
        if (current.some(watcher => watcher.watcher_user_id === addedWatcher.watcher_user_id)) return current;
        const next = [...current, addedWatcher];
        w.watchers = next;
        if (window.flowmateSelectedWorkItem && window.flowmateSelectedWorkItem.id === w.id) {
          window.flowmateSelectedWorkItem.watchers = next;
        }
        return next;
      });
      setWatcherUserId("");
      setActionMsg({
        tone: "ok",
        text: "Watcher added."
      });
      window.dispatchEvent(new CustomEvent("flowmate:refresh-request", {
        detail: {
          reason: "work_item_watchers"
        }
      }));
    } catch (error) {
      setActionMsg({
        tone: "bad",
        text: window.flowmateUserError(error, "Add watcher failed.")
      });
    } finally {
      setPending(false);
    }
  }
  async function addAiTag() {
    if (!w.isSupabaseRow || !window.addFlowMateAiTag) {
      setActionMsg({
        tone: "warn",
        text: "This item is not loaded from Supabase, so AI tags are disabled."
      });
      return;
    }
    const tag = "AI";
    const normalizedTag = tag.trim().toLowerCase();
    if (normalizedTag === "ai" && detailAiTags.some(item => String(item.tag || "").trim().toLowerCase() === normalizedTag)) {
      setActionMsg({
        tone: "ok",
        text: "AI tag already added."
      });
      return;
    }
    setPending(true);
    try {
      const data = await window.addFlowMateAiTag({
        displayId: w.id
      }, tag);
      setDetailAiTags(current => {
        const next = current.some(item => item.id === data.id || item.tag.toLowerCase() === data.tag.toLowerCase()) ? current : [...current, data];
        w.aiTags = next;
        if (window.flowmateSelectedWorkItem && window.flowmateSelectedWorkItem.id === w.id) {
          window.flowmateSelectedWorkItem.aiTags = next;
        }
        return next;
      });
      setActionMsg({
        tone: "ok",
        text: "AI tag added."
      });
    } catch (error) {
      setActionMsg({
        tone: "bad",
        text: window.flowmateUserError(error, "Add AI tag failed.")
      });
    } finally {
      setPending(false);
    }
  }
  async function removeAiTag(tag) {
    if (!tag || !tag.id || !window.removeFlowMateAiTag) return;
    setPending(true);
    try {
      await window.removeFlowMateAiTag(tag.id);
      setDetailAiTags(current => {
        const next = current.filter(item => item.id !== tag.id);
        w.aiTags = next;
        if (window.flowmateSelectedWorkItem && window.flowmateSelectedWorkItem.id === w.id) {
          window.flowmateSelectedWorkItem.aiTags = next;
        }
        return next;
      });
      setActionMsg({
        tone: "ok",
        text: "AI tag removed."
      });
    } catch (error) {
      setActionMsg({
        tone: "bad",
        text: window.flowmateUserError(error, "Remove AI tag failed.")
      });
    } finally {
      setPending(false);
    }
  }
  async function runRerunAssignment() {
    if (!w.isSupabaseRow) {
      setActionMsg({
        tone: "warn",
        text: "This item is not loaded from Supabase, so assignment rerun is disabled."
      });
      return;
    }
    setPending(true);
    try {
      const data = await window.rerunFlowMateAssignment(w.id);
      const r = data && data.result;
      await refreshDetailItem();
      setActionMsg({
        tone: "ok",
        text: `Rerun result: ${r || "ok"}.`
      });
    } catch (error) {
      setActionMsg({
        tone: "bad",
        text: window.flowmateUserError(error, "Rerun failed.")
      });
    } finally {
      setPending(false);
    }
  }
  async function runCancel() {
    if (!w.isSupabaseRow) {
      setActionMsg({
        tone: "warn",
        text: "This item is not loaded from Supabase, so cancel is disabled."
      });
      return;
    }
    const reason = await window.flowmatePrompt({
      title: "Cancel work",
      label: "Cancel reason",
      multiline: true,
      required: true
    });
    if (!reason) return;
    setPending(true);
    try {
      await window.cancelFlowMateWorkItem(w, reason);
      await refreshDetailItem();
      setActionMsg({
        tone: "ok",
        text: `${w.id} cancelled.`
      });
    } catch (error) {
      setActionMsg({
        tone: "bad",
        text: window.flowmateUserError(error, "Cancel failed.")
      });
    } finally {
      setPending(false);
    }
  }
  async function runAdminArchive() {
    if (!isAdminUser) return;
    if (!w.isSupabaseRow) {
      setActionMsg({
        tone: "warn",
        text: "This item is not loaded from Supabase, so admin archive is disabled."
      });
      return;
    }
    const reason = await window.flowmatePrompt({
      title: "Archive work item",
      label: "Archive reason",
      note: "Soft archive, not a permanent delete. History, comments, links, watchers, and audit stay preserved.",
      multiline: true,
      required: true,
      confirmText: "Archive"
    });
    if (!reason || !reason.trim()) return;
    setPending(true);
    try {
      await window.adminArchiveFlowMateWorkItem(w.id, reason);
      w.archivedAt = new Date().toISOString();
      if (window.flowmateSelectedWorkItem && window.flowmateSelectedWorkItem.id === w.id) {
        window.flowmateSelectedWorkItem.archivedAt = w.archivedAt;
      }
      setActionMsg({
        tone: "ok",
        text: `${w.id} archived. It will be hidden from normal active views after refresh.`
      });
      window.dispatchEvent(new CustomEvent("flowmate:refresh-request", {
        detail: {
          reason: "admin_archive"
        }
      }));
      window.dispatchEvent(new CustomEvent("flowmate:refresh-counts"));
    } catch (error) {
      setActionMsg({
        tone: "bad",
        text: window.flowmateUserError(error, "Admin archive failed.")
      });
    } finally {
      setPending(false);
    }
  }
  return React.createElement("div", {
    className: "page"
  }, React.createElement("div", {
    className: "row",
    style: {
      marginBottom: 12,
      fontSize: 12
    }
  }, React.createElement("button", {
    className: "btn btn--ghost btn--xs",
    onClick: goDetailBack
  }, React.createElement(Icon, {
    name: "chevron",
    size: 11,
    style: {
      transform: "rotate(180deg)"
    }
  }), " ", detailBackLabel), React.createElement("span", {
    className: "muted"
  }, "/"), React.createElement("span", {
    className: "mono muted"
  }, w.id)), React.createElement("div", {
    className: "page__header",
    style: {
      marginBottom: 16
    }
  }, React.createElement("div", null, React.createElement("div", {
    className: "row",
    style: {
      marginBottom: 6,
      gap: 8
    }
  }, React.createElement("span", {
    className: "mono muted",
    style: {
      fontSize: 12
    }
  }, w.id), React.createElement(TypePill, {
    type: w.type
  }), React.createElement(StatusBadge, {
    status: w.status
  }), React.createElement(PriorityBadge, {
    level: w.priority
  }), React.createElement(DueBadge, {
    delta: w.dueDelta,
    label: w.dueLabel,
    status: w.status
  })), React.createElement("h1", {
    className: "page__title",
    style: {
      fontSize: 22
    }
  }, w.title), React.createElement("div", {
    className: "page__sub",
    style: {
      marginTop: 4
    }
  }, w.requesterTeam || "No team", " - ", w.campaign || "No campaign", " - requested by ", w.requester || "-")), React.createElement("div", {
    className: "page__actions"
  }, canStatusTransition && ["assigned", "in_progress", "review"].includes(w.status) && React.createElement("button", {
    className: "btn btn--danger",
    onClick: () => runCreativeTransition("blocked"),
    disabled: pending
  }, React.createElement(Icon, {
    name: "block"
  }), " Block"), canStatusTransition && !["delivered", "cancelled"].includes(w.status) && React.createElement("button", {
    className: "btn btn--ghost",
    onClick: runCancel,
    disabled: pending
  }, React.createElement(Icon, {
    name: "x"
  }), " Cancel"), isAdminUser && w.isSupabaseRow && !w.archivedAt && React.createElement("button", {
    className: "btn btn--danger",
    onClick: runAdminArchive,
    disabled: pending
  }, React.createElement(Icon, {
    name: "layers"
  }), " Admin archive"), canStatusTransition && w.status === "assigned" && React.createElement("button", {
    className: "btn btn--primary",
    onClick: () => runCreativeTransition("in_progress"),
    disabled: pending
  }, React.createElement(Icon, {
    name: "play"
  }), " Start work"), canStatusTransition && w.status === "in_progress" && React.createElement("button", {
    className: "btn btn--primary",
    onClick: () => runCreativeTransition("review"),
    disabled: pending
  }, React.createElement(Icon, {
    name: "send"
  }), " Submit review"), canStatusTransition && w.status === "review" && React.createElement(React.Fragment, null, React.createElement("button", {
    className: "btn btn--secondary",
    onClick: () => runCreativeTransition("in_progress"),
    disabled: pending
  }, "Request changes"), React.createElement("button", {
    className: "btn btn--primary",
    onClick: () => runCreativeTransition("delivered"),
    disabled: pending
  }, React.createElement(Icon, {
    name: "check"
  }), " Approve delivered")), canStatusTransition && w.status === "blocked" && React.createElement("button", {
    className: "btn btn--primary",
    onClick: () => runCreativeTransition("in_progress"),
    disabled: pending
  }, React.createElement(Icon, {
    name: "play"
  }), " Resume"), canStatusTransition && w.status === "queued" && React.createElement("button", {
    className: "btn btn--primary",
    onClick: runRerunAssignment,
    disabled: pending
  }, React.createElement(Icon, {
    name: "rerun"
  }), " Rerun assignment"), canStatusTransition && w.status === "need_brief" && React.createElement("button", {
    className: "btn btn--primary",
    onClick: async () => {
      setPending(true);
      try {
        const data = await window.recheckFlowMateBrief(w.id);
        await refreshDetailItem();
        setActionMsg({
          tone: "ok",
          text: `Brief rechecked: ${data && data.result || "ok"}.`
        });
      } catch (error) {
        setActionMsg({
          tone: "bad",
          text: window.flowmateUserError(error, "Recheck failed.")
        });
      } finally {
        setPending(false);
      }
    },
    disabled: pending
  }, React.createElement(Icon, {
    name: "rerun"
  }), " Recheck brief"))), actionMsg && React.createElement("div", {
    className: `reason-box ${actionMsg.tone === "bad" ? "reason-box--need" : actionMsg.tone === "warn" ? "reason-box--queued" : ""}`,
    style: {
      marginBottom: 12
    }
  }, actionMsg.text), React.createElement("div", {
    className: "detail"
  }, React.createElement("div", {
    className: "detail__main"
  }, visibleBriefNote && React.createElement("div", {
    className: "card"
  }, React.createElement("div", {
    className: "card__head"
  }, React.createElement("span", {
    className: "card__title"
  }, w.type === "quick" ? "Note" : "Brief Note")), React.createElement("div", {
    className: "card__body"
  }, React.createElement("div", {
    className: "reason-box",
    style: {
      whiteSpace: "pre-wrap"
    }
  }, visibleBriefNote))), w.type === "quick" && React.createElement("div", {
    className: "card"
  }, React.createElement("div", {
    className: "card__head"
  }, React.createElement("span", {
    className: "card__title"
  }, "Quick Task details")), React.createElement("div", {
    className: "card__body"
  }, React.createElement("div", {
    className: "meta-row"
  }, React.createElement("div", {
    className: "meta-row__lbl"
  }, "Requester Team / Function"), React.createElement("div", {
    className: "meta-row__val"
  }, w.requesterTeam || "-")), React.createElement("div", {
    className: "meta-row"
  }, React.createElement("div", {
    className: "meta-row__lbl"
  }, "Project / campaign"), React.createElement("div", {
    className: "meta-row__val"
  }, w.campaign || "-")), React.createElement("div", {
    className: "meta-row"
  }, React.createElement("div", {
    className: "meta-row__lbl"
  }, "Assignee"), React.createElement("div", {
    className: "meta-row__val"
  }, owner?.name || "Unassigned")), React.createElement("div", {
    className: "meta-row"
  }, React.createElement("div", {
    className: "meta-row__lbl"
  }, "1st Review / Draft"), React.createElement("div", {
    className: "meta-row__val"
  }, w.dueLabel || "-")), React.createElement("div", {
    className: "meta-row"
  }, React.createElement("div", {
    className: "meta-row__lbl"
  }, "Launch date"), React.createElement("div", {
    className: "meta-row__val"
  }, w.launchFullLabel || w.launchLabel || "-")), React.createElement("div", {
    className: "meta-row"
  }, React.createElement("div", {
    className: "meta-row__lbl"
  }, "Priority"), React.createElement("div", {
    className: "meta-row__val"
  }, React.createElement(PriorityBadge, {
    level: w.priority
  }))))), hasCreativeDetails && React.createElement("div", {
    className: "card"
  }, React.createElement("div", {
    className: "card__head"
  }, React.createElement("span", {
    className: "card__title"
  }, "Creative details")), React.createElement("div", {
    className: "card__body"
  }, React.createElement("div", {
    className: "meta-row"
  }, React.createElement("div", {
    className: "meta-row__lbl"
  }, "Campaign"), React.createElement("div", {
    className: "meta-row__val"
  }, w.campaign || "-")), React.createElement("div", {
    className: "meta-row"
  }, React.createElement("div", {
    className: "meta-row__lbl"
  }, "Channel"), React.createElement("div", {
    className: "meta-row__val"
  }, w.channel || w.platform || "-")), React.createElement("div", {
    className: "meta-row"
  }, React.createElement("div", {
    className: "meta-row__lbl"
  }, "Type / Skill"), React.createElement("div", {
    className: "meta-row__val"
  }, w.subtype ? getFlowMateCreativeTypeLabel(w.subtype) : ASSET_LABEL[w.assetType] || w.assetType || "-")), React.createElement("div", {
    className: "meta-row"
  }, React.createElement("div", {
    className: "meta-row__lbl"
  }, "Asset Count"), React.createElement("div", {
    className: "meta-row__val"
  }, w.assetCount || 1)), React.createElement("div", {
    className: "meta-row"
  }, React.createElement("div", {
    className: "meta-row__lbl"
  }, "Size / format"), React.createElement("div", {
    className: "meta-row__val"
  }, w.size || "-")), React.createElement("div", {
    className: "meta-row"
  }, React.createElement("div", {
    className: "meta-row__lbl"
  }, "Brief link"), React.createElement("div", {
    className: "meta-row__val"
  }, window.flowmateSafeHttpUrl && window.flowmateSafeHttpUrl(w.briefLink) ? React.createElement("a", {
    href: window.flowmateSafeHttpUrl(w.briefLink),
    target: "_blank",
    rel: "noopener noreferrer"
  }, "Open brief") : "-")), React.createElement("div", {
    className: "meta-row"
  }, React.createElement("div", {
    className: "meta-row__lbl"
  }, "Reference link"), React.createElement("div", {
    className: "meta-row__val"
  }, window.flowmateSafeHttpUrl && window.flowmateSafeHttpUrl(w.referenceLink) ? React.createElement("a", {
    href: window.flowmateSafeHttpUrl(w.referenceLink),
    target: "_blank",
    rel: "noopener noreferrer"
  }, "Open reference") : "-")))), React.createElement("div", {
    className: "card"
  }, React.createElement("div", {
    className: "card__head"
  }, React.createElement("span", {
    className: "card__title"
  }, "Link zone ", React.createElement("span", {
    className: "muted",
    style: {
      fontWeight: 400,
      marginLeft: 6
    }
  }, visibleLinks.length))), React.createElement("div", {
    className: "card__body",
    style: {
      display: "grid",
      gap: 12
    }
  }, visibleLinks.length > 0 ? visibleLinks.map(link => React.createElement("div", {
    className: "meta-row",
    key: link.id
  }, React.createElement("div", {
    className: "meta-row__lbl"
  }, link.createdByName || "Link"), React.createElement("div", {
    className: "meta-row__val"
  }, window.flowmateSafeHttpUrl && window.flowmateSafeHttpUrl(link.url) ? React.createElement("a", {
    href: window.flowmateSafeHttpUrl(link.url),
    target: "_blank",
    rel: "noopener noreferrer"
  }, link.description || link.url) : React.createElement("span", {
    style: {
      wordBreak: "break-all"
    }
  }, link.description || link.url), link.description && React.createElement("div", {
    className: "muted",
    style: {
      fontSize: 11,
      wordBreak: "break-all"
    }
  }, link.url)))) : React.createElement("div", {
    className: "muted"
  }, "No links yet."), React.createElement("form", {
    className: "form-grid",
    onSubmit: submitLink
  }, React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "URL"), React.createElement("input", {
    className: "input",
    value: linkUrl,
    onChange: e => setLinkUrl(e.target.value),
    placeholder: "https://...",
    disabled: pending
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Description"), React.createElement("input", {
    className: "input",
    value: linkDescription,
    onChange: e => setLinkDescription(e.target.value),
    placeholder: "Brief, delivery, reference...",
    disabled: pending
  })), React.createElement("div", {
    className: "field",
    style: {
      justifyContent: "end"
    }
  }, React.createElement("span", {
    className: "field__label"
  }, "\xA0"), React.createElement("button", {
    className: "btn btn--primary",
    type: "submit",
    disabled: pending || !linkUrl.trim()
  }, React.createElement(Icon, {
    name: "link"
  }), " Add link"))))), visibleChecklistItems.length > 0 && React.createElement("div", {
    className: "card"
  }, React.createElement("div", {
    className: "card__head"
  }, React.createElement("span", {
    className: "card__title"
  }, "Checklist ", React.createElement("span", {
    className: "muted",
    style: {
      fontWeight: 400,
      marginLeft: 6
    }
  }, w.checklist?.done, "/", w.checklist?.total))), React.createElement("div", {
    className: "card__body checklist"
  }, visibleChecklistItems.map(item => React.createElement("div", {
    key: item.id,
    className: `check-item ${item.is_done ? "is-checked" : ""}`
  }, React.createElement("span", {
    className: `check-box ${item.is_done ? "is-checked" : ""}`
  }, item.is_done && React.createElement(Icon, {
    name: "check",
    size: 11
  })), React.createElement("span", {
    className: "check-item__lbl"
  }, item.title))))), React.createElement("div", {
    className: "card"
  }, React.createElement("div", {
    className: "card__head"
  }, React.createElement("span", {
    className: "card__title"
  }, "Comment zone ", React.createElement("span", {
    className: "muted",
    style: {
      fontWeight: 400,
      marginLeft: 6
    }
  }, visibleComments.length))), React.createElement("div", {
    className: "card__body",
    style: {
      display: "grid",
      gap: 12
    }
  }, visibleComments.length > 0 ? visibleComments.map(comment => React.createElement("div", {
    className: "comment",
    key: comment.id
  }, React.createElement(Avatar, {
    memberId: comment.author_user_id,
    size: "avatar--lg"
  }), React.createElement("div", {
    className: "comment__body"
  }, React.createElement("div", {
    className: "comment__head"
  }, React.createElement("span", {
    className: "comment__author"
  }, comment.authorName || "Unknown"), React.createElement("span", {
    className: "comment__time"
  }, comment.createdLabel || flowmateFormatCommentTime(comment.created_at))), React.createElement("div", {
    className: "comment__text",
    style: {
      whiteSpace: "pre-wrap"
    }
  }, comment.body)))) : React.createElement("div", {
    className: "muted"
  }, "No comments yet."), React.createElement("form", {
    className: "form-grid",
    onSubmit: submitComment
  }, React.createElement("label", {
    className: "field field--full"
  }, React.createElement("span", {
    className: "field__label"
  }, "Comment"), React.createElement("textarea", {
    className: "textarea",
    value: commentBody,
    onChange: e => setCommentBody(e.target.value),
    placeholder: "Add comment",
    disabled: pending
  }), mentionSuggestions.length > 0 && React.createElement("div", {
    className: "reason-box",
    style: {
      padding: 8,
      display: "grid",
      gap: 4
    }
  }, mentionSuggestions.map(user => React.createElement("button", {
    key: user.id,
    type: "button",
    className: "btn btn--xs btn--ghost",
    style: {
      justifyContent: "flex-start"
    },
    onClick: () => insertMentionUser(user)
  }, "@", user.name, user.email && React.createElement("span", {
    className: "muted",
    style: {
      marginLeft: 6
    }
  }, user.email))))), React.createElement("div", {
    className: "field",
    style: {
      justifyContent: "end"
    }
  }, React.createElement("span", {
    className: "field__label"
  }, "\xA0"), React.createElement("button", {
    className: "btn btn--primary",
    type: "submit",
    disabled: pending || !commentBody.trim()
  }, React.createElement(Icon, {
    name: "send"
  }), " Add comment")))))), React.createElement("div", {
    className: "detail__side"
  }, React.createElement("div", {
    className: "card"
  }, React.createElement("div", {
    className: "card__body"
  }, React.createElement("div", {
    className: "meta-row"
  }, React.createElement("div", {
    className: "meta-row__lbl"
  }, "Requester"), React.createElement("div", {
    className: "meta-row__val"
  }, w.requester || "-", " ", React.createElement("span", {
    className: "muted"
  }, "- ", w.requesterTeam || "No team"))), React.createElement("div", {
    className: "meta-row"
  }, React.createElement("div", {
    className: "meta-row__lbl"
  }, "Effort"), React.createElement("div", {
    className: "meta-row__val"
  }, React.createElement(Effort, {
    value: w.effort,
    lg: true
  }), " ", React.createElement("span", {
    className: "muted",
    style: {
      fontSize: 11,
      marginLeft: 6
    }
  }, "~", w.effort, "h"))), React.createElement("div", {
    className: "meta-row"
  }, React.createElement("div", {
    className: "meta-row__lbl"
  }, "Review round"), React.createElement("div", {
    className: "meta-row__val"
  }, w.reviewRound - 0, " ", React.createElement("span", {
    className: "muted",
    style: {
      fontSize: 11
    }
  }, "(incremented only on requested changes)"))), React.createElement("div", {
    className: "meta-row"
  }, React.createElement("div", {
    className: "meta-row__lbl"
  }, "Assignee"), React.createElement("div", {
    className: "meta-row__val row",
    style: {
      gap: 6
    }
  }, React.createElement(Avatar, {
    memberId: w.assignee
  }), " ", React.createElement("span", {
    className: "strong"
  }, owner?.name || "Unassigned"))), React.createElement("div", {
    className: "meta-row"
  }, React.createElement("div", {
    className: "meta-row__lbl"
  }, "Watchers"), React.createElement("div", {
    className: "meta-row__val",
    style: {
      display: "grid",
      gap: 8
    }
  }, visibleWatchers.length > 0 ? React.createElement("div", {
    style: {
      display: "grid",
      gap: 6
    }
  }, visibleWatchers.map(watcher => React.createElement("div", {
    className: "row",
    key: watcher.id,
    style: {
      gap: 6
    }
  }, React.createElement(Icon, {
    name: "users",
    size: 13
  }), React.createElement("span", null, watcher.watcherName || watcher.watcher_user_id)))) : React.createElement("span", {
    className: "muted"
  }, "No watchers"), React.createElement("form", {
    className: "watcher-add-form",
    onSubmit: submitWatcher
  }, React.createElement("select", {
    className: "select watcher-add-form__select",
    value: watcherUserId,
    onChange: e => setWatcherUserId(e.target.value),
    disabled: pending
  }, React.createElement("option", {
    value: ""
  }, "Add watcher"), watcherOptions.map(member => React.createElement("option", {
    key: member.userId,
    value: member.userId
  }, member.name))), React.createElement("button", {
    className: "btn btn--secondary watcher-add-form__button",
    type: "submit",
    disabled: pending || !watcherUserId
  }, React.createElement(Icon, {
    name: "plus"
  }), " Add watcher")))), React.createElement("div", {
    className: "meta-row"
  }, React.createElement("div", {
    className: "meta-row__lbl"
  }, "Created"), React.createElement("div", {
    className: "meta-row__val"
  }, w.createdLabel || "-")), React.createElement("div", {
    className: "meta-row"
  }, React.createElement("div", {
    className: "meta-row__lbl"
  }, "Publish Date"), React.createElement("div", {
    className: "meta-row__val"
  }, w.publishFullLabel || w.publishLabel || "-")), React.createElement("div", {
    className: "meta-row"
  }, React.createElement("div", {
    className: "meta-row__lbl"
  }, w.type === "quick" ? "1st Review / Draft" : "1st Draft"), React.createElement("div", {
    className: "meta-row__val"
  }, w.dueFullLabel || w.dueLabel || "-")), React.createElement("div", {
    className: "meta-row"
  }, React.createElement("div", {
    className: "meta-row__lbl"
  }, "Launch date"), React.createElement("div", {
    className: "meta-row__val"
  }, w.launchFullLabel || w.launchLabel || "-")), React.createElement("div", {
    className: "meta-row"
  }, React.createElement("div", {
    className: "meta-row__lbl"
  }, "AI Tag"), React.createElement("div", {
    className: "meta-row__val"
  }, React.createElement("div", {
    className: "ai-tag-list"
  }, visibleAiTags.length > 0 ? visibleAiTags.map(tag => React.createElement("span", {
    className: "tag ai-tag",
    key: tag.id || tag.tag
  }, React.createElement(Icon, {
    name: "zap",
    size: 11
  }), " ", tag.tag, w.isSupabaseRow && window.removeFlowMateAiTag && React.createElement("button", {
    type: "button",
    className: "ai-tag__remove",
    onClick: () => removeAiTag(tag),
    disabled: pending,
    "aria-label": `Remove ${tag.tag}`
  }, React.createElement(Icon, {
    name: "x",
    size: 10
  }), React.createElement("span", null, "Remove tag")))) : React.createElement("span", {
    className: "muted"
  }, "No AI tags"), React.createElement("button", {
    type: "button",
    className: "btn btn--xs btn--secondary",
    onClick: addAiTag,
    disabled: pending || !w.isSupabaseRow || !window.addFlowMateAiTag
  }, React.createElement(Icon, {
    name: "plus"
  }), " Add AI Tag")))))), w.queueReason && React.createElement("div", {
    className: "card"
  }, React.createElement("div", {
    className: "card__head"
  }, React.createElement("span", {
    className: "card__title"
  }, "Assignment reason")), React.createElement("div", {
    className: "card__body"
  }, React.createElement("div", {
    className: "reason-box"
  }, w.queueReason))), w.urgentReason && React.createElement("div", {
    className: "card"
  }, React.createElement("div", {
    className: "card__head"
  }, React.createElement("span", {
    className: "card__title"
  }, "Urgent reason")), React.createElement("div", {
    className: "card__body"
  }, React.createElement("div", {
    className: "reason-box reason-box--queued"
  }, w.urgentReason))))));
}
Object.assign(window, {
  MyWorkScreen,
  CreateScreen,
  DetailScreen
});
