const FLOWMATE_MOCK_USERS = {
  pond: "00000000-0000-0000-0000-000000000001",
  jo: "00000000-0000-0000-0000-000000000002",
  tong: "00000000-0000-0000-0000-000000000003",
  eye: "00000000-0000-0000-0000-000000000004",
  vee: "00000000-0000-0000-0000-000000000005",
};

// MVP mock-auth: a single "logged-in" user identity used by every RPC.
// Real Google Workspace SSO is tracked as B-004 — see docs/QA report.
// Until then, switching this constant (or reading it from a header / URL
// param) is the seam where real auth will plug in.
window.FLOWMATE_CURRENT_USER = window.FLOWMATE_CURRENT_USER || {
  id: FLOWMATE_MOCK_USERS.pond,
  name: "Pond",
  email: "pond@garena.com",
  team_member_id: "10000000-0000-0000-0000-000000000001",
};

function flowmateActorId() {
  return (window.FLOWMATE_CURRENT_USER && window.FLOWMATE_CURRENT_USER.id) || FLOWMATE_MOCK_USERS.pond;
}
window.flowmateActorId = flowmateActorId;

async function createFlowMateQuickTask(input) {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }

  const title = (input.title || "").trim();
  const dueDate = input.dueDate;

  if (!title) throw new Error("Title is required.");
  if (!dueDate) throw new Error("Due date is required.");

  const { data, error } = await window.flowmateSupabase.rpc("create_quick_task", {
    p_actor_user_id: flowmateActorId(),
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

async function addFlowMateWorkItemComment(displayId, body) {
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
  return data;
}

window.transitionFlowMateCreativeStatus = transitionFlowMateCreativeStatus;

// ---------------------------------------------------------------------------
// Creative request creation -- backend computes effort, owner, queue reason.
// ---------------------------------------------------------------------------
async function createFlowMateCreativeRequest(input) {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }
  if (!input || !input.title || !input.title.trim()) throw new Error("Title is required.");
  if (!input.dueDate) throw new Error("Due date is required.");

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
    p_reference_link:   input.referenceLink || null,
    p_priority:         input.priority || "normal",
    p_urgent_reason:    input.urgentReason || null,
    p_due_date:         input.dueDate,
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

// ===========================================================================
// Google Workspace SSO (Supabase Auth + Google provider)
// ===========================================================================
// `flowmateInitAuth` is called once on App mount. If a Supabase session
// exists, it overwrites the mock `FLOWMATE_CURRENT_USER` with the real
// signed-in user. If no session, the mock identity stays as a dev fallback
// so the app keeps working before SSO is fully configured.
async function flowmateInitAuth() {
  if (!window.flowmateSupabase || !window.flowmateSupabase.auth
      || typeof window.flowmateSupabase.auth.getSession !== "function") {
    console.info("[FlowMate Auth] Supabase auth client not available — staying on mock identity.");
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
    console.info("[FlowMate Auth] No active session — mock fallback in effect.");
    return null;
  }

  const { data: profile, error: profileError } = await window.flowmateSupabase
    .from("users")
    .select("id, email, display_name, requester_team, is_active")
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
    is_authenticated: true,
  };
  return window.FLOWMATE_CURRENT_USER;
}

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
  // Drop the cached identity so the mock fallback re-applies on reload.
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
