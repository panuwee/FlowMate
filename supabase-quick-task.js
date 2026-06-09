window.FLOWMATE_CURRENT_USER = window.FLOWMATE_CURRENT_USER || null;

function flowmateActorId() {
  return (window.FLOWMATE_CURRENT_USER && window.FLOWMATE_CURRENT_USER.id) || null;
}
window.flowmateActorId = flowmateActorId;

async function createFlowMateQuickTask(input) {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }

  const title = (input.title || "").trim();
  const dueDate = input.dueDate;
  const launchDate = input.launchDate;
  const requesterTeam = (input.requesterTeam || "").trim();
  const isOtherAssignee = input.assigneeUserId === "other";
  const assigneeOtherName = (input.assigneeOtherName || "").trim();

  if (!title) throw new Error("Title is required.");
  if (!requesterTeam) throw new Error("Requester Team / Function is required.");
  if (!dueDate) throw new Error("1st Review / Draft is required.");
  if (!launchDate) throw new Error("Launch date is required.");
  if (isOtherAssignee && !assigneeOtherName) throw new Error("Other assignee name is required.");

  const { data, error } = await window.flowmateSupabase.rpc("create_quick_task", {
    p_actor_user_id: flowmateActorId(),
    p_title: title,
    p_due_date: dueDate,
    p_launch_date: input.launchDate,
    p_note: input.note || null,
    p_project_name: input.projectName || null,
    p_requester_team: input.requesterTeam,
    p_assignee_user_id: isOtherAssignee ? null : (input.assigneeUserId || null),
    p_assignee_other_name: isOtherAssignee ? assigneeOtherName : null,
    p_priority: input.priority || "normal",
  });

  if (error) throw error;
  if (typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
    window.dispatchEvent(new CustomEvent("flowmate:refresh-request", { detail: { reason: "quick_task_created" } }));
    window.dispatchEvent(new CustomEvent("flowmate:refresh-counts"));
  }
  return data;
}

window.createFlowMateQuickTask = createFlowMateQuickTask;

async function completeFlowMateQuickTask(displayId) {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }

  if (!displayId) throw new Error("Work item ID is required.");

  const { data, error } = await window.flowmateSupabase.rpc("complete_quick_task", {
    p_actor_user_id: flowmateActorId(),
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
    p_actor_user_id: flowmateActorId(),
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
    p_actor_user_id: flowmateActorId(),
    p_checklist_item_id: checklistItemId,
    p_is_done: Boolean(isDone),
  });

  if (error) throw error;
  return data;
}

window.addFlowMateQuickTaskChecklistItem = addFlowMateQuickTaskChecklistItem;
window.toggleFlowMateQuickTaskChecklistItem = toggleFlowMateQuickTaskChecklistItem;

async function addFlowMateWorkItemComment(displayId, body, mentionedUserIds = []) {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }

  const trimmedBody = (body || "").trim();
  if (!displayId) throw new Error("Work item ID is required.");
  if (!trimmedBody) throw new Error("Comment is required.");

  const { data, error } = await window.flowmateSupabase.rpc("add_work_item_comment", {
    p_actor_user_id: flowmateActorId(),
    p_display_id: displayId,
    p_body: trimmedBody,
    p_mentioned_user_ids: Array.isArray(mentionedUserIds) ? mentionedUserIds : [],
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
    p_actor_user_id: flowmateActorId(),
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
    p_actor_user_id: flowmateActorId(),
    p_comment_id: commentId,
  });

  if (error) throw error;
  return data;
}

window.addFlowMateWorkItemComment = addFlowMateWorkItemComment;
window.updateFlowMateOwnComment = updateFlowMateOwnComment;
window.deleteFlowMateOwnComment = deleteFlowMateOwnComment;

async function addFlowMateWorkItemLink(displayId, url, description) {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }

  const trimmedUrl = (url || "").trim();
  const trimmedDescription = (description || "").trim();
  if (!displayId) throw new Error("Work item ID is required.");
  if (!trimmedUrl) throw new Error("URL is required.");

  const { data, error } = await window.flowmateSupabase.rpc("add_work_item_link", {
    p_display_id: displayId,
    p_url: trimmedUrl,
    p_description: trimmedDescription || null,
  });

  if (error) throw error;
  return data;
}

