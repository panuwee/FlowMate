import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const repo = (...parts: string[]) =>
  readFileSync(resolve(process.cwd(), ...parts), "utf8").replace(/\r\n/g, "\n");

function extractNamedFunction(source: string, functionName: string) {
  const functionStart = source.indexOf(`function ${functionName}(`);
  if (functionStart < 0) return "";
  const start = source.slice(Math.max(0, functionStart - 6), functionStart) === "async " ? functionStart - 6 : functionStart;
  const signatureEnd = source.indexOf(") {", functionStart);
  const bodyStart = signatureEnd < 0 ? -1 : signatureEnd + 2;
  if (bodyStart < 0) return "";
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return "";
}

function loadProductionInsightsHelpers() {
  const app = repo("app.jsx");
  const helperNames = [
    "flowMateProductionPercentile",
    "normalizeFlowMateProductionSampleRow",
    "normalizeFlowMateProductionOperationRow",
    "normalizeFlowMateLegacyCapacityWarningRow",
    "summarizeFlowMateProductionSamples",
    "filterFlowMateProductionSamples",
    "filterFlowMateProductionOperations",
    "getFlowMateProductionStatusOptions",
    "summarizeFlowMateProductionOperations",
    "summarizeFlowMateLegacyWarnings",
    "summarizeFlowMateProductionMonthTrend",
    "exportFlowMateProductionInsightsCsv",
  ];
  const helperSource = [
    "const FLOWMATE_PRODUCTION_MIN_SAMPLE_COUNT = 20;",
    ...helperNames.map((name) => {
      const fn = extractNamedFunction(app, name);
      expect(fn, name).not.toBe("");
      return fn;
    }),
    "this.helpers = { " + helperNames.join(", ") + " };",
  ].join("\n");
  const downloads: Array<{ filename: string; headers: string[]; rows: string[][] }> = [];
  const sandbox = {
    window: {
      flowmateDownloadCsv: (filename: string, headers: string[], rows: string[][]) => {
        downloads.push({ filename, headers, rows });
      },
    },
    getMarketingPlanMonthLabel: (monthKey: string) => ({ "2026-09": "Sep 2026" })[monthKey] || monthKey,
    getMarketingPlanStatusLabel: (status: string) => ({ in_progress: "In Progress", assigned: "Assigned", review: "Review", blocked: "Blocked", delivered: "Delivered" })[status] || status,
    formatMarketingPlanSupervisorNumber: (value: number | null, digits = 1) => Number.isFinite(value) ? Number(value).toFixed(digits).replace(/\.0$/, "") : "-",
  } as Record<string, unknown>;
  vm.runInNewContext(helperSource, sandbox);
  return {
    helpers: sandbox.helpers as Record<string, (...args: never[]) => unknown>,
    downloads,
  };
}

function loadSupervisorLoader() {
  const app = repo("app.jsx");
  const source = [
    extractNamedFunction(app, "normalizeMarketingPlanSupervisorRow"),
    extractNamedFunction(app, "normalizeMarketingPlanSupervisorSummaryRow"),
    extractNamedFunction(app, "normalizeFlowMateProductionSampleRow"),
    extractNamedFunction(app, "normalizeFlowMateProductionOperationRow"),
    extractNamedFunction(app, "normalizeFlowMateLegacyCapacityWarningRow"),
    extractNamedFunction(app, "loadMarketingPlanSupervisorRows"),
    "this.loadMarketingPlanSupervisorRows = loadMarketingPlanSupervisorRows;",
  ].join("\n");
  const sandbox = {
    window: {} as Record<string, unknown>,
    normalizeMarketingPlanWorkingStatus: (status: string) => status || "planned",
  } as Record<string, unknown>;
  vm.runInNewContext(source, sandbox);
  return sandbox as {
    window: Record<string, unknown>;
    loadMarketingPlanSupervisorRows: (user: { role?: string }, options?: { productionStartDate?: string; productionEndDate?: string }) => Promise<Record<string, unknown>>;
  };
}

