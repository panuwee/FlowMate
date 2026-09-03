import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const required = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "FLOWMATE_UAT_USER_JWT",
];
for (const key of required) {
  if (!process.env[key]) throw new Error(key + " is required in the process environment");
}

const actorId = process.env.FLOWMATE_UAT_ACTOR_USER_ID;
const briefLink = process.env.FLOWMATE_UAT_BRIEF_LINK;
if (!actorId || !briefLink) {
  throw new Error("FLOWMATE_UAT_ACTOR_USER_ID and FLOWMATE_UAT_BRIEF_LINK are required");
}

const userClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PUBLISHABLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: "Bearer " + process.env.FLOWMATE_UAT_USER_JWT },
    },
  },
);
const adminClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const prefix = "codex-assignment-race-" + Date.now();
const launchDate = process.env.FLOWMATE_UAT_LAUNCH_DATE;
if (!/^\d{4}-\d{2}-\d{2}$/.test(launchDate || "")) {
  throw new Error("FLOWMATE_UAT_LAUNCH_DATE must be YYYY-MM-DD in a complete Thai calendar year");
}

const params = (index) => ({
  p_actor_user_id: actorId,
  p_title: prefix + "-" + index,
  p_requester_team: "UAT",
  p_campaign_name: prefix,
  p_asset_type: "static-graphic",
  p_asset_subtype: process.env.FLOWMATE_UAT_ASSET_SUBTYPE || "banner",
  p_platforms: ["Facebook"],
  p_size_format: "1200x1200",
  p_brief_link: briefLink,
  p_priority: "normal",
  p_launch_date: launchDate,
  p_asset_count: 1,
});

let workItemIds = [];
try {
  const results = await Promise.all([
    userClient.rpc("create_creative_request", params(1)),
    userClient.rpc("create_creative_request", params(2)),
  ]);
  for (const result of results) {
    if (result.error) throw result.error;
  }
  workItemIds = results.map((result) => result.data.id);
  assert.equal(new Set(workItemIds).size, 2);

  const runsResult = await adminClient
    .from("assignment_runs")
    .select("work_item_id,final_owner_member_id,capacity_snapshot,ran_at")
    .in("work_item_id", workItemIds)
    .order("ran_at", { ascending: true });
  if (runsResult.error) throw runsResult.error;
  assert.equal(runsResult.data.length, 2);
  assert.equal(runsResult.data[0].capacity_snapshot.routing_model, "state_count_v1");
  assert.equal(runsResult.data[1].capacity_snapshot.routing_model, "state_count_v1");
  assert.notEqual(
    runsResult.data[0].capacity_snapshot.candidate_state_version,
    runsResult.data[1].capacity_snapshot.candidate_state_version,
    "serialized runs must record different post-lock candidate-state versions",
  );
  process.stdout.write(JSON.stringify({ prefix, workItemIds, runs: runsResult.data }, null, 2));
} finally {
  if (workItemIds.length) {
    const cleanup = await adminClient
      .from("work_items")
      .delete()
      .in("id", workItemIds)
      .like("title", prefix + "%");
    if (cleanup.error) throw cleanup.error;
  }
}