async function addFlowMateWorkItemWatcher(displayId, watcherUserId) {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }

  if (!displayId) throw new Error("Work item ID is required.");
  if (!watcherUserId) throw new Error("Watcher is required.");

  const { data, error } = await window.flowmateSupabase.rpc("add_work_item_watcher", {
    p_display_id: displayId,
    p_watcher_user_id: watcherUserId,
  });

  if (error) throw error;
  return data;
}

window.addFlowMateWorkItemLink = addFlowMateWorkItemLink;
window.addFlowMateWorkItemWatcher = addFlowMateWorkItemWatcher;

async function transitionFlowMateCreativeStatus(displayId, nextStatus, options = {}) {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }

  if (!displayId) throw new Error("Work item ID is required.");
  if (!nextStatus) throw new Error("Next status is required.");

  const { data, error } = await window.flowmateSupabase.rpc("transition_creative_work_status", {
    p_actor_user_id: flowmateActorId(),
    p_display_id: displayId,
    p_next_status: nextStatus,
    p_delivery_link: options.deliveryLink || null,
    p_blocked_reason: options.blockedReason || null,
    p_cancel_reason: options.cancelReason || null,
  });

  if (error) throw error;
  if (typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
    window.dispatchEvent(new CustomEvent("flowmate:refresh-request", { detail: { reason: "work_status_changed" } }));
    window.dispatchEvent(new CustomEvent("flowmate:refresh-counts"));
  }
  return data;
}

window.transitionFlowMateCreativeStatus = transitionFlowMateCreativeStatus;

async function adminTransitionFlowMateWorkStatus(displayId, nextStatus, options = {}) {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }

  if (!displayId) throw new Error("Work item ID is required.");
  if (!nextStatus) throw new Error("Next status is required.");

  const { data, error } = await window.flowmateSupabase.rpc("flowmate_admin_transition_work_status", {
    p_display_id: displayId,
    p_next_status: nextStatus,
    p_delivery_link: options.deliveryLink || null,
    p_blocked_reason: options.blockedReason || null,
    p_cancel_reason: options.cancelReason || null,
  });

  if (error) throw error;
  if (typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
    window.dispatchEvent(new CustomEvent("flowmate:refresh-request", { detail: { reason: "admin_work_status_changed" } }));
    window.dispatchEvent(new CustomEvent("flowmate:refresh-counts"));
  }
  return data;
}

async function adminArchiveFlowMateWorkItem(displayId, reason) {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }

  const trimmedReason = (reason || "").trim();
  if (!displayId) throw new Error("Work item ID is required.");
  if (!trimmedReason) throw new Error("Archive reason is required.");

  const { data, error } = await window.flowmateSupabase.rpc("flowmate_admin_archive_work_item", {
    p_display_id: displayId,
    p_archive_reason: trimmedReason,
  });

  if (error) throw error;
  return data;
}

async function transitionFlowMateWorkStatus(displayId, nextStatus, options = {}) {
  if (window.FLOWMATE_CURRENT_USER && window.FLOWMATE_CURRENT_USER.role === "admin") {
    return adminTransitionFlowMateWorkStatus(displayId, nextStatus, options);
  }
  return transitionFlowMateCreativeStatus(displayId, nextStatus, options);
}

window.adminTransitionFlowMateWorkStatus = adminTransitionFlowMateWorkStatus;
window.adminArchiveFlowMateWorkItem = adminArchiveFlowMateWorkItem;
window.transitionFlowMateWorkStatus = transitionFlowMateWorkStatus;

// ---------------------------------------------------------------------------
// Team settings helpers. Admin mutations go through auth.uid-scoped RPCs.
// ---------------------------------------------------------------------------
const FLOWMATE_TEAM_SETTINGS_COLUMNS = ["Operation", "Marketing", "GD/VE", "Esport"];
const FLOWMATE_TEAM_SETTINGS_FILTERS = [
  { key: "all", label: "All members" },
  { key: "active", label: "Active" },
  { key: "partial", label: "Partial" },
  { key: "leave", label: "On leave" },
];
const FLOWMATE_TEAM_SETTINGS_SKILL_OPTIONS = [
  { key: "static-graphic", label: "Static" },
  { key: "general-video", label: "General video" },
  { key: "motion", label: "Motion" },
  { key: "esport-video", label: "Esport video" },
  { key: "esport-video-backup", label: "Esport video (backup)" },
];
const FLOWMATE_TEAM_SETTINGS_PRIMARY_SKILLS = ["static-graphic", "general-video", "motion", "esport-video"];
const FLOWMATE_TEAM_SETTINGS_BACKUP_SKILLS = ["esport-video-backup"];

