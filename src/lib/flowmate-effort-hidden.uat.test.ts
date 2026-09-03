import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const repo = (...parts: string[]) =>
  readFileSync(resolve(process.cwd(), ...parts), "utf8").replace(/\r\n/g, "\n");

function extractNamedFunction(source: string, functionName: string) {
  const start = source.indexOf(`function ${functionName}(`);
  if (start < 0) throw new Error(`Missing ${functionName}`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unclosed ${functionName}`);
}

function loadPureScreenBuilders(names: string[]) {
  const source = repo("screens-c.jsx");
  const declarations = names.map(name => extractNamedFunction(source, name)).join("\n");
  const sandbox: Record<string, unknown> = {};
  vm.runInNewContext(`${declarations}\nthis.builders = { ${names.join(", ")} };`, sandbox);
  return sandbox.builders as Record<string, (...args: any[]) => any>;
}

describe("normal UI hides operational Effort", () => {
  it("keeps every member_workload_v installer compatible with the frontend count contract", () => {
    const requiredFragments = [
      "as assigned_count",
      "as in_progress_count",
      "as review_count",
      "as blocked_count",
    ];

    for (const sqlPath of ["supabase/schema.sql", "supabase/rpc_assignment.sql"]) {
      const sql = repo(sqlPath);
      const viewStart = sql.indexOf("create or replace view public.member_workload_v");
      const viewEnd = sql.indexOf("revoke all privileges on public.member_workload_v", viewStart);
      const view = sql.slice(viewStart, viewEnd);
      expect(viewStart, sqlPath).toBeGreaterThanOrEqual(0);
      expect(viewEnd, sqlPath).toBeGreaterThan(viewStart);
      for (const fragment of requiredFragments) expect(view, sqlPath).toContain(fragment);
    }
  });

  it("removes Effort and legacy capacity flags from working surfaces and CSV", () => {
    for (const file of ["screens-a.jsx", "screens-b.jsx", "screens-c.jsx"]) {
      const source = repo(file);
      expect(source).not.toMatch(/>Effort<|Assigned effort|Delivered effort|capacity \(pt\)|effort points/i);
    }
    const list = repo("supabase-list-data.js");
    expect(list).toContain("FLOWMATE_HIDDEN_OPERATIONAL_WARNING_CODES");
    expect(list).toContain('"over_capacity"');
    expect(list).toContain('"deadline_capacity_gap"');
  });

  it("uses state counts and dates for workload and schedule without retired capacity copy", () => {
    const create = repo("screens-a.jsx");
    const workload = repo("screens-c.jsx");

    expect(create).not.toContain("No effort calculation, no auto-assignment");
    expect(create).not.toContain("Counted separately from creative capacity");
    expect(create).not.toContain("Brief validation, auto effort point, auto routing");
    expect(create).not.toContain("The engine sets effort and owner based on skill, capacity, WIP, and fairness rules.");

    for (const label of [
      "In Progress",
      "Assigned awaiting acceptance",
      "Review",
      "Blocked",
      "Due soon",
      "Overdue",
    ]) {
      expect(workload).toContain(label);
    }
    expect(workload).toContain("Launch Date / Deadline");
    expect(workload).not.toContain("Production timing and weekly capacity for GD/VE");
    expect(workload).not.toContain('data-testid="flowmate-team-schedule-workload"');
    expect(workload).not.toContain('data-testid="flowmate-team-schedule-capacity-cell"');
    expect(workload).not.toContain('data-testid="flowmate-team-schedule-workload-inspector"');
    expect(workload).not.toContain("% allocated");
    expect(workload).not.toContain("Select a week to see every contributing task and point allocation.");
    expect(workload).not.toContain("No allocated tasks in this week.");
  });

  it("keeps normal KPI reporting at team-level state and date counts", () => {
    const screens = repo("screens-c.jsx");
    const kpi = screens.slice(
      screens.indexOf("function KpiScreen"),
      screens.indexOf("/* ============================================================\n   TEAM CALENDAR"),
    );

    for (const label of [
      "Assigned awaiting acceptance",
      "In Progress",
      "Review",
      "Blocked",
      "Due soon",
      "Overdue",
      "Delivered",
      "Cancelled",
    ]) {
      expect(kpi).toContain(label);
    }
    expect(kpi).toContain('name: "Team status"');

    for (const retiredPersonalMetric of [
      "deliveredEffort",
      "ownerMap",
      "ownerRows",
      "avgCompletionDays",
      "Per member",
      "Avg days to delivered",
      "Completion detail",
      "flowMateKpiGdVeAiSheets",
      "row.effort",
    ]) {
      expect(kpi).not.toContain(retiredPersonalMetric);
    }
  });

  it("classifies KPI due dates and builds team-only state/date exports from fixtures", () => {
    const { buildFlowMateKpiTeamSummaryC, buildFlowMateKpiExportC } = loadPureScreenBuilders([
      "flowMateDateKeyC",
      "flowMateDueDateSignalC",
      "buildFlowMateKpiTeamSummaryC",
      "buildFlowMateKpiExportC",
    ]);
    const rows = [
      { id: "A-1", requesterTeam: "Alpha", status: "assigned", dueDate: "2026-09-03" },
      { id: "A-2", requesterTeam: "Alpha", status: "in_progress", dueDate: "2026-09-05" },
      { id: "A-3", requesterTeam: "Alpha", status: "review", dueDate: "2026-09-06" },
      { id: "A-4", requesterTeam: "Alpha", status: "blocked", dueDate: "2026-09-02" },
      { id: "A-5", requesterTeam: "Alpha", status: "delivered", dueDate: "2026-09-01" },
      { id: "B-1", requesterTeam: "Beta", status: "cancelled", dueDate: "2026-09-01" },
      { id: "B-2", requesterTeam: "Beta", status: "done", dueDate: "2026-09-01" },
      { id: "B-3", requesterTeam: "Beta", status: "unassigned", assignmentResult: "unassigned", dueDate: "2026-09-04" },
      { id: "B-4", requesterTeam: "Beta", status: "queued", dueDate: "2026-09-03" },
    ];

    const summary = buildFlowMateKpiTeamSummaryC(rows, "2026-09-03");
    expect(summary.totals).toEqual({
      active: 5,
      assigned: 1,
      inProgress: 1,
      review: 1,
      blocked: 1,
      dueSoon: 3,
      overdue: 1,
      delivered: 2,
      cancelled: 1,
      unassigned: 1,
    });
    expect(summary.teams).toEqual([
      { team: "Alpha", total: 5, assigned: 1, inProgress: 1, review: 1, blocked: 1, dueSoon: 2, overdue: 1, delivered: 1, cancelled: 0, unassigned: 0 },
      { team: "Beta", total: 4, assigned: 0, inProgress: 0, review: 0, blocked: 0, dueSoon: 1, overdue: 0, delivered: 1, cancelled: 1, unassigned: 1 },
    ]);

    const exported = buildFlowMateKpiExportC(summary, "Sep 2026");
    expect(exported.summaryRows).toContainEqual(["Due soon", 3]);
    expect(exported.summaryRows).toContainEqual(["Overdue", 1]);
    expect(exported.teamStatusRows).toHaveLength(3);
    expect(exported.teamStatusRows[1]).toEqual(["Alpha", 5, 1, 1, 1, 1, 2, 1, 1, 0, 0]);
    expect(exported.csvRows).toEqual(summary.teams);
    expect(exported.csvColumns.map((column: { label: string }) => column.label)).toEqual([
      "Requester team", "All tasks", "Assigned awaiting acceptance", "In Progress", "Review", "Blocked", "Due soon", "Overdue", "Delivered", "Cancelled", "Unassigned",
    ]);
  });

  it("loads and summarizes normal Workload without Effort or capacity coupling", () => {
    const workloadLoader = repo("supabase-workload-data.js");
    const screens = repo("screens-c.jsx");
    const workload = screens.slice(
      screens.indexOf("function WorkloadScreen"),
      screens.indexOf("/* ============================================================\n   KPI VIEW"),
    );

    expect(workloadLoader).not.toContain("effective_capacity_per_day");
    expect(workloadLoader).not.toContain("assigned_effort");
    for (const retiredCapacityField of [
      "assignedEffort",
      "capacityWindow",
      "effectiveCap",
      "totals.available",
      "wipFull",
      "WIP full",
      "No override",
    ]) {
      expect(workload).not.toContain(retiredCapacityField);
    }
    expect(workload).not.toMatch(/\bavailable:\s*(?:Math|totals|capacity)/);
    expect(workload).toContain("statusCounts");
    expect(workload).toContain("due_soon");
    expect(workload).toContain("overdue");
    expect(workload).toContain("On leave");
  });

  it("builds Workload fixture output from state, due date, and leave without capacity fields", () => {
    const { buildFlowMateWorkloadMemberSummaryC } = loadPureScreenBuilders([
      "flowMateDateKeyC",
      "flowMateDueDateSignalC",
      "flowMateWorkloadStatusCountsC",
      "buildFlowMateWorkloadMemberSummaryC",
    ]);
    const row = {
      m: {
        id: "member-a",
        name: "Member A",
        discipline: "GD/VE",
        skills: ["static"],
        availability: "partial",
        leaveFractionToday: 0.5,
        capacityPerDay: 8,
        capacityOverride: 4,
        wipLimit: 3,
      },
    };
    const items = [
      { id: "CR-1", type: "creative", status: "assigned", dueDate: "2026-09-03", effort: 8 },
      { id: "CR-2", type: "creative", status: "in_progress", dueDate: "2026-09-05", effort: 5 },
      { id: "CR-3", type: "creative", status: "review", dueDate: "2026-09-06", effort: 3 },
      { id: "CR-4", type: "creative", status: "blocked", dueDate: "2026-09-02", effort: 2 },
      { id: "CR-5", type: "creative", status: "delivered", dueDate: "2026-09-01", effort: 1 },
    ];
    const output = buildFlowMateWorkloadMemberSummaryC(row, items, [{ id: "QT-1", priority: "urgent" }], "2026-09-03");

    expect(output.m).toEqual({
      id: "member-a",
      name: "Member A",
      discipline: "GD/VE",
      skills: ["static"],
      availability: "partial",
      leaveFractionToday: 0.5,
    });
    expect(output.statusCounts).toEqual({ assigned: 1, in_progress: 1, review: 1, blocked: 1, delivered: 1 });
    expect(output.due_soon).toBe(2);
    expect(output.overdue).toBe(1);
    expect(output.items.map((item: { id: string }) => item.id)).toEqual(["CR-1", "CR-2", "CR-3", "CR-4"]);
    expect(output.urgentRequested).toBe(1);
    expect(JSON.stringify(output)).not.toMatch(/effort|capacity|effectiveCap|assignedEffort|available|wip/i);
  });
});
