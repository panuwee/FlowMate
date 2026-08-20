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
});
