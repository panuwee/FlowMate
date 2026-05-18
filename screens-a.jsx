// FlowMate โ€” Screens part A: My Work, Create, Detail
const { useState, useEffect } = React;

/* ============================================================
   MY WORK
   ============================================================ */
function MyWorkScreen({ onOpen, onNav, searchQuery = "" }) {
  // From the perspective of "Pond" (a hybrid-skill member)
  const meIds = ["m-pond", "10000000-0000-0000-0000-000000000001"];
  const [sourceRows, setSourceRows] = useState(WORK);
  const [loadState, setLoadState] = useState({ status: "loading", message: "Loading Supabase data..." });

  async function loadMyWorkRows(alive = true) {
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
      console.error("[FlowMate My Work] Supabase load failed:", error);
      setSourceRows(WORK);
      setLoadState({ status: "fallback", message: `Using mock data: ${error.message || "Supabase query failed."}` });
    }
  }

  useEffect(() => {
    let alive = true;
    loadMyWorkRows(alive);
    return () => { alive = false; };
  }, []);

  async function handleQuickDone(work) {
    if (!work.isSupabaseRow) return;

    try {
      await window.completeFlowMateQuickTask(work.id);
      await loadMyWorkRows(true);
      setLoadState({ status: "live", message: `Completed ${work.id}` });
    } catch (error) {
      console.error("[FlowMate My Work] Complete quick task failed:", error);
      setLoadState({ status: "error", message: `Could not complete ${work.id}: ${error.message || "RPC failed."}` });
    }
  }

  async function handleChecklistAdd(work, title) {
    if (!work.isSupabaseRow) return;

    try {
      await window.addFlowMateQuickTaskChecklistItem(work.id, title);
      await loadMyWorkRows(true);
      setLoadState({ status: "live", message: `Added checklist item to ${work.id}` });
    } catch (error) {
      console.error("[FlowMate My Work] Add checklist item failed:", error);
      setLoadState({ status: "error", message: `Could not add checklist item: ${error.message || "RPC failed."}` });
    }
  }

  async function handleChecklistToggle(item, isDone) {
    try {
      await window.toggleFlowMateQuickTaskChecklistItem(item.id, isDone);
      await loadMyWorkRows(true);
      setLoadState({ status: "live", message: "Checklist updated" });
    } catch (error) {
      console.error("[FlowMate My Work] Toggle checklist item failed:", error);
      setLoadState({ status: "error", message: `Could not update checklist: ${error.message || "RPC failed."}` });
    }
  }

  async function handleCommentAdd(work, body) {
    if (!work.isSupabaseRow) return;

    try {
      await window.addFlowMateWorkItemComment(work.id, body);
      await loadMyWorkRows(true);
      setLoadState({ status: "live", message: `Added comment to ${work.id}` });
    } catch (error) {
      console.error("[FlowMate My Work] Add comment failed:", error);
      setLoadState({ status: "error", message: `Could not add comment: ${error.message || "RPC failed."}` });
    }
  }

  async function handleCommentEdit(comment) {
    const nextBody = window.prompt("Edit comment", comment.body);
    if (nextBody == null) return;

    try {
      await window.updateFlowMateOwnComment(comment.id, nextBody);
      await loadMyWorkRows(true);
      setLoadState({ status: "live", message: "Comment updated" });
    } catch (error) {
      console.error("[FlowMate My Work] Edit comment failed:", error);
      setLoadState({ status: "error", message: `Could not edit comment: ${error.message || "RPC failed."}` });
    }
  }

  async function handleCommentDelete(comment) {
    if (!window.confirm("Delete this comment?")) return;

    try {
      await window.deleteFlowMateOwnComment(comment.id);
      await loadMyWorkRows(true);
      setLoadState({ status: "live", message: "Comment deleted" });
    } catch (error) {
      console.error("[FlowMate My Work] Delete comment failed:", error);
      setLoadState({ status: "error", message: `Could not delete comment: ${error.message || "RPC failed."}` });
    }
  }

  async function handleCreativeTransition(work, nextStatus) {
    if (!work.isSupabaseRow) return;

    const options = {};
    if (nextStatus === "review") {
      const deliveryLink = window.prompt("Delivery link is required");
      if (!deliveryLink) return;
      options.deliveryLink = deliveryLink;
    }

    if (nextStatus === "blocked") {
      const blockedReason = window.prompt("Blocked reason is required");
      if (!blockedReason) return;
      options.blockedReason = blockedReason;
    }

    try {
      await window.transitionFlowMateCreativeStatus(work.id, nextStatus, options);
      await loadMyWorkRows(true);
      setLoadState({ status: "live", message: `${work.id} moved to ${STATUS_LABEL[nextStatus] || nextStatus}` });
    } catch (error) {
      console.error("[FlowMate My Work] Creative status transition failed:", error);
      setLoadState({ status: "error", message: `Could not update ${work.id}: ${error.message || "RPC failed."}` });
    }
  }

  const mine = sourceRows.filter(w => meIds.includes(w.assignee) && window.matchesFlowMateSearch(w, searchQuery));
  const overdue = mine.filter(w => w.overdue);
  const dueSoon = mine.filter(w => !w.overdue && w.dueDelta != null && w.dueDelta >= 0 && w.dueDelta <= 2 && ["assigned","in_progress","review"].includes(w.status));
  const inProgress = mine.filter(w => w.status === "in_progress" && !w.overdue && !dueSoon.includes(w));
  const assigned = mine.filter(w => w.status === "assigned" && !dueSoon.includes(w));
  const review = mine.filter(w => w.status === "review" && !dueSoon.includes(w));
  const quick = mine.filter(w => w.type === "quick");
  const blocked = mine.filter(w => w.status === "blocked");
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
          <div className="page__sub">Hi Pond โ€” here's what's open as of {TODAY}, 09:42 SGT.</div>
        </div>
        <div className="page__actions">
          <button className="btn btn--secondary"><Icon name="calendar" /> This week</button>
          <button className="btn btn--primary" onClick={() => onNav("create")}><Icon name="plus" /> New</button>
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat stat--accent"><div className="stat__num">{overdue.length}</div><div className="stat__lbl">Overdue</div></div>
        <div className="stat stat--warn"><div className="stat__num">{dueSoon.length}</div><div className="stat__lbl">Due soon</div></div>
        <div className="stat stat--info"><div className="stat__num">{inProgress.length + dueSoon.filter(d=>d.status==="in_progress").length}</div><div className="stat__lbl">In progress</div></div>
        <div className="stat"><div className="stat__num">{review.length + dueSoon.filter(d=>d.status==="review").length}</div><div className="stat__lbl">Review</div></div>
        <div className="stat"><div className="stat__num">{blocked.length}</div><div className="stat__lbl">Blocked</div></div>
      </div>

      <MyWorkGroup title="Overdue" tone="overdue" items={overdue} onOpen={onOpen} onQuickDone={handleQuickDone} onCreativeTransition={handleCreativeTransition} />
      <MyWorkGroup title="Today & Due soon" items={dueSoon} onOpen={onOpen} onQuickDone={handleQuickDone} onCreativeTransition={handleCreativeTransition} />
      <MyWorkGroup title="In progress" items={inProgress} onOpen={onOpen} onQuickDone={handleQuickDone} onCreativeTransition={handleCreativeTransition} />
      <MyWorkGroup title="Assigned" items={assigned} onOpen={onOpen} onQuickDone={handleQuickDone} onCreativeTransition={handleCreativeTransition} />
      <MyWorkGroup title="In review by requester" items={review} onOpen={onOpen} onQuickDone={handleQuickDone} onCreativeTransition={handleCreativeTransition} />
      <MyWorkGroup title="Quick tasks" items={quick} onOpen={onOpen} onQuickDone={handleQuickDone} onChecklistAdd={handleChecklistAdd} onChecklistToggle={handleChecklistToggle} onCommentAdd={handleCommentAdd} onCommentEdit={handleCommentEdit} onCommentDelete={handleCommentDelete} compact />
    </div>
  );
}