function normalizeFlowMateTeamSettingsTeam(member) {
  const raw = String((member && (member.discipline || member.discipline_short)) || "").trim();
  const value = raw.toLowerCase();
  if (["operations", "operation", "op", "ops"].includes(value)) return { team: "Operation", isUnknown: false };
  if (["marketing", "mkt"].includes(value)) return { team: "Marketing", isUnknown: false };
  if (["gd/ve", "gd", "ve", "design", "video"].includes(value)) return { team: "GD/VE", isUnknown: false };
  if (["esport", "esports", "es"].includes(value)) return { team: "Esport", isUnknown: false };
  return { team: "Operation", isUnknown: true };
}

function filterFlowMateTeamSettingsMembers(members, filter) {
  const activeFilter = filter || "all";
  const rows = Array.isArray(members) ? members : [];
  if (activeFilter === "active") return rows.filter((member) => (member.availability || "available") === "available");
  if (activeFilter === "partial") return rows.filter((member) => member.availability === "partial");
  if (activeFilter === "leave") return rows.filter((member) => member.availability === "leave");
  return rows;
}

function getFlowMateTeamSettingsBoard(members, filter) {
  const buckets = Object.fromEntries(
    FLOWMATE_TEAM_SETTINGS_COLUMNS.map((title) => [title, { title, members: [], unknownCount: 0 }]),
  );
  filterFlowMateTeamSettingsMembers(members, filter).forEach((member) => {
    const normalized = normalizeFlowMateTeamSettingsTeam(member);
    buckets[normalized.team].members.push(member);
    if (normalized.isUnknown) buckets[normalized.team].unknownCount += 1;
  });
  return FLOWMATE_TEAM_SETTINGS_COLUMNS.map((title) => ({
    ...buckets[title],
    members: buckets[title].members.slice().sort((a, b) =>
      String(a.name || a.display_name || "").localeCompare(String(b.name || b.display_name || "")),
    ),
  }));
}

function getFlowMateTeamSettingsUiModel(user) {
  const isAdmin = Boolean(user && user.role === "admin");
  return {
    canEditMembers: isAdmin,
    showAdminActions: isAdmin,
  };
}

function getFlowMateTeamSettingsMemberUi(member, user) {
  const normalized = normalizeFlowMateTeamSettingsTeam(member);
  const isGdVe = normalized.team === "GD/VE";
  const isAdmin = Boolean(user && user.role === "admin");
  return {
    isGdVe,
    showCapacityControls: isGdVe,
    canEdit: isAdmin && isGdVe,
  };
}

function getFlowMateTeamSettingsEditableSkills(member) {
  const values = new Set((member && Array.isArray(member.skills) ? member.skills : []).map(String));
  return FLOWMATE_TEAM_SETTINGS_SKILL_OPTIONS
    .map(option => option.key)
    .filter(key => values.has(key));
}

function splitFlowMateTeamSettingsEditableSkills(skills) {
  const selected = Array.from(new Set((Array.isArray(skills) ? skills : []).map(String)));
  const invalid = selected.filter(skill =>
    !FLOWMATE_TEAM_SETTINGS_PRIMARY_SKILLS.includes(skill) &&
    !FLOWMATE_TEAM_SETTINGS_BACKUP_SKILLS.includes(skill)
  );
  if (invalid.length) {
    throw new Error(`Unsupported skill: ${invalid.join(", ")}`);
  }
  const primarySkills = selected.filter(skill => FLOWMATE_TEAM_SETTINGS_PRIMARY_SKILLS.includes(skill));
  const backupSkills = selected
    .filter(skill => FLOWMATE_TEAM_SETTINGS_BACKUP_SKILLS.includes(skill))
    .map(skill => skill.replace("-backup", ""));
  if (primarySkills.length === 0) {
    throw new Error("Select at least one normal skill.");
  }
  return { primarySkills, backupSkills };
}

