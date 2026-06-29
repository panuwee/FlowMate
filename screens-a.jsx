// FlowMate - Screens part A: My Work, Create, Detail
const { useState, useEffect } = React;

/* ============================================================
   MY WORK
   ============================================================ */
function MyWorkScreen({ onOpen, onNav, searchQuery = "" }) {
  const currentUser = window.FLOWMATE_CURRENT_USER || {};
  const myMember = (window.MEMBERS || []).find(m => m.id === currentUser.team_member_id)
    || (window.MEMBERS || []).find(m => m.name && currentUser.name && m.name.toLowerCase() === currentUser.name.toLowerCase());
  const meIds = [currentUser.team_member_id, currentUser.id, myMember && myMember.id].filter(Boolean);
  const [sourceRows, setSourceRows] = useState(WORK);
  const [loadState, setLoadState] = useState({ status: "loading", message: "Loading Supabase data..." });
  const [filterStatus, setFilterStatus] = useState("all");
  const [showThisWeek, setShowThisWeek] = useState(false);

  async function loadMyWorkRows(isAlive = () => true) {
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
      window.dispatchEvent(new CustomEvent("flowmate:refresh-counts"));
    } catch (error) {
      if (!isAlive()) return;
      console.error("[FlowMate My Work] Supabase load failed:", error);
      setSourceRows([]);
      setLoadState({ status: "error", message: `Live data unavailable: ${window.flowmateUserError(error, "Supabase query failed.")}` });
    }
  }

  useEffect(() => {
    let alive = true;
    loadMyWorkRows(() => alive);
    const cleanup = window.attachFlowMateLiveRefresh
      ? window.attachFlowMateLiveRefresh(() => loadMyWorkRows(() => alive))
      : () => {};
    return () => { alive = false; cleanup(); };
  }, []);

  async function handleQuickDone(work) {
    if (!work.isSupabaseRow) return;

    try {
      await window.completeFlowMateQuickTask(work.id);
      await loadMyWorkRows();
      window.dispatchEvent(new CustomEvent("flowmate:refresh-counts"));
      setLoadState({ status: "live", message: `Completed ${work.id}` });
    } catch (error) {
      console.error("[FlowMate My Work] Complete quick task failed:", error);
      setLoadState({ status: "error", message: `Could not complete ${work.id}: ${window.flowmateUserError(error, "RPC failed.")}` });
    }
  }

  async function handleChecklistAdd(work, title) {
    if (!work.isSupabaseRow) return;

    try {
      await window.addFlowMateQuickTaskChecklistItem(work.id, title);
      await loadMyWorkRows();
      setLoadState({ status: "live", message: `Added checklist item to ${work.id}` });
    } catch (error) {
      console.error("[FlowMate My Work] Add checklist item failed:", error);
      setLoadState({ status: "error", message: `Could not add checklist item: ${window.flowmateUserError(error, "RPC failed.")}` });
    }
  }

  async function handleChecklistToggle(item, isDone) {
    try {
      await window.toggleFlowMateQuickTaskChecklistItem(item.id, isDone);
      await loadMyWorkRows();
      setLoadState({ status: "live", message: "Checklist updated" });
    } catch (error) {
      console.error("[FlowMate My Work] Toggle checklist item failed:", error);
      setLoadState({ status: "error", message: `Could not update checklist: ${window.flowmateUserError(error, "RPC failed.")}` });
    }
  }

  async function handleCommentAdd(work, body) {
    if (!work.isSupabaseRow) return;

    try {
      await window.addFlowMateWorkItemComment(work.id, body);
      await loadMyWorkRows();
      setLoadState({ status: "live", message: `Added comment to ${work.id}` });
    } catch (error) {
      console.error("[FlowMate My Work] Add comment failed:", error);
      setLoadState({ status: "error", message: `Could not add comment: ${window.flowmateUserError(error, "RPC failed.")}` });
    }
  }

  async function handleCommentEdit(comment) {
    const nextBody = await window.flowmatePrompt({
      title: "Edit comment", label: "Comment", defaultValue: comment.body,
      multiline: true, required: true,
    });
    if (nextBody == null) return;

    try {
      await window.updateFlowMateOwnComment(comment.id, nextBody);
      await loadMyWorkRows();
      setLoadState({ status: "live", message: "Comment updated" });
    } catch (error) {
      console.error("[FlowMate My Work] Edit comment failed:", error);
      setLoadState({ status: "error", message: `Could not edit comment: ${window.flowmateUserError(error, "RPC failed.")}` });
    }
  }

  async function handleCommentDelete(comment) {
    if (!window.confirm("Delete this comment?")) return;

    try {
      await window.deleteFlowMateOwnComment(comment.id);
      await loadMyWorkRows();
      setLoadState({ status: "live", message: "Comment deleted" });
    } catch (error) {
      console.error("[FlowMate My Work] Delete comment failed:", error);
      setLoadState({ status: "error", message: `Could not delete comment: ${window.flowmateUserError(error, "RPC failed.")}` });
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
        validate: (value) => (window.flowmateSafeHttpUrl(value) ? null : "Enter a valid http(s) link."),
      });
      if (!deliveryLink) return;
      options.deliveryLink = deliveryLink;
    }

    if (nextStatus === "blocked") {
      const blockedReason = await window.flowmatePrompt({
        title: "Block work", label: "Blocked reason", multiline: true, required: true,
      });
      if (!blockedReason) return;
      options.blockedReason = blockedReason;
    }

    try {
      // H-12: single transition entry point (routes admins to the admin RPC,
      // everyone else to the owner/requester-guarded RPC) so the same action
      // behaves identically from My Work, Detail, and Board.
      await window.transitionFlowMateWorkStatus(work.id, nextStatus, options);
      await loadMyWorkRows();
      setLoadState({ status: "live", message: `${work.id} moved to ${STATUS_LABEL[nextStatus] || nextStatus}` });
    } catch (error) {
      console.error("[FlowMate My Work] Creative status transition failed:", error);
      setLoadState({ status: "error", message: `Could not update ${work.id}: ${window.flowmateUserError(error, "RPC failed.")}` });
    }
  }

  const rawMine = window.getFlowMateMyWorkRows
    ? window.getFlowMateMyWorkRows(sourceRows, currentUser, window.MEMBERS || [], searchQuery)
    : sourceRows.filter(w => meIds.includes(w.assignee) && !["delivered", "cancelled", "done"].includes(w.status) && window.matchesFlowMateSearch(w, searchQuery));
  const weekMine = showThisWeek
    ? rawMine.filter(w => w.dueDelta != null && w.dueDelta >= 0 && w.dueDelta <= 6)
    : rawMine;
  const mine = window.sortFlowMateMyWorkRows
    ? window.sortFlowMateMyWorkRows(window.filterFlowMateMyWorkByStatus(weekMine, filterStatus))
    : weekMine;
  const overdue = window.sortFlowMateMyWorkRows(mine.filter(w => w.overdue || (w.dueDelta != null && w.dueDelta < 0)));
  const dueToday = window.sortFlowMateMyWorkRows(mine.filter(w => !w.overdue && w.dueDelta === 0 && ["assigned","in_progress","review"].includes(w.status)));
  const dueSoon = window.sortFlowMateMyWorkRows(mine.filter(w => !w.overdue && w.dueDelta != null && w.dueDelta > 0 && w.dueDelta <= 2 && ["assigned","in_progress","review"].includes(w.status)));
  // O-6: membership via id-Sets instead of Array.includes(object) inside a
  // filter (which was O(n²) over the grouped lists).
  const dueTodayIds = new Set(dueToday.map(w => w.id));
  const dueSoonIds = new Set(dueSoon.map(w => w.id));
  const inProgress = mine.filter(w => w.status === "in_progress" && !w.overdue && !dueTodayIds.has(w.id) && !dueSoonIds.has(w.id));
  const assigned = mine.filter(w => w.status === "assigned" && !w.overdue && !dueTodayIds.has(w.id) && !dueSoonIds.has(w.id));
  const review = mine.filter(w => w.status === "review" && !w.overdue && !dueTodayIds.has(w.id) && !dueSoonIds.has(w.id));
  const blocked = mine.filter(w => w.status === "blocked" && !w.overdue);
  const activeGroupIds = new Set([...overdue, ...dueToday, ...dueSoon, ...inProgress, ...assigned, ...review, ...blocked].map(w => w.id));
  const quick = mine.filter(w => w.type === "quick" && !activeGroupIds.has(w.id));
  function scrollToOverdue() {
    document.getElementById("my-work-overdue")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="page">
      {overdue.length > 0 && (
        <div className="overdue-banner">
          <Icon name="alert" size={18} />
          <span><strong>{overdue.length} overdue {overdue.length === 1 ? "item" : "items"}</strong> &nbsp;needs your attention before new work is assigned.</span>
          <span className="overdue-banner__spacer"></span>
          <button className="btn btn--sm btn--danger" onClick={scrollToOverdue}>View overdue</button>
        </div>
      )}

      <div className="page__header">
        <div>
          <h1 className="page__title">My work</h1>
          <div className="page__sub">{loadState.message}</div>
          <div className="page__sub">{currentUser.name ? `Hi ${currentUser.name} - ` : ""}Open work as of {new Date().toLocaleString("en-SG", { timeZone: "Asia/Singapore", dateStyle: "medium", timeStyle: "short" })} SGT.</div>
        </div>
        <div className="page__actions">
          <button className={`btn btn--secondary ${showThisWeek ? "is-active" : ""}`} onClick={() => setShowThisWeek(current => !current)} title="Show work due in the next 7 days"><Icon name="calendar" /> This week</button>
          <button className="btn btn--primary" onClick={() => onNav("create")}><Icon name="plus" /> New</button>
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat stat--accent"><div className="stat__num">{overdue.length}</div><div className="stat__lbl">Overdue</div></div>
        <div className="stat stat--warn"><div className="stat__num">{dueToday.length}</div><div className="stat__lbl">Due today</div></div>
        <div className="stat stat--info"><div className="stat__num">{inProgress.length + dueSoon.filter(d=>d.status==="in_progress").length + dueToday.filter(d=>d.status==="in_progress").length}</div><div className="stat__lbl">In progress</div></div>
        <div className="stat"><div className="stat__num">{review.length + dueSoon.filter(d=>d.status==="review").length + dueToday.filter(d=>d.status==="review").length}</div><div className="stat__lbl">Review</div></div>
        <div className="stat"><div className="stat__num">{blocked.length}</div><div className="stat__lbl">Blocked</div></div>
      </div>

      <div className="filterbar">
        <button className={`chip ${filterStatus === "all" ? "is-active" : ""}`} onClick={() => setFilterStatus("all")}>All</button>
        <button className={`chip ${filterStatus === "due_today" ? "is-active" : ""}`} onClick={() => setFilterStatus("due_today")}>Due today</button>
        <button className={`chip ${filterStatus === "overdue" ? "is-active" : ""}`} onClick={() => setFilterStatus("overdue")}>Overdue</button>
        <select className="select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="assigned">Assigned</option>
          <option value="in_progress">In progress</option>
          <option value="review">Review</option>
          <option value="blocked">Blocked</option>
          <option value="quick">Quick tasks</option>
          <option value="creative">Creative requests</option>
        </select>
      </div>

      <MyWorkGroup title="Overdue" tone="overdue" items={overdue} onOpen={onOpen} onQuickDone={handleQuickDone} onCreativeTransition={handleCreativeTransition} />
      <MyWorkGroup title="Due today" items={dueToday} onOpen={onOpen} onQuickDone={handleQuickDone} onCreativeTransition={handleCreativeTransition} />
      <MyWorkGroup title="Due soon" items={dueSoon} onOpen={onOpen} onQuickDone={handleQuickDone} onCreativeTransition={handleCreativeTransition} />
      <MyWorkGroup title="In progress" items={inProgress} onOpen={onOpen} onQuickDone={handleQuickDone} onCreativeTransition={handleCreativeTransition} />
      <MyWorkGroup title="Assigned" items={assigned} onOpen={onOpen} onQuickDone={handleQuickDone} onCreativeTransition={handleCreativeTransition} />
      <MyWorkGroup title="In review by requester" items={review} onOpen={onOpen} onQuickDone={handleQuickDone} onCreativeTransition={handleCreativeTransition} />
      <MyWorkGroup title="Quick tasks" items={quick} onOpen={onOpen} onQuickDone={handleQuickDone} onChecklistAdd={handleChecklistAdd} onChecklistToggle={handleChecklistToggle} onCommentAdd={handleCommentAdd} onCommentEdit={handleCommentEdit} onCommentDelete={handleCommentDelete} compact />
    </div>
  );
}