function MyWorkGroup({ title, items, onOpen, onQuickDone, onCreativeTransition, onChecklistAdd, onChecklistToggle, onCommentAdd, onCommentEdit, onCommentDelete, tone, compact }) {
  return (
    <div className="section" id={tone === "overdue" ? "my-work-overdue" : undefined}>
      <div className={`section__head${tone === "overdue" ? " section__head--overdue" : ""}`}>
        <span className="section__title">{title}</span>
        <span className="section__count">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div style={{ padding: "16px", color: "var(--garena-grey)", fontSize: 13 }}>No items.</div>
      ) : (
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
              <tr key={w.id} className={w.overdue ? "is-overdue" : ""} onClick={() => !w.isSupabaseRow && onOpen(w.id)}>
                <td className="col-id mono">{w.id}</td>
                <td className="col-title">{w.title}</td>
                <td><TypePill type={w.type} /></td>
                <td><StatusBadge status={w.status} /></td>
                <td><PriorityBadge level={w.priority} /></td>
                <td><Effort value={w.effort} /></td>
                <td><Progress {...(w.checklist || { done: 0, total: 0 })} /></td>
                <td><DueBadge delta={w.dueDelta} label={w.dueLabel} status={w.status} /></td>
                <td className="col-right" onClick={(e) => e.stopPropagation()}>
                  {w.type === "quick" && w.status !== "delivered" && (
                    <button className="btn btn--xs btn--secondary" onClick={() => onQuickDone && onQuickDone(w)}>Mark done</button>
                  )}
                  {w.type !== "quick" && w.status === "assigned" && <button className="btn btn--xs btn--secondary" onClick={() => onCreativeTransition && onCreativeTransition(w, "in_progress")}><Icon name="play" size={11} /> Start</button>}
                  {w.type !== "quick" && w.status === "in_progress" && <button className="btn btn--xs btn--primary" onClick={() => onCreativeTransition && onCreativeTransition(w, "review")}><Icon name="send" size={11} /> Submit review</button>}
                  {w.type !== "quick" && w.status === "review" && <button className="btn btn--xs btn--ghost">Awaiting requester</button>}
                  {w.type !== "quick" && ["assigned", "in_progress", "review"].includes(w.status) && <button className="btn btn--xs btn--danger" onClick={() => onCreativeTransition && onCreativeTransition(w, "blocked")}>Block</button>}
                  {w.type !== "quick" && w.status === "blocked" && <button className="btn btn--xs btn--danger">Resolve block</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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
                {comment.author_user_id === window.FLOWMATE_MOCK_USERS?.pond && (
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
   CREATE โ€” Quick Task + Creative Request
   ============================================================ */
function CreateScreen({ onNav }) {
  const [mode, setMode] = useState("creative");
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quickDraft, setQuickDraft] = useState({
    title: "",
    note: "",
    projectName: "Internal - GD/VE",
    assigneeUserId: window.FLOWMATE_MOCK_USERS?.pond || "00000000-0000-0000-0000-000000000001",
    dueDate: "2026-05-18",
    priority: "normal",
  });

  async function handleSubmit() {
    setIsSubmitting(true);
    if (mode === "quick") {
      try {
        const created = await window.createFlowMateQuickTask(quickDraft);
        setResult({ kind: "quick_created", id: created.display_id || created.id });
      } catch (error) {
        console.error("[FlowMate Create] Quick task failed:", error);
        setResult({ kind: "error", id: "Not saved", message: error.message || "Quick task could not be created." });
      } finally {
        setIsSubmitting(false);
      }
    } else {
      setResult({
        kind: "assigned",
        id: "CR-1057",
        owner: "m-eye",
        effort: 4,
        reason: "Auto: static graphic assigned to Eye by skill, WIP (1/3), and remaining capacity through May 22.",
      });
      setIsSubmitting(false);
    }
    setSubmitted(true);
  }

  if (submitted) return <CreateResultScreen result={result} onAgain={() => { setSubmitted(false); setResult(null); }} onNav={onNav} />;

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="page__header">
        <div>
          <h1 className="page__title">Create</h1>
          <div className="page__sub">Pick the right entry point โ€” Quick task is notebook-style, Creative request enters the assignment engine.</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <button className={`choice-card ${mode === "quick" ? "is-active" : ""}`} onClick={() => setMode("quick")}>
          <div className="choice-card__title"><Icon name="zap" /> Quick task</div>
          <div className="choice-card__sub">Small internal task, follow-up, or reminder. Stays in your team's quick-task list.</div>
          <ul className="choice-card__list">
            <li>No effort calculation, no auto-assignment</li>
            <li>Self-assign or pick a teammate</li>
            <li>Counted separately from creative capacity</li>
          </ul>
        </button>
        <button className={`choice-card ${mode === "creative" ? "is-active" : ""}`} onClick={() => setMode("creative")}>
          <div className="choice-card__title"><Icon name="layers" /> Creative request</div>
          <div className="choice-card__sub">Structured request for production creative โ€” banner, video, motion, esport pack.</div>
          <ul className="choice-card__list">
            <li>Brief validation, auto effort point, auto routing</li>
            <li>Owner is decided by the engine โ€” no preferred owner</li>
            <li>Hybrid stays Queued and must be split</li>
          </ul>
        </button>
      </div>

      <div className="card">
        <div className="card__head">
          <span className="card__title">{mode === "quick" ? "New quick task" : "New creative request"}</span>
          <span className="card__sub">{mode === "creative" ? "All fields with * are required for assignment." : "Only title and due date are required."}</span>
        </div>
        <div className="card__body">
          {mode === "quick" ? <QuickTaskForm value={quickDraft} onChange={setQuickDraft} /> : <CreativeRequestForm />}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn btn--ghost" onClick={() => onNav("my-work")}>Cancel</button>
        <button className="btn btn--secondary">Save draft</button>
        <button className="btn btn--primary" onClick={handleSubmit} disabled={isSubmitting}>
          <Icon name="send" /> {isSubmitting ? "Saving..." : mode === "quick" ? "Create quick task" : "Submit request"}
        </button>
      </div>
    </div>
  );
}

function QuickTaskForm({ value, onChange }) {
  function update(field, nextValue) {
    onChange({ ...value, [field]: nextValue });
  }

  return (
    <div className="form-grid">
      <div className="field field--full">
        <label className="field__label">Title <span className="req">*</span></label>
        <input className="input" value={value.title} onChange={(e) => update("title", e.target.value)} placeholder="e.g. Pull retention numbers for Monday standup" />
      </div>
      <div className="field field--full">
        <label className="field__label">Note</label>
        <textarea className="textarea" value={value.note} onChange={(e) => update("note", e.target.value)} placeholder="Short description - what needs doing, any context, link to the doc."></textarea>
      </div>
      <div className="field">
        <label className="field__label">Project / campaign</label>
        <select className="select" value={value.projectName} onChange={(e) => update("projectName", e.target.value)}>
          <option value="Internal - GD/VE">Internal - GD/VE</option>
          <option value="FF May Drop">FF May Drop</option>
          <option value="FFPL Finals">FFPL Finals</option>
          <option value="">None</option>
        </select>
      </div>
      <div className="field">
        <label className="field__label">Assignee</label>
        <select className="select" value={value.assigneeUserId} onChange={(e) => update("assigneeUserId", e.target.value)}>
          <option value={window.FLOWMATE_MOCK_USERS?.pond}>Me (Pond)</option>
          <option value={window.FLOWMATE_MOCK_USERS?.jo}>Jo</option>
          <option value={window.FLOWMATE_MOCK_USERS?.tong}>Tong</option>
          <option value={window.FLOWMATE_MOCK_USERS?.eye}>Eye</option>
          <option value={window.FLOWMATE_MOCK_USERS?.vee}>Vee</option>
        </select>
      </div>
      <div className="field">
        <label className="field__label">Due date <span className="req">*</span></label>
        <input className="input" value={value.dueDate} onChange={(e) => update("dueDate", e.target.value)} type="date" />
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
function CreativeRequestForm() {
  const [assetType, setAssetType] = useState("static-graphic");
  const [priority, setPriority] = useState("normal");
  return (
    <div className="form-grid">
      <div className="field field--full">
        <label className="field__label">Title <span className="req">*</span></label>
        <input className="input" placeholder="e.g. AOV ranked season โ€” IG carousel set (6 frames)" />
      </div>
      <div className="field">
        <label className="field__label">Requester team <span className="req">*</span></label>
        <select className="select"><option>Marketing</option><option>Esport Ops</option><option>Community</option><option>Sales</option><option>Product</option></select>
      </div>
      <div className="field">
        <label className="field__label">Campaign <span className="req">*</span></label>
        <input className="input" placeholder="e.g. AOV S24 Launch" />
      </div>
      <div className="field">
        <label className="field__label">Asset type <span className="req">*</span></label>
        <select className="select" value={assetType} onChange={e => setAssetType(e.target.value)}>
          <option value="static-graphic">Static graphic</option>
          <option value="general-video">General video</option>
          <option value="motion">Motion</option>
          <option value="esport-video">Esport video</option>
          <option value="hybrid">Hybrid (static + video)</option>
        </select>
      </div>
      <div className="field">
        <label className="field__label">Asset subtype <span className="req">*</span></label>
        <select className="select">
          <option>Simple banner / ad visual</option>
          <option>Standard banner / complex social content</option>
          <option>Esport graphic pack โ€” minor</option>
          <option>Esport graphic pack โ€” full set</option>
          <option>Short-form (TikTok / Reels)</option>
          <option>Standard video / YouTube vlog</option>
          <option>High-retention short video</option>
          <option>Promotional esport / highlight reel</option>
        </select>
      </div>
      <div className="field">
        <label className="field__label">Platform <span className="req">*</span></label>
        <input className="input" placeholder="Instagram, TikTok, YouTube, Webโ€ฆ" />
      </div>
      <div className="field">
        <label className="field__label">Size / format <span className="req">*</span></label>
        <input className="input" placeholder="e.g. 1080ร—1350, 1080ร—1920" />
      </div>
      <div className="field">
        <label className="field__label">Brief link <span className="req">*</span></label>
        <input className="input" placeholder="https://docs.google.com/โ€ฆ" />
      </div>
      <div className="field">
        <label className="field__label">Reference link</label>
        <input className="input" placeholder="Optional โ€” Figma / mood board / past asset" />
      </div>
      <div className="field">
        <label className="field__label">Priority <span className="req">*</span></label>
        <select className="select" value={priority} onChange={e => setPriority(e.target.value)}>
          <option value="low">Low</option><option value="normal">Normal</option>
          <option value="high">High</option><option value="urgent">Urgent</option>
        </select>
      </div>
      <div className="field">
        <label className="field__label">Urgent reason {priority === "urgent" && <span className="req">*</span>}</label>
        <input className="input" disabled={priority !== "urgent"} placeholder={priority === "urgent" ? "Why urgent? (visible to supervisor)" : "Only required when priority is Urgent"} />
      </div>
      <div className="field">
        <label className="field__label">Due date <span className="req">*</span></label>
        <input className="input" type="date" defaultValue="2026-05-22" />
      </div>
      <div className="field">
        <label className="field__label">Launch date <span className="req">*</span></label>
        <input className="input" type="date" defaultValue="2026-05-25" />
      </div>

      {assetType === "hybrid" && (
        <div className="field field--full">
          <div className="reason-box reason-box--queued">
            <strong>Heads up โ€” hybrid requests are queued automatically.</strong> Static and video work are split into separate requests so the assignment engine can route by skill. Effort will be set to 8 with <span className="mono">needs_split = true</span>.
          </div>
        </div>
      )}
      <div className="field field--full">
        <div className="reason-box">
          <strong>Note โ€” fields not collected:</strong> preferred owner, manual effort, complexity. The engine sets effort and owner based on skill, capacity, WIP, and fairness rules.
        </div>
      </div>
    </div>
  );
}

function CreateResultScreen({ result, onAgain, onNav }) {
  const m = result.kind === "assigned" ? MEMBERS_BY_ID[result.owner] : null;
  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="card">
        <div className="card__head">
          <span className="card__title">
            {result.kind === "assigned" && "Request submitted โ€” assigned"}
            {result.kind === "queued" && "Request submitted โ€” queued"}
            {result.kind === "need_brief" && "Request submitted โ€” needs brief"}
            {result.kind === "quick_created" && "Quick task created"}
            {result.kind === "error" && "Could not save"}
          </span>
          <span className="card__sub mono">{result.id}</span>
        </div>
        <div className="card__body">
          {result.kind === "assigned" && (
            <div className="col" style={{ gap: 12 }}>
              <div className="row" style={{ gap: 12 }}>
                <Avatar memberId={result.owner} size="avatar--xl" />
                <div>
                  <div className="strong" style={{ fontSize: 16 }}>{m.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{m.discipline} ยท capacity {m.capacityPerDay} pt/day</div>
                </div>
                <div className="spacer"></div>
                <Effort value={result.effort} lg />
                <span className="muted" style={{ fontSize: 12 }}>effort points</span>
              </div>
              <div className="reason-box">{result.reason}</div>
            </div>
          )}
          {result.kind === "quick_created" && (
            <div className="muted">Quick task saved to your team's list. It will appear under <strong>Quick tasks</strong> in My Work.</div>
          )}
          {result.kind === "error" && (
            <div className="reason-box reason-box--need">{result.message}</div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="btn btn--secondary" onClick={onAgain}>Create another</button>
        <button className="btn btn--ghost" onClick={() => onNav("list")}>Open list view</button>
        <span className="spacer"></span>
        <button className="btn btn--primary" onClick={() => onNav("detail")}>Open detail <Icon name="arrow" /></button>
      </div>
    </div>
  );
}

/* ============================================================
   WORK ITEM DETAIL
   ============================================================ */
function DetailScreen({ onNav, onOpen, focusId }) {
  const id = focusId || "CR-1051";
  const selected = window.flowmateSelectedWorkItem && window.flowmateSelectedWorkItem.id === id
    ? window.flowmateSelectedWorkItem
    : null;
  const w = selected || WORK_BY_ID[id] || WORK_BY_ID["CR-1051"];
  const owner = MEMBERS_BY_ID[w.assignee];

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 12, fontSize: 12 }}>
        <button className="btn btn--ghost btn--xs" onClick={() => onNav("my-work")}><Icon name="chevron" size={11} style={{ transform: "rotate(180deg)" }} /> My work</button>
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
          <button className="btn btn--ghost"><Icon name="more" /></button>
          <button className="btn btn--danger"><Icon name="block" /> Block</button>
          <button className="btn btn--secondary"><Icon name="link" /> Open brief</button>
          {w.status === "in_progress" && <button className="btn btn--primary"><Icon name="send" /> Submit for review</button>}
          {w.status === "assigned" && <button className="btn btn--primary"><Icon name="play" /> Start work</button>}
          {w.status === "review" && <button className="btn btn--primary"><Icon name="check" /> Approve delivered</button>}
          {w.status === "queued" && <button className="btn btn--primary"><Icon name="rerun" /> Rerun assignment</button>}
        </div>
      </div>

      <div className="detail">
        <div className="detail__main">
          <div className="card">
            <div className="card__head"><span className="card__title">Brief</span></div>
            <div className="card__body" style={{ lineHeight: 1.6, color: "var(--garena-iron)", fontSize: 14 }}>
              <p style={{ marginBottom: 12 }}>
                Vertical 15-second teaser announcing the CODM World Championship grand finals (June 8). Hook with the trophy reveal in the first 1.5s, hold on top-3 team logos through second 8, and close with date plate + sponsor lockup. Music brief and beat-marker timeline are in the linked doc.
              </p>
              <div className="row" style={{ gap: 16, marginTop: 8, flexWrap: "wrap" }}>
                <a href="#"><Icon name="file" size={12} /> Brief โ€” CODM Worlds Teaser.gdoc</a>
                <a href="#"><Icon name="file" size={12} /> Reference reel โ€” last year.mp4</a>
                <a href="#"><Icon name="link" size={12} /> Music brief.doc</a>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card__head"><span className="card__title">Creative details</span></div>
            <div className="card__body">
              <div className="meta-row"><div className="meta-row__lbl">Asset type</div><div className="meta-row__val">{ASSET_LABEL[w.assetType] || w.assetType || "-"}{w.subtype && ` - ${w.subtype}`}</div></div>
              <div className="meta-row"><div className="meta-row__lbl">Platform</div><div className="meta-row__val">{w.platform || "-"}</div></div>
              <div className="meta-row"><div className="meta-row__lbl">Size / format</div><div className="meta-row__val">{w.size || "-"}</div></div>
              <div className="meta-row"><div className="meta-row__lbl">Launch date</div><div className="meta-row__val">Jun 6, 2026</div></div>
            </div>
          </div>

          <div className="card">
            <div className="card__head">
              <span className="card__title">Checklist <span className="muted" style={{ fontWeight: 400, marginLeft: 6 }}>{w.checklist?.done}/{w.checklist?.total}</span></span>
              <button className="btn btn--xs btn--ghost"><Icon name="plus" size={11} /> Add item</button>
            </div>
            <div className="card__body checklist">
              {[
                { txt: "Storyboard locked with esport ops", done: true },
                { txt: "Trophy reveal shot โ€” color graded", done: true },
                { txt: "Team logo plates โ€” animated", done: true },
                { txt: "Date plate + sponsor lockup", done: false },
                { txt: "Sound mix v1 โ€” handoff to audio", done: false },
              ].map((c, i) => (
                <div key={i} className={`check-item ${c.done ? "is-checked" : ""}`}>
                  <span className={`check-box ${c.done ? "is-checked" : ""}`}>{c.done && <Icon name="check" size={11} />}</span>
                  <span className="check-item__lbl">{c.txt}</span>
                  <span className="muted" style={{ fontSize: 11 }}>{c.done ? "Vee ยท May 14" : ""}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card__head">
              <span className="card__title">Comments <span className="muted" style={{ fontWeight: 400, marginLeft: 6 }}>3</span></span>
            </div>
            <div className="card__body">
              <div className="comment">
                <Avatar memberId="m-vee" size="avatar--lg" />
                <div className="comment__body">
                  <div className="comment__head"><span className="comment__author">Vee</span><span className="comment__time">May 14, 17:20</span></div>
                  <div className="comment__text">First cut ready. Holding on team logo plate longer than spec โ€” Mira wanted a beat to read names. Let me know if that breaks the music sync.</div>
                </div>
              </div>
              <div className="comment">
                <Avatar memberId={null} size="avatar--lg" />
                <div className="comment__body">
                  <div className="comment__head"><span className="comment__author">Mira Santos</span><span className="comment__time">May 14, 17:42</span></div>
                  <div className="comment__text">Beat held looks good. Sponsor plate needs +0.5s to read cleanly on TikTok preview.</div>
                </div>
              </div>
              <div className="comment">
                <Avatar memberId="m-vee" size="avatar--lg" />
                <div className="comment__body">
                  <div className="comment__head"><span className="comment__author">Vee</span><span className="comment__time">May 15, 09:10</span></div>
                  <div className="comment__text">Adjusting now. v2 by EOD.</div>
                </div>
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <Avatar memberId="m-pond" size="avatar--lg" />
                <input className="input" placeholder="Write a commentโ€ฆ" />
                <button className="btn btn--primary"><Icon name="send" size={12} /> Send</button>
              </div>
            </div>
          </div>
        </div>

        <div className="detail__side">
          <div className="card">
            <div className="card__body">
              <div className="meta-row">
                <div className="meta-row__lbl">Owner</div>
                <div className="meta-row__val row" style={{ gap: 6 }}>
                  <Avatar memberId={w.assignee} /> <span className="strong">{owner?.name || "Unassigned"}</span>
                </div>
              </div>
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
                <div className="meta-row__val">{w.reviewRound ?? 0} <span className="muted" style={{ fontSize: 11 }}>(incremented only on requested changes)</span></div>
              </div>
              <div className="meta-row">
                <div className="meta-row__lbl">Due</div>
                <div className="meta-row__val">{w.dueLabel}, 2026</div>
              </div>
              <div className="meta-row">
                <div className="meta-row__lbl">Created</div>
                <div className="meta-row__val">May 12, 2026</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card__head"><span className="card__title">Assignment reason</span></div>
            <div className="card__body">
              <div className="reason-box">
                Auto: esport video assigned to <strong>Vee</strong> by skill, WIP (1/2), and remaining capacity through May 16.
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>Backup eligible: Pond (esport video backup) โ€” not selected, requester priority was urgent and Vee had capacity.</div>
            </div>
          </div>

          <div className="card">
            <div className="card__head"><span className="card__title">Activity</span></div>
            <div className="card__body">
              <div className="timeline">
                <div className="tl-item tl-item--brand">
                  <div className="tl-item__time">May 15, 09:10</div>
                  <div className="tl-item__text"><strong>Vee</strong> commented</div>
                </div>
                <div className="tl-item">
                  <div className="tl-item__time">May 14, 17:42</div>
                  <div className="tl-item__text"><strong>Mira Santos</strong> commented</div>
                </div>
                <div className="tl-item">
                  <div className="tl-item__time">May 13, 14:05</div>
                  <div className="tl-item__text">Status moved to <strong>In Progress</strong></div>
                </div>
                <div className="tl-item">
                  <div className="tl-item__time">May 13, 11:20</div>
                  <div className="tl-item__text">Assigned to <strong>Vee</strong> ยท effort 7</div>
                </div>
                <div className="tl-item">
                  <div className="tl-item__time">May 13, 11:20</div>
                  <div className="tl-item__text">Brief check passed</div>
                </div>
                <div className="tl-item">
                  <div className="tl-item__time">May 12, 16:48</div>
                  <div className="tl-item__text">Created by <strong>Mira Santos</strong></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { MyWorkScreen, CreateScreen, DetailScreen });