function flowmateNumberInRange(value, label, min, max) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < min || numberValue > max) {
    throw new Error(`${label} must be a number from ${min} to ${max}.`);
  }
  return numberValue;
}

function flowmateIntegerInRange(value, label, min, max) {
  const numberValue = flowmateNumberInRange(value, label, min, max);
  if (!Number.isInteger(numberValue)) {
    throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  }
  return numberValue;
}

async function adminUpdateFlowMateTeamMember(memberId, input) {
  if (!window.flowmateSupabase) throw new Error("Supabase client is not ready.");
  assertFlowMateAdminAccess();
  if (!memberId) throw new Error("Team member ID is required.");

  const capacityPerDay = flowmateNumberInRange(input && input.capacityPerDay, "Capacity per day", 0, 24);
  const wipLimit = flowmateIntegerInRange(input && input.wipLimit, "WIP limit", 0, 20);
  const params = {
    p_team_member_id: memberId,
    p_capacity_per_day: capacityPerDay,
    p_wip_limit: wipLimit,
  };

  if (Array.isArray(input && input.skills)) {
    const splitSkills = splitFlowMateTeamSettingsEditableSkills(input.skills);
    params.p_skills = splitSkills.primarySkills;
    params.p_backup_skills = splitSkills.backupSkills;
  }

  const { data, error } = await window.flowmateSupabase.rpc("flowmate_admin_update_team_member", params);

  if (error) throw error;
  if (typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
    window.dispatchEvent(new CustomEvent("flowmate:refresh-request", { detail: { reason: "team_settings_admin_update" } }));
  }
  return data;
}

async function createFlowMateLeaveRequest(input) {
  if (!window.flowmateSupabase) throw new Error("Supabase client is not ready.");
  if (!window.FLOWMATE_CURRENT_USER) throw new Error("Sign in is required.");

  const startDate = input && input.startDate;
  const endDate = input && input.endDate;
  const startHalf = (input && input.startHalf) || "am";
  const endHalf = (input && input.endHalf) || "pm";
  const reason = ((input && input.reason) || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || "")) throw new Error("Start date is required.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate || "")) throw new Error("End date is required.");
  if (endDate < startDate) throw new Error("End date must be on or after start date.");
  if (!["am", "pm"].includes(startHalf)) throw new Error("Start half must be AM or PM.");
  if (!["am", "pm"].includes(endHalf)) throw new Error("End half must be AM or PM.");
  if (startDate === endDate && startHalf > endHalf) throw new Error("For same-day leave, start half must be AM before PM.");

  const { data, error } = await window.flowmateSupabase.rpc("create_leave_request", {
    p_start_date: startDate,
    p_end_date: endDate,
    p_start_half: startHalf,
    p_end_half: endHalf,
    p_reason: reason || null,
  });

  if (error) throw error;
  if (typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
    window.dispatchEvent(new CustomEvent("flowmate:refresh-request", { detail: { reason: "leave_request_created" } }));
  }
  return data;
}

Object.assign(window, {
  FLOWMATE_TEAM_SETTINGS_COLUMNS,
  FLOWMATE_TEAM_SETTINGS_FILTERS,
  FLOWMATE_TEAM_SETTINGS_SKILL_OPTIONS,
  normalizeFlowMateTeamSettingsTeam,
  filterFlowMateTeamSettingsMembers,
  getFlowMateTeamSettingsBoard,
  getFlowMateTeamSettingsUiModel,
  getFlowMateTeamSettingsMemberUi,
  getFlowMateTeamSettingsEditableSkills,
  splitFlowMateTeamSettingsEditableSkills,
  adminUpdateFlowMateTeamMember,
  createFlowMateLeaveRequest,
});