function makeSupervisorClient(resultsByTable: Record<string, { data?: unknown[]; error?: Error | null }>) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  function makeQuery(table: string) {
    const query = {
      select: (...args: unknown[]) => {
        calls.push({ table, method: "select", args });
        return query;
      },
      order: (...args: unknown[]) => {
        calls.push({ table, method: "order", args });
        return query;
      },
      gte: (...args: unknown[]) => {
        calls.push({ table, method: "gte", args });
        return query;
      },
      lte: (...args: unknown[]) => {
        calls.push({ table, method: "lte", args });
        return query;
      },
      then: (resolve: (value: unknown) => void) => {
        resolve(resultsByTable[table] || { data: [], error: null });
      },
    };
    return query;
  }
  return {
    calls,
    from: (table: string) => {
      calls.push({ table, method: "from", args: [] });
      return makeQuery(table);
    },
  };
}

describe("Supervisor Production Insights SQL", () => {
  it("derives active production time from in-progress intervals and gates all views to admins", () => {
    const sql = repo("supabase", "flowmate_production_insights.sql");

    expect(sql).toContain("create or replace view public.flowmate_production_samples_v");
    expect(sql).toContain("lead(e.created_at, 1, wi.delivered_at)");
    expect(sql).toContain("and e.to_status is not null");
    expect(sql).toContain("filter (where to_status = 'in_progress' and next_at > created_at)");
    expect(sql).toContain("wi.status = 'delivered'");
    expect(sql).toContain("at.active_production_hours > 0");
    expect(sql).toContain("wi.effort_point");
    expect(sql).toContain("(wi.delivered_at at time zone 'Asia/Bangkok')::date as delivered_date");

    for (const viewName of [
      "flowmate_production_samples_v",
      "flowmate_production_operations_v",
      "flowmate_legacy_capacity_warning_v",
    ]) {
      expect(sql).toContain(`create or replace view public.${viewName}\nwith (security_invoker = true) as`);
      expect(sql).toContain("public.is_admin_app_user()");
      expect(sql).toContain(`revoke all privileges on public.${viewName} from public, anon, authenticated`);
      expect(sql).toContain(`grant select on public.${viewName} to authenticated`);
      expect(sql).not.toMatch(new RegExp(`grant\\s+select\\s+on\\s+public\\.${viewName}\\s+to\\s+anon`, "i"));
    }
  });

  it("keeps current operations and retired warning history separate from assignment decisions", () => {
    const sql = repo("supabase", "flowmate_production_insights.sql");
    const operationsStart = sql.indexOf("create or replace view public.flowmate_production_operations_v");
    const warningsStart = sql.indexOf("create or replace view public.flowmate_legacy_capacity_warning_v");
    const operationsView = sql.slice(operationsStart, warningsStart);
    const warningsView = sql.slice(warningsStart);

    expect(operationsView).toContain("owner_on_leave_count");
    expect(operationsView).toContain("owner_partial_count");
    expect(operationsView).toContain("wi.status::text as status");
    expect(operationsView).toContain("wi.archived_at is null");
    expect(operationsView).not.toContain("effort_point");
    expect(operationsView).not.toContain("capacity_snapshot");

    expect(warningsView).toContain("jsonb_array_elements");
    expect(warningsView).toContain("capacity_snapshot -> 'warnings'");
    expect(warningsView).toContain("'over_capacity'");
    expect(warningsView).toContain("'deadline_capacity_gap'");
    expect(warningsView).not.toMatch(/\bupdate\b|\binsert\b|\bdelete\b/i);
  });

  it("derives active-task leave context from overlapping requests without multiplying task rows", () => {
    const sql = repo("supabase", "flowmate_production_insights.sql");
    const operationsStart = sql.indexOf("create or replace view public.flowmate_production_operations_v");
    const warningsStart = sql.indexOf("create or replace view public.flowmate_legacy_capacity_warning_v");
    const operationsView = sql.slice(operationsStart, warningsStart);

    expect(operationsView).toContain("left join lateral");
    expect(operationsView).toContain("from public.leave_requests lr");
    expect(operationsView).toContain("lr.cancelled_at is null");
    expect(operationsView).toContain("lr.start_date <= greatest(current_date, coalesce(wi.due_date, current_date))");
    expect(operationsView).toContain("lr.end_date >= current_date");
    expect(operationsView).toContain("bool_or(");
    expect(operationsView).toContain("coalesce(actual_leave.has_any_leave, false)");
    expect(operationsView).toContain("coalesce(actual_leave.has_full_leave, false)");
    expect(operationsView).toContain("wi.status in ('assigned', 'in_progress', 'review', 'blocked')");
    expect(operationsView).toContain("tm.availability = 'leave'");
    expect(operationsView).toContain("tm.availability = 'partial'");
    expect(operationsView).not.toMatch(/join\s+public\.leave_requests\s+lr\s+on/i);
  });

  it("combines separate AM and PM leave requests into full-day task context", () => {
    const sql = repo("supabase", "flowmate_production_insights.sql");
    const operationsStart = sql.indexOf("create or replace view public.flowmate_production_operations_v");
    const warningsStart = sql.indexOf("create or replace view public.flowmate_legacy_capacity_warning_v");
    const operationsView = sql.slice(operationsStart, warningsStart);
    const verifySql = repo("supabase", "flowmate_production_insights_verify.sql");

    expect(operationsView).toContain("public.flowmate_leave_fraction_for_bucket(");
    expect(operationsView).toContain("cross join (values ('am'), ('pm')) as halves(bucket_half)");
    expect(operationsView).toContain("covered_half_count = 2");
    expect(verifySql).toContain("PI-COMBINED-FULL");
    expect(verifySql).toContain("Production Insights combined AM leave fixture");
    expect(verifySql).toContain("Production Insights combined PM leave fixture");
    expect(verifySql).toContain("Expected separate AM and PM requests to produce full-leave context");
  });

  it("keeps Team Settings full leave above overlapping partial request context", () => {
    const sql = repo("supabase", "flowmate_production_insights.sql");
    const operationsStart = sql.indexOf("create or replace view public.flowmate_production_operations_v");
    const warningsStart = sql.indexOf("create or replace view public.flowmate_legacy_capacity_warning_v");
    const operationsView = sql.slice(operationsStart, warningsStart);
    const verifySql = repo("supabase", "flowmate_production_insights_verify.sql");

    expect(operationsView).toMatch(/tm\.availability\s*=\s*'leave'[\s\S]*or\s+coalesce\(actual_leave\.has_full_leave, false\)/i);
    expect(operationsView).not.toMatch(/not\s+coalesce\(actual_leave\.has_any_leave, false\)[\s\S]{0,100}tm\.availability\s*=\s*'leave'/i);
    expect(verifySql).toContain("PI-AVAILABILITY-LEAVE");
    expect(verifySql).toContain("Expected availability leave to override partial request context");
    expect(verifySql).toContain("v_precedence_task_count is distinct from 1");
  });

  it("verifies anon denial, non-admin empty reads, admin metrics, and rollback fixtures", () => {
    const verifySql = repo("supabase", "flowmate_production_insights_verify.sql");

    expect(verifySql).toContain("begin;");
    expect(verifySql).toContain("rollback;");
    expect(verifySql).toContain("CR-990001");
    expect(verifySql).toContain("CR-990002");
    expect(verifySql).toContain("Expected non-admin Production Insights read to return zero rows");
    expect(verifySql).toContain("perform set_config('request.jwt.claim.sub', v_non_admin_id::text, true)");
    expect(verifySql).toContain("perform set_config('request.jwt.claim.sub', v_admin_id::text, true)");
    expect(verifySql).toContain("if has_table_privilege('anon', 'public.flowmate_production_samples_v', 'select') then");
    expect(verifySql).toContain("Expected 10 active hours, got %");
    expect(verifySql).toContain("'commented', null, null, timestamptz '2026-09-01 03:00:00+00'");
    expect(verifySql).toContain("non-status event must not truncate active production time");
    expect(verifySql).toContain("Non-positive samples must be excluded");
    expect(verifySql).toContain("blocked gap");
    expect(verifySql).toContain("deadline_capacity_gap");
    expect(verifySql).toContain("insert into public.leave_requests");
    expect(verifySql).toContain("Expected active full-leave request context");
    expect(verifySql).toContain("Expected active partial-leave request context");
    expect(verifySql).not.toMatch(/v_(?:admin|non_admin)_id,\s*'PI-FIXTURE-/);
    expect(verifySql).toContain("v_admin_id, 'GD/VE', v_admin_id, v_leave_owner_id");
    expect(verifySql).toContain("v_admin_id, 'GD/VE', v_non_admin_id, v_partial_owner_id");
    expect(verifySql).toContain("v_admin_id, 'GD/VE', v_admin_id, v_precedence_owner_id");
    expect(verifySql).toContain("array['facebook'], '1200x1200'");
    expect(verifySql).not.toContain("array['facebook'], '1:1'");
  });
});

describe("Supervisor Production Insights frontend", () => {
  it("normalizes samples and returns exactly Insufficient history below 20 valid samples", () => {
    const { helpers } = loadProductionInsightsHelpers();
    const normalize = helpers.normalizeFlowMateProductionSampleRow as (row: Record<string, unknown>) => Record<string, unknown>;
    const summarize = helpers.summarizeFlowMateProductionSamples as (rows: Array<Record<string, unknown>>) => Record<string, unknown>;
    const percentile = helpers.flowMateProductionPercentile as (values: number[], percentile: number) => number | null;

    expect(normalize({
      work_item_id: "work-1",
      display_id: "CR-1",
      team: "GD",
      asset_type: "static-graphic",
      asset_subtype: "Banner",
      priority: "high",
      status: "delivered",
      effort_point: 4,
      delivered_date: "2026-09-01",
      active_production_hours: "10.5",
    })).toEqual({
      workItemId: "work-1",
      displayId: "CR-1",
      team: "GD",
      assetType: "static-graphic",
      assetSubtype: "Banner",
      priority: "high",
      status: "delivered",
      effortPoint: 4,
      deliveredAt: "",
      deliveredDate: "2026-09-01",
      monthKey: "2026-09",
      activeProductionHours: 10.5,
    });

    const nineteenRows = Array.from({ length: 19 }, (_, index) => ({ activeProductionHours: index + 1 }));
    expect(summarize(nineteenRows)).toEqual({
      sampleCount: 19,
      p50: null,
      p85: null,
      reliability: "Insufficient history",
      historicalEffort: null,
    });
    expect(summarize(Array.from({ length: 20 }, (_, index) => ({ activeProductionHours: index + 1 })))).toMatchObject({
      sampleCount: 20,
      p50: 10.5,
      p85: 17.15,
      reliability: "Ready",
    });
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(25);
  });

  it("filters current operations by status and builds status choices from operations plus samples", () => {
    const { helpers } = loadProductionInsightsHelpers();
    const filterOperations = helpers.filterFlowMateProductionOperations as (rows: Array<Record<string, unknown>>, filters: Record<string, unknown>) => Array<Record<string, unknown>>;
    const statusOptions = helpers.getFlowMateProductionStatusOptions as (samples: Array<Record<string, unknown>>, operations: Array<Record<string, unknown>>) => Array<{ value: string; label: string }>;

    const operations = [
      { team: "GD", assetSubtype: "Banner", priority: "high", status: "in_progress", taskCount: 3 },
      { team: "GD", assetSubtype: "Banner", priority: "high", status: "review", taskCount: 2 },
      { team: "GD", assetSubtype: "Banner", priority: "high", status: "blocked", taskCount: 1 },
    ];

    expect(filterOperations(operations, { status: "review" })).toEqual([
      { team: "GD", assetSubtype: "Banner", priority: "high", status: "review", taskCount: 2 },
    ]);
    expect(statusOptions([{ status: "delivered" }], operations)).toEqual([
      { value: "in_progress", label: "In Progress" },
      { value: "review", label: "Review" },
      { value: "blocked", label: "Blocked" },
      { value: "delivered", label: "Delivered" },
    ]);
  });

  it("calculates month trend and variance from cohort-level samples only", () => {
    const { helpers } = loadProductionInsightsHelpers();
    const trend = helpers.summarizeFlowMateProductionMonthTrend as (rows: Array<Record<string, unknown>>, filters: Record<string, unknown>) => Array<Record<string, unknown>>;
    const rows = [
      ...Array.from({ length: 20 }, (_, index) => ({
        monthKey: "2026-08",
        team: "GD",
        assetType: "static-graphic",
        assetSubtype: "Banner",
        priority: "high",
        status: "delivered",
        effortPoint: 4,
        activeProductionHours: index + 1,
      })),
      ...Array.from({ length: 20 }, (_, index) => ({
        monthKey: "2026-09",
        team: "GD",
        assetType: "static-graphic",
        assetSubtype: "Banner",
        priority: "high",
        status: "delivered",
        effortPoint: 4,
        activeProductionHours: index + 3,
      })),
    ];

    expect(trend(rows, { team: "GD", assetSubtype: "Banner", priority: "high", status: "delivered" })).toEqual([
      { monthKey: "2026-08", sampleCount: 20, p50: 10.5, p85: 17.15, p85Variance: null, reliability: "Ready" },
      { monthKey: "2026-09", sampleCount: 20, p50: 12.5, p85: 19.15, p85Variance: 2, reliability: "Ready" },
    ]);
  });

  it("loads three Production Insights views with delivered-date bounds and isolates their errors", async () => {
    const sandbox = loadSupervisorLoader();
    const client = makeSupervisorClient({
      marketing_plan_supervisor_monthly_v: { data: [{ month_key: "2026-09", launch_date: "2026-09-10" }], error: null },
      marketing_plan_supervisor_pic_v: { data: [], error: null },
      marketing_plan_supervisor_campaign_v: { data: [], error: null },
      marketing_plan_supervisor_channel_v: { data: [], error: null },
      flowmate_production_samples_v: { data: [], error: null },
      flowmate_production_operations_v: { data: [], error: new Error("report view unavailable") },
      flowmate_legacy_capacity_warning_v: { data: [], error: null },
    });
    sandbox.window.flowmateSupabase = client;

    const report = await sandbox.loadMarketingPlanSupervisorRows(
      { role: "admin" },
      { productionStartDate: "2026-09-01", productionEndDate: "2026-09-30" },
    );

    for (const table of [
      "flowmate_production_samples_v",
      "flowmate_production_operations_v",
      "flowmate_legacy_capacity_warning_v",
    ]) {
      expect(client.calls).toContainEqual({ table, method: "from", args: [] });
    }
    expect(client.calls).toContainEqual({ table: "flowmate_production_samples_v", method: "gte", args: ["delivered_date", "2026-09-01"] });
    expect(client.calls).toContainEqual({ table: "flowmate_production_samples_v", method: "lte", args: ["delivered_date", "2026-09-30"] });
    expect(report.productionInsights).toMatchObject({
      status: "error",
      message: "report view unavailable",
      samples: [],
      operations: [],
      warnings: [],
    });
  });

  it("exports Production Insights cohort CSV without member speed or rank fields", () => {
    const { helpers, downloads } = loadProductionInsightsHelpers();
    const exporter = helpers.exportFlowMateProductionInsightsCsv as (
      samples: Array<Record<string, unknown>>,
      operations: Array<Record<string, unknown>>,
      warnings: Array<Record<string, unknown>>,
      filters: Record<string, unknown>,
    ) => number;

    const count = exporter(
      Array.from({ length: 20 }, (_, index) => ({
        monthKey: "2026-09",
        team: "GD",
        assetType: "static-graphic",
        assetSubtype: "Banner",
        priority: "high",
        status: "in_progress",
        effortPoint: 4,
        activeProductionHours: index + 1,
      })),
      [{ team: "GD", assetSubtype: "Banner", priority: "high", status: "in_progress", taskCount: 3, ownerOnLeaveCount: 1, ownerPartialCount: 2 }],
      [
        { monthKey: "2026-09", team: "GD", warningCode: "over_capacity", warningCount: 5 },
        { monthKey: "2026-09", team: "GD", warningCode: "deadline_capacity_gap", warningCount: 2 },
      ],
      { month: "2026-09", team: "GD", assetSubtype: "Banner", priority: "high", status: "in_progress" },
    );

    expect(count).toBe(1);
    expect(downloads[0].headers).toEqual([
      "Period",
      "Team",
      "Skill",
      "Asset subtype",
      "Priority",
      "Status",
      "Sample count",
      "Reliability",
      "P50 active hours",
      "P85 active hours",
      "Historical effort",
      "In Progress",
      "Assigned awaiting acceptance",
      "Review",
      "Blocked",
      "Delivered",
      "Leave context",
      "Legacy over capacity count",
      "Legacy deadline gap count",
    ]);
    expect(downloads[0].rows[0]).toEqual([
      "Sep 2026",
      "GD",
      "static-graphic",
      "Banner",
      "high",
      "in_progress",
      "20",
      "Ready",
      "10.5",
      "17.1",
      "4",
      "3",
      "0",
      "0",
      "0",
      "20",
      "1 leave / 2 partial",
      "5",
      "2",
    ]);
    expect(downloads[0].headers.join(" ").toLowerCase()).not.toMatch(/fastest|slowest|speed|rank|score|productivity/);
  });
});