function MyWorkGroup({ title, items, onOpen, onQuickDone, onCreativeTransition, onChecklistAdd, onChecklistToggle, onCommentAdd, onCommentEdit, onCommentDelete, tone, compact }) {
  if (!items.length) return null;

  return (
    <div className="section" id={tone === "overdue" ? "my-work-overdue" : undefined}>
      <div className={`section__head${tone === "overdue" ? " section__head--overdue" : ""}`}>
        <span className="section__title">{title}</span>
        <span className="section__count">{items.length}</span>
      </div>
      <table className="tbl">
          <thead>
            <tr>
              <th className="col-id">ID</th>
              <th>Title</th>
              <th>Type</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Effort</th>
              <th>Checklist</th>
              <th>Due</th>
              <th className="col-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map(w => (
              <tr key={w.id} className={w.overdue ? "is-overdue" : ""} onClick={() => {
                window.flowmateSelectedWorkItem = w;
                onOpen(w.id);
              }}>
                <td className="col-id mono">{w.id}</td>
                <td className="col-title">{w.title}</td>
                <td><TypePill type={w.type} /></td>
                <td><StatusBadge status={w.status} /></td>
                <td><PriorityBadge level={w.priority} /></td>
                <td><Effort value={w.effort} /></td>
                <td><Progress {...(w.checklist || { done: 0, total: 0 })} /></td>
                <td><DueBadge delta={w.dueDelta} label={w.dueLabel} status={w.status} /></td>
                <td className="col-right" onClick={(e) => e.stopPropagation()}>
                  <div className="my-work-actions">
                    {w.type === "quick" && w.status !== "delivered" && (
                      <button className="btn btn--xs btn--secondary" onClick={() => onQuickDone && onQuickDone(w)}>Mark done</button>
                    )}
                    {w.type !== "quick" && w.status === "assigned" && <button className="btn btn--xs btn--secondary" onClick={() => onCreativeTransition && onCreativeTransition(w, "in_progress")}><Icon name="play" size={11} /> Start</button>}
                    {w.type !== "quick" && w.status === "in_progress" && <button className="btn btn--xs btn--primary" onClick={() => onCreativeTransition && onCreativeTransition(w, "review")}><Icon name="send" size={11} /> Submit review</button>}
                    {w.type !== "quick" && w.status === "review" && <button className="btn btn--xs btn--ghost" disabled>Awaiting requester</button>}
                    {w.type !== "quick" && ["assigned", "in_progress", "review"].includes(w.status) && <button className="btn btn--xs btn--danger" onClick={() => onCreativeTransition && onCreativeTransition(w, "blocked")}><Icon name="block" size={11} /> Block</button>}
                    {w.type !== "quick" && w.status === "blocked" && <button className="btn btn--xs btn--secondary" onClick={() => onCreativeTransition && onCreativeTransition(w, "in_progress")}><Icon name="play" size={11} /> Resume</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      {compact && items.some(w => w.isSupabaseRow) && (
        <div className="checklist" style={{ borderTop: "1px solid var(--garena-light-grey)" }}>
          {items.map(w => (
            <QuickTaskChecklist
              key={`${w.id}-checklist`}
              work={w}
              onAdd={onChecklistAdd}
              onToggle={onChecklistToggle}
              onCommentAdd={onCommentAdd}
              onCommentEdit={onCommentEdit}
              onCommentDelete={onCommentDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QuickTaskChecklist({ work, onAdd, onToggle, onCommentAdd, onCommentEdit, onCommentDelete }) {
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

  return (
    <div style={{ padding: "12px 16px", display: "grid", gap: 8 }}>
      <div className="row" style={{ gap: 8 }}>
        <span className="mono muted" style={{ width: 76 }}>{work.id}</span>
        <span className="strong">{work.title}</span>
      </div>
      {items.length === 0 ? (
        <div className="muted" style={{ fontSize: 12 }}>No checklist items.</div>
      ) : (
        <div className="checklist">
          {items.map(item => (
            <label key={item.id} className="row" style={{ gap: 8, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={item.is_done}
                onChange={(e) => onToggle(item, e.target.checked)}
              />
              <span className={item.is_done ? "muted" : ""}>{item.title}</span>
            </label>
          ))}
        </div>
      )}
      <form className="row" style={{ gap: 8 }} onSubmit={submit}>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add checklist item"
          style={{ height: 30, maxWidth: 320 }}
        />
        <button className="btn btn--xs btn--secondary" type="submit">Add</button>
      </form>
      <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
        <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>Comments ({comments.length})</div>
        {comments.length === 0 ? (
          <div className="muted" style={{ fontSize: 12 }}>No comments.</div>
        ) : (
          comments.map(comment => (
            <div key={comment.id} className="reason-box" style={{ padding: "8px 10px" }}>
              <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                <strong style={{ fontSize: 12 }}>{comment.authorName}</strong>
                <span className="mono muted" style={{ fontSize: 11 }}>{new Date(comment.created_at).toLocaleString()}</span>
                <span className="spacer"></span>
                {comment.author_user_id === window.FLOWMATE_CURRENT_USER?.id && (
                  <>
                    <button className="btn btn--xs btn--ghost" type="button" onClick={() => onCommentEdit(comment)}>Edit</button>
                    <button className="btn btn--xs btn--ghost" type="button" onClick={() => onCommentDelete(comment)}>Delete</button>
                  </>
                )}
              </div>
              <div style={{ fontSize: 12 }}>{comment.body}</div>
            </div>
          ))
        )}
        <form className="row" style={{ gap: 8 }} onSubmit={submitComment}>
          <input
            className="input"
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder="Add comment"
            style={{ height: 30, maxWidth: 420 }}
          />
          <button className="btn btn--xs btn--secondary" type="submit">Comment</button>
        </form>
      </div>
    </div>
  );
}

/* ============================================================
   CREATE - Quick Task + Creative Request
   ============================================================ */
const FLOWMATE_ASSIGNEE_FALLBACK = [
  { userId: "00000000-0000-0000-0000-000000001001", name: "Gear" },
  { userId: "00000000-0000-0000-0000-000000001002", name: "Panu" },
  { userId: "00000000-0000-0000-0000-000000001003", name: "Big" },
  { userId: "00000000-0000-0000-0000-000000001004", name: "Mark" },
  { userId: "00000000-0000-0000-0000-000000001005", name: "Po" },
  { userId: "00000000-0000-0000-0000-000000001006", name: "Aof" },
  { userId: "00000000-0000-0000-0000-000000001007", name: "Folk" },
  { userId: "00000000-0000-0000-0000-000000001008", name: "Mac" },
  { userId: "00000000-0000-0000-0000-000000001009", name: "No" },
  { userId: "00000000-0000-0000-0000-000000001010", name: "May" },
  { userId: "00000000-0000-0000-0000-000000001011", name: "Boss" },
  { userId: "00000000-0000-0000-0000-000000001012", name: "Mag" },
  { userId: "00000000-0000-0000-0000-000000001013", name: "Real" },
  { userId: "00000000-0000-0000-0000-000000001014", name: "Pointer" },
  { userId: "00000000-0000-0000-0000-000000001015", name: "Pond" },
  { userId: "00000000-0000-0000-0000-000000001016", name: "Joe" },
  { userId: "00000000-0000-0000-0000-000000001017", name: "Tong" },
  { userId: "00000000-0000-0000-0000-000000001018", name: "Eye" },
  { userId: "00000000-0000-0000-0000-000000001019", name: "Vee" },
  { userId: "00000000-0000-0000-0000-000000001024", name: "Ploy" },
  { userId: "00000000-0000-0000-0000-000000001020", name: "Pluem" },
  { userId: "00000000-0000-0000-0000-000000001021", name: "Net" },
  { userId: "00000000-0000-0000-0000-000000001022", name: "Ben" },
  { userId: "00000000-0000-0000-0000-000000001023", name: "Peak" },
];

const FLOWMATE_CREATE_DRAFT_KEYS = {
  quick: "flowmate:create:quickDraft:v1",
  creative: "flowmate:create:creativeDraft:v1",
};

const FLOWMATE_CREATIVE_TYPE_OPTIONS = [
  { key: "banner", label: "Banner", assetType: "static-graphic" },
  { key: "hero-album", label: "Hero Album (Banner x8)", assetType: "static-graphic" },
  { key: "logo", label: "Logo", assetType: "static-graphic" },
  { key: "web-reskin", label: "Web Reskin", assetType: "static-graphic" },
  { key: "new-web", label: "New Web", assetType: "static-graphic" },
  { key: "cdn-design", label: "CDN Design", assetType: "static-graphic" },
  { key: "resize", label: "Resize", assetType: "static-graphic" },
  { key: "graphic-pack", label: "Graphic Pack", assetType: "static-graphic" },
  { key: "kv-design", label: "KV Design", assetType: "static-graphic" },
  { key: "jersey-design", label: "Jersey Design", assetType: "static-graphic" },
  { key: "jersey-in-game", label: "Jersey In-game", assetType: "static-graphic" },
  { key: "merchandise-design", label: "Merchandise Design", assetType: "static-graphic" },
  { key: "video-standard", label: "Video Standard", assetType: "general-video" },
  { key: "video-under-1-min", label: "Video Under 1 Min", assetType: "general-video" },
  { key: "motion", label: "Motion", assetType: "motion" },
];

const FLOWMATE_CREATIVE_CHANNEL_OPTIONS = [
  { key: "facebook", label: "Facebook" },
  { key: "tiktok", label: "TikTok" },
  { key: "instagram", label: "Instagram" },
  { key: "in_game", label: "In-game" },
  { key: "youtube", label: "YouTube" },
  { key: "other", label: "Other" },
];

function getFlowMateCreativeTypeOption(typeKey) {
  return FLOWMATE_CREATIVE_TYPE_OPTIONS.find((option) => option.key === typeKey) || FLOWMATE_CREATIVE_TYPE_OPTIONS[0];
}

function getFlowMateCreativeTypeLabel(typeKey) {
  const option = FLOWMATE_CREATIVE_TYPE_OPTIONS.find((item) => item.key === typeKey);
  return option ? option.label : typeKey;
}

function normalizeFlowMateCreativeChannels(value) {
  const rawValues = Array.isArray(value)
    ? value
    : String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
  const normalizedLabels = rawValues
    .map((item) => {
      const match = FLOWMATE_CREATIVE_CHANNEL_OPTIONS.find((option) => (
        option.key.toLowerCase() === String(item).toLowerCase()
        || option.label.toLowerCase() === String(item).toLowerCase()
      ));
      return match ? match.label : String(item).trim();
    })
    .filter(Boolean);
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
  motion: 2,
};

function subtractFlowMateWorkingDays(dateValue, workingDays) {
  if (!dateValue) return "";
  const parts = String(dateValue).split("-").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return "";
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
  const parts = String(dateValue || "").slice(0, 10).split("-").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return "";
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

  const startParts = startValue.split("-").map((part) => Number(part));
  const endParts = endValue.split("-").map((part) => Number(part));
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
    isInsufficient: effort > normalCapacity,
  };
}

function getFlowMateAutoUrgentReason(timePressure) {
  return `Auto urgent: ${timePressure.skillLabel} x${timePressure.assetCount} requires ${timePressure.effort} pt but only ${timePressure.workingDays} working day(s) / ${timePressure.normalCapacity} pt remain before launch.`;
}

function normalizeFlowMateQuickDraft(draft) {
  const nextDraft = { ...getDefaultQuickDraft(), ...(draft || {}) };
  return {
    ...nextDraft,
    dueDate: clampFlowMateDateToToday(nextDraft.dueDate),
    launchDate: clampFlowMateDateToToday(nextDraft.launchDate),
  };
}

function normalizeFlowMateCreativeDraft(draft) {
  const nextDraft = { ...getDefaultCreativeDraft(), ...(draft || {}) };
  const creativeType = getFlowMateCreativeTypeOption(nextDraft.assetSubtype);
  const launchDate = clampFlowMateDateToToday(nextDraft.launchDate);
  const assetCountNumber = Number(nextDraft.assetCount);
  const assetCount = Number.isInteger(assetCountNumber) && assetCountNumber >= 1 ? String(assetCountNumber) : "1";
  return {
    ...nextDraft,
    requesterTeam: getDefaultRequesterTeam(),
    assetType: creativeType.assetType,
    assetSubtype: creativeType.key,
    assetCount,
    launchDate,
    dueDate: getFlowMateDraftDateForLaunchDate(launchDate),
  };
}

const FLOWMATE_CREATE_DRAFT_FIELDS = {
  quick: [
    "title",
    "note",
    "requesterTeam",
    "projectName",
    "assigneeUserId",
    "assigneeOtherName",
    "dueDate",
    "launchDate",
    "priority",
  ],
  creative: [
    "title",
    "requesterTeam",
    "campaignName",
    "productEvent",
    "assetType",
    "assetSubtype",
    "assetCount",
    "platforms",
    "sizeFormat",
    "briefLink",
    "briefNote",
    "referenceLink",
    "priority",
    "urgentReason",
    "dueDate",
    "launchDate",
    "marketingPlanContentItemId",
    "marketingPlanOriginalBriefLink",
    "marketingPlanProductEvent",
    "marketingPlanCampaignName",
  ],
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
    priority: "normal",
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
    marketingPlanContentItemId: "",
    marketingPlanOriginalBriefLink: "",
    marketingPlanProductEvent: "",
    marketingPlanCampaignName: "",
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
  requireNotPast("launchDate", "Launch date cannot be before today.");

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
    window.localStorage.setItem(
      FLOWMATE_CREATE_DRAFT_KEYS[kind],
      JSON.stringify(getFlowMateCreateDraftPayload(kind, draft)),
    );
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
  return options.find((option) => option.userId === currentUserId)
    || options.find((option) => option.name === "Pond")
    || options[0];
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
  const detailUrl = getFlowMateCreativeRequestDetailUrl(displayId);
  if (!detailUrl) return null;

  return window.updateMarketingPlanWorkingSheetBriefLinkFromCreativeRequest(
    submissionDraft.marketingPlanContentItemId,
    detailUrl,
  );
}

function CreateScreen({ onNav, onOpen, initialMode = "creative" }) {
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
        projectName: draft.projectName,
      }),
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
        productEvent: draft.productEvent,
      }),
    };
  });

  useEffect(() => {
    let alive = true;
    if (!window.loadFlowMateAssignees) return () => {};

    window.loadFlowMateAssignees()
      .then((options) => {
        if (!alive || !options.length) return;
        setAssigneeOptions(options);
        setQuickDraft((draft) => {
          if (options.some((option) => option.userId === draft.assigneeUserId)) return draft;
          const nextQuickDraft = { ...draft, assigneeUserId: getDefaultQuickAssignee(options).userId, assigneeOtherName: "" };
          saveFlowMateCreateDraft("quick", nextQuickDraft);
          return nextQuickDraft;
        });
      })
      .catch((error) => {
        console.warn("[FlowMate Create] assignee load failed:", error);
      });

    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (initialMode === "quick" || initialMode === "creative") {
      switchCreateMode(initialMode);
    }
  }, [initialMode]);

  useEffect(() => {
    let alive = true;
    if (!window.loadFlowMateRequesterTeams) return () => {};

    window.loadFlowMateRequesterTeams()
      .then((options) => {
        if (!alive || !options.length) return;
        setRequesterTeamOptions(options);
      })
      .catch((error) => {
        console.warn("[FlowMate Create] requester team load failed:", error);
      });

    return () => { alive = false; };
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
      const confirmed = window.flowmatePrompt
        ? await window.flowmatePrompt({
            title: "เวลาไม่เพียงพอ",
            hideInput: true,
            note: `This request needs ${timePressure.effort} pt, but only ${timePressure.normalCapacity} pt (${timePressure.workingDays} working day(s)) remain before Launch Date. Priority will be set to Urgent.`,
            confirmText: "Set Urgent and submit",
          })
        : "";
      if (confirmed === null) {
        setCreateAlert("Submit cancelled. Please adjust Launch date, Asset Count, or Priority.");
        return;
      }
      const urgentDraft = {
        ...submissionDraft,
        priority: "urgent",
        urgentReason: submissionDraft.urgentReason || autoUrgentReason,
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
        nextResult = { kind: "quick_created", id: window.getFlowMateCreatedDisplayId(created) };
      } else {
        created = await window.createFlowMateCreativeRequest(submissionDraft);
        try {
          await syncMarketingPlanBriefLinkAfterCreativeSubmit(submissionDraft, created);
        } catch (syncError) {
          console.warn("[FlowMate Create] Marketing Plan link backfill failed:", syncError);
        }
        const assignment = created.assignment || {};
        const result = assignment.result || "queued";
        nextResult = {
          kind: result === "assigned" ? "assigned" : result === "need_brief" ? "need_brief" : "queued",
          id: window.getFlowMateCreatedDisplayId(created),
          owner: assignment.owner_code ? `m-${assignment.owner_code}` : null,
          effort: assignment.effort || null,
          reason: assignment.reason || "",
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
          message: openError.message || "Saved, but could not open the detail view.",
        });
      }
    } catch (error) {
      console.error("[FlowMate Create] submit failed:", error);
      setResult({ kind: "error", id: "Not saved", message: window.flowmateUserError(error, "Submit failed.") });
    } finally {
      if (shouldShowResult) {
        setIsSubmitting(false);
        setSubmitted(true);
      }
    }
  }

  if (submitted) return <CreateResultScreen result={result} onAgain={() => { setSubmitted(false); setResult(null); }} onNav={onNav} />;

  function updateCreativeDraft(nextDraft) {
    setValidationErrors({});
    setCreateAlert("");
    const normalizedDraft = normalizeFlowMateCreativeDraft(nextDraft);
    const title = window.buildFlowMateTemplateTitle({
      launchDate: normalizedDraft.launchDate,
      requesterTeam: normalizedDraft.requesterTeam,
      projectName: normalizedDraft.campaignName,
      productEvent: normalizedDraft.productEvent,
    });
    const nextCreativeDraft = { ...normalizedDraft, title };
    setCreativeDraft(nextCreativeDraft);
    saveFlowMateCreateDraft("creative", nextCreativeDraft);
  }

  function updateQuickDraft(nextDraft) {
    setValidationErrors({});
    setCreateAlert("");
    const title = window.buildFlowMateTemplateTitle({
      launchDate: nextDraft.launchDate,
      requesterTeam: nextDraft.requesterTeam,
      projectName: nextDraft.projectName,
    });
    const nextQuickDraft = { ...nextDraft, title };
    setQuickDraft(nextQuickDraft);
    saveFlowMateCreateDraft("quick", nextQuickDraft);
  }

  function switchCreateMode(nextMode) {
    setMode(nextMode);
    setValidationErrors({});
    setCreateAlert("");
  }

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="page__header">
        <div>
          <h1 className="page__title">Create</h1>
          <div className="page__sub">Pick the right entry point - Quick task is notebook-style, Creative request enters the assignment engine.</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <button className={`choice-card ${mode === "quick" ? "is-active" : ""}`} onClick={() => switchCreateMode("quick")}>
          <div className="choice-card__title"><Icon name="zap" /> Quick task</div>
          <div className="choice-card__sub">Small internal task, follow-up, or reminder. Stays in your team's quick-task list.</div>
          <ul className="choice-card__list">
            <li>No effort calculation, no auto-assignment</li>
            <li>Self-assign or pick a teammate</li>
            <li>Counted separately from creative capacity</li>
          </ul>
        </button>
        <button className={`choice-card ${mode === "creative" ? "is-active" : ""}`} onClick={() => switchCreateMode("creative")}>
          <div className="choice-card__title"><Icon name="layers" /> Creative request</div>
          <div className="choice-card__sub">Structured request for production creative - banner, video, motion, esport pack.</div>
          <ul className="choice-card__list">
            <li>Brief validation, auto effort point, auto routing</li>
            <li>Owner is decided by the engine - no preferred owner</li>
          </ul>
        </button>
      </div>

      <div className="card">
        <div className="card__head">
          <span className="card__title">{mode === "quick" ? "New quick task" : "New creative request"}</span>
          <span className="card__sub">{mode === "creative" ? "All fields with * are required for assignment." : "All fields with * are required"}</span>
        </div>
        <div className="card__body">
          {createAlert && (
            <div className="reason-box reason-box--need" style={{ marginBottom: 16 }}>
              {createAlert}
            </div>
          )}
          {mode === "quick"
            ? <QuickTaskForm value={quickDraft} onChange={updateQuickDraft} assigneeOptions={assigneeOptions} requesterTeamOptions={requesterTeamOptions} errors={validationErrors} />
            : <CreativeRequestForm value={creativeDraft} onChange={updateCreativeDraft} errors={validationErrors} />}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn btn--ghost" onClick={() => onNav("my-work")}>Cancel</button>
        <button className="btn btn--primary" onClick={handleSubmit} disabled={isSubmitting}>
          <Icon name="send" /> {isSubmitting ? "Saving..." : mode === "quick" ? "Create quick task" : "Submit request"}
        </button>
      </div>
    </div>
  );
}

function QuickTaskForm({ value, onChange, assigneeOptions, requesterTeamOptions = TEAMS, errors = {} }) {
  const options = assigneeOptions || FLOWMATE_ASSIGNEE_FALLBACK;
  const selectedAssignee = options.find((option) => option.userId === value.assigneeUserId) || null;
  const [assigneeQuery, setAssigneeQuery] = useState(selectedAssignee ? selectedAssignee.name : "");
  const [assigneeFocused, setAssigneeFocused] = useState(false);
  const assigneeMatches = window.filterFlowMateAssigneeOptions
    ? window.filterFlowMateAssigneeOptions(options, assigneeQuery)
    : options.filter((option) => option.name.toLowerCase().startsWith((assigneeQuery || "").trim().toLowerCase()));
  const exactAssignee = selectedAssignee && assigneeQuery.trim().toLowerCase() === selectedAssignee.name.toLowerCase();
  const todayDate = getFlowMateTodayDateKey();

  useEffect(() => {
    setAssigneeQuery(selectedAssignee ? selectedAssignee.name : "");
  }, [selectedAssignee && selectedAssignee.userId]);

  function update(field, nextValue) {
    const normalizedValue = field === "dueDate" || field === "launchDate"
      ? clampFlowMateDateToToday(nextValue)
      : nextValue;
    const next = { ...value, [field]: normalizedValue };
    if (field === "assigneeUserId") next.assigneeOtherName = "";
    onChange(next);
  }

  function updateAssigneeQuery(nextQuery) {
    setAssigneeQuery(nextQuery);
    const exactMatch = options.find((option) => option.name.toLowerCase() === nextQuery.trim().toLowerCase());
    update("assigneeUserId", exactMatch ? exactMatch.userId : "");
  }

  function selectAssignee(option) {
    setAssigneeQuery(option.name);
    setAssigneeFocused(false);
    update("assigneeUserId", option.userId);
  }

  return (
    <div className="form-grid">
      <div className="field field--full">
        <label className="field__label">Title <span className="req">*</span></label>
        <input className="input" value={value.title} readOnly placeholder="[3 Jul 2026][Function][Project Name]" title="Auto-filled from Launch Date, Requester Team / Function, and Project / campaign." />
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Auto-filled from Launch Date, Requester Team / Function, and Project / campaign.</div>
      </div>
      <div className="field field--full">
        <label className="field__label">Note</label>
        <textarea className="textarea" value={value.note} onChange={(e) => update("note", e.target.value)} placeholder="Short description - what needs doing, any context, link to the doc."></textarea>
      </div>
      <div className={`field ${errors.requesterTeam ? "field--error" : ""}`}>
        <label className="field__label">Requester Team / Function <span className="req">*</span></label>
        <select className="select" value={value.requesterTeam} onChange={(e) => update("requesterTeam", e.target.value)}>
          {requesterTeamOptions.map((team) => <option key={team} value={team}>{team}</option>)}
        </select>
        {errors.requesterTeam && <div className="field__error">{errors.requesterTeam}</div>}
      </div>
      <div className={`field ${errors.projectName ? "field--error" : ""}`}>
        <label className="field__label">Project / campaign <span className="req">*</span></label>
        <input className="input" value={value.projectName} onChange={(e) => update("projectName", e.target.value)} placeholder="e.g. FCO S24 Launch" />
        {errors.projectName && <div className="field__error">{errors.projectName}</div>}
      </div>
      <div className="field">
        <label className="field__label">Assignee</label>
        <div style={{ position: "relative" }}>
          <input
            className="input"
            value={assigneeQuery}
            onChange={(e) => updateAssigneeQuery(e.target.value)}
            onFocus={() => setAssigneeFocused(true)}
            onBlur={() => window.setTimeout(() => setAssigneeFocused(false), 120)}
            placeholder="Type a name, e.g. P"
            autoComplete="off"
          />
          {assigneeFocused && assigneeMatches.length > 0 && !exactAssignee && (
            <div
              className="card"
              style={{
                position: "absolute",
                zIndex: 20,
                top: "calc(100% + 4px)",
                left: 0,
                right: 0,
                maxHeight: 220,
                overflowY: "auto",
                padding: 4,
              }}
            >
              {assigneeMatches.map((option) => (
                <button
                  key={option.userId}
                  className="btn btn--ghost"
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectAssignee(option);
                  }}
                  style={{ width: "100%", justifyContent: "flex-start" }}
                >
                  {option.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className={`field ${errors.dueDate ? "field--error" : ""}`}>
        <label className="field__label">1st Review / Draft <span className="req">*</span></label>
        <input className="input" value={value.dueDate} onChange={(e) => update("dueDate", e.target.value)} type="date" min={todayDate} />
        {errors.dueDate && <div className="field__error">{errors.dueDate}</div>}
      </div>
      <div className={`field ${errors.launchDate ? "field--error" : ""}`}>
        <label className="field__label">Launch date <span className="req">*</span></label>
        <input className="input" value={value.launchDate} onChange={(e) => update("launchDate", e.target.value)} type="date" min={todayDate} />
        {errors.launchDate && <div className="field__error">{errors.launchDate}</div>}
      </div>
      <div className="field">
        <label className="field__label">Priority</label>
        <select className="select" value={value.priority} onChange={(e) => update("priority", e.target.value)}>
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </select>
      </div>
    </div>
  );
}
function CreativeRequestForm({ value, onChange, errors = {} }) {
  const selectedCreativeType = getFlowMateCreativeTypeOption(value.assetSubtype);
  const todayDate = getFlowMateTodayDateKey();
  const [campaignOptions, setCampaignOptions] = useState(() => window.FLOWMATE_MARKETING_CAMPAIGNS || []);
  const selectedChannels = normalizeFlowMateCreativeChannels(value.platforms);

  useEffect(() => {
    let alive = true;
    function syncCampaignOptions(event) {
      const campaigns = event && event.detail && event.detail.campaigns
        ? event.detail.campaigns
        : (window.FLOWMATE_MARKETING_CAMPAIGNS || []);
      if (alive) setCampaignOptions(campaigns);
    }
    window.addEventListener("flowmate:marketing-campaigns-updated", syncCampaignOptions);
    if (window.loadFlowMateMarketingCampaignOptions) {
      window.loadFlowMateMarketingCampaignOptions()
        .then((campaigns) => { if (alive) setCampaignOptions(campaigns || []); })
        .catch((error) => console.warn("[FlowMate Create] campaign options load failed:", error && error.message));
    }
    return () => {
      alive = false;
      window.removeEventListener("flowmate:marketing-campaigns-updated", syncCampaignOptions);
    };
  }, []);

  function update(field, next) {
    if (field === "assetSubtype") {
      const nextType = getFlowMateCreativeTypeOption(next);
      onChange({ ...value, assetType: nextType.assetType, assetSubtype: nextType.key });
      return;
    }
    if (field === "launchDate") {
      const nextLaunchDate = clampFlowMateDateToToday(next);
      onChange({
        ...value,
        launchDate: nextLaunchDate,
        dueDate: getFlowMateDraftDateForLaunchDate(nextLaunchDate),
      });
      return;
    }
    onChange({ ...value, [field]: next });
  }

  function toggleChannel(channelLabel) {
    const currentChannels = normalizeFlowMateCreativeChannels(value.platforms);
    const nextChannels = currentChannels.includes(channelLabel)
      ? currentChannels.filter(channel => channel !== channelLabel)
      : [...currentChannels, channelLabel];
    update("platforms", nextChannels.length ? nextChannels.join(", ") : channelLabel);
  }

  return (
    <div>
      <div className="form-grid">
        <div className="field field--full">
          <label className="field__label">Title <span className="req">*</span></label>
          <input className="input" value={value.title} readOnly placeholder="[3 Jul 2026][Function][Campaign][Product / Event]" title="Auto-filled from Launch Date, your account team, Campaign, and Product / Event." />
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Auto-filled from Launch Date, your account team, Campaign, and Product / Event.</div>
        </div>
        <div className={`field ${errors.campaignName ? "field--error" : ""}`}>
          <label className="field__label">Campaign <span className="req">*</span></label>
          <input className="input" list="flowmate-campaign-tags" value={value.campaignName} onChange={e => update("campaignName", e.target.value)} placeholder="e.g. FCO S24 Launch" />
          <datalist id="flowmate-campaign-tags">
            {campaignOptions.map(campaign => <option key={campaign.id || campaign.name} value={campaign.name} />)}
          </datalist>
          {errors.campaignName && <div className="field__error">{errors.campaignName}</div>}
        </div>
        <div className={`field ${errors.productEvent ? "field--error" : ""}`}>
          <label className="field__label">Product / Event <span className="req">*</span></label>
          <input className="input" value={value.productEvent} onChange={e => update("productEvent", e.target.value)} placeholder="e.g. DAU, Hero Post Teaser" />
          {errors.productEvent && <div className="field__error">{errors.productEvent}</div>}
        </div>
        <div className={`field ${errors.assetSubtype ? "field--error" : ""}`}>
          <label className="field__label">Type / Skill <span className="req">*</span></label>
          <select className="select" value={selectedCreativeType.key} onChange={e => update("assetSubtype", e.target.value)}>
            {FLOWMATE_CREATIVE_TYPE_OPTIONS.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
          {errors.assetSubtype && <div className="field__error">{errors.assetSubtype}</div>}
        </div>
        <div className={`field ${errors.assetCount ? "field--error" : ""}`}>
          <label className="field__label">Asset Count <span className="req">*</span></label>
          <input className="input" type="number" min="1" step="1" value={value.assetCount} onChange={e => update("assetCount", e.target.value)} placeholder="1" />
          {errors.assetCount && <div className="field__error">{errors.assetCount}</div>}
        </div>
        <div className={`field ${errors.platforms ? "field--error" : ""}`}>
          <label className="field__label">Channel Tag <span className="req">*</span></label>
          <div className="check-row">
            {FLOWMATE_CREATIVE_CHANNEL_OPTIONS.map(channel => (
              <label key={channel.key} className="check-pill">
                <input
                  type="checkbox"
                  checked={selectedChannels.includes(channel.label)}
                  onChange={() => toggleChannel(channel.label)}
                />
                <span>{channel.label}</span>
              </label>
            ))}
          </div>
          {errors.platforms && <div className="field__error">{errors.platforms}</div>}
        </div>
        <div className={`field ${errors.sizeFormat ? "field--error" : ""}`}>
          <label className="field__label">Size / format <span className="req">*</span></label>
          <input className="input" value={value.sizeFormat} onChange={e => update("sizeFormat", e.target.value)} placeholder="e.g. 1080x1350, 1080x1920" />
          {errors.sizeFormat && <div className="field__error">{errors.sizeFormat}</div>}
        </div>
        <div className={`field ${errors.briefLink ? "field--error" : ""}`}>
          <label className="field__label">Brief link <span className="req">*</span></label>
          <input className="input" value={value.briefLink} onChange={e => update("briefLink", e.target.value)} placeholder="https://docs.google.com/..." />
          {errors.briefLink && <div className="field__error">{errors.briefLink}</div>}
        </div>
        <div className="field">
          <label className="field__label">Reference link</label>
          <input className="input" value={value.referenceLink} onChange={e => update("referenceLink", e.target.value)} placeholder="Optional - Figma / mood board / past asset" />
        </div>
        <div className="field field--full">
          <label className="field__label">Brief Note</label>
          <textarea className="textarea" value={value.briefNote} onChange={e => update("briefNote", e.target.value)} placeholder="Short brief context, key message, references, or special instructions."></textarea>
        </div>
        <div className={`field ${errors.priority ? "field--error" : ""}`}>
          <label className="field__label">Priority <span className="req">*</span></label>
          <select className="select" value={value.priority} onChange={e => update("priority", e.target.value)}>
            <option value="low">Low</option><option value="normal">Normal</option>
            <option value="high">High</option><option value="urgent">Urgent</option>
          </select>
          {errors.priority && <div className="field__error">{errors.priority}</div>}
        </div>
        <div className={`field ${errors.urgentReason ? "field--error" : ""}`}>
          <label className="field__label">Urgent reason {value.priority === "urgent" && <span className="req">*</span>}</label>
          <input className="input" value={value.urgentReason} onChange={e => update("urgentReason", e.target.value)} disabled={value.priority !== "urgent"} placeholder={value.priority === "urgent" ? "Why urgent? (visible to supervisor)" : "Only required when priority is Urgent"} />
          {errors.urgentReason && <div className="field__error">{errors.urgentReason}</div>}
        </div>
        <div className={`field ${errors.dueDate ? "field--error" : ""}`}>
          <label className="field__label">1st Draft <span className="req">*</span></label>
          <input className="input" type="date" value={value.dueDate} readOnly disabled min={todayDate} />
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Generated from Launch Date minus 5 working days.</div>
          {errors.dueDate && <div className="field__error">{errors.dueDate}</div>}
        </div>
        <div className={`field ${errors.launchDate ? "field--error" : ""}`}>
          <label className="field__label">Launch date <span className="req">*</span></label>
          <input className="input" type="date" value={value.launchDate} onChange={e => update("launchDate", e.target.value)} min={todayDate} />
          {errors.launchDate && <div className="field__error">{errors.launchDate}</div>}
        </div>
        <div className="field field--full">
          <div className="reason-box">
            <strong>Note - fields not collected:</strong> preferred owner, manual effort, complexity. The engine sets effort and owner based on skill, capacity, WIP, and fairness rules.
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateResultScreen({ result, onAgain, onNav }) {
  const m = result.kind === "assigned" && result.owner ? MEMBERS_BY_ID[result.owner] : null;
  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="card">
        <div className="card__head">
          <span className="card__title">
            {result.kind === "assigned" && "Request submitted - assigned"}
            {result.kind === "queued" && "Request submitted - queued"}
            {result.kind === "need_brief" && "Request submitted - needs brief"}
            {result.kind === "quick_created" && "Quick task created"}
            {result.kind === "open_failed" && "Saved - detail did not open"}
            {result.kind === "error" && "Could not save"}
          </span>
          <span className="card__sub mono">{result.id}</span>
        </div>
        <div className="card__body">
          {result.kind === "assigned" && m && (
            <div className="col" style={{ gap: 12 }}>
              <div className="row" style={{ gap: 12 }}>
                <Avatar memberId={result.owner} size="avatar--xl" />
                <div>
                  <div className="strong" style={{ fontSize: 16 }}>{m.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{m.discipline} - capacity {m.capacityPerDay} pt/day</div>
                </div>
                <div className="spacer"></div>
                <Effort value={result.effort} lg />
                <span className="muted" style={{ fontSize: 12 }}>effort points</span>
              </div>
              <div className="reason-box">{result.reason}</div>
            </div>
          )}
          {result.kind === "queued" && (
            <div className="col" style={{ gap: 12 }}>
              <div className="muted">No eligible owner right now — request sits in the Central queue until capacity opens.</div>
              {result.effort != null && (
                <div className="row" style={{ gap: 6, alignItems: "center" }}>
                  <Effort value={result.effort} lg />
                  <span className="muted" style={{ fontSize: 12 }}>effort points</span>
                </div>
              )}
              <div className="reason-box reason-box--queued">{result.reason}</div>
            </div>
          )}
          {result.kind === "need_brief" && (
            <div className="col" style={{ gap: 12 }}>
              <div className="muted">Required brief fields are missing. Engine will not run until brief is complete.</div>
              <div className="reason-box reason-box--need">{result.reason}</div>
            </div>
          )}
          {result.kind === "quick_created" && (
            <div className="muted">Quick task saved to your team's list. It will appear under <strong>Quick tasks</strong> in My Work.</div>
          )}
          {result.kind === "error" && (
            <div className="reason-box reason-box--need">{result.message}</div>
          )}
          {result.kind === "open_failed" && (
            <div className="reason-box reason-box--need">{result.message} Open the list view and search for <span className="mono">{result.id}</span>.</div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="btn btn--secondary" onClick={onAgain}>Create another</button>
        <button className="btn btn--ghost" onClick={() => onNav("list")}>Open list view</button>
        <span className="spacer"></span>
        <button className="btn btn--primary" disabled title="Opening the newly created detail directly is planned for MVP 1.1">Open detail (MVP 1.1) <Icon name="arrow" /></button>
      </div>
    </div>
  );
}

/* ============================================================
   WORK ITEM DETAIL
   ============================================================ */
function DetailScreen({ onNav, onOpen, focusId }) {
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
  const selected = window.flowmateSelectedWorkItem && window.flowmateSelectedWorkItem.id === id
    ? window.flowmateSelectedWorkItem
    : null;
  // Do not fall back to a static item when the id cannot be resolved.
  // If we genuinely have nothing, render an empty state below.
  const w = selected || WORK_BY_ID[id] || null;

  // CR-2: ALL hooks must run unconditionally and BEFORE any early return
  // (Rules of Hooks). When a live refresh clears the selected item, `w` can
  // go from object -> null on a re-render of this same instance; returning
  // early before the hooks would run fewer hooks than the prior render and
  // crash the screen. Bodies and deps are null-safe so an unresolved `w`
  // cannot change hook order.
  const [actionMsg, setActionMsg] = useState(null);
  const [pending, setPending] = useState(false);
  // H-10: bumping this re-renders the detail after a mutation refreshes the
  // selected item, so status/owner/buttons reflect the DB without a manual reload.
  const [detailRefreshTick, setDetailRefreshTick] = useState(0);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkDescription, setLinkDescription] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [mentionUsers, setMentionUsers] = useState(window.FLOWMATE_MENTION_USERS || []);
  const [watcherUserId, setWatcherUserId] = useState("");
  const [detailLinks, setDetailLinks] = useState((w && w.links) || []);
  const [detailComments, setDetailComments] = useState((w && w.comments) || []);
  const [detailWatchers, setDetailWatchers] = useState((w && w.watchers) || []);
  const [detailAiTags, setDetailAiTags] = useState((w && w.aiTags) || []);

  useEffect(() => {
    if (!w) return;
    setDetailLinks(w.links || []);
    setDetailComments(w.comments || []);
    setDetailWatchers(w.watchers || []);
    setDetailAiTags(w.aiTags || []);
  }, [w && w.id, w && w.links, w && w.comments, w && w.watchers, w && w.aiTags]);

  useEffect(() => {
    let alive = true;
    if (!w || !w.isSupabaseRow || !window.loadFlowMateAiTags) return () => { alive = false; };
    window.loadFlowMateAiTags({ displayId: w.id })
      .then((tags) => {
        if (!alive) return;
        setDetailAiTags(tags || []);
        w.aiTags = tags || [];
        if (window.flowmateSelectedWorkItem && window.flowmateSelectedWorkItem.id === w.id) {
          window.flowmateSelectedWorkItem.aiTags = tags || [];
        }
      })
      .catch((error) => {
        console.warn("[FlowMate AI Tags] Load failed:", error && error.message);
      });
    return () => { alive = false; };
  }, [w && w.id, w && w.isSupabaseRow]);

  useEffect(() => {
    let alive = true;
    if (window.FLOWMATE_MENTION_USERS && window.FLOWMATE_MENTION_USERS.length > 0) {
      setMentionUsers(window.FLOWMATE_MENTION_USERS);
    }
    if (!window.loadFlowMateMentionUsers) return () => { alive = false; };
    window.loadFlowMateMentionUsers()
      .then((users) => { if (alive) setMentionUsers(users || []); })
      .catch((error) => {
        console.warn("[FlowMate Mentions] Load failed:", error && error.message);
      });
    return () => { alive = false; };
  }, [w && w.id]);

  if (!w) {
    return (
      <div className="page" style={{ maxWidth: 640 }}>
        <div className="row" style={{ marginBottom: 12, fontSize: 12 }}>
          <button className="btn btn--ghost btn--xs" onClick={goDetailBack}><Icon name="chevron" size={11} style={{ transform: "rotate(180deg)" }} /> {detailBackLabel}</button>
          <span className="muted">/</span>
          <span className="mono muted">{id}</span>
        </div>
        <div className="card">
          <div className="card__head"><span className="card__title">Work item not loaded</span></div>
          <div className="card__body">
            <div className="reason-box reason-box--need">
              We could not find <span className="mono">{id}</span> in the current view. Open it from <strong>My work</strong>, <strong>List</strong>, <strong>Board</strong>, or <strong>Central queue</strong> so the full row is fetched from Supabase.
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="btn btn--secondary" onClick={() => onNav("list")}><Icon name="list" /> Open list view</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const owner = MEMBERS_BY_ID[w.assignee];
  const isLiveDetail = Boolean(w.isSupabaseRow);
  const visibleBriefNote = w.briefNote || w.note || "";
  const visibleChecklistItems = w.checklistItems || [];
  const watcherOptions = (window.MEMBERS || []).filter((member) => member.userId);
  const hasCreativeDetails = w.type !== "quick" && Boolean(w.assetType || w.subtype || w.platform || w.channel || w.size || w.campaign || w.publishLabel || w.launchLabel);
  const currentUserId = window.FLOWMATE_CURRENT_USER?.id || null;
  const isAdminUser = window.FLOWMATE_CURRENT_USER?.role === "admin";
  const canStatusTransition = Boolean(w.isSupabaseRow && w.type !== "quick" && (
    isAdminUser ||
    currentUserId === w.requesterUserId ||
    currentUserId === w.assigneeUserId ||
    owner?.userId === currentUserId
  ));
  const visibleLinks = detailLinks;
  const visibleComments = detailComments;
  const visibleWatchers = detailWatchers;
  const visibleAiTags = detailAiTags;
  const mentionQueryMatch = commentBody.match(/(^|\s)@([^\s@]*)$/);
  const mentionQuery = mentionQueryMatch ? mentionQueryMatch[2].toLowerCase() : null;
  const mentionSuggestions = mentionQuery == null ? [] : mentionUsers
    .filter((user) => user.id !== currentUserId)
    .filter((user) => {
      const name = (user.name || "").toLowerCase();
      const email = (user.email || "").toLowerCase();
      return !mentionQuery || name.includes(mentionQuery) || email.includes(mentionQuery);
    })
    .slice(0, 6);

  function flowmateFormatCommentTime(dateValue) {
    if (!dateValue) return "";
    return new Date(dateValue)
      .toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
      .replace(/\b(am|pm)\b/i, (match) => match.toUpperCase());
  }

  function extractFlowMateMentionedUserIds(body) {
    const lowerBody = (body || "").toLowerCase();
    const ids = new Set();
    mentionUsers.forEach((user) => {
      const mentionText = `@${(user.name || "").toLowerCase()}`;
      if (user.id && mentionText.length > 1 && lowerBody.includes(mentionText)) {
        ids.add(user.id);
      }
    });
    return Array.from(ids);
  }

  function insertMentionUser(user) {
    if (!user || !user.id) return;
    setCommentBody((body) => {
      const next = body.match(/(^|\s)@([^\s@]*)$/)
        ? body.replace(/(^|\s)@([^\s@]*)$/, `$1@${user.name} `)
        : `${body}${body.endsWith(" ") || body.length === 0 ? "" : " "}@${user.name} `;
      return next;
    });
  }

  // H-10: re-fetch the open work item after a mutation and swap it into the
  // selected-item global, then bump the tick so the detail re-renders with
  // fresh status/owner/flags. The list refresh event is dispatched by the RPC
  // wrappers; this keeps the detail view itself in sync.
  async function refreshDetailItem() {
    if (!w || !window.loadFlowMateListRows) return;
    try {
      const rows = await window.loadFlowMateListRows();
      const updated = (rows || []).find((row) => row.id === w.id);
      if (updated) {
        window.flowmateSelectedWorkItem = updated;
        setDetailRefreshTick((tick) => tick + 1);
      }
    } catch (error) {
      console.warn("[FlowMate Detail] refresh after mutation failed:", error && error.message);
    }
  }

  async function runCreativeTransition(nextStatus) {
    if (!w.isSupabaseRow) {
      setActionMsg({ tone: "warn", text: "This item is not loaded from Supabase, so status changes are disabled." });
      return;
    }
    const options = {};
    if (nextStatus === "review") {
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
    if (nextStatus === "blocked") {
      const reason = await window.flowmatePrompt({
        title: "Block work", label: "Blocked reason", multiline: true, required: true,
      });
      if (!reason) return;
      options.blockedReason = reason;
    }
    setPending(true);
    try {
      await window.transitionFlowMateWorkStatus(w.id, nextStatus, options);
      await refreshDetailItem();
      setActionMsg({ tone: "ok", text: `${w.id} moved to ${STATUS_LABEL[nextStatus] || nextStatus}.` });
    } catch (error) {
      setActionMsg({ tone: "bad", text: window.flowmateUserError(error, "Status change failed.") });
    } finally {
      setPending(false);
    }
  }

  async function submitLink(event) {
    event.preventDefault();
    if (!w.isSupabaseRow) {
      setActionMsg({ tone: "warn", text: "This item is not loaded from Supabase, so links are disabled." });
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
        createdLabel: "Just now",
      };
      setDetailLinks((current) => {
        if (current.some((link) => link.id === addedLink.id)) return current;
        const next = [...current, addedLink];
        w.links = next;
        if (window.flowmateSelectedWorkItem && window.flowmateSelectedWorkItem.id === w.id) {
          window.flowmateSelectedWorkItem.links = next;
        }
        return next;
      });
      setLinkUrl("");
      setLinkDescription("");
      setActionMsg({ tone: "ok", text: "Link added." });
      window.dispatchEvent(new CustomEvent("flowmate:refresh-request", { detail: { reason: "work_item_links" } }));
    } catch (error) {
      setActionMsg({ tone: "bad", text: window.flowmateUserError(error, "Add link failed.") });
    } finally {
      setPending(false);
    }
  }

  async function submitComment(event) {
    event.preventDefault();
    if (!w.isSupabaseRow) {
      setActionMsg({ tone: "warn", text: "This item is not loaded from Supabase, so comments are disabled." });
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
        createdLabel: flowmateFormatCommentTime(data?.created_at || new Date().toISOString()),
      };
      setDetailComments((current) => {
        if (current.some((comment) => comment.id === addedComment.id)) return current;
        const next = [...current, addedComment];
        w.comments = next;
        if (window.flowmateSelectedWorkItem && window.flowmateSelectedWorkItem.id === w.id) {
          window.flowmateSelectedWorkItem.comments = next;
        }
        return next;
      });
      setCommentBody("");
      setActionMsg({ tone: "ok", text: "Comment added." });
      window.dispatchEvent(new CustomEvent("flowmate:refresh-request", { detail: { reason: "comments" } }));
    } catch (error) {
      setActionMsg({ tone: "bad", text: window.flowmateUserError(error, "Add comment failed.") });
    } finally {
      setPending(false);
    }
  }

  async function submitWatcher(event) {
    event.preventDefault();
    if (!w.isSupabaseRow) {
      setActionMsg({ tone: "warn", text: "This item is not loaded from Supabase, so watchers are disabled." });
      return;
    }
    setPending(true);
    try {
      const selectedWatcher = watcherOptions.find((member) => member.userId === watcherUserId);
      const data = await window.addFlowMateWorkItemWatcher(w.id, watcherUserId);
      const addedWatcher = {
        id: data?.id || `local-watcher-${watcherUserId}`,
        work_item_id: data?.work_item_id,
        watcher_user_id: data?.watcher_user_id || watcherUserId,
        added_by_user_id: data?.added_by_user_id || window.FLOWMATE_CURRENT_USER?.id,
        watcherName: selectedWatcher?.name || "Watcher",
        addedByName: window.FLOWMATE_CURRENT_USER?.name || "You",
        created_at: data?.created_at,
        createdLabel: "Just now",
      };
      setDetailWatchers((current) => {
        if (current.some((watcher) => watcher.watcher_user_id === addedWatcher.watcher_user_id)) return current;
        const next = [...current, addedWatcher];
        w.watchers = next;
        if (window.flowmateSelectedWorkItem && window.flowmateSelectedWorkItem.id === w.id) {
          window.flowmateSelectedWorkItem.watchers = next;
        }
        return next;
      });
      setWatcherUserId("");
      setActionMsg({ tone: "ok", text: "Watcher added." });
      window.dispatchEvent(new CustomEvent("flowmate:refresh-request", { detail: { reason: "work_item_watchers" } }));
    } catch (error) {
      setActionMsg({ tone: "bad", text: window.flowmateUserError(error, "Add watcher failed.") });
    } finally {
      setPending(false);
    }
  }

  async function addAiTag() {
    if (!w.isSupabaseRow || !window.addFlowMateAiTag) {
      setActionMsg({ tone: "warn", text: "This item is not loaded from Supabase, so AI tags are disabled." });
      return;
    }
    const tag = "AI";
    const normalizedTag = tag.trim().toLowerCase();
    if (normalizedTag === "ai" && detailAiTags.some((item) => String(item.tag || "").trim().toLowerCase() === normalizedTag)) {
      setActionMsg({ tone: "ok", text: "AI tag already added." });
      return;
    }
    setPending(true);
    try {
      const data = await window.addFlowMateAiTag({ displayId: w.id }, tag);
      setDetailAiTags((current) => {
        const next = current.some((item) => item.id === data.id || item.tag.toLowerCase() === data.tag.toLowerCase())
          ? current
          : [...current, data];
        w.aiTags = next;
        if (window.flowmateSelectedWorkItem && window.flowmateSelectedWorkItem.id === w.id) {
          window.flowmateSelectedWorkItem.aiTags = next;
        }
        return next;
      });
      setActionMsg({ tone: "ok", text: "AI tag added." });
    } catch (error) {
      setActionMsg({ tone: "bad", text: window.flowmateUserError(error, "Add AI tag failed.") });
    } finally {
      setPending(false);
    }
  }

  async function removeAiTag(tag) {
    if (!tag || !tag.id || !window.removeFlowMateAiTag) return;
    setPending(true);
    try {
      await window.removeFlowMateAiTag(tag.id);
      setDetailAiTags((current) => {
        const next = current.filter((item) => item.id !== tag.id);
        w.aiTags = next;
        if (window.flowmateSelectedWorkItem && window.flowmateSelectedWorkItem.id === w.id) {
          window.flowmateSelectedWorkItem.aiTags = next;
        }
        return next;
      });
      setActionMsg({ tone: "ok", text: "AI tag removed." });
    } catch (error) {
      setActionMsg({ tone: "bad", text: window.flowmateUserError(error, "Remove AI tag failed.") });
    } finally {
      setPending(false);
    }
  }

  async function runRerunAssignment() {
    if (!w.isSupabaseRow) {
      setActionMsg({ tone: "warn", text: "This item is not loaded from Supabase, so assignment rerun is disabled." });
      return;
    }
    setPending(true);
    try {
      const data = await window.rerunFlowMateAssignment(w.id);
      const r = data && data.result;
      await refreshDetailItem();
      setActionMsg({ tone: "ok", text: `Rerun result: ${r || "ok"}.` });
    } catch (error) {
      setActionMsg({ tone: "bad", text: window.flowmateUserError(error, "Rerun failed.") });
    } finally {
      setPending(false);
    }
  }

  async function runCancel() {
    if (!w.isSupabaseRow) {
      setActionMsg({ tone: "warn", text: "This item is not loaded from Supabase, so cancel is disabled." });
      return;
    }
    const reason = await window.flowmatePrompt({
      title: "Cancel work", label: "Cancel reason", multiline: true, required: true,
    });
    if (!reason) return;
    setPending(true);
    try {
      await window.cancelFlowMateWorkItem(w, reason);
      await refreshDetailItem();
      setActionMsg({ tone: "ok", text: `${w.id} cancelled.` });
    } catch (error) {
      setActionMsg({ tone: "bad", text: window.flowmateUserError(error, "Cancel failed.") });
    } finally {
      setPending(false);
    }
  }

  async function runAdminArchive() {
    if (!isAdminUser) return;
    if (!w.isSupabaseRow) {
      setActionMsg({ tone: "warn", text: "This item is not loaded from Supabase, so admin archive is disabled." });
      return;
    }
    const reason = await window.flowmatePrompt({
      title: "Archive work item",
      label: "Archive reason",
      note: "Soft archive, not a permanent delete. History, comments, links, watchers, and audit stay preserved.",
      multiline: true,
      required: true,
      confirmText: "Archive",
    });
    if (!reason || !reason.trim()) return;
    setPending(true);
    try {
      await window.adminArchiveFlowMateWorkItem(w.id, reason);
      w.archivedAt = new Date().toISOString();
      if (window.flowmateSelectedWorkItem && window.flowmateSelectedWorkItem.id === w.id) {
        window.flowmateSelectedWorkItem.archivedAt = w.archivedAt;
      }
      setActionMsg({ tone: "ok", text: `${w.id} archived. It will be hidden from normal active views after refresh.` });
      window.dispatchEvent(new CustomEvent("flowmate:refresh-request", { detail: { reason: "admin_archive" } }));
      window.dispatchEvent(new CustomEvent("flowmate:refresh-counts"));
    } catch (error) {
      setActionMsg({ tone: "bad", text: window.flowmateUserError(error, "Admin archive failed.") });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 12, fontSize: 12 }}>
        <button className="btn btn--ghost btn--xs" onClick={goDetailBack}><Icon name="chevron" size={11} style={{ transform: "rotate(180deg)" }} /> {detailBackLabel}</button>
        <span className="muted">/</span>
        <span className="mono muted">{w.id}</span>
      </div>

      <div className="page__header" style={{ marginBottom: 16 }}>
        <div>
          <div className="row" style={{ marginBottom: 6, gap: 8 }}>
            <span className="mono muted" style={{ fontSize: 12 }}>{w.id}</span>
            <TypePill type={w.type} />
            <StatusBadge status={w.status} />
            <PriorityBadge level={w.priority} />
            <DueBadge delta={w.dueDelta} label={w.dueLabel} status={w.status} />
          </div>
          <h1 className="page__title" style={{ fontSize: 22 }}>{w.title}</h1>
          <div className="page__sub" style={{ marginTop: 4 }}>{w.requesterTeam || "No team"} - {w.campaign || "No campaign"} - requested by {w.requester || "-"}</div>
        </div>
        <div className="page__actions">
          {canStatusTransition && ["assigned", "in_progress", "review"].includes(w.status) && (
            <button className="btn btn--danger" onClick={() => runCreativeTransition("blocked")} disabled={pending}><Icon name="block" /> Block</button>
          )}
          {canStatusTransition && !["delivered", "cancelled"].includes(w.status) && (
            <button className="btn btn--ghost" onClick={runCancel} disabled={pending}><Icon name="x" /> Cancel</button>
          )}
          {isAdminUser && w.isSupabaseRow && !w.archivedAt && (
            <button className="btn btn--danger" onClick={runAdminArchive} disabled={pending}><Icon name="layers" /> Admin archive</button>
          )}
          {canStatusTransition && w.status === "assigned" && (
            <button className="btn btn--primary" onClick={() => runCreativeTransition("in_progress")} disabled={pending}><Icon name="play" /> Start work</button>
          )}
          {canStatusTransition && w.status === "in_progress" && (
            <button className="btn btn--primary" onClick={() => runCreativeTransition("review")} disabled={pending}><Icon name="send" /> Submit review</button>
          )}
          {canStatusTransition && w.status === "review" && (
            <>
              <button className="btn btn--secondary" onClick={() => runCreativeTransition("in_progress")} disabled={pending}>Request changes</button>
              <button className="btn btn--primary" onClick={() => runCreativeTransition("delivered")} disabled={pending}><Icon name="check" /> Approve delivered</button>
            </>
          )}
          {canStatusTransition && w.status === "blocked" && (
            <button className="btn btn--primary" onClick={() => runCreativeTransition("in_progress")} disabled={pending}><Icon name="play" /> Resume</button>
          )}
          {canStatusTransition && w.status === "queued" && (
            <button className="btn btn--primary" onClick={runRerunAssignment} disabled={pending}><Icon name="rerun" /> Rerun assignment</button>
          )}
          {canStatusTransition && w.status === "need_brief" && (
            <button className="btn btn--primary" onClick={async () => {
              setPending(true);
              try {
                const data = await window.recheckFlowMateBrief(w.id);
                await refreshDetailItem();
                setActionMsg({ tone: "ok", text: `Brief rechecked: ${data && data.result || "ok"}.` });
              } catch (error) {
                setActionMsg({ tone: "bad", text: window.flowmateUserError(error, "Recheck failed.") });
              } finally { setPending(false); }
            }} disabled={pending}><Icon name="rerun" /> Recheck brief</button>
          )}
        </div>
      </div>

      {actionMsg && (
        <div className={`reason-box ${actionMsg.tone === "bad" ? "reason-box--need" : actionMsg.tone === "warn" ? "reason-box--queued" : ""}`} style={{ marginBottom: 12 }}>
          {actionMsg.text}
        </div>
      )}

      <div className="detail">
        <div className="detail__main">
          {visibleBriefNote && (
            <div className="card">
              <div className="card__head"><span className="card__title">{w.type === "quick" ? "Note" : "Brief Note"}</span></div>
              <div className="card__body">
                <div className="reason-box" style={{ whiteSpace: "pre-wrap" }}>{visibleBriefNote}</div>
              </div>
            </div>
          )}

          {w.type === "quick" && (
            <div className="card">
              <div className="card__head"><span className="card__title">Quick Task details</span></div>
              <div className="card__body">
                <div className="meta-row"><div className="meta-row__lbl">Requester Team / Function</div><div className="meta-row__val">{w.requesterTeam || "-"}</div></div>
                <div className="meta-row"><div className="meta-row__lbl">Project / campaign</div><div className="meta-row__val">{w.campaign || "-"}</div></div>
                <div className="meta-row"><div className="meta-row__lbl">Assignee</div><div className="meta-row__val">{owner?.name || "Unassigned"}</div></div>
                <div className="meta-row"><div className="meta-row__lbl">1st Review / Draft</div><div className="meta-row__val">{w.dueLabel || "-"}</div></div>
                <div className="meta-row"><div className="meta-row__lbl">Launch date</div><div className="meta-row__val">{w.launchFullLabel || w.launchLabel || "-"}</div></div>
                <div className="meta-row"><div className="meta-row__lbl">Priority</div><div className="meta-row__val"><PriorityBadge level={w.priority} /></div></div>
              </div>
            </div>
          )}

          {hasCreativeDetails && (
            <div className="card">
              <div className="card__head"><span className="card__title">Creative details</span></div>
              <div className="card__body">
                <div className="meta-row"><div className="meta-row__lbl">Campaign</div><div className="meta-row__val">{w.campaign || "-"}</div></div>
                <div className="meta-row"><div className="meta-row__lbl">Channel</div><div className="meta-row__val">{w.channel || w.platform || "-"}</div></div>
                <div className="meta-row"><div className="meta-row__lbl">Type / Skill</div><div className="meta-row__val">{w.subtype ? getFlowMateCreativeTypeLabel(w.subtype) : (ASSET_LABEL[w.assetType] || w.assetType || "-")}</div></div>
                <div className="meta-row"><div className="meta-row__lbl">Asset Count</div><div className="meta-row__val">{w.assetCount || 1}</div></div>
                <div className="meta-row"><div className="meta-row__lbl">Size / format</div><div className="meta-row__val">{w.size || "-"}</div></div>
                <div className="meta-row"><div className="meta-row__lbl">Brief link</div><div className="meta-row__val">{window.flowmateSafeHttpUrl && window.flowmateSafeHttpUrl(w.briefLink) ? <a href={window.flowmateSafeHttpUrl(w.briefLink)} target="_blank" rel="noopener noreferrer">Open brief</a> : "-"}</div></div>
                <div className="meta-row"><div className="meta-row__lbl">Reference link</div><div className="meta-row__val">{window.flowmateSafeHttpUrl && window.flowmateSafeHttpUrl(w.referenceLink) ? <a href={window.flowmateSafeHttpUrl(w.referenceLink)} target="_blank" rel="noopener noreferrer">Open reference</a> : "-"}</div></div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card__head">
              <span className="card__title">Link zone <span className="muted" style={{ fontWeight: 400, marginLeft: 6 }}>{visibleLinks.length}</span></span>
            </div>
            <div className="card__body" style={{ display: "grid", gap: 12 }}>
              {visibleLinks.length > 0 ? visibleLinks.map((link) => (
                <div className="meta-row" key={link.id}>
                  <div className="meta-row__lbl">{link.createdByName || "Link"}</div>
                  <div className="meta-row__val">
                    {window.flowmateSafeHttpUrl && window.flowmateSafeHttpUrl(link.url)
                      ? <a href={window.flowmateSafeHttpUrl(link.url)} target="_blank" rel="noopener noreferrer">{link.description || link.url}</a>
                      : <span style={{ wordBreak: "break-all" }}>{link.description || link.url}</span>}
                    {link.description && <div className="muted" style={{ fontSize: 11, wordBreak: "break-all" }}>{link.url}</div>}
                  </div>
                </div>
              )) : (
                <div className="muted">No links yet.</div>
              )}
              <form className="form-grid" onSubmit={submitLink}>
                <label className="field">
                  <span className="field__label">URL</span>
                  <input className="input" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." disabled={pending} />
                </label>
                <label className="field">
                  <span className="field__label">Description</span>
                  <input className="input" value={linkDescription} onChange={(e) => setLinkDescription(e.target.value)} placeholder="Brief, delivery, reference..." disabled={pending} />
                </label>
                <div className="field" style={{ justifyContent: "end" }}>
                  <span className="field__label">&nbsp;</span>
                  <button className="btn btn--primary" type="submit" disabled={pending || !linkUrl.trim()}><Icon name="link" /> Add link</button>
                </div>
              </form>
            </div>
          </div>

          {visibleChecklistItems.length > 0 && (
            <div className="card">
              <div className="card__head">
                <span className="card__title">Checklist <span className="muted" style={{ fontWeight: 400, marginLeft: 6 }}>{w.checklist?.done}/{w.checklist?.total}</span></span>
              </div>
              <div className="card__body checklist">
                {visibleChecklistItems.map((item) => (
                  <div key={item.id} className={`check-item ${item.is_done ? "is-checked" : ""}`}>
                    <span className={`check-box ${item.is_done ? "is-checked" : ""}`}>{item.is_done && <Icon name="check" size={11} />}</span>
                    <span className="check-item__lbl">{item.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <div className="card__head">
              <span className="card__title">Comment zone <span className="muted" style={{ fontWeight: 400, marginLeft: 6 }}>{visibleComments.length}</span></span>
            </div>
            <div className="card__body" style={{ display: "grid", gap: 12 }}>
              {visibleComments.length > 0 ? (
                visibleComments.map((comment) => (
                  <div className="comment" key={comment.id}>
                    <Avatar memberId={comment.author_user_id} size="avatar--lg" />
                    <div className="comment__body">
                      <div className="comment__head">
                        <span className="comment__author">{comment.authorName || "Unknown"}</span>
                        <span className="comment__time">{comment.createdLabel || flowmateFormatCommentTime(comment.created_at)}</span>
                      </div>
                      <div className="comment__text" style={{ whiteSpace: "pre-wrap" }}>{comment.body}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="muted">No comments yet.</div>
              )}
              <form className="form-grid" onSubmit={submitComment}>
                <label className="field field--full">
                  <span className="field__label">Comment</span>
                  <textarea className="textarea" value={commentBody} onChange={(e) => setCommentBody(e.target.value)} placeholder="Add comment" disabled={pending}></textarea>
                  {mentionSuggestions.length > 0 && (
                    <div className="reason-box" style={{ padding: 8, display: "grid", gap: 4 }}>
                      {mentionSuggestions.map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          className="btn btn--xs btn--ghost"
                          style={{ justifyContent: "flex-start" }}
                          onClick={() => insertMentionUser(user)}
                        >
                          @{user.name}
                          {user.email && <span className="muted" style={{ marginLeft: 6 }}>{user.email}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </label>
                <div className="field" style={{ justifyContent: "end" }}>
                  <span className="field__label">&nbsp;</span>
                  <button className="btn btn--primary" type="submit" disabled={pending || !commentBody.trim()}><Icon name="send" /> Add comment</button>
                </div>
              </form>
            </div>
          </div>

        </div>

        <div className="detail__side">
          <div className="card">
            <div className="card__body">
              <div className="meta-row">
                <div className="meta-row__lbl">Requester</div>
                <div className="meta-row__val">{w.requester || "-"} <span className="muted">- {w.requesterTeam || "No team"}</span></div>
              </div>
              <div className="meta-row">
                <div className="meta-row__lbl">Effort</div>
                <div className="meta-row__val"><Effort value={w.effort} lg /> <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>~{w.effort}h</span></div>
              </div>
              <div className="meta-row">
                <div className="meta-row__lbl">Review round</div>
                <div className="meta-row__val">{w.reviewRound - 0} <span className="muted" style={{ fontSize: 11 }}>(incremented only on requested changes)</span></div>
              </div>
              <div className="meta-row">
                <div className="meta-row__lbl">Assignee</div>
                <div className="meta-row__val row" style={{ gap: 6 }}>
                  <Avatar memberId={w.assignee} /> <span className="strong">{owner?.name || "Unassigned"}</span>
                </div>
              </div>
              <div className="meta-row">
                <div className="meta-row__lbl">Watchers</div>
                <div className="meta-row__val" style={{ display: "grid", gap: 8 }}>
                  {visibleWatchers.length > 0 ? (
                    <div style={{ display: "grid", gap: 6 }}>
                      {visibleWatchers.map((watcher) => (
                        <div className="row" key={watcher.id} style={{ gap: 6 }}>
                          <Icon name="users" size={13} />
                          <span>{watcher.watcherName || watcher.watcher_user_id}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="muted">No watchers</span>
                  )}
                  <form className="watcher-add-form" onSubmit={submitWatcher}>
                    <select className="select watcher-add-form__select" value={watcherUserId} onChange={(e) => setWatcherUserId(e.target.value)} disabled={pending}>
                      <option value="">Add watcher</option>
                      {watcherOptions.map((member) => (
                        <option key={member.userId} value={member.userId}>{member.name}</option>
                      ))}
                    </select>
                    <button className="btn btn--secondary watcher-add-form__button" type="submit" disabled={pending || !watcherUserId}><Icon name="plus" /> Add watcher</button>
                  </form>
                </div>
              </div>
              <div className="meta-row">
                <div className="meta-row__lbl">Created</div>
                <div className="meta-row__val">{w.createdLabel || "-"}</div>
              </div>
              <div className="meta-row">
                <div className="meta-row__lbl">Publish Date</div>
                <div className="meta-row__val">{w.publishFullLabel || w.publishLabel || "-"}</div>
              </div>
              <div className="meta-row">
                <div className="meta-row__lbl">{w.type === "quick" ? "1st Review / Draft" : "1st Draft"}</div>
                <div className="meta-row__val">{w.dueFullLabel || w.dueLabel || "-"}</div>
              </div>
              <div className="meta-row">
                <div className="meta-row__lbl">Launch date</div>
                <div className="meta-row__val">{w.launchFullLabel || w.launchLabel || "-"}</div>
              </div>
              <div className="meta-row">
                <div className="meta-row__lbl">AI Tag</div>
                <div className="meta-row__val">
                  <div className="ai-tag-list">
                    {visibleAiTags.length > 0 ? visibleAiTags.map((tag) => (
                      <span className="tag ai-tag" key={tag.id || tag.tag}>
                        <Icon name="zap" size={11} /> {tag.tag}
                        {w.isSupabaseRow && window.removeFlowMateAiTag && (
                          <button type="button" className="ai-tag__remove" onClick={() => removeAiTag(tag)} disabled={pending} aria-label={`Remove ${tag.tag}`}>
                            <Icon name="x" size={10} />
                            <span>Remove tag</span>
                          </button>
                        )}
                      </span>
                    )) : (
                      <span className="muted">No AI tags</span>
                    )}
                    <button type="button" className="btn btn--xs btn--secondary" onClick={addAiTag} disabled={pending || !w.isSupabaseRow || !window.addFlowMateAiTag}>
                      <Icon name="plus" /> Add AI Tag
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {w.queueReason && (
            <div className="card">
              <div className="card__head"><span className="card__title">Assignment reason</span></div>
              <div className="card__body">
                <div className="reason-box">{w.queueReason}</div>
              </div>
            </div>
          )}

          {w.urgentReason && (
            <div className="card">
              <div className="card__head"><span className="card__title">Urgent reason</span></div>
              <div className="card__body">
                <div className="reason-box reason-box--queued">{w.urgentReason}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { MyWorkScreen, CreateScreen, DetailScreen });
