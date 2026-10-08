import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

it("hides inactive and stale assignees while keeping active and unassigned work", () => {
  const source = readFileSync(resolve("screens-c.jsx"), "utf8");
  const screen = source.slice(source.indexOf("function TeamGanttScreen("));
  const filter = screen.slice(screen.indexOf("  const activeMemberIds"), screen.indexOf("  const tasks ="));
  const rows = [
    { id: "active", assignee: "gd", status: "assigned" },
    { id: "inactive", assignee: "eye", status: "assigned" },
    { id: "stale", assignee: "old", status: "assigned" },
    { id: "unassigned", status: "assigned" },
    { id: "leave", assignee: "gd", type: "leave", status: "assigned" },
    { id: "cancelled", assignee: "gd", status: "cancelled" },
  ];
  const context = {
    members: [{ id: "gd", active: true }, { id: "eye", active: false }],
    sourceRows: rows,
    isTaskAssignProduct: false,
    TEAM_SCHEDULE_CAPACITY_STATUSES_C: ["assigned"],
    assigneeFilter: "all", statusFilter: "all", skillFilter: "all",
  };
  const evaluate = (overrides = {}) => runInNewContext(`${filter}\nfilteredRows.map(row => row.id)`, { ...context, ...overrides });
  expect(Array.from(evaluate())).toEqual(["active", "unassigned"]);
  expect(Array.from(evaluate({ isTaskAssignProduct: true }))).toEqual(["active", "inactive", "stale", "unassigned"]);
  expect(Array.from(evaluate({ assigneeFilter: "eye" }))).toEqual([]);
  expect(Array.from(evaluate({ members: [{ id: "gd", active: true }, { id: "eye", active: true }] }))).toEqual(["active", "inactive", "unassigned"]);
});
