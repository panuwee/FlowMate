const SUPABASE_URL = "https://jbavahimqjalvcfawgqw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpiYXZhaGltcWphbHZjZmF3Z3F3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MzEwNDksImV4cCI6MjA5NDQwNzA0OX0.0kokmbZ1WCPPQwYIXG4xu_OgU9S8ci34EEWeNZ2LFkA";

// Explicit read RPCs. Unknown RPCs fail closed for Viewer, including GET RPC calls.
window.FLOWMATE_VIEWER_READ_RPCS = new Set([
  "flowmate_board_summary", "flowmate_list_delivered_history", "flowmate_creative_brief",
  "battle_pass_review_status", "product_book_list_patches", "product_book_list_revisions",
  "marketing_campaign_planner_can_manage", "ot_get_access_context", "ot_get_my_dashboard",
  "flowmate_board_summary_by_function", "task_assign_list", "task_assign_members",
  "ot_list_my_requests", "ot_get_manager_dashboard", "ot_list_eligible_approvers", "ot_list_people_for_event",
]);
window.flowmateViewerRequestAllowed = function (input, init) {
  const url = new URL(typeof input === "string" ? input : input.url, SUPABASE_URL);
  const method = String(init?.method || input?.method || "GET").toUpperCase();
  if (url.origin !== new URL(SUPABASE_URL).origin) return false;
  if (url.pathname.startsWith("/auth/v1/")) return true;
  if (url.pathname.startsWith("/rest/v1/rpc/")) {
    const rpc = decodeURIComponent(url.pathname.slice("/rest/v1/rpc/".length));
    if (rpc === "flowmate_creative_brief") {
      let action = url.searchParams.get("p_action") || "read";
      if (method === "POST") {
        try { action = JSON.parse(init?.body || "{}").p_action || "read"; } catch (_) { return false; }
      }
      if (action !== "read") return false;
    }
    return ["GET","HEAD","POST"].includes(method) && window.FLOWMATE_VIEWER_READ_RPCS.has(rpc);
  }
  return ["GET","HEAD"].includes(method) && (url.pathname.startsWith("/rest/v1/") || url.pathname.startsWith("/storage/v1/object/"));
};
async function flowmateAccessFetch(input, init) {
  if (window.FLOWMATE_CURRENT_USER?.role === "viewer" && !window.flowmateViewerRequestAllowed(input, init)) {
    return new Response(JSON.stringify({code:"42501",message:"Viewer access is read-only",details:null,hint:null}), {status:403,headers:{"Content-Type":"application/json"}});
  }
  return fetch(input, init);
}

if (!window.supabase) {
  console.error("[FlowMate Supabase] Supabase CDN failed to load.");
  window.flowmateSupabaseLoadError = "Supabase library failed to load. Check internet/CDN access.";
} else {
  const supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    { global: { fetch: flowmateAccessFetch } },
  );

  window.flowmateSupabase = supabase;
}