// ---------------------------------------------------------------------------
// Creative request creation -- backend computes effort, owner, queue reason.
// ---------------------------------------------------------------------------
async function createFlowMateCreativeRequest(input) {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }
  if (!input || !input.title || !input.title.trim()) throw new Error("Title is required.");

  const platforms = Array.isArray(input.platforms)
    ? input.platforms
    : (input.platforms || "").split(",").map((p) => p.trim()).filter(Boolean);

  const { data, error } = await window.flowmateSupabase.rpc("create_creative_request", {
    p_actor_user_id:    flowmateActorId(),
    p_title:            input.title.trim(),
    p_requester_team:   input.requesterTeam || null,
    p_campaign_name:    input.campaignName || null,
    p_asset_type:       input.assetType,
    p_asset_subtype:    input.assetSubtype || "",
    p_platforms:        platforms,
    p_size_format:      input.sizeFormat || "",
    p_brief_link:       input.briefLink || "",
    p_brief_note:       input.briefNote || null,
    p_reference_link:   input.referenceLink || null,
    p_priority:         input.priority || "normal",
    p_urgent_reason:    input.urgentReason || null,
    p_due_date:         input.dueDate || null,
    p_launch_date:      input.launchDate || null,
  });
  if (error) throw error;
  return data;
}
window.createFlowMateCreativeRequest = createFlowMateCreativeRequest;

async function rerunFlowMateAssignment(displayId) {
  if (!window.flowmateSupabase) throw new Error("Supabase client is not ready.");
  if (!displayId) throw new Error("Work item ID is required.");
  const { data, error } = await window.flowmateSupabase.rpc("rerun_assignment", {
    p_actor_user_id: flowmateActorId(),
    p_display_id: displayId,
  });
  if (error) throw error;
  return data;
}
window.rerunFlowMateAssignment = rerunFlowMateAssignment;

async function recheckFlowMateBrief(displayId) {
  if (!window.flowmateSupabase) throw new Error("Supabase client is not ready.");
  if (!displayId) throw new Error("Work item ID is required.");
  const { data, error } = await window.flowmateSupabase.rpc("recheck_brief", {
    p_actor_user_id: flowmateActorId(),
    p_display_id: displayId,
  });
  if (error) throw error;
  return data;
}
window.recheckFlowMateBrief = recheckFlowMateBrief;

async function cancelFlowMateWorkItem(work, reason) {
  if (!window.flowmateSupabase) throw new Error("Supabase client is not ready.");
  if (!work || !work.id) throw new Error("Work item is required.");
  const trimmed = (reason || "").trim();
  if (!trimmed) throw new Error("Cancel reason is required.");

  if (window.FLOWMATE_CURRENT_USER && window.FLOWMATE_CURRENT_USER.role === "admin") {
    return adminTransitionFlowMateWorkStatus(work.id, "cancelled", { cancelReason: trimmed });
  }

  if (work.type === "quick") {
    const { data, error } = await window.flowmateSupabase.rpc("cancel_quick_task", {
      p_actor_user_id: flowmateActorId(),
      p_display_id: work.id,
      p_cancel_reason: trimmed,
    });
    if (error) throw error;
    return data;
  }

  return transitionFlowMateCreativeStatus(work.id, "cancelled", { cancelReason: trimmed });
}
window.cancelFlowMateWorkItem = cancelFlowMateWorkItem;

// ---------------------------------------------------------------------------
// Notification Center -- reads are RLS-scoped; read state changes go via RPC.
// ---------------------------------------------------------------------------
function flowmateNotificationDateTimeLabel(dateValue) {
  if (!dateValue) return "";
  return new Date(dateValue).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function loadFlowMateNotifications() {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }
  if (!window.FLOWMATE_CURRENT_USER) {
    throw new Error("Sign in is required to load notifications.");
  }

  const { data, error } = await window.flowmateSupabase
    .from("notifications")
    .select("id,type,title,body,work_item_id,metadata,read_at,dismissed_at,created_at")
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  const workItemIds = Array.from(new Set((data || []).map((row) => row.work_item_id).filter(Boolean)));
  let workItemsById = {};
  if (workItemIds.length > 0) {
    const { data: workItems, error: workItemsError } = await window.flowmateSupabase
      .from("work_items")
      .select("id,display_id,title,status")
      .in("id", workItemIds);
    if (workItemsError) throw workItemsError;
    workItemsById = Object.fromEntries((workItems || []).map((item) => [item.id, item]));
  }

  return (data || []).map((row) => {
    const workItem = row.work_item_id ? workItemsById[row.work_item_id] : null;
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    const displayId = workItem?.display_id || metadata.display_id || metadata.work_item_display_id || "";
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body || "",
      workItemUuid: row.work_item_id || null,
      workItemId: displayId,
      workItemTitle: workItem?.title || "",
      workItemStatus: workItem?.status || "",
      metadata,
      readAt: row.read_at || null,
      isRead: Boolean(row.read_at),
      createdAt: row.created_at,
      createdLabel: flowmateNotificationDateTimeLabel(row.created_at),
    };
  });
}

