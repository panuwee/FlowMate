/* AUTO-GENERATED from screens-a.jsx by build-github.cjs. Do not edit; edit the .jsx and re-run `npm run build:github`. */
const {
  useState,
  useEffect,
  useRef
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
  const [transitionPending, setTransitionPending] = useState({});
  const transitionPendingRef = useRef({});
  async function loadMyWorkRows(isAlive = () => true) {
    if (!window.loadFlowMateMyWorkRows) {
      setSourceRows([]);
      setLoadState({
        status: "error",
        message: "Live data unavailable: Supabase list loader is not ready."
      });
      return;
    }
    try {
      const rows = await window.loadFlowMateMyWorkRows();
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
    if (!window.canFlowMateTransitionWorkItem?.(work, nextStatus, window.FLOWMATE_CURRENT_USER || {}, window.MEMBERS_BY_ID || {})) {
      setLoadState({
        status: "live",
        message: "This action is not available for your role or the current status."
      });
      return;
    }
    if (transitionPendingRef.current[work.id]) return;
    transitionPendingRef.current[work.id] = true;
    setTransitionPending(current => ({
      ...current,
      [work.id]: true
    }));
    try {
      const options = {
        currentStatus: work.status
      };
      if (nextStatus === "review") {
        const deliveryLink = await window.flowmatePrompt({
          title: "Submit for review",
          label: "Review Link",
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
      await window.transitionFlowMateWorkStatus(work.id, nextStatus, options);
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
    } finally {
      transitionPendingRef.current[work.id] = false;
      setTransitionPending(current => ({
        ...current,
        [work.id]: false
      }));
    }
  }
  const rawMine = window.getFlowMateMyWorkRows ? window.getFlowMateMyWorkRows(sourceRows, currentUser, window.MEMBERS || [], searchQuery) : sourceRows.filter(w => meIds.includes(w.assignee) && !["delivered", "cancelled", "done"].includes(w.status) && window.matchesFlowMateSearch(w, searchQuery));
  const mine = window.sortFlowMateMyWorkRows ? window.sortFlowMateMyWorkRows(window.filterFlowMateMyWorkByStatus(rawMine, filterStatus)) : rawMine;
  const overdue = mine.filter(w => w.overdue || w.dueDelta != null && w.dueDelta < 0);
  const overdueIds = new Set(overdue.map(w => w.id));
  const blocked = mine.filter(w => w.status === "blocked" && !overdueIds.has(w.id));
  const blockedIds = new Set(blocked.map(w => w.id));
  const scheduleRisk = mine.filter(w => {
    if (overdueIds.has(w.id) || blockedIds.has(w.id)) return false;
    const codes = new Set((window.getFlowMateAssignmentWarnings ? window.getFlowMateAssignmentWarnings(w) : []).map(warning => warning.code));
    return codes.has("review_buffer_risk");
  });
  const scheduleRiskIds = new Set(scheduleRisk.map(w => w.id));
  const dueToday = mine.filter(w => !overdueIds.has(w.id) && !blockedIds.has(w.id) && !scheduleRiskIds.has(w.id) && w.dueDelta === 0);
  const dueTodayIds = new Set(dueToday.map(w => w.id));
  const dueSoon = mine.filter(w => !overdueIds.has(w.id) && !blockedIds.has(w.id) && !scheduleRiskIds.has(w.id) && !dueTodayIds.has(w.id) && w.dueDelta != null && w.dueDelta > 0 && w.dueDelta <= 2);
  const dueSoonIds = new Set(dueSoon.map(w => w.id));
  const riskGroupIds = new Set([...overdueIds, ...blockedIds, ...scheduleRiskIds, ...dueTodayIds, ...dueSoonIds]);
  const inProgress = mine.filter(w => w.status === "in_progress" && !riskGroupIds.has(w.id));
  const assigned = mine.filter(w => w.status === "assigned" && !riskGroupIds.has(w.id));
  const review = mine.filter(w => w.status === "review" && !riskGroupIds.has(w.id));
  const activeGroupIds = new Set([...riskGroupIds, ...inProgress.map(w => w.id), ...assigned.map(w => w.id), ...review.map(w => w.id)]);
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
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short"
  }), " Bangkok."))), React.createElement("div", {
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
  }, scheduleRisk.length), React.createElement("div", {
    className: "stat__lbl"
  }, "Schedule risk")), React.createElement("div", {
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
    onCreativeTransition: handleCreativeTransition,
    transitionPending: transitionPending
  }), React.createElement(MyWorkGroup, {
    title: "Blocked",
    items: blocked,
    onOpen: onOpen,
    onQuickDone: handleQuickDone,
    onCreativeTransition: handleCreativeTransition,
    transitionPending: transitionPending
  }), React.createElement(MyWorkGroup, {
    title: "Schedule risk",
    items: scheduleRisk,
    onOpen: onOpen,
    onQuickDone: handleQuickDone,
    onCreativeTransition: handleCreativeTransition,
    transitionPending: transitionPending
  }), React.createElement(MyWorkGroup, {
    title: "Due today",
    items: dueToday,
    onOpen: onOpen,
    onQuickDone: handleQuickDone,
    onCreativeTransition: handleCreativeTransition,
    transitionPending: transitionPending
  }), React.createElement(MyWorkGroup, {
    title: "Due soon",
    items: dueSoon,
    onOpen: onOpen,
    onQuickDone: handleQuickDone,
    onCreativeTransition: handleCreativeTransition,
    transitionPending: transitionPending
  }), React.createElement(MyWorkGroup, {
    title: "In progress",
    items: inProgress,
    onOpen: onOpen,
    onQuickDone: handleQuickDone,
    onCreativeTransition: handleCreativeTransition,
    transitionPending: transitionPending
  }), React.createElement(MyWorkGroup, {
    title: "Assigned",
    items: assigned,
    onOpen: onOpen,
    onQuickDone: handleQuickDone,
    onCreativeTransition: handleCreativeTransition,
    transitionPending: transitionPending
  }), React.createElement(MyWorkGroup, {
    title: "In review by requester",
    items: review,
    onOpen: onOpen,
    onQuickDone: handleQuickDone,
    onCreativeTransition: handleCreativeTransition,
    transitionPending: transitionPending
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
  transitionPending = {},
  tone,
  compact
}) {
  if (!items.length) return null;
  const canTransition = (work, nextStatus) => Boolean(window.canFlowMateTransitionWorkItem?.(work, nextStatus, window.FLOWMATE_CURRENT_USER || {}, window.MEMBERS_BY_ID || {}));
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
  }, "ID"), React.createElement("th", null, "Title"), React.createElement("th", null, "Type"), React.createElement("th", null, "Status"), React.createElement("th", null, "Priority"), React.createElement("th", null, "Checklist"), React.createElement("th", null, "Due"), React.createElement("th", {
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
  }, React.createElement("div", null, w.title), React.createElement(AssignmentWarningBadges, {
    work: w,
    limit: 2
  })), React.createElement("td", null, React.createElement(TypePill, {
    type: w.type
  })), React.createElement("td", null, React.createElement(StatusBadge, {
    status: w.status
  })), React.createElement("td", null, React.createElement(PriorityBadge, {
    level: w.priority
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
  }, "Mark done"), w.type !== "quick" && w.status === "assigned" && canTransition(w, "in_progress") && React.createElement("button", {
    className: "btn btn--xs btn--secondary",
    disabled: Boolean(transitionPending[w.id]),
    onClick: () => onCreativeTransition && onCreativeTransition(w, "in_progress")
  }, React.createElement(Icon, {
    name: "play",
    size: 11
  }), " Start"), w.type !== "quick" && w.status === "in_progress" && canTransition(w, "review") && React.createElement("button", {
    className: "btn btn--xs btn--primary",
    disabled: Boolean(transitionPending[w.id]),
    onClick: () => onCreativeTransition && onCreativeTransition(w, "review")
  }, React.createElement(Icon, {
    name: "send",
    size: 11
  }), " Submit review"), w.type !== "quick" && w.status === "review" && React.createElement("button", {
    className: "btn btn--xs btn--ghost",
    disabled: true
  }, "Awaiting requester"), w.type !== "quick" && ["assigned", "in_progress", "review"].includes(w.status) && canTransition(w, "blocked") && React.createElement("button", {
    className: "btn btn--xs btn--danger",
    disabled: Boolean(transitionPending[w.id]),
    onClick: () => onCreativeTransition && onCreativeTransition(w, "blocked")
  }, React.createElement(Icon, {
    name: "block",
    size: 11
  }), " Block"), w.type !== "quick" && w.status === "blocked" && canTransition(w, "in_progress") && React.createElement("button", {
    className: "btn btn--xs btn--secondary",
    disabled: Boolean(transitionPending[w.id]),
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
  key: "facebook_esport",
  label: "FB eSport"
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
}, {
  key: "no_tag",
  label: "No Tag"
}];
const FLOWMATE_CREATIVE_FORMATS_BY_CHANNEL = {
  Facebook: ["1200x1200", "1200x1500"],
  "FB eSport": ["1200x1200", "1200x1500"],
  TikTok: ["1080x1920", "1200x1500"],
  Instagram: ["1200x1200", "1200x1500"],
  YouTube: ["1920x1080"],
  "In-game": ["custom"],
  Other: ["custom"],
  "No Tag": ["custom"]
};
const FLOWMATE_CREATIVE_FORMAT_LABELS = {
  "1200x1200": "1200×1200 (1:1)",
  "1200x1500": "1200×1500 (4:5)",
  "1080x1920": "1080×1920 (9:16)",
  "1920x1080": "1920×1080 (16:9)",
  custom: "Custom"
};
const FLOWMATE_CREATIVE_FORMAT_DISPLAY_ORDER = ["1200x1200", "1200x1500", "1080x1920", "1920x1080", "custom"];
const FLOWMATE_PUBLISH_TIME_OPTIONS = [{
  value: "",
  label: "N/A"
}, ...Array.from({
  length: 24
}, (_, hour) => {
  const value = `${String(hour).padStart(2, "0")}:00`;
  return {
    value,
    label: value
  };
})];
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
function isFlowMateNoTagDraft(draft) {
  const channels = normalizeFlowMateCreativeChannels(draft && draft.platforms);
  return channels.length === 1 && channels[0] === "No Tag";
}
function formatFlowMateCreativeChannels(value) {
  return normalizeFlowMateCreativeChannels(value).join(", ");
}
function normalizeFlowMateCreativeFormatKey(option) {
  if (typeof option === "string") return option.trim();
  if (!option || typeof option !== "object") return "";
  return String(option.key || option.value || option.formatKey || "").trim();
}
function getFlowMateCreativeFormatOptions(channelLabels) {
  const normalizedChannels = normalizeFlowMateCreativeChannels(channelLabels);
  const workflowMvp = typeof window !== "undefined" ? window.FlowMateWorkflowMvp : null;
  if (workflowMvp && typeof workflowMvp.getFormatOptionsForChannels === "function") {
    const workflowOptions = workflowMvp.getFormatOptionsForChannels(normalizedChannels);
    if (Array.isArray(workflowOptions)) {
      return Array.from(new Set(workflowOptions.map(normalizeFlowMateCreativeFormatKey).filter(Boolean)));
    }
  }
  return Array.from(new Set(normalizedChannels.flatMap(channelLabel => FLOWMATE_CREATIVE_FORMATS_BY_CHANNEL[channelLabel] || ["custom"])));
}
function isFlowMateCreativeFormatValid(formatKey, channelLabels) {
  const normalizedFormatKey = String(formatKey || "").trim();
  if (!normalizedFormatKey) return false;
  const normalizedChannels = normalizeFlowMateCreativeChannels(channelLabels);
  const workflowMvp = typeof window !== "undefined" ? window.FlowMateWorkflowMvp : null;
  if (workflowMvp && typeof workflowMvp.isFormatValidForChannels === "function") {
    return Boolean(workflowMvp.isFormatValidForChannels(normalizedFormatKey, normalizedChannels));
  }
  return getFlowMateCreativeFormatOptions(normalizedChannels).includes(normalizedFormatKey);
}
function getFlowMateCreativeFormatLabel(formatKey) {
  const normalizedFormatKey = String(formatKey || "").trim();
  const workflowMvp = typeof window !== "undefined" ? window.FlowMateWorkflowMvp : null;
  if (workflowMvp && typeof workflowMvp.formatLabel === "function") {
    const workflowLabel = workflowMvp.formatLabel(normalizedFormatKey);
    if (workflowLabel) return workflowLabel;
  }
  return FLOWMATE_CREATIVE_FORMAT_LABELS[normalizedFormatKey] || normalizedFormatKey;
}
function normalizeFlowMateCreativeFormatKeys(value) {
  const rawValues = Array.isArray(value) ? value : String(value || "").split(",").map(item => item.trim()).filter(Boolean);
  return Array.from(new Set(rawValues.map(normalizeFlowMateCreativeFormatKey).filter(Boolean)));
}
function getFlowMateSelectedCreativeFormatKeys(draft) {
  const structured = normalizeFlowMateCreativeFormatKeys(draft && draft.sizeFormats);
  if (structured.length) return structured;
  return normalizeFlowMateCreativeFormatKeys(draft && draft.sizeFormat);
}
const FLOWMATE_NORMAL_CREATIVE_CAPACITY_PER_DAY = 8;
const FLOWMATE_CREATIVE_CAPACITY_PER_BUCKET = 4;
const FLOWMATE_MIDDAY_CUTOFF_HOUR = 12;
const FLOWMATE_PRODUCTION_CUTOFF_HOUR = 15;
const FLOWMATE_ASSET_FIRST_DRAFT_WORKING_DAYS = 4;
const FLOWMATE_ASSET_FINAL_APPROVED_WORKING_DAYS = 2;
const FLOWMATE_TH_COMPLETE_CALENDAR_YEARS = new Set([2025, 2026, 2027]);
const FLOWMATE_TH_HOLIDAY_DATES = new Set(["2025-01-01", "2025-02-12", "2025-04-07", "2025-04-14", "2025-04-15", "2025-05-01", "2025-05-05", "2025-05-12", "2025-06-02", "2025-06-03", "2025-07-10", "2025-07-28", "2025-08-11", "2025-08-12", "2025-10-13", "2025-10-23", "2025-12-05", "2025-12-10", "2025-12-31", "2026-01-01", "2026-01-02", "2026-03-03", "2026-04-06", "2026-04-13", "2026-04-14", "2026-04-15", "2026-05-01", "2026-05-04", "2026-06-01", "2026-06-03", "2026-07-28", "2026-07-29", "2026-08-12", "2026-10-13", "2026-10-23", "2026-12-07", "2026-12-10", "2026-12-31", "2027-01-01", "2027-02-22", "2027-04-06", "2027-04-13", "2027-04-14", "2027-04-15", "2027-05-03", "2027-05-04", "2027-05-20", "2027-06-03", "2027-07-19", "2027-07-28", "2027-08-12", "2027-10-13", "2027-10-25", "2027-12-06", "2027-12-10", "2027-12-31"]);
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
    const dateKey = date.toISOString().slice(0, 10);
    if (day !== 0 && day !== 6 && !FLOWMATE_TH_HOLIDAY_DATES.has(dateKey)) remaining -= 1;
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
  return subtractFlowMateWorkingDays(nextLaunchDate, FLOWMATE_ASSET_FIRST_DRAFT_WORKING_DAYS);
}
function getFlowMateFinalApprovedDateForLaunchDate(launchDate) {
  const nextLaunchDate = clampFlowMateDateToToday(launchDate);
  return subtractFlowMateWorkingDays(nextLaunchDate, FLOWMATE_ASSET_FINAL_APPROVED_WORKING_DAYS);
}
function getFlowMateEarliestCreativeDraftDate(draft, now = new Date()) {
  const productionStart = getFlowMateProductionStartBucket(now);
  let remainingBuckets = Math.max(1, Math.ceil(getFlowMateCreativeEffortEstimate(draft) / FLOWMATE_CREATIVE_CAPACITY_PER_BUCKET));
  let cursorDate = productionStart.date;
  remainingBuckets -= productionStart.half === "pm" ? 1 : 2;
  while (remainingBuckets > 0) {
    cursorDate = getFlowMateNextWorkingDay(addFlowMateCalendarDays(cursorDate, 1));
    remainingBuckets -= 2;
  }
  return cursorDate;
}
function getFlowMateAutoCreativeDraftDate(draft) {
  const launchDate = clampFlowMateDateToToday(draft?.launchDate);
  return getFlowMateDraftDateForLaunchDate(launchDate);
}
function getFlowMateNextWorkingDay(dateValue) {
  const parts = String(dateValue || "").slice(0, 10).split("-").map(part => Number(part));
  if (parts.length !== 3 || parts.some(part => !Number.isFinite(part))) return getFlowMateTodayDateKey();
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (Number.isNaN(date.getTime())) return getFlowMateTodayDateKey();
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date.toISOString().slice(0, 10);
}
function getFlowMateProductionStartBucket(now = new Date()) {
  const todayDate = getFlowMateTodayDateKey();
  const isAfterCutoff = now.getHours() > FLOWMATE_PRODUCTION_CUTOFF_HOUR || now.getHours() === FLOWMATE_PRODUCTION_CUTOFF_HOUR && (now.getMinutes() > 0 || now.getSeconds() > 0);
  const isAfterMidday = now.getHours() >= FLOWMATE_MIDDAY_CUTOFF_HOUR;
  const startDate = getFlowMateNextWorkingDay(isAfterCutoff ? addFlowMateCalendarDays(todayDate, 1) : todayDate);
  const todayIsWorkingDate = startDate === todayDate;
  return {
    date: startDate,
    half: todayIsWorkingDate && isAfterMidday && !isAfterCutoff ? "pm" : "am"
  };
}
function countFlowMateCapacityBucketsInclusive(startDate, startHalf, endDate) {
  const startValue = clampFlowMateDateToToday(startDate);
  const endValue = String(endDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endValue) || endValue < startValue) return 0;
  const startParts = startValue.split("-").map(part => Number(part));
  const endParts = endValue.split("-").map(part => Number(part));
  const cursor = new Date(Date.UTC(startParts[0], startParts[1] - 1, startParts[2]));
  const end = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2]));
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return 0;
  let bucketCount = 0;
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day >= 1 && day <= 5) {
      const dateKey = cursor.toISOString().slice(0, 10);
      bucketCount += dateKey === startValue && startHalf === "pm" ? 1 : 2;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return bucketCount;
}
function getFlowMateCreativeEffortForItem(assetSubtype, assetCount) {
  const typeKey = getFlowMateCreativeTypeOption(assetSubtype).key;
  const unitEffort = FLOWMATE_CREATIVE_UNIT_EFFORT[typeKey] || 4;
  return Math.max(1, Math.ceil(unitEffort * Math.max(1, Number(assetCount || 1))));
}
function getFlowMateCreativeEffortEstimate(draft) {
  let effort = getFlowMateCreativeEffortForItem(draft?.assetSubtype, draft?.assetCount);
  if (String(draft?.assetSubtype2 || "").trim()) {
    effort += getFlowMateCreativeEffortForItem(draft.assetSubtype2, draft.assetCount2);
  }
  return effort;
}
function getFlowMateCreativeTimePressure(draft) {
  const launchDate = clampFlowMateDateToToday(draft?.launchDate);
  const dueDate = draft?.dueDate || getFlowMateAutoCreativeDraftDate(draft);
  const productionStart = getFlowMateProductionStartBucket();
  const bucketCount = countFlowMateCapacityBucketsInclusive(productionStart.date, productionStart.half, dueDate);
  const workingDays = bucketCount / 2;
  const normalCapacity = bucketCount * FLOWMATE_CREATIVE_CAPACITY_PER_BUCKET;
  const effort = getFlowMateCreativeEffortEstimate(draft);
  const reviewTargetDate = getFlowMateDraftDateForLaunchDate(launchDate);
  const earliestProductionDate = getFlowMateEarliestCreativeDraftDate(draft);
  const assetCount = Math.max(1, Number(draft?.assetCount || 1));
  const hasSecondItem = Boolean(String(draft?.assetSubtype2 || "").trim());
  const skillLabel = [getFlowMateCreativeTypeLabel(draft?.assetSubtype), hasSecondItem ? getFlowMateCreativeTypeLabel(draft.assetSubtype2) : ""].filter(Boolean).join(" + ");
  const assetCountLabel = hasSecondItem ? `${assetCount} + ${Math.max(1, Number(draft?.assetCount2 || 1))}` : String(assetCount);
  return {
    effort,
    workingDays,
    normalCapacity,
    assetCount: assetCountLabel,
    skillLabel,
    launchDate,
    dueDate,
    productionStart,
    bucketCount,
    isInsufficient: effort > normalCapacity,
    reviewTargetDate,
    earliestProductionDate,
    isReviewBufferAtRisk: dueDate > reviewTargetDate,
    requiresUrgent: effort > normalCapacity || dueDate > reviewTargetDate
  };
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
  const creativeType2 = String(nextDraft.assetSubtype2 || "").trim() ? getFlowMateCreativeTypeOption(nextDraft.assetSubtype2) : null;
  const launchDate = clampFlowMateDateToToday(nextDraft.launchDate);
  const normalizedChannels = normalizeFlowMateCreativeChannels(nextDraft.platforms);
  const nextIsNoTag = normalizedChannels.length === 1 && normalizedChannels[0] === "No Tag";
  const assetCountNumber = Number(nextDraft.assetCount);
  const assetCount = Number.isInteger(assetCountNumber) && assetCountNumber >= 1 ? String(assetCountNumber) : "1";
  const assetCount2Number = Number(nextDraft.assetCount2);
  const assetCount2 = creativeType2 && Number.isInteger(assetCount2Number) && assetCount2Number >= 1 ? String(assetCount2Number) : String(nextDraft.assetCount2 || "");
  const normalizedDraft = {
    ...nextDraft,
    requesterTeam: getDefaultRequesterTeam(),
    assetType: creativeType.assetType,
    assetSubtype: creativeType.key,
    assetCount,
    assetType2: creativeType2 ? creativeType2.assetType : "",
    assetSubtype2: creativeType2 ? creativeType2.key : "",
    assetCount2,
    platforms: normalizedChannels.join(", "),
    publishTime: nextIsNoTag ? "" : normalizeWholeHourTime(nextDraft.publishTime) || getFlowMateLegacyPublishTimeOption(nextDraft.publishTime),
    launchDate
  };
  return {
    ...normalizedDraft,
    dueDate: getFlowMateAutoCreativeDraftDate(normalizedDraft),
    finalApprovedDueDate: nextIsNoTag ? "" : getFlowMateFinalApprovedDateForLaunchDate(launchDate)
  };
}
function normalizeWholeHourTime(value) {
  const text = String(value || "").trim();
  const match = text.match(/^((?:[01]\d|2[0-3]):00)(?::00)?$/);
  return match ? match[1] : "";
}
function normalizeFlowMatePublishTimeInput(value) {
  return normalizeWholeHourTime(value);
}
function getFlowMateLegacyPublishTimeOption(value) {
  const text = String(value || "").trim();
  return text && !normalizeWholeHourTime(text) ? text : "";
}
const FLOWMATE_INVALID_BRIEF_LINK_MESSAGE = "กรุณาใส่ Brief Link ที่ถูกต้อง";
function isFlowMateValidHttpUrl(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  try {
    const url = new URL(text);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch (error) {
    return false;
  }
}
const FLOWMATE_CREATE_DRAFT_FIELDS = {
  quick: ["title", "note", "requesterTeam", "projectName", "assigneeUserId", "assigneeOtherName", "dueDate", "launchDate", "priority"],
  creative: ["title", "requesterTeam", "campaignName", "productEvent", "assetType", "assetSubtype", "assetCount", "assetType2", "assetSubtype2", "assetCount2", "platforms", "sizeFormats", "sizeFormat", "briefLink", "briefNote", "referenceLink", "priority", "urgentReason", "dueDate", "launchDate", "publishTime", "marketingPlanContentItemId", "marketingPlanOriginalBriefLink", "marketingPlanProductEvent", "marketingPlanCampaignName"]
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
    assetType2: "",
    assetSubtype2: "",
    assetCount2: "",
    platforms: "Instagram",
    sizeFormats: ["1200x1200", "1200x1500"],
    sizeFormat: "1200x1200",
    briefLink: "",
    briefNote: "",
    referenceLink: "",
    priority: "normal",
    urgentReason: "",
    dueDate: getFlowMateDraftDateForLaunchDate(todayDate),
    finalApprovedDueDate: getFlowMateFinalApprovedDateForLaunchDate(todayDate),
    launchDate: todayDate,
    publishTime: "",
    marketingPlanContentItemId: "",
    marketingPlanOriginalBriefLink: "",
    marketingPlanProductEvent: "",
    marketingPlanCampaignName: ""
  };
}
function getDefaultRequesterTeam() {
  return window.normalizeFlowMateRequesterTeam?.(window.FLOWMATE_CURRENT_USER?.requester_team) || TEAMS[0];
}
function getFlowMateCreateDraftPayload(kind, draft, fallback = {}) {
  const fields = FLOWMATE_CREATE_DRAFT_FIELDS[kind] || [];
  return fields.reduce((payload, field) => {
    const value = Object.prototype.hasOwnProperty.call(draft || {}, field) ? draft[field] : fallback[field];
    payload[field] = Array.isArray(value) ? value.slice() : typeof value === "string" ? value : "";
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
  function requireTime(field, message) {
    if (!normalizeFlowMatePublishTimeInput(row[field])) {
      errors[field] = message;
    }
  }
  function requireHttpUrl(field, message) {
    const value = String(row[field] || "").trim();
    if (value && !isFlowMateValidHttpUrl(value)) {
      errors[field] = message;
    }
  }
  if (mode === "quick") {
    requireField("requesterTeam", "Requester team is required.");
    requireField("projectName", "Project / campaign is required.");
    requireField("dueDate", "1st Review / Draft is required.");
    requireField("launchDate", "Launch Date / Deadline is required.");
    requireNotPast("dueDate", "1st Review / Draft cannot be before today.");
    requireNotPast("launchDate", "Launch Date / Deadline cannot be before today.");
    return errors;
  }
  requireField("campaignName", "Campaign is required.");
  requireField("productEvent", "Product / Event is required.");
  requireField("assetSubtype", "Type / Skill is required.");
  requirePositiveInteger("assetCount", "Asset Count must be at least 1.");
  if (String(row.assetSubtype2 || "").trim()) {
    requirePositiveInteger("assetCount2", "Asset Count 2 must be at least 1 when Type / Skill 2 is selected.");
  } else if (String(row.assetCount2 || "").trim()) {
    errors.assetSubtype2 = "Type / Skill 2 is required when Asset Count 2 is provided.";
  }
  requireField("platforms", "Channel Tag is required.");
  const selectedFormatKeys = getFlowMateSelectedCreativeFormatKeys(row);
  if (selectedFormatKeys.length === 0) {
    errors.sizeFormat = "Select at least one Size / format.";
  } else if (selectedFormatKeys.some(formatKey => !isFlowMateCreativeFormatValid(formatKey, normalizeFlowMateCreativeChannels(row.platforms)))) {
    errors.sizeFormat = "Choose a Size / format that is valid for the selected Channel Tag(s).";
  }
  requireField("briefLink", "Brief link is required.");
  requireHttpUrl("briefLink", FLOWMATE_INVALID_BRIEF_LINK_MESSAGE);
  requireField("priority", "Priority is required.");
  requireField("dueDate", "1st Draft is required.");
  requireField("launchDate", "Launch Date / Deadline is required.");
  const launchCalendarYear = Number(String(row.launchDate || "").slice(0, 4));
  if (Number.isInteger(launchCalendarYear) && !FLOWMATE_TH_COMPLETE_CALENDAR_YEARS.has(launchCalendarYear)) {
    errors.launchDate = `Thai holiday calendar for ${launchCalendarYear} is not available. Ask an administrator to review that year before creating this request.`;
  }
  if (String(row.publishTime || "").trim() && !normalizeWholeHourTime(row.publishTime)) {
    errors.publishTime = "Publish Time must be N/A or a whole hour.";
  }
  requireNotPast("launchDate", "Launch Date / Deadline cannot be before today.");
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
function getFlowMateCreativeRequestDetailUrl(displayId) {
  if (!displayId) return "";
  return `${window.location.origin}${window.location.pathname}#detail/${displayId}`;
}
async function syncMarketingPlanBriefLinkAfterCreativeSubmit(submissionDraft, created) {
  if (!submissionDraft || !submissionDraft.marketingPlanContentItemId) return null;
  if (String(submissionDraft.marketingPlanOriginalBriefLink || "").trim()) return null;
  if (!window.updateMarketingPlanWorkingSheetBriefLinkFromCreativeRequest) return null;
  const displayId = window.getFlowMateCreatedDisplayId(created);
  const flowMateWorkItemId = window.getFlowMateCreatedUuid ? window.getFlowMateCreatedUuid(created) : "";
  const detailUrl = getFlowMateCreativeRequestDetailUrl(displayId);
  if (!detailUrl) return null;
  return window.updateMarketingPlanWorkingSheetBriefLinkFromCreativeRequest(submissionDraft.marketingPlanContentItemId, detailUrl, flowMateWorkItemId);
}
function CreateScreen({
  onNav,
  onOpen,
  initialMode = "creative",
  product = "flowmate"
}) {
  const isTaskAssignProduct = product === "task-assign";
  const [mode, setMode] = useState(() => isTaskAssignProduct || initialMode === "quick" ? "quick" : "creative");
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [createAlert, setCreateAlert] = useState("");
  const [assigneeOptions, setAssigneeOptions] = useState(FLOWMATE_ASSIGNEE_FALLBACK);
  function withCreativeDraftTitle(draftInput) {
    const draft = normalizeFlowMateCreativeDraft(draftInput);
    return {
      ...draft,
      title: window.buildFlowMateTemplateTitle({
        launchDate: draft.launchDate,
        requesterTeam: draft.requesterTeam,
        projectName: draft.campaignName,
        productEvent: draft.productEvent
      })
    };
  }
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
    return withCreativeDraftTitle(readFlowMateCreateDraft("creative", getDefaultCreativeDraft()));
  });
  function resetSubmittedDraft() {
    if (mode === "quick") {
      const draft = normalizeFlowMateQuickDraft(getDefaultQuickDraft());
      setQuickDraft({
        ...draft,
        title: window.buildFlowMateTemplateTitle({
          launchDate: draft.launchDate,
          requesterTeam: draft.requesterTeam,
          projectName: draft.projectName
        })
      });
      return;
    }
    setCreativeDraft(withCreativeDraftTitle(getDefaultCreativeDraft()));
  }
  useEffect(() => {
    function onExternalCreateDraftUpdated(event) {
      const detail = event && event.detail ? event.detail : {};
      if (detail.mode !== "creative") return;
      const withTitle = withCreativeDraftTitle(detail.draft || getDefaultCreativeDraft());
      setCreativeDraft(withTitle);
      saveFlowMateCreateDraft("creative", withTitle);
      setMode("creative");
      setSubmitted(false);
      setResult(null);
      setValidationErrors({});
      setCreateAlert("");
    }
    window.addEventListener("flowmate:create-draft-updated", onExternalCreateDraftUpdated);
    return () => window.removeEventListener("flowmate:create-draft-updated", onExternalCreateDraftUpdated);
  }, []);
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
    if (isTaskAssignProduct || initialMode === "quick" || initialMode === "creative") {
      switchCreateMode(isTaskAssignProduct ? "quick" : initialMode);
    }
  }, [initialMode, isTaskAssignProduct]);
  async function openCreatedDetail(created, id) {
    const detailId = id || window.getFlowMateCreatedDisplayId(created);
    if (!detailId) {
      throw new Error("Create succeeded, but the response did not include a work item ID.");
    }
    if (!window.loadFlowMateWorkItemById) {
      throw new Error(`Create succeeded for ${detailId}, but the detail loader is not ready.`);
    }
    if (typeof onOpen !== "function") {
      throw new Error(`Create succeeded for ${detailId}, but detail navigation is not ready.`);
    }
    const createdRow = await window.loadFlowMateWorkItemById(detailId, {
      includeArchived: false
    });
    if (!createdRow) {
      throw new Error(`Create succeeded for ${detailId}, but the detail row could not be loaded.`);
    }
    window.flowmateSelectedWorkItem = createdRow;
    onOpen(detailId);
  }
  async function handleSubmit() {
    if (isSubmitting) return;
    const activeDraft = mode === "quick" ? quickDraft : creativeDraft;
    const submissionDraft = activeDraft;
    const nextValidationErrors = getFlowMateCreateValidationErrors(mode, activeDraft);
    if (Object.keys(nextValidationErrors).length > 0) {
      const hasInvalidBriefLink = nextValidationErrors.briefLink === FLOWMATE_INVALID_BRIEF_LINK_MESSAGE;
      if (hasInvalidBriefLink && window.flowmatePrompt) {
        await window.flowmatePrompt({
          title: "Brief Link ไม่ถูกต้อง",
          hideInput: true,
          note: FLOWMATE_INVALID_BRIEF_LINK_MESSAGE,
          confirmText: "OK"
        });
      }
      setValidationErrors(nextValidationErrors);
      setCreateAlert(hasInvalidBriefLink ? FLOWMATE_INVALID_BRIEF_LINK_MESSAGE : "Please correct the highlighted fields.");
      return;
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
        let marketingPlanSyncWarning = "";
        try {
          await syncMarketingPlanBriefLinkAfterCreativeSubmit(submissionDraft, created);
        } catch (syncError) {
          console.warn("[FlowMate Create] Marketing Plan link backfill failed:", syncError);
          marketingPlanSyncWarning = "Creative Request was created, but FlowMate could not link it back to Marketing Plan. Refresh Working Sheet before creating another brief for this row.";
        }
        const assignment = created.assignment || {};
        const result = assignment.result || "unassigned";
        const assignmentWarnings = window.parseFlowMateAssignmentWarnings ? window.parseFlowMateAssignmentWarnings({
          warnings: assignment.warnings || assignment.capacity_snapshot?.warnings || []
        }) : Array.isArray(assignment.warnings) ? assignment.warnings : [];
        nextResult = {
          kind: result === "assigned" ? "assigned" : result === "need_brief" ? "need_brief" : "unassigned",
          id: window.getFlowMateCreatedDisplayId(created),
          owner: assignment.owner_member_id || assignment.final_owner_member_id || (assignment.owner_code ? `m-${assignment.owner_code}` : null),
          ownerName: assignment.owner_name || assignment.owner_display_name || assignment.owner_code || "",
          effort: assignment.effort || null,
          reason: assignment.reason || "",
          warnings: assignmentWarnings,
          warning: marketingPlanSyncWarning
        };
      }
      clearFlowMateCreateDraft(mode);
      resetSubmittedDraft();
      if (nextResult.warning) {
        setResult({
          kind: "sync_warning",
          id: nextResult.id || "Saved",
          message: nextResult.warning
        });
        shouldShowResult = true;
        return;
      }
      try {
        await openCreatedDetail(created, nextResult.id);
        shouldShowResult = false;
      } catch (openError) {
        console.error("[FlowMate Create] open created detail failed:", openError);
        setResult({
          kind: "open_failed",
          id: nextResult.id || "Saved",
          message: nextResult.warning || openError.message || "Saved, but could not open the detail view."
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
  }, isTaskAssignProduct ? "Create an operational Quick Task. Function is set automatically from your signed-in account." : "Create a Creative Request for the assignment engine."))), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 16,
      marginBottom: 24
    }
  }, isTaskAssignProduct && React.createElement("button", {
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
  }, React.createElement("li", null, "No brief or routing review required"), React.createElement("li", null, "Self-assign or pick a teammate"), React.createElement("li", null, "Tracked separately from creative requests"))), !isTaskAssignProduct && React.createElement("button", {
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
  }, React.createElement("li", null, "Brief validation and structured request details"), React.createElement("li", null, "Owner is confirmed after routing review")))), React.createElement("div", {
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
    product: product,
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
  product = "task-assign",
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
    title: "Auto-filled from Launch Date / Deadline, Requester Team / Function, and Project / campaign."
  }), React.createElement("div", {
    className: "muted",
    style: {
      fontSize: 12,
      marginTop: 6
    }
  }, "Auto-filled from Launch Date / Deadline, Requester Team / Function, and Project / campaign.")), React.createElement("div", {
    className: "field field--full"
  }, React.createElement("label", {
    className: "field__label"
  }, "Note"), React.createElement("textarea", {
    className: "textarea",
    value: value.note,
    onChange: e => update("note", e.target.value),
    placeholder: "Short description - what needs doing, any context, link to the doc."
  })), product !== "task-assign" && React.createElement("div", {
    className: `field ${errors.requesterTeam ? "field--error" : ""}`
  }, React.createElement("label", {
    className: "field__label"
  }, "Requester Team / Function ", React.createElement("span", {
    className: "req"
  }, "*")), React.createElement("select", {
    className: "select",
    value: value.requesterTeam,
    onChange: e => update("requesterTeam", e.target.value)
  }, TEAMS.map(team => React.createElement("option", {
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
  }, "Launch Date / Deadline ", React.createElement("span", {
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
  const selectedCreativeType2Key = String(value.assetSubtype2 || "").trim();
  const legacyPublishTime = getFlowMateLegacyPublishTimeOption(value.publishTime);
  const todayDate = getFlowMateTodayDateKey();
  const [campaignOptions, setCampaignOptions] = useState(() => window.FLOWMATE_MARKETING_CAMPAIGNS || []);
  const [formatPrompt, setFormatPrompt] = useState("");
  const selectedChannels = normalizeFlowMateCreativeChannels(value.platforms);
  const isNoTag = isFlowMateNoTagDraft(value);
  const formatOptions = getFlowMateCreativeFormatOptions(selectedChannels);
  const selectedFormatKeys = getFlowMateSelectedCreativeFormatKeys(value);
  const invalidSelectedFormatKeys = selectedFormatKeys.filter(formatKey => !formatOptions.includes(formatKey));
  const formatDisplayOptions = Array.from(new Set([...FLOWMATE_CREATIVE_FORMAT_DISPLAY_ORDER, ...formatOptions, ...selectedFormatKeys]));
  const visibleFormatPrompt = formatPrompt || (invalidSelectedFormatKeys.length ? "The selected Size / format is not valid for the selected Channel Tag(s). Choose a valid option." : "");
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
    const applyCreativeMilestones = nextValue => ({
      ...nextValue,
      dueDate: getFlowMateAutoCreativeDraftDate(nextValue),
      finalApprovedDueDate: isFlowMateNoTagDraft(nextValue) ? "" : getFlowMateFinalApprovedDateForLaunchDate(nextValue.launchDate)
    });
    if (field === "assetSubtype") {
      const nextType = getFlowMateCreativeTypeOption(next);
      onChange(applyCreativeMilestones({
        ...value,
        assetType: nextType.assetType,
        assetSubtype: nextType.key
      }));
      return;
    }
    if (field === "assetSubtype2") {
      if (!next) {
        onChange(applyCreativeMilestones({
          ...value,
          assetType2: "",
          assetSubtype2: "",
          assetCount2: ""
        }));
        return;
      }
      const nextType = getFlowMateCreativeTypeOption(next);
      onChange(applyCreativeMilestones({
        ...value,
        assetType2: nextType.assetType,
        assetSubtype2: nextType.key,
        assetCount2: value.assetCount2 || "1"
      }));
      return;
    }
    if (field === "launchDate") {
      const nextLaunchDate = clampFlowMateDateToToday(next);
      onChange(applyCreativeMilestones({
        ...value,
        launchDate: nextLaunchDate
      }));
      return;
    }
    const nextValue = {
      ...value,
      [field]: next
    };
    onChange(["assetCount", "assetCount2"].includes(field) ? applyCreativeMilestones(nextValue) : nextValue);
  }
  function toggleChannel(channelLabel) {
    const currentChannels = normalizeFlowMateCreativeChannels(value.platforms);
    const nextChannels = channelLabel === "No Tag" ? ["No Tag"] : currentChannels.filter(channel => channel !== "No Tag").includes(channelLabel) ? currentChannels.filter(channel => channel !== "No Tag" && channel !== channelLabel) : [...currentChannels.filter(channel => channel !== "No Tag"), channelLabel];
    const normalizedNextChannels = nextChannels.length ? nextChannels : [channelLabel];
    const nextIsNoTag = normalizedNextChannels.length === 1 && normalizedNextChannels[0] === "No Tag";
    const nextValue = {
      ...value,
      platforms: normalizedNextChannels.join(", "),
      publishTime: nextIsNoTag ? "" : value.publishTime,
      finalApprovedDueDate: nextIsNoTag ? "" : getFlowMateFinalApprovedDateForLaunchDate(value.launchDate)
    };
    const nextFormatKeys = getFlowMateCreativeFormatOptions(normalizedNextChannels);
    nextValue.sizeFormats = nextFormatKeys;
    nextValue.sizeFormat = nextFormatKeys[0] || "";
    setFormatPrompt(nextFormatKeys.length ? "Size / format updated automatically from the selected Channel Tags." : "");
    onChange(nextValue);
  }
  function toggleFormat(formatKey) {
    if (!formatOptions.includes(formatKey)) return;
    const nextFormatKeys = selectedFormatKeys.includes(formatKey) ? selectedFormatKeys.filter(key => key !== formatKey) : [...selectedFormatKeys, formatKey];
    setFormatPrompt("");
    onChange({
      ...value,
      sizeFormats: nextFormatKeys,
      sizeFormat: nextFormatKeys[0] || ""
    });
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
    title: "Auto-filled from Launch Date / Deadline, your account team, Campaign, and Product / Event."
  }), React.createElement("div", {
    className: "muted",
    style: {
      fontSize: 12,
      marginTop: 6
    }
  }, "Auto-filled from Launch Date / Deadline, your account team, Campaign, and Product / Event.")), React.createElement("div", {
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
    className: `field ${errors.assetSubtype2 ? "field--error" : ""}`
  }, React.createElement("label", {
    className: "field__label"
  }, "Type / Skill 2"), React.createElement("select", {
    className: "select",
    value: selectedCreativeType2Key,
    onChange: e => update("assetSubtype2", e.target.value)
  }, React.createElement("option", {
    value: ""
  }, "No second item"), FLOWMATE_CREATIVE_TYPE_OPTIONS.map(option => React.createElement("option", {
    key: option.key,
    value: option.key
  }, option.label))), errors.assetSubtype2 && React.createElement("div", {
    className: "field__error"
  }, errors.assetSubtype2)), React.createElement("div", {
    className: `field ${errors.assetCount2 ? "field--error" : ""}`
  }, React.createElement("label", {
    className: "field__label"
  }, "Asset Count 2 ", selectedCreativeType2Key && React.createElement("span", {
    className: "req"
  }, "*")), React.createElement("input", {
    className: "input",
    type: "number",
    min: "1",
    step: "1",
    value: value.assetCount2 || "",
    onChange: e => update("assetCount2", e.target.value),
    placeholder: selectedCreativeType2Key ? "1" : "Optional",
    disabled: !selectedCreativeType2Key
  }), errors.assetCount2 && React.createElement("div", {
    className: "field__error"
  }, errors.assetCount2)), React.createElement("div", {
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
    "data-testid": `creative-channel-${channel.key.replace("_", "-")}`,
    checked: selectedChannels.includes(channel.label),
    onChange: () => toggleChannel(channel.label)
  }), React.createElement("span", null, channel.label)))), errors.platforms && React.createElement("div", {
    className: "field__error"
  }, errors.platforms)), React.createElement("div", {
    className: `field ${errors.sizeFormat || visibleFormatPrompt ? "field--error" : ""}`,
    "data-testid": "creative-format-field"
  }, React.createElement("label", {
    className: "field__label"
  }, "Size / format ", React.createElement("span", {
    className: "req"
  }, "*")), React.createElement("div", {
    className: "check-row",
    "data-testid": "creative-format-checkboxes"
  }, formatDisplayOptions.map(formatKey => {
    const isAvailable = formatOptions.includes(formatKey);
    return React.createElement("label", {
      key: formatKey,
      className: `check-pill${isAvailable ? "" : " is-disabled"}`
    }, React.createElement("input", {
      type: "checkbox",
      "data-testid": `creative-format-${formatKey}`,
      checked: selectedFormatKeys.includes(formatKey),
      disabled: !isAvailable,
      onChange: () => toggleFormat(formatKey)
    }), React.createElement("span", null, getFlowMateCreativeFormatLabel(formatKey)));
  })), React.createElement("div", {
    className: "muted",
    style: {
      fontSize: 12,
      marginTop: 6
    }
  }, "Valid formats are selected automatically from Channel Tags. Uncheck any format that is not required."), visibleFormatPrompt && React.createElement("div", {
    className: "field__error",
    "data-testid": "creative-format-prompt"
  }, visibleFormatPrompt), errors.sizeFormat && React.createElement("div", {
    className: "field__error",
    "data-testid": "creative-format-error"
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
    className: "field"
  }, React.createElement("label", {
    className: "field__label"
  }, "Reference link"), React.createElement("input", {
    className: "input",
    value: value.referenceLink,
    onChange: e => update("referenceLink", e.target.value),
    placeholder: "Optional - Figma / mood board / past asset"
  })), React.createElement("div", {
    className: "field field--full"
  }, React.createElement("label", {
    className: "field__label"
  }, "Brief Note"), React.createElement("textarea", {
    className: "textarea",
    value: value.briefNote,
    onChange: e => update("briefNote", e.target.value),
    placeholder: "Short brief context, key message, references, or special instructions."
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
    className: `field ${errors.dueDate ? "field--error" : ""}`
  }, React.createElement("label", {
    className: "field__label"
  }, "Asset First Draft Due ", React.createElement("span", {
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
  }, "First Draft: T-4 Thai working days before Launch Date / Deadline."), errors.dueDate && React.createElement("div", {
    className: "field__error"
  }, errors.dueDate)), React.createElement("div", {
    className: "field"
  }, React.createElement("label", {
    className: "field__label"
  }, "Asset Final/Approved Due"), React.createElement("input", {
    className: "input",
    type: "date",
    value: isNoTag ? "" : value.finalApprovedDueDate || getFlowMateFinalApprovedDateForLaunchDate(value.launchDate),
    readOnly: true,
    disabled: isNoTag,
    min: todayDate
  }), React.createElement("div", {
    className: "muted",
    style: {
      fontSize: 12,
      marginTop: 6
    }
  }, isNoTag ? "Not required for No Tag" : "Final/Approved: T-2 Thai working days before Launch Date / Deadline.")), React.createElement("div", {
    className: `field ${errors.launchDate ? "field--error" : ""}`
  }, React.createElement("label", {
    className: "field__label"
  }, "Launch Date / Deadline ", React.createElement("span", {
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
    className: `field ${errors.publishTime ? "field--error" : ""}`
  }, React.createElement("label", {
    className: "field__label"
  }, "Publish Time"), React.createElement("select", {
    className: "select",
    value: isNoTag ? "" : value.publishTime,
    onChange: e => update("publishTime", e.target.value),
    disabled: isNoTag
  }, legacyPublishTime && !isNoTag && React.createElement("option", {
    value: legacyPublishTime,
    disabled: true
  }, legacyPublishTime), FLOWMATE_PUBLISH_TIME_OPTIONS.map(option => React.createElement("option", {
    key: option.value,
    value: option.value
  }, option.label))), React.createElement("div", {
    className: "muted",
    style: {
      fontSize: 12,
      marginTop: 6
    }
  }, isNoTag ? "Not required for No Tag" : ""), errors.publishTime && React.createElement("div", {
    className: "field__error"
  }, errors.publishTime)), React.createElement("div", {
    className: "field field--full"
  }, React.createElement("div", {
    className: "reason-box"
  }, React.createElement("strong", null, "Note - fields not collected:"), " preferred owner, manual effort, complexity. Assignment details are set after submission in the workflow."))));
}
function CreateResultScreen({
  result,
  onAgain,
  onNav
}) {
  const m = result.kind === "assigned" && result.owner ? MEMBERS_BY_ID[result.owner] : null;
  const resultWarningWork = {
    assignmentWarnings: result.warnings || []
  };
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
  }, result.kind === "assigned" && "Request submitted - assigned", result.kind === "unassigned" && "Request submitted - unassigned", result.kind === "need_brief" && "Request submitted - needs brief", result.kind === "quick_created" && "Quick task created", result.kind === "open_failed" && "Saved - detail did not open", result.kind === "sync_warning" && "Saved - Marketing Plan not linked", result.kind === "error" && "Could not save"), React.createElement("span", {
    className: "card__sub mono"
  }, result.id)), React.createElement("div", {
    className: "card__body"
  }, result.kind === "assigned" && React.createElement("div", {
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
  }, m?.name || result.ownerName || "Assigned owner"), React.createElement("div", {
    className: "muted",
    style: {
      fontSize: 12
    }
  }, m?.discipline || "Assigned by FlowMate")), React.createElement("div", {
    className: "spacer"
  })), React.createElement("div", {
    className: "muted",
    style: {
      fontSize: 12
    }
  }, "Owner selected from Skill, active work, Assigned queue, and leave."), result.reason && React.createElement("div", {
    className: "reason-box"
  }, result.reason), React.createElement(AssignmentWarningBadges, {
    work: resultWarningWork,
    limit: 8
  })), result.kind === "unassigned" && React.createElement("div", {
    className: "col",
    style: {
      gap: 12
    }
  }, React.createElement("div", {
    className: "muted"
  }, "Task created but needs manual assignment."), result.reason && React.createElement("div", {
    className: "reason-box reason-box--queued"
  }, result.reason), React.createElement("button", {
    type: "button",
    className: "btn btn--secondary",
    onClick: () => onNav("attention")
  }, React.createElement(Icon, {
    name: "alert"
  }), " Open Attention Needed")), result.kind === "need_brief" && React.createElement("div", {
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
  }, result.id), "."), result.kind === "sync_warning" && React.createElement("div", {
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
  const [directDetailItem, setDirectDetailItem] = useState(null);
  const [directDetailLoadState, setDirectDetailLoadState] = useState({
    status: "idle",
    message: ""
  });
  const directDetailMatch = directDetailItem && directDetailItem.id === id ? directDetailItem : null;
  const w = directDetailMatch || selected || null;
  const [actionMsg, setActionMsg] = useState(null);
  const [pending, setPending] = useState(false);
  const statusPendingRef = useRef(false);
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
  const [activeCreativeMembers, setActiveCreativeMembers] = useState([]);
  const [assigneeTargetMemberId, setAssigneeTargetMemberId] = useState(w && w.assignee || "");
  const [assigneeReason, setAssigneeReason] = useState("");
  useEffect(() => {
    if (!w) return;
    setDetailLinks(w.links || []);
    setDetailComments(w.comments || []);
    setDetailWatchers(w.watchers || []);
    setDetailAiTags(w.aiTags || []);
  }, [w && w.id, w && w.links, w && w.comments, w && w.watchers, w && w.aiTags]);
  useEffect(() => {
    let alive = true;
    if (!w || !w.isSupabaseRow || w.type === "quick") return () => {
      alive = false;
    };
    setAssigneeTargetMemberId(w.assignee || "");
    const membersPromise = window.loadFlowMateActiveCreativeMembers ? window.loadFlowMateActiveCreativeMembers() : Promise.resolve((window.MEMBERS || []).filter(member => member.active !== false && window.isFlowMateGdVeMember?.(member)));
    membersPromise.then(members => {
      if (!alive) return;
      setActiveCreativeMembers(members || []);
    }).catch(error => {
      if (!alive) return;
      console.warn("[FlowMate Detail] Assignment controls load failed:", error && error.message);
    });
    return () => {
      alive = false;
    };
  }, [w && w.id, w && w.assignee, w && w.isSupabaseRow, w && w.type]);
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
  useEffect(() => {
    let alive = true;
    const needsDetailHydration = Boolean(id && (!w || !w.detailHydrated) && window.loadFlowMateWorkItemById);
    if (!needsDetailHydration) {
      if (w?.detailHydrated) setDirectDetailLoadState({
        status: "idle",
        message: ""
      });
      return () => {
        alive = false;
      };
    }
    setDirectDetailLoadState({
      status: "loading",
      message: "Loading work item..."
    });
    window.loadFlowMateWorkItemById(id, {
      includeArchived: true
    }).then(row => {
      if (!alive) return;
      if (row) {
        window.flowmateSelectedWorkItem = row;
        setDirectDetailItem(row);
        setDirectDetailLoadState({
          status: "loaded",
          message: ""
        });
        return;
      }
      setDirectDetailLoadState({
        status: "error",
        message: "Work item not found."
      });
    }).catch(error => {
      if (!alive) return;
      console.warn("[FlowMate Detail] Direct detail load failed:", error && error.message);
      setDirectDetailLoadState({
        status: "error",
        message: "Work item load failed."
      });
    });
    return () => {
      alive = false;
    };
  }, [id, w && w.id]);
  useEffect(() => {
    function onExternalDetailRefresh(event) {
      if (!w || !w.isSupabaseRow) return;
      if (event && event.detail && event.detail.reason && event.detail.reason !== "marketing_plan_working_sheet_row_edited") return;
      refreshDetailItem();
    }
    window.addEventListener("flowmate:refresh-request", onExternalDetailRefresh);
    return () => window.removeEventListener("flowmate:refresh-request", onExternalDetailRefresh);
  }, [w && w.id, w && w.isSupabaseRow]);
  if (!w) {
    const isLoadingDirectDetail = directDetailLoadState.status === "loading";
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
    }, isLoadingDirectDetail ? "Loading work item" : "Work item not loaded")), React.createElement("div", {
      className: "card__body"
    }, isLoadingDirectDetail ? React.createElement("div", {
      className: "reason-box"
    }, "Loading ", React.createElement("span", {
      className: "mono"
    }, id), " from Supabase...") : React.createElement(React.Fragment, null, React.createElement("div", {
      className: "reason-box reason-box--need"
    }, "We could not load ", React.createElement("span", {
      className: "mono"
    }, id), " from Supabase. Check your connection and workspace access, then retry from ", React.createElement("strong", null, "List"), " or ", React.createElement("strong", null, "Board"), "."), React.createElement("div", {
      style: {
        marginTop: 12
      }
    }, React.createElement("button", {
      className: "btn btn--secondary",
      onClick: () => onNav("list")
    }, React.createElement(Icon, {
      name: "list"
    }), " Open list view"))))));
  }
  const owner = MEMBERS_BY_ID[w.assignee];
  const isLiveDetail = Boolean(w.isSupabaseRow);
  const visibleBriefNote = w.briefNote || w.note || "";
  const visibleChecklistItems = w.checklistItems || [];
  const watcherOptions = (window.MEMBERS || []).filter(member => member.userId);
  const hasCreativeDetails = w.type !== "quick" && Boolean(w.assetType || w.subtype || w.platform || w.channel || w.size || w.campaign || w.publishLabel || w.launchLabel);
  const currentUserId = window.FLOWMATE_CURRENT_USER?.id || null;
  const currentTeamMemberId = window.FLOWMATE_CURRENT_USER?.team_member_id || null;
  const isAdminUser = window.FLOWMATE_CURRENT_USER?.role === "admin";
  const isArchivedDetail = Boolean(w.archivedAt);
  const isRequesterUser = currentUserId === w.requesterUserId;
  const isOwnerUser = currentTeamMemberId === w.assignee || currentUserId === w.assigneeUserId || owner?.userId === currentUserId;
  const isActiveCreativeMember = activeCreativeMembers.some(member => member.id === currentTeamMemberId && member.active !== false);
  const canManageAssignee = Boolean(!isArchivedDetail && w.isSupabaseRow && w.type !== "quick" && (isAdminUser || isRequesterUser));
  const canSelfAssignUnassigned = Boolean(!isArchivedDetail && w.isSupabaseRow && w.type !== "quick" && w.status === "unassigned" && isActiveCreativeMember);
  const detailAssignmentWarnings = window.getFlowMateAssignmentWarnings ? window.getFlowMateAssignmentWarnings(w) : w.assignmentWarnings || [];
  const detailAttentionCodes = window.getFlowMateAttentionCategoryCodes ? window.getFlowMateAttentionCategoryCodes(w) : [];
  const canTransitionTo = nextStatus => Boolean(!isArchivedDetail && window.canFlowMateTransitionWorkItem?.(w, nextStatus, window.FLOWMATE_CURRENT_USER || {}, window.MEMBERS_BY_ID || {}));
  const canStatusTransition = ["in_progress", "review", "delivered", "blocked", "assigned", "cancelled"].some(canTransitionTo);
  const visibleLinks = detailLinks;
  const visibleComments = detailComments;
  const visibleWatchers = detailWatchers;
  const visibleAiTags = detailAiTags;
  const aiTagsUnavailable = Boolean(w.aiTagsUnavailable);
  const canRecheckBrief = Boolean(!isArchivedDetail && w.isSupabaseRow && w.status === "need_brief" && isRequesterUser);
  const visibleActivityEvents = (() => {
    const seenAssignmentResults = new Set();
    return (w.activityEvents || []).filter(event => {
      if (event.event_type !== "assignment_ran") return true;
      const metadata = getFlowMateActivityMetadata(event);
      const key = `${metadata.result || event.to_status || ""}|${metadata.reason || ""}`;
      if (seenAssignmentResults.has(key)) return false;
      seenAssignmentResults.add(key);
      return true;
    });
  })();
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
  function getFlowMateActivityMetadata(event) {
    const metadata = event && event.metadata;
    if (!metadata) return {};
    if (typeof metadata === "string") {
      try {
        return JSON.parse(metadata);
      } catch (error) {
        return {};
      }
    }
    return metadata;
  }
  function formatFlowMateActivityAt(dateValue) {
    if (!dateValue) return "";
    const date = new Date(dateValue);
    const dateLabel = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
    const timeLabel = date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    return `${dateLabel} ${timeLabel}`;
  }
  function formatFlowMateActivityEvent(event) {
    const metadata = getFlowMateActivityMetadata(event);
    const actor = event.actorName || "System";
    const when = formatFlowMateActivityAt(event.created_at);
    const suffix = when ? ` at ${when}` : "";
    const action = metadata.action || "";
    if (action === "add_link") {
      const addedFields = ["URL"];
      if (String(metadata.description || "").trim()) addedFields.push("Description");
      return `${actor} added ${addedFields.join(", ")} to this board${suffix}`;
    }
    if (action === "remove_link") return `${actor} removed a URL from this board${suffix}`;
    if (action === "add_ai_tag") return `${actor} added AI Tag${suffix}`;
    if (action === "remove_ai_tag") return `${actor} removed AI Tag${suffix}`;
    if (action === "add_comment" || event.event_type === "commented") return `${actor} added a comment${suffix}`;
    if (action === "add_watcher") return `${actor} added a watcher${suffix}`;
    if (event.event_type === "created") return `${actor} created this task${suffix}`;
    if (event.event_type === "assignment_ran") {
      const result = metadata.result ? `: ${metadata.result}` : "";
      const reason = String(metadata.reason || "").trim();
      return `Assignment engine ran${result}${reason ? ` - ${reason}` : ""}${suffix}`;
    }
    if (event.event_type === "status_changed" || event.from_status || event.to_status) {
      return `${actor} moved status from ${event.from_status || "-"} to ${event.to_status || "-"}${suffix}`;
    }
    return `${actor} updated this task${suffix}`;
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
  async function refreshDetailItem({
    throwOnError = false
  } = {}) {
    if (!w || !window.loadFlowMateWorkItemById) {
      const error = new Error("Live work item detail loader is unavailable.");
      if (throwOnError) throw error;
      return null;
    }
    try {
      const updated = await window.loadFlowMateWorkItemById(w.id, {
        includeArchived: true
      });
      if (!updated) throw new Error("Work item could not be reloaded after the change.");
      window.flowmateSelectedWorkItem = updated;
      setDirectDetailItem(updated);
      setDetailRefreshTick(tick => tick + 1);
      return updated;
    } catch (error) {
      console.warn("[FlowMate Detail] refresh after mutation failed:", error && error.message);
      if (throwOnError) throw error;
      return null;
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
    if (!canTransitionTo(nextStatus)) {
      setActionMsg({
        tone: "warn",
        text: "This action is not available for your role or the current status."
      });
      return;
    }
    if (statusPendingRef.current) return;
    statusPendingRef.current = true;
    setPending(true);
    try {
      const options = {
        currentStatus: w.status
      };
      if (nextStatus === "review") {
        const link = await window.flowmatePrompt({
          title: "Submit for review",
          label: "Review Link",
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
      statusPendingRef.current = false;
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
  async function submitAssigneeChange(event) {
    event.preventDefault();
    if (!canManageAssignee || !window.changeFlowMateCreativeAssignee) return;
    const reason = assigneeReason.trim();
    if (!reason) {
      setActionMsg({
        tone: "bad",
        text: "Reason is required when changing or clearing an assignee."
      });
      return;
    }
    setPending(true);
    try {
      await window.changeFlowMateCreativeAssignee(w.id, assigneeTargetMemberId || null, reason);
      await refreshDetailItem();
      setAssigneeReason("");
      setActionMsg({
        tone: "ok",
        text: assigneeTargetMemberId ? "Assignee updated." : "Task is now Unassigned."
      });
    } catch (error) {
      setActionMsg({
        tone: "bad",
        text: window.flowmateUserError(error, "Assignee change was rejected by the backend.")
      });
    } finally {
      setPending(false);
    }
  }
  async function selfAssignUnassigned() {
    if (!canSelfAssignUnassigned || !window.changeFlowMateCreativeAssignee) return;
    setPending(true);
    try {
      await window.changeFlowMateCreativeAssignee(w.id, currentTeamMemberId, "Self-assigned from Unassigned");
      await refreshDetailItem();
      setActionMsg({
        tone: "ok",
        text: "Task assigned to you."
      });
    } catch (error) {
      setActionMsg({
        tone: "bad",
        text: window.flowmateUserError(error, "Self-assignment was rejected by the backend.")
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
    if (!canTransitionTo("cancelled") || statusPendingRef.current) return;
    statusPendingRef.current = true;
    setPending(true);
    const reason = await window.flowmatePrompt({
      title: "Cancel work",
      label: "Cancel reason",
      multiline: true,
      required: true
    });
    if (!reason) {
      statusPendingRef.current = false;
      setPending(false);
      return;
    }
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
        text: window.flowmateUserError(error, "Cancel failed. Run supabase/rpc_quick_task.sql and supabase/collaboration_admin.sql, then refresh.")
      });
    } finally {
      statusPendingRef.current = false;
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
  async function runAdminRestore() {
    if (!isAdminUser || !isArchivedDetail || !window.restoreFlowMateArchivedWorkItem) return;
    const reason = await window.flowmatePrompt({
      title: "Restore archived work",
      label: "Restore reason",
      note: "The work keeps its current status and receives a 7-day archive grace period.",
      multiline: true,
      required: true,
      confirmText: "Restore"
    });
    if (!reason || !reason.trim()) return;
    setPending(true);
    try {
      await window.restoreFlowMateArchivedWorkItem(w.id, reason);
      window.dispatchEvent(new CustomEvent("flowmate:refresh-request", {
        detail: {
          reason: "admin_restore"
        }
      }));
      window.dispatchEvent(new CustomEvent("flowmate:refresh-counts"));
      try {
        await refreshDetailItem({
          throwOnError: true
        });
        setActionMsg({
          tone: "ok",
          text: `${w.id} restored with a 7-day archive grace period.`
        });
      } catch (refreshError) {
        setActionMsg({
          tone: "warn",
          text: `Restored in Supabase, but detail refresh failed. Reload this page to show the active item. ${window.flowmateUserError(refreshError, "")}`.trim()
        });
      }
    } catch (error) {
      setActionMsg({
        tone: "bad",
        text: window.flowmateUserError(error, "Admin restore failed.")
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
  }, isAdminUser && isArchivedDetail && React.createElement("button", {
    className: "btn btn--primary",
    onClick: runAdminRestore,
    disabled: pending
  }, React.createElement(Icon, {
    name: "rerun"
  }), " Restore archived work"), canTransitionTo("blocked") && ["assigned", "in_progress", "review"].includes(w.status) && React.createElement("button", {
    className: "btn btn--danger",
    onClick: () => runCreativeTransition("blocked"),
    disabled: pending
  }, React.createElement(Icon, {
    name: "block"
  }), " Block"), canTransitionTo("cancelled") && !["delivered", "cancelled"].includes(w.status) && React.createElement("button", {
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
  }), " Admin archive"), canTransitionTo("in_progress") && w.status === "assigned" && React.createElement("button", {
    className: "btn btn--primary",
    onClick: () => runCreativeTransition("in_progress"),
    disabled: pending
  }, React.createElement(Icon, {
    name: "play"
  }), " Start work"), canTransitionTo("review") && w.status === "in_progress" && React.createElement("button", {
    className: "btn btn--primary",
    onClick: () => runCreativeTransition("review"),
    disabled: pending
  }, React.createElement(Icon, {
    name: "send"
  }), " Submit review"), w.status === "review" && (canTransitionTo("in_progress") || canTransitionTo("delivered")) && React.createElement(React.Fragment, null, canTransitionTo("in_progress") && React.createElement("button", {
    className: "btn btn--secondary",
    onClick: () => runCreativeTransition("in_progress"),
    disabled: pending
  }, "Request changes"), canTransitionTo("delivered") && React.createElement("button", {
    className: "btn btn--primary",
    onClick: () => runCreativeTransition("delivered"),
    disabled: pending
  }, React.createElement(Icon, {
    name: "check"
  }), " Approve delivered")), canTransitionTo("in_progress") && w.status === "blocked" && React.createElement("button", {
    className: "btn btn--primary",
    onClick: () => runCreativeTransition("in_progress"),
    disabled: pending
  }, React.createElement(Icon, {
    name: "play"
  }), " Resume"), canRecheckBrief && React.createElement("button", {
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
  }), " Recheck brief"))), isArchivedDetail && React.createElement("div", {
    className: "reason-box reason-box--queued",
    style: {
      marginBottom: 12
    },
    role: "status"
  }, React.createElement("strong", null, "Archived work item."), " This detail is read-only. Archived ", w.archivedAt ? new Date(w.archivedAt).toLocaleString("en-GB") : "-", w.archiveReason ? ` — ${w.archiveReason}` : ""), actionMsg && React.createElement("div", {
    className: `reason-box ${actionMsg.tone === "bad" ? "reason-box--need" : actionMsg.tone === "warn" ? "reason-box--queued" : ""}`,
    style: {
      marginBottom: 12
    }
  }, actionMsg.text), detailAttentionCodes.length > 0 && React.createElement("section", {
    className: "card",
    "aria-labelledby": "detail-assignment-attention",
    style: {
      marginBottom: 16
    }
  }, React.createElement("div", {
    className: "card__head"
  }, React.createElement("span", {
    className: "card__title",
    id: "detail-assignment-attention"
  }, "Assignment attention")), React.createElement("div", {
    className: "card__body",
    style: {
      display: "grid",
      gap: 10
    }
  }, React.createElement(AssignmentWarningBadges, {
    work: w,
    limit: 12
  }), detailAssignmentWarnings.map(warning => React.createElement("div", {
    className: "reason-box reason-box--queued",
    key: warning.code
  }, React.createElement("strong", null, FLOWMATE_WARNING_LABEL[warning.code] || flowmatePrettifyToken(warning.code), ":"), " ", warning.message)), w.status === "unassigned" && React.createElement("div", {
    className: "reason-box reason-box--need"
  }, "Task is ready but needs manual assignment."), w.status === "blocked" && React.createElement("div", {
    className: "reason-box reason-box--need"
  }, w.blockReason || "Production is blocked."), w.needsSplit && React.createElement("div", {
    className: "reason-box reason-box--queued"
  }, "Combined deliverables need to be split for production tracking."))), React.createElement("div", {
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
  }, "Launch Date / Deadline"), React.createElement("div", {
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
  }, w.assetCount || 1)), w.subtype2 && React.createElement("div", {
    className: "meta-row"
  }, React.createElement("div", {
    className: "meta-row__lbl"
  }, "Type / Skill 2"), React.createElement("div", {
    className: "meta-row__val"
  }, getFlowMateCreativeTypeLabel(w.subtype2))), w.subtype2 && React.createElement("div", {
    className: "meta-row"
  }, React.createElement("div", {
    className: "meta-row__lbl"
  }, "Asset Count 2"), React.createElement("div", {
    className: "meta-row__val"
  }, w.assetCount2 || 1)), React.createElement("div", {
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
  }, "No links yet."), !isArchivedDetail && React.createElement("form", {
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
  }, "No comments yet."), !isArchivedDetail && React.createElement("form", {
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
  }, owner?.name || "Unassigned"))), canManageAssignee && React.createElement("form", {
    className: "reason-box",
    onSubmit: submitAssigneeChange,
    style: {
      display: "grid",
      gap: 8,
      marginBottom: 12
    },
    "aria-label": "Change creative assignee"
  }, React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Change assignee"), React.createElement("select", {
    className: "select",
    value: assigneeTargetMemberId,
    onChange: event => setAssigneeTargetMemberId(event.target.value),
    disabled: pending
  }, React.createElement("option", {
    value: ""
  }, "Unassigned"), activeCreativeMembers.map(member => React.createElement("option", {
    key: member.id,
    value: member.id
  }, member.name)))), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Reason ", React.createElement("span", {
    className: "req"
  }, "*")), React.createElement("input", {
    className: "input",
    value: assigneeReason,
    onChange: event => setAssigneeReason(event.target.value),
    placeholder: "Why is the owner changing?",
    required: true,
    disabled: pending
  })), React.createElement("button", {
    type: "submit",
    className: "btn btn--secondary",
    disabled: pending || !assigneeReason.trim()
  }, "Save assignee"), React.createElement("span", {
    className: "field__hint"
  }, "Active GD/VE members only. Backend permissions remain authoritative.")), !canManageAssignee && canSelfAssignUnassigned && React.createElement("div", {
    className: "reason-box",
    style: {
      display: "grid",
      gap: 8,
      marginBottom: 12
    }
  }, React.createElement("span", null, "This task is Unassigned. You may assign only yourself."), React.createElement("button", {
    type: "button",
    className: "btn btn--secondary",
    onClick: selfAssignUnassigned,
    disabled: pending
  }, "Assign to me")), React.createElement("div", {
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
  }, "No watchers"), !isArchivedDetail && React.createElement("form", {
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
  }, w.type === "quick" ? "1st Review / Draft" : "Asset First Draft Due"), React.createElement("div", {
    className: "meta-row__val"
  }, w.dueFullLabel || w.dueLabel || "-")), w.type === "creative" && React.createElement("div", {
    className: "meta-row"
  }, React.createElement("div", {
    className: "meta-row__lbl"
  }, "Asset Final/Approved Due"), React.createElement("div", {
    className: "meta-row__val"
  }, w.finalApprovedDueFullLabel || w.finalApprovedDueLabel || w.finalApprovedDueDate || "-")), React.createElement("div", {
    className: "meta-row"
  }, React.createElement("div", {
    className: "meta-row__lbl"
  }, "Launch Date / Deadline"), React.createElement("div", {
    className: "meta-row__val"
  }, w.launchFullLabel || w.launchLabel || "-")), React.createElement("div", {
    className: "meta-row"
  }, React.createElement("div", {
    className: "meta-row__lbl"
  }, "AI Tag"), React.createElement("div", {
    className: "meta-row__val"
  }, React.createElement("div", {
    className: "ai-tag-list"
  }, aiTagsUnavailable ? React.createElement("span", {
    className: "muted"
  }, "AI tags are unavailable for your access.") : visibleAiTags.length > 0 ? visibleAiTags.map(tag => React.createElement("span", {
    className: "tag ai-tag",
    key: tag.id || tag.tag
  }, React.createElement(Icon, {
    name: "zap",
    size: 11
  }), " ", tag.tag, !isArchivedDetail && !aiTagsUnavailable && w.isSupabaseRow && window.removeFlowMateAiTag && React.createElement("button", {
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
  }, "No AI tags"), !isArchivedDetail && React.createElement("button", {
    type: "button",
    className: "btn btn--xs btn--secondary",
    onClick: addAiTag,
    disabled: pending || aiTagsUnavailable || !w.isSupabaseRow || !window.addFlowMateAiTag
  }, React.createElement(Icon, {
    name: "plus"
  }), " Add AI Tag")))))), React.createElement("div", {
    className: "card"
  }, React.createElement("div", {
    className: "card__head"
  }, React.createElement("span", {
    className: "card__title"
  }, "Activity log")), React.createElement("div", {
    className: "card__body",
    style: {
      display: "grid",
      gap: 8
    }
  }, visibleActivityEvents.length > 0 ? visibleActivityEvents.slice(0, 12).map(event => React.createElement("div", {
    className: "reason-box",
    key: event.id || `${event.event_type}-${event.created_at}`
  }, formatFlowMateActivityEvent(event))) : w.queueReason ? React.createElement("div", {
    className: "reason-box"
  }, w.queueReason) : React.createElement("div", {
    className: "muted"
  }, "No activity yet."))), w.urgentReason && React.createElement("div", {
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
