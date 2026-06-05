(async function runSupabaseSmokeTest() {
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
})();