async function markFlowMateNotificationRead(notificationId) {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }
  if (!notificationId) throw new Error("Notification ID is required.");

  const { data, error } = await window.flowmateSupabase.rpc("mark_notification_read", {
    p_notification_id: notificationId,
  });

  if (error) throw error;
  return data;
}

async function markAllFlowMateNotificationsRead() {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }

  const { data, error } = await window.flowmateSupabase.rpc("mark_all_notifications_read");

  if (error) throw error;
  return data;
}

async function dismissReadFlowMateNotifications() {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }

  const { data, error } = await window.flowmateSupabase.rpc("dismiss_read_notifications");

  if (error) throw error;
  return data;
}

window.loadFlowMateNotifications = loadFlowMateNotifications;
window.markFlowMateNotificationRead = markFlowMateNotificationRead;
window.markAllFlowMateNotificationsRead = markAllFlowMateNotificationsRead;
window.dismissReadFlowMateNotifications = dismissReadFlowMateNotifications;

// ===========================================================================
// Google Workspace SSO (Supabase Auth + Google provider)
// ===========================================================================
// `flowmateInitAuth` is called once on App mount. It only returns a user when
// Supabase Auth has an active Google Workspace session.
async function flowmateInitAuth() {
  if (!window.flowmateSupabase || !window.flowmateSupabase.auth
      || typeof window.flowmateSupabase.auth.getSession !== "function") {
    console.info("[FlowMate Auth] Supabase auth client not available.");
    return null;
  }

  let session = null;
  try {
    const result = await window.flowmateSupabase.auth.getSession();
    session = result && result.data ? result.data.session : null;
  } catch (error) {
    console.warn("[FlowMate Auth] getSession failed:", error && error.message);
    return null;
  }
  if (!session || !session.user) {
    console.info("[FlowMate Auth] No active session.");
    return null;
  }

  const { data: profile, error: profileError } = await window.flowmateSupabase
    .from("users")
    .select("id, email, display_name, requester_team, is_active, role")
    .eq("id", session.user.id)
    .maybeSingle();

  if (profileError) {
    console.warn("[FlowMate Auth] profile lookup failed:", profileError.message);
    return null;
  }
  if (!profile) {
    // No matching row in public.users. Two common causes:
    //   (a) The email is NOT on the access whitelist — handle_new_auth_user
    //       intentionally refused to create a profile.
    //   (b) The auth-sync trigger has not been installed yet (dev only).
    // Either way, sign the auth user out and surface a clear message to the
    // user. The LoginScreen reads window.flowmateAuthError to display this.
    const msg = "Your email (" + (session.user.email || "unknown")
              + ") is not on the FlowMate access whitelist. "
              + "Please contact panuwee.w@garena.com to request access.";
    console.warn("[FlowMate Auth]", msg);
    window.flowmateAuthError = msg;
    try { sessionStorage.removeItem("flowmate:postLoginHash"); } catch (e) {}
    await window.flowmateSupabase.auth.signOut();
    return null;
  }

  // UAT-002: inactive users must not mutate. We block read access too by
  // signing them out client-side. The DB still re-checks on every RPC.
  if (profile.is_active === false) {
    await window.flowmateSupabase.auth.signOut();
    if (typeof window.alert === "function") {
      window.alert("Account is inactive. Please contact admin.");
    }
    return null;
  }

  const { data: member } = await window.flowmateSupabase
    .from("team_members")
    .select("id")
    .eq("user_id", profile.id)
    .maybeSingle();

  window.FLOWMATE_CURRENT_USER = {
    id: profile.id,
    name: profile.display_name,
    email: profile.email,
    team_member_id: member ? member.id : null,
    requester_team: profile.requester_team || null,
    role: profile.role || "member",
    is_authenticated: true,
  };
  return window.FLOWMATE_CURRENT_USER;
}

