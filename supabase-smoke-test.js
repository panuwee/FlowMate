// H-6: Do NOT auto-run a pre-auth read on every page load in production.
// It added a query to each visit and confirmed to any anon visitor that
// work_items is readable. Opt-in only: set window.FLOWMATE_DEBUG = true (or
// add ?flowmate_debug=1 to the URL) before this script loads, then call
// window.flowmateRunSupabaseSmokeTest() from the console.
async function flowmateRunSupabaseSmokeTest() {
  if (!window.flowmateSupabase) {
    window.flowmateSupabaseSmokeResult = {
      ok: false,
      error: "Client is not ready.",
    };
    console.error("[FlowMate Supabase] Client is not ready.");
    return;
  }

  const { data, error } = await window.flowmateSupabase
    .from("work_items")
    .select("display_id,title,status")
    .order("display_id", { ascending: true })
    .limit(5);

  if (error) {
    window.flowmateSupabaseSmokeResult = {
      ok: false,
      error: error.message,
    };
    console.error("[FlowMate Supabase] Query failed:", error.message);
    return;
  }

  window.flowmateSupabaseSmokeResult = {
    ok: true,
    rows: data,
  };
  console.log("[FlowMate Supabase] Connected. work_items preview:", data);
}

window.flowmateRunSupabaseSmokeTest = flowmateRunSupabaseSmokeTest;

(function maybeRunSmokeTest() {
  var debugFlag = false;
  try {
    debugFlag = window.FLOWMATE_DEBUG === true
      || (typeof window.location !== "undefined"
          && /[?&]flowmate_debug=1\b/.test(window.location.search));
  } catch (e) { debugFlag = false; }
  if (debugFlag) flowmateRunSupabaseSmokeTest();
})();
