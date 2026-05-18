const FLOWMATE_MOCK_USERS = {
  pond: "00000000-0000-0000-0000-000000000001",
  jo: "00000000-0000-0000-0000-000000000002",
  tong: "00000000-0000-0000-0000-000000000003",
  eye: "00000000-0000-0000-0000-000000000004",
  vee: "00000000-0000-0000-0000-000000000005",
};

async function createFlowMateQuickTask(input) {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }

  const title = (input.title || "").trim();
  const dueDate = input.dueDate;

  if (!title) throw new Error("Title is required.");
  if (!dueDate) throw new Error("Due date is required.");

  const { data, error } = await window.flowmateSupabase.rpc("create_quick_task", {
    p_actor_user_id: FLOWMATE_MOCK_USERS.pond,
    p_title: title,
    p_due_date: dueDate,
    p_note: input.note || null,
    p_project_name: input.projectName || null,
    p_assignee_user_id: input.assigneeUserId || FLOWMATE_MOCK_USERS.pond,
    p_priority: input.priority || "normal",
  });

  if (error) throw error;
  return data;
}

window.FLOWMATE_MOCK_USERS = FLOWMATE_MOCK_USERS;
window.createFlowMateQuickTask = createFlowMateQuickTask;

async function completeFlowMateQuickTask(displayId) {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }

  if (!displayId) throw new Error("Work item ID is required.");

  const { data, error } = await window.flowmateSupabase.rpc("complete_quick_task", {
    p_actor_user_id: FLOWMATE_MOCK_USERS.pond,
    p_display_id: displayId,
  });

  if (error) throw error;
  return data;
}

window.completeFlowMateQuickTask = completeFlowMateQuickTask;

async function addFlowMateQuickTaskChecklistItem(displayId, title) {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }

  const trimmedTitle = (title || "").trim();
  if (!displayId) throw new Error("Work item ID is required.");
  if (!trimmedTitle) throw new Error("Checklist title is required.");

  const { data, error } = await window.flowmateSupabase.rpc("add_quick_task_checklist_item", {
    p_actor_user_id: FLOWMATE_MOCK_USERS.pond,
    p_display_id: displayId,
    p_title: trimmedTitle,
  });

  if (error) throw error;
  return data;
}

async function toggleFlowMateQuickTaskChecklistItem(checklistItemId, isDone) {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }

  if (!checklistItemId) throw new Error("Checklist item ID is required.");

  const { data, error } = await window.flowmateSupabase.rpc("toggle_quick_task_checklist_item", {
    p_actor_user_id: FLOWMATE_MOCK_USERS.pond,
    p_checklist_item_id: checklistItemId,
    p_is_done: Boolean(isDone),
  });

  if (error) throw error;
  return data;
}

window.addFlowMateQuickTaskChecklistItem = addFlowMateQuickTaskChecklistItem;
window.toggleFlowMateQuickTaskChecklistItem = toggleFlowMateQuickTaskChecklistItem;

async function addFlowMateWorkItemComment(displayId, body) {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }

  const trimmedBody = (body || "").trim();
  if (!displayId) throw new Error("Work item ID is required.");
  if (!trimmedBody) throw new Error("Comment is required.");

  const { data, error } = await window.flowmateSupabase.rpc("add_work_item_comment", {
    p_actor_user_id: FLOWMATE_MOCK_USERS.pond,
    p_display_id: displayId,
    p_body: trimmedBody,
  });

  if (error) throw error;
  return data;
}

async function updateFlowMateOwnComment(commentId, body) {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }

  const trimmedBody = (body || "").trim();
  if (!commentId) throw new Error("Comment ID is required.");
  if (!trimmedBody) throw new Error("Comment is required.");

  const { data, error } = await window.flowmateSupabase.rpc("update_own_work_item_comment", {
    p_actor_user_id: FLOWMATE_MOCK_USERS.pond,
    p_comment_id: commentId,
    p_body: trimmedBody,
  });

  if (error) throw error;
  return data;
}

async function deleteFlowMateOwnComment(commentId) {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }

  if (!commentId) throw new Error("Comment ID is required.");

  const { data, error } = await window.flowmateSupabase.rpc("delete_own_work_item_comment", {
    p_actor_user_id: FLOWMATE_MOCK_USERS.pond,
    p_comment_id: commentId,
  });

  if (error) throw error;
  return data;
}

window.addFlowMateWorkItemComment = addFlowMateWorkItemComment;
window.updateFlowMateOwnComment = updateFlowMateOwnComment;
window.deleteFlowMateOwnComment = deleteFlowMateOwnComment;

async function transitionFlowMateCreativeStatus(displayId, nextStatus, options = {}) {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }

  if (!displayId) throw new Error("Work item ID is required.");
  if (!nextStatus) throw new Error("Next status is required.");

  const { data, error } = await window.flowmateSupabase.rpc("transition_creative_work_status", {
    p_actor_user_id: FLOWMATE_MOCK_USERS.pond,
    p_display_id: displayId,
    p_next_status: nextStatus,
    p_delivery_link: options.deliveryLink || null,
    p_blocked_reason: options.blockedReason || null,
  });

  if (error) throw error;
  return data;
}

window.transitionFlowMateCreativeStatus = transitionFlowMateCreativeStatus;
