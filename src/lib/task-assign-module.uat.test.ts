import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(__dirname, "..", "..");
const readRepo = (path: string) => readFileSync(join(repoRoot, path), "utf8");

describe("Task Assign module separation", () => {
  it("registers Task Assign as the first product and keeps FlowMate second", () => {
    const app = readRepo("app.jsx");

    expect(app).toContain('const TASK_ASSIGN_PRODUCT_KEY = "task-assign"');
    expect(app).toContain("TASK_ASSIGN_PRODUCT_KEY");
    expect(app).toContain("const TASK_ASSIGN_HASH_KEYS");
    expect(app.indexOf('onClick: onChooseTaskAssign')).toBeLessThan(app.indexOf('onClick: onChooseFlowMate'));
  });

  it("defines isolated Task Assign navigation and routes", () => {
    const app = readRepo("app.jsx");

    expect(app).toContain("const TASK_ASSIGN_NAV");
    ["task-assign-create", "task-assign-board", "task-assign-list", "task-assign-calendar", "task-assign-schedule", "task-assign-attention", "task-assign-detail"].forEach(route => {
      expect(app).toContain(`"${route}"`);
    });
  });

  it("does not expose a Quick Task creator in FlowMate's Create menu", () => {
    const app = readRepo("app.jsx");
    const createScreen = readRepo("screens-a.jsx");

    expect(app).toContain("task-assign-create");
    expect(createScreen).toContain("product === \"task-assign\"");
    expect(createScreen).toContain("Quick Task");
  });

  it("keeps requester function out of the Quick Task browser RPC payload", () => {
    const quickTaskClient = readRepo("supabase-quick-task.js");

    const createCall = quickTaskClient.slice(
      quickTaskClient.indexOf('rpc("create_quick_task"'),
      quickTaskClient.indexOf("if (error) throw error;"),
    );
    expect(createCall).not.toContain("p_requester_team");
  });

  it("uses a server-derived Function and keeps cross-function Task Assign actions read-only", () => {
    const taskAssignSql = readRepo("supabase/task_assign_module.sql");
    const board = readRepo("screens-b.jsx");

    expect(taskAssignSql).toContain("task_assign_function_for_user");
    expect(taskAssignSql).toContain("wi.owning_team_code = public.task_assign_function_for_user()");
    expect(taskAssignSql).toContain("drop function if exists public.create_quick_task(");
    expect(board).toContain('window.FLOWMATE_ACTIVE_PRODUCT === "task-assign" && row.type === "quick"');
    expect(board).toContain("row.owningTeamKey === ownFunction");
  });

  it("keeps Creative Requests out of Task Assign Delivered history", () => {
    const listData = readRepo("supabase-list-data.js");

    expect(listData).toContain("async function loadTaskAssignDeliveredHistory");
    expect(listData).toContain('.eq("work_type", "quick_task")');
    expect(listData).toContain('window.FLOWMATE_ACTIVE_PRODUCT === "task-assign"');
  });

  it("uses the FlowMate timeline presentation for Task Assign Team Schedule", () => {
    const app = readRepo("app.jsx");
    const schedule = readRepo("screens-c.jsx");

    expect(app).toContain("React.createElement(TeamGanttScreen");
    expect(app).toContain('product: isTaskAssignProduct ? "task-assign" : "flowmate"');
    expect(schedule).toContain('function TeamGanttScreen({ onOpen, product = "flowmate" })');
    expect(schedule).toContain("Quick Task delivery timeline: 1st Review / Draft to Launch Date / Deadline");
  });

  it("refreshes Board when switching between Task Assign and FlowMate", () => {
    const app = readRepo("app.jsx");
    const listData = readRepo("supabase-list-data.js");

    expect(app).toContain('key: `board-${activeProduct || "flowmate"}`');
    expect(listData).toContain('const product = window.FLOWMATE_ACTIVE_PRODUCT === "task-assign" ? "task-assign" : "flowmate"');
  });

  it("refreshes Attention Needed counts when switching between Task Assign and FlowMate", () => {
    const app = readRepo("app.jsx");
    const navCountsEffect = app.slice(
      app.indexOf("async function refreshNavCounts"),
      app.indexOf("useEffectApp(() => {", app.indexOf("async function refreshNavCounts") + 1),
    );

    expect(navCountsEffect).toContain("activeProduct");
    expect(navCountsEffect).toContain("loadFlowMateNavigationRows");
  });

  it("uses the same no-link approval transition for Board Delivered", () => {
    const board = readRepo("screens-b.jsx");
    const completeWork = board.slice(board.indexOf("async function completeWork"), board.indexOf("function handleDragStart"));

    expect(completeWork).toContain('window.transitionFlowMateWorkStatus(row.id, "delivered", { currentStatus: row.status })');
    expect(completeWork).not.toContain('title: "Mark Delivered"');
    expect(board).toContain('"Approve delivered"');
  });

  it("keeps Task Assign available in every product switcher", () => {
    const app = readRepo("app.jsx");
    const ot = readRepo("screens-ot.jsx");

    expect(app.match(/onSwitchTaskAssign: chooseTaskAssignProduct/g)?.length).toBe(4);
    expect(app).toContain("function ProductBookShell({");
    expect(app).toContain("function MarketingPlanShell({");
    expect(ot).toContain("function OtRequestShell({");
    expect(ot).toContain("onSwitchTaskAssign={onSwitchTaskAssign}");
  });
});
