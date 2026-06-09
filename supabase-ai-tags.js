function assertFlowMateAiTagClientReady() {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready.");
  }
}

function normalizeFlowMateAiTagInput(tag) {
  const trimmed = String(tag || "").trim();
  if (!trimmed) throw new Error("AI tag is required.");
  if (trimmed.length > 64) throw new Error("AI tag must be 64 characters or less.");
  return trimmed;
}

function getFlowMateAiTagWorkItemParams(input) {
  const value = input && typeof input === "object" ? input : { displayId: input };
  const displayId = String(value.displayId || value.display_id || "").trim();
  const workItemId = String(value.workItemId || value.work_item_id || "").trim();

  if (!displayId && !workItemId) {
    throw new Error("Work item ID is required.");
  }

  return {
    p_display_id: displayId || null,
    p_work_item_id: workItemId || null,
  };
}

function normalizeFlowMateAiTagRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    id: row.id,
    workItemId: row.work_item_id || null,
    displayId: row.display_id || "",
    tag: row.tag || "",
    createdByUserId: row.created_by_user_id || null,
    createdAt: row.created_at || null,
  }));
}

function dispatchFlowMateAiTagRefresh(reason) {
  if (typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
    window.dispatchEvent(new CustomEvent("flowmate:refresh-request", { detail: { reason } }));
  }
}

async function loadFlowMateAiTags(input) {
  assertFlowMateAiTagClientReady();

  const { data, error } = await window.flowmateSupabase.rpc(
    "list_work_item_ai_tags",
    getFlowMateAiTagWorkItemParams(input),
  );

  if (error) throw error;
  return normalizeFlowMateAiTagRows(data);
}

async function addFlowMateAiTag(input, tag) {
  assertFlowMateAiTagClientReady();

  const { data, error } = await window.flowmateSupabase.rpc("add_work_item_ai_tag", {
    ...getFlowMateAiTagWorkItemParams(input),
    p_tag: normalizeFlowMateAiTagInput(tag),
  });

  if (error) throw error;
  dispatchFlowMateAiTagRefresh("ai_tag_added");
  return normalizeFlowMateAiTagRows([data])[0];
}

async function removeFlowMateAiTag(aiTagId) {
  assertFlowMateAiTagClientReady();

  if (!aiTagId) throw new Error("AI tag ID is required.");

  const { data, error } = await window.flowmateSupabase.rpc("remove_work_item_ai_tag", {
    p_ai_tag_id: aiTagId,
  });

  if (error) throw error;
  dispatchFlowMateAiTagRefresh("ai_tag_removed");
  return {
    id: data && data.id,
    workItemId: data && data.work_item_id,
    displayId: data && data.display_id,
    tag: data && data.tag,
    removed: Boolean(data && data.removed),
  };
}

window.loadFlowMateAiTags = loadFlowMateAiTags;
window.addFlowMateAiTag = addFlowMateAiTag;
window.removeFlowMateAiTag = removeFlowMateAiTag;