// ===========================================================================
// Admin whitelist management
// ===========================================================================
function assertFlowMateAdminAccess() {
  if (!window.FLOWMATE_CURRENT_USER || window.FLOWMATE_CURRENT_USER.role !== "admin") {
    throw new Error("Admin access required.");
  }
}

async function loadFlowMateWhitelistUsers() {
  if (!window.flowmateSupabase) throw new Error("Supabase client is not ready.");
  assertFlowMateAdminAccess();

  const { data, error } = await window.flowmateSupabase
    .from("user_whitelist")
    .select("email,display_name,role,team_member_code,created_at,added_by")
    .order("email", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function upsertFlowMateWhitelistUser(input) {
  if (!window.flowmateSupabase) throw new Error("Supabase client is not ready.");
  assertFlowMateAdminAccess();

  const email = (input && input.email || "").trim().toLowerCase();
  const displayName = (input && input.displayName || "").trim();
  const role = input && input.role ? input.role : "member";
  const teamMemberCode = (input && input.teamMemberCode || "").trim();

  if (!email) throw new Error("Email is required.");
  if (!displayName) throw new Error("Display name is required.");
  if (role !== "admin" && role !== "member") throw new Error("Role must be admin or member.");

  const { data, error } = await window.flowmateSupabase.rpc("flowmate_admin_upsert_whitelist_user", {
    p_email: email,
    p_display_name: displayName,
    p_role: role,
    p_team_member_code: teamMemberCode || null,
  });

  if (error) throw error;
  return data;
}

async function deleteFlowMateWhitelistUser(email) {
  if (!window.flowmateSupabase) throw new Error("Supabase client is not ready.");
  assertFlowMateAdminAccess();

  const normalizedEmail = (email || "").trim().toLowerCase();
  if (!normalizedEmail) throw new Error("Email is required.");

  const { data, error } = await window.flowmateSupabase.rpc("flowmate_admin_delete_whitelist_user", {
    p_email: normalizedEmail,
  });

  if (error) throw error;
  return data;
}

window.loadFlowMateWhitelistUsers = loadFlowMateWhitelistUsers;
window.upsertFlowMateWhitelistUser = upsertFlowMateWhitelistUser;
window.deleteFlowMateWhitelistUser = deleteFlowMateWhitelistUser;

async function flowmateSignInWithGoogle() {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }
  // Clear any prior auth error so the LoginScreen doesn't keep showing it
  // after the user retries.
  window.flowmateAuthError = null;
  // Portable redirect: works for `http://localhost:3000/`, GitHub Pages
  // (`https://panuwee.github.io/FlowMate/`), or any other deploy target.
  // IMPORTANT: redirectTo MUST NOT contain a hash. Supabase appends
  // `#access_token=...` to the URL, and our own `#board` route fragment
  // would collide ("#board#access_token=...") and break token parsing.
  // We stash the post-login route in sessionStorage and the App component
  // restores it after auth init completes.
  try { sessionStorage.setItem("flowmate:postLoginHash", "my-work"); } catch (e) {}

  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await window.flowmateSupabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectTo,
      // Hint Google to show only Garena Workspace accounts. Final domain
      // enforcement still happens in the SQL trigger `enforce_garena_domain`.
      queryParams: { hd: "garena.com" },
    },
  });
  if (error) throw error;
}

async function flowmateSignOut() {
  if (!window.flowmateSupabase) return;
  await window.flowmateSupabase.auth.signOut();
  // Drop the cached identity before reload.
  window.FLOWMATE_CURRENT_USER = null;
  window.location.reload();
}

window.flowmateInitAuth         = flowmateInitAuth;
window.flowmateSignInWithGoogle = flowmateSignInWithGoogle;
window.flowmateSignOut          = flowmateSignOut;

try {
  if (window.flowmateSupabase && window.flowmateSupabase.auth
      && typeof window.flowmateSupabase.auth.onAuthStateChange === "function") {
    window.flowmateSupabase.auth.onAuthStateChange(function (event) {
      if (event === "SIGNED_OUT") {
        window.FLOWMATE_CURRENT_USER = null;
        window.location.reload();
      }
    });
  }
} catch (error) {
  console.warn("[FlowMate Auth] onAuthStateChange wiring failed:", error && error.message);
}
